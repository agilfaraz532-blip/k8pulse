import os
from typing import List, Union
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator


class Settings(BaseSettings):
    # Application Info
    PROJECT_NAME: str = "K8sPulse - Kubernetes Monitoring Dashboard"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # API Configuration
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    API_PREFIX: str = "/api"

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            import json
            return json.loads(v)
        return v

    # Security
    SECRET_KEY: str = "dev-insecure-secret-key-32-characters-minimum-for-local-testing"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    # When disabled, every request is treated as the admin user (local development / tests only)
    AUTH_ENABLED: bool = True
    # Bootstrap admin account, created on startup if it does not exist
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin"
    ADMIN_EMAIL: str = "admin@k8spulse.local"

    # Kubernetes
    KUBECONFIG_PATH: str = ""
    K8S_IN_CLUSTER: bool = False
    K8S_REQUEST_TIMEOUT: int = 10
    # Set to host.docker.internal when running in Docker against a cluster on the host's 127.0.0.1
    K8S_API_HOST_OVERRIDE: str = ""
    # Serve built-in sample cluster data when no cluster is reachable (tests / offline UI work only).
    # Off by default so an outage is reported instead of being hidden behind fake data.
    DEMO_DATA: bool = False

    # Prometheus
    PROMETHEUS_URL: str = "http://localhost:9090"
    PROMETHEUS_TIMEOUT: int = 5

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./k8spulse_dev.db"
    DB_ECHO: bool = False

    # AI Integration
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2:latest"
    OLLAMA_TIMEOUT: float = 300.0
    OLLAMA_NUM_PREDICT: int = 512

    # Alert Thresholds
    ALERT_CPU_THRESHOLD_PERCENT: float = 80.0
    ALERT_MEMORY_THRESHOLD_PERCENT: float = 80.0
    ALERT_POD_RESTART_THRESHOLD: int = 5
    # How often the alert engine evaluates rules against the live cluster
    ALERT_EVAL_INTERVAL_SECONDS: int = 30

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "allow"


settings = Settings()
