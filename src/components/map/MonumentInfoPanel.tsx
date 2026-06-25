import React, { useState } from 'react';
import {
  X, ChevronRight, Radiation, ShieldCheck, KeyRound, Package, Crosshair,
  Pickaxe, ScrollText, Info, Recycle, DoorOpen, Plane, Flame, Skull, Gauge,
} from 'lucide-react';
import { useMapStore } from '../../stores/map-store';
import { getMonumentInfo, getMonumentName, getMonumentImageUrl, getItemIcon, getRequiredCards, CardType, PuzzleItem, PuzzleStep } from '../../utils/monuments';
import { getLootTable } from '../../utils/loot';
import { LootTableView } from '../common/LootTableView';
import { getMissionsForMonument, missionIcon, rewardIcon, Mission } from '../../utils/missions';
import './MonumentInfoPanel.css';

const CARD_COLORS: Record<CardType, string> = {
  green: '#2fe06d',
  blue: '#3b82f6',
  red: '#ef4444',
};

const RAD_LABEL: Record<string, { label: string; short: string; color: string }> = {
  none: { label: 'No Radiation', short: 'No Rad', color: '#6fcf73' },
  low: { label: 'Low Radiation', short: 'Low Rad', color: '#cddc39' },
  medium: { label: 'Medium Radiation', short: 'Med Rad', color: '#f5c451' },
  high: { label: 'High Radiation', short: 'High Rad', color: '#ef4444' },
};

/** Helper so we can attach CSS custom properties via inline style. */
function accentVar(color: string): React.CSSProperties {
  return { ['--mip-accent' as string]: color } as React.CSSProperties;
}

function CardChip({ card, label }: { card: CardType; label: string }) {
  return (
    <span className="mip-card-chip" style={{ background: `${CARD_COLORS[card]}22`, border: `1px solid ${CARD_COLORS[card]}` }}>
      <span className="mip-swatch" style={{ background: CARD_COLORS[card] }} />
      {label}
    </span>
  );
}

