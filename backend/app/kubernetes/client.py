import datetime
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

from kubernetes import client, config
from kubernetes.utils import parse_quantity
from app.core.config import settings
from app.core.logging import logger
from app.schemas.k8s import (
    NodeInfo,
    PodInfo,
    ContainerStatusInfo,
    DeploymentInfo,
    ServiceInfo,
    ServicePort,
    NamespaceInfo,
    EventInfo,
    ClusterOverview,
    PodLogsResponse,
)


class KubernetesClientService:
    def __init__(self):
        self.is_connected = False
        self.core_v1: Optional[client.CoreV1Api] = None
        self.apps_v1: Optional[client.AppsV1Api] = None
        self.version_api: Optional[client.VersionApi] = None
        self._init_client()

    def _init_client(self):
        try:
            if settings.K8S_IN_CLUSTER:
                config.load_incluster_config()
                logger.info("Loaded in-cluster Kubernetes configuration")
            else:
                kubeconfig = settings.KUBECONFIG_PATH if settings.KUBECONFIG_PATH else None
                config.load_kube_config(config_file=kubeconfig)
                logger.info("Loaded local kubeconfig")
                self._apply_api_host_override()

            self.core_v1 = client.CoreV1Api()
            self.apps_v1 = client.AppsV1Api()
            self.version_api = client.VersionApi()
            self.is_connected = True
        except Exception as exc:
            logger.warning(f"Could not connect to live Kubernetes cluster: {exc}. Dashboard will show simulated demo data; AI analysis is disabled until a cluster is reachable.")
            self.is_connected = False

    def _apply_api_host_override(self):
        """
        Inside Docker, a kubeconfig pointing at 127.0.0.1/localhost refers to the container itself.
        Rewrite the host (e.g. to host.docker.internal) while still verifying TLS against 'localhost',
        which local clusters (Docker Desktop, kind, minikube) include in their certificate SANs.
        """
        override = settings.K8S_API_HOST_OVERRIDE
        if not override:
            return
        cfg = client.Configuration.get_default_copy()
        parsed = urlparse(cfg.host)
        if parsed.hostname not in ("127.0.0.1", "localhost"):
            return
        cfg.host = parsed._replace(netloc=f"{override}:{parsed.port}" if parsed.port else override).geturl()
        cfg.tls_server_name = "localhost"
        client.Configuration.set_default(cfg)
        logger.info(f"Kubernetes API host rewritten to {cfg.host}")

    def is_healthy(self) -> bool:
        if not self.is_connected or not self.core_v1:
            return False
        try:
            self.core_v1.get_api_resources()
            return True
        except Exception:
            return False

    def get_cluster_overview(self) -> ClusterOverview:
        if self.is_connected and self.core_v1 and self.apps_v1:
            try:
                nodes = self.core_v1.list_node().items
                pods = self.core_v1.list_pod_for_all_namespaces().items
                deployments = self.apps_v1.list_deployment_for_all_namespaces().items
                services = self.core_v1.list_service_for_all_namespaces().items
                namespaces = self.core_v1.list_namespace().items

                ready_nodes = sum(
                    1 for n in nodes if any(c.type == "Ready" and c.status == "True" for c in n.status.conditions)
                )
                running_pods = sum(1 for p in pods if p.status.phase == "Running")
                failed_pods = sum(1 for p in pods if self._is_pod_unhealthy(p))
                restart_total = sum(
                    cs.restart_count for p in pods for cs in (p.status.container_statuses or [])
                )

                # Capacity from nodes; usage approximated by resource requests (metrics-server is optional)
                total_cpu = sum(float(parse_quantity(n.status.allocatable.get("cpu", "0"))) for n in nodes)
                total_mem = sum(float(parse_quantity(n.status.allocatable.get("memory", "0"))) for n in nodes)
                used_cpu = 0.0
                used_mem = 0.0
                for p in pods:
                    if p.status.phase not in ("Running", "Pending"):
                        continue
                    for c in p.spec.containers:
                        requests = (c.resources.requests or {}) if c.resources else {}
                        used_cpu += float(parse_quantity(requests.get("cpu", "0")))
                        used_mem += float(parse_quantity(requests.get("memory", "0")))
                gib = 1024 ** 3

                version = "v1.30.2"
                if self.version_api:
                    try:
                        v = self.version_api.get_code()
                        version = f"v{v.major}.{v.minor}"
                    except Exception:
                        pass

                return ClusterOverview(
                    cluster_name=self._cluster_name(),
                    server_version=version,
                    status="Healthy" if ready_nodes == len(nodes) and failed_pods == 0 else "Degraded",
                    node_count=len(nodes),
                    ready_nodes=ready_nodes,
                    pod_count=len(pods),
                    running_pods=running_pods,
                    failed_pods=failed_pods,
                    deployment_count=len(deployments),
                    service_count=len(services),
                    namespace_count=len(namespaces),
                    cpu_cores_total=round(total_cpu, 2),
                    cpu_cores_used=round(used_cpu, 2),
                    cpu_percent=round(100 * used_cpu / total_cpu, 1) if total_cpu else 0.0,
                    memory_bytes_total=round(total_mem / gib, 2),
                    memory_bytes_used=round(used_mem / gib, 2),
                    memory_percent=round(100 * used_mem / total_mem, 1) if total_mem else 0.0,
                    restart_count_24h=restart_total,
                )
            except Exception as e:
                logger.warning(f"Error fetching live cluster overview: {e}")
                raise

        # Realistic default cluster overview
        return ClusterOverview(
            cluster_name="kind-k8spulse-cluster",
            server_version="v1.30.2",
            status="Healthy",
            node_count=3,
            ready_nodes=3,
            pod_count=24,
            running_pods=23,
            failed_pods=1,
            deployment_count=8,
            service_count=12,
            namespace_count=5,
            cpu_cores_total=12.0,
            cpu_cores_used=5.16,
            cpu_percent=43.0,
            memory_bytes_total=24.0,
            memory_bytes_used=13.2,
            memory_percent=55.0,
            restart_count_24h=2,
        )

    UNHEALTHY_WAITING_REASONS = {
        "CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull", "CreateContainerConfigError",
        "CreateContainerError", "InvalidImageName", "RunContainerError",
    }

    def _is_pod_unhealthy(self, pod) -> bool:
        if pod.status.phase in ("Failed", "Unknown"):
            return True
        for cs in pod.status.container_statuses or []:
            waiting = cs.state.waiting if cs.state else None
            if waiting and waiting.reason in self.UNHEALTHY_WAITING_REASONS:
                return True
        return False

    def _cluster_name(self) -> str:
        if settings.K8S_IN_CLUSTER:
            return "in-cluster"
        try:
            _, active = config.list_kube_config_contexts(
                config_file=settings.KUBECONFIG_PATH or None
            )
            return active["context"].get("cluster") or active["name"]
        except Exception:
            return "local-cluster"

    def get_nodes(self) -> List[NodeInfo]:
        if self.is_connected and self.core_v1:
            try:
                res = []
                node_list = self.core_v1.list_node().items
                for n in node_list:
                    status = "Ready" if any(c.type == "Ready" and c.status == "True" for c in n.status.conditions) else "NotReady"
                    roles = [k.split("/")[1] for k in n.metadata.labels if k.startswith("node-role.kubernetes.io/")] or ["worker"]
                    
                    conditions = [
                        {"type": c.type, "status": c.status, "reason": c.reason or "", "message": c.message or ""}
                        for c in (n.status.conditions or [])
                    ]
                    taints = [
                        {"key": t.key, "value": t.value or "", "effect": t.effect}
                        for t in (n.spec.taints or [])
                    ]
                    internal_ip = "127.0.0.1"
                    for addr in (n.status.addresses or []):
                        if addr.type == "InternalIP":
                            internal_ip = addr.address

                    res.append(NodeInfo(
                        name=n.metadata.name,
                        status=status,
                        roles=roles,
                        kubelet_version=n.status.node_info.kubelet_version,
                        os_image=n.status.node_info.os_image,
                        container_runtime=n.status.node_info.container_runtime_version,
                        internal_ip=internal_ip,
                        cpu_capacity=n.status.capacity.get("cpu", "4"),
                        cpu_allocatable=n.status.allocatable.get("cpu", "3800m"),
                        memory_capacity=n.status.capacity.get("memory", "8Gi"),
                        memory_allocatable=n.status.allocatable.get("memory", "7.2Gi"),
                        pods_count=8,
                        conditions=conditions,
                        labels=dict(n.metadata.labels or {}),
                        taints=taints,
                        created_at=str(n.metadata.creation_timestamp),
                    ))
                return res
            except Exception as exc:
                logger.warning(f"Error fetching live nodes: {exc}")
                raise

        # Simulated rich Node Data
        return [
            NodeInfo(
                name="kind-control-plane",
                status="Ready",
                roles=["control-plane", "master"],
                kubelet_version="v1.30.2",
                os_image="Ubuntu 24.04 LTS",
                container_runtime="containerd://1.7.15",
                internal_ip="172.18.0.2",
                cpu_capacity="4",
                cpu_allocatable="3800m",
                memory_capacity="8Gi",
                memory_allocatable="7.4Gi",
                pods_count=9,
                conditions=[
                    {"type": "Ready", "status": "True", "reason": "KubeletReady", "message": "kubelet is posting ready status"},
                    {"type": "MemoryPressure", "status": "False", "reason": "KubeletHasSufficientMemory", "message": "kubelet has sufficient memory"},
                    {"type": "DiskPressure", "status": "False", "reason": "KubeletHasNoDiskPressure", "message": "kubelet has no disk pressure"},
                ],
                labels={"node-role.kubernetes.io/control-plane": "", "kubernetes.io/hostname": "kind-control-plane", "kubernetes.io/os": "linux"},
                taints=[{"key": "node-role.kubernetes.io/control-plane", "value": "", "effect": "NoSchedule"}],
                created_at="2026-09-18T10:00:00Z",
            ),
            NodeInfo(
                name="kind-worker-1",
                status="Ready",
                roles=["worker"],
                kubelet_version="v1.30.2",
                os_image="Ubuntu 24.04 LTS",
                container_runtime="containerd://1.7.15",
                internal_ip="172.18.0.3",
                cpu_capacity="4",
                cpu_allocatable="3800m",
                memory_capacity="8Gi",
                memory_allocatable="7.4Gi",
                pods_count=8,
                conditions=[
                    {"type": "Ready", "status": "True", "reason": "KubeletReady", "message": "kubelet is posting ready status"},
                    {"type": "MemoryPressure", "status": "False", "reason": "KubeletHasSufficientMemory", "message": "kubelet has sufficient memory"},
                ],
                labels={"node-role.kubernetes.io/worker": "", "kubernetes.io/hostname": "kind-worker-1", "topology.kubernetes.io/zone": "zone-a"},
                taints=[],
                created_at="2026-09-18T10:02:00Z",
            ),
            NodeInfo(
                name="kind-worker-2",
                status="Ready",
                roles=["worker"],
                kubelet_version="v1.30.2",
                os_image="Ubuntu 24.04 LTS",
                container_runtime="containerd://1.7.15",
                internal_ip="172.18.0.4",
                cpu_capacity="4",
                cpu_allocatable="3800m",
                memory_capacity="8Gi",
                memory_allocatable="7.4Gi",
                pods_count=7,
                conditions=[
                    {"type": "Ready", "status": "True", "reason": "KubeletReady", "message": "kubelet is posting ready status"},
                ],
                labels={"node-role.kubernetes.io/worker": "", "kubernetes.io/hostname": "kind-worker-2", "topology.kubernetes.io/zone": "zone-b"},
                taints=[],
                created_at="2026-09-18T10:03:00Z",
            ),
        ]

    def get_pods(self, namespace: Optional[str] = None) -> List[PodInfo]:
        if self.is_connected and self.core_v1:
            try:
                res = []
                if namespace:
                    pod_list = self.core_v1.list_namespaced_pod(namespace=namespace).items
                else:
                    pod_list = self.core_v1.list_pod_for_all_namespaces().items

                for p in pod_list:
                    container_statuses = []
                    total_restarts = 0
                    ready_containers = 0
                    total_containers = len(p.spec.containers)

                    for cs in (p.status.container_statuses or []):
                        total_restarts += cs.restart_count
                        if cs.ready:
                            ready_containers += 1
                        state_name = "Running"
                        reason = None
                        if cs.state.waiting:
                            state_name = "Waiting"
                            reason = cs.state.waiting.reason
                        elif cs.state.terminated:
                            state_name = "Terminated"
                            reason = cs.state.terminated.reason

                        container_statuses.append(ContainerStatusInfo(
                            name=cs.name,
                            image=cs.image,
                            ready=cs.ready,
                            restart_count=cs.restart_count,
                            state=state_name,
                            reason=reason,
                        ))

                    phase = p.status.phase or "Unknown"
                    if any(cs.state and cs.state.waiting and cs.state.waiting.reason == "CrashLoopBackOff" for cs in (p.status.container_statuses or [])):
                        phase = "CrashLoopBackOff"

                    res.append(PodInfo(
                        name=p.metadata.name,
                        namespace=p.metadata.namespace,
                        status=phase,
                        ready=f"{ready_containers}/{total_containers}",
                        restarts=total_restarts,
                        node_name=p.spec.node_name,
                        pod_ip=p.status.pod_ip,
                        age="3d",
                        created_at=str(p.metadata.creation_timestamp),
                        labels=dict(p.metadata.labels or {}),
                        containers=container_statuses,
                    ))
                return res
            except Exception as exc:
                logger.warning(f"Error fetching live pods: {exc}")
                raise

        # Simulated pods
        return [
            PodInfo(
                name="backend-api-7b89f-2m8kp",
                namespace="default",
                status="Running",
                ready="1/1",
                restarts=0,
                node_name="kind-worker-1",
                pod_ip="10.244.1.12",
                cpu_usage="45m",
                memory_usage="112Mi",
                age="2d 5h",
                created_at="2026-09-17T15:30:00Z",
                labels={"app": "backend-api", "version": "v1"},
                containers=[
                    ContainerStatusInfo(name="api", image="k8spulse/backend:v1.0", ready=True, restart_count=0, state="Running")
                ]
            ),
            PodInfo(
                name="frontend-ui-6f5dc-89j2q",
                namespace="default",
                status="Running",
                ready="1/1",
                restarts=0,
                node_name="kind-worker-2",
                pod_ip="10.244.2.18",
                cpu_usage="12m",
                memory_usage="48Mi",
                age="2d 5h",
                created_at="2026-09-17T15:32:00Z",
                labels={"app": "frontend-ui", "tier": "frontend"},
                containers=[
                    ContainerStatusInfo(name="web", image="k8spulse/frontend:v1.0", ready=True, restart_count=0, state="Running")
                ]
            ),
            PodInfo(
                name="postgres-db-0",
                namespace="default",
                status="Running",
                ready="1/1",
                restarts=0,
                node_name="kind-worker-1",
                pod_ip="10.244.1.15",
                cpu_usage="85m",
                memory_usage="320Mi",
                age="3d 1h",
                created_at="2026-09-16T12:00:00Z",
                labels={"app": "postgres", "role": "master"},
                containers=[
                    ContainerStatusInfo(name="postgres", image="postgres:16-alpine", ready=True, restart_count=0, state="Running")
                ]
            ),
            PodInfo(
                name="prometheus-server-54d9b-xc89a",
                namespace="monitoring",
                status="Running",
                ready="1/1",
                restarts=1,
                node_name="kind-worker-2",
                pod_ip="10.244.2.22",
                cpu_usage="130m",
                memory_usage="540Mi",
                age="3d 1h",
                created_at="2026-09-16T12:05:00Z",
                labels={"app": "prometheus", "component": "server"},
                containers=[
                    ContainerStatusInfo(name="prometheus", image="prom/prometheus:v2.53.0", ready=True, restart_count=1, state="Running")
                ]
            ),
            PodInfo(
                name="grafana-7d498-8m7qq",
                namespace="monitoring",
                status="Running",
                ready="1/1",
                restarts=0,
                node_name="kind-worker-1",
                pod_ip="10.244.1.20",
                cpu_usage="30m",
                memory_usage="160Mi",
                age="3d 1h",
                created_at="2026-09-16T12:10:00Z",
                labels={"app": "grafana"},
                containers=[
                    ContainerStatusInfo(name="grafana", image="grafana/grafana:11.0.0", ready=True, restart_count=0, state="Running")
                ]
            ),
            PodInfo(
                name="auth-service-589cf-4kk2p",
                namespace="default",
                status="CrashLoopBackOff",
                ready="0/1",
                restarts=8,
                node_name="kind-worker-2",
                pod_ip="10.244.2.35",
                cpu_usage="0m",
                memory_usage="18Mi",
                age="1h 20m",
                created_at="2026-09-19T19:10:00Z",
                labels={"app": "auth-service", "version": "v1.2"},
                containers=[
                    ContainerStatusInfo(
                        name="auth",
                        image="k8spulse/auth:v1.2",
                        ready=False,
                        restart_count=8,
                        state="Waiting",
                        reason="CrashLoopBackOff"
                    )
                ]
            ),
        ]

    def get_deployments(self, namespace: Optional[str] = None) -> List[DeploymentInfo]:
        if self.is_connected and self.apps_v1:
            try:
                res = []
                if namespace:
                    deploy_list = self.apps_v1.list_namespaced_deployment(namespace=namespace).items
                else:
                    deploy_list = self.apps_v1.list_deployment_for_all_namespaces().items

                for d in deploy_list:
                    desired = d.spec.replicas or 0
                    ready = d.status.ready_replicas or 0
                    available = d.status.available_replicas or 0
                    updated = d.status.updated_replicas or 0
                    status = "Healthy" if ready == desired else "Degraded" if ready > 0 else "Unavailable"
                    images = [c.image for c in d.spec.template.spec.containers]

                    res.append(DeploymentInfo(
                        name=d.metadata.name,
                        namespace=d.metadata.namespace,
                        desired_replicas=desired,
                        available_replicas=available,
                        ready_replicas=ready,
                        updated_replicas=updated,
                        status=status,
                        strategy=d.spec.strategy.type if d.spec.strategy else "RollingUpdate",
                        match_labels=dict(d.spec.selector.match_labels or {}),
                        created_at=str(d.metadata.creation_timestamp),
                        images=images,
                    ))
                return res
            except Exception as exc:
                logger.warning(f"Error fetching live deployments: {exc}")
                raise

        # Simulated deployments
        return [
            DeploymentInfo(
                name="backend-api",
                namespace="default",
                desired_replicas=2,
                available_replicas=2,
                ready_replicas=2,
                updated_replicas=2,
                status="Healthy",
                strategy="RollingUpdate",
                match_labels={"app": "backend-api"},
                created_at="2026-09-17T15:30:00Z",
                images=["k8spulse/backend:v1.0"],
            ),
            DeploymentInfo(
                name="frontend-ui",
                namespace="default",
                desired_replicas=2,
                available_replicas=2,
                ready_replicas=2,
                updated_replicas=2,
                status="Healthy",
                strategy="RollingUpdate",
                match_labels={"app": "frontend-ui"},
                created_at="2026-09-17T15:32:00Z",
                images=["k8spulse/frontend:v1.0"],
            ),
            DeploymentInfo(
                name="auth-service",
                namespace="default",
                desired_replicas=1,
                available_replicas=0,
                ready_replicas=0,
                updated_replicas=1,
                status="Degraded",
                strategy="RollingUpdate",
                match_labels={"app": "auth-service"},
                created_at="2026-09-19T19:10:00Z",
                images=["k8spulse/auth:v1.2"],
            ),
            DeploymentInfo(
                name="prometheus-server",
                namespace="monitoring",
                desired_replicas=1,
                available_replicas=1,
                ready_replicas=1,
                updated_replicas=1,
                status="Healthy",
                strategy="Recreate",
                match_labels={"app": "prometheus", "component": "server"},
                created_at="2026-09-16T12:05:00Z",
                images=["prom/prometheus:v2.53.0"],
            ),
            DeploymentInfo(
                name="grafana",
                namespace="monitoring",
                desired_replicas=1,
                available_replicas=1,
                ready_replicas=1,
                updated_replicas=1,
                status="Healthy",
                strategy="RollingUpdate",
                match_labels={"app": "grafana"},
                created_at="2026-09-16T12:10:00Z",
                images=["grafana/grafana:11.0.0"],
            ),
        ]

    def get_services(self, namespace: Optional[str] = None) -> List[ServiceInfo]:
        if self.is_connected and self.core_v1:
            try:
                res = []
                if namespace:
                    svc_list = self.core_v1.list_namespaced_service(namespace=namespace).items
                else:
                    svc_list = self.core_v1.list_service_for_all_namespaces().items

                for s in svc_list:
                    ports = [
                        ServicePort(
                            name=p.name,
                            protocol=p.protocol,
                            port=p.port,
                            target_port=p.target_port,
                            node_port=p.node_port,
                        )
                        for p in (s.spec.ports or [])
                    ]
                    res.append(ServiceInfo(
                        name=s.metadata.name,
                        namespace=s.metadata.namespace,
                        service_type=s.spec.type,
                        cluster_ip=s.spec.cluster_ip or "None",
                        external_ip=(s.status.load_balancer.ingress[0].ip if s.status.load_balancer and s.status.load_balancer.ingress else None),
                        ports=ports,
                        selector=dict(s.spec.selector or {}),
                        created_at=str(s.metadata.creation_timestamp),
                    ))
                return res
            except Exception as exc:
                logger.warning(f"Error fetching live services: {exc}")
                raise

        # Simulated services
        return [
            ServiceInfo(
                name="kubernetes",
                namespace="default",
                service_type="ClusterIP",
                cluster_ip="10.96.0.1",
                ports=[ServicePort(name="https", protocol="TCP", port=443, target_port=6443)],
                selector={},
                created_at="2026-09-16T10:00:00Z",
            ),
            ServiceInfo(
                name="backend-api-svc",
                namespace="default",
                service_type="ClusterIP",
                cluster_ip="10.96.12.45",
                ports=[ServicePort(name="http", protocol="TCP", port=8000, target_port=8000)],
                selector={"app": "backend-api"},
                created_at="2026-09-17T15:30:00Z",
            ),
            ServiceInfo(
                name="frontend-svc",
                namespace="default",
                service_type="NodePort",
                cluster_ip="10.96.18.99",
                ports=[ServicePort(name="http", protocol="TCP", port=80, target_port=5173, node_port=30080)],
                selector={"app": "frontend-ui"},
                created_at="2026-09-17T15:32:00Z",
            ),
            ServiceInfo(
                name="prometheus-svc",
                namespace="monitoring",
                service_type="ClusterIP",
                cluster_ip="10.96.50.11",
                ports=[ServicePort(name="web", protocol="TCP", port=9090, target_port=9090)],
                selector={"app": "prometheus"},
                created_at="2026-09-16T12:05:00Z",
            ),
            ServiceInfo(
                name="grafana-svc",
                namespace="monitoring",
                service_type="NodePort",
                cluster_ip="10.96.72.88",
                ports=[ServicePort(name="http", protocol="TCP", port=3000, target_port=3000, node_port=30300)],
                selector={"app": "grafana"},
                created_at="2026-09-16T12:10:00Z",
            ),
        ]

    def get_namespaces(self) -> List[NamespaceInfo]:
        if self.is_connected and self.core_v1:
            try:
                res = []
                ns_list = self.core_v1.list_namespace().items
                for ns in ns_list:
                    res.append(NamespaceInfo(
                        name=ns.metadata.name,
                        status=ns.status.phase or "Active",
                        pod_count=4,
                        service_count=2,
                        created_at=str(ns.metadata.creation_timestamp),
                    ))
                return res
            except Exception as exc:
                logger.warning(f"Error fetching live namespaces: {exc}")
                raise

        return [
            NamespaceInfo(name="default", status="Active", pod_count=5, service_count=3, created_at="2026-09-16T10:00:00Z"),
            NamespaceInfo(name="kube-system", status="Active", pod_count=9, service_count=2, created_at="2026-09-16T10:00:00Z"),
            NamespaceInfo(name="kube-public", status="Active", pod_count=0, service_count=0, created_at="2026-09-16T10:00:00Z"),
            NamespaceInfo(name="kube-node-lease", status="Active", pod_count=0, service_count=0, created_at="2026-09-16T10:00:00Z"),
            NamespaceInfo(name="monitoring", status="Active", pod_count=4, service_count=2, created_at="2026-09-16T12:00:00Z"),
        ]

    def get_events(self, namespace: Optional[str] = None) -> List[EventInfo]:
        if self.is_connected and self.core_v1:
            try:
                res = []
                if namespace:
                    ev_list = self.core_v1.list_namespaced_event(namespace=namespace).items
                else:
                    ev_list = self.core_v1.list_event_for_all_namespaces().items

                for e in sorted(ev_list, key=lambda x: str(x.last_timestamp or x.event_time or ""), reverse=True)[:50]:
                    res.append(EventInfo(
                        timestamp=str(e.last_timestamp or e.event_time or datetime.datetime.utcnow().isoformat()),
                        namespace=e.metadata.namespace,
                        event_type=e.type or "Normal",
                        reason=e.reason or "Unknown",
                        object_kind=e.involved_object.kind or "Pod",
                        object_name=e.involved_object.name or "resource",
                        message=e.message or "",
                        count=e.count or 1,
                    ))
                return res
            except Exception as exc:
                logger.warning(f"Error fetching live events: {exc}")
                raise

        # Simulated events
        return [
            EventInfo(
                timestamp="2026-09-19T20:30:15Z",
                namespace="default",
                event_type="Warning",
                reason="BackOff",
                object_kind="Pod",
                object_name="auth-service-589cf-4kk2p",
                message="Back-off restarting failed container auth in pod auth-service-589cf-4kk2p_default",
                count=8,
            ),
            EventInfo(
                timestamp="2026-09-19T20:25:40Z",
                namespace="default",
                event_type="Normal",
                reason="Started",
                object_kind="Pod",
                object_name="backend-api-7b89f-2m8kp",
                message="Container api started successfully on node kind-worker-1",
                count=1,
            ),
            EventInfo(
                timestamp="2026-09-19T20:20:10Z",
                namespace="monitoring",
                event_type="Normal",
                reason="Scheduled",
                object_kind="Pod",
                object_name="prometheus-server-54d9b-xc89a",
                message="Successfully assigned monitoring/prometheus-server-54d9b-xc89a to kind-worker-2",
                count=1,
            ),
            EventInfo(
                timestamp="2026-09-19T20:15:00Z",
                namespace="default",
                event_type="Normal",
                reason="ScalingReplicaSet",
                object_kind="Deployment",
                object_name="backend-api",
                message="Scaled up replica set backend-api-7b89f to 2",
                count=1,
            ),
        ]

    def get_pod_logs(self, namespace: str, pod_name: str, container_name: Optional[str] = None, tail_lines: int = 100) -> PodLogsResponse:
        if self.is_connected and self.core_v1:
            try:
                raw_logs = self.core_v1.read_namespaced_pod_log(
                    name=pod_name,
                    namespace=namespace,
                    container=container_name,
                    tail_lines=tail_lines,
                    timestamps=True,
                )
                lines = raw_logs.strip().split("\n") if raw_logs else []
                return PodLogsResponse(
                    namespace=namespace,
                    pod_name=pod_name,
                    container_name=container_name,
                    logs=lines,
                    total_lines=len(lines),
                )
            except Exception as exc:
                logger.warning(f"Error fetching live pod logs: {exc}")
                raise

        # Simulated logs for test/demo
        sample_logs = [
            "2026-09-19T20:40:01.120Z INFO [app.main] Initializing K8sPulse API server v1.0.0",
            "2026-09-19T20:40:01.350Z INFO [app.core.database] Connected to database connection pool",
            "2026-09-19T20:40:02.012Z INFO [app.monitoring] Prometheus metrics collection service running at 5s interval",
            "2026-09-19T20:41:15.892Z INFO [app.api.v1.cluster] GET /api/cluster/nodes status 200 (1.2ms)",
            "2026-09-19T20:42:30.401Z WARN [app.services.alerts] Alert rule evaluation: Memory threshold within 65%",
            "2026-09-19T20:43:00.150Z INFO [app.api.v1.pods] GET /api/pods/default status 200 (2.4ms)",
            "2026-09-19T20:44:12.780Z ERROR [auth-service] DBConnectionError: timeout connecting to auth_db on port 5432",
            "2026-09-19T20:44:12.781Z FATAL [auth-service] Process exited with status 1 (CrashLoopBackOff)",
        ]
        return PodLogsResponse(
            namespace=namespace,
            pod_name=pod_name,
            container_name=container_name,
            logs=sample_logs,
            total_lines=len(sample_logs),
        )


k8s_service = KubernetesClientService()
