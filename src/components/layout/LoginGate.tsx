import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { Mail, Lock, User as UserIcon, ShieldCheck, Globe, Link as LinkIcon, Loader2, Minus, X } from 'lucide-react';
import './LoginGate.css';

async function winCtl(action: 'minimize' | 'close') {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    if (action === 'minimize') await w.minimize(); else await w.close();
  } catch { /* browser dev */ }
}

/** Raidar mark — hex bolt (rust) enclosing a radar sweep + ping. */
function RadarMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="gate-mark">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none">
        <path d="M12 5 L18.06 8.5 L18.06 15.5 L12 19 L5.94 15.5 L5.94 8.5 Z" />
        <line x1="12" y1="12" x2="16.1" y2="7.9" />
      </g>
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="16.1" cy="7.9" r="1.4" fill="currentColor" />
    </svg>
  );
}

export default function LoginGate() {
  const { busy, error, notice, login, register, loginWithCode } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [webMode, setWebMode] = useState(false);
  const [code, setCode] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'register') await register(name, email, password);
      else await login(email, password);
    } catch { /* error surfaced by store */ }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    try { await loginWithCode(code); } catch { /* error surfaced by store */ }
  };

  const openWeb = async () => {
    const url = 'https://raidar.tech/link-app';
    setWebMode(true);
    try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('open_external_url', { url }); }
    catch { try { window.open(url, '_blank'); } catch { /* ignore */ } }
  };

  return (
    <div className="gate">
      {/* Draggable title bar so the window can be moved/closed before login. */}
      <div className="gate__titlebar" data-tauri-drag-region>
        <span className="gate__tb-title" data-tauri-drag-region>RAIDAR</span>
        <div className="gate__tb-controls">
          <button className="gate__tb-btn" onClick={() => winCtl('minimize')} aria-label="Minimize"><Minus size={15} /></button>
          <button className="gate__tb-btn gate__tb-close" onClick={() => winCtl('close')} aria-label="Close"><X size={15} /></button>
        </div>
      </div>
      <div className="gate__scanlines" />
      <div className="gate__glow" />

      <div className="gate__card">
        <div className="gate__brand">
          <RadarMark />
          <span className="gate__title">RAIDAR</span>
        </div>
        <h1 className="gate__h1">{webMode ? 'Sign in with raidar.tech' : mode === 'register' ? 'Create your account' : 'Sign in to continue'}</h1>
        <p className="gate__sub">
          {webMode
            ? 'A browser tab opened on raidar.tech. Copy the code shown there and paste it below.'
            : mode === 'register'
              ? 'Make a Raidar account to use the desktop app.'
              : 'A Raidar account is required to use the app.'}
        </p>

        {notice && <div className="gate__notice"><Loader2 size={14} className="gate__spin" /> {notice}</div>}

        {webMode ? (
          <>
            <form className="gate__form" onSubmit={submitCode}>
              <label className="gate__field">
                <LinkIcon size={15} />
                <input placeholder="Paste your code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
              </label>
              {error && <div className="gate__err">{error}</div>}
              <button className="gate__submit" type="submit" disabled={busy || !code.trim()}>
                {busy ? <><Loader2 size={16} className="gate__spin" /> Signing in…</> : <><ShieldCheck size={16} /> Sign in</>}
              </button>
            </form>
            <button type="button" className="gate__switch" onClick={openWeb}>Didn’t get a code? Open raidar.tech again</button>
            <div className="gate__divider"><span>or</span></div>
            <button type="button" className="gate__web" onClick={() => { setWebMode(false); setCode(''); }}>
              Use email &amp; password instead
            </button>
          </>
        ) : (
          <>
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
              <Globe size={14} /> Sign in with raidar.tech
            </button>
          </>
        )}
      </div>

      <span className="gate__foot">Raidar · Tactical intelligence for Rust</span>
    </div>
  );
}
