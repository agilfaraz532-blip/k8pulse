"""
Alert engine: evaluates the enabled AlertRules against the live cluster on an interval.

A rule fires for a target (cluster, node or pod) once its condition has held for the rule's
duration_seconds; an AlertEvent is opened and later auto-resolved when the condition clears.
"""
import asyncio
import datetime
import time
from typing import Dict, List, Tuple

from sqlalchemy import select

from app.core.config import settings
from app.core.logging import logger
from app.kubernetes.client import KubernetesClientService, k8s_service
from app.models.database import AlertEvent, AlertRule, AsyncSessionLocal

METRIC_TYPES = ("cpu_percent", "memory_percent", "pod_restarts", "crashloop", "node_unready")

DEFAULT_RULES = [
    dict(name="High CPU Utilization", metric_type="cpu_percent", condition="gt",
         threshold=settings.ALERT_CPU_THRESHOLD_PERCENT, severity="critical", duration_seconds=120),
    dict(name="High Memory Utilization", metric_type="memory_percent", condition="gt",
         threshold=settings.ALERT_MEMORY_THRESHOLD_PERCENT, severity="warning", duration_seconds=120),
    dict(name="Pod CrashLoopBackOff", metric_type="crashloop", condition="gt",
         threshold=0.0, severity="critical", duration_seconds=60),
    dict(name="High Pod Restarts", metric_type="pod_restarts", condition="gt",
         threshold=float(settings.ALERT_POD_RESTART_THRESHOLD), severity="warning", duration_seconds=0),
    dict(name="Node Not Ready", metric_type="node_unready", condition="gt",
         threshold=0.0, severity="critical", duration_seconds=60),
]

# Measurement = (target_resource, value, human readable message)
Measurement = Tuple[str, float, str]


def _compare(value: float, condition: str, threshold: float) -> bool:
    if condition == "lt":
        return value < threshold
    if condition == "eq":
        return value == threshold
    return value > threshold


# A pod that crashed this recently is still crash-looping even if it is briefly "Running" between
# back-offs; without this window the alert would resolve and re-open on every restart.
CRASH_LOOP_WINDOW = datetime.timedelta(minutes=10)
_FAILING_STATUSES = {"CrashLoopBackOff", "Error", "OOMKilled"} | KubernetesClientService.UNHEALTHY_WAITING_REASONS


def _is_crash_looping(pod) -> bool:
    if pod.status in _FAILING_STATUSES:
        return True
    now = datetime.datetime.now(datetime.timezone.utc)
    for c in pod.containers:
        if c.reason in KubernetesClientService.UNHEALTHY_WAITING_REASONS:
            return True
        if c.last_termination_at and c.last_exit_code not in (None, 0) and c.restart_count >= 2:
            ended = datetime.datetime.fromisoformat(c.last_termination_at)
            if ended.tzinfo is None:
                ended = ended.replace(tzinfo=datetime.timezone.utc)
            if now - ended < CRASH_LOOP_WINDOW:
                return True
    return False


def collect_measurements() -> Dict[str, List[Measurement]]:
    """Reads the cluster once and returns current values for every supported metric type."""
    overview = k8s_service.get_cluster_overview()
    pods = k8s_service.get_pods()
    nodes = k8s_service.get_nodes()
    source = "usage" if overview.usage_source == "metrics-server" else "requested"

    return {
        "cpu_percent": [(f"cluster:{overview.cluster_name}", overview.cpu_percent,
                         f"Cluster CPU {source} is {overview.cpu_percent}% "
                         f"({overview.cpu_cores_used}/{overview.cpu_cores_total} cores)")],
        "memory_percent": [(f"cluster:{overview.cluster_name}", overview.memory_percent,
                            f"Cluster memory {source} is {overview.memory_percent}% "
                            f"({overview.memory_bytes_used}/{overview.memory_bytes_total} GiB)")],
        "pod_restarts": [(f"pod:{p.namespace}/{p.name}", float(p.restarts),
                          f"Pod {p.namespace}/{p.name} has restarted {p.restarts} times") for p in pods],
        "crashloop": [(f"pod:{p.namespace}/{p.name}",
                       1.0 if _is_crash_looping(p) else 0.0,
                       f"Pod {p.namespace}/{p.name} is failing ({p.status}; "
                       + ", ".join(
                           f"{c.name}: {c.reason or 'restarting'}"
                           + (f", last exit {c.last_termination_reason}" if c.last_termination_reason else "")
                           for c in p.containers if c.reason or c.last_termination_reason
                       ) + ")")
                      for p in pods],
        "node_unready": [(f"node:{n.name}", 0.0 if n.status == "Ready" else 1.0,
                          f"Node {n.name} is {n.status}") for n in nodes],
    }


class AlertEngine:
    def __init__(self):
        self._pending_since: Dict[Tuple[int, str], float] = {}
        self._task: asyncio.Task = None

    async def ensure_default_rules(self) -> None:
        async with AsyncSessionLocal() as db:
            if (await db.execute(select(AlertRule).limit(1))).scalars().first():
                return
            for rule in DEFAULT_RULES:
                db.add(AlertRule(is_enabled=True, **rule))
            await db.commit()
            logger.info(f"Seeded {len(DEFAULT_RULES)} default alert rules")

    async def evaluate_once(self) -> int:
        """Evaluates all enabled rules; returns the number of newly opened alert events."""
        if not k8s_service.is_connected:
            return 0
        measurements = await asyncio.to_thread(collect_measurements)
        now = time.time()
        opened = 0

        async with AsyncSessionLocal() as db:
            rules = (await db.execute(select(AlertRule).where(AlertRule.is_enabled.is_(True)))).scalars().all()
            open_events = (await db.execute(select(AlertEvent).where(AlertEvent.is_resolved.is_(False)))).scalars().all()
            open_by_key = {(e.rule_id, e.target_resource): e for e in open_events}

            for rule in rules:
                firing_targets = set()
                for target, value, message in measurements.get(rule.metric_type, []):
                    key = (rule.id, target)
                    if not _compare(value, rule.condition, rule.threshold):
                        self._pending_since.pop(key, None)
                        continue
                    firing_targets.add(target)
                    since = self._pending_since.setdefault(key, now)
                    if key in open_by_key or now - since < rule.duration_seconds:
                        continue
                    db.add(AlertEvent(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        severity=rule.severity,
                        message=message,
                        target_resource=target,
                        is_resolved=False,
                    ))
                    opened += 1
                    logger.warning(f"ALERT [{rule.severity}] {rule.name}: {message}")

                # Auto-resolve events whose condition has cleared
                for (rule_id, target), event in open_by_key.items():
                    if rule_id == rule.id and target not in firing_targets:
                        event.is_resolved = True
                        event.resolved_at = datetime.datetime.utcnow()
                        logger.info(f"RESOLVED {rule.name}: {target}")

            await db.commit()
        return opened

    async def _run(self) -> None:
        await asyncio.sleep(5)  # let the API finish starting
        while True:
            try:
                await self.evaluate_once()
            except Exception as exc:
                logger.warning(f"Alert evaluation failed: {exc}")
            await asyncio.sleep(settings.ALERT_EVAL_INTERVAL_SECONDS)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None


alert_engine = AlertEngine()
