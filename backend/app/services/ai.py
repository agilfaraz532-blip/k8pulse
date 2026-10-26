import asyncio
import datetime
import json
import re
from typing import AsyncIterator, Dict, List, Tuple

import httpx
from google import genai

from app.core.config import settings
from app.core.logging import logger
from app.schemas.ai import AIAnalysisResponse, AIClusterAnalysisRequest, AIPodIncidentRequest
from kubernetes.utils import parse_quantity

from app.kubernetes.client import k8s_service
from app.services.analyzers import Finding, PodContext, analyze


class AIUnavailableError(Exception):
    """Raised when a real AI analysis cannot be produced (no cluster data or no reachable model)."""


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


# Local models on CPU read prompts slowly (a few tokens/s), so prompts are kept compact.
_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s+")


def _describe_log_error(error: str, previous: bool) -> str:
    """Raw API errors (HTTP headers, 'Bad Request') mislead the model; say what they mean instead."""
    lower = error.lower()
    if previous and "previous terminated container" in lower:
        return "(no previous run: the container has not terminated before)"
    if "waiting to start" in lower or "containercreating" in lower or "podinitializing" in lower:
        return "(no logs: the container has never started)"
    if "not found" in lower:
        return "(no logs: the pod or container no longer exists)"
    return "(logs unavailable)"


def _clip(text: str, limit: int = 160) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


_KUBECTL_RE =re.compile(r"(?:^|[`\s$>])(kubectl\s[^`\n]+)", re.MULTILINE)


def extract_kubectl_commands(text: str, limit: int = 8) -> List[str]:
    """Pull the kubectl commands the model itself suggested, in order, without duplicates."""
    commands: List[str] = []
    for match in _KUBECTL_RE.finditer(text):
        cmd = match.group(1).strip().rstrip(".,;")
        if cmd not in commands:
            commands.append(cmd)
        if len(commands) >= limit:
            break
    return commands


