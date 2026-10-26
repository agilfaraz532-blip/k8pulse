import { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Plus,
  X,
  Sliders,
  Trash2,
  Play,
  XCircle,
} from 'lucide-react';
import { AlertRule, AlertEvent } from '../types';
import { createAlertRule, deleteAlertRule, evaluateAlerts, resolveAlertEvent, updateAlertRule } from '../services/api';

interface AlertsTabProps {
  rules: AlertRule[];
  events: AlertEvent[];
  onRefresh: () => void;
  /** Viewers can see alerts but not change rules or resolve incidents */
  readOnly?: boolean;
}

export function AlertsTab({ rules, events, onRefresh, readOnly = false }: AlertsTabProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newMetricType, setNewMetricType] = useState('cpu_percent');
  const [newThreshold, setNewThreshold] = useState<number>(80);
  const [newSeverity, setNewSeverity] = useState('warning');
  const [newCondition, setNewCondition] = useState('gt');
  const [newDuration, setNewDuration] = useState<number>(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    await run(evaluateAlerts);
    setIsEvaluating(false);
  };

  const conditionSymbol = (c: string) => (c === 'lt' ? '<' : c === 'eq' ? '=' : '>');

  const activeEvents = events.filter((e) => !e.is_resolved);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName) return;
    setIsSubmitting(true);
    try {
      await createAlertRule({
        name: newRuleName,
        metric_type: newMetricType,
        condition: newCondition,
        threshold: newThreshold,
        severity: newSeverity,
        duration_seconds: newDuration,
        is_enabled: true,
      });
      setShowCreateModal(false);
      setNewRuleName('');
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = (id: number) => run(() => resolveAlertEvent(id));

  return (
    <div className="space-y-6">
      {/* Header & New Rule Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" /> Alert Center & Anomaly Engine
          </h2>
          <p className="text-xs text-slate-400">Configured threshold monitors, CrashLoopBackOff detection, and incident logs</p>
        </div>

        <div className="flex items-center gap-2">
        <button
          onClick={handleEvaluate}
          disabled={isEvaluating}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
          title="Evaluate all enabled rules against the live cluster now"
        >
          <Play className="w-4 h-4" /> {isEvaluating ? 'Evaluating…' : 'Evaluate now'}
        </button>
        {readOnly ? (
          <span className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs" title="Ask an admin for the operator role to manage alerts">
            Read-only (viewer)
          </span>
        ) : (
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-amber-600/20"
        >
          <Plus className="w-4 h-4" /> Create Alert Rule
        </button>
        )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 flex items-center gap-2 text-xs text-rose-200">
          <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Active Incidents Banner */}
      {activeEvents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Active Incidents Requiring Attention ({activeEvents.length})
          </h3>
          <div className="space-y-2">
            {activeEvents.map((event) => (
              <div
                key={event.id}
                className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-900 text-rose-200">
                      {event.severity}
                    </span>
                    <span className="font-semibold text-white text-sm">{event.rule_name}</span>
                    <span className="text-slate-400 font-mono text-xs">{event.target_resource}</span>
                  </div>
                  <p className="text-xs text-rose-200/90 leading-relaxed">{event.message}</p>
                </div>
                {!readOnly && (
                <button
                  onClick={() => handleResolve(event.id)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors flex items-center gap-1.5 self-start sm:self-auto flex-shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Resolve Incident
                </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configured Alert Rules */}
      <div className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" /> Threshold Rules ({rules.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Rule Name</th>
                <th className="px-4 py-3.5">Metric Type</th>
                <th className="px-4 py-3.5">Condition</th>
                <th className="px-4 py-3.5">Severity</th>
                <th className="px-4 py-3.5">For</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4 font-semibold text-slate-200 font-sans">{rule.name}</td>
                  <td className="px-4 py-4 text-cyan-400">{rule.metric_type}</td>
                  <td className="px-4 py-4 text-slate-300">
                    {conditionSymbol(rule.condition)} {rule.threshold} {rule.metric_type.includes('percent') ? '%' : ''}
                  </td>
                  <td className="px-4 py-4 font-sans">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                        rule.severity === 'critical'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800/50'
                          : 'bg-amber-950 text-amber-400 border border-amber-800/50'
                      }`}
                    >
                      {rule.severity}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-400">{rule.duration_seconds}s</td>
                  <td className="px-4 py-4 font-sans">
                    <button
                      onClick={() => run(() => updateAlertRule(rule.id, { is_enabled: !rule.is_enabled }))}
                      disabled={readOnly}
                      className={`inline-flex items-center gap-1 ${rule.is_enabled ? 'text-emerald-400' : 'text-slate-500'} disabled:cursor-default`}
                      title={readOnly ? undefined : 'Click to toggle'}
                    >
                      <span className={`w-2 h-2 rounded-full ${rule.is_enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      {rule.is_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-right">
                    {!readOnly && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete alert rule "${rule.name}"?`)) run(() => deleteAlertRule(rule.id));
                      }}
                      className="p-1.5 rounded bg-slate-800 hover:bg-rose-900 text-slate-400 hover:text-rose-200"
                      title="Delete rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" /> New Alert Rule
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Node High CPU Alert"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Metric Target</label>
                <select
                  value={newMetricType}
                  onChange={(e) => setNewMetricType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value="cpu_percent">Cluster CPU (%)</option>
                  <option value="memory_percent">Cluster Memory (%)</option>
                  <option value="pod_restarts">Pod Restarts Count</option>
                  <option value="crashloop">Failing Pods (CrashLoopBackOff / ImagePull)</option>
                  <option value="node_unready">Node NotReady</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Condition</label>
                  <select
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                  >
                    <option value="gt">&gt; greater than</option>
                    <option value="lt">&lt; less than</option>
                    <option value="eq">= equal to</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">For (seconds)</label>
                  <input
                    type="number"
                    min={0}
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Threshold Value</label>
                <input
                  type="number"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Severity</label>
                <select
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                >
                  {isSubmitting ? 'Saving...' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
