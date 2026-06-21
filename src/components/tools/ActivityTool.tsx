import { useState, useEffect } from 'react';
import { useActivityStore, ACTIVITY_AFK_MS, ActivityKind } from '../../stores/activity-store';
import { Circle, Skull, Plus, Ship, ShieldAlert, Lock } from 'lucide-react';

function renderActivityIcon(kind: ActivityKind) {
  const size = 14;
  const style = { width: size, height: size, flexShrink: 0 };
  switch (kind) {
    case 'online':
      return <Circle size={size} style={{ ...style, color: '#6fcf73', fill: '#6fcf73' }} />;
    case 'offline':
      return <Circle size={size} style={{ ...style, color: '#8b857c' }} />;
    case 'death':
      return <Skull size={size} style={{ ...style, color: '#ef4444', fill: 'rgba(0,0,0,0.15)' }} />;
    case 'respawn':
      return <Plus size={size} style={{ ...style, color: '#6fcf73' }} />;
    case 'event_cargo':
      return <Ship size={size} style={{ ...style, color: '#06b6d4' }} />;
    case 'event_heli':
      return <ShieldAlert size={size} style={{ ...style, color: '#eab308' }} />;
    case 'event_chinook':
      return <ShieldAlert size={size} style={{ ...style, color: '#a855f7' }} />;
    case 'event_crate':
      return <Lock size={size} style={{ ...style, color: '#f59e0b' }} />;
    default:
      return null;
  }
}

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export function ActivityTool() {
  const log = useActivityStore((s) => s.log);
  const stats = useActivityStore((s) => s.stats);
  const sessionStart = useActivityStore((s) => s.sessionStart);
  const clear = useActivityStore((s) => s.clear);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const members = Object.values(stats);
  const sessionHours = Math.max(0.01, (Date.now() - sessionStart) / 3_600_000);

  return (
    <div className="activity">
      {/* Death / K-D-style stats */}
      <div className="activity-section-head"><h3>TEAM STATS (this session)</h3></div>
      {members.length === 0 ? (
        <div className="activity-empty">No team data yet. Connect and join a team.</div>
      ) : (
        <div className="activity-stats">
          {members.map((m) => {
            const afk = m.online && m.alive && Date.now() - m.lastMovedAt > ACTIVITY_AFK_MS;
            const dph = (m.deaths / sessionHours).toFixed(1);
            return (
              <div key={m.steamId} className="activity-stat-card">
                <div className="activity-stat-head">
                  <span className={`activity-dot ${m.online ? (m.alive ? 'on' : 'dead') : 'off'}`} />
                  <span className="activity-stat-name">{m.name}</span>
                  {afk && <span className="activity-afk">AFK</span>}
                </div>
                <div className="activity-stat-row">
                  <span>Deaths</span><span className="activity-stat-val">{m.deaths} <span className="activity-dim">({dph}/h)</span></span>
                </div>
                <div className="activity-stat-row">
                  <span>Last seen</span><span className="activity-stat-val">{m.lastSeenGrid || '??'}</span>
                </div>
                <div className="activity-stat-row">
                  <span>Last moved</span><span className="activity-stat-val">{ago(m.lastMovedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event / activity timeline */}
      <div className="activity-section-head" style={{ marginTop: 16 }}>
        <h3>ACTIVITY LOG</h3>
        {log.length > 0 && <button className="activity-clear" onClick={clear}>Clear</button>}
      </div>
      {log.length === 0 ? (
        <div className="activity-empty">No activity recorded yet.</div>
      ) : (
        <div className="activity-log">
          {log.map((e) => {
            const isDeath = e.kind === 'death';
            const isOffline = e.label.includes('OFFLINE');
            return (
              <div 
                key={e.id} 
                className="activity-log-row" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  padding: isDeath ? '6px 10px' : '4px 6px',
                  background: isDeath ? (isOffline ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.06)') : 'transparent',
                  borderLeft: isDeath ? '2px solid var(--color-danger)' : '2px solid transparent',
                  borderRadius: '3px',
                  margin: isDeath ? '4px 0' : '2px 0',
                  fontWeight: isDeath ? '600' : 'normal',
                }}
              >
                <span className="activity-log-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}>
                  {renderActivityIcon(e.kind)}
                </span>
                <span className="activity-log-label" style={{ flex: 1, color: isOffline ? '#ef4444' : 'inherit' }}>
                  {e.label}
                  {e.detail ? <span className="activity-dim"> · {e.detail}</span> : null}
                </span>
                <span className="activity-log-time" style={{ fontSize: '10px', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>{ago(e.timestamp)}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="activity-note" style={{ marginTop: 12 }}>Note: Rust+ exposes deaths but not kills, so this is a death tracker, not full K/D.</div>
    </div>
  );
}
