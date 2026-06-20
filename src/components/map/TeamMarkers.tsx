import React from 'react';
import { useMapStore } from '../../stores/map-store';
import { useTeamStore } from '../../stores/team-store';

/**
 * Renders live teammate positions on the map as small colored dots with a name
 * label. (No rotation arrow — Rust+ doesn't reliably expose teammate facing.)
 */
const TeamMarkers = React.memo(function TeamMarkers() {
  const showTeam = useMapStore(s => s.showTeam);
  const members = useTeamStore(s => s.members);

  if (!showTeam || members.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 7 }}>
      {members.map((m) => {
        if (m.status === 'offline') return null;
        if (m.x === undefined || m.y === undefined) return null;
        const dead = m.status === 'dead';
        const color = m.isSelf ? '#6fcf73' : (m.isLeader ? '#f5c451' : '#58c6e8');

        return (
          <div
            key={m.id}
            style={{
              position: 'absolute',
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              transition: 'left 1s linear, top 1s linear',
            }}
          >
            {dead ? (
              <svg viewBox="0 0 24 24" fill="#ef4444" stroke="#000" strokeWidth="1" style={{ width: 9, height: 9, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}>
                <path d="M12 2C7.6 2 4 5.4 4 9.6c0 2.4 1.1 4.3 2.8 5.6V18a1 1 0 0 0 1 1h.7v1.5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V19h.7a1 1 0 0 0 1-1v-2.8C18.9 13.9 20 12 20 9.6 20 5.4 16.4 2 12 2z" />
                <circle cx="9" cy="10" r="1.6" fill="#000" /><circle cx="15" cy="10" r="1.6" fill="#000" />
              </svg>
            ) : (
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: color,
                  border: '1.5px solid rgba(0,0,0,0.85)',
                  boxShadow: `0 0 5px ${color}`,
                }}
              />
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 5, fontWeight: 700, color, textShadow: '0 1px 2px rgba(0,0,0,1)', whiteSpace: 'nowrap' }}>
              {m.name}
            </span>
          </div>
        );
      })}
    </div>
  );
});

export default TeamMarkers;
