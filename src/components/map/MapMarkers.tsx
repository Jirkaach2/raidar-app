import React from 'react';
import { useMapStore, DeathLogEntry } from '../../stores/map-store';
import { useTeamStore } from '../../stores/team-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useEventsStore } from '../../stores/events-store';
import { isDeepSeaShop } from '../../utils/shops';


const MARKER_COLORS: Record<string, string> = {
  player: '#58c6e8',
  vending_machine: '#10b981',
  explosion: '#ef4444',
  crate: '#f59e0b',
  patrol_heli: '#eab308',
  cargo_ship: '#06b6d4',
  chinook: '#a855f7',
  vendor: '#9c7dff',
  death: '#ef4444',
};

/** Distinct accent for deep-sea vendor shops so they stand out from safe-zone
 *  vending machines. */
const DEEP_SEA_COLOR = '#2f8fd6';

function getMarkerIcon(type: string) {
  switch (type) {
    case 'vending_machine':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 7, height: 7, color: '#fff' }}>
          {/* Vending machine cabinet */}
          <rect x="6" y="2" width="12" height="20" rx="1.5" />
          <line x1="11" y1="2" x2="11" y2="16" />
          <rect x="7.8" y="4" width="1.6" height="2" rx="0.4" fill="currentColor" stroke="none" />
          <rect x="7.8" y="8" width="1.6" height="2" rx="0.4" fill="currentColor" stroke="none" />
          <rect x="13" y="5" width="3" height="9" rx="0.5" />
          <line x1="13" y1="18.5" x2="16" y2="18.5" />
        </svg>
      );
    case 'explosion':
      return (
        <div style={{ position: 'relative', width: 13, height: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/images/markers/explosion_sprite.png" alt="Heli Crash" style={{ width: 13, height: 13, objectFit: 'contain', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.9))' }} />
          {/* Precise crash-point pip dead-center on the coordinate */}
          <span style={{ position: 'absolute', width: 2.5, height: 2.5, borderRadius: '50%', background: '#fff', boxShadow: '0 0 2px 0.5px rgba(0,0,0,0.9)' }} />
        </div>
      );
    case 'crate':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 9, height: 9, color: '#fff' }}>
          {/* Locked crate: box + padlock */}
          <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
          <path d="M3 7l9 4 9-4" />
          <path d="M12 11v10" />
          <rect x="9.5" y="9" width="5" height="4" rx="0.6" fill="currentColor" stroke="none" />
          <path d="M10.4 9V8a1.6 1.6 0 0 1 3.2 0v1" />
        </svg>
      );
    case 'patrol_heli':
      return (
        <div style={{ position: 'relative', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/images/markers/patrol_heli_full.png" alt="Patrol Heli" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          {/* Main rotor overlay */}
          <img src="/images/markers/rotor.png" alt="Rotor" className="rotor-spin-fast" style={{ position: 'absolute', top: -2, left: 0.5, width: 15, height: 15 }} />
        </div>
      );
    case 'cargo_ship':
      return (
        <svg viewBox="0 0 24 48" style={{ width: 13, height: 26, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}>
          {/* Ship hull pointing "up" (north); rotated by marker heading */}
          <path d="M12 1 C 16 8, 17 16, 17 26 L 17 40 C 17 44, 15 46, 12 46 C 9 46, 7 44, 7 40 L 7 26 C 7 16, 8 8, 12 1 Z"
            fill="#3a4654" stroke="#10151c" strokeWidth="1.4" strokeLinejoin="round" />
          {/* deck highlight */}
          <path d="M12 6 C 14.5 12, 15 18, 15 26 L 15 39 C 15 42, 13.5 43.5, 12 43.5 C 10.5 43.5, 9 42, 9 39 L 9 26 C 9 18, 9.5 12, 12 6 Z"
            fill="#566576" />
          {/* containers on deck */}
          <rect x="9" y="20" width="6" height="5" rx="0.6" fill="#c98a3c" stroke="#10151c" strokeWidth="0.7" />
          <rect x="9" y="27" width="6" height="5" rx="0.6" fill="#b5662f" stroke="#10151c" strokeWidth="0.7" />
        </svg>
      );
    case 'chinook':
      return (
        <div style={{ position: 'relative', width: 11, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/images/markers/heli_base.png" alt="Chinook" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          {/* Top rotor */}
          <img src="/images/markers/rotor.png" alt="Rotor" className="rotor-spin-fast" style={{ position: 'absolute', top: -3, left: -1.5, width: 14, height: 14 }} />
          {/* Bottom rotor */}
          <img src="/images/markers/rotor.png" alt="Rotor" className="rotor-spin-fast" style={{ position: 'absolute', bottom: -3, left: -1.5, width: 14, height: 14 }} />
        </div>
      );
    case 'death':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ width: 8, height: 8, color: '#fff' }}>
          {/* Skull */}
          <path d="M12 2C7.6 2 4 5.4 4 9.6c0 2.4 1.1 4.3 2.8 5.6V18a1 1 0 0 0 1 1h.7v1.5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V19h.7a1 1 0 0 0 1-1v-2.8C18.9 13.9 20 12 20 9.6 20 5.4 16.4 2 12 2z" />
          <circle cx="9" cy="10" r="1.7" fill="#000" />
          <circle cx="15" cy="10" r="1.7" fill="#000" />
          <path d="M12 13l-1 2.4h2L12 13z" fill="#000" />
        </svg>
      );
    case 'vendor':
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img 
            src="/images/markers/icon_map_traveling-vendor.png" 
            alt="Travelling Vendor" 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      );
    default:
      return null;
  }
}

