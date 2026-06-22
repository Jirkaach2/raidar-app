import { useState, useEffect, useMemo, useRef } from 'react';
import { CalendarClock, Plus, Trash2, Bell, BellOff } from 'lucide-react';
import { useWipeStore, nextWipe, WipeSchedule } from '../../stores/wipe-store';
import { useMapStore } from '../../stores/map-store';
import './WipeTool.css';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtCountdown(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

function scheduleLabel(s: WipeSchedule): string {
  switch (s.type) {
    case 'weekly': return `Weekly · ${DAYS[s.day]} ${String(s.hour).padStart(2, '0')}:00`;
    case 'biweekly': return `Biweekly · ${DAYS[s.day]} ${String(s.hour).padStart(2, '0')}:00`;
    case 'monthly': return `Monthly · 1st ${DAYS[s.day]} ${String(s.hour).padStart(2, '0')}:00`;
    case 'date': return `One-off · ${new Date(s.date).toLocaleString()}`;
  }
}

export function WipeTool() {
  const { servers, add, remove, update } = useWipeStore();
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef<Record<string, number>>({});

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<WipeSchedule['type']>('weekly');
  const [day, setDay] = useState(4); // Thursday — Rust force-wipe day
  const [hour, setHour] = useState(19);
  const [dateVal, setDateVal] = useState('');
  const [anchor, setAnchor] = useState('');
  const [remind, setRemind] = useState(30);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Reminder check — fire an in-app toast once per upcoming wipe occurrence.
  useEffect(() => {
    for (const s of servers) {
      if (!s.remindMinutes) continue;
      const next = nextWipe(s.schedule, new Date(now));
      if (!next) continue;
      const mins = (next.getTime() - now) / 60000;
      if (mins > 0 && mins <= s.remindMinutes && firedRef.current[s.id] !== next.getTime()) {
        firedRef.current[s.id] = next.getTime();
        useMapStore.getState().addToast('WIPE INCOMING', `${s.name} wipes in ${Math.round(mins)} min`, 'warning');
      }
    }
  }, [now, servers]);

  const sorted = useMemo(() => {
    return servers
      .map((s) => ({ s, next: nextWipe(s.schedule, new Date(now)) }))
      .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));
  }, [servers, now]);

  const buildSchedule = (): WipeSchedule | null => {
    if (type === 'date') return dateVal ? { type: 'date', date: new Date(dateVal).toISOString() } : null;
    if (type === 'biweekly') return { type: 'biweekly', day, hour, anchor: anchor ? new Date(anchor).toISOString() : new Date().toISOString() };
    if (type === 'monthly') return { type: 'monthly', day, hour };
    return { type: 'weekly', day, hour };
  };

  const handleAdd = () => {
    const schedule = buildSchedule();
    if (!name.trim() || !schedule) return;
    add({ name: name.trim(), schedule, remindMinutes: remind });
    setName('');
  };

  return (
    <div className="wp">
      <header className="wp-header">
        <div className="wp-header-title">
          <span className="wp-header-icon"><CalendarClock size={20} /></span>
          <div>
            <h2>Wipe Schedule &amp; Countdown</h2>
            <p>Track your servers' wipe times with live countdowns and reminders.</p>
          </div>
        </div>
      </header>

      <div className="wp-body">
        {/* Add form */}
        <section className="wp-card wp-form">
          <h3 className="wp-card-h">Add a server</h3>
          <label className="wp-field"><span>Server name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rustafied EU Main" />
          </label>
          <label className="wp-field"><span>Schedule</span>
            <select value={type} onChange={(e) => setType(e.target.value as WipeSchedule['type'])}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly (1st of month)</option>
              <option value="date">One-off date</option>
            </select>
          </label>

          {type === 'date' ? (
            <label className="wp-field"><span>Wipe date &amp; time</span>
              <input type="datetime-local" value={dateVal} onChange={(e) => setDateVal(e.target.value)} />
            </label>
          ) : (
            <div className="wp-row">
              <label className="wp-field"><span>Day</span>
                <select value={day} onChange={(e) => setDay(parseInt(e.target.value))}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </label>
              <label className="wp-field"><span>Hour (local)</span>
                <select value={hour} onChange={(e) => setHour(parseInt(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select>
              </label>
            </div>
          )}

          {type === 'biweekly' && (
            <label className="wp-field"><span>A known recent wipe date (anchor)</span>
              <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
            </label>
          )}

          <label className="wp-field"><span>Remind me before</span>
            <select value={remind} onChange={(e) => setRemind(parseInt(e.target.value))}>
              <option value={0}>Off</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={180}>3 hours</option>
              <option value={1440}>1 day</option>
            </select>
          </label>

          <button className="wp-add" onClick={handleAdd} disabled={!name.trim()}><Plus size={14} /> Add server</button>
        </section>

        {/* Server list */}
        <section className="wp-list">
          {sorted.length === 0 && (
            <div className="wp-empty">
              <CalendarClock size={34} />
              <p>No servers tracked yet. Add one to see a live wipe countdown. Tip: Rust force-wipes on the first Thursday of each month.</p>
            </div>
          )}
          {sorted.map(({ s, next }) => {
            const ms = next ? next.getTime() - now : 0;
            const c = fmtCountdown(ms);
            const soon = ms > 0 && ms < 3 * 3600_000;
            return (
              <div key={s.id} className={`wp-server ${soon ? 'wp-server--soon' : ''}`}>
                <div className="wp-server-top">
                  <div className="wp-server-name">{s.name}</div>
                  <div className="wp-server-actions">
                    <button
                      className="wp-icon-btn"
                      title={s.remindMinutes ? `Reminder ${s.remindMinutes}m before` : 'Reminder off'}
                      onClick={() => update(s.id, { remindMinutes: s.remindMinutes ? 0 : 30 })}
                    >
                      {s.remindMinutes ? <Bell size={13} /> : <BellOff size={13} />}
                    </button>
                    <button className="wp-icon-btn wp-icon-btn--danger" title="Remove" onClick={() => remove(s.id)}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="wp-countdown">
                  <div className="wp-unit"><b>{c.d}</b><span>days</span></div>
                  <div className="wp-sep">:</div>
                  <div className="wp-unit"><b>{String(c.h).padStart(2, '0')}</b><span>hrs</span></div>
                  <div className="wp-sep">:</div>
                  <div className="wp-unit"><b>{String(c.m).padStart(2, '0')}</b><span>min</span></div>
                  <div className="wp-sep">:</div>
                  <div className="wp-unit"><b>{String(c.s).padStart(2, '0')}</b><span>sec</span></div>
                </div>
                <div className="wp-server-meta">
                  <span>{scheduleLabel(s.schedule)}</span>
                  {next && <span className="wp-next">{next.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
