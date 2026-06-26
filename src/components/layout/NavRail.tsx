import { useTeamStore } from '@/stores/team-store';
import { useNotificationsStore } from '@/stores/notifications-store';
import './NavRail.css';

export type NavPage = 'map' | 'team' | 'vending' | 'devices' | 'tools' | 'spy' | 'monuments' | 'notifications' | 'commands' | 'settings';

interface NavRailProps {
  active: NavPage;
  onNavigate: (page: NavPage) => void;
}

export default function NavRail({ active, onNavigate }: NavRailProps) {
  const unreadCount = useTeamStore((s) => s.unreadCount);
  const notifUnread = useNotificationsStore((s) => s.unreadCount);

  return (
    <nav className="navrail no-select">
      {/* Map */}
      <button
        className={`navrail__item ${active === 'map' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('map')}
        data-tooltip="Map"
        aria-label="Map"
      >
        <svg viewBox="0 0 24 24">
          <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      </button>

      {/* Team */}
      <button
        className={`navrail__item ${active === 'team' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('team')}
        data-tooltip="Team"
        aria-label="Team"
      >
        <svg viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        {unreadCount > 0 && (
          <span className="navrail__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {/* Vending */}
      <button
        className={`navrail__item ${active === 'vending' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('vending')}
        data-tooltip="Vending Machines"
        aria-label="Vending Machines"
      >
        <svg viewBox="0 0 24 24">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
          <rect x="6" y="4" width="12" height="10" />
          <line x1="8" y1="18" x2="16" y2="18" />
        </svg>
      </button>

      {/* Devices */}
      <button
        className={`navrail__item ${active === 'devices' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('devices')}
        data-tooltip="Smart Devices"
        aria-label="Smart Devices"
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M4.93 4.93l2.83 2.83" />
          <path d="M16.24 16.24l2.83 2.83" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="M4.93 19.07l2.83-2.83" />
          <path d="M16.24 7.76l2.83-2.83" />
        </svg>
      </button>

      <div className="navrail__sep" />

      {/* Tools */}
      <button
        className={`navrail__item ${active === 'tools' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('tools')}
        data-tooltip="Tools"
        aria-label="Tools"
      >
        <svg viewBox="0 0 24 24">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5z" />
        </svg>
      </button>



      {/* Rust Spy */}
      <button
        className={`navrail__item ${active === 'spy' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('spy')}
        data-tooltip="Rust Spy"
        aria-label="Rust Spy"
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        </svg>
      </button>

      {/* Monuments */}
      <button
        className={`navrail__item ${active === 'monuments' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('monuments')}
        data-tooltip="Monuments"
        aria-label="Monuments"
      >
        <svg viewBox="0 0 24 24">
          <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M17 18h1" />
          <path d="M12 18h1" />
          <path d="M7 18h1" />
        </svg>
      </button>

      {/* Notifications */}
      <button
        className={`navrail__item ${active === 'notifications' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('notifications')}
        data-tooltip="Notifications"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {notifUnread > 0 && (
          <span className="navrail__badge">{notifUnread > 9 ? '9+' : notifUnread}</span>
        )}
      </button>

      {/* Commands */}
      <button
        className={`navrail__item ${active === 'commands' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('commands')}
        data-tooltip="Commands"
        aria-label="Commands"
      >
        <svg viewBox="0 0 24 24">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </button>

      {/* Settings */}
      <button
        className={`navrail__item ${active === 'settings' ? 'navrail__item--active' : ''}`}
        onClick={() => onNavigate('settings')}
        data-tooltip="Settings"
        aria-label="Settings"
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <div className="navrail__spacer" />
    </nav>
  );
}
