# K8sPulse — Deployment Guide

## Prerequisite: metrics-server

Live CPU/memory usage and the CPU/memory charts need metrics-server in the monitored cluster:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# Docker Desktop / kind / minikube use self-signed kubelet certificates:
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl top nodes   # should print usage after ~30s
```

Without it, the dashboard still works. It shows resource *requests* instead of usage, and the history charts say so.

## 1. Docker Compose (recommended for local use)

```bash
# backend/.env (gitignored): at least SECRET_KEY and ADMIN_PASSWORD
docker compose up -d --build
docker compose ps
```

| Service | Port | Notes |
|---|---|---|
| frontend (nginx) | 5173, 80 | Dashboard; proxies `/api` to the backend |
| backend (FastAPI) | 8000 | Runs migrations on start; mounts `~/.kube/config` read-only |
| postgres | 5432 | Volume `postgres_data` |
| prometheus | 9090 | Scrapes the backend `/metrics` and node-exporter; 15 days retention |
| node-exporter | 9100 (host network) | Reached from Prometheus via the network gateway `172.29.0.1` |
| grafana | 3000 | Datasource and "K8sPulse - Cluster Overview" dashboard provisioned |

Notes:
- **Kubeconfig:** set `KUBECONFIG_HOST_PATH` if your kubeconfig isn't at `~/.kube/config`.
- **Local API servers:** for a server on `127.0.0.1` (Docker Desktop, kind), the backend connects to `host.docker.internal` and verifies TLS against `localhost` (`K8S_API_HOST_OVERRIDE`).
- **Ollama:** must run on the host, `ollama serve` on port 11434. Override with `OLLAMA_BASE_URL`.

Upgrade with `docker compose up -d --build`. Data is kept in named volumes. `docker compose down -v` deletes it.

## 2. Kubernetes

### Images
`.github/workflows/docker-build.yml` builds both images on every PR and pushes them on every push to `main`:
- `ghcr.io/agilfaraz532-blip/k8pulse-backend:latest` (and `:<git sha>`)
- `ghcr.io/agilfaraz532-blip/k8pulse-frontend:latest` (and `:<git sha>`)

GHCR packages start out **private**. Do one of the following:
- Make them public: GitHub → your profile → *Packages* → package → *Package settings* → *Change visibility*.
- Or create a pull secret and add `imagePullSecrets` to the deployments:
  ```bash
  kubectl -n k8spulse create secret docker-registry ghcr \
    --docker-server=ghcr.io --docker-username=<user> --docker-password=<PAT with read:packages>
  ```

To pin a release, change `newTag` under `images:` in [kustomization.yaml](../kustomization.yaml) to a commit SHA.

### Deploy

```bash
cp k8s/secrets.env.example k8s/secrets.env   # edit: SECRET_KEY, ADMIN_PASSWORD, POSTGRES_PASSWORD, DATABASE_URL, ...
kubectl apply -k .
kubectl -n k8spulse rollout status deployment/k8spulse-backend
kubectl -n k8spulse get pods
```

What gets deployed (namespace `k8spulse`):
- **backend**: 1 replica, because the alert engine runs in-process. An init container runs `alembic upgrade head`. It uses the `k8spulse-viewer-sa` service account, with read-only ClusterRole access to core, apps and metrics.k8s.io.
- **frontend**: 2 replicas, NodePort **30080**.
- **postgres**: 2Gi PersistentVolumeClaim.
- **prometheus**: config and alert rules generated from `k8s/prometheus/prometheus.yml` and `monitoring/alert-rules.yml`.
- **node-exporter**: DaemonSet, discovered through a headless service.
- **grafana**: NodePort **30300**, with the dashboard from `monitoring/grafana/dashboards/`.

Access:
- Dashboard: `http://localhost:30080`. If NodePorts aren't exposed, use `kubectl -n k8spulse port-forward svc/k8spulse-frontend 8080:80`.
- Grafana: `kubectl -n k8spulse port-forward svc/k8spulse-grafana 3000:3000`.

Ollama is not deployed in the cluster. `OLLAMA_BASE_URL` in `k8s/configmap.yaml` defaults to
`http://host.docker.internal:11434`, which works on Docker Desktop. Elsewhere, point it at an Ollama service,
or set `GEMINI_API_KEY` in `k8s/secrets.env`.

### Remove

```bash
kubectl delete -k .
```

## 3. Local development without containers

```bash
cd backend && python -m venv .venv && .venv/Scripts/activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

SQLite (`backend/k8spulse_dev.db`) is used by default. Prometheus charts stay empty unless `PROMETHEUS_URL`
points at a Prometheus that scrapes this backend.
