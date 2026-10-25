import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CornerDownLeft, FolderTree, Layers, LucideIcon, Network, Search, Server } from 'lucide-react';
import { DeploymentInfo, NamespaceInfo, NodeInfo, PodInfo, ServiceInfo } from '../types';
import { statusLevel } from './status';

export type SearchTarget =
  | { tab: 'pods'; term: string }
  | { tab: 'nodes'; term: string }
  | { tab: 'deployments'; term: string; view: 'deployments' | 'services' };

interface Item {
  id: string;
  kind: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: { text: string; tone: 'ok' | 'warn' | 'bad' };
  target: SearchTarget;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (target: SearchTarget) => void;
  pods: PodInfo[];
  deployments: DeploymentInfo[];
  services: ServiceInfo[];
  nodes: NodeInfo[];
  namespaces: NamespaceInfo[];
}

const toneFor = (status: string): 'ok' | 'warn' | 'bad' =>
  ({ healthy: 'ok', progress: 'warn', critical: 'bad' } as const)[statusLevel(status)];

/** Ctrl/⌘+K search across live cluster resources; picking a result opens it in its tab. */
export function CommandPalette({ open, onClose, onSelect, pods, deployments, services, nodes, namespaces }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const allItems = useMemo<Item[]>(
    () => [
      ...pods.map((p) => ({
        id: `pod:${p.namespace}/${p.name}`,
        kind: 'Pod',
        icon: Box,
        title: p.name,
        subtitle: `${p.namespace} · ${p.node_name ?? 'unscheduled'} · ${p.restarts} restarts`,
        badge: { text: p.status, tone: toneFor(p.status) },
        target: { tab: 'pods' as const, term: p.name },
      })),
      ...deployments.map((d) => ({
        id: `deploy:${d.namespace}/${d.name}`,
        kind: 'Deployment',
        icon: Layers,
        title: d.name,
        subtitle: `${d.namespace} · ${d.ready_replicas}/${d.desired_replicas} ready`,
        badge: {
          text: d.status,
          tone: (d.status === 'Healthy' ? 'ok' : d.status === 'Degraded' ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad',
        },
        target: { tab: 'deployments' as const, term: d.name, view: 'deployments' as const },
      })),
      ...services.map((s) => ({
        id: `svc:${s.namespace}/${s.name}`,
        kind: 'Service',
        icon: Network,
        title: s.name,
        subtitle: `${s.namespace} · ${s.service_type} · ${s.cluster_ip}`,
        target: { tab: 'deployments' as const, term: s.name, view: 'services' as const },
      })),
      ...nodes.map((n) => ({
        id: `node:${n.name}`,
        kind: 'Node',
        icon: Server,
        title: n.name,
        subtitle: `${n.roles.join(', ')} · ${n.internal_ip} · ${n.pods_count} pods`,
        badge: { text: n.status, tone: (n.status === 'Ready' ? 'ok' : 'bad') as 'ok' | 'bad' },
        target: { tab: 'nodes' as const, term: n.name },
      })),
      ...namespaces.map((ns) => ({
        id: `ns:${ns.name}`,
        kind: 'Namespace',
        icon: FolderTree,
        title: ns.name,
        subtitle: `${pods.filter((p) => p.namespace === ns.name).length} pods`,
        target: { tab: 'pods' as const, term: ns.name },
      })),
    ],
    [pods, deployments, services, nodes, namespaces],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Without a query, surface what most likely needs attention first
      const troubled = allItems.filter((i) => i.badge?.tone === 'bad');
      return [...troubled, ...allItems.filter((i) => i.kind === 'Namespace')].slice(0, 12);
    }
    const terms = q.split(/\s+/);
    return allItems
      .map((item) => {
        const hay = `${item.kind} ${item.title} ${item.subtitle} ${item.badge?.text ?? ''}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return null;
        const score = item.title.toLowerCase().startsWith(terms[0]) ? 0 : item.title.toLowerCase().includes(terms[0]) ? 1 : 2;
        return { item, score };
      })
      .filter((r): r is { item: Item; score: number } => r !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 30)
      .map((r) => r.item);
  }, [allItems, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onSelect(item.target);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const badgeStyles = {
    ok: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50',
    warn: 'text-amber-400 bg-amber-950/60 border-amber-800/50',
    bad: 'text-rose-400 bg-rose-950/60 border-rose-800/50',
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Search cluster resources"
        className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#0E1322] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pods, deployments, services, nodes, namespaces…"
            className="flex-1 py-4 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="text-[10px] font-mono text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {!query && results.length > 0 && (
            <p className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              {results.some((r) => r.badge?.tone === 'bad') ? 'Needs attention · namespaces' : 'Namespaces'}
            </p>
          )}
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-slate-500">No resources match “{query}”.</p>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    i === active ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : 'hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${i === active ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-100 truncate">{item.title}</div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      {item.kind} · {item.subtitle}
                    </div>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${badgeStyles[item.badge.tone]}`}>
                      {item.badge.text}
                    </span>
                  )}
                  {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
