from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time

from app.core.config import settings
from app.core.logging import logger
from app.models.database import init_db

# API Routers
from app.api.v1.health import router as health_router
from app.api.v1.cluster import router as cluster_router
from app.api.v1.metrics import router as metrics_router
from app.api.v1.alerts import router as alerts_router
from app.api.v1.auth import router as auth_router
from app.api.v1.ai import router as ai_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing K8sPulse Database and Services...")
    try:
        await init_db()
        logger.info("Database schema initialized successfully.")
    except Exception as e:
        logger.warning(f"Database init warning: {e}")
    yield
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
    
    if not request.url.path.endswith("/health"):
        logger.info(f"{request.method} {request.url.path} - Status: {response.status_code} ({process_time:.1f}ms)")
    
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception during {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )


# Register API Routers under /api
app.include_router(health_router, prefix=settings.API_PREFIX)
app.include_router(cluster_router, prefix=settings.API_PREFIX)
app.include_router(metrics_router, prefix=settings.API_PREFIX)
app.include_router(alerts_router, prefix=settings.API_PREFIX)
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(ai_router, prefix=settings.API_PREFIX)

# Direct root health probe for Kubernetes liveness/readiness probes
app.include_router(health_router)


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
