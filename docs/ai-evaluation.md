# AI copilot evaluation

How well does the incident copilot diagnose real Kubernetes failures when it runs on a small,
private, CPU-only model? This page documents the test, the results, and what changed between runs.

## Method

[`demo/ai-eval.yaml`](../demo/ai-eval.yaml) deploys 11 workloads into an `ai-eval` namespace: 10 with a
common, real failure and 1 healthy control. Kubernetes produces every failure itself; nothing is mocked.

| Scenario | Real failure | Ground truth |
|---|---|---|
| `web-image-typo` | `ImagePullBackOff` | Image tag `nginx:1.27-alpien` does not exist |
| `api-missing-configmap` | `CreateContainerConfigError` | ConfigMap `api-config` does not exist |
| `worker-missing-secret` | `CreateContainerConfigError` | Secret `db-credentials` does not exist |
| `cache-oom` | `OOMKilled` | Memory limit (24Mi) too low |
| `frontend-bad-liveness` | `CrashLoopBackOff` | Liveness probe on port 8080, nginx listens on 80 |
| `checkout-not-ready` | Running, never Ready | Readiness probe path `/healthz` returns 404 |
| `ml-unschedulable` | `Pending` | Requests 64 CPUs, largest node has 8 |
| `jobs-bad-command` | `RunContainerError` | Entrypoint `/app/run-jobs` is not in the image |
| `uploads-readonly-fs` | `Error` | Root filesystem is read-only |
| `orders-db-unreachable` | `Error` | Service `orders-db` does not exist (DNS failure) |
| `healthy-control` | Running | Healthy: must not invent a problem |

[`scripts/ai_eval.py`](../scripts/ai_eval.py) calls the real `POST /api/ai/analyze-incident` endpoint for each
pod and scores the answer:

- **Root cause found**: the answer contains every concept of the ground truth (for example *Secret* and
  *db-credentials*). The healthy control must also get severity `Normal`.
- **Specific fix**: the *Remediation* section names the concrete change (create the Secret, point the probe
  at port 80, lower the CPU request…), not just a restatement of the problem.
- **Safe remediation**: no advice that cannot work for a managed pod (`kubectl exec`, editing or deleting
  the pod).

Every answer was also read by hand to confirm the automatic scores.

```bash
kubectl apply -f demo/ai-eval.yaml        # wait ~1 minute for the failures to happen
python scripts/ai_eval.py --out results.json
kubectl delete namespace ai-eval
```

## Results

Model: `llama3.2` 3B (Q4_K_M) through Ollama, CPU only, on a laptop with Docker Desktop.

| Run | What the model received | Root cause found | Specific fix | Safe remediation |
|---|---|---|---|---|
| 1. Baseline | Pod status, logs, events | 9/11 | 4/11 | 11/11 |
| 2. Richer context | + pod spec (probes, resources, refs), container error messages, clean log errors | 11/11 | 6/11 | 11/11 |
| 3. Verified findings | + deterministic checks run first, their findings given as facts | **11/11** | **10/11** | **11/11** |

Average time per diagnosis in run 3: about 90 seconds (first words stream after 15–30 s).

### What made the difference

1. **The model needs the evidence Kubernetes already has.** In run 1 the copilot missed the
   bad-command failure because the decisive message (`exec: "/app/run-jobs": no such file or directory`)
   lives in the container state, which was not passed on. Raw log-API errors ("400 Bad Request") also
   confused it into blaming a "BadRequest error".
2. **A small model reasons poorly across facts.** With the full pod spec it still suggested *editing* a
   Secret that does not exist, and did not connect "probe on 8080" with "container listens on 80".
3. **Deterministic checks fix that.** [`app/services/analyzers.py`](../backend/app/services/analyzers.py)
   recognises 9 failure patterns in plain code (image pull, missing ConfigMap/Secret, OOM, probe port /
   path, unschedulable, missing executable, read-only filesystem, missing Service, missing environment
   variable). Each finding is a verified fact plus a concrete fix and command. The model then explains and
   prioritises those facts instead of guessing.

### Known limits

- The model's own `kubectl` syntax is unreliable: in run 3 it invented flags in about 4 of 11 answers even
  when its advice was right. When a check matched, K8sPulse therefore offers **only the verified commands**
  for copy and paste; the model's text stays as an explanation. Its commands are shown only when no check
  applies.
- Failures outside the 9 checked patterns depend on the model alone (run 2 quality).
- A larger model (for example an 8B one, or Gemini as fallback) should do better on the free-text parts at
  the cost of speed; this was not measured here.
