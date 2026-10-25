import { useState } from 'react';
import { BellRing, Bot, Gauge, Lock, LogIn, ShieldCheck, User, XCircle } from 'lucide-react';
import { AuthUser, login } from '../services/api';
import { LogoMark, Wordmark } from './Logo';

interface LoginPageProps {
  onLoggedIn: (user: AuthUser) => void;
}

const highlights = [
  { icon: Gauge, title: 'Live cluster visibility', text: 'Nodes, pods, deployments, events and logs straight from the Kubernetes API.' },
  { icon: BellRing, title: 'Alerts that resolve themselves', text: 'Rules for CPU, memory, crash loops and restarts, evaluated every 30 seconds.' },
  { icon: Bot, title: 'Private AI SRE copilot', text: 'Root-cause analysis from a local LLM, so your cluster data never leaves your network.' },
];

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
    <div className="min-h-[100dvh] w-full bg-[#0B0F19] flex font-sans">
      {/* Product panel (desktop) */}
      <section className="hidden lg:flex relative flex-1 overflow-hidden border-r border-slate-800/80 bg-[#0E1322]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(6,182,212,0.18),transparent_55%),radial-gradient(ellipse_at_90%_90%,rgba(37,99,235,0.18),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(148,163,184,1)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,1)_1px,transparent_1px)] bg-[size:48px_48px]" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full max-w-2xl">
          <div className="flex items-center gap-3">
            <LogoMark />
            <Wordmark className="text-lg" />
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-[11px] font-mono uppercase tracking-wider text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> Kubernetes observability
              </span>
              <h2 className="text-4xl xl:text-5xl font-bold leading-[1.1] text-white">
                See your cluster.
                <br />
                <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Fix incidents faster.</span>
              </h2>
              <p className="text-slate-400 max-w-md leading-relaxed">
                A self-hosted dashboard with live metrics, smart alerting and an AI copilot that explains what broke and how to fix it.
              </p>
            </div>

            <ul className="space-y-5">
              {highlights.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{title}</p>
                    <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-500 font-mono">FastAPI · React · Prometheus · Grafana · Ollama</p>
        </div>
      </section>

      {/* Sign-in form */}
      <section className="flex-1 lg:flex-none lg:w-[480px] flex items-center justify-center px-5 py-10">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 lg:hidden">
              <LogoMark />
              <Wordmark className="text-lg" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Welcome back</h1>
              <p className="text-sm text-slate-400 mt-1">Sign in to your monitoring dashboard</p>
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
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
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
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
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
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-600/20"
          >
            <LogIn className="w-4 h-4" /> {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-px" />
            Accounts are managed by your administrator. The first admin comes from ADMIN_USERNAME / ADMIN_PASSWORD on the backend.
          </p>
        </form>
      </section>
    </div>
  );
}
