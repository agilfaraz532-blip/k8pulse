import {
  HealthResponse,
  KubernetesHealth,
  PrometheusHealth,
  DatabaseHealth,
  ClusterOverview,
  NodeInfo,
  PodInfo,
  DeploymentInfo,
  ServiceInfo,
  NamespaceInfo,
  EventInfo,
  PodLogsResponse,
  ClusterMetricsOverview,
  AlertRule,
  AlertEvent,
  AIAnalysisResponse,
} from '../types';

const API_BASE = '/api';
const TOKEN_KEY = 'k8spulse.token';

/** Fired when the backend rejects the stored token; App listens and shows the login screen. */
export const UNAUTHORIZED_EVENT = 'k8spulse:unauthorized';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode); the session just won't persist
  }
}

async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && !input.includes('/auth/login')) {
    setToken(null);
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  return res;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const data = await res.json();
      if (data.detail) errorDetail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch {}
    throw new Error(`API Error [${res.status}]: ${errorDetail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Authentication
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
}

export async function fetchAuthConfig(): Promise<{ auth_enabled: boolean }> {
  return handleResponse(await fetch(`${API_BASE}/auth/config`));
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const data = await handleResponse<{ access_token: string; user: AuthUser }>(
    await authFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  setToken(data.access_token);
  return data.user;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return handleResponse<AuthUser>(await authFetch(`${API_BASE}/auth/me`));
}

export function logout(): void {
  setToken(null);
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

// Health Checks
export async function fetchHealth(): Promise<HealthResponse> {
  return handleResponse<HealthResponse>(await authFetch(`${API_BASE}/health`));
}

export async function fetchKubernetesHealth(): Promise<KubernetesHealth> {
  return handleResponse<KubernetesHealth>(await authFetch(`${API_BASE}/health/kubernetes`));
}

export async function fetchPrometheusHealth(): Promise<PrometheusHealth> {
  return handleResponse<PrometheusHealth>(await authFetch(`${API_BASE}/health/prometheus`));
}

export async function fetchDatabaseHealth(): Promise<DatabaseHealth> {
  return handleResponse<DatabaseHealth>(await authFetch(`${API_BASE}/health/database`));
}

// Cluster Operations
export async function fetchOverview(): Promise<ClusterOverview> {
  return handleResponse<ClusterOverview>(await authFetch(`${API_BASE}/cluster/overview`));
}

export async function fetchNodes(): Promise<NodeInfo[]> {
  return handleResponse<NodeInfo[]>(await authFetch(`${API_BASE}/cluster/nodes`));
}

export async function fetchPods(namespace?: string): Promise<PodInfo[]> {
  const url = namespace ? `${API_BASE}/cluster/pods?namespace=${encodeURIComponent(namespace)}` : `${API_BASE}/cluster/pods`;
  return handleResponse<PodInfo[]>(await authFetch(url));
}

export async function fetchDeployments(namespace?: string): Promise<DeploymentInfo[]> {
  const url = namespace ? `${API_BASE}/cluster/deployments?namespace=${encodeURIComponent(namespace)}` : `${API_BASE}/cluster/deployments`;
  return handleResponse<DeploymentInfo[]>(await authFetch(url));
}

export async function fetchServices(namespace?: string): Promise<ServiceInfo[]> {
  const url = namespace ? `${API_BASE}/cluster/services?namespace=${encodeURIComponent(namespace)}` : `${API_BASE}/cluster/services`;
  return handleResponse<ServiceInfo[]>(await authFetch(url));
}

export async function fetchNamespaces(): Promise<NamespaceInfo[]> {
  return handleResponse<NamespaceInfo[]>(await authFetch(`${API_BASE}/cluster/namespaces`));
}

export async function fetchEvents(namespace?: string): Promise<EventInfo[]> {
  const url = namespace ? `${API_BASE}/cluster/events?namespace=${encodeURIComponent(namespace)}` : `${API_BASE}/cluster/events`;
  return handleResponse<EventInfo[]>(await authFetch(url));
}

export async function fetchPodLogs(
  namespace: string,
  podName: string,
  containerName?: string,
  tailLines: number = 100,
  previous: boolean = false,
): Promise<PodLogsResponse> {
  let url = `${API_BASE}/cluster/logs?namespace=${encodeURIComponent(namespace)}&pod_name=${encodeURIComponent(podName)}&tail_lines=${tailLines}`;
  if (containerName) {
    url += `&container_name=${encodeURIComponent(containerName)}`;
  }
  if (previous) url += '&previous=true';
  return handleResponse<PodLogsResponse>(await authFetch(url));
}

// Prometheus Telemetry
export async function fetchClusterMetrics(): Promise<ClusterMetricsOverview> {
  return handleResponse<ClusterMetricsOverview>(await authFetch(`${API_BASE}/metrics/cluster`));
}

// Alerts & Anomaly
export async function fetchAlertRules(): Promise<AlertRule[]> {
  return handleResponse<AlertRule[]>(await authFetch(`${API_BASE}/alerts/rules`));
}

export async function createAlertRule(rule: Partial<AlertRule>): Promise<AlertRule> {
  return handleResponse<AlertRule>(await authFetch(`${API_BASE}/alerts/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  }));
}

