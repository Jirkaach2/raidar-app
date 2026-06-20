import { useEffect, useMemo, useState } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { useTeamStore } from '@/stores/team-store';
import { useMapStore } from '@/stores/map-store';
import './StatusBar.css';

export default function StatusBar() {
  const { status, ping, serverUrl, serverInfo } = useConnectionStore();
  const members = useTeamStore((s) => s.members);
  const timeInfo = useMapStore((s) => s.timeInfo);
  const markers = useMapStore((s) => s.markers);
  const online = useMemo(() => members.filter((m) => m.status === 'online').length, [members]);
  const [time, setTime] = useState(formatTime());

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id == null) id = setInterval(() => setTime(formatTime()), 1000); };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => (document.hidden ? stop() : (setTime(formatTime()), start()));
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Live event presence for quick glance info. Memoized so the 1s clock tick
  // doesn't re-scan the marker array every second (markers are change-gated).
  const activeEvents = useMemo(() => ({
    cargo: markers.some((m) => m.type === 'cargo_ship'),
    heli: markers.some((m) => m.type === 'patrol_heli'),
    chinook: markers.some((m) => m.type === 'chinook'),
    crates: markers.filter((m) => m.type === 'crate').length,
    shops: markers.filter((m) => m.type === 'vending_machine').length,
  }), [markers]);

  // In-game phase from time info.
  let gamePhase: { label: string; color: string } | null = null;
  if (timeInfo) {
    const isDay = timeInfo.time >= timeInfo.sunrise && timeInfo.time < timeInfo.sunset;
    gamePhase = isDay
      ? { label: 'DAY', color: '#f5c451' }
      : { label: 'NIGHT', color: '#7aa2e8' };
  }

  const dotClass =
    status === 'connected'
      ? 'statusbar__dot--green'
      : status === 'connecting'
        ? 'statusbar__dot--yellow'
        : status === 'error'
          ? 'statusbar__dot--red'
          : 'statusbar__dot--gray';

  return (
    <footer className="statusbar no-select">
      <div className="statusbar__sweep" />

      {/* Connection */}
      <div className="statusbar__item">
        <span className={`statusbar__dot ${dotClass}`} />
        <span>{status.toUpperCase()}</span>
      </div>

      {/* Ping */}
      {status === 'connected' && (
        <div className="statusbar__item">
          <span style={{ color: ping < 80 ? 'var(--color-success)' : 'var(--color-warning)' }}>
            {ping}ms
          </span>
        </div>
      )}

      {/* Server */}
      <div className="statusbar__item statusbar__item--server-name">
        {serverInfo ? serverInfo.name : serverUrl.replace('ws://', '')}
      </div>

      {/* Map name */}
      {serverInfo && serverInfo.map && (
        <div className="statusbar__item">
          <span style={{ color: 'var(--color-text-dim)' }}>{serverInfo.map}</span>
        </div>
      )}

      <div className="statusbar__spacer" />

      {/* Live events ticker */}
      {status === 'connected' && (
        <div className="statusbar__item" style={{ gap: 10 }}>
          {activeEvents.cargo && <span style={{ color: '#06b6d4' }} title="Cargo Ship active">CARGO</span>}
          {activeEvents.heli && <span style={{ color: '#eab308' }} title="Patrol Helicopter active">HELI</span>}
          {activeEvents.chinook && <span style={{ color: '#a855f7' }} title="Chinook active">CH47</span>}
          {activeEvents.crates > 0 && <span style={{ color: '#f59e0b' }} title="Locked crates on map">CRATES {activeEvents.crates}</span>}
          {!activeEvents.cargo && !activeEvents.heli && !activeEvents.chinook && activeEvents.crates === 0 && (
            <span style={{ color: 'var(--color-text-dim)' }}>NO ACTIVE EVENTS</span>
          )}
        </div>
      )}

      {/* Shops tracked */}
      {status === 'connected' && activeEvents.shops > 0 && (
        <div className="statusbar__item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12, marginRight: 4, color: 'var(--color-success)' }}>
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span style={{ color: 'var(--color-success)' }}>{activeEvents.shops}</span>
          <span>&nbsp;SHOPS</span>
        </div>
      )}

      {/* In-game day/night phase */}
      {gamePhase && (
        <div className="statusbar__item">
          <span style={{ color: gamePhase.color, fontWeight: 700 }}>{gamePhase.label}</span>
        </div>
      )}

      {/* Teammates online */}
      <div className="statusbar__item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12, marginRight: 4, color: 'var(--color-info)' }}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span style={{ color: 'var(--color-info)' }}>{online}<span style={{ color: 'var(--color-text-dim)' }}>/{members.length} TEAM</span></span>
      </div>

      {/* Server Population */}
      {serverInfo && (
        <div className="statusbar__item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12, marginRight: 4, color: 'var(--color-accent)' }}>
            <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
            <path d="M12 12l9 3"/>
          </svg>
          <span style={{ color: 'var(--color-accent)' }}>{serverInfo.players}<span style={{ color: 'var(--color-text-dim)' }}>/{serverInfo.max_players} PLAYERS</span></span>
          {serverInfo.queued_players > 0 && (
            <span style={{ color: 'var(--color-warning)', marginLeft: 4 }}>
              (+{serverInfo.queued_players} Q)
            </span>
          )}
        </div>
      )}

      {/* Grid size / Map size */}
      <div className="statusbar__item statusbar__item--accent">
        {serverInfo ? `${serverInfo.map_size}m (Seed: ${serverInfo.seed})` : '4000m'}
      </div>

      {/* Clock */}
      <div className="statusbar__time">{time}</div>
    </footer>
  );
}

function formatTime(): string {
  const d = new Date();
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
