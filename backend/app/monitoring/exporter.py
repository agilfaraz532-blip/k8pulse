"""
Prometheus exporter for live Kubernetes state.

Prometheus scrapes GET /metrics on the backend; every scrape reads the cluster through the
Kubernetes API (and metrics-server when installed), so the time series stored in Prometheus
are real cluster history rather than synthetic data.
"""
from kubernetes.utils import parse_quantity
from prometheus_client import CollectorRegistry
from prometheus_client.core import CounterMetricFamily, GaugeMetricFamily

from app.core.logging import logger
from app.kubernetes.client import k8s_service


class KubernetesCollector:
    def collect(self):
        up = GaugeMetricFamily("k8spulse_cluster_up", "1 if the Kubernetes API is reachable")
        if not k8s_service.is_connected or not k8s_service.core_v1:
            up.add_metric([], 0)
            yield up
            return

        try:
            nodes = k8s_service.core_v1.list_node().items
            pods = k8s_service.core_v1.list_pod_for_all_namespaces().items
        except Exception as exc:
            logger.warning(f"Metrics exporter could not read cluster: {exc}")
            up.add_metric([], 0)
            yield up
            return
        up.add_metric([], 1)
        yield up

        ready = GaugeMetricFamily("k8spulse_node_ready", "1 if the node reports Ready", labels=["node"])
        cpu_alloc = GaugeMetricFamily("k8spulse_node_cpu_allocatable_cores", "Allocatable CPU cores", labels=["node"])
        mem_alloc = GaugeMetricFamily("k8spulse_node_memory_allocatable_bytes", "Allocatable memory", labels=["node"])
        for n in nodes:
            name = n.metadata.name
            is_ready = any(c.type == "Ready" and c.status == "True" for c in (n.status.conditions or []))
            ready.add_metric([name], 1 if is_ready else 0)
            cpu_alloc.add_metric([name], float(parse_quantity(n.status.allocatable.get("cpu", "0"))))
            mem_alloc.add_metric([name], float(parse_quantity(n.status.allocatable.get("memory", "0"))))
        yield ready
        yield cpu_alloc
        yield mem_alloc

        usage = k8s_service.get_usage()
        if usage:
            cpu_used = GaugeMetricFamily("k8spulse_node_cpu_usage_cores", "CPU cores in use (metrics-server)", labels=["node"])
            mem_used = GaugeMetricFamily("k8spulse_node_memory_usage_bytes", "Memory working set (metrics-server)", labels=["node"])
            for name, (cpu, mem) in usage["nodes"].items():
                cpu_used.add_metric([name], cpu)
                mem_used.add_metric([name], mem)
            yield cpu_used
            yield mem_used

        phases = GaugeMetricFamily("k8spulse_pods", "Pods by phase", labels=["phase"])
        counts = {}
        for p in pods:
            phase = p.status.phase or "Unknown"
            counts[phase] = counts.get(phase, 0) + 1
        for phase, count in counts.items():
            phases.add_metric([phase], count)
        yield phases

        unhealthy = GaugeMetricFamily("k8spulse_pods_unhealthy", "Pods failing or stuck (CrashLoopBackOff, ImagePullBackOff, ...)")
        unhealthy.add_metric([], sum(1 for p in pods if k8s_service._is_pod_unhealthy(p)))
        yield unhealthy

        restarts = CounterMetricFamily(
            "k8spulse_container_restarts", "Container restarts per pod", labels=["namespace", "pod"]
        )
        for p in pods:
            total = sum(cs.restart_count for cs in (p.status.container_statuses or []))
            restarts.add_metric([p.metadata.namespace, p.metadata.name], total)
        yield restarts


registry = CollectorRegistry()
registry.register(KubernetesCollector())
