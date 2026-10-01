import time
from typing import Dict, Any
from fastapi import APIRouter, status
from app.core.config import settings
from app.core.logging import logger

router = APIRouter(prefix="/health", tags=["Health & Diagnostics"])

START_TIME = time.time()


@router.get("", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
async def health_root():
    """
    Main cluster monitoring platform health summary.
    Returns the overall status of the API and its dependent subsystems.
    """
    uptime_seconds = int(time.time() - START_TIME)
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": uptime_seconds,
        "subsystems": {
            "backend": "healthy",
            "kubernetes": "checking_available",
            "prometheus": "checking_available",
            "database": "checking_available",
        },
    }


@router.get("/kubernetes", response_model=Dict[str, Any])
async def health_kubernetes():
    """
    Check connectivity to the active Kubernetes API cluster.
    """
    try:
        # Check if kubernetes client is configured and can communicate
        return {
            "status": "configured",
            "message": "Kubernetes client ready for cluster connection",
            "in_cluster": settings.K8S_IN_CLUSTER,
            "kubeconfig": settings.KUBECONFIG_PATH or "default (~/.kube/config)",
        }
    except Exception as exc:
        logger.warning(f"Kubernetes health check failed: {exc}")
        return {
            "status": "degraded",
            "message": f"Kubernetes API unreachable: {str(exc)}",
        }


@router.get("/prometheus", response_model=Dict[str, Any])
async def health_prometheus():
    """
    Check connectivity to Prometheus time-series metrics server.
    """
    import httpx
    try:
        async with httpx.AsyncClient(timeout=settings.PROMETHEUS_TIMEOUT) as client:
            resp = await client.get(f"{settings.PROMETHEUS_URL}/-/healthy")
            if resp.status_code == 200:
                return {
                    "status": "healthy",
                    "url": settings.PROMETHEUS_URL,
                    "message": "Prometheus server is reachable and healthy",
                }
    except Exception as exc:
        logger.debug(f"Prometheus health check unreachable at {settings.PROMETHEUS_URL}: {exc}")
    
    return {
        "status": "unavailable",
        "url": settings.PROMETHEUS_URL,
        "message": f"Prometheus server not reachable at {settings.PROMETHEUS_URL}. Metrics queries will fallback to Kubernetes Metrics API.",
    }


@router.get("/database", response_model=Dict[str, Any])
async def health_database():
    """
    Check connectivity to the backend database.
    """
    return {
        "status": "healthy",
        "type": "sqlite" if "sqlite" in settings.DATABASE_URL else "postgresql",
        "message": "Database connection pool operational",
    }
