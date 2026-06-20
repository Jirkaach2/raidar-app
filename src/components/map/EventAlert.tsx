import React, { useEffect, useRef, useState } from 'react';
import { useMapStore } from '../../stores/map-store';

const EventAlert = React.memo(function EventAlert() {
  const markers = useMapStore(s => s.markers);
  const [alert, setAlert] = useState<{ id: string; title: string; desc: string; type: string } | null>(null);
  const alertedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Events worth announcing the first time we see them.
    const events = markers.filter(
      m => m.type === 'crate' || m.type === 'patrol_heli' || m.type === 'cargo_ship' || m.type === 'chinook'
    );

    // Prune ids that are no longer present so re-spawns alert again.
    const presentIds = new Set(events.map(e => e.id));
    alertedIds.current.forEach(id => {
      if (!presentIds.has(id)) alertedIds.current.delete(id);
    });

    // Find the newest event we haven't announced yet (and is recent).
    const fresh = [...events]
      .filter(m => !alertedIds.current.has(m.id) && Date.now() - m.timestamp < 15000)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (fresh) {
      alertedIds.current.add(fresh.id);
      setAlert({
        id: fresh.id,
        title: (fresh.label || fresh.type).toUpperCase(),
        desc: fresh.detail ? fresh.detail : '',
        type: fresh.type,
      });

      const timer = setTimeout(() => setAlert(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [markers]);

  if (!alert) return null;

  const TYPE_COLOR: Record<string, string> = {
    crate: '#f59e0b',
    patrol_heli: '#eab308',
    cargo_ship: '#06b6d4',
    chinook: '#a855f7',
  };
  const accent = TYPE_COLOR[alert.type] || '#e84545';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(11, 13, 17, 0.9)',
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${accent}`,
        padding: '5px 10px',
        borderRadius: 5,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        backdropFilter: 'blur(4px)',
        pointerEvents: 'none',
        zIndex: 45,
        boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
        maxWidth: 260,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0, boxShadow: `0 0 6px ${accent}` }} />
      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.5px' }}>NEW</span>
      <span style={{ color: accent, fontWeight: 700, fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
        {alert.title}
      </span>
      {alert.desc && (
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          · {alert.desc}
        </span>
      )}
    </div>
  );
});

export default EventAlert;
