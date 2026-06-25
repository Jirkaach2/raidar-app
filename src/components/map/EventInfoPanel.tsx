import React, { useEffect, useState } from 'react';
import { X, Ship, Plane, Package, Flame, Crosshair, Store, Lock, Clock } from 'lucide-react';
import { useMapStore, MapMarker } from '../../stores/map-store';
import { useEventsStore } from '../../stores/events-store';
import { getGridCoordinate } from '../../utils/grid';
import { getLootTable, lootIconUrl } from '../../utils/loot';
import { LootTableView } from '../common/LootTableView';
import './EventInfoPanel.css';

/**
 * Detail card for dynamic map events (Patrol Heli, Chinook, Cargo Ship,
 * Locked Crate, Heli Crash, Travelling Vendor) — shown when the user clicks the
 * event's marker. Where the event has live timing (heli-crate unlock, cargo
 * dock window) the header surfaces a ticking countdown. Crates are tappable to
 * open their loot table.
 */

interface CrateRef { loot: string; label: string; count: string; }

interface EventData {
  title: string;
  color: string;
  tagline: string;
  rows: { label: string; value: string }[];
  crates?: CrateRef[];
  notes: string[];
}

/** Per-event accent icon (lucide), keyed by marker type. */
const EVENT_ICON: Record<string, React.ReactNode> = {
  patrol_heli: <Crosshair size={20} />,
  chinook: <Plane size={20} />,
  cargo_ship: <Ship size={20} />,
  crate: <Lock size={20} />,
  explosion: <Flame size={20} />,
  vendor: <Store size={20} />,
};

/** Heli-crash locked crates open ~4:30 after the wreck hits the ground. */
const HELI_CRATE_MS = 270_000;

