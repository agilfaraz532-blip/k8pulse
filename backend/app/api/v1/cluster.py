from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException, status
from app.kubernetes.client import k8s_service
from app.schemas.k8s import (
    ClusterOverview,
    NodeInfo,
    PodInfo,
    DeploymentInfo,
    ServiceInfo,
    NamespaceInfo,
    EventInfo,
    PodLogsResponse,
)

router = APIRouter(prefix="/cluster", tags=["Kubernetes Cluster Operations"])


@router.get("/overview", response_model=ClusterOverview)
async def get_overview():
    """Retrieve full cluster operational health summary."""
    return k8s_service.get_cluster_overview()


@router.get("/nodes", response_model=List[NodeInfo])
async def get_nodes():
    """List all nodes with capacity, conditions, labels, and status."""
    return k8s_service.get_nodes()


@router.get("/pods", response_model=List[PodInfo])
async def get_pods(namespace: Optional[str] = Query(None, description="Filter by namespace")):
    """List all pods with container status, restart count, and IP."""
    return k8s_service.get_pods(namespace=namespace)


@router.get("/deployments", response_model=List[DeploymentInfo])
async def get_deployments(namespace: Optional[str] = Query(None, description="Filter by namespace")):
    """List all deployments with replica counts and health."""
    return k8s_service.get_deployments(namespace=namespace)


@router.get("/services", response_model=List[ServiceInfo])
async def get_services(namespace: Optional[str] = Query(None, description="Filter by namespace")):
    """List all services with ports, cluster IPs, and selectors."""
    return k8s_service.get_services(namespace=namespace)


@router.get("/namespaces", response_model=List[NamespaceInfo])
async def get_namespaces():
    """List all cluster namespaces."""
    return k8s_service.get_namespaces()


@router.get("/events", response_model=List[EventInfo])
async def get_events(namespace: Optional[str] = Query(None, description="Filter by namespace")):
    """List recent Kubernetes events and warnings."""
    return k8s_service.get_events(namespace=namespace)


@router.get("/logs", response_model=PodLogsResponse)
async def get_pod_logs(
    namespace: str = Query(..., description="Pod namespace"),
    pod_name: str = Query(..., description="Pod name"),
    container_name: Optional[str] = Query(None, description="Target container name"),
    tail_lines: int = Query(100, ge=1, le=1000, description="Number of lines to tail"),
):
    """Retrieve or stream application logs for a given pod and container."""
    return k8s_service.get_pod_logs(
        namespace=namespace,
        pod_name=pod_name,
        container_name=container_name,
        tail_lines=tail_lines,
    )
