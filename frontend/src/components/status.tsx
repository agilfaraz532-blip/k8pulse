import { AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { PodInfo } from '../types';

export type StatusLevel = 'healthy' | 'progress' | 'critical';

const HEALTHY = new Set(['Running', 'Succeeded', 'Completed']);
const IN_PROGRESS = new Set(['Pending', 'ContainerCreating', 'PodInitializing', 'Terminating']);

/** Pod statuses mirror `kubectl get pods`; anything not healthy or in progress is a failure. */
export function statusLevel(status: string): StatusLevel {
  if (HEALTHY.has(status)) return 'healthy';
  if (IN_PROGRESS.has(status)) return 'progress';
  return 'critical';
}

const RECENT_CRASH_MS = 60 * 60 * 1000;

/**
 * Failing now, or crashed within the last hour and is restarting (e.g. OOMKilled between
 * restarts). Old restarts, such as every pod restarting once after a node reboot, are not flagged.
 */
export function needsAttention(pod: PodInfo): boolean {
  if (statusLevel(pod.status) === 'critical') return true;
  return pod.containers.some(
    (c) =>
      c.restart_count >= 2 &&
      c.last_termination_at !== undefined &&
      c.last_termination_at !== null &&
      Date.now() - new Date(c.last_termination_at).getTime() < RECENT_CRASH_MS,
  );
}

export function StatusBadge({ status }: { status: string }) {
  const level = statusLevel(status);
  const styles = {
    healthy: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50',
    progress: 'bg-amber-950/80 text-amber-400 border-amber-800/50',
    critical: 'bg-rose-950/80 text-rose-400 border-rose-800/50',
  }[level];
  const Icon = level === 'healthy' ? CheckCircle2 : level === 'progress' ? (status === 'Pending' ? AlertCircle : Loader2) : XCircle;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium border whitespace-nowrap ${styles}`}>
      <Icon className={`w-3 h-3 ${level === 'progress' && status !== 'Pending' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}
