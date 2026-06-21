import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { Mail, Lock, User as UserIcon, ShieldCheck, ExternalLink, Loader2 } from 'lucide-react';
import './LoginGate.css';

/** Raidar radar-scope mark, matching the title bar / web branding. */
function RadarMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="gate-mark">
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.8" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.55" />
      <path d="M12 12 L11.2 2.85 A9.2 9.2 0 0 1 19.05 6.05 Z" fill="currentColor" fillOpacity="0.22" />
      <line x1="12" y1="12" x2="19.05" y2="6.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16.3" cy="7.0" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default function LoginGate() {
  const { busy, error, login, register } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'register') await register(name, email, password);
      else await login(email, password);
    } catch { /* error surfaced by store */ }
  };

  const openWeb = async () => {
    const url = 'https://raidar.tech/login';
    try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('open_external_url', { url }); }
    catch { try { window.open(url, '_blank'); } catch { /* ignore */ } }
  };

  return (
    <div className="gate" data-tauri-drag-region>
      <div className="gate__scanlines" />
      <div className="gate__glow" />

      <div className="gate__card">
        <div className="gate__brand">
          <RadarMark />
          <span className="gate__title">RAIDAR</span>
        </div>
        <h1 className="gate__h1">{mode === 'register' ? 'Create your account' : 'Sign in to continue'}</h1>
        <p className="gate__sub">
          {mode === 'register'
            ? 'Make a Raidar account to use the desktop app.'
            : 'A Raidar account is required to use the app.'}
        </p>

        <form className="gate__form" onSubmit={submit}>
          {mode === 'register' && (
            <label className="gate__field">
              <UserIcon size={15} />
              <input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}
          <label className="gate__field">
            <Mail size={15} />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="gate__field">
            <Lock size={15} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </label>

          {error && <div className="gate__err">{error}</div>}

          <button className="gate__submit" type="submit" disabled={busy}>
            {busy ? <><Loader2 size={16} className="gate__spin" /> Please wait…</> : <><ShieldCheck size={16} /> {mode === 'register' ? 'Create account' : 'Sign in'}</>}
          </button>
        </form>

        <button type="button" className="gate__switch" onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}>
          {mode === 'login' ? 'New to Raidar? Create an account' : 'Already have an account? Sign in'}
        </button>

        <div className="gate__divider"><span>or</span></div>
        <button type="button" className="gate__web" onClick={openWeb}>
          Manage your account on raidar.tech <ExternalLink size={13} />
        </button>
      </div>

      <span className="gate__foot">Raidar · Tactical intelligence for Rust</span>
    </div>
  );
}
