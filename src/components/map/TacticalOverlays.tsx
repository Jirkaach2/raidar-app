import { useMapStore } from '@/stores/map-store';
import { useTeamStore } from '@/stores/team-store';
import { useSettingsStore } from '@/stores/settings-store';
import { confirmDialog } from '@/stores/confirm-store';
import React, { useState } from 'react';
import './TacticalOverlays.css';

/** Compact team roster shown above the tactical overlays on the map. */
const RosterStatus = React.memo(function RosterStatus() {
  const members = useTeamStore(s => s.members);
  const showRoster = useMapStore(s => s.showRoster);
  const [collapsed, setCollapsed] = useState(false);
  if (!showRoster || members.length === 0) return null;

  const online = members.filter(m => m.status === 'online').length;

  return (
    <div className="roster-panel glass-panel">
      <div className="roster-header" onClick={() => setCollapsed(c => !c)}>
        <span className="overlays-header-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8, width: 14, height: 14 }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          </svg>
          ROSTER STATUS
        </span>
        <span className="roster-count">{online}/{members.length}</span>
      </div>
      {!collapsed && (
        <div className="roster-body">
          {members.map(m => {
            const dead = m.status === 'dead';
            const offline = m.status === 'offline';
            return (
              <div key={m.id} className="roster-row">
                <span className={`status-dot status-${m.status}`} />
                <div className="roster-info">
                  <div className="roster-line">
                    <span className={`roster-name ${m.isSelf ? 'is-self' : ''}`}>{m.name}{m.isLeader ? ' ★' : ''}</span>
                    <span className={`roster-grid ${dead ? 'dead' : offline ? 'offline' : ''}`}>
                      {dead ? 'DEAD' : offline ? 'OFF' : (m.grid || '??')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// SVG Icons helper — crisp 18px icons for the monument-marker checklist.
function getResourceIcon(iconType: string, color: string) {
  const sw = 1.9;
  const common = { width: 18, height: 18, viewBox: '0 0 24 24' } as const;
  switch (iconType) {
    case 'card': // Keycard — chip + swipe stripe
      return (
        <svg {...common} fill="none">
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill={`${color}26`} stroke={color} strokeWidth={sw} />
          <rect x="5" y="8.5" width="4.5" height="3.5" rx="0.8" fill={color} />
          <line x1="12" y1="9" x2="19" y2="9" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <line x1="12" y1="12" x2="19" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <line x1="5" y1="15.5" x2="14" y2="15.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case 'recycler': // Recycle arrows triangle
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 19h-2.5a1.8 1.8 0 0 1-1.55-2.7l1.8-3.1" />
          <path d="M9.2 5.5l1.5-2.6a1.8 1.8 0 0 1 3.1 0l1.6 2.8" />
          <path d="M19.5 10.5l1.6 2.8a1.8 1.8 0 0 1-1.55 2.7H16" />
          <polyline points="6.2 9.5 4.5 11.2 2.8 9.5" />
          <polyline points="13 3.5 15.4 4 14.9 6.4" />
          <polyline points="19.8 13.6 19.2 11.2 21.6 10.7" />
          <polyline points="16 13 16 16 13 16" />
        </svg>
      );
    case 'refinery': // Oil refinery tower + flame
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 21V9l5-3v3l5-3v15z" fill={`${color}22`} />
          <line x1="3" y1="21" x2="21" y2="21" />
          <path d="M18 8c1.4 1 1.4 2.6 0 3.6-1.3-.5-1.7-1.8-1-3 .4 .8 .8 .5 1-.6z" fill={color} stroke="none" />
        </svg>
      );
    case 'table': // Research table / workbench
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="9" rx="1.5" fill={`${color}22`} />
          <circle cx="8" cy="8.5" r="1.4" fill={color} stroke="none" />
          <line x1="12.5" y1="7.5" x2="18" y2="7.5" />
          <line x1="12.5" y1="10" x2="16" y2="10" />
          <path d="M6 13l-2 8M18 13l2 8" />
        </svg>
      );
    case 'sam': // SAM site — launcher with missiles
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="12" width="16" height="8" rx="1.5" fill={`${color}22`} />
          <path d="M8 12V6l2-2M13 12V5l2-2" />
          <path d="M7.2 5.2l1.6-1.4M12.2 4.2l1.6-1.4" />
          <line x1="7" y1="16" x2="17" y2="16" />
        </svg>
      );
    case 'turret': // Auto turret — barrel + base
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="3.5" fill={`${color}22`} />
          <line x1="11.5" y1="9" x2="21" y2="9" />
          <rect x="19" y="7.5" width="2.5" height="3" rx="0.5" fill={color} stroke="none" />
          <path d="M6 12.5V20h6v-5" />
          <line x1="4" y1="20" x2="14" y2="20" />
        </svg>
      );
    case 'bp': // Blueprint fragment — torn document w/ gear
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill={`${color}22`} />
          <polyline points="13 3 13 8 18 8" />
          <circle cx="11" cy="14.5" r="2.3" />
          <path d="M11 11.6v1M11 17.4v1M8.1 14.5h1M12.9 14.5h1" />
        </svg>
      );
    case 'diesel': // Diesel barrel
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="3" width="12" height="18" rx="2" fill={`${color}22`} />
          <line x1="6" y1="8" x2="18" y2="8" />
          <line x1="6" y1="16" x2="18" y2="16" />
          <path d="M10 11.5h4l-1 3h-2z" fill={color} stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

export const RESOURCE_ITEMS = [
  // Keycards
  { key: 'green_card', name: 'Green Card', color: '#00e676', icon: 'card' },
  { key: 'blue_card', name: 'Blue Card', color: '#2979ff', icon: 'card' },
  { key: 'red_card', name: 'Red Card', color: '#ff1744', icon: 'card' },

  // Monument facilities
  { key: 'recyclers', name: 'Recyclers', color: '#26a69a', icon: 'recycler' },
  { key: 'refineries', name: 'Refineries', color: '#b0bec5', icon: 'refinery' },
  { key: 'research_tables', name: 'Research Tables', color: '#ea80fc', icon: 'table' },
  { key: 'sam_sites', name: 'SAM Sites', color: '#ef5350', icon: 'sam' },
  { key: 'turrets', name: 'Turrets', color: '#78909c', icon: 'turret' },

  // Puzzle rewards
  { key: 'basic_bp', name: 'Basic Blueprint Fragments', color: '#80d8ff', icon: 'bp' },
  { key: 'advanced_bp', name: 'Advanced Blueprint Fragments', color: '#29b6f6', icon: 'bp' },
  { key: 'diesel', name: 'Diesel', color: '#37474f', icon: 'diesel' },
];

export const TacticalOverlays = React.memo(function TacticalOverlays() {
  const showDeathMarkers = useMapStore(s => s.showDeathMarkers);
  const showEventTimers = useMapStore(s => s.showEventTimers);
  const showDayNight = useMapStore(s => s.showDayNight);
  const showTeam = useMapStore(s => s.showTeam);
  const showRoster = useMapStore(s => s.showRoster);
  const showVendingShops = useMapStore(s => s.showVendingShops);
  const showResources = useMapStore(s => s.showResources);
  const selectedResources = useMapStore(s => s.selectedResources);
  const toggleDeathMarkers = useMapStore(s => s.toggleDeathMarkers);
  const toggleEventTimers = useMapStore(s => s.toggleEventTimers);
  const toggleDayNight = useMapStore(s => s.toggleDayNight);
  const clearDeathLog = useMapStore(s => s.clearDeathLog);
  const toggleTeam = useMapStore(s => s.toggleTeam);
  const toggleRoster = useMapStore(s => s.toggleRoster);
  const toggleVendingShops = useMapStore(s => s.toggleVendingShops);
  const showRustExtras = useMapStore(s => s.showRustExtras);
  const toggleRustExtras = useMapStore(s => s.toggleRustExtras);
  const hasRustMapsKey = useSettingsStore(s => s.rustmapsKey.trim().length > 0);
  const toggleResources = useMapStore(s => s.toggleResources);
  const toggleResource = useMapStore(s => s.toggleResource);

  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="overlays-wrapper">
      <div className="overlays-left-col">
        <RosterStatus />

        {/* ── TACTICAL OVERLAYS PANEL ── */}
        <div className={`tactical-panel glass-panel ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="overlays-header" onClick={() => setIsCollapsed(!isCollapsed)}>
          <span className="overlays-header-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8, width: 14, height: 14 }}>
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            TACTICAL OVERLAYS
          </span>
          <span className="chevron-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14, transform: isCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>

        {!isCollapsed && (
          <div className="overlays-body">
            {/* Team Players */}
            <div className="overlay-row">
              <span className="overlay-row-label">Team Players</span>
              <button
                onClick={toggleTeam}
                className={`overlay-toggle-btn ${showTeam ? 'active' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </button>
            </div>

            {/* Roster Status */}
            <div className="overlay-row">
              <span className="overlay-row-label">Roster Status</span>
              <button
                onClick={toggleRoster}
                className={`overlay-toggle-btn ${showRoster ? 'active' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>

            {/* Death Markers — single master toggle. The teammate/own split is
                controlled in Settings (disable teammate deaths → only yours). */}
            <div className="overlay-row">
              <span className="overlay-row-label">Death Markers</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={async () => { if (await confirmDialog({ title: 'CLEAR DEATH MARKERS', message: 'Remove all death markers from the map and log?', confirmLabel: 'Clear', danger: true })) clearDeathLog(); }}
                  className="overlay-toggle-btn"
                  title="Clear all death markers"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
                <button
                  onClick={toggleDeathMarkers}
                  className={`overlay-toggle-btn ${showDeathMarkers ? 'active' : ''}`}
                  title="Show death markers on the map"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Vending Shops */}
            <div className="overlay-row">
              <span className="overlay-row-label">Vending Shops</span>
              <button 
                onClick={toggleVendingShops}
                className={`overlay-toggle-btn ${showVendingShops ? 'active' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
              </button>
            </div>

            {/* Caves & Water Well (RustMaps) — only when an API key is set */}
            {hasRustMapsKey && (
            <div className="overlay-row">
              <span className="overlay-row-label">Caves &amp; Wells</span>
              <button
                onClick={toggleRustExtras}
                className={`overlay-toggle-btn ${showRustExtras ? 'active' : ''}`}
                title="Show caves & the Water Well shopkeeper (RustMaps)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                  <path d="M3 21V13a9 9 0 0 1 18 0v8h-5v-5a4 4 0 0 0-8 0v5H3z" />
                </svg>
              </button>
            </div>
            )}

            {/* Map Markers */}
            <div className="overlay-row">
              <span className="overlay-row-label">Map Markers</span>
              <button 
                onClick={toggleResources}
                className={`overlay-toggle-btn ${showResources ? 'active' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </button>
            </div>

            {/* Active Events widget */}
            <div className="overlay-row">
              <span className="overlay-row-label">Active Events</span>
              <button
                onClick={toggleEventTimers}
                className={`overlay-toggle-btn ${showEventTimers ? 'active' : ''}`}
                title="Show the Active Events panel"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                  <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
              </button>
            </div>

            {/* Day / Night tracker */}
            <div className="overlay-row">
              <span className="overlay-row-label">Day / Night</span>
              <button
                onClick={toggleDayNight}
                className={`overlay-toggle-btn ${showDayNight ? 'active' : ''}`}
                title="Show the Day/Night tracker"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" />
                </svg>
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ── RESOURCE FILTERS POPOVER (only if Resources is toggled active) ── */}
      {showResources && !isCollapsed && (
        <div className="resource-popover glass-panel">
          <div className="resource-popover-header">MONUMENT MARKERS</div>

          {/* Checklist */}
          <div className="resource-grid scrollable">
            {RESOURCE_ITEMS.map((item) => {
              const checked = selectedResources.includes(item.key);
              return (
                <div key={item.key} className={`resource-chk-row ${checked ? 'is-checked' : ''}`} onClick={() => toggleResource(item.key)}>
                  <div className={`resource-checkbox ${checked ? 'checked' : ''}`} />
                  <span className="resource-chk-icon">{getResourceIcon(item.icon, item.color)}</span>
                  <span className="resource-chk-label">{item.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
