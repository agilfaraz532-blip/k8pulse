import json

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.ai import gemini_service, extract_kubectl_commands
from app.kubernetes.client import k8s_service


@pytest.mark.asyncio
async def test_local_ollama_call(monkeypatch):
    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"response": "Cluster is healthy with one ready node and all pods running."}

    async def fake_post(self, url, json=None, **kwargs):
        assert url.endswith("/api/generate")
        assert json["model"] == gemini_service.ollama_model
        assert "Cluster" in json["prompt"]
        return FakeResponse()

    monkeypatch.setattr("app.services.ai.httpx.AsyncClient.post", fake_post)

    result = await gemini_service._call_ollama("Cluster status: healthy")
    assert "Cluster is healthy" in result


def test_extract_kubectl_commands():
    text = (
        "Run `kubectl get pods -A` first.\n"
        "```bash\n$ kubectl describe pod web-1 -n default\nkubectl get pods -A\n```"
    )
    assert extract_kubectl_commands(text) == ["kubectl get pods -A", "kubectl describe pod web-1 -n default"]


@pytest.mark.asyncio
async def test_ai_cluster_explain_uses_model_output(monkeypatch):
    async def fake_generate(prompt):
        assert "Analyze ONLY the live telemetry" in prompt
        return "## Findings\nAll good.\n\n## Commands\n`kubectl top nodes`", "ollama:test"

    monkeypatch.setattr(gemini_service, "_require_cluster", lambda: None)
    monkeypatch.setattr(gemini_service, "_generate_with_fallback", fake_generate)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/ai/explain-cluster", json={"custom_question": "Explain cluster health"})
    assert response.status_code == 200
    data = response.json()
    assert data["root_cause_analysis"].startswith("## Findings")
    assert data["model_used"] == "ollama:test"
    assert data["suggested_commands"] == ["kubectl top nodes"]
    assert data["recommendations"] == []


@pytest.mark.asyncio
async def test_ai_refuses_without_cluster(monkeypatch):
    monkeypatch.setattr(k8s_service, "is_connected", False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/ai/analyze-incident", json={"namespace": "default", "pod_name": "auth-service-589cf-4kk2p"}
        )
        assert response.status_code == 503
        assert "Not connected to a Kubernetes cluster" in response.json()["detail"]

        stream = await ac.post("/api/ai/explain-cluster/stream", json={})
        events = [json.loads(line) for line in stream.text.splitlines() if line.strip()]
        assert events == [{"type": "error", "message": events[0]["message"]}]
        assert "Not connected" in events[0]["message"]


@pytest.mark.asyncio
async def test_ai_stream_reports_error_when_no_model(monkeypatch):
    async def broken_stream(prompt):
        raise ConnectionError("connection refused")
        yield  # pragma: no cover

    monkeypatch.setattr(gemini_service, "_require_cluster", lambda: None)
    monkeypatch.setattr(gemini_service, "_stream_ollama", broken_stream)
    monkeypatch.setattr(gemini_service, "_gemini_client", None)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        stream = await ac.post("/api/ai/explain-cluster/stream", json={})
    events = [json.loads(line) for line in stream.text.splitlines() if line.strip()]
    assert [e["type"] for e in events] == ["meta", "error"]
    assert "ollama serve" in events[-1]["message"]


def test_log_errors_are_explained_not_dumped():
    """Raw HTTP errors confused the model ('BadRequest'); it gets a plain explanation instead."""
    from app.services.ai import _describe_log_error

    waiting = '(400) Reason: Bad Request ... container "api" in pod "x" is waiting to start: CreateContainerConfigError'
    assert _describe_log_error(waiting, previous=False) == "(no logs: the container has never started)"
    no_previous = '(400) previous terminated container "web" in pod "x" not found'
    assert _describe_log_error(no_previous, previous=True).startswith("(no previous run")
    assert "Bad Request" not in _describe_log_error("(500) Internal error", previous=False)
