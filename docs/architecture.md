# K8sPulse — Architecture

## Components

```
                ┌──────────────────────────── Browser ────────────────────────────┐
                │ React + Vite SPA (login, overview, nodes, pods, logs, alerts, AI) │
                └───────────────────────────────┬─────────────────────────────────┘
                                                │ /api (JWT bearer token)
                                    ┌───────────▼───────────┐
                                    │ nginx (frontend image) │  re-resolves backend DNS,
                                    └───────────┬───────────┘  no buffering for AI streams
                                                │
┌───────────────┐   list/watch   ┌──────────────▼──────────────┐   NDJSON stream   ┌──────────────┐
│ Kubernetes API│◄───────────────┤        FastAPI backend       ├──────────────────►│ Ollama (host)│
│ metrics-server│                │  • REST API   • alert engine │   fallback        │ Gemini (API) │
└───────────────┘                │  • /metrics Prometheus export│                   └──────────────┘
                                 └───────┬──────────────▲───────┘
                                         │ SQL          │ scrape /metrics (15s)
                                 ┌───────▼──────┐  ┌────┴───────┐   scrape   ┌───────────────┐
                                 │ PostgreSQL   │  │ Prometheus ├───────────►│ node-exporter │
                                 │ users, rules,│  └────▲───────┘            └───────────────┘
                                 │ alert events │       │ PromQL
                                 └──────────────┘  ┌────┴────┐
                                                   │ Grafana │
                                                   └─────────┘
```

## Data flow

### Live cluster state
`app/kubernetes/client.py` loads a kubeconfig, or the in-cluster service account. Every request reads the
Kubernetes API directly. Pod and node CPU/memory usage comes from the `metrics.k8s.io` API (metrics-server).
Without metrics-server, the overview falls back to resource *requests* and labels them as such.

Pod status mirrors `kubectl get pods`: container waiting/terminated reasons (`CrashLoopBackOff`, `Error`,
`OOMKilled`…) take precedence over the pod phase, which stays `Running` while a container crash-loops. Each
container also reports its last termination reason, exit code and time.

If no cluster is reachable, the cluster endpoints return **`503`** and the UI shows an outage banner. Built-in
sample data exists only for tests and offline UI work, and only when `DEMO_DATA=true`. If a live API call fails
while connected, the error is returned; it is never replaced with fake data.

### Metric history
The backend exposes `GET /metrics` (`app/monitoring/exporter.py`). Each Prometheus scrape reads the cluster and
publishes these series:

| Metric | Labels | Meaning |
|---|---|---|
| `k8spulse_cluster_up` | — | Kubernetes API reachable |
| `k8spulse_node_ready` | node | 1 if Ready |
| `k8spulse_node_cpu_usage_cores` / `_allocatable_cores` | node | metrics-server usage / allocatable |
| `k8spulse_node_memory_usage_bytes` / `_allocatable_bytes` | node | working set / allocatable |
| `k8spulse_pods` | phase | pod count per phase |
| `k8spulse_pods_unhealthy` | — | CrashLoopBackOff, ImagePullBackOff, Failed, … |
| `k8spulse_container_restarts_total` | namespace, pod | container restarts |

node-exporter adds host network throughput. The dashboard charts (`GET /api/metrics/cluster`) and the Grafana
dashboard both query Prometheus. With no data they show an explanation, never synthetic values.

### Alerting
`app/services/alerting.py` runs inside the API process every `ALERT_EVAL_INTERVAL_SECONDS`:

1. Read the cluster once and compute a value per target (cluster, node or pod) for each metric type.
2. For each enabled rule, track how long each target has violated the condition.
3. After `duration_seconds`, open an `AlertEvent`. There is one open event per rule and target, so nothing is duplicated.
4. When the condition clears, resolve the open event automatically.

Prometheus also loads `monitoring/alert-rules.yml` for the same conditions, which is useful from Grafana.
Because the engine runs in-process, the backend is deployed with a single replica.

### AI copilot
`app/services/ai.py` builds a compact prompt from live data only: the overview, unhealthy pods, restarting pods
and warning events, or, for one pod, its status, last 15 log lines and events. The prompt tells the model not to
invent facts. The answer streams to the browser as NDJSON (`meta`, then `token`… events, then `done` or `error`).
The kubectl commands the model suggests are extracted from its own text. Order of attempts: Ollama, then Gemini,
then an explicit error.

### Authentication
- Passwords are hashed with bcrypt and sessions use JWT bearer tokens (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- Every `/api/cluster`, `/api/metrics`, `/api/alerts` and `/api/ai` route depends on `require_user`.
- `/api/health*`, `/api/auth/login|token|config` and `/metrics` stay public; probes and Prometheus use them.
- The admin account is created on startup from `ADMIN_USERNAME`/`ADMIN_PASSWORD`, and only admins can register users.

### Database
SQLAlchemy async models live in `app/models/database.py`. The schema is managed by Alembic (`backend/migrations`).
- **On startup:** the backend runs `alembic upgrade head`. Databases created by older versions, which used `create_all`, are stamped first.
- **In Kubernetes:** an init container runs the migration before the API starts.