/** A compact at-a-glance pill: small icon/dot + label + value. */
function Fact({ icon, label, value, color }: { icon?: React.ReactNode; label: string; value: React.ReactNode; color?: string }) {
  return (
    <span className="mip-fact">
      {icon}
      <span className="mip-fact__label">{label}</span>
      <span className="mip-fact__value" style={color ? { color } : undefined}>{value}</span>
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="mip-stat">
      <span className="mip-stat__label">{label}</span>
      <span className="mip-stat__value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

/** A collapsible, titled section. Header toggles the body; an optional count
 *  badge + accent colour keep the panel scannable in a narrow column. */
function Section({ id, title, count, accent, icon, open, onToggle, children }: {
  id?: string;
  title: string;
  count?: number;
  accent?: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mip-section" data-section={id} style={accent ? accentVar(accent) : undefined}>
      <button className="mip-section__head" onClick={onToggle}>
        <span className="mip-section__bar" />
        {icon && <span className="mip-section__icon">{icon}</span>}
        <span className="mip-section__title">{title}</span>
        {count !== undefined && <span className="mip-section__count">{count}</span>}
        <span className={`mip-section__chevron${open ? ' mip-section__chevron--open' : ''}`}><ChevronRight size={14} /></span>
      </button>
      {open && <div className="mip-section__body">{children}</div>}
    </div>
  );
}

/** A labelled row of puzzle items with icons + quantities. */
function ItemRow({ label, items, reward }: { label: string; items: PuzzleItem[]; reward?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mip-itemrow">
      <div className={`mip-itemrow__label${reward ? ' mip-itemrow__label--reward' : ''}`}>{label}</div>
      <div className="mip-items">
        {items.map((it, i) => (
          <div key={i} className="mip-item" title={it.name}>
            {it.icon
              ? <img src={getItemIcon(it.icon)} alt={it.name} width={18} height={18} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              : null}
            <span className="mip-item__name">{it.name}{it.qty ? <span className="mip-item__qty"> {it.qty}</span> : null}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FLAG_ICONS: Record<string, React.ReactNode> = {
  Recycler: <Recycle size={12} />,
  'Tunnel Entry': <DoorOpen size={12} />,
  'Chinook Drop': <Plane size={12} />,
  'Heli Crash': <Flame size={12} />,
};

function FlagChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`mip-flag${on ? ' mip-flag--on' : ''}`}>
      {FLAG_ICONS[label]}{label}
    </span>
  );
}

const PUZZLE_TIER = {
  red: { label: 'Red Room', color: '#ef4444' },
  blue: { label: 'Blue Room', color: '#3b82f6' },
  green: { label: 'Green Room', color: '#2fe06d' },
  power: { label: 'Power Room', color: '#f5c451' },
};
function puzzleTier(p: PuzzleStep) {
  const names = p.bring.map((b) => b.name.toLowerCase());
  if (names.some((n) => n.includes('red'))) return PUZZLE_TIER.red;
  if (names.some((n) => n.includes('blue'))) return PUZZLE_TIER.blue;
  if (names.some((n) => n.includes('green'))) return PUZZLE_TIER.green;
  return PUZZLE_TIER.power;
}

/** A collapsible puzzle room: tier-coloured header with the keycards to bring,
 *  expanding to the full bring/activate/reward breakdown. */
function PuzzleCard({ puzzle, open, onToggle }: { puzzle: PuzzleStep; open: boolean; onToggle: () => void }) {
  const tier = puzzleTier(puzzle);
  return (
    <div className="mip-puzzle" style={{ ['--mip-tier' as string]: tier.color } as React.CSSProperties}>
      <button className="mip-puzzle__head" onClick={onToggle}>
        <span className="mip-puzzle__tier">{tier.label}</span>
        <span className="mip-puzzle__bring">
          {puzzle.bring.map((b, i) => b.icon ? (
            <span key={i} title={`${b.name}${b.qty ? ' ' + b.qty : ''}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <img src={getItemIcon(b.icon)} alt={b.name} width={18} height={18} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              {b.qty && b.qty !== 'x1' && <span className="mip-puzzle__bringqty">{b.qty}</span>}
            </span>
          ) : null)}
        </span>
        {puzzle.resetTime && <span className="mip-puzzle__reset">{puzzle.resetTime}</span>}
        <span className={`mip-section__chevron${open ? ' mip-section__chevron--open' : ''}`}><ChevronRight size={13} /></span>
      </button>
      {open && (
        <div className="mip-puzzle__body">
          <ItemRow label="BRING" items={puzzle.bring} />
          {puzzle.activate && puzzle.activate.length > 0 && <ItemRow label="ACTIVATE" items={puzzle.activate} />}
          <div className="mip-puzzle__arrow">↓</div>
          <ItemRow label="REWARDS" items={puzzle.rewards} reward />
        </div>
      )}
    </div>
  );
}

/** A single mission row: header always visible, details expand on click. */
function MissionCard({ mission, open, onToggle }: { mission: Mission; open: boolean; onToggle: () => void }) {
  return (
    <div className="mip-mission">
      <button className="mip-mission__head" onClick={onToggle}>
        <img className="mip-mission__icon" src={missionIcon(mission.id)} alt="" width={26} height={26} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
        <span className="mip-mission__titles">
          <span className="mip-mission__name">{mission.name}</span>
          <span className="mip-mission__provider">{mission.provider}</span>
        </span>
        <span className={`mip-section__chevron${open ? ' mip-section__chevron--open' : ''}`}><ChevronRight size={13} /></span>
      </button>
      {open && (
        <div className="mip-mission__body">
          <p className="mip-mission__desc">{mission.desc}</p>

          <div className="mip-sub-label">OBJECTIVES</div>
          <ul className="mip-objectives">
            {mission.objectives.map((o, i) => <li key={i}>{o}</li>)}
          </ul>

          <div className="mip-sub-label mip-sub-label--reward">REWARDS</div>
          <div className={`mip-rewards${mission.requires || mission.cooldown ? ' mip-rewards--mb' : ''}`}>
            {mission.rewards.map((r, i) => (
              <div key={i} className="mip-reward" title={r.name}>
                <img src={rewardIcon(r)} alt="" width={16} height={16} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <span className="mip-reward__name">{r.name}{r.qty ? <span className="mip-reward__qty"> ×{r.qty}</span> : null}</span>
              </div>
            ))}
            {mission.rewardNote && <span className="mip-reward-note">{mission.rewardNote}</span>}
          </div>

          {mission.bonus && <div className="mip-mission__bonus">★ {mission.bonus}</div>}

          <div className="mip-mission__metaline">
            {mission.cooldown && <span>Cooldown: <b>{mission.cooldown}</b></span>}
            {mission.timeLimit && <span>Time limit: <b>{mission.timeLimit}</b></span>}
            {mission.requires && <span>Requires: <b>{mission.requires.join(', ')}</b></span>}
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
    <div className="mip-popup" onClick={onClose}>
      <div className="mip-popup__card scrollable" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="mip-popup__head" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="mip-popup__close" onClick={onClose}><X size={11} /></button>
        </div>
        <LootTableView table={table} />
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
  const [openPuzzle, setOpenPuzzle] = useState<number | null>(0);
  // Sections are open by default; ids stored here are collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    setImgError(false); setLootPopup(null); setOpenMission(null); setOpenPuzzle(0); setCollapsed(new Set());
  }, [token]);

  if (!token) return null;

  const info = getMonumentInfo(token);
  const name = getMonumentName(token);
  const imageUrl = getMonumentImageUrl(token);
  const rad = info ? RAD_LABEL[info.radiation] : null;

  const isOpen = (id: string) => !collapsed.has(id);
  const toggleSection = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Derived at-a-glance data (only computed when info exists).
  const requiredCards = info ? getRequiredCards(info).filter((c) => !(info.optionalCards || []).includes(c)) : [];
  const scientistTotal = info ? info.scientists.reduce((sum, s) => sum + s.count, 0) : 0;
  const missions = info ? getMissionsForMonument(info.key) : [];
  const hasFeatures = info ? (info.recyclers > 0 || info.hasTunnelEntrance || info.hasChinookDropZone || info.allowsHeliCrash) : false;

  return (
    <div
      className="mip-overlay"
      onClick={() => selectMonument(null)}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="mip-card scrollable" onClick={(e) => e.stopPropagation()}>
        {/* ── Hero banner ───────────────────────────────────────── */}
        <div className="mip-hero">
          {imageUrl && !imgError ? (
            <img className="mip-hero__img" src={imageUrl} alt={name} draggable={false} onError={() => setImgError(true)} />
          ) : (
            <svg className="mip-hero__placeholder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" /></svg>
          )}
          <div className="mip-hero__scrim" />
          <button className="mip-hero__close" onClick={() => selectMonument(null)} title="Close"><X size={13} /></button>

          {info && <span className="mip-tier">TIER {info.tier}</span>}

          <div className="mip-hero__bottom">
            <h2 className="mip-title">{name}</h2>
            {info && (
              <div className="mip-meta">
                <span className="mip-meta__badge mip-meta__badge--type">{info.type}</span>
                {rad && (
                  <span className="mip-meta__badge" style={{ color: rad.color }}>
                    <Radiation size={10} />{rad.short}
                  </span>
                )}
                {info.safezone && (
                  <span className="mip-meta__badge mip-meta__badge--safe">
                    <ShieldCheck size={10} />Safe Zone
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="mip-body">
          {!info && <p className="mip-empty">No detailed data available for this monument yet.</p>}

          {info && (
            <>
              {/* At-a-glance facts strip */}
              <div className="mip-facts">
                {rad && (
                  <Fact
                    icon={<span className="mip-swatch" style={{ width: 7, height: 7, borderRadius: '50%', background: rad.color }} />}
                    label="Rad" value={rad.short} color={rad.color}
                  />
                )}
                <Fact label="Puzzles" value={info.puzzles.length || 'None'} color={info.puzzles.length ? '#f5c451' : 'var(--color-text-muted)'} />
                {info.crateCount !== undefined && <Fact label="Crates" value={info.crateCount} color="#f5c451" />}
                <Fact label="Recyclers" value={info.recyclers > 0 ? info.recyclers : 'None'} color={info.recyclers > 0 ? '#1fb3a6' : 'var(--color-text-muted)'} />
                {scientistTotal > 0 && <Fact label="Sci" value={scientistTotal} color="#ef9b9b" />}
                {requiredCards.length > 0 && (
                  <Fact
                    label="Needs"
                    value={
                      <span className="mip-swatch-row">
                        {requiredCards.map((c) => <span key={c} className="mip-swatch" style={{ background: CARD_COLORS[c] }} />)}
                      </span>
                    }
                  />
                )}
                {info.givesCards.map((c) => (
                  <Fact key={`gf-${c}`} label="Gives" value={<span className="mip-swatch" style={{ background: CARD_COLORS[c], verticalAlign: 'middle' }} />} />
                ))}
              </div>

              {/* OVERVIEW */}
              <Section id="overview" title="Overview" icon={<Gauge size={13} />} open={isOpen('overview')} onToggle={() => toggleSection('overview')}>
                <div className="mip-stats">
                  {info.crateCount !== undefined && <Stat label="Crates" value={info.crateCount} color="#f5c451" />}
                  {info.barrels !== undefined && <Stat label="Barrels" value={info.barrels} color="#cfae6d" />}
                  <Stat label="Recyclers" value={info.recyclers > 0 ? info.recyclers : '—'} color={info.recyclers > 0 ? '#1fb3a6' : 'var(--color-text-dim)'} />
                  {scientistTotal > 0 && <Stat label="Scientists" value={scientistTotal} color="#ef9b9b" />}
                  {info.puzzles.length > 0 && <Stat label="Puzzles" value={info.puzzles.length} color="#f5c451" />}
                  {info.radiation !== 'none' && <Stat label="Radiation" value={`${info.radMedian ?? '?'} / ${info.radMax ?? '?'}`} color={rad?.color} />}
                </div>
                {hasFeatures && (
                  <div className="mip-flags">
                    <FlagChip on={info.recyclers > 0} label="Recycler" />
                    <FlagChip on={info.hasTunnelEntrance} label="Tunnel Entry" />
                    <FlagChip on={info.hasChinookDropZone} label="Chinook Drop" />
                    <FlagChip on={info.allowsHeliCrash} label="Heli Crash" />
                  </div>
                )}
              </Section>

              {/* PUZZLES & KEYCARDS */}
              {(info.puzzles.length > 0 || requiredCards.length > 0 || (info.optionalCards || []).length > 0 || info.givesCards.length > 0) && (
                <Section
                  id="puzzles"
                  title="Puzzles & Keycards"
                  count={info.puzzles.length || undefined}
                  accent="#f5c451"
                  icon={<KeyRound size={13} />}
                  open={isOpen('puzzles')}
                  onToggle={() => toggleSection('puzzles')}
                >
                  <div className={`mip-cards${info.puzzles.length ? ' mip-cards--mb' : ''}`}>
                    {requiredCards.length === 0 && (info.optionalCards || []).length === 0
                      ? <span className="mip-none">No keycard required</span>
                      : requiredCards.map((c) => <CardChip key={`r-${c}`} card={c} label={`Needs ${c}`} />)}
                    {(info.optionalCards || []).map((c) => <CardChip key={`o-${c}`} card={c} label={`${c} optional`} />)}
                    {info.givesCards.map((c) => <CardChip key={`g-${c}`} card={c} label={`Gives ${c}`} />)}
                  </div>
                  {info.puzzles.length > 0 && (
                    <>
                      <div className="mip-puzzles">
                        {info.puzzles.map((p, i) => (
                          <PuzzleCard
                            key={i}
                            puzzle={p}
                            open={openPuzzle === i}
                            onToggle={() => setOpenPuzzle(openPuzzle === i ? null : i)}
                          />
                        ))}
                      </div>
                      <div className="mip-hint">Tap a room to expand its bring / reward list</div>
                    </>
                  )}
                </Section>
              )}

              {/* CRATES & LOOT */}
              {(info.crates.length > 0 || info.scientists.length > 0) && (
                <Section
                  id="loot"
                  title="Crates & Loot"
                  accent="#f5c451"
                  icon={<Package size={13} />}
                  open={isOpen('loot')}
                  onToggle={() => toggleSection('loot')}
                >
                  {info.crates.length > 0 && (
                    <div className="mip-loot-group">
                      <div className="mip-loot-head">CRATES · TAP FOR LOOT %</div>
                      <div className="mip-loot-list">
                        {info.crates.map((c, i) => (
                          <button key={i} className="mip-loot-btn mip-loot-btn--crate" onClick={() => setLootPopup(c.loot)}>
                            <span className="mip-loot-btn__left">
                              <Package size={13} />
                              {c.label}
                            </span>
                            <span className="mip-loot-btn__right">
                              <span className="mip-loot-btn__count">×{c.count}</span>
                              <span className="mip-loot-btn__more">loot ›</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {info.scientists.length > 0 && (
                    <div className="mip-loot-group">
                      <div className="mip-loot-head">SCIENTISTS · TAP FOR DROPS</div>
                      <div className="mip-loot-list">
                        {info.scientists.map((s, i) => (
                          <button key={i} className="mip-loot-btn mip-loot-btn--sci" onClick={() => setLootPopup(s.loot)}>
                            <span className="mip-loot-btn__left">
                              <Skull size={13} />
                              {s.label}
                            </span>
                            <span className="mip-loot-btn__right">
                              <span className="mip-loot-btn__count">×{s.count}</span>
                              <span className="mip-loot-btn__more">drops ›</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* BRADLEY APC */}
              {info.bradley && (
                <Section id="bradley" title="Bradley APC" accent="#ef6b6b" icon={<Crosshair size={13} />} open={isOpen('bradley')} onToggle={() => toggleSection('bradley')}>
                  <div className="mip-block mip-block--bradley">
                    <div className="mip-block__row"><span className="mip-block__key">Destroy:</span> <span className="mip-block__danger">{info.bradley.destroy}</span></div>
                    <div className="mip-block__row"><span className="mip-block__key">Drops:</span> <span className="mip-block__gold">{info.bradley.drops}</span></div>
                    <ul className="mip-block__list">
                      {info.bradley.loot.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  </div>
                </Section>
              )}

              {/* RESOURCE OUTPUT (mining) */}
              {info.mining && (
                <Section id="mining" title="Resource Output" accent="#cfae6d" icon={<Pickaxe size={13} />} open={isOpen('mining')} onToggle={() => toggleSection('mining')}>
                  <div className="mip-block mip-block--mining">
                    <div className="mip-block__gold-sm">Fuel: {info.mining.fuel}</div>
                    {info.mining.runTime && <div className="mip-block__sub">{info.mining.runTime}</div>}
                    <ul className="mip-block__list mip-block__list--bright">
                      {info.mining.outputs.map((o, i) => <li key={i}>{o}</li>)}
                    </ul>
                  </div>
                </Section>
              )}

              {/* MISSIONS */}
              {missions.length > 0 && (
                <Section id="missions" title="Missions" count={missions.length} accent="#58c6e8" icon={<ScrollText size={13} />} open={isOpen('missions')} onToggle={() => toggleSection('missions')}>
                  <div className="mip-missions">
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
              )}

              {/* TIPS & NOTES */}
              {info.notes.length > 0 && (
                <Section id="notes" title="Tips & Notes" accent="#6fcf73" icon={<Info size={13} />} open={isOpen('notes')} onToggle={() => toggleSection('notes')}>
                  <ul className="mip-notes">
                    {info.notes.map((n, i) => <li key={i}>{n}</li>)}
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
