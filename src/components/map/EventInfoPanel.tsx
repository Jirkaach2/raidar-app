import React, { useState } from 'react';
import { useMapStore } from '../../stores/map-store';
import { useEventsStore } from '../../stores/events-store';
import { getGridCoordinate } from '../../utils/grid';
import { getLootTable, lootIconUrl } from '../../utils/loot';

/**
 * Detail popup for dynamic map events (Patrol Heli, Chinook, Cargo Ship,
 * Locked Crate) — shown when the user clicks the event's marker. Crates listed
 * are tappable to open their loot table.
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

const EventInfoPanel = React.memo(function EventInfoPanel() {
  const selectedMarkerId = useMapStore(s => s.selectedMarkerId);
  const selectMarker = useMapStore(s => s.selectMarker);
  const markers = useMapStore(s => s.markers);
  const mapSize = useMapStore(s => s.mapSize);
  const crashEvent = useEventsStore(s => s.events['crash']);
  const [lootPopup, setLootPopup] = useState<string | null>(null);

  if (!selectedMarkerId) return null;
  // The persistent heli-crash marker is injected locally by MapMarkers and
  // isn't in the map store — resolve it from the crash event instead.
  const marker = selectedMarkerId === 'crash_persistent'
    ? (crashEvent ? { id: 'crash_persistent', type: 'explosion', label: crashEvent.label, detail: crashEvent.grid || '', x: crashEvent.x, y: crashEvent.y } as any : null)
    : markers.find(m => m.id === selectedMarkerId);
  if (!marker) return null;

  const data = getEventData(marker.type);
  if (!data) return null;

  const grid = marker.raw ? getGridCoordinate(marker.raw.x, marker.raw.y, mapSize) : (marker.detail || '');

  return (
    <div
      onClick={() => selectMarker(null)}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scrollable"
        style={{
          position: 'relative',
          width: 340, maxWidth: '90%', maxHeight: '85%', overflowY: 'auto',
          background: 'rgba(14, 16, 21, 0.98)', border: `1px solid ${data.color}55`,
          borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          fontFamily: 'var(--font-mono)', color: '#e8e2d9',
        }}
      >
        {/* Header */}
        <div style={{ position: 'relative', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', borderTop: `3px solid ${data.color}`, borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
          <button
            onClick={() => selectMarker(null)}
            title="Close"
            style={{
              position: 'absolute', top: 12, right: 12, width: 24, height: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 5, color: '#fff', cursor: 'pointer',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 11, height: 11 }}>
              <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '1px', color: data.color }}>{data.title}</h2>
          <div style={{ marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#9aa0a6' }}>{data.tagline}</span>
            {grid && (
              <span style={{ fontSize: 9, fontWeight: 700, color: data.color, background: `${data.color}22`, border: `1px solid ${data.color}55`, padding: '1px 5px', borderRadius: 3 }}>
                {grid}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '5px 8px' }}>
                <span style={{ color: '#8b857c' }}>{r.label}</span>
                <span style={{ color: '#e8e2d9', fontWeight: 600, textAlign: 'right' }}>{r.value}</span>
              </div>
            ))}
          </div>

          {/* Clickable crates */}
          {data.crates && data.crates.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', color: '#8b857c', marginBottom: 6 }}>CRATES (tap for loot %)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {data.crates.map((c, i) => (
                  <button key={i} onClick={() => setLootPopup(c.loot)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, background: 'rgba(245,196,81,0.06)', border: '1px solid rgba(245,196,81,0.2)', borderRadius: 4, padding: '6px 8px', color: '#e8e2d9', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#f5c451" strokeWidth="2" style={{ width: 12, height: 12 }}><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" /><path d="M3 7l9 4 9-4" /><path d="M12 11v10" /></svg>
                      {c.label}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#f5c451', fontWeight: 700 }}>×{c.count}</span>
                      <span style={{ color: '#8b857c', fontSize: 9 }}>loot ›</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {data.notes.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.notes.map((n, i) => (
                <li key={i} style={{ fontSize: 10.5, color: '#c4bdb1', lineHeight: 1.45 }}>{n}</li>
              ))}
            </ul>
          )}

          {marker.type === 'vendor' && (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', color: '#8b857c', marginBottom: 8 }}>VEHICLE SHOP CATEGORIES</div>
              <VendorLootTableWidget />
            </div>
          )}
        </div>

        {lootPopup && <EventLootPopup tableId={lootPopup} onClose={() => setLootPopup(null)} />}
      </div>
    </div>
  );
});