export async function updateAlertRule(ruleId: number, changes: Partial<AlertRule>): Promise<AlertRule> {
  return handleResponse<AlertRule>(await authFetch(`${API_BASE}/alerts/rules/${ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  }));
}

export async function deleteAlertRule(ruleId: number): Promise<void> {
  return handleResponse<void>(await authFetch(`${API_BASE}/alerts/rules/${ruleId}`, { method: 'DELETE' }));
}

export async function evaluateAlerts(): Promise<{ opened_events: number }> {
  return handleResponse(await authFetch(`${API_BASE}/alerts/evaluate`, { method: 'POST' }));
}

export async function fetchAlertEvents(): Promise<AlertEvent[]> {
  return handleResponse<AlertEvent[]>(await authFetch(`${API_BASE}/alerts/events`));
}

export async function resolveAlertEvent(eventId: number): Promise<AlertEvent> {
  return handleResponse<AlertEvent>(await authFetch(`${API_BASE}/alerts/events/${eventId}/resolve`, {
    method: 'POST',
  }));
}

// AI Copilot (local Ollama, Gemini fallback)
export async function explainClusterHealth(customQuestion?: string): Promise<AIAnalysisResponse> {
  return handleResponse<AIAnalysisResponse>(await authFetch(`${API_BASE}/ai/explain-cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_question: customQuestion }),
  }));
}

export async function analyzeIncident(namespace: string, podName: string, containerName?: string): Promise<AIAnalysisResponse> {
  return handleResponse<AIAnalysisResponse>(await authFetch(`${API_BASE}/ai/analyze-incident`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace, pod_name: podName, container_name: containerName }),
  }));
}

export type AIStreamEvent =
  | ({ type: 'meta'; engine: string } & Omit<AIAnalysisResponse, 'root_cause_analysis' | 'model_used'>)
  | { type: 'token'; text: string }
  | { type: 'done'; model_used: string; suggested_commands: string[]; notice?: string }
  | { type: 'error'; message: string };

export type AIStreamTarget =
  | { kind: 'cluster'; question?: string }
  | { kind: 'incident'; namespace: string; podName: string; containerName?: string };

/** Streams an AI analysis as NDJSON events so text appears while the model is still generating. */
export async function streamAIAnalysis(
  target: AIStreamTarget,
  onEvent: (event: AIStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const [path, body] =
    target.kind === 'cluster'
      ? ['explain-cluster', { custom_question: target.question || undefined }]
      : ['analyze-incident', { namespace: target.namespace, pod_name: target.podName, container_name: target.containerName }];

  const res = await authFetch(`${API_BASE}/ai/${path}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    await handleResponse(res);
    throw new Error('AI stream returned no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as AIStreamEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as AIStreamEvent);
}
