from prometheus_client import generate_latest

from app.kubernetes.client import k8s_service
from app.monitoring.exporter import registry


def test_exporter_reports_cluster_down_without_kubeconfig(monkeypatch):
    monkeypatch.setattr(k8s_service, "is_connected", False)
    output = generate_latest(registry).decode()
    assert "k8spulse_cluster_up 0.0" in output
    assert "k8spulse_node_ready" not in output
