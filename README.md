# K8sPulse - Kubernetes Monitoring Dashboard

A production-grade, full-stack Kubernetes observability and cluster operations dashboard designed for Cloud-Native and DevOps engineers.

---

## Architecture

```
                                  +-------------------+
                                  |   React + Vite    |
                                  |  (TypeScript+UI)  |
                                  +---------+---------+
                                            |
                                            | HTTP / REST
                                            v
                                  +---------+---------+
                                  |  FastAPI Backend  |
                                  +----+----+----+----+
                                       |    |    |
        +------------------------------+    |    +-----------------------------+
        |                                   |                                  |
        v                                   v                                  v
+---------------+                   +---------------+                  +---------------+
|   K8s API     |                   |  Prometheus   |                  | Google Gemini |
|   Cluster     |                   | Metrics (TSDB)|                  | AI Diagnostics|
+---------------+                   +---------------+                  +---------------+
```

---

## Features

- **Cluster Health & Inventory**: Real-time visibility into Nodes, Pods, Deployments, Services, and Namespaces.
- **Resource Utilization**: CPU, Memory, and Network telemetry powered by Prometheus PromQL queries.
- **Pod & Log Diagnostics**: Live pod logs streaming, severity highlighting, search/filter, and auto-scroll.
- **AI-Powered Root Cause Analysis**: Incident explanations and cluster health summaries powered by Google Gemini API.
- **Configurable Alerting**: Detection of `CrashLoopBackOff`, High CPU/Memory thresholds, and unready nodes.
- **Zero Paid Dependencies**: Built to run entirely on local free tools (Docker Desktop / WSL2, kind / Minikube, Prometheus, PostgreSQL).

---

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts
- **Backend**: Python 3.10+, FastAPI, Uvicorn, Pydantic v2, Official Kubernetes Python Client, HTTPX
- **Data & Observability**: PostgreSQL / SQLite, Prometheus, Grafana
- **AI**: Google Gemini API (`@google/genai` / `google-generativeai`)
- **DevOps**: Docker, Docker Compose, Kubernetes manifests (`k8s/`), GitHub Actions

---

## Quickstart (Local Development)

### 1. Prerequisites
Ensure you have the following installed:
- **Node.js**: v18+ (`node -v`)
- **Python**: v3.10+ (`python --version`)
- **Docker Desktop** (optional for Phase 1, recommended for full stack)

### 2. Backend Setup
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
Swagger UI API documentation will be available at: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The web dashboard will be available at: `http://localhost:5173`

---

## Project Structure

```text
k8s-monitoring-dashboard/
├── frontend/             # React + Vite + Tailwind CSS Frontend
├── backend/              # FastAPI + Kubernetes + Prometheus Backend
├── database/             # Migrations & Database Schemas
├── k8s/                  # Kubernetes Deployments & Service Manifests
├── monitoring/           # Prometheus config & Alert Rules
├── docker-compose.yml    # Multi-container local orchestration
├── .env.example          # Environment variables template
└── README.md             # Project documentation
```
