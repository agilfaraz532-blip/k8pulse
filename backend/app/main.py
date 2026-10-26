from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from contextlib import asynccontextmanager
import asyncio
import time

from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core.config import settings
from app.core.logging import logger
from app.models.database import init_db
from app.kubernetes.client import ClusterUnavailableError
from app.monitoring.exporter import registry as metrics_registry

# API Routers
from app.api.v1.health import router as health_router
from app.api.v1.cluster import router as cluster_router
from app.api.v1.metrics import router as metrics_router
from app.api.v1.alerts import router as alerts_router
from app.api.v1.auth import router as auth_router
from app.api.v1.ai import router as ai_router
from app.api.v1.auth import ensure_admin_user, require_user
from app.services.alerting import alert_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing K8sPulse Database and Services...")
    try:
        await init_db()
        await ensure_admin_user()
        await alert_engine.ensure_default_rules()
        logger.info("Database migrations applied.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
    alert_engine.start()
    yield
    await alert_engine.stop()
    logger.info("Shutting down K8sPulse API Server.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Production-grade Kubernetes Monitoring and Operations Management API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_PREFIX}/openapi.json",
    lifespan=lifespan,
)

# Configure CORS
origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # e.g. a dashboard hosted on Vercel (production and preview URLs)
    allow_origin_regex=settings.CORS_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_and_logging(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    response.headers["X-Process-Time-Ms"] = f"{process_time:.2f}"
    
    if not request.url.path.endswith(("/health", "/metrics")):
        logger.info(f"{request.method} {request.url.path} - Status: {response.status_code} ({process_time:.1f}ms)")
    
    return response


@app.exception_handler(ClusterUnavailableError)
async def cluster_unavailable_handler(request: Request, exc: ClusterUnavailableError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception during {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )


# Register API Routers under /api
app.include_router(health_router, prefix=settings.API_PREFIX)
# Data routes require a logged-in user (see AUTH_ENABLED); health, auth and /metrics stay public
protected = [Depends(require_user)]
app.include_router(cluster_router, prefix=settings.API_PREFIX, dependencies=protected)
app.include_router(metrics_router, prefix=settings.API_PREFIX, dependencies=protected)
app.include_router(alerts_router, prefix=settings.API_PREFIX, dependencies=protected)
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(ai_router, prefix=settings.API_PREFIX, dependencies=protected)

# Direct root health probe for Kubernetes liveness/readiness probes
app.include_router(health_router)


@app.get("/metrics", include_in_schema=False)
async def prometheus_metrics(request: Request):
    """Prometheus scrape endpoint with live Kubernetes gauges (see app/monitoring/exporter.py)."""
    # Prometheus scrapes directly. Requests that came through a tunnel or reverse proxy carry
    # X-Forwarded-For; don't publish cluster details to the internet unless explicitly allowed.
    if request.headers.get("x-forwarded-for") and not settings.METRICS_PUBLIC:
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    payload = await asyncio.to_thread(generate_latest, metrics_registry)
    return Response(content=payload, media_type=CONTENT_TYPE_LATEST)


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "docs": "/docs",
        "api_health": f"{settings.API_PREFIX}/health",
        "endpoints": {
            "cluster": f"{settings.API_PREFIX}/cluster/overview",
            "nodes": f"{settings.API_PREFIX}/cluster/nodes",
            "pods": f"{settings.API_PREFIX}/cluster/pods",
            "deployments": f"{settings.API_PREFIX}/cluster/deployments",
            "services": f"{settings.API_PREFIX}/cluster/services",
            "namespaces": f"{settings.API_PREFIX}/cluster/namespaces",
            "events": f"{settings.API_PREFIX}/cluster/events",
            "logs": f"{settings.API_PREFIX}/cluster/logs",
            "metrics": f"{settings.API_PREFIX}/metrics/cluster",
            "alerts": f"{settings.API_PREFIX}/alerts/rules",
            "ai_explain": f"{settings.API_PREFIX}/ai/explain-cluster",
        }
    }
