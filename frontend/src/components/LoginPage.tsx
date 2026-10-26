import { useEffect, useState } from 'react';
import {
  AtSign, BellRing, Bot, Check, CheckCircle2, Clock, Eye, EyeOff, Gauge, KeyRound, Lock, LogIn, ShieldCheck,
  User, UserCog, UserPlus, Users, XCircle,
} from 'lucide-react';
import { AuthUser, Portal, SignupMode, fetchAuthConfig, login, signup } from '../services/api';
import { AUTH_PATHS, navigate, usePath } from '../services/router';
import { LogoMark, Wordmark } from './Logo';

interface LoginPageProps {
  onLoggedIn: (user: AuthUser) => void;
}

interface AuthConfig {
  signupMode: SignupMode;
  adminSignup: boolean;
}

// Message carried from a registration page to the sign-in page it redirects to
let carriedNotice: string | null = null;

const THEME = {
  user: {
    accent: 'text-cyan-400',
    button: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-600/20',
    focus: 'focus:border-cyan-500 focus:ring-cyan-500/20',
    badge: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    link: 'text-cyan-400 hover:text-cyan-300',
  },
  admin: {
    accent: 'text-amber-400',
    button: 'from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/20',
    focus: 'focus:border-amber-500 focus:ring-amber-500/20',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    link: 'text-amber-400 hover:text-amber-300',
  },
} as const;

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ label, icon: Icon, hint, children }: { label: string; icon: typeof User; hint?: string; children: React.ReactNode }) {
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

function inputClass(portal: Portal) {
  return `w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 ${THEME[portal].focus}`;
}

function PasswordInput({
  value, onChange, autoComplete, portal, onBlur,
}: { value: string; onChange: (v: string) => void; autoComplete: string; portal: Portal; onBlur?: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <input
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass(portal)} pr-10`}
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

function SubmitButton({ portal, busy, icon: Icon, label, busyLabel, disabled }: {
  portal: Portal; busy: boolean; icon: typeof LogIn; label: string; busyLabel: string; disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={`w-full py-2.5 rounded-lg bg-gradient-to-r ${THEME[portal].button} disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg`}
    >
      <Icon className="w-4 h-4" /> {busy ? busyLabel : label}
    </button>
  );
}

function Alert({ tone, children }: { tone: 'error' | 'warn' | 'ok'; children: React.ReactNode }) {
  const styles = {
    error: 'bg-rose-950/40 border-rose-800 text-rose-200',
    warn: 'bg-amber-950/40 border-amber-800 text-amber-200',
    ok: 'bg-emerald-950/40 border-emerald-800 text-emerald-200',
  }[tone];
  const Icon = tone === 'error' ? XCircle : tone === 'warn' ? Clock : CheckCircle2;
  return (
    <div className={`p-3 rounded-lg border flex items-start gap-2 text-xs ${styles}`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-px" /> <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Sign in

function SignInForm({ portal, onLoggedIn }: { portal: Portal; onLoggedIn: (u: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice] = useState(() => {
    const n = carriedNotice;
    carriedNotice = null;
    return n;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onLoggedIn(await login(username, password, portal));
    } catch (err) {
      setError((err as Error).message || 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const wrongPortal = error?.includes('sign-in page');
  const pending = error?.includes('approve');

  return (
    <form onSubmit={submit} className="space-y-5">
      {notice && <Alert tone="ok">{notice}</Alert>}
      <Field label="Username or email" icon={portal === 'admin' ? UserCog : User}>
        <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass(portal)} />
      </Field>
      <Field label="Password" icon={Lock}>
        <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" portal={portal} />
      </Field>

      {error && (
        <Alert tone={pending ? 'warn' : 'error'}>
          {error}
          {wrongPortal && (
            <button
              type="button"
              onClick={() => navigate(portal === 'admin' ? AUTH_PATHS.userLogin : AUTH_PATHS.adminLogin)}
              className="block mt-1.5 font-semibold underline"
            >
              Go to the {portal === 'admin' ? 'user' : 'administrator'} sign-in
            </button>
          )}
        </Alert>
      )}

      <SubmitButton
        portal={portal}
        busy={submitting}
        disabled={!username || !password}
        icon={LogIn}
        label={portal === 'admin' ? 'Sign in as administrator' : 'Sign in'}
        busyLabel="Signing in…"
      />
    </form>
  );
}

// ---------------------------------------------------------------- Registration

function RegisterForm({ portal, signupMode }: { portal: Portal; signupMode: SignupMode }) {
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '', confirm: '', key: '' });
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
    key: portal === 'admin' && !form.key.trim() ? 'Enter the administrator registration key' : null,
  };
  const valid = Object.values(errors).every((e) => e === null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ full_name: true, username: true, email: true, password: true, confirm: true, key: true });
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await signup(
        {
          full_name: form.full_name, username: form.username, email: form.email, password: form.password,
          ...(portal === 'admin' ? { registration_key: form.key } : {}),
        },
        portal,
      );
      carriedNotice = res.message;
      navigate(portal === 'admin' ? AUTH_PATHS.adminLogin : AUTH_PATHS.userLogin);
    } catch (err) {
      setError((err as Error).message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (key: keyof typeof errors) =>
    touched[key] && errors[key] ? <span className="block text-[11px] text-rose-400">{errors[key]}</span> : null;
  const ic = inputClass(portal);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <Field label="Full name" icon={User}>
          <input autoFocus autoComplete="name" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} onBlur={touch('full_name')} placeholder="Agil Faraz" className={ic} />
        </Field>
        {fieldError('full_name')}
      </div>
      <div>
        <Field label="Username" icon={AtSign} hint={touched.username && errors.username ? undefined : 'Lowercase letters, numbers, dots, dashes or underscores'}>
          <input autoComplete="username" value={form.username} onChange={(e) => set('username')(e.target.value.toLowerCase().replace(/\s/g, ''))} onBlur={touch('username')} placeholder="agil.faraz" className={ic} />
        </Field>
        {fieldError('username')}
      </div>
      <div>
        <Field label="Email" icon={AtSign}>
          <input type="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} onBlur={touch('email')} placeholder="you@company.com" className={ic} />
        </Field>
        {fieldError('email')}
      </div>
      <div className="space-y-2">
        <Field label="Password" icon={Lock}>
          <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" portal={portal} onBlur={touch('password')} />
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
          <PasswordInput value={form.confirm} onChange={(v) => { set('confirm')(v); touch('confirm')(); }} autoComplete="new-password" portal={portal} />
        </Field>
        {fieldError('confirm')}
      </div>
      {portal === 'admin' && (
        <div>
          <Field label="Administrator registration key" icon={KeyRound} hint={touched.key && errors.key ? undefined : 'Provided by whoever runs this K8sPulse server (ADMIN_REGISTRATION_KEY)'}>
            <input type="password" autoComplete="off" value={form.key} onChange={(e) => set('key')(e.target.value)} onBlur={touch('key')} className={ic} />
          </Field>
          {fieldError('key')}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <SubmitButton
        portal={portal}
        busy={submitting}
        icon={UserPlus}
        label={portal === 'admin' ? 'Create administrator account' : 'Create account'}
        busyLabel="Creating account…"
      />

      <p className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        {portal === 'admin'
          ? 'Administrators can approve users, change roles and manage alert policies. The account is active as soon as the key is accepted.'
          : signupMode === 'approval'
          ? 'New accounts start as read-only viewers and need an administrator’s approval before first sign-in.'
          : 'New accounts start as read-only viewers. An administrator can change your role.'}
      </p>
    </form>
  );
}

// ---------------------------------------------------------------- Page shell

const productPoints = [
  { icon: Gauge, title: 'Live cluster visibility', text: 'Nodes, pods, deployments, events and logs straight from the Kubernetes API.' },
  { icon: BellRing, title: 'Alerts that resolve themselves', text: 'Rules for CPU, memory, crash loops and restarts, evaluated every 30 seconds.' },
  { icon: Bot, title: 'Private AI SRE copilot', text: 'Root-cause analysis from a local LLM, so your cluster data never leaves your network.' },
];

const adminPoints = [
  { icon: Users, title: 'Approve who gets access', text: 'Review new sign-ups and approve or reject them before they can see the cluster.' },
  { icon: UserCog, title: 'Assign roles', text: 'Viewers are read-only, operators manage alerts, administrators manage people.' },
  { icon: BellRing, title: 'Own the alert policy', text: 'Create, tune and disable the rules that page your team.' },
];

function AuthShell({ portal, title, subtitle, children, footer }: {
  portal: Portal; title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode;
}) {
  const theme = THEME[portal];
  const points = portal === 'admin' ? adminPoints : productPoints;
  const glow = portal === 'admin'
    ? 'bg-[radial-gradient(ellipse_at_20%_10%,rgba(245,158,11,0.16),transparent_55%),radial-gradient(ellipse_at_90%_90%,rgba(234,88,12,0.14),transparent_50%)]'
    : 'bg-[radial-gradient(ellipse_at_20%_10%,rgba(6,182,212,0.18),transparent_55%),radial-gradient(ellipse_at_90%_90%,rgba(37,99,235,0.18),transparent_50%)]';

  return (
    <div className="min-h-[100dvh] w-full bg-[#0B0F19] flex font-sans">
      <section className="hidden lg:flex relative flex-1 overflow-hidden border-r border-slate-800/80 bg-[#0E1322]">
        <div className={`absolute inset-0 ${glow}`} />
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(148,163,184,1)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,1)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full max-w-2xl">
          <div className="flex items-center gap-3">
            <LogoMark />
            <Wordmark className="text-lg" />
          </div>
          <div className="space-y-8">
            <div className="space-y-4">
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-mono uppercase tracking-wider ${theme.badge}`}>
                {portal === 'admin' ? <ShieldCheck className="w-3.5 h-3.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                {portal === 'admin' ? 'Administrator portal' : 'Kubernetes observability'}
              </span>
              <h2 className="text-4xl xl:text-5xl font-bold leading-[1.1] text-white">
                {portal === 'admin' ? (
                  <>Run K8sPulse<br /><span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">for your team.</span></>
                ) : (
                  <>See your cluster.<br /><span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Fix incidents faster.</span></>
                )}
              </h2>
              <p className="text-slate-400 max-w-md leading-relaxed">
                {portal === 'admin'
                  ? 'Manage who can see your cluster, what they can change, and how your team is alerted.'
                  : 'A self-hosted dashboard with live metrics, smart alerting and an AI copilot that explains what broke and how to fix it.'}
              </p>
            </div>
            <ul className="space-y-5">
              {points.map(({ icon: Icon, title: t, text }) => (
                <li key={t} className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-5 h-5 ${theme.accent}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{t}</p>
                    <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500 font-mono">FastAPI · React · Prometheus · Grafana · Ollama</p>
        </div>
      </section>

      <section className="flex-1 lg:flex-none lg:w-[480px] flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 lg:hidden">
              <LogoMark />
              <Wordmark className="text-lg" />
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${theme.badge}`}>
              {portal === 'admin' ? <ShieldCheck className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
              {portal === 'admin' ? 'Administrator' : 'User'}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white">{title}</h1>
              <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
            </div>
          </div>
          {children}
          <div className="space-y-3 text-center text-xs text-slate-500">{footer}</div>
        </div>
      </section>
    </div>
  );
}

function PortalSwitch({ to }: { to: Portal }) {
  return (
    <div className="pt-3 border-t border-slate-800/80">
      {to === 'admin' ? (
        <button onClick={() => navigate(AUTH_PATHS.adminLogin)} className="inline-flex items-center gap-1.5 text-slate-400 hover:text-amber-300">
          <ShieldCheck className="w-3.5 h-3.5" /> Administrator? Sign in to the admin portal
        </button>
      ) : (
        <button onClick={() => navigate(AUTH_PATHS.userLogin)} className="inline-flex items-center gap-1.5 text-slate-400 hover:text-cyan-300">
          <User className="w-3.5 h-3.5" /> Not an administrator? Go to the user sign-in
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Pages

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const path = usePath();
  const [config, setConfig] = useState<AuthConfig>({ signupMode: 'disabled', adminSignup: false });

  useEffect(() => {
    fetchAuthConfig()
      .then((c) => setConfig({ signupMode: c.signup_mode ?? 'disabled', adminSignup: Boolean(c.admin_signup_enabled) }))
      .catch(() => undefined);
  }, []);

  // Any other address while signed out shows the user sign-in page
  const known = Object.values(AUTH_PATHS) as string[];
  useEffect(() => {
    if (!known.includes(path)) navigate(AUTH_PATHS.userLogin, { replace: true });
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  const userCanRegister = config.signupMode !== 'disabled';

  if (path === AUTH_PATHS.adminLogin) {
    return (
      <AuthShell
        portal="admin"
        title="Administrator sign-in"
        subtitle="Manage users, approvals and alert policies"
        footer={
          <>
            {config.adminSignup && (
              <p>
                Need an administrator account?{' '}
                <button onClick={() => navigate(AUTH_PATHS.adminRegister)} className={`font-medium ${THEME.admin.link}`}>
                  Register as administrator
                </button>
              </p>
            )}
            <PortalSwitch to="user" />
          </>
        }
      >
        <SignInForm key="admin" portal="admin" onLoggedIn={onLoggedIn} />
      </AuthShell>
    );
  }

  if (path === AUTH_PATHS.adminRegister) {
    return (
      <AuthShell
        portal="admin"
        title="Register an administrator"
        subtitle="Requires the registration key from your server"
        footer={
          <>
            <p>
              Already an administrator?{' '}
              <button onClick={() => navigate(AUTH_PATHS.adminLogin)} className={`font-medium ${THEME.admin.link}`}>Sign in</button>
            </p>
            <PortalSwitch to="user" />
          </>
        }
      >
        {config.adminSignup ? (
          <RegisterForm portal="admin" signupMode={config.signupMode} />
        ) : (
          <Alert tone="warn">
            Administrator registration is turned off on this server. Ask the person who runs K8sPulse to create your
            account, or to set ADMIN_REGISTRATION_KEY.
          </Alert>
        )}
      </AuthShell>
    );
  }

  if (path === AUTH_PATHS.userRegister) {
    return (
      <AuthShell
        portal="user"
        title="Create your account"
        subtitle="Get access to your team’s cluster dashboard"
        footer={
          <>
            <p>
              Already have an account?{' '}
              <button onClick={() => navigate(AUTH_PATHS.userLogin)} className={`font-medium ${THEME.user.link}`}>Sign in</button>
            </p>
            <PortalSwitch to="admin" />
          </>
        }
      >
        {userCanRegister ? (
          <RegisterForm portal="user" signupMode={config.signupMode} />
        ) : (
          <Alert tone="warn">Sign-up is turned off on this server. Ask an administrator to create an account for you.</Alert>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      portal="user"
      title="Welcome back"
      subtitle="Sign in to your monitoring dashboard"
      footer={
        <>
          <p>
            {userCanRegister ? (
              <>
                New to K8sPulse?{' '}
                <button onClick={() => navigate(AUTH_PATHS.userRegister)} className={`font-medium ${THEME.user.link}`}>Create an account</button>
              </>
            ) : (
              'Accounts are created by your administrator.'
            )}
          </p>
          <PortalSwitch to="admin" />
        </>
      }
    >
      <SignInForm key="user" portal="user" onLoggedIn={onLoggedIn} />
    </AuthShell>
  );
}
