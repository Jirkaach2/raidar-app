import { useEffect, useMemo, useState } from 'react';
import {
  Bell, BellRing, CheckCheck, Trash2, Ship, Plane, Package,
  Store, Siren, Skull, Tag, ShieldAlert, Inbox, type LucideIcon,
} from 'lucide-react';
import {
  useNotificationsStore,
  type NotificationEntry,
} from '../../stores/notifications-store';
import './NotificationsLog.css';

/** Per-category icon + accent color used for the row glyph and chip. */
const CATEGORY_META: Record<string, { icon: LucideIcon; color: string }> = {
  Cargo:   { icon: Ship,        color: 'var(--color-info)' },
  Chinook: { icon: Plane,       color: 'var(--color-info)' },
  Heli:    { icon: Plane,       color: 'var(--color-warning)' },
  Crate:   { icon: Package,     color: 'var(--color-warning)' },
  Vending: { icon: Store,       color: 'var(--color-success)' },
  Alarm:   { icon: Siren,       color: 'var(--color-danger)' },
  Death:   { icon: Skull,       color: 'var(--color-danger)' },
  Price:   { icon: Tag,         color: 'var(--color-success)' },
  Ban:     { icon: ShieldAlert, color: 'var(--color-accent)' },
};

const DEFAULT_META = { icon: Bell, color: 'var(--color-text-muted)' };

function metaFor(category?: string) {
  return (category && CATEGORY_META[category]) || DEFAULT_META;
}

/** Compact relative timestamp: "just now", "2m ago", "1h ago", "3d ago". */
function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

const ALL = '__all__';

export function NotificationsLog() {
  const entries = useNotificationsStore((s) => s.entries);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const remove = useNotificationsStore((s) => s.remove);
  const clear = useNotificationsStore((s) => s.clear);

  const [filter, setFilter] = useState<string>(ALL);
  // Ticks every ~30s so relative timestamps stay fresh without per-row timers.
  const [now, setNow] = useState<number>(() => Date.now());

  // Viewing the tab clears unread.
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  // Re-render relative times periodically; cleaned up on unmount.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Category buckets actually present in the log, each with a count.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = e.category ?? 'Other';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const visible = useMemo(() => {
    if (filter === ALL) return entries;
    return entries.filter((e) => (e.category ?? 'Other') === filter);
  }, [entries, filter]);

  return (
    <div className="ntf-log">
      <div className="ntf-topbar">
        <div className="ntf-title">
          <BellRing size={15} />
          <span>Notifications</span>
          {unreadCount > 0 && <span className="ntf-unread-pill">{unreadCount}</span>}
        </div>
        <div className="ntf-actions">
          <button
            type="button"
            className="ntf-btn"
            onClick={markAllRead}
            disabled={entries.length === 0}
          >
            <CheckCheck size={12} />
            <span>Mark all read</span>
          </button>
          <button
            type="button"
            className="ntf-btn ntf-btn--danger"
            onClick={clear}
            disabled={entries.length === 0}
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="ntf-chips">
          <button
            type="button"
            className={`ntf-chip${filter === ALL ? ' is-active' : ''}`}
            onClick={() => setFilter(ALL)}
          >
            All <span className="ntf-chip-count">{entries.length}</span>
          </button>
          {categories.map(({ name, count }) => {
            const { icon: Icon, color } = metaFor(name);
            return (
              <button
                key={name}
                type="button"
                className={`ntf-chip${filter === name ? ' is-active' : ''}`}
                onClick={() => setFilter(name)}
              >
                <Icon size={11} style={{ color }} />
                {name} <span className="ntf-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="ntf-list">
        {visible.length === 0 ? (
          <div className="ntf-empty">
            <Inbox size={32} />
            <p className="ntf-empty-title">No notifications yet</p>
            <p className="ntf-empty-sub">Events and alerts will show up here as they happen.</p>
          </div>
        ) : (
          visible.map((e) => <NotificationRow key={e.id} entry={e} now={now} onRemove={remove} />)
        )}
      </div>
    </div>
  );
}

function NotificationRow({
  entry,
  now,
  onRemove,
}: {
  entry: NotificationEntry;
  now: number;
  onRemove: (id: string) => void;
}) {
  const { icon: Icon, color } = metaFor(entry.category);
  const chipLabel = entry.category ?? entry.type;
  return (
    <div className={`ntf-row ntf-row--${entry.type}${entry.read ? '' : ' is-unread'}`}>
      {!entry.read && <span className="ntf-dot" aria-hidden="true" />}
      <span className="ntf-icon" style={{ color }}>
        <Icon size={16} />
      </span>
      <div className="ntf-body">
        <div className="ntf-row-head">
          <span className="ntf-chip-inline" style={{ color }}>{chipLabel}</span>
          {entry.grid && <span className="ntf-grid">{entry.grid}</span>}
          <span className="ntf-title-text">{entry.title}</span>
        </div>
        {entry.message && <div className="ntf-message">{entry.message}</div>}
      </div>
      <div className="ntf-meta">
        <span className="ntf-time">{relativeTime(entry.timestamp, now)}</span>
        <button
          type="button"
          className="ntf-remove"
          onClick={() => onRemove(entry.id)}
          aria-label="Dismiss notification"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