class GeminiAIService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model_name = (settings.GEMINI_MODEL or "gemini-2.5-flash").removeprefix("models/")
        self.ollama_base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.ollama_model = settings.OLLAMA_MODEL or "llama3.2:latest"
        self._gemini_client = None
        if self.api_key and self.api_key != "your_gemini_api_key_here":
            try:
                self._gemini_client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini API: {e}")

    @property
    def _is_configured(self) -> bool:
        return self._gemini_client is not None

    # ------------------------------------------------------------------ LLM backends

    def _ollama_payload(self, prompt: str, stream: bool) -> Dict:
        return {
            "model": self.ollama_model,
            "prompt": prompt,
            "stream": stream,
            "keep_alive": "30m",
            "options": {"temperature": 0.2, "num_predict": settings.OLLAMA_NUM_PREDICT},
        }

    def _ollama_timeout(self) -> httpx.Timeout:
        # Generous read timeout: CPU-only inference of a few hundred tokens can take minutes.
        return httpx.Timeout(settings.OLLAMA_TIMEOUT, connect=5.0)

    async def _call_ollama(self, prompt: str) -> str:
        url = f"{self.ollama_base_url}/api/generate"
        async with httpx.AsyncClient(timeout=self._ollama_timeout()) as client:
            response = await client.post(url, json=self._ollama_payload(prompt, stream=False))
            response.raise_for_status()
            return response.json().get("response", "").strip()

    async def _stream_ollama(self, prompt: str) -> AsyncIterator[str]:
        url = f"{self.ollama_base_url}/api/generate"
        async with httpx.AsyncClient(timeout=self._ollama_timeout()) as client:
            async with client.stream("POST", url, json=self._ollama_payload(prompt, stream=True)) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    if chunk.get("error"):
                        raise RuntimeError(chunk["error"])
                    if chunk.get("response"):
                        yield chunk["response"]
                    if chunk.get("done"):
                        break

    def _call_gemini(self, prompt: str) -> str:
        candidates = []
        for item in [self.model_name, "gemini-2.5-flash", "gemini-flash-latest"]:
            if item not in candidates:
                candidates.append(item)

        last_exc = None
        for model_name in candidates:
            try:
                text = self._gemini_client.models.generate_content(model=model_name, contents=prompt).text
                if text:
                    return text
                last_exc = RuntimeError(f"{model_name} returned an empty response")
            except Exception as exc:
                last_exc = exc
                logger.warning(f"Gemini model {model_name} failed: {exc}")
        raise last_exc or RuntimeError("Gemini generation failed")

    def _unavailable_message(self, ollama_error: str) -> str:
        msg = (
            f"Could not get a response from Ollama at {self.ollama_base_url} ({ollama_error}). "
            f"Make sure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull {self.ollama_model}`)."
        )
        if not self._is_configured:
            msg += " No GEMINI_API_KEY is set, so there is no cloud fallback."
        return msg

    async def _generate_with_fallback(self, prompt: str) -> Tuple[str, str]:
        """Returns (text, model_used). Tries local Ollama first, then Gemini."""
        try:
            text = await self._call_ollama(prompt)
            if text:
                logger.info(f"AI analysis generated by Ollama ({self.ollama_model})")
                return text, f"ollama:{self.ollama_model}"
            ollama_error = "empty response"
        except Exception as exc:
            ollama_error = f"{type(exc).__name__}: {exc}"
            logger.warning(f"Ollama unavailable at {self.ollama_base_url} ({ollama_error}); trying Gemini")

        if self._is_configured:
            try:
                return await asyncio.to_thread(self._call_gemini, prompt), self.model_name
            except Exception as exc:
                logger.warning(f"Gemini fallback failed: {exc}")
                raise AIUnavailableError(f"{self._unavailable_message(ollama_error)} Gemini also failed: {exc}")
        raise AIUnavailableError(self._unavailable_message(ollama_error))

    # ------------------------------------------------------------------ Prompt builders (live data only)

    def _require_cluster(self):
        if not k8s_service.is_connected:
            raise AIUnavailableError(
                "Not connected to a Kubernetes cluster, so there is no real data to analyze. "
                "Check KUBECONFIG_PATH / the mounted kubeconfig and restart the backend."
            )

    def _cluster_context(self, req: AIClusterAnalysisRequest) -> Tuple[str, AIAnalysisResponse]:
        """Returns (prompt, response metadata built from live cluster data)."""
        self._require_cluster()
        overview = k8s_service.get_cluster_overview()
        warning_events = [e for e in k8s_service.get_events() if e.event_type == "Warning"]
        unhealthy_pods = [p for p in k8s_service.get_pods() if p.status != "Running" and p.status != "Succeeded"]
        restarting_pods = sorted((p for p in k8s_service.get_pods() if p.restarts > 0), key=lambda p: -p.restarts)

        def pod_line(p) -> str:
            reasons = ", ".join(
                f"{c.name}:{c.state}{'/' + c.reason if c.reason else ''}"
                f"{' last-exit=' + c.last_termination_reason if c.last_termination_reason else ''}"
                for c in p.containers
            )
            return f"{p.namespace}/{p.name} status={p.status} ready={p.ready} restarts={p.restarts} [{reasons}]"

        live_usage = overview.usage_source == "metrics-server"
        usage_kind = "in use (live, metrics-server)" if live_usage else "requested (no live metrics available)"

        prompt = f"""
You are a Principal Kubernetes Site Reliability Engineer (SRE).
Analyze ONLY the live telemetry below. Do not invent pods, services, errors or numbers that are not listed.
If everything is healthy, say so plainly.

Cluster: {overview.cluster_name} (Kubernetes {overview.server_version}), status {overview.status}
Nodes: {overview.ready_nodes}/{overview.node_count} Ready
Pods: {overview.running_pods}/{overview.pod_count} Running, {overview.failed_pods} unhealthy
Deployments: {overview.deployment_count}, Services: {overview.service_count}, Namespaces: {overview.namespace_count}
CPU {usage_kind}: {overview.cpu_cores_used}/{overview.cpu_cores_total} cores ({overview.cpu_percent}%)
Memory {usage_kind}: {overview.memory_bytes_used}/{overview.memory_bytes_total} GiB ({overview.memory_percent}%)
Total container restarts: {overview.restart_count_24h}

Pods not Running ({len(unhealthy_pods)}):
{chr(10).join(pod_line(p) for p in unhealthy_pods[:8]) or "none"}

Pods with restarts (top 5):
{chr(10).join(pod_line(p) for p in restarting_pods[:5]) or "none"}

Recent Warning events ({len(warning_events)}):
{chr(10).join(f"{e.namespace} {e.object_kind}/{e.object_name} {e.reason}: {_clip(e.message)} (x{e.count})" for e in warning_events[:6]) or "none"}

Question: {req.custom_question or 'Provide an executive cluster health summary and operational recommendations.'}

Answer in concise markdown (under 250 words) with sections: Findings, Recommendations, Commands.
Put each kubectl command in backticks.
"""

        meta = AIAnalysisResponse(
            title=f"Cluster Health Analysis for {overview.cluster_name}",
            severity="Critical" if overview.ready_nodes < overview.node_count
            else "Warning" if overview.failed_pods > 0 or warning_events else "Normal",
            summary=(
                f"{overview.ready_nodes}/{overview.node_count} nodes Ready, {overview.running_pods}/{overview.pod_count} pods Running, "
                f"{overview.failed_pods} unhealthy, {len(warning_events)} warning events. "
                f"CPU {'used' if live_usage else 'requested'} {overview.cpu_percent}%, "
                f"memory {'used' if live_usage else 'requested'} {overview.memory_percent}%."
            ),
            root_cause_analysis="",
            recommendations=[],
            suggested_commands=[],
            model_used="",
            timestamp=_now(),
        )
        return prompt, meta

    def _incident_context(self, req: AIPodIncidentRequest) -> Tuple[str, AIAnalysisResponse]:
        self._require_cluster()
        pod = next((p for p in k8s_service.get_pods(namespace=req.namespace) if p.name == req.pod_name), None)
        if pod is None:
            raise AIUnavailableError(f"Pod {req.namespace}/{req.pod_name} was not found in the cluster.")

        def read_logs(previous: bool) -> str:
            try:
                logs = k8s_service.get_pod_logs(
                    namespace=req.namespace,
                    pod_name=req.pod_name,
                    container_name=req.container_name,
                    tail_lines=req.tail_lines,
                    previous=previous,
                ).logs[-15:]
                return "\n".join(_clip(_TIMESTAMP_RE.sub("", line), 200) for line in logs) or "(no log output)"
            except Exception as exc:
                return _describe_log_error(str(exc), previous)

        logs_text = read_logs(previous=False)
        # A crash-looping container often has no output yet; the crashed run's logs hold the error
        previous_logs_text = read_logs(previous=True) if pod.restarts > 0 else None
        previous_section = (
            f"\nLogs from the previous (crashed) run:\n{previous_logs_text}\n" if previous_logs_text else ""
        )

        try:
            spec_text = "\n".join(k8s_service.get_pod_spec_summary(req.namespace, req.pod_name)) or "(not available)"
        except Exception as exc:
            logger.debug(f"Could not read pod spec: {exc}")
            spec_text = "(not available)"

        events = k8s_service.get_events(namespace=req.namespace)
        relevant_events = [e for e in events if req.pod_name in e.object_name or req.pod_name in e.message]

        findings = self._run_analyzers(req, pod, relevant_events, logs_text, previous_logs_text)
        findings_text = "\n".join(f"- {f.as_text()}" for f in findings) or "- none matched"
        containers = "\n".join(
            f"- {c.name} image={c.image} ready={c.ready} state={c.state} reason={c.reason or '-'} "
            f"restarts={c.restart_count} last-termination={c.last_termination_reason or '-'}"
            f"{f' (exit code {c.last_exit_code})' if c.last_exit_code is not None else ''}"
            f"{chr(10) + '    state message: ' + _clip(c.message, 300) if c.message else ''}"
            f"{chr(10) + '    last termination message: ' + _clip(c.last_termination_message, 300) if c.last_termination_message else ''}"
            for c in pod.containers
        ) or "- none reported"

        prompt = f"""
You are a senior Kubernetes Incident Response Engineer.
Analyze pod '{req.pod_name}' in namespace '{req.namespace}' using ONLY the live data below.
Do not invent errors that are not in the logs/events. If the pod looks healthy, say so plainly.

Pod status: {pod.status}, ready {pod.ready}, restarts {pod.restarts}, node {pod.node_name}, age {pod.age}
Managed by: {pod.controller or "nothing (bare pod)"}

Pod spec (what was requested):
{spec_text}
Containers:
{containers}

Recent logs (current run):
{logs_text}
{previous_section}
Events for this pod:
{chr(10).join(f"{e.event_type} {e.reason}: {_clip(e.message, 300)} (x{e.count})" for e in relevant_events[:6]) or "none"}

Automated checks (verified facts from the data above; base Root Cause and Remediation on these when present):
{findings_text}

Answer in concise markdown (under 250 words) with sections: Root Cause, Impact, Remediation, Commands.
Name the exact failing setting (image, probe, port, limit, ConfigMap/Secret name, path) and compare it with
what the pod spec, events and logs show.
Put each kubectl command in backticks.
Remediation must change the managing workload ({pod.controller or "the pod spec"}), because pods are
recreated from it: for example `kubectl set env`, `kubectl set resources` or `kubectl edit` on it, then
`kubectl rollout status`. Never suggest `kubectl exec` into a crashing container or editing the pod itself.
"""

        unhealthy = pod.status not in ("Running", "Succeeded") or any(c.reason for c in pod.containers if not c.ready)
        not_ready = pod.status == "Running" and not all(c.ready for c in pod.containers)
        severity = (
            "Critical" if unhealthy or (findings and pod.restarts > 0)
            else "Warning" if findings or not_ready or pod.restarts > 0
            else "Normal"
        )
        commands = list(dict.fromkeys(cmd for f in findings for cmd in f.commands))
        meta = AIAnalysisResponse(
            title=f"Incident Analysis: Pod {req.pod_name}",
            severity=severity,
            summary=(
                f"Pod {req.namespace}/{req.pod_name} is {pod.status} ({pod.ready} ready) with {pod.restarts} restarts "
                f"and {len(relevant_events)} related events."
                + (f" Automated checks: {findings[0].title}" if findings else "")
            ),
            root_cause_analysis="",
            recommendations=[f.as_text() for f in findings],
            suggested_commands=commands,
            model_used="",
            timestamp=_now(),
        )
        return prompt, meta

    @staticmethod
    def _run_analyzers(req: AIPodIncidentRequest, pod, events, logs_text: str, previous_logs_text) -> List[Finding]:
        """Deterministic checks (see analyzers.py); failures here never block the LLM analysis."""
        try:
            raw_pod = k8s_service.core_v1.read_namespaced_pod(name=req.pod_name, namespace=req.namespace)
            nodes = k8s_service.get_nodes()
            ctx = PodContext(
                namespace=req.namespace,
                pod=raw_pod,
                controller=pod.controller,
                event_messages=[e.message for e in events],
                logs=f"{logs_text}\n{previous_logs_text or ''}",
                service_names=[s.name for s in k8s_service.get_services(namespace=req.namespace)],
                max_node_cpu=max((float(parse_quantity(n.cpu_allocatable)) for n in nodes), default=0.0),
                max_node_memory=max((float(parse_quantity(n.memory_allocatable)) for n in nodes), default=0.0),
            )
            return analyze(ctx)
        except Exception as exc:
            logger.warning(f"Automated incident checks failed: {exc}")
            return []

    @staticmethod
    def _merge_commands(meta: AIAnalysisResponse, text: str) -> List[str]:
        """
        Commands from the deterministic checks are verified; a small local model often gets the
        intent right but invents kubectl syntax. So when a check matched, only its commands are
        offered for copy/paste; the model's commands are used only when no check applied.
        """
        if meta.suggested_commands:
            return meta.suggested_commands
        return extract_kubectl_commands(text)

    # ------------------------------------------------------------------ Public API

    async def _analyze(self, prompt: str, meta: AIAnalysisResponse) -> AIAnalysisResponse:
        ai_text, model_used = await self._generate_with_fallback(prompt)
        return meta.model_copy(update={
            "root_cause_analysis": ai_text,
            "suggested_commands": self._merge_commands(meta, ai_text),
            "model_used": model_used,
            "timestamp": _now(),
        })

    async def explain_cluster_health(self, req: AIClusterAnalysisRequest) -> AIAnalysisResponse:
        return await self._analyze(*self._cluster_context(req))

    async def analyze_incident(self, req: AIPodIncidentRequest) -> AIAnalysisResponse:
        return await self._analyze(*self._incident_context(req))

    async def stream_cluster_health(self, req: AIClusterAnalysisRequest) -> AsyncIterator[str]:
        async for line in self._stream(lambda: self._cluster_context(req)):
            yield line

    async def stream_incident(self, req: AIPodIncidentRequest) -> AsyncIterator[str]:
        async for line in self._stream(lambda: self._incident_context(req)):
            yield line

    async def _stream(self, build_context) -> AsyncIterator[str]:
        """
        NDJSON event stream:
          {"type": "meta", ...analysis fields}
          {"type": "token", "text": "..."}   (repeated)
          {"type": "done", "model_used": "...", "suggested_commands": [...], "notice": "..."?}
          {"type": "error", "message": "..."}  (instead of done, when no real answer is possible)
        """
        def event(payload: Dict) -> str:
            return json.dumps(payload) + "\n"

        try:
            prompt, meta = await asyncio.to_thread(build_context)
        except AIUnavailableError as exc:
            yield event({"type": "error", "message": str(exc)})
            return
        except Exception as exc:
            logger.warning(f"Failed to collect cluster data for AI analysis: {exc}")
            yield event({"type": "error", "message": f"Failed to read cluster data: {exc}"})
            return

        yield event({"type": "meta", "engine": f"ollama:{self.ollama_model}",
                     **meta.model_dump(exclude={"root_cause_analysis", "model_used"})})

        text = ""
        try:
            async for token in self._stream_ollama(prompt):
                text += token
                yield event({"type": "token", "text": token})
            if text:
                logger.info(f"AI analysis streamed by Ollama ({self.ollama_model})")
                yield event({"type": "done", "model_used": f"ollama:{self.ollama_model}",
                             "suggested_commands": self._merge_commands(meta, text)})
                return
            ollama_error = "empty response"
        except Exception as exc:
            logger.warning(f"Ollama streaming failed at {self.ollama_base_url} ({type(exc).__name__}: {exc})")
            if text:
                yield event({"type": "done", "model_used": f"ollama:{self.ollama_model}",
                             "suggested_commands": self._merge_commands(meta, text),
                             "notice": f"Ollama stopped mid-response: {exc}"})
                return
            ollama_error = f"{type(exc).__name__}: {exc}"

        if self._is_configured:
            try:
                text = await asyncio.to_thread(self._call_gemini, prompt)
                yield event({"type": "token", "text": text})
                yield event({"type": "done", "model_used": self.model_name,
                             "suggested_commands": self._merge_commands(meta, text),
                             "notice": f"Ollama unavailable ({ollama_error}); answered by Gemini."})
                return
            except Exception as exc:
                logger.warning(f"Gemini fallback failed: {exc}")
                ollama_error += f"; Gemini also failed: {exc}"

        yield event({"type": "error", "message": self._unavailable_message(ollama_error)})


gemini_service = GeminiAIService()
