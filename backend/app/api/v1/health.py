import asyncio
import time
from typing import Dict, Any

import httpx
from fastapi import APIRouter, status
from sqlalchemy import text

from app.core.config import settings
from app.core.logging import logger
from app.kubernetes.client import k8s_service
from app.models.database import engine

router = APIRouter(prefix="/health", tags=["Health & Diagnostics"])

START_TIME = time.time()


async def _check_kubernetes() -> Dict[str, Any]:
    if not k8s_service.is_connected:
        return {
            "status": "unavailable",
            "message": "No Kubernetes configuration loaded; the dashboard shows simulated demo data.",
            "in_cluster": settings.K8S_IN_CLUSTER,
        }
    healthy = await asyncio.to_thread(k8s_service.is_healthy)
    usage = await asyncio.to_thread(k8s_service.get_usage) if healthy else None
    return {
        "status": "healthy" if healthy else "degraded",
        "message": (
            "Kubernetes API reachable" + ("; metrics-server available" if usage else "; metrics-server not installed")
            if healthy else "Kubernetes API is not responding"
        ),
        "in_cluster": settings.K8S_IN_CLUSTER,
        "metrics_server": bool(usage),
    }


async def _check_prometheus() -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=settings.PROMETHEUS_TIMEOUT) as client:
            resp = await client.get(f"{settings.PROMETHEUS_URL}/-/healthy")
            if resp.status_code == 200:
                return {"status": "healthy", "url": settings.PROMETHEUS_URL,
                        "message": "Prometheus server is reachable and healthy"}
    except Exception as exc:
        logger.debug(f"Prometheus health check failed at {settings.PROMETHEUS_URL}: {exc}")
    return {"status": "unavailable", "url": settings.PROMETHEUS_URL,
            "message": f"Prometheus not reachable at {settings.PROMETHEUS_URL}; metric charts will be empty."}


async def _check_database() -> Dict[str, Any]:
    db_type = "sqlite" if "sqlite" in settings.DATABASE_URL else "postgresql"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "healthy", "type": db_type, "message": "Database connection OK"}
    except Exception as exc:
        return {"status": "unavailable", "type": db_type, "message": f"Database error: {exc}"}


@router.get("", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
async def health_root():
    """
    Overall platform health. Always 200 while the API process is up (used as the liveness probe);
    the subsystem statuses report real connectivity.
    """
    k8s, prom, db = await asyncio.gather(_check_kubernetes(), _check_prometheus(), _check_database())
    subsystems = {"backend": "healthy", "kubernetes": k8s["status"], "prometheus": prom["status"], "database": db["status"]}
    return {
        "status": "healthy" if all(v == "healthy" for v in subsystems.values()) else "degraded",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": int(time.time() - START_TIME),
        "subsystems": subsystems,
    }


@router.get("/kubernetes", response_model=Dict[str, Any])
async def health_kubernetes():
    """Check connectivity to the Kubernetes API server."""
    return await _check_kubernetes()


@router.get("/prometheus", response_model=Dict[str, Any])
async def health_prometheus():
    """Check connectivity to the Prometheus time-series server."""
    return await _check_prometheus()


@router.get("/database", response_model=Dict[str, Any])
async def health_database():
    """Check connectivity to the backend database."""
    return await _check_database()
