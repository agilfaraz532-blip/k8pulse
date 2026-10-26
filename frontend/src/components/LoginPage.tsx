import { useEffect, useState } from 'react';
import {
  AtSign, BellRing, Bot, Check, CheckCircle2, Clock, Eye, EyeOff, Gauge, Lock, LogIn, ShieldCheck, User, UserPlus, XCircle,
} from 'lucide-react';
import { AuthUser, SignupMode, fetchAuthConfig, login, signup } from '../services/api';
import { LogoMark, Wordmark } from './Logo';

interface LoginPageProps {
  onLoggedIn: (user: AuthUser) => void;
}

const highlights = [
  { icon: Gauge, title: 'Live cluster visibility', text: 'Nodes, pods, deployments, events and logs straight from the Kubernetes API.' },
  { icon: BellRing, title: 'Alerts that resolve themselves', text: 'Rules for CPU, memory, crash loops and restarts, evaluated every 30 seconds.' },
  { icon: Bot, title: 'Private AI SRE copilot', text: 'Root-cause analysis from a local LLM, so your cluster data never leaves your network.' },
];

const inputClass =
  'w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20';

function Field({
  label, icon: Icon, hint, children,
}: { label: string; icon: typeof User; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <div className="relative">
        <Icon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        {children}
      </div>
      {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

function PasswordInput({
  value, onChange, autoComplete, placeholder,
}: { value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <input
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </>
  );
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SignInForm({ onLoggedIn, notice }: { onLoggedIn: (u: AuthUser) => void; notice?: string | null }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onLoggedIn(await login(username, password));
    } catch (err) {
      setError((err as Error).message || 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const pending = error?.includes('approve');

  return (
    <form onSubmit={submit} className="space-y-5">
      {notice && (
        <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800 flex items-start gap-2 text-xs text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-px" />
          {notice}
        </div>
      )}
      <Field label="Username or email" icon={User}>
        <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Password" icon={Lock}>
        <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
      </Field>

      {error && (
        <div className={`p-3 rounded-lg border flex items-start gap-2 text-xs ${
          pending ? 'bg-amber-950/40 border-amber-800 text-amber-200' : 'bg-rose-950/40 border-rose-800 text-rose-200'
        }`}>
          {pending ? <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-px" /> : <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" />}
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
    </form>
  );
}

function SignUpForm({ mode, onDone }: { mode: SignupMode; onDone: (message: string, status: 'active' | 'pending') => void }) {
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '', confirm: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const touch = (key: string) => () => setTouched((t) => ({ ...t, [key]: true }));

  const rules = [
    { ok: form.password.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(form.password), label: 'A letter' },
    { ok: /\d/.test(form.password), label: 'A number' },
  ];
  const errors = {
    full_name: form.full_name.trim().length < 2 ? 'Enter your full name' : null,
    username: !USERNAME_RE.test(form.username) ? '3–30 characters: lowercase letters, numbers, . _ -' : null,
    email: !EMAIL_RE.test(form.email) ? 'Enter a valid email address' : null,
    password: rules.every((r) => r.ok) ? null : 'Password does not meet the requirements',
    confirm: form.confirm !== form.password ? 'Passwords do not match' : null,
  };
  const valid = Object.values(errors).every((e) => e === null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ full_name: true, username: true, email: true, password: true, confirm: true });
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await signup({ full_name: form.full_name, username: form.username, email: form.email, password: form.password });
      onDone(res.message, res.status);
    } catch (err) {
      setError((err as Error).message || 'Sign-up failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (key: keyof typeof errors) =>
    touched[key] && errors[key] ? <span className="block text-[11px] text-rose-400">{errors[key]}</span> : null;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <Field label="Full name" icon={User}>
          <input autoFocus autoComplete="name" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} onBlur={touch('full_name')} placeholder="Agil Faraz" className={inputClass} />
        </Field>
        {fieldError('full_name')}
      </div>
      <div>
        <Field label="Username" icon={AtSign} hint={touched.username && errors.username ? undefined : 'Lowercase letters, numbers, dots, dashes or underscores'}>
          <input
            autoComplete="username"
            value={form.username}
            onChange={(e) => set('username')(e.target.value.toLowerCase().replace(/\s/g, ''))}
            onBlur={touch('username')}
            placeholder="agil.faraz"
            className={inputClass}
          />
        </Field>
        {fieldError('username')}
      </div>
      <div>
        <Field label="Email" icon={AtSign}>
          <input type="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} onBlur={touch('email')} placeholder="you@company.com" className={inputClass} />
        </Field>
        {fieldError('email')}
      </div>
      <div className="space-y-2">
        <Field label="Password" icon={Lock}>
          <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {rules.map((r) => (
            <li key={r.label} className={`flex items-center gap-1 text-[11px] ${r.ok ? 'text-emerald-400' : 'text-slate-500'}`}>
              <Check className="w-3 h-3" /> {r.label}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Field label="Confirm password" icon={Lock}>
          <PasswordInput value={form.confirm} onChange={(v) => { set('confirm')(v); touch('confirm')(); }} autoComplete="new-password" />
        </Field>
        {fieldError('confirm')}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 flex items-center gap-2 text-xs text-rose-200">
          <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-600/20"
      >
        <UserPlus className="w-4 h-4" /> {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        {mode === 'approval'
          ? 'New accounts start as read-only viewers and need an administrator’s approval before first sign-in.'
          : 'New accounts start as read-only viewers. An administrator can change your role.'}
      </p>
    </form>
  );
}

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [signupMode, setSignupMode] = useState<SignupMode>('disabled');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthConfig()
      .then((c) => setSignupMode(c.signup_mode ?? 'disabled'))
      .catch(() => setSignupMode('disabled'));
  }, []);

  const canSignUp = signupMode !== 'disabled';

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

      {/* Sign in / Create account */}
      <section className="flex-1 lg:flex-none lg:w-[480px] flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 lg:hidden">
              <LogoMark />
              <Wordmark className="text-lg" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{tab === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
              <p className="text-sm text-slate-400 mt-1">
                {tab === 'signin' ? 'Sign in to your monitoring dashboard' : 'Get access to your team’s cluster dashboard'}
              </p>
            </div>
          </div>

          {canSignUp && (
            <div className="grid grid-cols-2 p-1 rounded-lg bg-slate-900 border border-slate-800" role="tablist">
              {(['signin', 'signup'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => { setTab(t); if (t === 'signup') setNotice(null); }}
                  className={`py-2 rounded-md text-xs font-semibold transition-colors ${
                    tab === t ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          {tab === 'signin' || !canSignUp ? (
            <>
              <SignInForm onLoggedIn={onLoggedIn} notice={notice} />
              <p className="text-center text-xs text-slate-500">
                {canSignUp ? (
                  <>
                    New to K8sPulse?{' '}
                    <button onClick={() => setTab('signup')} className="text-cyan-400 hover:text-cyan-300 font-medium">
                      Create an account
                    </button>
                  </>
                ) : (
                  'Accounts are created by your administrator.'
                )}
              </p>
            </>
          ) : (
            <>
              <SignUpForm
                mode={signupMode}
                onDone={(message) => {
                  setNotice(message);
                  setTab('signin');
                }}
              />
              <p className="text-center text-xs text-slate-500">
                Already have an account?{' '}
                <button onClick={() => setTab('signin')} className="text-cyan-400 hover:text-cyan-300 font-medium">
                  Sign in
                </button>
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