const MapMarkers = React.memo(function MapMarkers() {
  const markers = useMapStore(s => s.markers);
  const selectedMarkerId = useMapStore(s => s.selectedMarkerId);
  const selectMarker = useMapStore(s => s.selectMarker);
  const showDeathMarkers = useMapStore(s => s.showDeathMarkers);
  const showVendingShops = useMapStore(s => s.showVendingShops);
  const deathLog = useMapStore(s => s.deathLog);
  // Image geometry — used to keep vending shops projected inside the playable
  // grid (the map image carries an ocean-margin border in pixels).
  const oceanMargin = useMapStore(s => s.oceanMargin || 0);
  const imageWidth = useMapStore(s => s.mapImageWidth || 0);
  const imageHeight = useMapStore(s => s.mapImageHeight || 0);
  const mapSize = useMapStore(s => s.mapSize || 0);

  const crashEvent = useEventsStore(s => s.events['crash']);
  const hasServerExplosion = markers.some(m => m.type === 'explosion');

  // Filter server markers
  const filteredMarkers = markers.filter((m) => {
    // Player markers are rendered by the richer TeamMarkers layer.
    if (m.type === 'player') return false;
    if (m.type === 'vending_machine') {
      if (!showVendingShops) return false;
      return true;
    }
    // Deaths: death markers are drawn by DeathLogMarkers (which handles persistence
    // and fading), so filter them out from standard markers to avoid duplicates.
    if (m.type === 'death') {
      return false;
    }
    // Crates, explosions, chinook, heli, cargo — always show (they're world events)
    return true;
  });

  // Inject virtual persistent crash site marker if no server explosion is active
  if (crashEvent && !hasServerExplosion && crashEvent.x !== undefined && crashEvent.y !== undefined) {
    filteredMarkers.push({
      id: 'crash_persistent',
      type: 'explosion',
      label: crashEvent.label,
      x: crashEvent.x,
      y: crashEvent.y,
      timestamp: crashEvent.startedAt,
    });
  }

  return (
    <div className="map-markers" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
      {/* ── Server Markers ── */}
      {filteredMarkers.map((marker) => {
        const isSelected = marker.id === selectedMarkerId;
        const isMovingEvent = marker.type === 'cargo_ship' || marker.type === 'patrol_heli' || marker.type === 'chinook' || marker.type === 'vendor';
        const isVending = marker.type === 'vending_machine';
        // Deep-sea vendor shops get their own accent + badge so they stand out
        // from safe-zone vending machines (detection by name / monument zone).
        const isDeepSea = isVending && isDeepSeaShop(marker.label, marker.x, marker.y);
        // Normal (non-deep-sea) shops occasionally report coordinates a touch
        // into the ocean margin; gently clamp THOSE into the in-grid band so
        // they don't float off as stray pins. Deep-sea shops are intentionally
        // offshore — they must render at their TRUE position OUTSIDE the grid
        // border (in the deep-ocean area beyond the playable band), so they are
        // never clamped into the grid. We only keep them within the rendered
        // image bounds [0,1] so they can't vanish entirely past the map edge.
        const marginX = imageWidth > 0 ? oceanMargin / imageWidth : 0;
        const marginY = imageHeight > 0 ? oceanMargin / imageHeight : 0;
        // Deep-sea shops sit OUT IN THE OCEAN beyond the playable grid. The
        // generic coordinate normalizer clamps everything to [0,1], which
        // collapses every offshore stall onto the exact image edge (and stacks
        // them in a corner where they're easy to miss / get clipped). For these
        // shops we re-project from the RAW world coords WITHOUT the [0,1] clamp
        // so they land in the ocean band on their true side of the map, then we
        // clamp only to a small visible inset so they're always on-screen and
        // clearly outside the grid border.
        const deepPos = (() => {
          const rawX = marker.raw?.x;
          const rawY = marker.raw?.y;
          if (!isDeepSea || mapSize <= 0 || rawX == null || rawY == null || imageWidth <= 0 || imageHeight <= 0) {
            return null;
          }
          const px = rawX * ((imageWidth - 2 * oceanMargin) / mapSize) + oceanMargin;
          const py = imageHeight - (rawY * ((imageHeight - 2 * oceanMargin) / mapSize) + oceanMargin);
          const clamp = (v: number) => Math.min(0.985, Math.max(0.015, v));
          return { x: clamp(px / imageWidth), y: clamp(py / imageHeight) };
        })();
        const renderX = isVending
          ? (isDeepSea
              ? (deepPos ? deepPos.x : Math.min(0.985, Math.max(0.015, marker.x)))
              : Math.min(1 - marginX, Math.max(marginX, marker.x)))
          : marker.x;
        const renderY = isVending
          ? (isDeepSea
              ? (deepPos ? deepPos.y : Math.min(0.985, Math.max(0.015, marker.y)))
              : Math.min(1 - marginY, Math.max(marginY, marker.y)))
          : marker.y;
        const color = isDeepSea ? DEEP_SEA_COLOR : (marker.color || MARKER_COLORS[marker.type] || '#fff');
        const hasIcon = marker.type !== 'player';
        
        return (
          <div
            key={marker.id}
            className={`map-marker map-marker--${marker.type} ${isSelected ? 'is-selected' : ''} ${isDeepSea ? 'is-deep-sea' : ''}`}
            style={{
              position: 'absolute',
              left: `${renderX * 100}%`,
              top: marker.type === 'crate' ? `calc(${renderY * 100}% - 24px)` : `${renderY * 100}%`,
              width: 0, height: 0,
              zIndex: isSelected ? 40 : (isDeepSea ? 22 : 20),
              pointerEvents: 'auto',
              cursor: 'pointer',
              // Glide moving events smoothly between polls. The poll lands ~1.2-1.5s
              // apart, so a hard 1s glide finished early then froze/jumped (read as
              // jitter); a slightly longer linear glide tracks the latest position
              // continuously without the freeze-then-snap bob. Others snap.
              transition: isMovingEvent ? 'left 1.5s linear, top 1.5s linear' : 'none',
              willChange: isMovingEvent ? 'left, top' : undefined,
            }}
            onClick={async (e) => {
              e.stopPropagation();
              selectMarker(selectedMarkerId === marker.id ? null : marker.id);

              if (marker.type === 'crate') {
                try {
                  const { useCrateStore } = await import('../../stores/crate-store');
                  const { useSettingsStore } = await import('../../stores/settings-store');
                  const { getCurrentServer } = await import('../../utils/server');

                  const cs = useCrateStore.getState();
                  const hasProximity = cs.markers.some(c => c.x !== undefined && c.y !== undefined && Math.hypot(c.x - marker.x, c.y - marker.y) < 0.015);

                  if (!hasProximity) {
                    const now = Date.now();
                    const srv = getCurrentServer();
                    const defaultCrateSeconds = useSettingsStore.getState().defaultCrateSeconds || 900;
                    const dur = defaultCrateSeconds * 1000;

                    cs.addMarker({
                      target: `live_${marker.id}`,
                      label: `Locked Crate (${marker.detail || '?'})`,
                      x: marker.x,
                      y: marker.y,
                      startedAt: now,
                      unlocksAt: now + dur,
                      note: 'Auto-spawned from live crate click',
                      serverId: srv?.id,
                      serverName: srv?.name,
                    });
                  }
                } catch (err) {
                  console.error("Failed to spawn local crate timer on click:", err);
                }
              }
            }}
          >
            {/* Tactical pulse rings */}
            {marker.type === 'player' && <div className="player-pulse-ring" />}

            {/* Deep-sea shops are small and tend to cluster offshore; a larger
                transparent hit-area makes them comfortably clickable so a click
                reliably opens the shop's orders (same selectMarker flow as any
                vending shop). */}
            {isDeepSea && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '50%', top: '50%',
                  width: 22, height: 22,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  background: 'transparent',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                }}
              />
            )}

            {/* Distinct custom marker representation */}
              <div 
                className="marker-event"
                style={{ 
                  width: marker.type === 'vendor' ? 16 : (marker.type === 'explosion' ? 13 : (marker.type === 'player' ? 8 : (marker.type === 'death' ? 9 : (marker.type === 'vending_machine' ? 11 : (isMovingEvent ? 18 : (hasIcon ? 15 : 12)))))), 
                  height: marker.type === 'vendor' ? 16 : (marker.type === 'explosion' ? 13 : (marker.type === 'player' ? 8 : (marker.type === 'death' ? 9 : (marker.type === 'vending_machine' ? 11 : (isMovingEvent ? 18 : (hasIcon ? 15 : 12)))))), 
                  backgroundColor: marker.type === 'explosion' ? 'transparent' : (isMovingEvent ? 'transparent' : color), 
                  borderRadius: marker.type === 'player' ? '50%' : (marker.type === 'explosion' ? '0' : '5px'),
                  border: marker.type === 'explosion' ? 'none' : (isMovingEvent ? 'none' : (marker.type === 'player' ? '1.5px solid rgba(0,0,0,0.85)' : '1.5px solid rgba(0,0,0,0.85)')),
                  boxShadow: marker.type === 'explosion' ? 'none' : (isMovingEvent ? 'none' : (isSelected ? `0 0 12px ${color}` : (isDeepSea ? '0 0 0 1.5px rgba(47,143,214,0.9), 0 0 8px rgba(47,143,214,0.55)' : '0 2px 4px rgba(0,0,0,0.5)'))),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: (() => {
                  const base = 'translate(-50%, -50%)';
                  if (marker.type === 'vendor') {
                    // Travelling vendor sprite's long axis faces NORTH (0deg), same as the
                    // other heading-driven markers, so use the rotation directly with no offset.
                    return `${base} rotate(${marker.rotation || 0}deg)`;
                  }
                  if (isMovingEvent) return `${base} rotate(${marker.rotation || 0}deg)`;
                  if (marker.type === 'player') return `${base} rotate(${marker.rotation || 0}deg)`;
                  return base;
                })(),
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
                position: 'absolute',
              }} 
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {marker.type === 'player' ? null : getMarkerIcon(marker.type)}
              </div>

              {/* Player direction pointer arrow */}
              {marker.type === 'player' && (
                <div style={{
                  position: 'absolute',
                  top: -4,
                  width: 0,
                  height: 0,
                  borderLeft: '2.5px solid transparent',
                  borderRight: '2.5px solid transparent',
                  borderBottom: `4px solid ${color}`,
                  filter: 'drop-shadow(0 -0.5px 0.5px rgba(0,0,0,0.8))'
                }} />
              )}
            </div>
            
            {/* Deep-sea vendor badge — a small always-on tag so offshore vendor
                shops (rendered at their true position outside the grid border)
                are instantly recognisable. */}
            {isDeepSea && (
              <div
                style={{
                  position: 'absolute',
                  top: 9,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '1px 4px',
                  borderRadius: 3,
                  background: 'rgba(8,12,18,0.82)',
                  border: `1px solid ${DEEP_SEA_COLOR}`,
                  color: DEEP_SEA_COLOR,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 5.5,
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 2px rgba(0,0,0,1)',
                  pointerEvents: 'none',
                }}
              >
                DEEP SEA
              </div>
            )}

            {/* Label / Tooltip */}
            {(((isSelected && marker.type !== 'vending_machine') || marker.type === 'player' || marker.type === 'death')) && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="other-tooltip"
              >
                {marker.label || marker.type.toUpperCase()}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Persistent Death Log ── */}
      <DeathLogMarkers deaths={deathLog} showDeathMarkers={showDeathMarkers} />
    </div>
  );
});

/** Persistent death log markers — survive respawns. */
function DeathLogMarkers({ deaths, showDeathMarkers }: { deaths: DeathLogEntry[]; showDeathMarkers: boolean }) {
  const [hover, setHover] = React.useState<string | null>(null);
  const selfSteamId = useTeamStore((s) => s.selfSteamId);
  const showTeammateDeathsOnMap = useSettingsStore((s) => s.showTeammateDeathsOnMap);
  if (!showDeathMarkers || deaths.length === 0) return null;

  // Master toggle on; when teammate deaths are disabled, show only your own.
  const visible = deaths.filter((d) => {
    const isOwn = selfSteamId != null && String(d.steamId) === selfSteamId;
    return isOwn || showTeammateDeathsOnMap;
  });
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((d) => {
        const age = Date.now() - d.timestamp;
        const ageMin = Math.floor(age / 60000);
        const ageLabel = ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin / 60)}h ${ageMin % 60}m ago`;
        const isHover = hover === d.id;
        const dotColor = '#ef4444';

        return (
          <div
            key={d.id}
            onMouseEnter={() => setHover(d.id)}
            onMouseLeave={() => setHover((h) => (h === d.id ? null : h))}
            style={{
              position: 'absolute',
              left: `${d.x * 100}%`,
              top: `${d.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              cursor: 'default',
              zIndex: isHover ? 30 : 3,
            }}
          >
            {/* Skull death marker — clearly a death, not a generic dot */}
            <div style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 10, height: 10,
              opacity: Math.max(0.5, 1 - age / (3 * 3600000)), // fade over 3hrs
            }}>
              {/* Red radius background removed */}
              <svg viewBox="0 0 24 24" fill={dotColor} stroke="rgba(0,0,0,0.9)" strokeWidth="0.8" style={{ width: 8, height: 8, filter: `drop-shadow(0 1px 1.5px rgba(0,0,0,0.85))` }}>
                <path d="M12 2C7.6 2 4 5.4 4 9.6c0 2.4 1.1 4.3 2.8 5.6V18a1 1 0 0 0 1 1h.7v1.5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V19h.7a1 1 0 0 0 1-1v-2.8C18.9 13.9 20 12 20 9.6 20 5.4 16.4 2 12 2z" />
                <circle cx="9" cy="10" r="1.8" fill="#000" />
                <circle cx="15" cy="10" r="1.8" fill="#000" />
                <path d="M12 13l-1 2.4h2L12 13z" fill="#000" />
              </svg>
            </div>
            {/* Label only on hover so it never clutters the map */}
            {isHover && (
              <div style={{
                position: 'absolute',
                top: '120%',
                left: '50%',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                fontSize: 6.5,
                color: '#ef4444',
                background: 'none',
                border: 'none',
                padding: 0,
                textShadow: '0 1px 2px rgba(0,0,0,1), 0 0 1.5px rgba(0,0,0,1)',
                fontFamily: 'var(--font-mono)',
                pointerEvents: 'none',
              }}>
                ☠ {d.playerName} · {d.grid} · {ageLabel}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export default MapMarkers;
