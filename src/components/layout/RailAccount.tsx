import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { Crown, LogOut, ExternalLink } from 'lucide-react';
import './RailAccount.css';

const PLAN_CLASS: Record<string, string> = { Scout: 'free', Raider: 'raider', Clan: 'clan' };

export default function RailAccount() {
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
    <div className="railacct">
      <button
        className={`railacct__btn ${planCls}`}
        onClick={() => setOpen((o) => !o)}
        data-tooltip={`${user.name || user.email} · ${planName}`}
        aria-label="Account"
      >
        {avatar
          ? <img src={avatar} alt="" />
          : <span className="railacct__initial">{initial}</span>}
        <span className={`railacct__ring ${planCls}`} />
      </button>

      {open && (
        <>
          <div className="railacct__scrim" onClick={() => setOpen(false)} />
          <div className="railacct__pop">
            <div className="railacct__head">
              <span className={`railacct__av ${planCls}`}>{avatar ? <img src={avatar} alt="" /> : initial}</span>
              <div className="railacct__id">
                <b>{user.name || 'Raidar user'}</b>
                <span>{user.email}</span>
              </div>
            </div>
            <div className={`railacct__plan ${planCls}`}>
              <Crown size={15} />
              <div><span className="railacct__plan-l">Current plan</span><b>{planName}</b></div>
              <button className="railacct__manage" onClick={openManage} title="Manage on raidar.tech">Manage <ExternalLink size={11} /></button>
            </div>
            {planName === 'Scout' && <p className="railacct__upsell">Free plan. Upgrade on raidar.tech for more servers and automation.</p>}
            <button className="railacct__logout" onClick={() => { setOpen(false); logout(); }}><LogOut size={13} /> Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}
