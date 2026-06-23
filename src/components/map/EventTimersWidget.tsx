import React, { useEffect, useState } from 'react';
import { useEventsStore } from '../../stores/events-store';
import { useCrateStore } from '../../stores/crate-store';
import { isCurrentServer } from '../../utils/server';

/**
 * Live timers HUD for the map (bottom-right, above the Day/Night widget).
 *
 * Surfaces transient world events with a countdown:
 *   - Cargo Ship docking at a harbor (≈8 min stop).
 *   - Active locked-crate hack timers (cargo + monument crates).
 *   - Traveling Vendor / heli-crash presence (no timer).
 *
 * Reads from the events-store (rebuilt each poll) and the crate-store.
 */

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const CargoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
    <path d="M2 16l1.5-5h17L22 16" />
    <path d="M2 16c1.5 2 3 2 4.5 0s3-2 4.5 0 3 2 4.5 0 3-2 4.5 0" />
    <path d="M6 11V7h6l3 4" />
  </svg>
);
const CrateIcon = () => (
  <img src="/images/markers/locked_crate.webp" alt="" style={{ width: 14, height: 14, objectFit: 'contain', filter: 'drop-shadow(0 0 1px #000)' }} />
);
const VendorIcon = () => (
  <img src="/images/markers/icon_map_traveling-vendor.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
);
const CrashIcon = () => (
  <img src="/images/markers/heli-crate.webp" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
);
const DeepSeaIcon = () => (
  <img src="/images/markers/deep_sea.png" alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />
);

interface Row {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}

const EventTimersWidget = React.memo(function EventTimersWidget() {
  const events = useEventsStore(s => s.events);
  const crates = useCrateStore(s => s.markers);
  const [now, setNow] = useState(() => Date.now());

  const hasAny = Object.keys(events).length > 0 || crates.some(c => isCurrentServer(c.serverId));

  useEffect(() => {
    if (!hasAny) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id == null) id = setInterval(() => setNow(Date.now()), 1000); };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => (document.hidden ? stop() : (setNow(Date.now()), start()));
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [hasAny]);

  if (!hasAny) return null;

  const rows: Row[] = [];

  for (const e of Object.values(events)) {
    if (e.kind === 'cargo_dock') {
      const remaining = e.endsAt - now;
      rows.push({
        key: e.id,
        icon: <CargoIcon />,
        label: e.grid ? `Cargo Docked · ${e.grid}` : 'Cargo Docked',
        value: remaining > 0 ? `leaves ${fmt(remaining)}` : 'leaving',
        accent: remaining > 0 && remaining < 90_000 ? '#f5c451' : '#58c6e8',
      });
    } else if (e.kind === 'vendor') {
      rows.push({ key: e.id, icon: <VendorIcon />, label: e.label, value: '', accent: '#9c7dff' });
    } else if (e.kind === 'crash') {
      // The downed Patrol Heli leaves locked crates that open ~4:30 after the
      // crash. Show that countdown so the Active Events panel has a live timer
      // (we don't spawn a separate crate-store timer to avoid a duplicate
      // marker). If a dedicated heli-crash crate timer does exist, defer to it.
      const hasHeliCrateTimer = crates.some(c => isCurrentServer(c.serverId) && c.target.startsWith('heli_crash_'));
      if (!hasHeliCrateTimer) {
        const HELI_CRATE_MS = 270_000; // 4:30
        const unlockAt = e.startedAt + HELI_CRATE_MS;
        const remaining = unlockAt - now;
        const open = remaining <= 0;
        rows.push({
          key: e.id,
          icon: <CrashIcon />,
          label: e.grid ? `Heli Crate · ${e.grid}` : e.label,
          value: open ? 'OPEN' : `unlocks ${fmt(remaining)}`,
          accent: open ? '#6fcf73' : remaining < 60_000 ? '#f5c451' : '#ff7043',
        });
      }
    } else if (e.kind === 'deep_sea') {
      rows.push({ key: e.id, icon: <DeepSeaIcon />, label: 'Deep Sea active', value: '', accent: '#38bdf8' });
    }
  }

  for (const c of crates) {
    if (!isCurrentServer(c.serverId)) continue;
    const remaining = c.unlocksAt - now;
    const open = remaining <= 0;
    const isHeliCrash = c.target.startsWith('heli_crash_');
    rows.push({
      key: c.id,
      icon: isHeliCrash ? <CrashIcon /> : <CrateIcon />,
      label: isHeliCrash
        ? `Heli Crash ${c.label.replace('Heli Crash ', '')}`
        : (c.target === 'cargo' && c.cargoPos
          ? `Cargo ${c.cargoPos.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}`
          : c.label),
      value: open ? 'OPEN' : `unlocks ${fmt(remaining)}`,
      accent: open ? '#6fcf73' : remaining < 60_000 ? '#f5c451' : '#ff9100',
    });
  }

  if (rows.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        borderRadius: 8,
        minWidth: 168,
        maxWidth: 220,
        background: 'rgba(11, 13, 17, 0.82)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        fontFamily: 'var(--font-mono)',
        color: '#e8e2d9',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: '1.5px', color: '#8b857c', fontWeight: 700, marginBottom: 2 }}>
        ACTIVE EVENTS
      </div>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: r.accent, fontSize: 11, fontWeight: 700, overflow: 'hidden' }}>
            <span style={{ display: 'flex', flexShrink: 0 }}>{r.icon}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e8e2d9' }}>{r.label}</span>
          </span>
          {r.value && (
            <span style={{ fontSize: 11, fontWeight: 700, color: r.accent, flexShrink: 0 }}>{r.value}</span>
          )}
        </div>
      ))}
    </div>
  );
});

export default EventTimersWidget;
