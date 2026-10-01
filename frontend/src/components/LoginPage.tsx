import { useState } from 'react';
import { Activity, Lock, LogIn, User, XCircle } from 'lucide-react';
import { AuthUser, login } from '../services/api';

interface LoginPageProps {
  onLoggedIn: (user: AuthUser) => void;
}

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onLoggedIn(await login(username, password));
    } catch (err) {
      const message = (err as Error).message || 'Login failed';
      setError(message.includes('401') ? 'Invalid username or password' : message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#0B0F19] flex items-center justify-center px-4 font-sans">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-8 rounded-2xl bg-[#111827] border border-slate-800 shadow-2xl space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-600/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">K8sPulse</h1>
            <p className="text-xs text-slate-400">Sign in to the monitoring dashboard</p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-400">Username</span>
          <div className="relative">
            <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-400">Password</span>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </label>

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 flex items-center gap-2 text-xs text-rose-200">
            <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !username || !password}
          className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <LogIn className="w-4 h-4" /> {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-[11px] text-slate-500 text-center">
          The admin account comes from ADMIN_USERNAME / ADMIN_PASSWORD on the backend.
        </p>
      </form>
    </div>
  );
}
