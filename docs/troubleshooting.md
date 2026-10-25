# K8sPulse — Troubleshooting

### The dashboard shows the login screen and my password doesn't work
The admin account is created **once**, the first time the backend starts, from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
Changing the variables later does not change an existing account's password.
- To reset it, delete the user row (`docker exec -it k8spulse-postgres psql -U postgres k8spulse_db -c "delete from users where username='admin';"`) and restart the backend.
- For local development, set `AUTH_ENABLED=false`.

### "Cannot reach the Kubernetes cluster" banner / cluster endpoints return 503
No kubeconfig could be loaded, or the API server is down. Check the backend logs (`docker logs k8spulse-backend`):
- **Docker Compose:** `~/.kube/config` must exist on the host (or set `KUBECONFIG_HOST_PATH`).
- **API server on `127.0.0.1`:** look for `Kubernetes API host rewritten to https://host.docker.internal:<port>`.
- **TLS errors:** the API server certificate must include `localhost` in its SANs. Docker Desktop, kind and minikube do.

### CPU/memory charts say "install metrics-server"
`kubectl top nodes` must work. Install metrics-server with `--kubelet-insecure-tls` (see [deployment.md](deployment.md)).
If the pod is stuck in `ImagePullBackOff`, your network can't reach `registry.k8s.io`. Retry later, or pull through a mirror.

### Network chart says "node-exporter is not being scraped"
Open http://localhost:9090/targets. The `node-exporter` target must be **UP**.
- **Docker Compose:** node-exporter runs with host networking and Prometheus reaches it via `172.29.0.1:9100`.
- **Subnet conflict:** if another network already uses `172.29.0.0/16`, change the subnet in `docker-compose.yml` and the target in `monitoring/prometheus.yml` together.

### AI copilot shows an error instead of an answer
This is intentional: no canned answers are generated. The message says what failed:
- **Ollama not reachable:** run `ollama serve` and `ollama pull llama3.2`. Then check from the container: `docker exec k8spulse-backend python -c "import httpx;print(httpx.get('http://host.docker.internal:11434/api/tags').status_code)"`.
- **Slow answers on CPU-only machines:** the first answer takes ~30–60s while the model loads. Text then streams in. Lower `OLLAMA_NUM_PREDICT` for shorter answers.
- **Gemini fallback fails:** check `GEMINI_API_KEY` (keys from Google AI Studio start with `AIza`) and that your network can reach `generativelanguage.googleapis.com`.

### 502 Bad Gateway from the frontend
The backend container is starting or crashed. Run `docker logs k8spulse-backend`.
nginx re-resolves the backend every 10s, so a recreated backend container is picked up automatically.

### No alerts appear
- Alerts appear only after a condition holds for the rule's **For** duration. Use **Evaluate now** in the Alert Center to run the rules immediately.
- Disabled rules are not evaluated.
- Without a cluster connection, the engine does nothing.
