import { useState, useEffect } from 'react';
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
  Radio,
  Search,
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

import { OverviewTab } from './components/OverviewTab';
import { NodesTab } from './components/NodesTab';
import { PodsTab } from './components/PodsTab';
import { DeploymentsTab } from './components/DeploymentsTab';
import { LogsTab } from './components/LogsTab';
import { AlertsTab } from './components/AlertsTab';
import { AITab, IncidentTarget } from './components/AITab';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'nodes' | 'pods' | 'deployments' | 'logs' | 'alerts' | 'ai'>('overview');
  const [logTarget, setLogTarget] = useState<{ namespace: string; podName: string } | null>(null);
  const [incidentTarget, setIncidentTarget] = useState<IncidentTarget | null>(null);

  // State
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

  const loadAllData = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const [
        h,
        k8sH,
        promH,
        dbH,
        ov,
        nd,
        pd,
        dep,
        svc,
        ns,
        ev,
        mt,
        ar,
        ae,
      ] = await Promise.allSettled([
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

      if (h.status === 'fulfilled') setHealthData(h.value);
      else setBackendError(h.reason?.message || 'Backend API unreachable');

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
      setIsLoading(false);
      setLastRefreshed(new Date());
    }
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenLogs = (namespace: string, podName: string) => {
    setLogTarget({ namespace, podName });
    setActiveTab('logs');
  };

  const handleAnalyzeAI = (namespace: string, podName: string) => {
    setIncidentTarget({ namespace, podName });
    setActiveTab('ai');
  };

  const navItems = [
    { id: 'overview', label: 'Cluster Overview', icon: Activity, count: null },
    { id: 'nodes', label: 'Nodes', icon: Server, count: nodes.length ? String(nodes.length) : null },
    { id: 'pods', label: 'Pods', icon: Box, count: pods.length ? String(pods.length) : null },
    { id: 'deployments', label: 'Deployments & Services', icon: Layers, count: deployments.length ? String(deployments.length) : null },
    { id: 'logs', label: 'Terminal Log Viewer', icon: FileText, count: null },
    { id: 'alerts', label: 'Alert Center', icon: AlertTriangle, count: alertEvents.filter((e) => !e.is_resolved).length ? String(alertEvents.filter((e) => !e.is_resolved).length) : null },
    { id: 'ai', label: 'AI SRE Copilot', icon: Bot, count: 'AI' },
  ];

  return (
    <div className="flex h-screen w-screen bg-[#0B0F19] text-slate-100 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-slate-800/80 bg-[#0E1322] flex flex-col flex-shrink-0">
        {/* Branding */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-800/80">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-wide text-white flex items-center gap-1.5">
              K8s<span className="text-cyan-400">Pulse</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Cluster Observability</p>
          </div>
        </div>

        {/* Active Cluster Badge */}
        <div className="p-3 border-b border-slate-800/60">
          <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium text-slate-200 truncate max-w-[110px]">
                {overview?.cluster_name ?? 'Loading cluster...'}
              </span>
            </div>
            <span className="text-[10px] bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800">
              {overview?.server_version ?? '—'}
            </span>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.count && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : item.id === 'alerts'
                        ? 'bg-rose-950/80 text-rose-400 border border-rose-800/40'
                        : item.id === 'ai'
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

        {/* System Footnote */}
        <div className="p-3 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1 bg-slate-950/40">
          <div className="flex justify-between">
            <span>FastAPI Server:</span>
            <span className="font-mono text-slate-400">v{healthData?.version || '1.0.0'}</span>
          </div>
          <div className="flex justify-between">
            <span>Namespaces:</span>
            <span className="font-mono text-cyan-400">{namespaces.length || 5}</span>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOPBAR */}
        <header className="h-16 border-b border-slate-800/80 bg-[#0E1322]/80 backdrop-blur-md px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Global cluster search..."
                className="pl-9 pr-4 py-1.5 w-72 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-mono text-[11px]">
                {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <button
              onClick={loadAllData}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700/50"
              title="Refresh all metrics"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <div>
              {backendError ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
                  <XCircle className="w-3.5 h-3.5" /> Backend Disconnected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                  <ShieldCheck className="w-3.5 h-3.5" /> Cluster Connected
                </span>
              )}
            </div>
          </div>
        </header>

        {/* TAB VIEW ROUTER */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              overview={overview}
              metrics={metrics}
              health={healthData}
              k8sHealth={k8sHealth}
              promHealth={promHealth}
              dbHealth={dbHealth}
              events={events}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'nodes' && <NodesTab nodes={nodes} />}

          {activeTab === 'pods' && (
            <PodsTab
              pods={pods}
              namespaces={namespaces.map((n) => n.name)}
              onOpenLogs={handleOpenLogs}
              onAnalyzeAI={handleAnalyzeAI}
            />
          )}

          {activeTab === 'deployments' && (
            <DeploymentsTab deployments={deployments} services={services} />
          )}

          {activeTab === 'logs' && (
            <LogsTab
              pods={pods}
              initialNamespace={logTarget?.namespace}
              initialPod={logTarget?.podName}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsTab
              rules={alertRules}
              events={alertEvents}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'ai' && <AITab incidentTarget={incidentTarget} onIncidentHandled={() => setIncidentTarget(null)} />}
        </div>
      </main>
    </div>
  );
}
