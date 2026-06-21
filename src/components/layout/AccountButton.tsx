import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { Crown, LogOut, ExternalLink } from 'lucide-react';
import './AccountButton.css';

const PLAN_CLASS: Record<string, string> = { Scout: 'free', Raider: 'raider', Clan: 'clan' };

export default function AccountButton() {
  const { user, planName, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const prefs = (user.prefs || {}) as Record<string, unknown>;
  const avatar = (typeof prefs.avatarUrl === 'string' && prefs.avatarUrl) || (typeof prefs.steamAvatar === 'string' ? prefs.steamAvatar : '');
  const initial = (user.name || user.email || 'R')[0].toUpperCase();
  const planCls = PLAN_CLASS[planName] || 'free';

  const openManage = async () => {
    try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('open_external_url', { url: 'https://raidar.tech/dashboard' }); }
    catch { window.open('https://raidar.tech/dashboard', '_blank'); }
  };

  return (
    <div className="acct">
      <button className={`acct-trigger ${planCls}`} onClick={() => setOpen((o) => !o)} title={`${user.name || user.email} · ${planName}`}>
        <span className="acct-av">{avatar ? <img src={avatar} alt="" /> : initial}</span>
        <span className="acct-name">{user.name || user.email}</span>
        <span className="acct-plan"><Crown size={11} /> {planName}</span>
      </button>

      {open && (
        <>
          <div className="acct-scrim" onClick={() => setOpen(false)} />
          <div className="acct-pop">
            <div className="acct-head">
              <span className={`acct-av lg ${planCls}`}>{avatar ? <img src={avatar} alt="" /> : initial}</span>
              <div className="acct-id">
                <b>{user.name || 'Raidar user'}</b>
                <span>{user.email}</span>
              </div>
            </div>
            <div className={`acct-planbox ${planCls}`}>
              <Crown size={15} />
              <div><span className="acct-planbox-l">Current plan</span><b>{planName}</b></div>
              <button className="acct-manage" onClick={openManage} title="Manage on raidar.tech">Manage <ExternalLink size={11} /></button>
            </div>
            {planName === 'Scout' && <p className="acct-upsell">Free plan. Upgrade on raidar.tech for more servers and automation.</p>}
            <button className="acct-logout" onClick={() => { setOpen(false); logout(); }}><LogOut size={13} /> Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}
