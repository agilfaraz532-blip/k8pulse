"""Deterministic incident checks, exercised with real Kubernetes client model objects."""
from kubernetes.client import (
    V1Container, V1ContainerPort, V1ContainerState, V1ContainerStateTerminated, V1ContainerStateWaiting,
    V1ContainerStatus, V1HTTPGetAction, V1ObjectMeta, V1Pod, V1PodSpec, V1PodStatus, V1Probe,
    V1ResourceRequirements, V1SecurityContext,
)

from app.services.analyzers import PodContext, analyze


def make_pod(container: V1Container, *, phase="Running", waiting=None, terminated=None, last_terminated=None):
    status = V1ContainerStatus(
        name=container.name, image=container.image, image_id="", ready=False, restart_count=3,
        state=V1ContainerState(waiting=waiting, terminated=terminated),
        last_state=V1ContainerState(terminated=last_terminated),
    )
    return V1Pod(
        metadata=V1ObjectMeta(name="app-7d9-x", namespace="shop"),
        spec=V1PodSpec(containers=[container]),
        status=V1PodStatus(phase=phase, container_statuses=[status]),
    )


def ctx(pod, events=(), logs="", services=(), cpu=8.0, mem=8 * 1024 ** 3):
    return PodContext(namespace="shop", pod=pod, controller="Deployment/app", event_messages=list(events), logs=logs,
                      service_names=list(services), max_node_cpu=cpu, max_node_memory=mem)


def titles(context):
    return " ".join(f.title for f in analyze(context))


def test_missing_secret_says_create_not_edit():
    pod = make_pod(V1Container(name="api", image="busybox"),
                   waiting=V1ContainerStateWaiting(reason="CreateContainerConfigError",
                                                   message='secret "db-credentials" not found'))
    findings = analyze(ctx(pod))
    assert "Secret db-credentials" in findings[0].title
    assert any(c.startswith("kubectl create secret generic db-credentials") for c in findings[0].commands)


def test_image_tag_typo():
    pod = make_pod(V1Container(name="web", image="nginx:1.27-alpien"),
                   waiting=V1ContainerStateWaiting(reason="ImagePullBackOff", message="Back-off pulling image"),)
    events = ['Failed to pull image "nginx:1.27-alpien": docker.io/library/nginx:1.27-alpien: not found']
    assert "does not exist in the registry" in titles(ctx(pod, events))


def test_oom_reports_the_limit():
    container = V1Container(name="cache", image="busybox",
                            resources=V1ResourceRequirements(limits={"memory": "24Mi"}))
    pod = make_pod(container, last_terminated=V1ContainerStateTerminated(reason="OOMKilled", exit_code=137))
    assert "OOMKilled" in titles(ctx(pod)) and "24Mi" in titles(ctx(pod))


def test_liveness_probe_on_wrong_port():
    container = V1Container(
        name="nginx", image="nginx", ports=[V1ContainerPort(container_port=80)],
        liveness_probe=V1Probe(http_get=V1HTTPGetAction(path="/", port=8080)),
    )
    events = ["Liveness probe failed: Get http://10.0.0.5:8080/: connect: connection refused"]
    findings = analyze(ctx(make_pod(container), events))
    assert "port 8080" in findings[0].title and "port 80" in findings[0].title
    assert "Point the liveness probe at port 80" in findings[0].fix


def test_readiness_probe_404():
    container = V1Container(
        name="nginx", image="nginx", ports=[V1ContainerPort(container_port=80)],
        readiness_probe=V1Probe(http_get=V1HTTPGetAction(path="/healthz", port=80)),
    )
    events = ["Readiness probe failed: HTTP probe failed with statuscode: 404"]
    assert "/healthz and gets HTTP 404" in titles(ctx(make_pod(container), events))


def test_unschedulable_cpu_request():
    container = V1Container(name="trainer", image="busybox",
                            resources=V1ResourceRequirements(requests={"cpu": "64"}))
    pod = make_pod(container, phase="Pending")
    events = ["0/1 nodes are available: 1 Insufficient cpu."]
    assert "64 CPU" in titles(ctx(pod, events, cpu=8.0))


def test_missing_executable():
    pod = make_pod(V1Container(name="jobs", image="busybox", command=["/app/run-jobs"]),
                   last_terminated=V1ContainerStateTerminated(
                       reason="StartError", exit_code=128,
                       message='exec: "/app/run-jobs": stat /app/run-jobs: no such file or directory'))
    assert "/app/run-jobs does not exist" in titles(ctx(pod))


def test_read_only_root_filesystem():
    container = V1Container(name="uploads", image="busybox",
                            security_context=V1SecurityContext(read_only_root_filesystem=True))
    logs = "mkdir: can't create directory '/var/uploads/': Read-only file system"
    findings = analyze(ctx(make_pod(container), logs=logs))
    assert "/var/uploads/" in findings[0].title and "emptyDir" in findings[0].fix


def test_missing_dependency_service():
    logs = "ERROR could not resolve host orders-db: Name or service not known"
    pod = make_pod(V1Container(name="orders", image="busybox"))
    assert "no Service named orders-db" in titles(ctx(pod, logs=logs, services=["storefront"]))


def test_healthy_pod_has_no_findings():
    container = V1Container(name="nginx", image="nginx", ports=[V1ContainerPort(container_port=80)],
                            readiness_probe=V1Probe(http_get=V1HTTPGetAction(path="/", port=80)))
    assert analyze(ctx(make_pod(container), logs="GET / 200")) == []


def test_missing_environment_variable():
    from kubernetes.client import V1EnvVar
    logs = "INFO starting\nERROR required environment variable PAYMENT_GATEWAY_URL is not set\nFATAL exiting"
    pod = make_pod(V1Container(name="payments", image="busybox", env=[V1EnvVar(name="PAYMENT_TIMEOUT_MS", value="3000")]))
    findings = analyze(ctx(pod, logs=logs))
    assert "PAYMENT_GATEWAY_URL is not set" in findings[0].title
    assert findings[0].commands[0].startswith("kubectl set env deployment/app PAYMENT_GATEWAY_URL=")
    # Already defined in the spec -> not reported
    defined = make_pod(V1Container(name="payments", image="busybox", env=[V1EnvVar(name="PAYMENT_GATEWAY_URL", value="x")]))
    assert analyze(ctx(defined, logs=logs)) == []
