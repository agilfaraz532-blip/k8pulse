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
        assert (await ac.get("/api/auth/config")).json() == {"auth_enabled": True, "signup_mode": "approval"}
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


@pytest.mark.asyncio
async def test_signup_requires_approval_then_admin_approves(auth_enabled):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        form = {"full_name": "Asha Rao", "username": "Asha.Rao", "email": "Asha@Example.com", "password": "secret123"}
        res = await ac.post("/api/auth/signup", json=form)
        assert res.status_code == 201 and res.json()["status"] == "pending"

        # Same username / email again -> clear conflict messages
        assert (await ac.post("/api/auth/signup", json=form)).json()["detail"] == "That username is already taken"
        dup_email = {**form, "username": "asha2"}
        assert (await ac.post("/api/auth/signup", json=dup_email)).status_code == 409

        # Correct password but not approved yet -> explains why, instead of "invalid password"
        pending = await ac.post("/api/auth/login", json={"username": "asha.rao", "password": "secret123"})
        assert pending.status_code == 403 and "approve" in pending.json()["detail"]
        # Wrong password never reveals the account state
        wrong = await ac.post("/api/auth/login", json={"username": "asha.rao", "password": "nope12345"})
        assert wrong.status_code == 401

        admin = await _admin_headers(ac)
        users = (await ac.get("/api/auth/users", headers=admin)).json()
        asha = next(u for u in users if u["username"] == "asha.rao")
        assert asha["is_approved"] is False and asha["role"] == "viewer" and asha["full_name"] == "Asha Rao"
        assert (await ac.patch(f"/api/auth/users/{asha['id']}", json={"is_approved": True}, headers=admin)).status_code == 200

        # Approved: can sign in with username or email, and is read-only as a viewer
        ok = await ac.post("/api/auth/login", json={"username": "asha@example.com", "password": "secret123"})
        assert ok.status_code == 200
        viewer = {"Authorization": f"Bearer {ok.json()['access_token']}"}
        assert (await ac.get("/api/alerts/rules", headers=viewer)).status_code == 200
        rule = {"name": "x", "metric_type": "cpu_percent", "condition": "gt", "threshold": 90, "severity": "warning"}
        assert (await ac.post("/api/alerts/rules", json=rule, headers=viewer)).status_code == 403
        assert (await ac.get("/api/auth/users", headers=viewer)).status_code == 403


@pytest.mark.asyncio
async def test_signup_validation_and_modes(auth_enabled, monkeypatch):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        base = {"full_name": "Ravi K", "username": "ravi", "email": "ravi@example.com", "password": "secret123"}
        assert (await ac.post("/api/auth/signup", json={**base, "password": "short1"})).status_code == 422
        assert (await ac.post("/api/auth/signup", json={**base, "password": "onlyletters"})).status_code == 422
        assert (await ac.post("/api/auth/signup", json={**base, "username": "a b"})).status_code == 422
        assert (await ac.post("/api/auth/signup", json={**base, "email": "not-an-email"})).status_code == 422

        monkeypatch.setattr(settings, "SIGNUP_MODE", "open")
        res = await ac.post("/api/auth/signup", json=base)
        assert res.json()["status"] == "active"
        assert (await ac.post("/api/auth/login", json={"username": "ravi", "password": "secret123"})).status_code == 200

        monkeypatch.setattr(settings, "SIGNUP_MODE", "disabled")
        other = {**base, "username": "ravi2", "email": "ravi2@example.com"}
        assert (await ac.post("/api/auth/signup", json=other)).status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_lock_out_the_last_admin(auth_enabled):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin = await _admin_headers(ac)
        me = (await ac.get("/api/auth/me", headers=admin)).json()
        res = await ac.patch(f"/api/auth/users/{me['id']}", json={"is_active": False}, headers=admin)
        assert res.status_code == 400
        res = await ac.patch(f"/api/auth/users/{me['id']}", json={"role": "viewer"}, headers=admin)
        assert res.status_code == 400
