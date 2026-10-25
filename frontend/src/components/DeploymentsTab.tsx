import { useEffect, useState } from 'react';
import { Layers, Radio, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { DeploymentInfo, ServiceInfo } from '../types';

interface DeploymentsTabProps {
  deployments: DeploymentInfo[];
  services: ServiceInfo[];
  /** Pre-filled from the global search palette */
  initialSearch?: string;
  initialView?: 'deployments' | 'services';
}

export function DeploymentsTab({ deployments, services, initialSearch, initialView }: DeploymentsTabProps) {
  const [subView, setSubView] = useState<'deployments' | 'services'>(initialView ?? 'deployments');
  const [searchTerm, setSearchTerm] = useState(initialSearch ?? '');

  useEffect(() => {
    if (initialSearch !== undefined) setSearchTerm(initialSearch);
    if (initialView) setSubView(initialView);
  }, [initialSearch, initialView]);

  const filteredDeployments = deployments.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.cluster_ip.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* View Switcher & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
          <button
            onClick={() => setSubView('deployments')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              subView === 'deployments'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" /> Deployments ({deployments.length})
          </button>
          <button
            onClick={() => setSubView('services')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              subView === 'services'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" /> Services ({services.length})
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder={`Search ${subView}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 w-72 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Deployments View */}
      {subView === 'deployments' && (
        <div className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Deployment Name</th>
                  <th className="px-4 py-3.5">Namespace</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Ready / Desired</th>
                  <th className="px-4 py-3.5">Available</th>
                  <th className="px-4 py-3.5">Strategy</th>
                  <th className="px-4 py-3.5">Container Images</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredDeployments.map((dep) => {
                  const isHealthy = dep.ready_replicas === dep.desired_replicas;
                  return (
                    <tr key={`${dep.namespace}-${dep.name}`} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-4 font-semibold text-slate-200 font-sans flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400" />
                        <span>{dep.name}</span>
                      </td>
                      <td className="px-4 py-4 text-cyan-400">{dep.namespace}</td>
                      <td className="px-4 py-4 font-sans">
                        {isHealthy ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                            <CheckCircle2 className="w-3 h-3" /> Healthy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/80 text-amber-400 border border-amber-800/50">
                            <AlertCircle className="w-3 h-3" /> Degraded
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-200 font-bold">
                        {dep.ready_replicas} / {dep.desired_replicas}
                      </td>
                      <td className="px-4 py-4 text-slate-300">{dep.available_replicas}</td>
                      <td className="px-4 py-4 text-slate-400 font-sans text-[11px]">{dep.strategy}</td>
                      <td className="px-4 py-4 text-slate-400 text-[11px] truncate max-w-[200px]">
                        {dep.images.join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Services View */}
      {subView === 'services' && (
        <div className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Service Name</th>
                  <th className="px-4 py-3.5">Namespace</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Cluster IP</th>
                  <th className="px-4 py-3.5">Ports</th>
                  <th className="px-4 py-3.5">Selectors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredServices.map((svc) => (
                  <tr key={`${svc.namespace}-${svc.name}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 font-semibold text-slate-200 font-sans flex items-center gap-2">
                      <Radio className="w-4 h-4 text-cyan-400" />
                      <span>{svc.name}</span>
                    </td>
                    <td className="px-4 py-4 text-blue-400">{svc.namespace}</td>
                    <td className="px-4 py-4 font-sans">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                        {svc.service_type}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300">{svc.cluster_ip}</td>
                    <td className="px-4 py-4 text-cyan-400">
                      {svc.ports.map((p) => `${p.port}${p.node_port ? `:${p.node_port}` : ''}/${p.protocol}`).join(', ')}
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-[11px]">
                      {Object.entries(svc.selector)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
