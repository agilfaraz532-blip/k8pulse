import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Server,
  Layers,
  Box,
  FileText,
  AlertTriangle,
  Bot,
  RefreshCw,
  Clock,
  ShieldCheck,
  XCircle,
  Search,
  LogOut,
  Menu,
  X,
  Loader2,
  WifiOff,
  Users,
} from 'lucide-react';

import {
  fetchHealth,
  fetchKubernetesHealth,
  fetchPrometheusHealth,
  fetchDatabaseHealth,
  fetchOverview,
  fetchNodes,
  fetchPods,
  fetchDeployments,
  fetchServices,
  fetchNamespaces,
  fetchEvents,
  fetchClusterMetrics,
  fetchAlertRules,
  fetchAlertEvents,
} from './services/api';

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
  ClusterMetricsOverview,
  AlertRule,
  AlertEvent,
} from './types';

import type { IncidentTarget } from './components/AITab';
import { LoginPage } from './components/LoginPage';
import { CommandPalette, SearchTarget } from './components/CommandPalette';
import { LogoMark, Wordmark } from './components/Logo';
import { needsAttention } from './components/status';
import { AUTH_PATHS, navigate, signInPathForLastPortal } from './services/router';
import { AuthUser, UNAUTHORIZED_EVENT, fetchAuthConfig, fetchCurrentUser, fetchUsers, getToken, logout } from './services/api';

// Each tab is its own chunk so the first screen loads less JavaScript
const OverviewTab = lazy(() => import('./components/OverviewTab').then((m) => ({ default: m.OverviewTab })));
const NodesTab = lazy(() => import('./components/NodesTab').then((m) => ({ default: m.NodesTab })));
const PodsTab = lazy(() => import('./components/PodsTab').then((m) => ({ default: m.PodsTab })));
const DeploymentsTab = lazy(() => import('./components/DeploymentsTab').then((m) => ({ default: m.DeploymentsTab })));
const LogsTab = lazy(() => import('./components/LogsTab').then((m) => ({ default: m.LogsTab })));
const AlertsTab = lazy(() => import('./components/AlertsTab').then((m) => ({ default: m.AlertsTab })));
const AITab = lazy(() => import('./components/AITab').then((m) => ({ default: m.AITab })));
const UsersTab = lazy(() => import('./components/UsersTab').then((m) => ({ default: m.UsersTab })));

type TabId = 'overview' | 'nodes' | 'pods' | 'deployments' | 'logs' | 'alerts' | 'ai' | 'users';

const REFRESH_MS = 10000;

export default function App() {
  // undefined = still checking, null = must log in
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { auth_enabled } = await fetchAuthConfig();
        if (!auth_enabled) {
          setUser({ id: 0, username: 'local', email: '', role: 'admin', is_active: true });
        } else if (!getToken()) {
          setUser(null);
        } else {
          setUser(await fetchCurrentUser());
        }
      } catch {
        setUser(getToken() ? undefined : null);
      }
    };
    checkSession();
    const onUnauthorized = () => {
      setUser(null);
      // Back to the sign-in page this person used (user or administrator)
      navigate(signInPathForLastPortal(), { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (user === undefined) {
    return (
      <div className="h-[100dvh] w-screen bg-[#0B0F19] flex flex-col items-center justify-center gap-4 text-slate-400 text-sm font-sans">
        <LogoMark size="lg" />
        <span className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> Connecting to K8sPulse…
        </span>
      </div>
    );
  }
  if (user === null) {
    return (
      <LoginPage
        onLoggedIn={(u) => {
          setUser(u);
          navigate('/', { replace: true });
        }}
      />
    );
  }
  // Signed in but on a sign-in/registration address: show the dashboard at "/"
  if ((Object.values(AUTH_PATHS) as string[]).includes(window.location.pathname)) {
    window.history.replaceState(null, '', '/');
  }
  return <Dashboard user={user} />;
}

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-xs text-slate-500 gap-2">
      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> Loading…
    </div>
  );
}

