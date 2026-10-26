"""
Deterministic incident checks that run before the LLM.

Each analyzer looks for one well-known failure pattern in live data (pod spec, container states,
events, logs) and, when it matches, returns a finding: a verified fact plus the concrete fix.
The findings are shown to the user as-is and given to the model as ground truth, which keeps a
small local model from guessing (for example "edit the Secret" when the Secret does not exist).
"""
import re
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

from kubernetes.utils import parse_quantity


@dataclass
class Finding:
    title: str        # what is wrong, stated as a fact
    fix: str          # what to change
    commands: List[str] = field(default_factory=list)

    def as_text(self) -> str:
        return f"{self.title} Fix: {self.fix}"


@dataclass
class PodContext:
    namespace: str
    pod: object                       # kubernetes.client.V1Pod
    controller: Optional[str]         # e.g. "Deployment/payment-service"
    event_messages: Sequence[str]
    logs: str                         # current + previous run
    service_names: Sequence[str]      # Services in the pod's namespace
    max_node_cpu: float = 0.0         # largest allocatable CPU of any node (cores)
    max_node_memory: float = 0.0      # largest allocatable memory of any node (bytes)


def _workload(ctx: PodContext) -> str:
    return ctx.controller.lower() if ctx.controller else f"pod/{ctx.pod.metadata.name}"


def _container_states(ctx: PodContext):
    for cs in ctx.pod.status.container_statuses or []:
        yield cs, cs.state, cs.last_state


def check_image_pull(ctx: PodContext) -> List[Finding]:
    out = []
    for cs, state, _ in _container_states(ctx):
        waiting = state.waiting if state else None
        if waiting and waiting.reason in ("ErrImagePull", "ImagePullBackOff", "InvalidImageName"):
            text = " ".join([waiting.message or ""] + list(ctx.event_messages)).lower()
            missing = "not found" in text or "manifest unknown" in text or "does not exist" in text
            out.append(Finding(
                f"Image {cs.image} for container {cs.name} cannot be pulled"
                + (" because that image or tag does not exist in the registry." if missing else "."),
                "Correct the image name/tag in the workload (look for a typo), or push the image to the registry.",
                [f"kubectl set image {_workload(ctx)} {cs.name}=<correct-image> -n {ctx.namespace}"],
            ))
    return out


_MISSING_REF = re.compile(r'(secret|configmap)s? "([^"]+)" not found', re.IGNORECASE)


def check_missing_config(ctx: PodContext) -> List[Finding]:
    texts = [cs.state.waiting.message for cs, *_ in _container_states(ctx)
             if cs.state and cs.state.waiting and cs.state.waiting.message] + list(ctx.event_messages)
    seen, out = set(), []
    for text in texts:
        for kind, name in _MISSING_REF.findall(text or ""):
            key = (kind.lower(), name)
            if key in seen:
                continue
            seen.add(key)
            if kind.lower() == "secret":
                command = f"kubectl create secret generic {name} --from-literal=<key>=<value> -n {ctx.namespace}"
                label = "Secret"
            else:
                command = f"kubectl create configmap {name} --from-literal=<key>=<value> -n {ctx.namespace}"
                label = "ConfigMap"
            out.append(Finding(
                f"{label} {name} referenced by the pod does not exist in namespace {ctx.namespace}, "
                "so the container cannot be created.",
                f"Create the {label} {name} with the keys the app expects (it cannot be edited because it does "
                "not exist), or remove the reference from the workload.",
                [command, f"kubectl rollout restart {_workload(ctx)} -n {ctx.namespace}"],
            ))
    return out


def check_oom(ctx: PodContext) -> List[Finding]:
    out = []
    spec_by_name = {c.name: c for c in ctx.pod.spec.containers}
    for cs, state, last in _container_states(ctx):
        oom = (state and state.terminated and state.terminated.reason == "OOMKilled") or \
              (last and last.terminated and last.terminated.reason == "OOMKilled")
        if not oom:
            continue
        spec = spec_by_name.get(cs.name)
        limit = ((spec.resources.limits or {}).get("memory") if spec and spec.resources else None) or "none set"
        out.append(Finding(
            f"Container {cs.name} was OOMKilled (exit code 137): it used more memory than its limit ({limit}).",
            "Raise the memory limit in the workload, or reduce the app's memory use (e.g. bound its cache).",
            [f"kubectl set resources {_workload(ctx)} -c {cs.name} --limits=memory=<higher, e.g. 2x current> "
             f"-n {ctx.namespace}"],
        ))
    return out


