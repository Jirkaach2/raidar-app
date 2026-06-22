import React, { useState } from 'react';
import { useMapStore } from '../../stores/map-store';
import { getMonumentInfo, getMonumentName, getMonumentImageUrl, getItemIcon, getRequiredCards, CardType, PuzzleItem } from '../../utils/monuments';
import { getLootTable, lootIconUrl } from '../../utils/loot';
import { getMissionsForMonument, missionIcon, rewardIcon, Mission } from '../../utils/missions';

const CARD_COLORS: Record<CardType, string> = {
  green: '#2fe06d',
  blue: '#3b82f6',
  red: '#ef4444',
};

const RAD_LABEL: Record<string, { label: string; color: string }> = {
  none: { label: 'No Radiation', color: '#6fcf73' },
  low: { label: 'Low Radiation', color: '#cddc39' },
  medium: { label: 'Medium Radiation', color: '#f5c451' },
  high: { label: 'High Radiation', color: '#ef4444' },
};

function CardChip({ card, label }: { card: CardType; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10.5, fontWeight: 700, color: '#fff',
      background: `${CARD_COLORS[card]}22`, border: `1px solid ${CARD_COLORS[card]}`,
      borderRadius: 4, padding: '3px 8px',
    }}>
      <span style={{ width: 12, height: 9, borderRadius: 2, background: CARD_COLORS[card], display: 'inline-block' }} />
      {label}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '6px 8px' }}>
      <span style={{ fontSize: 8, letterSpacing: '0.6px', color: '#8b857c', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || '#e8e2d9' }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', color: '#8b857c', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

/** A labelled row of puzzle items with icons + quantities. */
function ItemRow({ label, items, highlight }: { label: string; items: PuzzleItem[]; highlight?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.8px', color: highlight ? '#6fcf73' : '#8b857c', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((it, i) => (
          <div key={i} title={it.name} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, padding: '3px 6px' }}>
            {it.icon
              ? <img src={getItemIcon(it.icon)} alt={it.name} width={18} height={18} style={{ objectFit: 'contain' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              : null}
            <span style={{ fontSize: 9.5, color: '#e8e2d9' }}>{it.name}{it.qty ? <span style={{ color: '#f5c451', fontWeight: 700 }}> {it.qty}</span> : null}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
      color: on ? '#0c0e12' : '#6b6b6b',
      background: on ? '#1f9e93' : 'rgba(255,255,255,0.05)',
      border: on ? 'none' : '1px solid rgba(255,255,255,0.08)',
    }}>
      {on ? '✓ ' : '✕ '}{label}
    </span>
  );
}

