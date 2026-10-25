import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.kubernetes.client import k8s_service
from app.services import alerting
from app.services.alerting import alert_engine


@pytest.fixture
def fake_cluster(monkeypatch):
    """Lets each test control the measurements the alert engine sees."""
    state = {"crashloop": [("pod:default/web-1", 1.0, "Pod default/web-1 is failing (CrashLoopBackOff)")]}
    monkeypatch.setattr(k8s_service, "is_connected", True)
    monkeypatch.setattr(alerting, "collect_measurements", lambda: state)
    alert_engine._pending_since.clear()
    return state


async def _events_for(ac: AsyncClient, rule_id: int) -> list:
    return [e for e in (await ac.get("/api/alerts/events")).json() if e["rule_id"] == rule_id]


@pytest.mark.asyncio
async def test_rule_crud_and_validation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        bad = await ac.post("/api/alerts/rules", json={"name": "x", "metric_type": "bogus", "threshold": 1})
        assert bad.status_code == 422

        created = await ac.post("/api/alerts/rules", json={
            "name": "Any restart", "metric_type": "pod_restarts", "threshold": 0, "duration_seconds": 0,
        })
        assert created.status_code == 201
        rule_id = created.json()["id"]

        updated = await ac.patch(f"/api/alerts/rules/{rule_id}", json={"is_enabled": False})
        assert updated.json()["is_enabled"] is False

        assert (await ac.delete(f"/api/alerts/rules/{rule_id}")).status_code == 204
        assert all(r["id"] != rule_id for r in (await ac.get("/api/alerts/rules")).json())


@pytest.mark.asyncio
async def test_default_rules_seeded():
    await alert_engine.ensure_default_rules()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        types = {r["metric_type"] for r in (await ac.get("/api/alerts/rules")).json()}
    assert {"cpu_percent", "memory_percent", "crashloop", "pod_restarts", "node_unready"} <= types


@pytest.mark.asyncio
async def test_engine_opens_and_resolves_events(fake_cluster):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        rule = (await ac.post("/api/alerts/rules", json={
            "name": "CrashLoop now", "metric_type": "crashloop", "threshold": 0,
            "severity": "critical", "duration_seconds": 0,
        })).json()

        assert await alert_engine.evaluate_once() >= 1
        # A second evaluation must not duplicate the open event
        await alert_engine.evaluate_once()
        events = await _events_for(ac, rule["id"])
        assert len(events) == 1
        assert events[0]["target_resource"] == "pod:default/web-1"
        assert events[0]["is_resolved"] is False

        # Pod recovers -> event auto-resolves
        fake_cluster["crashloop"] = [("pod:default/web-1", 0.0, "ok")]
        await alert_engine.evaluate_once()
        assert (await _events_for(ac, rule["id"]))[0]["is_resolved"] is True

        await ac.delete(f"/api/alerts/rules/{rule['id']}")


@pytest.mark.asyncio
async def test_engine_respects_duration(fake_cluster):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        rule = (await ac.post("/api/alerts/rules", json={
            "name": "CrashLoop sustained", "metric_type": "crashloop", "threshold": 0, "duration_seconds": 3600,
        })).json()
        await alert_engine.evaluate_once()
        assert await _events_for(ac, rule["id"]) == []
        await ac.delete(f"/api/alerts/rules/{rule['id']}")


@pytest.mark.asyncio
async def test_no_events_without_cluster(monkeypatch):
    monkeypatch.setattr(k8s_service, "is_connected", False)
    assert await alert_engine.evaluate_once() == 0


def test_crash_loop_detection_holds_between_restarts():
    """A crashing pod is briefly 'Running' between back-offs; the alert must not flap closed."""
    import datetime
    from app.schemas.k8s import ContainerStatusInfo, PodInfo
    from app.services.alerting import _is_crash_looping

    def pod(status, *, restarts=0, exit_code=None, ended_minutes_ago=None, reason=None):
        ended = (
            (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=ended_minutes_ago)).isoformat()
            if ended_minutes_ago is not None else None
        )
        return PodInfo(
            name="p", namespace="demo", status=status, ready="0/1", restarts=restarts, age="5m",
            created_at="", labels={},
            containers=[ContainerStatusInfo(
                name="c", image="busybox", ready=False, restart_count=restarts, state="Running",
                reason=reason, last_termination_reason="Error" if exit_code else None,
                last_exit_code=exit_code, last_termination_at=ended,
            )],
        )

    assert _is_crash_looping(pod("Error"))
    assert _is_crash_looping(pod("OOMKilled"))
    assert _is_crash_looping(pod("Running", reason="CrashLoopBackOff"))
    # Running between restarts, crashed 2 minutes ago -> still crash-looping
    assert _is_crash_looping(pod("Running", restarts=5, exit_code=1, ended_minutes_ago=2))
    # Old restart (e.g. node reboot days ago) -> healthy
    assert not _is_crash_looping(pod("Running", restarts=5, exit_code=1, ended_minutes_ago=600))
    # Clean exit is not a crash
    assert not _is_crash_looping(pod("Running", restarts=5, exit_code=0, ended_minutes_ago=2))