function getEventData(type: string): EventData | null {
  switch (type) {
    case 'patrol_heli':
      return {
        title: 'PATROL HELICOPTER',
        color: '#eab308',
        tagline: 'NPC gunship · spawns every 2-4h',
        rows: [
          { label: 'Body HP', value: '10,000' },
          { label: 'Main Rotor HP', value: '900' },
          { label: 'Tail Rotor HP', value: '500' },
          { label: 'Weak points', value: 'Main + tail rotor = instant down' },
          { label: 'How to damage', value: 'BULLETS ONLY (rockets/C4 do nothing)' },
          { label: 'Best weapon', value: 'L96 / AK with HV or normal ammo' },
        ],
        crates: [
          { loot: 'heli_crate', label: 'Helicopter Crate', count: '4' },
        ],
        notes: [
          'Targets players with >2 clothing pieces and/or a ranged weapon equipped.',
          'Destroying BOTH rotors downs it instantly, ignoring body HP.',
          'It fires rockets/incendiary when it pulls back — break line of sight.',
          'You must show up within ~30s of tagging it or it leaves.',
          'Crates + body burn on crash; crates extinguish first. Crash site shows a debris icon to everyone.',
          'Body gibs give HQM, metal fragments & charcoal.',
        ],
      };
    case 'chinook':
      return {
        title: 'CHINOOK (CH47)',
        color: '#a855f7',
        tagline: 'Locked crate delivery',
        rows: [
          { label: 'Purpose', value: 'Drops a Locked Crate at a monument' },
          { label: 'Hack time', value: '15 minutes once it lands' },
          { label: 'Guards', value: 'Drops scientists around the crate' },
        ],
        crates: [
          { loot: 'locked', label: 'Locked Crate', count: '1' },
        ],
        notes: [
          'Follow it to the drop monument — it patrols before dropping.',
          'Hacking the crate alerts the whole server (map marker).',
          'Very tanky if you try to shoot it down.',
        ],
      };
    case 'cargo_ship':
      return {
        title: 'CARGO SHIP',
        color: '#06b6d4',
        tagline: 'Offshore scientist-guarded ship',
        rows: [
          { label: 'Locked Crates', value: '3 (hack in sequence)' },
          { label: 'Hack', value: '~3-15 min as it circles' },
          { label: 'Scientists', value: 'Multiple decks, incl. Heavies' },
        ],
        crates: [
          { loot: 'locked', label: 'Locked Crate', count: '3' },
          { loot: 'military', label: 'Military Crate', count: 'several' },
        ],
        notes: [
          'Board via boat, RHIB or parachute from above.',
          'Leaves the map after a full lap — loot before it departs.',
        ],
      };
    case 'crate':
      return {
        title: 'LOCKED CRATE',
        color: '#f59e0b',
        tagline: 'Hackable crate',
        rows: [
          { label: 'Hack time', value: '15 minutes' },
          { label: 'Alert', value: 'Marker visible to the whole server' },
        ],
        crates: [
          { loot: 'locked', label: 'Locked Crate', count: '1' },
        ],
        notes: [
          'Delivered by Chinook, Cargo Ship or found at Oil Rigs.',
          'Everyone can see the timer — expect company when it pops.',
        ],
      };
    case 'chinook47':
      return null;
    case 'explosion':
      return {
        title: 'HELI CRASH',
        color: '#ef4444',
        tagline: 'Patrol Helicopter was shot down',
        rows: [
          { label: 'Crash Crates', value: '4 (extinguish after burning)' },
          { label: 'Fire duration', value: '~2-3 min before crates open' },
          { label: 'Body Gibs', value: 'HQM · Metal Fragments · Charcoal' },
          { label: 'Visible to', value: 'Whole server (debris marker)' },
        ],
        crates: [
          { loot: 'heli_crate', label: 'Helicopter Crate', count: '4' },
          { loot: 'heli_body', label: 'Farm the Wreck', count: '×1' },
        ],
        notes: [
          'The fuselage burns after crashing — crates pop when it extinguishes.',
          'Crash site is visible to everyone on the map.',
          'Bring keys if parked nearby — another team may get there first.',
          'The main rotor may still be spinning — watch your step.',
        ],
      };
    case 'vendor':
      return {
        title: 'TRAVELLING VENDOR',
        color: '#9c7dff',
        tagline: 'Moving NPC shop',
        rows: [
          { label: 'Movement', value: 'Drives around the map on roads' },
          { label: 'Attitude', value: 'Peaceful, but armed if attacked' },
          { label: 'Sells', value: 'Randomized high-tier items' },
        ],
        notes: [
          'Approach it unarmed or holstered to buy items safely.',
          'Sells items like components, armor, weapons, or teas.',
          'Stock is randomized and limited.',
        ],
      };
    default:
      return null;
  }
}

/** mm:ss countdown formatter. */
function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Ticks once a second while `active`, so live countdowns stay current. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const EventInfoPanel = React.memo(function EventInfoPanel() {
  const selectedMarkerId = useMapStore(s => s.selectedMarkerId);
  const selectMarker = useMapStore(s => s.selectMarker);
  const markers = useMapStore(s => s.markers);
  const crashEvent = useEventsStore(s => s.events['crash']);

  if (!selectedMarkerId) return null;
  // The persistent heli-crash marker is injected locally by MapMarkers and
  // isn't in the map store — resolve it from the crash event instead.
  const marker: MapMarker | null = selectedMarkerId === 'crash_persistent'
    ? (crashEvent
      ? { id: 'crash_persistent', type: 'explosion', label: crashEvent.label, detail: crashEvent.grid || '', x: crashEvent.x ?? 0, y: crashEvent.y ?? 0, timestamp: crashEvent.startedAt } as MapMarker
      : null)
    : (markers.find(m => m.id === selectedMarkerId) ?? null);
  if (!marker) return null;

  const data = getEventData(marker.type);
  if (!data) return null;

  return <EventCard marker={marker} data={data} onClose={() => selectMarker(null)} />;
});

interface LiveStatus { text: string; color: string; }

