# K8sPulse - REST API Reference

The K8sPulse backend exposes OpenAPI v3 compliant REST endpoints. When running locally, explore interactive Swagger UI at:
`http://localhost:8000/docs`

---

## 1. Health & Readiness

### `GET /api/health`
Returns overall system status and uptime.

### `GET /api/health/kubernetes`
Returns connectivity details to the target Kubernetes cluster API.

### `GET /api/health/prometheus`
Returns reachability of the Prometheus time-series database.

### `GET /api/health/database`
Returns PostgreSQL / SQLite connection pool status.

---

## 2. Kubernetes Cluster Operations

### `GET /api/cluster/overview`
Returns high-level cluster KPIs (total/ready nodes, total/running pods, deployments, CPU/Memory percentages).

### `GET /api/cluster/nodes`
Returns list of nodes, kubelet version, internal IPs, conditions, labels, taints, capacity, and allocatable resources.

### `GET /api/cluster/pods`
Query Params: `namespace` (optional)
Returns pod inventory with ready ratios, restart counts, IPs, node assignments, and container statuses.

### `GET /api/cluster/deployments`
Query Params: `namespace` (optional)
Returns deployment replica status (`desired`, `ready`, `available`, `updated`) and container images.

### `GET /api/cluster/services`
Query Params: `namespace` (optional)
Returns service types, ClusterIPs, ports, and label selectors.

### `GET /api/cluster/events`
Query Params: `namespace` (optional)
Returns recent cluster events, reason codes, involved objects, and messages.

### `GET /api/cluster/logs`
Query Params: `namespace`, `pod_name`, `container_name`, `tail_lines`
Returns streamed pod log lines.

---

## 3. Metrics & Telemetry

### `GET /api/metrics/cluster`
Returns time-series arrays for CPU usage %, Memory usage %, and Network RX/TX KB/s.

---

## 4. Alert Management

### `GET /api/alerts/rules`
Lists configured threshold rules.

### `POST /api/alerts/rules`
Creates a new threshold rule.

### `GET /api/alerts/events`
Lists triggered alert incidents.

### `POST /api/alerts/events/{id}/resolve`
Marks an alert incident as resolved.

---

## 5. Google Gemini AI Diagnostics

### `POST /api/ai/explain-cluster`
Generates an executive diagnosis of cluster health and operational recommendations.

### `POST /api/ai/analyze-incident`
Performs deep incident triage on crashed or failing pods (`CrashLoopBackOff`, `OOMKilled`).
