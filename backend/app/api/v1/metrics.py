from fastapi import APIRouter
from app.monitoring.prometheus import prometheus_service
from app.schemas.metrics import ClusterMetricsOverview

router = APIRouter(prefix="/metrics", tags=["Prometheus Telemetry & Metrics"])


@router.get("/cluster", response_model=ClusterMetricsOverview)
async def get_cluster_metrics():
    """Retrieve time-series cluster CPU, Memory, Network, and Restart metrics."""
    return await prometheus_service.get_cluster_metrics()
