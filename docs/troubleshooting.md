# K8sPulse - Troubleshooting Guide

## Common Scenarios & Resolutions

### 1. "Backend Disconnected" Indicator in UI
- **Cause**: FastAPI server is not running or port 8000 is blocked.
- **Fix**: Check `uvicorn app.main:app --port 8000` is active. Check `http://localhost:8000/api/health` directly in the browser.

### 2. "Prometheus Unavailable"
- **Cause**: Prometheus container or daemon is not running on port 9090.
- **Behavior**: K8sPulse seamlessly falls back to Kubernetes Metrics API and simulated metrics so that graphs never crash.
- **Fix**: Run `docker compose up -d prometheus` or start Prometheus.

### 3. CrashLoopBackOff Pods Detected
- **Diagnosis**: Click **AI Triage** on the pod row in the Pods tab or navigate to the **Gemini SRE Copilot** tab.
- **Action**: Check `kubectl logs <pod> -c <container> --previous` to identify unhandled exceptions or missing database credentials.

### 4. Kubernetes Cluster Unreachable
- **Behavior**: K8sPulse detects lack of active kubeconfig and operates in simulated diagnostic mode so all UI controls and testing work seamlessly.
- **Fix**: Ensure `kubectl get nodes` succeeds in your terminal, or set `KUBECONFIG_PATH=/path/to/kubeconfig` in `.env`.
