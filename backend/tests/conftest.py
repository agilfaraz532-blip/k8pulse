"""
Test environment: isolated SQLite database, no live cluster/Prometheus, auth disabled by default.
Environment variables take precedence over backend/.env in pydantic-settings, so they must be
set before any app module is imported.
"""
import asyncio
import os
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="k8spulse-tests-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmpdir}/test.db"
os.environ["AUTH_ENABLED"] = "false"
os.environ["KUBECONFIG_PATH"] = os.path.join(_tmpdir, "missing-kubeconfig")
os.environ["K8S_IN_CLUSTER"] = "false"
os.environ["PROMETHEUS_URL"] = "http://127.0.0.1:9"
os.environ["PROMETHEUS_TIMEOUT"] = "1"
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:9"
os.environ["GEMINI_API_KEY"] = ""

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    from app.models.database import engine, init_db
    from app.api.v1.auth import ensure_admin_user

    async def setup():
        await init_db()
        await ensure_admin_user()
        await engine.dispose()

    asyncio.run(setup())
    yield