def _probe_port(probe) -> Optional[int]:
    target = probe.http_get or probe.tcp_socket
    return target.port if target and isinstance(target.port, int) else None


def check_probes(ctx: PodContext) -> List[Finding]:
    out = []
    events = " ".join(ctx.event_messages)
    for c in ctx.pod.spec.containers:
        ports = [p.container_port for p in (c.ports or [])]
        for kind, probe in (("liveness", c.liveness_probe), ("readiness", c.readiness_probe)):
            if not probe:
                continue
            port = _probe_port(probe)
            failing = f"{kind.capitalize()} probe failed" in events
            if port is not None and ports and port not in ports:
                out.append(Finding(
                    f"The {kind} probe of container {c.name} checks port {port}, but the container listens on "
                    f"port {', '.join(map(str, ports))}"
                    + (", so the probe fails" + (" and the kubelet restarts the container." if kind == "liveness"
                                                 else " and the pod never becomes Ready.") if failing else "."),
                    f"Point the {kind} probe at port {ports[0]}.",
                    [f"kubectl edit {_workload(ctx)} -n {ctx.namespace}   # set {kind}Probe port to {ports[0]}"],
                ))
                continue
            status = re.search(rf"{kind} probe failed: HTTP probe failed with statuscode: (\d+)", events, re.IGNORECASE)
            if status and probe.http_get:
                out.append(Finding(
                    f"The {kind} probe of container {c.name} requests {probe.http_get.path or '/'} and gets HTTP "
                    f"{status.group(1)}, so the probe fails"
                    + (" and the pod is never marked Ready (it receives no traffic)." if kind == "readiness"
                       else " and the kubelet restarts the container."),
                    f"Change the probe path to an endpoint the app serves with 200 (for example /), "
                    f"or add {probe.http_get.path} to the app.",
                    [f"kubectl edit {_workload(ctx)} -n {ctx.namespace}   # fix {kind}Probe.httpGet.path"],
                ))
    return out


def check_unschedulable(ctx: PodContext) -> List[Finding]:
    if ctx.pod.status.phase != "Pending" or not any("Insufficient" in m for m in ctx.event_messages):
        return []
    out = []
    for c in ctx.pod.spec.containers:
        requests = (c.resources.requests or {}) if c.resources else {}
        cpu = float(parse_quantity(requests["cpu"])) if "cpu" in requests else 0.0
        mem = float(parse_quantity(requests["memory"])) if "memory" in requests else 0.0
        if ctx.max_node_cpu and cpu > ctx.max_node_cpu:
            out.append(Finding(
                f"Container {c.name} requests {requests['cpu']} CPU, but the largest node only has "
                f"{ctx.max_node_cpu:g} allocatable CPU, so the pod can never be scheduled.",
                "Lower the CPU request to what the app really needs, or add a node large enough for it.",
                [f"kubectl set resources {_workload(ctx)} -c {c.name} --requests=cpu=<e.g. 500m> -n {ctx.namespace}"],
            ))
        if ctx.max_node_memory and mem > ctx.max_node_memory:
            out.append(Finding(
                f"Container {c.name} requests {requests['memory']} memory, more than any node can allocate.",
                "Lower the memory request, or add a node with more memory.",
                [f"kubectl set resources {_workload(ctx)} -c {c.name} --requests=memory=<lower> -n {ctx.namespace}"],
            ))
    return out


_EXEC_MISSING = re.compile(r'exec: "([^"]+)": (?:stat [^:]+: )?(no such file or directory|executable file not found)')


def check_bad_command(ctx: PodContext) -> List[Finding]:
    texts = list(ctx.event_messages)
    for cs, state, last in _container_states(ctx):
        for s in (state, last):
            for detail in (s.waiting, s.terminated) if s else ():
                if detail and detail.message:
                    texts.append(detail.message)
    for text in texts:
        match = _EXEC_MISSING.search(text or "")
        if match:
            image = ctx.pod.spec.containers[0].image
            return [Finding(
                f"The container command {match.group(1)} does not exist in image {image}, so the container "
                "cannot start.",
                "Fix the command/entrypoint in the workload to a program that exists in the image, or use an "
                "image that contains it.",
                [f"kubectl edit {_workload(ctx)} -n {ctx.namespace}   # correct spec.containers[].command"],
            )]
    return []