function EventCard({ marker, data, onClose }: { marker: MapMarker; data: EventData; onClose: () => void }) {
  const mapSize = useMapStore(s => s.mapSize);
  const events = useEventsStore(s => s.events);
  const [lootPopup, setLootPopup] = useState<string | null>(null);

  const grid = marker.raw ? getGridCoordinate(marker.raw.x, marker.raw.y, mapSize) : (marker.detail || '');

  // Only run the per-second ticker for events that actually have live timing.
  const isTimed = marker.type === 'explosion' || marker.type === 'cargo_ship';
  const now = useNow(isTimed);

  let live: LiveStatus | null = null;
  if (marker.type === 'explosion') {
    const crash = events['crash'];
    if (crash) {
      const remaining = crash.startedAt + HELI_CRATE_MS - now;
      live = remaining <= 0
        ? { text: 'CRATES OPEN', color: '#6fcf73' }
        : { text: `Unlocks ${fmt(remaining)}`, color: remaining < 60_000 ? '#e8a838' : data.color };
    }
  } else if (marker.type === 'cargo_ship') {
    const dock = Object.values(events).find(e => e.kind === 'cargo_dock');
    if (dock) {
      const remaining = dock.endsAt - now;
      live = remaining > 0
        ? { text: `Leaves ${fmt(remaining)}`, color: remaining < 90_000 ? '#e8a838' : data.color }
        : { text: 'Leaving', color: '#e8a838' };
    }
  }

  const accentStyle = { ['--eip-accent' as string]: data.color } as React.CSSProperties;

  return (
    <div className="eip-overlay" onClick={onClose} onWheel={(e) => e.stopPropagation()}>
      <div className="eip-card scrollable" style={accentStyle} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="eip-header">
          <span className="eip-header__icon">{EVENT_ICON[marker.type] ?? <Package size={20} />}</span>
          <div className="eip-header__titles">
            <h2 className="eip-title">{data.title}</h2>
            <span className="eip-tagline">{data.tagline}</span>
            {(grid || live) && (
              <div className="eip-header__meta">
                {grid && <span className="eip-grid">{grid}</span>}
                {live && (
                  <span
                    className={`eip-live${live.color !== data.color ? ' eip-live--pulse' : ''}`}
                    style={{ ['--eip-live' as string]: live.color } as React.CSSProperties}
                  >
                    <Clock size={10} />{live.text}
                  </span>
                )}
              </div>
            )}
          </div>
          <button className="eip-close" onClick={onClose} title="Close"><X size={13} /></button>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="eip-body">
          {/* Intel rows */}
          {data.rows.length > 0 && (
            <div>
              <div className="eip-section__label">Intel</div>
              <div className="eip-rows">
                {data.rows.map((r, i) => (
                  <div key={i} className="eip-row">
                    <span className="eip-row__label">{r.label}</span>
                    <span className="eip-row__value">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clickable crates */}
          {data.crates && data.crates.length > 0 && (
            <div>
              <div className="eip-section__label">Crates · Tap for Loot %</div>
              <div className="eip-loot-list">
                {data.crates.map((c, i) => (
                  <button key={i} className="eip-loot-btn" onClick={() => setLootPopup(c.loot)}>
                    <span className="eip-loot-btn__left">
                      <Package size={13} />
                      {c.label}
                    </span>
                    <span className="eip-loot-btn__right">
                      <span className="eip-loot-btn__count">×{c.count}</span>
                      <span className="eip-loot-btn__more">loot ›</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Field notes */}
          {data.notes.length > 0 && (
            <div>
              <div className="eip-section__label">Field Notes</div>
              <ul className="eip-notes">
                {data.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}

          {/* Vendor shop */}
          {marker.type === 'vendor' && (
            <div>
              <div className="eip-section__label">Vehicle Shop Categories</div>
              <VendorLootTableWidget />
            </div>
          )}
        </div>

        {lootPopup && <EventLootPopup tableId={lootPopup} onClose={() => setLootPopup(null)} />}
      </div>
    </div>
  );
}

const VENDOR_CATEGORIES = {
  weapons: {
    label: 'Weapons',
    items: [
      { item: 'M39 Rifle', price: '250 Scrap', chance: '15%' },
      { item: 'SPAS-12 Shotgun', price: '250 Scrap', chance: '15%' },
      { item: 'M92 Pistol', price: '125 Scrap', chance: '20%' },
      { item: 'Hazmat Suit', price: '125 Scrap', chance: '20%' },
      { item: 'Jackhammer', price: '150 Scrap', chance: '25%' },
      { item: 'Chainsaw', price: '125 Scrap', chance: '25%' },
      { item: 'Revolver', price: '100 Scrap', chance: '30%' },
      { item: 'Double Barrel', price: '100 Scrap', chance: '30%' },
      { item: 'Crossbow', price: '75 Scrap', chance: '40%' },
    ],
  },
  components: {
    label: 'Components',
    items: [
      { item: 'Rifle Body', price: '125 Scrap', chance: '15%' },
      { item: 'SMG Body', price: '75 Scrap', chance: '25%' },
      { item: 'Semi Auto Body', price: '75 Scrap', chance: '25%' },
      { item: 'Tech Trash', price: '60 Scrap', chance: '30%' },
      { item: 'Road Signs', price: '30 Scrap', chance: '40%' },
      { item: 'Sheet Metal', price: '30 Scrap', chance: '40%' },
      { item: 'Gears', price: '25 Scrap', chance: '50%' },
      { item: 'Metal Spring', price: '15 Scrap', chance: '50%' },
      { item: 'High Quality Metal x10', price: '25 Scrap', chance: '60%' },
    ],
  },
  medical: {
    label: 'Meds',
    items: [
      { item: 'Pure Ore Tea', price: '150 Scrap', chance: '15%' },
      { item: 'Pure Wood Tea', price: '150 Scrap', chance: '15%' },
      { item: 'Pure Max Health Tea', price: '150 Scrap', chance: '15%' },
      { item: 'Advanced Ore Tea', price: '80 Scrap', chance: '30%' },
      { item: 'Advanced Wood Tea', price: '80 Scrap', chance: '30%' },
      { item: 'Large Medkit', price: '30 Scrap', chance: '40%' },
      { item: 'Medical Syringe', price: '15 Scrap', chance: '60%' },
      { item: 'Bandage', price: '5 Scrap', chance: '80%' },
    ],
  },
} as const;

type VendorTab = keyof typeof VENDOR_CATEGORIES;

function VendorLootTableWidget() {
  const [activeTab, setActiveTab] = useState<VendorTab>('weapons');
  const active = VENDOR_CATEGORIES[activeTab];

  return (
    <div className="eip-vendor">
      <div className="eip-tabs">
        {(Object.keys(VENDOR_CATEGORIES) as VendorTab[]).map((tab) => (
          <button
            key={tab}
            className={`eip-tab${activeTab === tab ? ' eip-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {VENDOR_CATEGORIES[tab].label}
          </button>
        ))}
      </div>

      <div className="eip-vendor-head">
        <span>{active.items.length} items</span>
        <span>Price · Chance</span>
      </div>

      <div className="eip-vendor-list scrollable">
        {active.items.map((e, idx) => {
          const icon = lootIconUrl(e.item);
          return (
            <div key={idx} className={`eip-vendor-row${idx % 2 ? '' : ' eip-vendor-row--alt'}`}>
              <span className="eip-vendor-row__icon">
                {icon ? <img src={icon} alt="" width={15} height={15} onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : null}
              </span>
              <span className="eip-vendor-row__name">{e.item}</span>
              <span className="eip-vendor-row__price">{e.price}</span>
              <span className="eip-vendor-row__chance">{e.chance}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventLootPopup({ tableId, onClose }: { tableId: string; onClose: () => void }) {
  const table = getLootTable(tableId);
  if (!table) return null;
  return (
    <div className="eip-popup" onClick={(e) => { e.stopPropagation(); onClose(); }} onWheel={(e) => e.stopPropagation()}>
      <div className="eip-popup__card scrollable" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="eip-popup__head" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="eip-popup__close" onClick={onClose}><X size={11} /></button>
        </div>
        <LootTableView table={table} />
      </div>
    </div>
  );
}

export default EventInfoPanel;
