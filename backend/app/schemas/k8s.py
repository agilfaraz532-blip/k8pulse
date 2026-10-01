from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class NodeInfo(BaseModel):
    name: str
    status: str  # Ready, NotReady, Unknown
    roles: List[str]
    kubelet_version: str
    os_image: str
    container_runtime: str
    internal_ip: str
    cpu_capacity: str
    cpu_allocatable: str
    memory_capacity: str
    memory_allocatable: str
    pods_count: int
    conditions: List[Dict[str, str]]
    labels: Dict[str, str] = Field(default_factory=dict)
    taints: List[Dict[str, str]] = Field(default_factory=list)
    created_at: str


class ContainerStatusInfo(BaseModel):
    name: str
    image: str
    ready: bool
    restart_count: int
    state: str  # Running, Waiting, Terminated
    reason: Optional[str] = None
    started_at: Optional[str] = None


class PodInfo(BaseModel):
    name: str
    namespace: str
    status: str  # Running, Pending, Succeeded, Failed, CrashLoopBackOff
    ready: str  # e.g., "1/1"
    restarts: int
    node_name: Optional[str] = None
    pod_ip: Optional[str] = None
    cpu_usage: Optional[str] = None
    memory_usage: Optional[str] = None
    age: str
    created_at: str
    labels: Dict[str, str] = Field(default_factory=dict)
    containers: List[ContainerStatusInfo] = Field(default_factory=list)


class DeploymentInfo(BaseModel):
    name: str
    namespace: str
    desired_replicas: int
    available_replicas: int
    ready_replicas: int
    updated_replicas: int
    status: str  # Healthy, Progressing, Degraded
    strategy: str
    match_labels: Dict[str, str] = Field(default_factory=dict)
    created_at: str
    images: List[str] = Field(default_factory=list)


class ServicePort(BaseModel):
    name: Optional[str] = None
    protocol: str
    port: int
    target_port: Any
    node_port: Optional[int] = None


class ServiceInfo(BaseModel):
    name: str
    namespace: str
    service_type: str  # ClusterIP, NodePort, LoadBalancer, ExternalName
    cluster_ip: str
    external_ip: Optional[str] = None
    ports: List[ServicePort] = Field(default_factory=list)
    selector: Dict[str, str] = Field(default_factory=dict)
    created_at: str


class NamespaceInfo(BaseModel):
    name: str
    status: str  # Active, Terminating
    pod_count: int = 0
    service_count: int = 0
    created_at: str


class EventInfo(BaseModel):
    timestamp: str
    namespace: str
    event_type: str  # Normal, Warning
    reason: str
    object_kind: str
    object_name: str
    message: str
    count: int = 1


class ClusterOverview(BaseModel):
    cluster_name: str
    server_version: str
    status: str  # Healthy, Degraded, Critical
    node_count: int
    ready_nodes: int
    pod_count: int
    running_pods: int
    failed_pods: int
    deployment_count: int
    service_count: int
    namespace_count: int
    cpu_cores_total: float
    cpu_cores_used: float
    cpu_percent: float
    memory_bytes_total: float
    memory_bytes_used: float
    memory_percent: float
    restart_count_24h: int  # total container restarts currently reported by the cluster
    usage_source: str = "requests"  # "metrics-server" (live usage) or "requests" (resource requests)


class PodLogsResponse(BaseModel):
    namespace: str
    pod_name: str
    container_name: Optional[str] = None
    logs: List[str]
    total_lines: int
