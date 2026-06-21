import { useEffect, useState, type FormEvent } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { Crown, LogOut, X, User as UserIcon, ShieldCheck, ExternalLink } from 'lucide-react';
import './AccountButton.css';

const PLAN_CLASS: Record<string, string> = { Scout: 'free', Raider: 'raider', Clan: 'clan' };

export default function AccountButton() {
  const { user, planName, loading, busy, error, init, login, register, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => { init(); }, [init]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'register') await register(name, email, password);
      else await login(email, password);
      setPassword('');
    } catch { /* error shown from store */ }
  };

  const planCls = PLAN_CLASS[planName] || 'free';

  return (
    <div className="acct">
      <button className={`acct-trigger ${user ? planCls : ''}`} onClick={() => setOpen((o) => !o)} title={user ? `Signed in · ${planName} plan` : 'Sign in to Raidar'}>
        {user ? (
          <>
            <span className="acct-av">{(user.name || user.email || 'R')[0].toUpperCase()}</span>
            <span className="acct-plan"><Crown size={11} /> {planName}</span>
          </>
        ) : (
          <><UserIcon size={13} /> {loading ? '…' : 'Sign in'}</>
        )}
      </button>

      {open && (
        <>
          <div className="acct-scrim" onClick={() => setOpen(false)} />
          <div className="acct-pop">
            <button className="acct-x" onClick={() => setOpen(false)}><X size={14} /></button>
            {user ? (
              <div className="acct-card">
                <div className="acct-card-head">
                  <span className={`acct-av lg ${planCls}`}>{(user.name || user.email || 'R')[0].toUpperCase()}</span>
                  <div className="acct-id">
                    <b>{user.name || 'Raidar user'}</b>
                    <span>{user.email}</span>
                  </div>
                </div>
                <div className={`acct-planbox ${planCls}`}>
                  <Crown size={15} />
                  <div><span className="acct-planbox-l">Current plan</span><b>{planName}</b></div>
                  <a className="acct-manage" href="https://raidar.tech/dashboard" target="_blank" rel="noreferrer" title="Manage on raidar.tech">Manage <ExternalLink size={11} /></a>
                </div>
                {planName === 'Scout' && <p className="acct-upsell">You're on the free plan. Upgrade on raidar.tech to link more servers and unlock automation.</p>}
                <button className="acct-logout" onClick={logout}><LogOut size={13} /> Sign out</button>
              </div>
            ) : (
              <form className="acct-form" onSubmit={submit}>
                <div className="acct-form-head"><ShieldCheck size={16} /> {mode === 'register' ? 'Create your Raidar account' : 'Sign in to Raidar'}</div>
                {mode === 'register' && <input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} required />}
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                {error && <div className="acct-err">{error}</div>}
                <button className="acct-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
                <button type="button" className="acct-switch" onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}>
                  {mode === 'login' ? 'New to Raidar? Create an account' : 'Already have an account? Sign in'}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
