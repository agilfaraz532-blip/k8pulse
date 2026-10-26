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

/**
 * Where the backend lives. Empty (default) = same origin, proxied by nginx or the Vite dev server.
 * For a split deployment (e.g. dashboard on Vercel, backend behind a tunnel) set VITE_API_URL at build
 * time, e.g. VITE_API_URL=https://k8pulse.ngrok.app
 */
export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const API_BASE = `${API_ORIGIN}/api`;

/** Headers sent on every API call. ngrok's free tier shows a browser warning page unless this is set. */
function baseHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (API_ORIGIN) headers.set('ngrok-skip-browser-warning', 'true');
  return headers;
}

/** fetch() against the API with the shared headers (used where no auth token is involved). */
function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, headers: baseHeaders(init.headers) });
}
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
  const headers = baseHeaders(init.headers);
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
    const error = new Error(errorDetail) as Error & { status?: number };
    error.status = res.status;
    throw error;
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
  full_name?: string | null;
  is_active: boolean;
  is_approved?: boolean;
  created_at?: string | null;
}

export type SignupMode = 'approval' | 'open' | 'disabled';

export type Portal = 'user' | 'admin';

export async function fetchAuthConfig(): Promise<{ auth_enabled: boolean; signup_mode?: SignupMode; admin_signup_enabled?: boolean }> {
  return handleResponse(await apiFetch(`${API_BASE}/auth/config`));
}

export interface SignupForm {
  full_name: string;
  username: string;
  email: string;
  password: string;
}

/** Self-service registration; status is "active" (can sign in now) or "pending" (needs admin approval). */
export async function signup(
  form: SignupForm & { registration_key?: string },
  portal: Portal = 'user',
): Promise<{ status: 'active' | 'pending'; message: string }> {
  const res = await apiFetch(`${API_BASE}/auth/${portal === 'admin' ? 'admin/signup' : 'signup'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
  if (res.status === 422) {
    // Pydantic validation errors: surface the first human-readable message
    const data = await res.json().catch(() => null);
    const first = Array.isArray(data?.detail) ? data.detail[0] : null;
    const msg = first?.msg ? String(first.msg).replace(/^Value error, /, '') : 'Please check the form';
    const field = first?.loc?.[first.loc.length - 1];
    throw new Error(field === 'email' ? 'Enter a valid email address' : msg);
  }
  return handleResponse(res);
}

export async function fetchUsers(): Promise<AuthUser[]> {
  return handleResponse<AuthUser[]>(await authFetch(`${API_BASE}/auth/users`));
}

export async function updateUser(
  userId: number,
  changes: Partial<Pick<AuthUser, 'role' | 'is_active' | 'is_approved'>>,
): Promise<AuthUser> {
  return handleResponse<AuthUser>(await authFetch(`${API_BASE}/auth/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  }));
}

export async function login(username: string, password: string, portal?: Portal): Promise<AuthUser> {
  const data = await handleResponse<{ access_token: string; user: AuthUser }>(
    await authFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, portal }),
    }),
  );
  try {
    // Remember which sign-in page was used, so logout returns there
    if (portal) localStorage.setItem('k8spulse.portal', portal);
  } catch {
    // storage unavailable
  }
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
