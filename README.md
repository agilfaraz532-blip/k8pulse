# K8sPulse — Kubernetes Monitoring Dashboard

Full-stack Kubernetes observability dashboard with AI-assisted incident analysis. It reads your
cluster live through the Kubernetes API and metrics-server, stores history in Prometheus, raises
alerts from configurable rules, and explains problems with a local LLM (Ollama) or Google Gemini.

![stack](https://img.shields.io/badge/stack-FastAPI%20%7C%20React%20%7C%20Prometheus%20%7C%20Grafana-0891b2)
![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **Cluster inventory** — nodes, pods, deployments, services, namespaces and events, read live from the Kubernetes API.
- **Resource usage** — live CPU/memory from metrics-server, with one hour of history in Prometheus. Network I/O comes from node-exporter.
- **Pod logs** — log viewer with search and severity highlighting.
- **Alert engine** — rules for CPU, memory, failing pods (CrashLoopBackOff/ImagePullBackOff), pod restarts and NotReady nodes. Each rule has a hold time ("for N seconds"); alerts open when the condition holds that long and resolve themselves when it clears.
- **AI SRE copilot** — streams an analysis of the live cluster or of a single pod. Ollama runs locally first, with Gemini as a fallback. No canned answers: if no model is reachable you get an error, not fake text.
- **Grafana** — Prometheus data source and a cluster dashboard, set up automatically.
- **Authentication** — JWT login, admin bootstrap account, admin-only user registration.

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
├── docs/                 Architecture, API, deployment, troubleshooting
├── docker-compose.yml    Local full stack
└── .github/workflows/    CI: backend tests, frontend build, image publishing
```

## License

[MIT](LICENSE)
