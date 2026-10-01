import time
import httpx
from typing import Dict, Any, List, Optional
from app.core.config import settings
from app.core.logging import logger
from app.schemas.metrics import ClusterMetricsOverview


class PrometheusMetricsService:
    def __init__(self):
        self.base_url = settings.PROMETHEUS_URL
        self.timeout = settings.PROMETHEUS_TIMEOUT

    @staticmethod
    def _normalize_series_to_values(payload: Dict[str, Any]) -> List[float]:
        values: List[float] = []
        for result in payload.get("data", {}).get("result", []):
            for _, value in result.get("values", []):
                try:
                    values.append(float(value))
                except (TypeError, ValueError):
                    continue
        return values

    async def is_reachable(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(f"{self.base_url}/-/healthy")
                return res.status_code == 200
        except Exception:
            return False

    async def query(self, promql: str) -> Optional[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(f"{self.base_url}/api/v1/query", params={"query": promql})
                if res.status_code == 200:
                    return res.json()
        except Exception as e:
            logger.debug(f"Prometheus query error: {e}")
        return None

    async def query_range(self, promql: str, start: int, end: int, step: str = "30s") -> Optional[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                params = {"query": promql, "start": start, "end": end, "step": step}
                res = await client.get(f"{self.base_url}/api/v1/query_range", params=params)
                if res.status_code == 200:
                    return res.json()
        except Exception as e:
            logger.debug(f"Prometheus query_range error: {e}")
        return None

    # Range shown on the dashboard charts
    WINDOW_SECONDS = 3600
    STEP_SECONDS = 180

    QUERIES = {
        "cpu": "100 * sum(k8spulse_node_cpu_usage_cores) / sum(k8spulse_node_cpu_allocatable_cores)",
        "memory": "100 * sum(k8spulse_node_memory_usage_bytes) / sum(k8spulse_node_memory_allocatable_bytes)",
        # node-exporter on the Docker host / cluster nodes; only physical-style interfaces
        "rx": 'sum(rate(node_network_receive_bytes_total{device=~"eth.*|en.*|wl.*"}[2m])) / 1024',
        "tx": 'sum(rate(node_network_transmit_bytes_total{device=~"eth.*|en.*|wl.*"}[2m])) / 1024',
        "restarts": "sum(increase(k8spulse_container_restarts_total[3m]))",
    }

    @staticmethod
    def _series_by_timestamp(payload: Optional[Dict[str, Any]]) -> Dict[int, float]:
        points: Dict[int, float] = {}
        for result in (payload or {}).get("data", {}).get("result", []):
            for ts, value in result.get("values", []):
                try:
                    points[int(float(ts))] = float(value)
                except (TypeError, ValueError):
                    continue
        return points

    async def get_cluster_metrics(self) -> ClusterMetricsOverview:
        from app.kubernetes.client import k8s_service  # local import avoids a circular import at startup

        end = int(time.time()) // self.STEP_SECONDS * self.STEP_SECONDS
        start = end - self.WINDOW_SECONDS
        step = f"{self.STEP_SECONDS}s"

        series = {}
        for key, promql in self.QUERIES.items():
            series[key] = self._series_by_timestamp(await self.query_range(promql, start=start, end=end, step=step))

        overview = None
        try:
            overview = k8s_service.get_cluster_overview() if k8s_service.is_connected else None
        except Exception as exc:
            logger.warning(f"Could not read cluster totals for metrics: {exc}")

        timestamps = list(range(start + self.STEP_SECONDS, end + 1, self.STEP_SECONDS))

        def values(key: str, digits: int = 1) -> List[Optional[float]]:
            return [round(series[key][t], digits) if t in series[key] else None for t in timestamps]

        has_resource_data = bool(series["cpu"] or series["memory"])
        has_network_data = bool(series["rx"] or series["tx"])
        if not has_resource_data:
            if not await self.is_reachable():
                message = f"Prometheus is not reachable at {self.base_url}."
            elif not (overview and overview.usage_source == "metrics-server"):
                message = "No usage data: install metrics-server in the cluster so Prometheus can record CPU/memory history."
            else:
                message = "Waiting for Prometheus to collect samples (scraped every 15s)."
        elif not has_network_data:
            message = "Network I/O unavailable: node-exporter is not being scraped."
        else:
            message = None

        return ClusterMetricsOverview(
            timestamps=[time.strftime("%H:%M", time.localtime(t)) for t in timestamps],
            cpu_usage_percent=values("cpu"),
            memory_usage_percent=values("memory"),
            network_rx_kbps=values("rx"),
            network_tx_kbps=values("tx"),
            pod_restarts=[int(round(v)) if v is not None else None for v in values("restarts", 3)],
            total_cpu_cores=overview.cpu_cores_total if overview else 0.0,
            used_cpu_cores=overview.cpu_cores_used if overview else 0.0,
            total_memory_gb=overview.memory_bytes_total if overview else 0.0,
            used_memory_gb=overview.memory_bytes_used if overview else 0.0,
            available=has_resource_data,
            network_available=has_network_data,
            message=message,
        )


prometheus_service = PrometheusMetricsService()
