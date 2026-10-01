import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.ai import gemini_service


@pytest.mark.asyncio
async def test_local_ollama_fallback(monkeypatch):
    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"response": "Cluster is healthy with one ready node and all pods running."}

    async def fake_post(self, url, json=None, **kwargs):
        assert url.endswith("/api/generate")
        assert json["model"] == "llama3.2:latest"
        assert "Cluster" in json["prompt"]
        return FakeResponse()

    monkeypatch.setattr("app.services.ai.httpx.AsyncClient.post", fake_post)

    result = await gemini_service._call_ollama("Cluster status: healthy")
    assert "Cluster is healthy" in result


@pytest.mark.asyncio
async def test_ai_cluster_explain():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/ai/explain-cluster",
            json={"custom_question": "Explain cluster health"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "summary" in data
        assert "root_cause_analysis" in data
        assert len(data["recommendations"]) > 0
        assert len(data["suggested_commands"]) > 0


@pytest.mark.asyncio
async def test_ai_pod_incident_analysis():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/ai/analyze-incident",
            json={"namespace": "default", "pod_name": "auth-service-589cf-4kk2p"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "Incident Analysis" in data["title"] or "Root Cause" in data["title"]
