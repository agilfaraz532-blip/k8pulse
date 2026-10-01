# K8sPulse - System Architecture

## Architecture Diagram

```mermaid
flowchart TD
    subgraph UI ["User Interface (React + Vite)"]
        OV["Cluster Overview"]
        ND["Nodes Inventory"]
        PD["Pods Table"]
        DP["Deployments & Services"]
        LG["Terminal Log Streamer"]
        AL["Alert Center"]
        AI["Gemini SRE Copilot"]
    end

    subgraph BackendGateway ["FastAPI Observability Gateway"]
        API["REST Endpoints (/api/v1/*)"]
        AuthLayer["JWT / RBAC Security"]
        K8sEngine["K8s Client Driver"]
        PromQL["Prometheus Query Engine"]
        AlertEvaluator["Alert Rules Engine"]
        GeminiAdapter["Gemini SRE Diagnostics"]
    end

    subgraph Observability ["Observability & Persistence"]
        PG[(PostgreSQL 16)]
        PromTSDB[(Prometheus TSDB)]
        Grafana[(Grafana Dashboard)]
    end

    subgraph TargetCluster ["Kubernetes Cluster (kind / minikube)"]
        APIServer["kube-apiserver"]
        WorkerNodes["Cluster Worker Nodes"]
    end

    UI <-->|HTTP JSON| API
    API --> AuthLayer <--> PG
    API --> AlertEvaluator <--> PG
    API --> PromQL <--> PromTSDB
    API --> K8sEngine <--> APIServer
    API --> GeminiAdapter <--> GoogleAI["Google Gemini 1.5 Flash"]
    PromTSDB --> Grafana
    APIServer --> WorkerNodes
```

## Core Subsystems

### 1. Frontend Client
- **Framework**: React 18, TypeScript, Vite, Tailwind CSS.
- **Charts**: Recharts Area & Line charts for PromQL telemetry.
- **Polling Strategy**: 10-second background polling for cluster resources, 3-second live streaming for pod logs.

### 2. FastAPI Observability Backend
- **Framework**: FastAPI (ASGI), Pydantic v2 Settings & Schemas.
- **Resilience**: Operates in live Kubernetes cluster mode or automated fallback diagnostic mode so development never halts.
- **Security**: OAuth2 Bearer JWT tokens, bcrypt password hashing, non-root containers.

### 3. Metric Telemetry (Prometheus & PromQL)
- Ingests CPU utilization, memory working sets, network RX/TX rates, and container restarts.

### 4. Gemini AI Copilot
- Translates cluster warnings, resource starvation, and CrashLoopBackOff container logs into human-readable diagnoses with actionable `kubectl` remediation commands.
