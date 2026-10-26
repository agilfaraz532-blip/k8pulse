import asyncio
import datetime
from pathlib import Path
from typing import AsyncGenerator
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, Text, ForeignKey, JSON, inspect
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship
from app.core.config import settings

# Database Engine & Session
# Handles both SQLite (local development) and PostgreSQL (production / container)
DATABASE_URL = settings.DATABASE_URL
if DATABASE_URL.startswith("sqlite") and not DATABASE_URL.startswith("sqlite+aiosqlite"):
    DATABASE_URL = DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://")
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+asyncpg"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DB_ECHO,
    future=True,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="operator", nullable=False)  # admin, operator, viewer
    full_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    # Self-registered accounts wait for an admin when SIGNUP_MODE=approval
    is_approved = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    metric_type = Column(String(50), nullable=False)  # cpu_percent, memory_percent, pod_restarts, node_unready, crashloop
    condition = Column(String(10), default="gt", nullable=False)  # gt, lt, eq
    threshold = Column(Float, nullable=False)
    severity = Column(String(20), default="warning", nullable=False)  # critical, warning, info
    duration_seconds = Column(Integer, default=60, nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    events = relationship("AlertEvent", back_populates="rule", cascade="all, delete-orphan")


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("alert_rules.id", ondelete="SET NULL"), nullable=True)
    rule_name = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False)
    message = Column(Text, nullable=False)
    target_resource = Column(String(255), nullable=False)  # e.g., pod:default/backend-api-xyz
    triggered_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    is_resolved = Column(Boolean, default=False, nullable=False)

    rule = relationship("AlertRule", back_populates="events")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False, default="system")
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50), nullable=False)
    resource_name = Column(String(255), nullable=False)
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


BACKEND_DIR = Path(__file__).resolve().parents[2]


async def _is_unversioned_legacy_db() -> bool:
    """True for databases created by older versions with create_all (tables exist, no alembic_version)."""
    async with engine.connect() as conn:
        return await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).has_table("users")
            and not inspect(sync_conn).has_table("alembic_version")
        )


def _run_alembic(stamp_legacy: bool) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    if stamp_legacy:
        command.stamp(cfg, "0001")
    command.upgrade(cfg, "head")


async def init_db():
    """Bring the database schema up to date by running Alembic migrations."""
    stamp_legacy = await _is_unversioned_legacy_db()
    # Alembic's env.py runs its own event loop, so it must run outside this one
    await asyncio.to_thread(_run_alembic, stamp_legacy)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
