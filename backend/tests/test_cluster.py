import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.monitoring.prometheus import PrometheusMetricsService


def test_prometheus_metric_parsing():
    service = PrometheusMetricsService()
    sample = {
        "data": {
            "result": [
                {
                    "values": [
                        [1700000000, "40.0"],
                        [1700000060, "42.0"],
                        [1700000120, "38.5"],
                    ]
                }
            ]
        }
    }

    result = service._normalize_series_to_values(sample)
    assert result == [40.0, 42.0, 38.5]


@pytest.mark.asyncio
async def test_cluster_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r_overview = await ac.get("/api/cluster/overview")
        assert r_overview.status_code == 200
        assert r_overview.json()["status"] in ["Healthy", "Degraded"]

        r_nodes = await ac.get("/api/cluster/nodes")
        assert r_nodes.status_code == 200
        assert isinstance(r_nodes.json(), list)

        r_pods = await ac.get("/api/cluster/pods")
        assert r_pods.status_code == 200
        assert isinstance(r_pods.json(), list)

        r_deployments = await ac.get("/api/cluster/deployments")
        assert r_deployments.status_code == 200
        assert isinstance(r_deployments.json(), list)

        r_services = await ac.get("/api/cluster/services")
        assert r_services.status_code == 200
        assert isinstance(r_services.json(), list)

        r_events = await ac.get("/api/cluster/events")
        assert r_events.status_code == 200
        assert isinstance(r_events.json(), list)


@pytest.mark.asyncio
async def test_metrics_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/api/metrics/cluster")
        assert r.status_code == 200
        data = r.json()
        assert "cpu_usage_percent" in data
        assert "memory_usage_percent" in data
