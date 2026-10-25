import { useEffect, useState } from 'react';
import { Server, Search, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { NodeInfo } from '../types';

interface NodesTabProps {
  nodes: NodeInfo[];
  /** Pre-filled from the global search palette */
  initialSearch?: string;
}

export function NodesTab({ nodes, initialSearch }: NodesTabProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearch ?? '');

  useEffect(() => {
    if (initialSearch !== undefined) setSearchTerm(initialSearch);
  }, [initialSearch]);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);

  const filteredNodes = nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.internal_ip.includes(searchTerm) ||
      n.roles.some((r) => r.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" /> Cluster Nodes
          </h2>
          <p className="text-xs text-slate-400">Inventory, capacity allocation, and kubelet conditions</p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search nodes by name, IP, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 w-72 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Nodes Table */}
      <div className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Node Name</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Roles</th>
                <th className="px-4 py-3.5">Internal IP</th>
                <th className="px-4 py-3.5">CPU Capacity</th>
                <th className="px-4 py-3.5">Memory Capacity</th>
                <th className="px-4 py-3.5">Pods</th>
                <th className="px-4 py-3.5">Kubelet Version</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredNodes.map((node) => {
                const isReady = node.status === 'Ready';
                return (
                  <tr
                    key={node.name}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedNode(node)}
                  >
                    <td className="px-5 py-4 font-semibold text-slate-200 font-sans flex items-center gap-2">
                      <Server className="w-4 h-4 text-blue-400" />
                      <span>{node.name}</span>
                    </td>
                    <td className="px-4 py-4">
                      {isReady ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium bg-rose-950/80 text-rose-400 border border-rose-800/50">
                          <AlertCircle className="w-3 h-3" /> {node.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-400">
                      <div className="flex gap-1 flex-wrap">
                        {node.roles.map((r, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-300">{node.internal_ip}</td>
                    <td className="px-4 py-4 text-cyan-400">{node.cpu_capacity} Cores</td>
                    <td className="px-4 py-4 text-purple-400">{node.memory_capacity}</td>
                    <td className="px-4 py-4 text-slate-300">{node.pods_count}</td>
                    <td className="px-4 py-4 text-slate-400 font-sans text-[11px]">{node.kubelet_version}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNode(node);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white font-sans text-xs transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Node Inspector Modal */}
      {selectedNode && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
                  <Server className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedNode.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    OS: {selectedNode.os_image} • Runtime: {selectedNode.container_runtime}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Capacity vs Allocatable Matrix */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Resource Capacity vs Allocatable</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <p className="text-[11px] text-slate-500">CPU Capacity</p>
                  <p className="text-base font-bold text-white font-mono">{selectedNode.cpu_capacity} Cores</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <p className="text-[11px] text-slate-500">CPU Allocatable</p>
                  <p className="text-base font-bold text-cyan-400 font-mono">{selectedNode.cpu_allocatable}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <p className="text-[11px] text-slate-500">Memory Capacity</p>
                  <p className="text-base font-bold text-white font-mono">{selectedNode.memory_capacity}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <p className="text-[11px] text-slate-500">Memory Allocatable</p>
                  <p className="text-base font-bold text-purple-400 font-mono">{selectedNode.memory_allocatable}</p>
                </div>
              </div>
            </div>

            {/* Conditions */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Kubelet Node Conditions</h4>
              <div className="space-y-2">
                {selectedNode.conditions.map((c, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-slate-200">{c.type}</span>
                      <p className="text-[11px] text-slate-400">{c.message || c.reason}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        (c.type === 'Ready' && c.status === 'True') || (c.type !== 'Ready' && c.status === 'False')
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                      }`}
                    >
                      Status: {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Labels & Taints */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Labels</h4>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 max-h-36 overflow-y-auto space-y-1 text-[11px] font-mono text-slate-400">
                  {Object.entries(selectedNode.labels).map(([k, v]) => (
                    <div key={k} className="truncate">
                      <span className="text-blue-400">{k}</span>: <span className="text-slate-200">{v || '""'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Taints</h4>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 max-h-36 overflow-y-auto text-[11px] font-mono text-slate-400">
                  {selectedNode.taints.length > 0 ? (
                    selectedNode.taints.map((t, i) => (
                      <div key={i} className="p-1.5 rounded bg-slate-800/60 mb-1">
                        <span className="text-amber-400">{t.key}</span>: {t.effect}
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 italic">No taints applied to this node.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
