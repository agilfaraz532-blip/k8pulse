import pytest
from httpx import AsyncClient, ASGITransport

from app.core.config import settings
from app.main import app


@pytest.fixture
def auth_enabled(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)


async def _admin_headers(ac: AsyncClient) -> dict:
    res = await ac.post(
        "/api/auth/login", json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD}
    )
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_protected_routes_require_token(auth_enabled):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        assert (await ac.get("/api/cluster/overview")).status_code == 401
        assert (await ac.get("/api/alerts/rules")).status_code == 401
        assert (await ac.post("/api/ai/explain-cluster", json={})).status_code == 401
        # health, auth config and the Prometheus scrape endpoint stay public
        assert (await ac.get("/api/health")).status_code == 200
        assert (await ac.get("/api/auth/config")).json() == {"auth_enabled": True}
        assert (await ac.get("/metrics")).status_code == 200


@pytest.mark.asyncio
async def test_login_and_access(auth_enabled):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        bad = await ac.post("/api/auth/login", json={"username": settings.ADMIN_USERNAME, "password": "wrong"})
        assert bad.status_code == 401

        headers = await _admin_headers(ac)
        me = await ac.get("/api/auth/me", headers=headers)
        assert me.json()["username"] == settings.ADMIN_USERNAME
        assert me.json()["role"] == "admin"
        assert (await ac.get("/api/cluster/namespaces", headers=headers)).status_code == 200
        assert (await ac.get("/api/cluster/namespaces", headers={"Authorization": "Bearer junk"})).status_code == 401


@pytest.mark.asyncio
async def test_register_is_admin_only(auth_enabled):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        new_user = {"username": "viewer1", "email": "viewer1@example.com", "password": "pw-123456", "role": "viewer"}
        assert (await ac.post("/api/auth/register", json=new_user)).status_code == 401

        admin = await _admin_headers(ac)
        assert (await ac.post("/api/auth/register", json=new_user, headers=admin)).status_code == 201

        viewer_token = (await ac.post(
            "/api/auth/login", json={"username": "viewer1", "password": "pw-123456"}
        )).json()["access_token"]
        another = {**new_user, "username": "viewer2", "email": "viewer2@example.com"}
        res = await ac.post("/api/auth/register", json=another, headers={"Authorization": f"Bearer {viewer_token}"})
        assert res.status_code == 403
