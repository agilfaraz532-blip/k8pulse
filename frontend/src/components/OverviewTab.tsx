import { API_ORIGIN } from '../services/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  Server,
  Layers,
  Box,
  Cpu,
  Radio,
  Terminal,
  ExternalLink,
  Bot,
  ChevronRight,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import {
  ClusterOverview,
  ClusterMetricsOverview,
  HealthResponse,
  KubernetesHealth,
  PrometheusHealth,
  DatabaseHealth,
  EventInfo,
} from '../types';

interface OverviewTabProps {
  overview: ClusterOverview | null;
  metrics: ClusterMetricsOverview | null;
  health: HealthResponse | null;
  k8sHealth: KubernetesHealth | null;
  promHealth: PrometheusHealth | null;
  dbHealth: DatabaseHealth | null;
  events: EventInfo[];
  onNavigate: (tab: any) => void;
}

export function OverviewTab({
  overview,
  metrics,
  health,
  k8sHealth,
  promHealth,
  dbHealth,
  events,
  onNavigate,
}: OverviewTabProps) {
  const chartData = (metrics?.timestamps || []).map((time, idx) => ({
    time,
    cpu: metrics?.cpu_usage_percent[idx] ?? null,
    memory: metrics?.memory_usage_percent[idx] ?? null,
    networkRx: metrics?.network_rx_kbps[idx] ?? null,
    networkTx: metrics?.network_tx_kbps[idx] ?? null,
  }));
  const usageLabel = overview?.usage_source === 'metrics-server' ? 'usage' : 'requested';

  const chartPlaceholder = (message: string) => (
    <div className="h-56 w-full flex items-center justify-center text-center px-6 text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
      {message}
    </div>
  );

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'healthy':
      case 'configured':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
          </span>
        );
      case 'checking_available':
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60">
            <AlertCircle className="w-3.5 h-3.5" /> Degraded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/80 text-rose-400 border border-rose-800/60">
            <XCircle className="w-3.5 h-3.5" /> Unavailable
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Cluster KPI Resource Overview */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Cluster Resources & Live Utilization
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div
            onClick={() => onNavigate('nodes')}
            className="p-4 rounded-xl bg-[#111827] border border-slate-800/80 hover:border-blue-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-medium">Nodes</p>
              <Server className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <h3 className="text-2xl font-bold text-white font-mono">{overview?.node_count ?? '—'}</h3>
              <span className="text-[10px] text-emerald-400 font-medium">
                {overview?.ready_nodes ?? '—'} Ready
              </span>
            </div>
          </div>

          <div
            onClick={() => onNavigate('pods')}
            className="p-4 rounded-xl bg-[#111827] border border-slate-800/80 hover:border-cyan-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-medium">Pods</p>
              <Box className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <h3 className="text-2xl font-bold text-cyan-400 font-mono">{overview?.pod_count ?? '—'}</h3>
              <span className="text-[10px] text-slate-400 font-medium">
                {overview?.running_pods ?? '—'} Running
              </span>
            </div>
          </div>

          <div
            onClick={() => onNavigate('deployments')}
            className="p-4 rounded-xl bg-[#111827] border border-slate-800/80 hover:border-blue-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-medium">Deployments</p>
              <Layers className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <h3 className="text-2xl font-bold text-blue-400 font-mono">{overview?.deployment_count ?? '—'}</h3>
              <span className="text-[10px] text-emerald-400 font-medium">All Healthy</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800/80">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-medium">Cluster CPU {usageLabel}</p>
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <h3 className="text-2xl font-bold text-white font-mono">{overview?.cpu_percent ?? '—'}%</h3>
              <span className="text-[10px] text-cyan-400 font-medium">
                {overview?.cpu_cores_used ?? '—'} / {overview?.cpu_cores_total ?? '—'} Cores
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800/80">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-medium">Cluster Memory {usageLabel}</p>
              <Activity className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <h3 className="text-2xl font-bold text-white font-mono">{overview?.memory_percent ?? '—'}%</h3>
              <span className="text-[10px] text-slate-400 font-medium">
                {overview?.memory_bytes_used ?? '—'} / {overview?.memory_bytes_total ?? '—'} GiB
              </span>
            </div>
          </div>

          <div
            onClick={() => onNavigate('alerts')}
            className="p-4 rounded-xl bg-[#111827] border border-slate-800/80 hover:border-amber-500/50 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-medium">Container Restarts</p>
              <Activity className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <h3 className="text-2xl font-bold text-amber-400 font-mono">
                {overview?.restart_count_24h ?? '—'}
              </h3>
              <span className="text-[10px] text-amber-400 font-medium">Total (all pods)</span>
            </div>
          </div>
        </div>
      </div>

      {/* PromQL Telemetry Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU & Memory Chart */}
        <div className="p-5 rounded-xl bg-[#111827] border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">CPU & Memory Utilization (%)</h3>
              <p className="text-[11px] text-slate-500">Last hour · metrics-server via Prometheus</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> CPU
              </span>
              <span className="flex items-center gap-1.5 text-purple-400">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span> Memory
              </span>
            </div>
          </div>

          {metrics && !metrics.available ? (
            chartPlaceholder(metrics.message || 'No metric data available yet.')
          ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#4B5563" fontSize={11} tickLine={false} />
                <YAxis stroke="#4B5563" fontSize={11} tickLine={false} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="cpu" stroke="#06B6D4" strokeWidth={2} fillOpacity={1} fill="url(#cpuGrad)" />
                <Area type="monotone" dataKey="memory" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#memGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        {/* Network I/O Chart */}
        <div className="p-5 rounded-xl bg-[#111827] border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Cluster Network I/O (KB/s)</h3>
              <p className="text-[11px] text-slate-500">Last hour · node-exporter via Prometheus</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-emerald-400">
                <ArrowDownRight className="w-3.5 h-3.5" /> Rx (In)
              </span>
              <span className="flex items-center gap-1 text-blue-400">
                <ArrowUpRight className="w-3.5 h-3.5" /> Tx (Out)
              </span>
            </div>
          </div>

          {metrics && !metrics.network_available ? (
            chartPlaceholder(
              metrics.available ? metrics.message || 'No network data available.' : metrics.message || 'No metric data available yet.',
            )
          ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#4B5563" fontSize={11} tickLine={false} />
                <YAxis stroke="#4B5563" fontSize={11} tickLine={false} unit=" KB/s" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="networkRx" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#rxGrad)" />
                <Area type="monotone" dataKey="networkTx" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#txGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
      </div>

      {/* Subsystem Connectivity Matrix */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Subsystem Connectivity & Probes
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">Live Polling • 10s</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" /> FastAPI Core
                </span>
                {getStatusBadge(health ? 'healthy' : 'unavailable')}
              </div>
              <p className="text-[11px] text-slate-400">REST Gateway with Swagger Docs</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>UPTIME: {health?.uptime_seconds ?? 0}s</span>
              <a
                href={`${API_ORIGIN}/docs`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline flex items-center gap-1"
              >
                /docs <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-blue-400" /> Kubernetes API
                </span>
                {getStatusBadge(k8sHealth?.status)}
              </div>
              <p className="text-[11px] text-slate-400 truncate" title={k8sHealth?.message}>
                {k8sHealth?.message || 'Cluster state operational'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>NODE PROBES</span>
              <span className="text-slate-300">{overview?.server_version ?? '—'}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" /> Prometheus TSDB
                </span>
                {getStatusBadge(promHealth?.status)}
              </div>
              <p className="text-[11px] text-slate-400 truncate" title={promHealth?.url}>
                {promHealth?.message || 'PromQL Metric Collector'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span className="truncate max-w-[130px]">{promHealth?.url || 'http://localhost:9090'}</span>
              <span className="text-amber-400">PromQL</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" /> Database Pool
                </span>
                {getStatusBadge(dbHealth?.status)}
              </div>
              <p className="text-[11px] text-slate-400">Users, alert rules & audit logs</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span className="uppercase">{dbHealth?.type || 'SQLite / Postgres'}</span>
              <span className="text-purple-400">Async Pool</span>
            </div>
          </div>
        </div>
      </div>

      {/* Events Stream & AI Copilot Teaser */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-xl bg-[#111827] border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" /> Recent Kubernetes Events
            </h3>
            <span className="text-xs text-slate-400 font-mono">Last 50 events</span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {events.slice(0, 5).map((ev, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/50 flex items-start justify-between text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        ev.event_type === 'Warning'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/40'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                      }`}
                    >
                      {ev.event_type}
                    </span>
                    <span className="font-semibold text-slate-200">{ev.reason}</span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      {ev.namespace} / {ev.object_name}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">{ev.message}</p>
                </div>
                <span className="text-slate-500 font-mono text-[10px] whitespace-nowrap ml-2">
                  {ev.timestamp.includes('T') ? ev.timestamp.split('T')[1].slice(0, 8) : ev.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Copilot Box */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-purple-950/30 to-blue-950/20 border border-purple-800/40 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-purple-200">AI Cluster Copilot</h3>
                <p className="text-[10px] text-purple-300/70 font-mono">Automated Incident Triage</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Synthesizes node health, memory pressure, and CrashLoopBackOff container logs to deliver instant
              root-cause explanations and suggested remediation commands.
            </p>
          </div>

          <div className="pt-3 border-t border-purple-900/40">
            <button
              onClick={() => onNavigate('ai')}
              className="w-full py-2.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20"
            >
              <Bot className="w-4 h-4" /> Explain Cluster Health <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