function VendorLootTableWidget() {
  const [activeTab, setActiveTab] = useState<'weapons' | 'components' | 'medical'>('weapons');

  const categories = {
    weapons: {
      name: 'Weapons / Gear',
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
      ]
    },
    components: {
      name: 'Components / Mats',
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
      ]
    },
    medical: {
      name: 'Meds & Buff Teas',
      items: [
        { item: 'Pure Ore Tea', price: '150 Scrap', chance: '15%' },
        { item: 'Pure Wood Tea', price: '150 Scrap', chance: '15%' },
        { item: 'Pure Max Health Tea', price: '150 Scrap', chance: '15%' },
        { item: 'Advanced Ore Tea', price: '80 Scrap', chance: '30%' },
        { item: 'Advanced Wood Tea', price: '80 Scrap', chance: '30%' },
        { item: 'Large Medkit', price: '30 Scrap', chance: '40%' },
        { item: 'Medical Syringe', price: '15 Scrap', chance: '60%' },
        { item: 'Bandage', price: '5 Scrap', chance: '80%' },
      ]
    }
  };

  const active = categories[activeTab];

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: 8 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(Object.keys(categories) as Array<keyof typeof categories>).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '5px 2px', borderRadius: 4, border: 'none',
              background: activeTab === tab ? 'rgba(156, 125, 255, 0.15)' : 'rgba(0,0,0,0.25)',
              color: activeTab === tab ? '#9c7dff' : '#8b857c',
              fontSize: 8.5, fontWeight: 700, cursor: 'pointer',
              textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
              borderBottom: activeTab === tab ? '1.5px solid #9c7dff' : 'none',
            }}
          >
            {tab === 'weapons' ? 'Weapons' : tab === 'components' ? 'Components' : 'Meds'}
          </button>
        ))}
      </div>

      {/* Item List */}
      <div className="scrollable" style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {active.items.map((e, idx) => {
          const icon = lootIconUrl(e.item);
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, padding: '4px 6px', borderRadius: 4, background: idx % 2 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              <span style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                {icon ? <img src={icon} alt="" width={15} height={15} style={{ objectFit: 'contain' }} onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : null}
              </span>
              <span style={{ color: '#e8e2d9', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{e.item}</span>
              <span style={{ color: '#cfae6d', fontWeight: 600, fontSize: 9, flexShrink: 0 }}>{e.price}</span>
              <span style={{ color: '#8b857c', fontSize: 8.5, flexShrink: 0, width: 30, textAlign: 'right' }}>{e.chance}</span>
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
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onWheel={(e) => e.stopPropagation()}
      style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
    >
      <div onClick={(e) => e.stopPropagation()} className="scrollable" style={{ width: 300, maxWidth: '88%', maxHeight: '80%', overflowY: 'auto', background: 'rgba(16,18,24,0.99)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.8)', fontFamily: 'var(--font-mono)' }}>
        <div style={{ position: 'sticky', top: 0, background: 'rgba(16,18,24,0.99)', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#f5c451' }}>{table.name}</h3>
            <button onClick={onClose} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 5, color: '#fff', cursor: 'pointer' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 10, height: 10 }}><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
            </button>
          </div>
          {table.note && <div style={{ fontSize: 9, color: '#8b857c', marginTop: 4 }}>{table.note}</div>}
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {table.entries.map((e, i) => {
            const icon = lootIconUrl(e.item);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, padding: '4px 8px', borderRadius: 4, background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.03)' }}>
                <span style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
                  {icon ? <img src={icon} alt="" width={20} height={20} style={{ objectFit: 'contain' }} onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : null}
                </span>
                <span style={{ color: '#e8e2d9', flex: 1 }}>{e.item}{e.amount ? <span style={{ color: '#8b857c' }}> {e.amount}</span> : null}</span>
                <span style={{ color: '#6fcf73', fontWeight: 700, flexShrink: 0 }}>{e.chance}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default EventInfoPanel;
