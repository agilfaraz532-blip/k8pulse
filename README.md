# K8sPulse

**A self-hosted Kubernetes dashboard with a private AI SRE copilot.**
Monitor your cluster, get alerted when something breaks, and get a plain-English root-cause analysis,
without your cluster data ever leaving your network.

![stack](https://img.shields.io/badge/stack-FastAPI%20%7C%20React%20%7C%20Prometheus%20%7C%20Grafana-0891b2)
![ai](https://img.shields.io/badge/AI-Ollama%20(local)%20%7C%20Gemini%20fallback-8b5cf6)
![license](https://img.shields.io/badge/license-MIT-green)

## Why K8sPulse

Kubernetes is hard to see into. When a pod crash-loops at 2 a.m., the answer is scattered across
`kubectl` output, metrics, events and the logs of a container that already died. K8sPulse puts all of
it on one screen and asks an LLM to connect the dots.

| | K8sPulse |
|---|---|
| **Private by default** | The copilot runs on a local model through [Ollama](https://ollama.com). Logs and cluster state are not sent to a third party unless you enable the Gemini fallback. |
| **One command to run** | Dashboard, alert engine, Prometheus, Grafana and the AI copilot start together with `docker compose up`. |
| **Real data only** | Every number comes from the Kubernetes API, metrics-server or Prometheus. If the cluster is unreachable you see an outage, never placeholder data. |
| **Free and open source** | MIT licensed. Built for small teams, startups, homelabs and anyone learning Kubernetes. |

## Features

- **Cluster overview**: nodes, pods, deployments, live CPU/memory (metrics-server) and one hour of history in Prometheus, plus network I/O from node-exporter.
- **Accurate pod status**: statuses match `kubectl get pods` (`CrashLoopBackOff`, `Error`, `OOMKilled`, `ImagePullBackOff`…), with the last termination reason and exit code for every container.
- **Global search**: press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> to find any pod, deployment, service, node or namespace and jump to it.
- **Log viewer**: live tailing with search and severity highlighting, plus the logs of the previous (crashed) run, which is where the error usually is.
- **Alert engine**: rules for CPU, memory, crash loops, pod restarts and NotReady nodes, evaluated every 30 seconds. Each rule has a hold time, alerts resolve themselves when the condition clears, and crash-loop alerts don't flap between restarts.
- **AI SRE copilot**: one-click diagnosis of pods that are failing right now, or questions about the whole cluster. The model sees the pod's status, termination reason, current and previous logs and events, and streams its answer live. If no model is reachable you get an error, not invented text.
- **Grafana**: Prometheus data source and a cluster dashboard, provisioned automatically.
- **Secure by default**: JWT login, hashed passwords, admin-only user creation and a read-only Kubernetes RBAC role.
- **Works everywhere**: responsive layout for desktop, tablet and phone.

## Architecture

```
 Browser ──► nginx (frontend) ──/api──► FastAPI backend ──► Kubernetes API + metrics-server
                                          │   │   └──────► Ollama (local LLM) / Gemini
                                          │   └──────────► PostgreSQL (users, alert rules/events)
                                          └─ /metrics ◄── Prometheus ◄── node-exporter
                                                              ▲
                                                           Grafana
```

See [docs/architecture.md](docs/architecture.md) for details.

## Quickstart (Docker Compose)

Prerequisites: Docker Desktop with Kubernetes enabled (or any cluster in `~/.kube/config`), and optionally
[Ollama](https://ollama.com) with `ollama pull llama3.2`.

1. **Install metrics-server** in the cluster. This is needed for live CPU/memory; Docker Desktop and kind need the insecure-TLS flag:
   ```bash
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   kubectl -n kube-system patch deployment metrics-server --type=json \
     -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
   ```
2. **Configure secrets**: create `backend/.env` (gitignored). Use [.env.example](.env.example) as a reference and set at least:
   ```env
   SECRET_KEY=<output of: openssl rand -hex 32>
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<choose a password>
   GEMINI_API_KEY=            # optional fallback
   ```
3. **Start the stack**:
   ```bash
   docker compose up -d --build
   ```

| Service | URL | Login |
|---|---|---|
| Dashboard | http://localhost:5173 | `ADMIN_USERNAME` / `ADMIN_PASSWORD` |
| API docs (Swagger) | http://localhost:8000/docs | "Authorize" with the same account |
| Grafana | http://localhost:3000 | admin / admin (set `GRAFANA_ADMIN_PASSWORD`) |
| Prometheus | http://localhost:9090 | — |

The backend mounts your kubeconfig read-only. API servers on `127.0.0.1` (Docker Desktop, kind, minikube)
are reached through `host.docker.internal` automatically. Ollama is expected on the host at port 11434.

## Try it with a realistic demo app

An empty cluster makes for a boring dashboard. [demo/shop-demo.yaml](demo/shop-demo.yaml) deploys a small
"shop" (nginx storefront, catalog API, Redis, an order worker that writes logs) into its own `demo`
namespace, with three real, intentional incidents:

| Workload | What happens | What K8sPulse shows |
|---|---|---|
| `payment-service` | A required setting is missing, so it exits on startup | `Error` / `CrashLoopBackOff`, a crash-loop alert, and an AI diagnosis pointing at `PAYMENT_GATEWAY_URL` |
| `inventory-sync` | Memory grows until it passes its 48Mi limit | `OOMKilled` (exit code 137) and a restart alert |
| `report-generator` | Steady CPU work in waves | Real activity in the CPU charts |

```bash
kubectl apply -f demo/shop-demo.yaml     # deploy
kubectl delete namespace demo            # remove everything
```

Within a minute or two the incidents appear in **Pods**, **Alert Center** and **AI SRE Copilot**.

## Deploy to Kubernetes

Images are published to GHCR by CI on every push to `main`.

```bash
cp k8s/secrets.env.example k8s/secrets.env   # fill in real values
kubectl apply -k .
kubectl -n k8spulse get pods
```

The dashboard is exposed on NodePort **30080** and Grafana on **30300**. See [docs/deployment.md](docs/deployment.md).

## Local development

```bash
# Backend (Python 3.11+)
cd backend
python -m venv .venv && .venv/Scripts/activate      # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000           # runs DB migrations on startup

# Frontend (Node 20+)
cd frontend
npm install
npm run dev                                          # http://localhost:5173, proxies /api to :8000
```

Set `AUTH_ENABLED=false` in `backend/.env` to skip the login screen during development.

### Tests

```bash
cd backend && pytest          # isolated SQLite DB, no cluster/Prometheus/LLM needed
cd frontend && npm run build  # type-check + production build
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | dev value | JWT signing key — **change it** |
| `AUTH_ENABLED` | `true` | Require login for data APIs |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin` | Bootstrap admin, created on first start |
| `DATABASE_URL` | SQLite file | `postgresql+asyncpg://…` in Docker/Kubernetes |
| `KUBECONFIG_PATH` | `~/.kube/config` | Kubeconfig to load (`K8S_IN_CLUSTER=true` inside a cluster) |
| `K8S_API_HOST_OVERRIDE` | empty | Reach a `127.0.0.1` API server from a container (set by compose) |
| `DEMO_DATA` | `false` | Serve built-in sample data when no cluster is reachable (tests / offline UI work only) |
| `PROMETHEUS_URL` | `http://localhost:9090` | Prometheus for metric history |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `llama3.2:latest` | Local LLM |
| `OLLAMA_TIMEOUT` / `OLLAMA_NUM_PREDICT` | `300` / `512` | LLM request timeout (s) / max tokens |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | empty / `gemini-2.5-flash` | Cloud LLM fallback |
| `ALERT_EVAL_INTERVAL_SECONDS` | `30` | How often alert rules are evaluated |

## Project structure

```text
├── backend/              FastAPI app, Alembic migrations, tests
├── frontend/             React + Vite + Tailwind UI, nginx template
├── monitoring/           Prometheus config, alert rules, Grafana provisioning + dashboard
├── k8s/                  Kubernetes manifests (assembled by ./kustomization.yaml)
├── demo/                 Demo workload with intentional incidents (shop-demo.yaml)
├── docs/                 Architecture, API, deployment, troubleshooting
├── docker-compose.yml    Local full stack
└── .github/workflows/    CI: backend tests, frontend build, image publishing
```

## License

[MIT](LICENSE)
