import { useState } from 'react';
import { Box, Search, CheckCircle2, AlertCircle, XCircle, X, Terminal, Bot } from 'lucide-react';
import { PodInfo } from '../types';

interface PodsTabProps {
  pods: PodInfo[];
  namespaces: string[];
  onOpenLogs: (namespace: string, podName: string) => void;
  onAnalyzeAI: (namespace: string, podName: string) => void;
}

export function PodsTab({ pods, namespaces, onOpenLogs, onAnalyzeAI }: PodsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPod, setSelectedPod] = useState<PodInfo | null>(null);

  const filteredPods = pods.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.node_name && p.node_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesNs = selectedNamespace === 'all' || p.namespace === selectedNamespace;
    const matchesStatus = selectedStatus === 'all' || p.status === selectedStatus;
    return matchesSearch && matchesNs && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Running':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
            <CheckCircle2 className="w-3 h-3" /> Running
          </span>
        );
      case 'CrashLoopBackOff':
      case 'Failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium bg-rose-950/80 text-rose-400 border border-rose-800/50 animate-pulse">
            <XCircle className="w-3 h-3" /> {status}
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium bg-amber-950/80 text-amber-400 border border-amber-800/50">
            <AlertCircle className="w-3 h-3" /> Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Box className="w-5 h-5 text-cyan-400" /> Pods Inventory
          </h2>
          <p className="text-xs text-slate-400">Real-time pod lifecycle, container restarts, and runtime states</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Namespace Filter */}
          <select
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Namespaces</option>
            {namespaces.map((ns) => (
              <option key={ns} value={ns}>
                ns: {ns}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Statuses</option>
            <option value="Running">Running</option>
            <option value="CrashLoopBackOff">CrashLoopBackOff</option>
            <option value="Pending">Pending</option>
          </select>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search pod or node..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-64 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Pods Table */}
      <div className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Pod Name</th>
                <th className="px-4 py-3.5">Namespace</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Ready</th>
                <th className="px-4 py-3.5">Restarts</th>
                <th className="px-4 py-3.5">Node</th>
                <th className="px-4 py-3.5">Pod IP</th>
                <th className="px-4 py-3.5">Age</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredPods.map((pod) => (
                <tr
                  key={`${pod.namespace}-${pod.name}`}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                  onClick={() => setSelectedPod(pod)}
                >
                  <td className="px-5 py-4 font-semibold text-slate-200 font-sans flex items-center gap-2">
                    <Box className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span className="truncate max-w-[220px]">{pod.name}</span>
                  </td>
                  <td className="px-4 py-4 text-blue-400">{pod.namespace}</td>
                  <td className="px-4 py-4">{getStatusBadge(pod.status)}</td>
                  <td className="px-4 py-4 text-slate-300">{pod.ready}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`font-bold ${
                        pod.restarts > 5
                          ? 'text-rose-400'
                          : pod.restarts > 0
                          ? 'text-amber-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {pod.restarts}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-400">{pod.node_name || '—'}</td>
                  <td className="px-4 py-4 text-slate-400">{pod.pod_ip || '—'}</td>
                  <td className="px-4 py-4 text-slate-400 font-sans text-[11px]">{pod.age}</td>
                  <td className="px-4 py-4 text-right space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenLogs(pod.namespace, pod.name);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white font-sans text-xs transition-colors inline-flex items-center gap-1"
                      title="View pod live logs"
                    >
                      <Terminal className="w-3 h-3" /> Logs
                    </button>
                    {pod.status !== 'Running' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnalyzeAI(pod.namespace, pod.name);
                        }}
                        className="px-2.5 py-1 rounded bg-purple-950/80 border border-purple-800 text-purple-300 hover:bg-purple-600 hover:text-white font-sans text-xs transition-colors inline-flex items-center gap-1"
                        title="AI Root Cause Analysis"
                      >
                        <Bot className="w-3 h-3" /> AI Triage
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pod Details Modal */}
      {selectedPod && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center">
                  <Box className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedPod.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Namespace: <span className="text-cyan-300">{selectedPod.namespace}</span> • Node:{' '}
                    <span className="text-blue-300">{selectedPod.node_name}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPod(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Containers Status List */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Containers</h4>
              <div className="space-y-3">
                {selectedPod.containers.map((c, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-xs flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${c.ready ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {c.name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">Restarts: {c.restart_count}</span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 truncate">Image: {c.image}</p>
                    {c.reason && (
                      <p className="text-[11px] font-mono text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/50">
                        Reason: {c.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  const ns = selectedPod.namespace;
                  const name = selectedPod.name;
                  setSelectedPod(null);
                  onOpenLogs(ns, name);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors flex items-center gap-2"
              >
                <Terminal className="w-4 h-4 text-cyan-400" /> Open in Log Streamer
              </button>
              <button
                onClick={() => {
                  const ns = selectedPod.namespace;
                  const name = selectedPod.name;
                  setSelectedPod(null);
                  onAnalyzeAI(ns, name);
                }}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors flex items-center gap-2 shadow-lg shadow-purple-600/20"
              >
                <Bot className="w-4 h-4" /> AI Incident Analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
