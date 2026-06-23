import { useMapStore } from '@/stores/map-store';
import { useTeamStore } from '@/stores/team-store';
import { useSettingsStore } from '@/stores/settings-store';
import { confirmDialog } from '@/stores/confirm-store';
import React, { useMemo, useState } from 'react';
import {
  Layers, Users, ClipboardList, Skull, Store, Mountain, MapPin,
  Zap, SunMoon, ChevronDown, Crown, Trash2,
} from 'lucide-react';
import './TacticalOverlays.css';

/** Status sort priority — online first, then dead, then offline. */
const STATUS_ORDER: Record<string, number> = { online: 0, dead: 1, offline: 2 };

/** Compact team roster shown above the tactical overlays on the map. */
const RosterStatus = React.memo(function RosterStatus() {
  const members = useTeamStore(s => s.members);
  const showRoster = useMapStore(s => s.showRoster);
  const [collapsed, setCollapsed] = useState(false);

  // Online → dead → offline, then alphabetical for quick scanning.
  const sorted = useMemo(
    () =>
      [...members].sort((a, b) => {
        const order = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
        return order !== 0 ? order : a.name.localeCompare(b.name);
      }),
    [members],
  );

  if (!showRoster || members.length === 0) return null;

  const online = members.filter(m => m.status === 'online').length;

  return (
    <div className="roster-panel glass-panel">
      <div className="roster-header" onClick={() => setCollapsed(c => !c)}>
        <span className="roster-title">
          <Users size={13} className="roster-title-icon" />
          TEAM
        </span>
        <span className="roster-header-right">
          <span className="roster-count" title="Online / total teammates">
            <strong>{online}</strong>
            <span className="roster-count-sep">/</span>
            {members.length}
          </span>
          <ChevronDown size={14} className={`roster-chevron ${collapsed ? 'is-collapsed' : ''}`} />
        </span>
      </div>

      <div className={`roster-body ${collapsed ? 'is-collapsed' : ''}`}>
        {sorted.map(m => {
          const dead = m.status === 'dead';
          const offline = m.status === 'offline';
          return (
            <div
              key={m.id}
              className={`roster-row status-${m.status} ${m.isSelf ? 'is-self' : ''}`}
            >
              <span className={`status-dot status-${m.status}`} />
              <span className="roster-name" title={m.name}>
                {m.name}
                {m.isLeader && <Crown size={11} className="roster-leader-icon" />}
              </span>
              <span className={`roster-grid ${dead ? 'dead' : offline ? 'offline' : ''}`}>
                {dead ? 'DEAD' : offline ? 'OFF' : (m.grid || '??')}
              </span>
            </div>
          );
        })}
      </div>
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
    case 'pumpjack': // Oil pump jack — pivoting beam over a derrick base
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8l16-3" />
          <path d="M4 8l3 4" fill={`${color}22`} />
          <circle cx="4" cy="8" r="1.4" fill={color} stroke="none" />
          <path d="M20 5v5" />
          <path d="M18 10h4" />
          <path d="M9 11l3 9M15 11l-3 9" />
          <line x1="7" y1="20" x2="17" y2="20" />
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
  { key: 'pump_jacks', name: 'Pump Jacks', color: '#c98a3c', icon: 'pumpjack' },
];

/** A single overlay layer row with an icon, label and a sliding toggle switch.
 *  The whole row is the click target; `trailing` slots an extra action (e.g.
 *  the death-marker clear button) that stops propagation. */
function LayerToggle({
  icon,
  label,
  active,
  onToggle,
  title,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onToggle: () => void;
  title?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={`overlay-row ${active ? 'is-active' : ''}`}
      onClick={onToggle}
      title={title}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="overlay-row-icon">{icon}</span>
      <span className="overlay-row-label">{label}</span>
      {trailing}
      <span className={`overlay-switch ${active ? 'on' : ''}`} aria-hidden="true">
        <span className="overlay-switch-knob" />
      </span>
    </div>
  );
}

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
  const markerScale = useSettingsStore(s => s.markerScale);
  const setMarkerScale = useSettingsStore(s => s.setMarkerScale);
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
              <Layers size={14} className="overlays-header-icon" />
              OVERLAYS
            </span>
            <ChevronDown size={14} className={`chevron-icon ${isCollapsed ? 'is-collapsed' : ''}`} />
          </div>

          {!isCollapsed && (
            <div className="overlays-body">
              {/* Team */}
              <div className="overlay-group">
                <div className="overlay-group-label">Team</div>
                <LayerToggle
                  icon={<Users size={14} />}
                  label="Team Players"
                  active={showTeam}
                  onToggle={toggleTeam}
                  title="Show teammates on the map"
                />
                <LayerToggle
                  icon={<ClipboardList size={14} />}
                  label="Roster Status"
                  active={showRoster}
                  onToggle={toggleRoster}
                  title="Show the team roster panel"
                />
              </div>

              {/* Map Layers */}
              <div className="overlay-group">
                <div className="overlay-group-label">Map Layers</div>
                <LayerToggle
                  icon={<Skull size={14} />}
                  label="Death Markers"
                  active={showDeathMarkers}
                  onToggle={toggleDeathMarkers}
                  title="Show death markers on the map"
                  trailing={
                    <button
                      type="button"
                      className="overlay-mini-btn"
                      title="Clear all death markers"
                      onClick={async e => {
                        e.stopPropagation();
                        if (
                          await confirmDialog({
                            title: 'CLEAR DEATH MARKERS',
                            message: 'Remove all death markers from the map and log?',
                            confirmLabel: 'Clear',
                            danger: true,
                          })
                        )
                          clearDeathLog();
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  }
                />
                <LayerToggle
                  icon={<Store size={14} />}
                  label="Vending Shops"
                  active={showVendingShops}
                  onToggle={toggleVendingShops}
                  title="Show vending machines"
                />
                {hasRustMapsKey && (
                  <LayerToggle
                    icon={<Mountain size={14} />}
                    label="Caves & Wells"
                    active={showRustExtras}
                    onToggle={toggleRustExtras}
                    title="Show caves & the Water Well shopkeeper (RustMaps)"
                  />
                )}
                <LayerToggle
                  icon={<MapPin size={14} />}
                  label="Map Markers"
                  active={showResources}
                  onToggle={toggleResources}
                  title="Show monument marker filters"
                />
              </div>

              {/* HUD Widgets */}
              <div className="overlay-group">
                <div className="overlay-group-label">HUD Widgets</div>
                <LayerToggle
                  icon={<Zap size={14} />}
                  label="Active Events"
                  active={showEventTimers}
                  onToggle={toggleEventTimers}
                  title="Show the Active Events panel"
                />
                <LayerToggle
                  icon={<SunMoon size={14} />}
                  label="Day / Night"
                  active={showDayNight}
                  onToggle={toggleDayNight}
                  title="Show the Day/Night tracker"
                />
              </div>

              {/* Display */}
              <div className="overlay-group">
                <div className="overlay-group-label">Display</div>
                <div className="overlay-slider-row" title="Shrink or grow every map marker">
                  <span className="overlay-slider-label">Marker size</span>
                  <input
                    type="range"
                    min={0.15}
                    max={2}
                    step={0.05}
                    value={markerScale}
                    onChange={(e) => setMarkerScale(parseFloat(e.target.value))}
                    className="overlay-slider"
                    aria-label="Marker size"
                  />
                  <span className="overlay-slider-val">{Math.round(markerScale * 100)}%</span>
                </div>
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
            {RESOURCE_ITEMS.map(item => {
              const checked = selectedResources.includes(item.key);
              return (
                <div
                  key={item.key}
                  className={`resource-chk-row ${checked ? 'is-checked' : ''}`}
                  onClick={() => toggleResource(item.key)}
                >
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
