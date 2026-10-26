from prometheus_client import generate_latest

from app.kubernetes.client import k8s_service
from app.monitoring.exporter import registry


def test_exporter_reports_cluster_down_without_kubeconfig(monkeypatch):
    monkeypatch.setattr(k8s_service, "is_connected", False)
    output = generate_latest(registry).decode()
    assert "k8spulse_cluster_up 0.0" in output
    assert "k8spulse_node_ready" not in output


def test_metrics_hidden_from_proxied_requests():
    import asyncio
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    async def run():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            direct = await ac.get("/metrics")
            via_tunnel = await ac.get("/metrics", headers={"X-Forwarded-For": "203.0.113.9"})
            return direct.status_code, via_tunnel.status_code

    assert asyncio.run(run()) == (200, 404)