def check_read_only_fs(ctx: PodContext) -> List[Finding]:
    match = re.search(r"(?:can't create|cannot create|mkdir)[^\n]*?'?(/[\w./-]+)'?[^\n]*read-only file system",
                      ctx.logs, re.IGNORECASE) or re.search(r"(/[\w./-]+)[^\n]*read-only file system", ctx.logs,
                                                            re.IGNORECASE)
    if not match and "read-only file system" not in ctx.logs.lower():
        return []
    path = match.group(1) if match else "its data directory"
    read_only = any(c.security_context and c.security_context.read_only_root_filesystem
                    for c in ctx.pod.spec.containers)
    return [Finding(
        f"The app writes to {path}, but the root filesystem is read-only"
        + (" (readOnlyRootFilesystem: true)." if read_only else "."),
        f"Mount a writable emptyDir volume at {path} (keeps the hardening), or set readOnlyRootFilesystem: false.",
        [f"kubectl edit {_workload(ctx)} -n {ctx.namespace}   # add an emptyDir volume mounted at {path}"],
    )]


_DNS = re.compile(r"(?:resolve host|resolve|lookup)\s+'?([a-z0-9][a-z0-9.-]*)'?[:\s].*?(?:not known|no such host|"
                  r"could not|failed|NXDOMAIN)|could not resolve host\s+'?([a-z0-9][a-z0-9.-]*)", re.IGNORECASE)


def check_dns(ctx: PodContext) -> List[Finding]:
    match = _DNS.search(ctx.logs)
    if not match:
        return []
    host = (match.group(1) or match.group(2)).rstrip(".:")
    short = host.split(".")[0]
    if short in ctx.service_names:
        return [Finding(
            f"The app cannot resolve {host}, although Service {short} exists; cluster DNS may be failing.",
            "Check CoreDNS and the Service's namespace.",
            ["kubectl -n kube-system get pods -l k8s-app=kube-dns"],
        )]
    return [Finding(
        f"The app needs {host}, but no Service named {short} exists in namespace {ctx.namespace}, "
        "so the DNS lookup fails and the app exits.",
        f"Deploy the dependency and create a Service named {short}, or point the app at the correct host.",
        [f"kubectl get svc -n {ctx.namespace}",
         f"kubectl create service clusterip {short} --tcp=<port>:<port> -n {ctx.namespace}   # with a matching backend"],
    )]


_MISSING_ENV = re.compile(
    r"(?:environment variable|env(?:ironment)? var(?:iable)?)\s+'?\"?([A-Z][A-Z0-9_]+)'?\"?\s+(?:is not set|is missing|"
    r"not set|is required|must be set)|missing (?:required )?(?:environment variable|env var)\s*:?\s*'?\"?([A-Z][A-Z0-9_]+)",
    re.IGNORECASE,
)


def check_missing_env(ctx: PodContext) -> List[Finding]:
    match = _MISSING_ENV.search(ctx.logs)
    if not match:
        return []
    var = match.group(1) or match.group(2)
    defined = {e.name for c in ctx.pod.spec.containers for e in (c.env or [])}
    if var in defined:
        return []
    return [Finding(
        f"The app exits because the required environment variable {var} is not set (it is not defined in the "
        "pod spec).",
        f"Set {var} on the workload, ideally from a ConfigMap or Secret.",
        [f"kubectl set env {_workload(ctx)} {var}=<value> -n {ctx.namespace}",
         f"kubectl rollout status {_workload(ctx)} -n {ctx.namespace}"],
    )]


ANALYZERS = [
    check_missing_env,
    check_image_pull, check_missing_config, check_oom, check_probes,
    check_unschedulable, check_bad_command, check_read_only_fs, check_dns,
]


def analyze(ctx: PodContext) -> List[Finding]:
    findings: List[Finding] = []
    for analyzer in ANALYZERS:
        try:
            findings.extend(analyzer(ctx))
        except Exception:
            # A check must never break the analysis; the model still gets the raw data
            continue
    return findings
