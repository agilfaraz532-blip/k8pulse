# K8sPulse — REST API Reference

Base path: `/api`. Interactive docs are at `http://localhost:8000/docs`; use **Authorize** to log in.

Unless marked **public**, endpoints need `Authorization: Bearer <token>` when `AUTH_ENABLED=true`.
Without a valid token they return `401`.

## Authentication

| Method & path | Description |
|---|---|
| `GET /auth/config` **public** | `{"auth_enabled": bool}`; tells the UI whether to show the login screen |
| `POST /auth/login` **public** | JSON `{"username", "password"}` → `{"access_token", "token_type", "expires_in", "user"}` |
| `POST /auth/token` **public** | Same, as an OAuth2 password form (used by Swagger) |
| `GET /auth/me` | The current user |
| `POST /auth/register` | Create a user (`username`, `email`, `password`, `role`: admin/operator/viewer). **Admin only** |

## Health (public)

| Method & path | Description |
|---|---|
| `GET /health` | Overall status plus real subsystem checks (`kubernetes`, `prometheus`, `database`) |
| `GET /health/kubernetes` | API server reachability and whether metrics-server is available |
| `GET /health/prometheus` | Prometheus reachability |
| `GET /health/database` | Runs `SELECT 1` |

`GET /health` (without `/api`) is the liveness probe. `GET /metrics` (without `/api`) is the Prometheus scrape endpoint.

## Cluster

| Method & path | Description |
|---|---|
| `GET /cluster/overview` | Counts, CPU/memory (`usage_source`: `metrics-server` or `requests`), total restarts |
| `GET /cluster/nodes` | Nodes with capacity, conditions, taints, and pod count per node |
| `GET /cluster/pods?namespace=` | Pods with status, restarts, age, and live CPU/memory |
| `GET /cluster/deployments?namespace=` | Deployments |
| `GET /cluster/services?namespace=` | Services |
| `GET /cluster/namespaces` | Namespaces with pod and service counts |
| `GET /cluster/events?namespace=` | The 50 most recent events |
| `GET /cluster/logs?namespace=&pod_name=&container_name=&tail_lines=` | Pod logs |

## Metrics

`GET /metrics/cluster` returns one hour of history at 3-minute steps from Prometheus:
- Series: `cpu_usage_percent`, `memory_usage_percent`, `network_rx_kbps`, `network_tx_kbps`, `pod_restarts`.
- Gaps where Prometheus has no sample are `null`.
- `available`, `network_available` and `message` explain missing data.

## Alerts

| Method & path | Description |
|---|---|
| `GET /alerts/rules` | All rules |
| `POST /alerts/rules` | Create a rule (fields below) |
| `PATCH /alerts/rules/{id}` | Update any fields, e.g. `{"is_enabled": false}` |
| `DELETE /alerts/rules/{id}` | Delete a rule |
| `POST /alerts/evaluate` | Evaluate all rules now → `{"opened_events": n}` |
| `GET /alerts/events` | The 200 most recent events, newest first |
| `POST /alerts/events/{id}/resolve` | Resolve an event manually |

Rule fields:
- `name`
- `metric_type`: `cpu_percent`, `memory_percent`, `pod_restarts`, `crashloop` or `node_unready`
- `condition`: `gt`, `lt` or `eq`
- `threshold`
- `severity`: `critical`, `warning` or `info`
- `duration_seconds`: how long the condition must hold before an event opens
- `is_enabled`

## AI copilot

| Method & path | Description |
|---|---|
| `POST /ai/explain-cluster` | Body `{"custom_question"?}` → the full analysis once generation finishes |
| `POST /ai/explain-cluster/stream` | Same, streamed as NDJSON |
| `POST /ai/analyze-incident` | Body `{"namespace", "pod_name", "container_name"?, "tail_lines"?}` |
| `POST /ai/analyze-incident/stream` | Same, streamed as NDJSON |

Stream events, one JSON object per line:
1. `{"type":"meta", "title", "severity", "summary", ...}`
2. `{"type":"token","text":"..."}`, repeated
3. `{"type":"done","model_used","suggested_commands","notice"?}`

If no real answer can be produced (no cluster, no reachable model), the stream ends with
`{"type":"error","message"}`. The non-streaming endpoints return `503` instead.