function Dashboard({ user }: { user: AuthUser }) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [logTarget, setLogTarget] = useState<{ namespace: string; podName: string } | null>(null);
  const [incidentTarget, setIncidentTarget] = useState<IncidentTarget | null>(null);
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isAdmin = user.role === 'admin';
  const [pendingUsers, setPendingUsers] = useState(0);

  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [k8sHealth, setK8sHealth] = useState<KubernetesHealth | null>(null);
  const [promHealth, setPromHealth] = useState<PrometheusHealth | null>(null);
  const [dbHealth, setDbHealth] = useState<DatabaseHealth | null>(null);

  const [overview, setOverview] = useState<ClusterOverview | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [deployments, setDeployments] = useState<DeploymentInfo[]>([]);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([]);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [metrics, setMetrics] = useState<ClusterMetricsOverview | null>(null);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [backendError, setBackendError] = useState<string | null>(null);
  const [clusterError, setClusterError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const loadAllData = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const [h, k8sH, promH, dbH, ov, nd, pd, dep, svc, ns, ev, mt, ar, ae] = await Promise.allSettled([
        fetchHealth(),
        fetchKubernetesHealth(),
        fetchPrometheusHealth(),
        fetchDatabaseHealth(),
        fetchOverview(),
        fetchNodes(),
        fetchPods(),
        fetchDeployments(),
        fetchServices(),
        fetchNamespaces(),
        fetchEvents(),
        fetchClusterMetrics(),
        fetchAlertRules(),
        fetchAlertEvents(),
      ]);

      if (h.status === 'fulfilled') {
        setHealthData(h.value);
        setBackendError(null);
      } else {
        setBackendError(h.reason?.message || 'Backend API unreachable');
      }
      // The backend answers but cannot see the cluster: say so instead of showing stale data as live
      setClusterError(ov.status === 'rejected' ? (ov.reason?.message ?? 'Cluster unavailable').replace(/^API Error \[\d+\]: /, '') : null);

      if (k8sH.status === 'fulfilled') setK8sHealth(k8sH.value);
      if (promH.status === 'fulfilled') setPromHealth(promH.value);
      if (dbH.status === 'fulfilled') setDbHealth(dbH.value);
      if (ov.status === 'fulfilled') setOverview(ov.value);
      if (nd.status === 'fulfilled') setNodes(nd.value);
      if (pd.status === 'fulfilled') setPods(pd.value);
      if (dep.status === 'fulfilled') setDeployments(dep.value);
      if (svc.status === 'fulfilled') setServices(svc.value);
      if (ns.status === 'fulfilled') setNamespaces(ns.value);
      if (ev.status === 'fulfilled') setEvents(ev.value);
      if (mt.status === 'fulfilled') setMetrics(mt.value);
      if (ar.status === 'fulfilled') setAlertRules(ar.value);
      if (ae.status === 'fulfilled') setAlertEvents(ae.value);
    } catch (err: any) {
      setBackendError(err?.message || 'Network error');
    } finally {
      inFlight.current = false;
      setIsLoading(false);
      setLastRefreshed(new Date());
    }
  }, []);

  // Poll while the tab is visible; refresh immediately when the user comes back
  useEffect(() => {
    loadAllData();
    const interval = setInterval(() => {
      if (!document.hidden) loadAllData();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) loadAllData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadAllData]);

  // Admins see how many sign-ups are waiting for approval
  useEffect(() => {
    if (!isAdmin) return;
    const check = () =>
      fetchUsers()
        .then((list) => setPendingUsers(list.filter((u) => u.is_approved === false).length))
        .catch(() => undefined);
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Ctrl/⌘+K opens global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = (tab: TabId) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const handleOpenLogs = (namespace: string, podName: string) => {
    setLogTarget({ namespace, podName });
    navigate('logs');
  };

  const handleAnalyzeAI = (namespace: string, podName: string) => {
    setIncidentTarget({ namespace, podName });
    navigate('ai');
  };

  const handleSearchSelect = (target: SearchTarget) => {
    setSearchTarget({ ...target });
    navigate(target.tab);
  };

  const openAlerts = alertEvents.filter((e) => !e.is_resolved).length;
  const troubledPods = pods.filter(needsAttention).length;

  const navItems: { id: TabId; label: string; icon: typeof Activity; count: string | null; tone?: 'alert' | 'ai' }[] = [
    { id: 'overview', label: 'Cluster Overview', icon: Activity, count: null },
    { id: 'nodes', label: 'Nodes', icon: Server, count: nodes.length ? String(nodes.length) : null },
    { id: 'pods', label: 'Pods', icon: Box, count: pods.length ? String(pods.length) : null, tone: troubledPods ? 'alert' : undefined },
    { id: 'deployments', label: 'Deployments & Services', icon: Layers, count: deployments.length ? String(deployments.length) : null },
    { id: 'logs', label: 'Log Viewer', icon: FileText, count: null },
    { id: 'alerts', label: 'Alert Center', icon: AlertTriangle, count: openAlerts ? String(openAlerts) : null, tone: 'alert' },
    { id: 'ai', label: 'AI SRE Copilot', icon: Bot, count: 'AI', tone: 'ai' },
    ...(isAdmin
      ? [{ id: 'users' as TabId, label: 'Users & Access', icon: Users, count: pendingUsers ? String(pendingUsers) : null, tone: 'alert' as const }]
      : []),
  ];

  const tabSearch = (tab: SearchTarget['tab']) => (searchTarget?.tab === tab ? searchTarget.term : undefined);

  return (
    <div className="flex h-[100dvh] w-screen bg-[#0B0F19] text-slate-100 overflow-hidden font-sans">
      {/* Mobile / tablet backdrop */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* SIDEBAR: static on desktop, slide-in drawer below lg */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 border-r border-slate-800/80 bg-[#0E1322] flex flex-col flex-shrink-0 transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <h1 className="leading-none"><Wordmark /></h1>
              <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-1">Cluster Observability</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Close menu">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active cluster */}
        <div className="p-3 border-b border-slate-800/60">
          <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${clusterError ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'}`} />
              <span className="font-medium text-slate-200 truncate">{overview?.cluster_name ?? (clusterError ? 'Unreachable' : 'Connecting…')}</span>
            </div>
            <span className="text-[10px] bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800 flex-shrink-0">
              {overview?.server_version ?? '—'}
            </span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.count && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : item.tone === 'alert'
                        ? 'bg-rose-950/80 text-rose-400 border border-rose-800/40'
                        : item.tone === 'ai'
                        ? 'bg-purple-950/80 text-purple-300 border border-purple-800/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1 bg-slate-950/40">
          <div className="flex justify-between">
            <span>API server</span>
            <span className="font-mono text-slate-400">v{healthData?.version || '1.0.0'}</span>
          </div>
          <div className="flex justify-between">
            <span>Namespaces</span>
            <span className="font-mono text-cyan-400">{namespaces.length}</span>
          </div>
          {user.username !== 'local' && (
            <div className="flex justify-between items-center pt-1">
              <span className="truncate" title={`${user.full_name || user.username} · ${user.role}`}>
                <span className="text-slate-300">{user.full_name || user.username}</span>
                <span className="ml-1.5 text-[10px] px-1 rounded bg-slate-800 text-slate-400 uppercase">{user.role}</span>
              </span>
              <button onClick={logout} className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                <LogOut className="w-3 h-3" /> Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-slate-800/80 bg-[#0E1322]/80 px-3 sm:px-6 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700/50"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 pl-3 pr-2 py-1.5 w-full max-w-72 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-500 hover:border-slate-600 hover:text-slate-300 transition-colors"
            >
              <Search className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left truncate">Search cluster…</span>
              <kbd className="hidden sm:inline text-[10px] font-mono border border-slate-700 rounded px-1.5 py-0.5">Ctrl K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-mono text-[11px]">
                {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <button
              onClick={loadAllData}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700/50"
              title="Refresh now"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            {backendError ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
                <XCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">API offline</span>
              </span>
            ) : clusterError ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
                <WifiOff className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Cluster unreachable</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                <ShieldCheck className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Cluster connected</span>
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {(backendError || clusterError) && (
            <div className="mb-5 p-4 rounded-xl bg-rose-950/30 border border-rose-900/60 flex items-start gap-3 text-xs text-rose-200">
              <WifiOff className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-100">{backendError ? 'Cannot reach the K8sPulse API' : 'Cannot reach the Kubernetes cluster'}</p>
                <p className="mt-0.5 text-rose-300/90">
                  {backendError ?? clusterError} The data below is from the last successful refresh and retries every {REFRESH_MS / 1000}s.
                </p>
              </div>
            </div>
          )}

          <Suspense fallback={<TabFallback />}>
            {activeTab === 'overview' && (
              <OverviewTab
                overview={overview}
                metrics={metrics}
                health={healthData}
                k8sHealth={k8sHealth}
                promHealth={promHealth}
                dbHealth={dbHealth}
                events={events}
                onNavigate={(tab) => navigate(tab)}
              />
            )}

            {activeTab === 'nodes' && <NodesTab nodes={nodes} initialSearch={tabSearch('nodes')} />}

            {activeTab === 'pods' && (
              <PodsTab
                pods={pods}
                namespaces={namespaces.map((n) => n.name)}
                onOpenLogs={handleOpenLogs}
                onAnalyzeAI={handleAnalyzeAI}
                initialSearch={tabSearch('pods')}
              />
            )}

            {activeTab === 'deployments' && (
              <DeploymentsTab
                deployments={deployments}
                services={services}
                initialSearch={tabSearch('deployments')}
                initialView={searchTarget?.tab === 'deployments' ? searchTarget.view : undefined}
              />
            )}

            {activeTab === 'logs' && (
              <LogsTab pods={pods} initialNamespace={logTarget?.namespace} initialPod={logTarget?.podName} />
            )}

            {activeTab === 'alerts' && (
              <AlertsTab rules={alertRules} events={alertEvents} onRefresh={loadAllData} readOnly={user.role === 'viewer'} />
            )}

            {activeTab === 'users' && isAdmin && <UsersTab currentUser={user} onPendingChange={setPendingUsers} />}

            {activeTab === 'ai' && (
              <AITab pods={pods} incidentTarget={incidentTarget} onIncidentHandled={() => setIncidentTarget(null)} />
            )}
          </Suspense>
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={handleSearchSelect}
        pods={pods}
        deployments={deployments}
        services={services}
        nodes={nodes}
        namespaces={namespaces}
      />
    </div>
  );
}
