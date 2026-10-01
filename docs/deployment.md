# K8sPulse - Deployment Guide

## 1. Local Development (Windows / WSL2 / Linux)

### Backend:
```bash
cd backend
python -m venv .venv
# On Windows PowerShell:
.venv\Scripts\activate
# On Linux / WSL2:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## 2. Docker Compose Deployment

Run the complete multi-container stack (Frontend, Backend, PostgreSQL, Prometheus, Grafana) locally with a single command:

```bash
docker compose up --build -d
```

### Endpoints:
- **Web UI**: `http://localhost:5173` or `http://localhost:80`
- **FastAPI API & Docs**: `http://localhost:8000/docs`
- **Prometheus UI**: `http://localhost:9090`
- **Grafana Dashboard**: `http://localhost:3000` (User: `admin` / Pass: `admin`)
- **PostgreSQL**: `localhost:5432` (DB: `k8spulse_db`)

---

## 3. Kubernetes Deployment (kind / Minikube / Cloud)

### 1. Create a local cluster (if using kind):
```bash
kind create cluster --name k8spulse-cluster
```

### 2. Apply all Kubernetes manifests:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/prometheus/
kubectl apply -f k8s/grafana/
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
```

### 3. Verify Deployment:
```bash
kubectl get pods -n k8spulse
```

### 4. Access UI:
```bash
kubectl port-forward -n k8spulse svc/k8spulse-frontend 5173:80
```
Then navigate to `http://localhost:5173`.