/** A single mission row: header always visible, details expand on click. */
function MissionCard({ mission, open, onToggle }: { mission: Mission; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', borderLeft: '2px solid #5ac8e8', overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
        <img src={missionIcon(mission.id)} alt="" width={26} height={26} style={{ objectFit: 'contain', flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#e8e2d9' }}>{mission.name}</span>
          <span style={{ fontSize: 9, color: '#5ac8e8' }}>{mission.provider}</span>
        </span>
        <span style={{ color: '#8b857c', fontSize: 11, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
      </button>
      {open && (
        <div style={{ padding: '0 10px 10px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 10.5, color: '#9aa0a6', lineHeight: 1.45 }}>{mission.desc}</p>

          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.8px', color: '#8b857c', marginBottom: 4 }}>OBJECTIVES</div>
          <ul style={{ margin: '0 0 8px', paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {mission.objectives.map((o, i) => <li key={i} style={{ fontSize: 10.5, color: '#c4bdb1', lineHeight: 1.4 }}>{o}</li>)}
          </ul>

          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.8px', color: '#6fcf73', marginBottom: 4 }}>REWARDS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: mission.requires || mission.cooldown ? 8 : 0 }}>
            {mission.rewards.map((r, i) => (
              <div key={i} title={r.name} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(111,207,115,0.08)', border: '1px solid rgba(111,207,115,0.2)', borderRadius: 4, padding: '3px 6px' }}>
                <img src={rewardIcon(r)} alt="" width={16} height={16} style={{ objectFit: 'contain' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <span style={{ fontSize: 9.5, color: '#e8e2d9' }}>{r.name}{r.qty ? <span style={{ color: '#6fcf73', fontWeight: 700 }}> ×{r.qty}</span> : null}</span>
              </div>
            ))}
            {mission.rewardNote && <span style={{ fontSize: 9.5, color: '#6fcf73', fontStyle: 'italic' }}>{mission.rewardNote}</span>}
          </div>

          {mission.bonus && <div style={{ fontSize: 9.5, color: '#f5c451', marginBottom: 6 }}>★ {mission.bonus}</div>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 9, color: '#8b857c' }}>
            {mission.cooldown && <span>Cooldown: <b style={{ color: '#c4bdb1' }}>{mission.cooldown}</b></span>}
            {mission.timeLimit && <span>Time limit: <b style={{ color: '#c4bdb1' }}>{mission.timeLimit}</b></span>}
            {mission.requires && <span>Requires: <b style={{ color: '#c4bdb1' }}>{mission.requires.join(', ')}</b></span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline loot-table popup shown when a crate/scientist row is clicked. */
function LootTablePopup({ tableId, onClose }: { tableId: string; onClose: () => void }) {
  const table = getLootTable(tableId);
  if (!table) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scrollable"
        style={{
          width: 320, maxWidth: '88%', maxHeight: '80%', overflowY: 'auto',
          background: 'rgba(16,18,24,0.99)', border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.8)', fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ position: 'sticky', top: 0, background: 'rgba(16,18,24,0.99)', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#f5c451', letterSpacing: '0.5px' }}>{table.name}</h3>
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

const MonumentInfoPanel = React.memo(function MonumentInfoPanel() {
  const token = useMapStore(s => s.selectedMonumentToken);
  const selectMonument = useMapStore(s => s.selectMonument);
  const [imgError, setImgError] = useState(false);
  const [lootPopup, setLootPopup] = useState<string | null>(null);
  const [openMission, setOpenMission] = useState<string | null>(null);

  React.useEffect(() => { setImgError(false); setLootPopup(null); setOpenMission(null); }, [token]);

  if (!token) return null;

  const info = getMonumentInfo(token);
  const name = getMonumentName(token);
  const imageUrl = getMonumentImageUrl(token);
  const rad = info ? RAD_LABEL[info.radiation] : null;
  const radText = info && info.radiation !== 'none' && info.radMedian !== undefined && info.radMax !== undefined
    ? `${rad?.label} (med ${info.radMedian} / max ${info.radMax})`
    : rad?.label;

  return (
    <div
      onClick={() => selectMonument(null)}
      onWheel={(e) => e.stopPropagation()}
      style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scrollable"
        style={{
          position: 'relative',
          width: 390, maxWidth: '92%', maxHeight: '88%', overflowY: 'auto',
          background: 'rgba(14, 16, 21, 0.98)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.7)', fontFamily: 'var(--font-mono)', color: '#e8e2d9',
        }}
      >
        {/* Header image */}
        <div style={{ position: 'relative', height: 150, overflow: 'hidden', borderTopLeftRadius: 10, borderTopRightRadius: 10, background: 'linear-gradient(135deg, rgba(40,46,58,0.9), rgba(18,20,26,0.95))' }}>
          {imageUrl && !imgError ? (
            <img src={imageUrl} alt={name} draggable={false} onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" style={{ position: 'absolute', right: -10, top: -10, width: 150, height: 150 }}><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" /></svg>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(14,16,21,0.96) 0%, rgba(14,16,21,0.1) 55%, rgba(14,16,21,0.35) 100%)' }} />
          <button onClick={() => selectMonument(null)} title="Close" style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 12, height: 12 }}><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
          </button>
          <div style={{ position: 'absolute', bottom: 10, left: 14, right: 14 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '1px', color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>{name}</h2>
            {info && (
              <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#cfae6d', letterSpacing: '0.5px' }}>{info.type.toUpperCase()}</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>•</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#e8e2d9' }}>TIER {info.tier}</span>
                {rad && <><span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>•</span><span style={{ fontSize: 9, fontWeight: 600, color: rad.color }}>{radText}</span></>}
                {info.safezone && <><span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>•</span><span style={{ fontSize: 9, fontWeight: 700, color: '#6fcf73' }}>SAFE ZONE</span></>}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!info && <p style={{ margin: 0, fontSize: 12, color: '#9aa0a6', lineHeight: 1.5 }}>No detailed data available for this monument yet.</p>}

          {info && (
            <>
              {/* Stat grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {info.crateCount !== undefined && <Stat label="Crates" value={info.crateCount} color="#f5c451" />}
                {info.barrels !== undefined && <Stat label="Barrels" value={info.barrels} color="#cfae6d" />}
                <Stat label="Recyclers" value={info.recyclers > 0 ? info.recyclers : '—'} color={info.recyclers > 0 ? '#1fb3a6' : '#6b6b6b'} />
              </div>

              {/* Crates — click to view loot table */}
              {info.crates.length > 0 && (
                <Section title="CRATES (tap for loot %)">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {info.crates.map((c, i) => (
                      <button key={i} onClick={() => setLootPopup(c.loot)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, background: 'rgba(245,196,81,0.06)', border: '1px solid rgba(245,196,81,0.18)', borderRadius: 4, padding: '6px 8px', color: '#e8e2d9', fontFamily: 'var(--font-mono)' }}>
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
                </Section>
              )}

              {/* Scientists — click to view drop table */}
              {info.scientists.length > 0 && (
                <Section title="SCIENTISTS (tap for drops)">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {info.scientists.map((s, i) => (
                      <button key={i} onClick={() => setLootPopup(s.loot)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, background: 'rgba(239,107,107,0.06)', border: '1px solid rgba(239,107,107,0.18)', borderRadius: 4, padding: '6px 8px', color: '#e8e2d9', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="#ef6b6b" strokeWidth="2" style={{ width: 12, height: 12 }}><circle cx="12" cy="7" r="4" /><path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /></svg>
                          {s.label}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#ef9b9b', fontWeight: 700 }}>×{s.count}</span>
                          <span style={{ color: '#8b857c', fontSize: 9 }}>drops ›</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* Puzzle / cards */}
              <Section title="PUZZLE & ACCESS">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: info.puzzles.length ? 8 : 0 }}>
                  {(() => {
                    const optional = new Set(info.optionalCards || []);
                    // Required cards are derived from the puzzle BRING data so the
                    // badges always match the puzzle (and never contradict it).
                    const required = getRequiredCards(info).filter((c) => !optional.has(c));
                    if (required.length === 0 && optional.size === 0) {
                      return <span style={{ fontSize: 11, color: '#9aa0a6' }}>No keycard required</span>;
                    }
                    return required.map((c) => <CardChip key={`r-${c}`} card={c} label={`Needs ${c}`} />);
                  })()}
                  {(info.optionalCards || []).map((c) => <CardChip key={`o-${c}`} card={c} label={`${c} optional`} />)}
                  {info.givesCards.map((c) => <CardChip key={`g-${c}`} card={c} label={`Gives ${c}`} />)}
                </div>
                {info.puzzles.map((p, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '10px', marginBottom: 8, borderLeft: '2px solid #3b82f6' }}>
                    <ItemRow label="BRING" items={p.bring} />
                    {p.activate && p.activate.length > 0 && <ItemRow label="ACTIVATE" items={p.activate} />}
                    <div style={{ textAlign: 'center', color: '#5f5a52', fontSize: 13, margin: '6px 0' }}>↓</div>
                    <ItemRow label="REWARDS" items={p.rewards} highlight />
                    {p.resetTime && <div style={{ marginTop: 6, fontSize: 9, color: '#8b857c', textAlign: 'center' }}>Reset time: {p.resetTime}</div>}
                  </div>
                ))}
              </Section>

              {/* Missions offered at this monument */}
              {(() => {
                const missions = getMissionsForMonument(info.key);
                if (missions.length === 0) return null;
                return (
                  <Section title={`MISSIONS · ${missions.length} (tap to expand)`}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {missions.map((m) => (
                        <MissionCard
                          key={m.id}
                          mission={m}
                          open={openMission === m.id}
                          onToggle={() => setOpenMission(openMission === m.id ? null : m.id)}
                        />
                      ))}
                    </div>
                  </Section>
                );
              })()}

              {/* Mining */}
              {info.mining && (
                <Section title="RESOURCE OUTPUT">
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 10px', borderLeft: '2px solid #cfae6d' }}>
                    <div style={{ fontSize: 10, color: '#cfae6d', fontWeight: 700 }}>Fuel: {info.mining.fuel}</div>
                    {info.mining.runTime && <div style={{ fontSize: 9.5, color: '#8b857c', marginTop: 2 }}>{info.mining.runTime}</div>}
                    <ul style={{ margin: '6px 0 0', paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {info.mining.outputs.map((o, i) => <li key={i} style={{ fontSize: 11, color: '#e8e2d9' }}>{o}</li>)}
                    </ul>
                  </div>
                </Section>
              )}

              {/* Bradley */}
              {info.bradley && (
                <Section title="BRADLEY APC">
                  <div style={{ background: 'rgba(239,107,107,0.08)', borderRadius: 6, padding: '8px 10px', borderLeft: '2px solid #ef6b6b' }}>
                    <div style={{ fontSize: 10.5 }}><span style={{ color: '#8b857c' }}>Destroy:</span> <span style={{ color: '#ef9b9b', fontWeight: 700 }}>{info.bradley.destroy}</span></div>
                    <div style={{ fontSize: 10.5, marginTop: 3 }}><span style={{ color: '#8b857c' }}>Drops:</span> <span style={{ color: '#f5c451', fontWeight: 700 }}>{info.bradley.drops}</span></div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {info.bradley.loot.map((l, i) => <li key={i} style={{ fontSize: 10.5, color: '#c4bdb1' }}>{l}</li>)}
                    </ul>
                  </div>
                </Section>
              )}

              {/* Features */}
              <Section title="FEATURES">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <FlagChip on={info.recyclers > 0} label="Recycler" />
                  <FlagChip on={info.hasTunnelEntrance} label="Tunnel Entry" />
                  <FlagChip on={info.hasChinookDropZone} label="Chinook Drop" />
                  <FlagChip on={info.allowsHeliCrash} label="Heli Crash" />
                </div>
              </Section>

              {/* Notes */}
              {info.notes.length > 0 && (
                <Section title="NOTES">
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {info.notes.map((n, i) => <li key={i} style={{ fontSize: 11, color: '#c4bdb1', lineHeight: 1.45 }}>{n}</li>)}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>

        {lootPopup && <LootTablePopup tableId={lootPopup} onClose={() => setLootPopup(null)} />}
      </div>
    </div>
  );
});

export default MonumentInfoPanel;
