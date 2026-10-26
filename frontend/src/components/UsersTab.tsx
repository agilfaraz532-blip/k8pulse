import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Clock, Loader2, RefreshCw, ShieldCheck, UserCheck, Users, XCircle } from 'lucide-react';
import { AuthUser, fetchUsers, updateUser } from '../services/api';

const ROLE_HELP: Record<string, string> = {
  viewer: 'Read-only: dashboards, logs, AI analysis',
  operator: 'Viewer + manage alert rules and incidents',
  admin: 'Operator + approve and manage users',
};

function StatusPill({ user }: { user: AuthUser }) {
  if (user.is_approved === false) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border bg-amber-950/60 text-amber-300 border-amber-800/60">
        <Clock className="w-3 h-3" /> Pending approval
      </span>
    );
  }
  if (!user.is_active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border bg-slate-800 text-slate-400 border-slate-700">
        <Ban className="w-3 h-3" /> Disabled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border bg-emerald-950/60 text-emerald-400 border-emerald-800/60">
      <CheckCircle2 className="w-3 h-3" /> Active
    </span>
  );
}

/** Admin-only account management: approve sign-ups, change roles, disable accounts. */
export function UsersTab({ currentUser, onPendingChange }: { currentUser: AuthUser; onPendingChange?: (n: number) => void }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchUsers();
      setUsers(list);
      onPendingChange?.(list.filter((u) => u.is_approved === false).length);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = async (user: AuthUser, changes: Parameters<typeof updateUser>[1]) => {
    setBusyId(user.id);
    setError(null);
    try {
      const updated = await updateUser(user.id, changes);
      const next = users.map((u) => (u.id === updated.id ? updated : u));
      setUsers(next);
      onPendingChange?.(next.filter((u) => u.is_approved === false).length);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const pending = users.filter((u) => u.is_approved === false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" /> Users & Access
          </h2>
          <p className="text-xs text-slate-400">Approve sign-ups, assign roles and disable accounts</p>
        </div>
        <button
          onClick={load}
          className="self-start sm:self-auto px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 flex items-center gap-2 text-xs text-rose-200">
          <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" /> {error}
        </div>
      )}

      {pending.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/60 space-y-3">
          <p className="text-xs font-semibold text-amber-300 flex items-center gap-2">
            <Clock className="w-4 h-4" /> {pending.length} account{pending.length > 1 ? 's' : ''} waiting for approval
          </p>
          <div className="space-y-2">
            {pending.map((u) => (
              <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.full_name || u.username}</p>
                  <p className="text-xs text-slate-400 font-mono truncate">
                    @{u.username} · {u.email}
                    {u.created_at && ` · signed up ${new Date(u.created_at + (u.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}`}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    disabled={busyId === u.id}
                    onClick={() => change(u, { is_approved: true, is_active: true })}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    {busyId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />} Approve
                  </button>
                  <button
                    disabled={busyId === u.id}
                    onClick={() => change(u, { is_approved: true, is_active: false })}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 disabled:opacity-50 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700"
                    title="Reject: the account is kept but cannot sign in"
                  >
                    <Ban className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">User</th>
                <th className="px-4 py-3.5">Email</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map((u) => {
                const isMe = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-800/30">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-100 flex items-center gap-2">
                        {u.full_name || u.username}
                        {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">you</span>}
                      </p>
                      <p className="text-slate-500 font-mono">@{u.username}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-300 font-mono whitespace-nowrap">{u.email}</td>
                    <td className="px-4 py-3.5">
                      <select
                        value={u.role}
                        disabled={isMe || busyId === u.id}
                        title={ROLE_HELP[u.role]}
                        onChange={(e) => change(u, { role: e.target.value })}
                        className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                      >
                        {Object.keys(ROLE_HELP).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3.5"><StatusPill user={u} /></td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {u.is_approved !== false && !isMe && (
                        <button
                          disabled={busyId === u.id}
                          onClick={() => change(u, { is_active: !u.is_active })}
                          className={`px-2.5 py-1 rounded text-xs font-medium border disabled:opacity-50 ${
                            u.is_active
                              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-rose-900/50 hover:text-rose-200'
                              : 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
                          }`}
                        >
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {Object.entries(ROLE_HELP).map(([role, help]) => (
          <div key={role} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
            <p className="font-semibold text-slate-200 capitalize flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> {role}
            </p>
            <p className="text-slate-400 mt-1">{help}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
