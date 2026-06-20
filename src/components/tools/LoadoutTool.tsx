import { useMemo, useState, useRef, useEffect } from 'react';
import {
  ARMOR_PIECES, ARMOR_INSERTS, RUST_WEAPONS, ArmorPiece, ArmorInsert, ArmorSlot, RustWeapon,
  Loadout, computeHits, pieceProtection, setSummary, partSummaries, BodyPart,
  LOADOUT_PRESETS, PLAYER_HP, RANGE_PRESETS, rangeFalloff,
  AMMO_TYPES, AmmoType, defaultAmmo, blockedSlots,
} from '../../utils/loadout';
import {
  Shield, Swords, Bomb, Search, X, ChevronDown, Trash2, Flame, Ban,
  HardHat, Shirt, PersonStanding, Hand, Footprints, Crosshair, Gauge,
  Ruler, Skull, Layers, EyeOff, Snowflake, Plus, Radiation, Droplet,
} from 'lucide-react';
import './LoadoutTool.css';

function icon(shortname: string): string {
  return `https://cdn.rusthelp.com/images/256/${shortname.replace(/[._]/g, '-')}.webp`;
}
function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
}

const SLOT_LABEL: Record<ArmorSlot, string> = {
  head: 'Head', chest: 'Chest', legs: 'Legs', hands: 'Hands', feet: 'Feet',
};
const SLOT_ORDER: ArmorSlot[] = ['head', 'chest', 'legs', 'hands', 'feet'];
const SLOT_ICON: Record<ArmorSlot, React.ReactNode> = {
  head: <HardHat size={13} />, chest: <Shirt size={13} />, legs: <PersonStanding size={13} />,
  hands: <Hand size={13} />, feet: <Footprints size={13} />,
};

const CAT_LABEL: Record<string, string> = {
  rifles: 'Rifles', smgs: 'SMGs', pistols: 'Pistols', shotguns: 'Shotguns',
  bows: 'Bows', melee: 'Melee', explosive: 'Explosives',
};

// A simple id for distinguishing equipped clones that carry inserts.
let cloneSeq = 0;

export function LoadoutTool() {
  const [loadout, setLoadout] = useState<Loadout>({});
  const [weapon, setWeapon] = useState<RustWeapon>(RUST_WEAPONS[0]);
  const [ammo, setAmmo] = useState<AmmoType | null>(defaultAmmo(RUST_WEAPONS[0]));
  const [pickerSlot, setPickerSlot] = useState<ArmorSlot | null>(null);
  const [insertTarget, setInsertTarget] = useState<{ slot: ArmorSlot; key: string } | null>(null);
  const [distance, setDistance] = useState<number>(0);

  const blocked = useMemo(() => blockedSlots(loadout), [loadout]);
  const hits = useMemo(() => computeHits(weapon, loadout, distance, ammo), [weapon, loadout, distance, ammo]);
  const summary = useMemo(() => setSummary(loadout), [loadout]);
  const parts = useMemo(() => partSummaries(loadout), [loadout]);
  const rangeMult = useMemo(() => {
    const stretch = ammo?.rangeMult ?? 1;
    const w = stretch === 1 ? weapon : { ...weapon, effectiveRange: weapon.effectiveRange ? weapon.effectiveRange * stretch : weapon.effectiveRange, maxRange: weapon.maxRange ? weapon.maxRange * stretch : weapon.maxRange };
    return rangeFalloff(w, distance);
  }, [weapon, distance, ammo]);
  const hasFalloff = !!weapon.effectiveRange;
  const ammoOptions = weapon.ammoClass ? AMMO_TYPES[weapon.ammoClass] : null;
  const equippedCount = useMemo(
    () => Object.values(loadout).reduce((n, arr) => n + (arr?.length || 0), 0), [loadout]);

  const pickWeapon = (w: RustWeapon) => { setWeapon(w); setAmmo(defaultAmmo(w)); };

  const equip = (slot: ArmorSlot, piece: ArmorPiece) => {
    // Clone so each equipped piece can carry its own inserts independently.
    const clone: ArmorPiece = { ...piece, inserts: piece.insertSlots ? [] : undefined, key: `${piece.key}#${++cloneSeq}` };
    setLoadout((prev) => {
      const next: Loadout = { ...prev };
      if (piece.slots.length > 1) {
        // Suit: clear the slots it covers, then occupy them. Slots it does NOT
        // cover (e.g. paintball overalls leave hands & feet) are preserved.
        for (const s of piece.slots) next[s] = [clone];
        // Drop any other multi-slot suit that no longer fully fits.
        for (const s of Object.keys(next) as ArmorSlot[]) {
          const arr = next[s] || [];
          if (arr.some((p) => p.slots.length > 1 && p.key !== clone.key)) delete next[s];
        }
        for (const b of blockedSlots(next)) if (next[b]) delete next[b];
        return next;
      }
      const current = (next[slot] || []).filter((p) => p.slots.length === 1);
      // If a multi-slot suit currently occupies this slot, remove it entirely
      // from every slot it covers (no broken partial suits).
      const suit = (next[slot] || []).find((p) => p.slots.length > 1);
      if (suit) for (const s of suit.slots) delete next[s];
      if (piece.dualLayer || piece.fullFace) {
        // Full-face helmet / both-layer item — nothing else fits on this slot.
        next[slot] = [clone];
      } else if (piece.layer === 1 && piece.sub) {
        // Inner head item with attachment points (face / hat). Keep items on
        // OTHER layers, keep other inner items whose sub points don't overlap,
        // and drop any full-face/dual occupant.
        const subSet = new Set(piece.sub);
        const filtered = current.filter((p) => {
          if (p.dualLayer || p.fullFace) return false;
          if (p.layer !== 1) return true;                          // keep outer armor
          if (!p.sub) return false;                                // legacy whole-inner item
          return !p.sub.some((s) => subSet.has(s));                // no point clash
        });
        next[slot] = [...filtered, clone];
      } else {
        // Drop the same layer, any dual/full-face occupant, then add.
        const filtered = current.filter((p) => p.layer !== piece.layer && !p.dualLayer && !p.fullFace);
        next[slot] = [...filtered, clone];
      }
      for (const b of blockedSlots(next)) if (next[b]) delete next[b];
      return next;
    });
    setPickerSlot(null);
  };

  const unequip = (slot: ArmorSlot, key: string) => {
    setLoadout((prev) => {
      const piece = (prev[slot] || []).find((p) => p.key === key);
      // Full-body suit: removing from one slot removes from every slot.
      if (piece && piece.slots.length > 1) {
        const next = { ...prev };
        for (const s of piece.slots) delete next[s];
        return next;
      }
      const next = { ...prev };
      next[slot] = (next[slot] || []).filter((p) => p.key !== key);
      if (next[slot]!.length === 0) delete next[slot];
      return next;
    });
  };

  const setInserts = (slot: ArmorSlot, key: string, inserts: string[]) => {
    setLoadout((prev) => {
      const next = { ...prev };
      next[slot] = (next[slot] || []).map((p) => p.key === key ? { ...p, inserts } : p);
      return next;
    });
  };

  /** Switch a multi-slot suit between its variants (e.g. Hazmat ↔ Arctic). */
  const setVariant = (key: string, variantName: string) => {
    setLoadout((prev) => {
      const next = { ...prev };
      for (const s of Object.keys(next) as ArmorSlot[]) {
        next[s] = (next[s] || []).map((p) => {
          if (p.key !== key || !p.variants) return p;
          const v = p.variants.find((x) => x.name === variantName);
          if (!v) return p;
          return { ...p, name: v.name, icon: v.icon, protection: v.protection, waterproof: v.waterproof };
        });
      }
      return next;
    });
  };

  const applyPreset = (pieceKeys: string[]) => {
    const next: Loadout = {};
    for (const k of pieceKeys) {
      const base = ARMOR_PIECES.find((p) => p.key === k);
      if (!base) continue;
      const piece: ArmorPiece = { ...base, inserts: base.insertSlots ? [] : undefined, key: `${base.key}#${++cloneSeq}` };
      for (const s of piece.slots) {
        next[s] = next[s] || [];
        if (piece.dualLayer) next[s] = [piece];
        else if (!next[s]!.some((x) => x.dualLayer)) next[s] = [...next[s]!.filter((x) => x.layer !== piece.layer), piece];
      }
    }
    for (const b of blockedSlots(next)) if (next[b]) delete next[b];
    setLoadout(next);
  };

  const clearAll = () => setLoadout({});
  const piecesForSlot = (slot: ArmorSlot) => ARMOR_PIECES.filter((p) => p.slots.includes(slot));

  const anyLethal = hits.some((h) => h.finalDamage + h.dotDamage >= PLAYER_HP);
  const insertPiece = insertTarget ? (loadout[insertTarget.slot] || []).find((p) => p.key === insertTarget.key) : null;
  // The equipped multi-slot suit that offers variants (e.g. Hazmat ↔ Arctic).
  const variantSuit = useMemo(() => {
    for (const s of SLOT_ORDER) {
      const p = (loadout[s] || []).find((x) => x.variants && x.variants.length > 1);
      if (p) return p;
    }
    return null;
  }, [loadout]);

  return (
    <div className="decay loadout">
      <div className="decay-section-head">
        <h3><Crosshair size={14} /> LOADOUT &amp; DAMAGE LAB</h3>
        {equippedCount > 0 && <button className="loadout-clear" onClick={clearAll}><Trash2 size={11} /> Clear all</button>}
      </div>

      {/* Preset bar */}
      <div className="loadout-presets">
        <span className="loadout-presets-label"><Layers size={11} /> Presets</span>
        {LOADOUT_PRESETS.map((p) => (
          <button key={p.name} className="loadout-preset-btn" onClick={() => applyPreset(p.pieces)}>{p.name}</button>
        ))}
      </div>

      <div className="loadout-grid">
        {/* LEFT: paper-doll + slots + stats */}
        <div className="loadout-doll">
          <DollSilhouette hits={hits} weapon={weapon} />

          {variantSuit && (
            <div className="loadout-variant">
              <span className="loadout-variant-label">Suit Variant</span>
              <div className="loadout-variant-btns">
                {variantSuit.variants!.map((v) => (
                  <button key={v.name}
                    className={`loadout-variant-btn ${variantSuit.name === v.name ? 'active' : ''}`}
                    onClick={() => setVariant(variantSuit.key, v.name)}>
                    <img src={icon(v.icon)} alt="" onError={hideOnError} />
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="doll-slots">
            {SLOT_ORDER.map((slot) => (
              <SlotRow key={slot} slot={slot} pieces={loadout[slot] || []} blocked={blocked.has(slot)}
                onAdd={() => setPickerSlot(slot)} onRemove={(k) => unequip(slot, k)}
                onInserts={(k) => setInsertTarget({ slot, key: k })} />
            ))}
          </div>

          {/* Per-part protection (Rust-style: head / chest / legs sets) */}
          <div className="loadout-parts">
            <div className="loadout-parts-title">Protection by Body Part <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>· arms→chest, feet→legs</span></div>
            <div className="parts-head">
              <span title="Bullet"><Shield size={11} /></span>
              <span title="Melee"><Swords size={11} /></span>
              <span title="Explosion"><Bomb size={11} /></span>
              <span />
            </div>
            {parts.map((ps) => (
              <div key={ps.part} className="parts-row">
                <span className="parts-val" style={{ color: '#58c6e8' }}>{Math.round(ps.projectile * 100)}%</span>
                <span className="parts-val" style={{ color: '#f5c451' }}>{Math.round(ps.melee * 100)}%</span>
                <span className="parts-val" style={{ color: '#ef6b6b' }}>{Math.round(ps.explosion * 100)}%</span>
                <span className="parts-part">
                  {ps.part === 'chest' ? 'chest +arms' : ps.part === 'legs' ? 'legs +feet' : ps.part}
                  {SLOT_ICON[ps.part as ArmorSlot]}
                </span>
              </div>
            ))}
          </div>

          {/* Global stats (only the ones Rust shows globally) */}
          <div className="loadout-global">
            <div className="loadout-global-title">Global</div>
            <GlobalStat icon={<Bomb size={12} />} label="Explosive" value={summary.explosionGlobal} color="#ef6b6b" />
            <GlobalStat icon={<Radiation size={12} />} label="Radiation" value={summary.radiation} color="#9ad14b" />
            <GlobalStat icon={<Snowflake size={12} />} label="Cold" value={summary.cold} color="#7fc7e8" signed />
            <GlobalStat icon={<AnimalIcon />} label="Animals" value={summary.animal} color="#d8954b" />
            {summary.waterproof && <div className="loadout-waterproof"><Droplet size={11} /> Waterproof</div>}
          </div>

          {(summary.blocksADS || summary.speedPenalty > 0) && (
            <div className="loadout-debuffs">
              {summary.speedPenalty > 0 && <span><Gauge size={10} /> −{Math.round(summary.speedPenalty * 100)}% move speed</span>}
              {summary.blocksADS && <span><EyeOff size={10} /> blocks ADS</span>}
            </div>
          )}
        </div>

        {/* RIGHT: weapon + results */}
        <div className="loadout-right">
          <WeaponPicker weapon={weapon} onPick={pickWeapon} />

          {ammoOptions && ammo && (
            <div className="loadout-ammo">
              <span className="loadout-ammo-label"><Crosshair size={11} /> Ammo</span>
              <div className="loadout-ammo-btns">
                {ammoOptions.map((a) => (
                  <button key={a.key} className={`loadout-ammo-btn ${ammo.key === a.key ? 'active' : ''}`}
                    title={a.note || a.name} onClick={() => setAmmo(a)}>
                    {a.dot ? <Flame size={10} /> : null}{a.short}
                  </button>
                ))}
              </div>
            </div>
          )}
          {ammo?.note && <p className="loadout-ammo-note">{ammo.dot ? <Flame size={11} /> : null} {ammo.note}</p>}

          {hasFalloff && (
            <div className="loadout-range">
              <div className="loadout-range-head">
                <span><Ruler size={11} /> RANGE</span>
                <span className="loadout-range-mult">{Math.round(rangeMult * 100)}% dmg @ {distance}m</span>
              </div>
              <div className="loadout-range-btns">
                {RANGE_PRESETS.map((r) => (
                  <button key={r.key} className={`loadout-range-btn ${distance === r.metres ? 'active' : ''}`}
                    onClick={() => setDistance(r.metres)}>{r.label}</button>
                ))}
              </div>
              <input type="range" min={0} max={weapon.maxRange || 300} value={distance}
                onChange={(e) => setDistance(parseInt(e.target.value))} className="loadout-range-slider" />
            </div>
          )}

          <div className="loadout-results">
            {hits.map((h) => {
              const total = h.finalDamage + h.dotDamage;
              const lethal = total >= PLAYER_HP;
              return (
                <div key={h.part} className={`hit-row hit-${h.part} ${lethal ? 'hit-lethal' : ''}`}>
                  <div className="hit-head">
                    <span className="hit-part">
                      {h.part === 'head' ? <Skull size={12} /> : h.part === 'chest' ? <Shirt size={12} /> : <PersonStanding size={12} />}
                      {h.part}
                    </span>
                    <span className="hit-dmg">{h.finalDamage.toFixed(1)}<small> dmg</small>{h.dotDamage > 0 && <em className="hit-dot"> +{h.dotDamage}<Flame size={10} /></em>}</span>
                  </div>
                  <div className="hit-bar-track">
                    <div className="hit-bar-fill" style={{ width: `${Math.min(100, (total / PLAYER_HP) * 100)}%` }} />
                  </div>
                  <div className="hit-meta">
                    <span className="hit-mult">×{h.multiplier} {h.part === 'head' ? 'head' : 'mult'}</span>
                    {h.protection > 0 && <span className="hit-prot"><Shield size={9} /> −{Math.round(h.protection * 100)}%</span>}
                    <span className="hit-htk">
                      {h.hitsToKill === Infinity ? '∞' : h.hitsToKill}× {h.hitsToKill === 1 ? 'shot' : 'shots'}
                      {h.ttkSeconds !== Infinity && h.ttkSeconds > 0 && <em> · {h.ttkSeconds.toFixed(2)}s</em>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {anyLethal && <div className="loadout-lethal-tag"><Skull size={12} /> One-shot kill possible</div>}
          {weapon.note && <p className="loadout-weapon-note">ⓘ {weapon.note}</p>}
        </div>
      </div>

      {pickerSlot && (
        <ArmorPicker slot={pickerSlot} pieces={piecesForSlot(pickerSlot)} equipped={loadout[pickerSlot] || []}
          onPick={(p) => equip(pickerSlot, p)} onClose={() => setPickerSlot(null)} />
      )}

      {insertTarget && insertPiece && (
        <InsertModal piece={insertPiece}
          onChange={(ins) => setInserts(insertTarget.slot, insertTarget.key, ins)}
          onClose={() => setInsertTarget(null)} />
      )}
    </div>
  );
}

function AnimalIcon() {
  // Lucide has no wolf; use a small inline fang glyph to match Rust's animal stat.
  return <span style={{ fontSize: 13, lineHeight: 1 }}>🐾</span>;
}

function GlobalStat({ icon, label, value, color, signed }: { icon: React.ReactNode; label: string; value: number; color: string; signed?: boolean }) {
  const pct = Math.round(value * 100);
  const display = signed ? `${pct > 0 ? '+' : ''}${pct}%` : `${pct}%`;
  return (
    <div className="global-stat">
      <span className="global-stat-icon" style={{ color }}>{icon}</span>
      <span className="global-stat-lbl">{label}</span>
      <span className="global-stat-val" style={{ color: value === 0 ? 'var(--color-text-muted)' : color }}>{value === 0 ? '—' : display}</span>
    </div>
  );
}

function SlotRow({ slot, pieces, blocked, onAdd, onRemove, onInserts }: {
  slot: ArmorSlot; pieces: ArmorPiece[]; blocked: boolean;
  onAdd: () => void; onRemove: (k: string) => void; onInserts: (k: string) => void;
}) {
  // Show outer armor (layer 2 — helmet/chestplate/kilt) first, then inner clothing.
  const ordered = [...pieces].sort((a, b) => b.layer - a.layer);
  return (
    <div className={`slot-row ${blocked ? 'slot-row-blocked' : ''}`}>
      <span className="slot-label">{SLOT_ICON[slot]} {SLOT_LABEL[slot]}</span>
      <div className="slot-items">
        {ordered.map((p) => (
          <div key={p.key} className={`slot-chip tier-${p.tier}`}>
            <button className="slot-chip-main" title={`Remove ${p.name}`} onClick={() => onRemove(p.key)}>
              <img src={icon(p.icon)} alt="" onError={hideOnError} />
              <span>{p.name}</span>
              <X size={9} className="slot-chip-x" />
            </button>
            {p.insertSlots ? (
              <button className="slot-chip-insert" title="Manage inserts" onClick={() => onInserts(p.key)}>
                <Layers size={10} />
                <span>{(p.inserts?.length || 0)}/{p.insertSlots}</span>
              </button>
            ) : null}
          </div>
        ))}
        {blocked ? (
          <span className="slot-blocked"><Ban size={10} /> blocked by heavy plate</span>
        ) : (
          <button className="slot-add" onClick={onAdd}><Plus size={11} /> Add</button>
        )}
      </div>
    </div>
  );
}

/** Insert management modal — up to insertSlots inserts of 4 types. */
function InsertModal({ piece, onChange, onClose }: {
  piece: ArmorPiece; onChange: (inserts: string[]) => void; onClose: () => void;
}) {
  const max = piece.insertSlots || 0;
  const inserts = piece.inserts || [];
  const slots = Array.from({ length: max }, (_, i) => inserts[i] || null);

  const setSlot = (idx: number, key: string | null) => {
    const next = [...slots];
    next[idx] = key;
    onChange(next.filter((x): x is string => !!x));
  };

  return (
    <div className="loadout-picker-overlay" onClick={onClose}>
      <div className="insert-modal" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h4><Layers size={13} /> {piece.name} — inserts</h4>
          <button onClick={onClose}><X size={14} /></button>
        </div>
        <div className="insert-body">
          {slots.map((cur, idx) => (
            <div key={idx} className="insert-slot">
              <div className="insert-slot-label">Slot {idx + 1}</div>
              <div className="insert-options">
                <button className={`insert-opt ${cur === null ? 'active' : ''}`} onClick={() => setSlot(idx, null)}>
                  <Ban size={14} /><span>Empty</span>
                </button>
                {ARMOR_INSERTS.map((ins) => (
                  <button key={ins.key} className={`insert-opt ${cur === ins.key ? 'active' : ''}`}
                    title={insertTip(ins)} onClick={() => setSlot(idx, ins.key)}>
                    <img src={icon(ins.icon)} alt="" onError={hideOnError} />
                    <span>{ins.name.replace(' Insert', '')}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="picker-foot">
          Metal +4% bullet · Wood +2% bullet/melee · Lead +5% radiation · Asbestos +8% explosion
        </p>
      </div>
    </div>
  );
}

function insertTip(ins: ArmorInsert): string {
  const parts: string[] = [];
  if (ins.projectile) parts.push(`+${Math.round(ins.projectile * 100)}% bullet`);
  if (ins.melee) parts.push(`+${Math.round(ins.melee * 100)}% melee`);
  if (ins.radiation) parts.push(`+${Math.round(ins.radiation * 100)}% radiation`);
  if (ins.explosion) parts.push(`+${Math.round(ins.explosion * 100)}% explosion`);
  return parts.join(' · ');
}

/** Searchable weapon dropdown with icons grouped by category. */
function WeaponPicker({ weapon, onPick }: { weapon: RustWeapon; onPick: (w: RustWeapon) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const groups = useMemo(() => {
    const filtered = RUST_WEAPONS.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()));
    const g: Record<string, RustWeapon[]> = {};
    for (const w of filtered) (g[w.category] ||= []).push(w);
    return g;
  }, [q]);

  return (
    <div className="weapon-picker" ref={ref}>
      <button className="weapon-trigger" onClick={() => setOpen((v) => !v)}>
        <img src={icon(weapon.icon)} alt="" onError={hideOnError} />
        <div className="wt-info">
          <span className="wt-name">{weapon.name}</span>
          <span className="wt-stats">{weapon.pellets ? `${weapon.damage}×${weapon.pellets}` : weapon.damage} dmg · ×{weapon.headMult} head{weapon.rpm ? ` · ${weapon.rpm} rpm` : ''}</span>
        </div>
        <ChevronDown size={16} className={`wt-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="weapon-dropdown">
          <div className="weapon-search">
            <Search size={13} />
            <input autoFocus placeholder="Search weapons…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="weapon-list">
            {Object.keys(groups).length === 0 && <div className="weapon-empty">No match</div>}
            {(['rifles', 'smgs', 'pistols', 'shotguns', 'bows', 'melee', 'explosive'] as const)
              .filter((c) => groups[c]?.length).map((cat) => (
              <div key={cat} className="weapon-group">
                <div className="weapon-group-label">{CAT_LABEL[cat]}</div>
                {groups[cat].map((w) => (
                  <button key={w.key} className={`weapon-opt ${w.key === weapon.key ? 'active' : ''}`}
                    onClick={() => { onPick(w); setOpen(false); setQ(''); }}>
                    <img src={icon(w.icon)} alt="" onError={hideOnError} />
                    <span className="wo-name">{w.name}</span>
                    <span className="wo-dmg">{w.pellets ? `${w.damage}×${w.pellets}` : w.damage}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Armor selection modal, split into Inner clothing + Outer armor groups. */
function ArmorPicker({ slot, pieces, equipped, onPick, onClose }: {
  slot: ArmorSlot; pieces: ArmorPiece[]; equipped: ArmorPiece[];
  onPick: (p: ArmorPiece) => void; onClose: () => void;
}) {
  const inner = pieces.filter((p) => p.layer === 1 && p.slots.length === 1);
  const outer = pieces.filter((p) => p.layer === 2 && p.slots.length === 1 && p.tier !== 'hazmat');
  const suits = pieces.filter((p) => p.slots.length > 1);
  // Equipped clones carry a "#n" suffix; compare on the base key.
  const equippedBase = new Set(equipped.map((p) => p.key.split('#')[0]));
  // A full-face helmet blocks the inner clothing layer (e.g. metal facemask).
  const hasFullFace = equipped.some((p) => p.fullFace);

  const Group = ({ title, list, disabled }: { title: string; list: ArmorPiece[]; disabled?: boolean }) => list.length ? (
    <div className="picker-group">
      <div className="picker-group-title">{title}{disabled && <span className="picker-group-note"> — blocked by full-face helmet</span>}</div>
      <div className="picker-grid">
        {list.map((p) => (
          <button key={p.key} disabled={disabled}
            className={`picker-item tier-${p.tier} ${equippedBase.has(p.key) ? 'equipped' : ''} ${disabled ? 'disabled' : ''}`} onClick={() => !disabled && onPick(p)}>
            <img src={icon(p.icon)} alt="" onError={hideOnError} />
            <span className="pi-name">{p.name}</span>
            <span className="pi-prot">
              <b style={{ color: '#58c6e8' }}>{Math.round(pieceProtection(p, 'projectile') * 100)}</b>
              <b style={{ color: '#f5c451' }}>{Math.round(pieceProtection(p, 'melee') * 100)}</b>
              <b style={{ color: '#ef6b6b' }}>{Math.round(pieceProtection(p, 'explosion') * 100)}</b>
            </span>
            {p.insertSlots ? <span className="pi-tag pi-tag-slot"><Layers size={8} /> {p.insertSlots} slots</span> : null}
            {p.fullFace && <span className="pi-tag pi-tag-block">full-face</span>}
            {p.dualLayer && p.slots.length === 1 && !p.fullFace && <span className="pi-tag">both layers</span>}
            {p.layer === 1 && <span className="pi-tag pi-tag-inner">inner</span>}
            {p.blocksSlots?.length ? <span className="pi-tag pi-tag-block">blocks {p.blocksSlots.join('/')}</span> : null}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="loadout-picker-overlay" onClick={onClose}>
      <div className="loadout-picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h4>{SLOT_ICON[slot]} {SLOT_LABEL[slot]} — select gear</h4>
          <button onClick={onClose}><X size={14} /></button>
        </div>
        <div className="picker-body">
          {slot === 'head' || slot === 'chest' || slot === 'legs'
            ? <Group title="Inner Layer (clothing)" list={inner} disabled={slot === 'head' && hasFullFace} />
            : <Group title="Inner Layer (clothing)" list={inner} />}
          <Group title="Outer Layer (armor)" list={outer} />
          <Group title="Full-Body Suits" list={suits} />
        </div>
        <p className="picker-foot">
          <b style={{ color: '#58c6e8' }}>bullet</b> · <b style={{ color: '#f5c451' }}>melee</b> · <b style={{ color: '#ef6b6b' }}>explosion</b> % —
          inner + outer can be worn together
        </p>
      </div>
    </div>
  );
}

/** Premium damage dummy: heat-mapped silhouette + per-zone callout cards. */
function DollSilhouette({ hits, weapon }: { hits: ReturnType<typeof computeHits>; weapon: RustWeapon }) {
  const hit = (part: BodyPart) => hits.find((x) => x.part === part);
  const total = (part: BodyPart) => { const h = hit(part); return h ? h.finalDamage + h.dotDamage : 0; };
  const heat = (d: number) => {
    const t = Math.min(1, d / PLAYER_HP);
    if (t >= 1) return '#ff4d4d';
    const r = Math.round(120 + t * 135);
    const g = Math.round(210 - t * 160);
    const b = Math.round(90 - t * 45);
    return `rgb(${r},${g},${Math.max(38, b)})`;
  };
  const lethal = (part: BodyPart) => total(part) >= PLAYER_HP;

  // Callout card drawn in SVG space, with a connector to the zone anchor.
  const Callout = ({ part, label, cardY, ax, ay }: { part: BodyPart; label: string; cardY: number; ax: number; ay: number }) => {
    const h = hit(part);
    const dmg = h ? h.finalDamage : 0;     // direct impact damage (matches right panel)
    const col = heat(total(part));          // color by total incl. burn
    const isLethal = lethal(part);
    const htk = h ? h.hitsToKill : Infinity;
    const cx = 188, cw = 104, ch = 50;
    const cardMidY = cardY + ch / 2;
    const dmgStr = dmg.toFixed(0);
    return (
      <g>
        {/* connector */}
        <path d={`M ${ax} ${ay} L ${cx - 8} ${cardMidY}`} stroke={col} strokeWidth="1.4" strokeDasharray="2 2" opacity="0.6" fill="none" />
        <circle cx={ax} cy={ay} r="3.2" fill={col} stroke="#0a0c10" strokeWidth="1" />
        {/* card */}
        <rect x={cx} y={cardY} width={cw} height={ch} rx="9"
          fill="rgba(10,12,16,0.92)" stroke={isLethal ? col : 'rgba(255,255,255,0.1)'} strokeWidth={isLethal ? 1.6 : 1}
          filter={isLethal ? 'url(#dollGlow)' : undefined} />
        {/* accent bar */}
        <rect x={cx} y={cardY} width="3.5" height={ch} rx="2" fill={col} />
        {/* label */}
        <text x={cx + 12} y={cardY + 15} className="doll-co-label">{label}</text>
        {/* big damage number */}
        <text x={cx + 11} y={cardY + 37} className="doll-co-dmg" fill={col}>{dmgStr}</text>
        <text x={cx + 11 + dmgStr.length * 12.5} y={cardY + 37} className="doll-co-unit">DMG</text>
        {/* hits-to-kill pill */}
        <text x={cx + cw - 10} y={cardY + 16} textAnchor="end" className="doll-co-htk" fill={isLethal ? '#ff8080' : '#9fd8ec'}>
          {htk === Infinity ? '∞' : isLethal ? 'KILL' : `${htk}×`}
        </text>
        {h && h.dotDamage > 0 && (
          <text x={cx + cw - 10} y={cardY + 37} textAnchor="end" className="doll-co-dot">+{h.dotDamage}🔥</text>
        )}
      </g>
    );
  };

  return (
    <div className="doll-figure">
      <svg viewBox="0 0 300 264" className="doll-svg">
        <defs>
          <filter id="dollGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="dollAura" cx="50%" cy="42%" r="58%">
            <stop offset="0%" stopColor="rgba(206,66,43,0.16)" />
            <stop offset="100%" stopColor="rgba(206,66,43,0)" />
          </radialGradient>
          <radialGradient id="dollFloor" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(206,66,43,0.34)" />
            <stop offset="100%" stopColor="rgba(206,66,43,0)" />
          </radialGradient>
          <linearGradient id="dollLimb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#525b69" /><stop offset="100%" stopColor="#333944" />
          </linearGradient>
          <linearGradient id="dollGloss" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" /><stop offset="45%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Aura + target reticle backdrop behind the figure */}
        <ellipse cx="95" cy="120" rx="92" ry="120" fill="url(#dollAura)" />
        <circle cx="95" cy="120" r="78" fill="none" stroke="rgba(206,66,43,0.14)" strokeWidth="1" strokeDasharray="3 6" />
        {/* Ground shadow */}
        <ellipse cx="95" cy="252" rx="48" ry="9" fill="url(#dollFloor)" />

        {/* ── Body ── */}
        {/* Head */}
        <circle cx="95" cy="34" r="22" fill={heat(total('head'))} stroke={lethal('head') ? '#fff' : 'rgba(0,0,0,0.65)'} strokeWidth={lethal('head') ? 2.5 : 2} filter={lethal('head') ? 'url(#dollGlow)' : undefined} />
        <circle cx="95" cy="34" r="22" fill="url(#dollGloss)" opacity="0.5" />
        {/* Neck */}
        <rect x="87" y="52" width="16" height="12" rx="3" fill="url(#dollLimb)" />
        {/* Torso */}
        <path d="M65 64 H125 Q133 64 133 76 L129 130 Q128 140 117 140 H73 Q62 140 61 130 L57 76 Q57 64 65 64 Z"
          fill={heat(total('chest'))} stroke={lethal('chest') ? '#fff' : 'rgba(0,0,0,0.65)'} strokeWidth={lethal('chest') ? 2.5 : 2} filter={lethal('chest') ? 'url(#dollGlow)' : undefined} />
        <path d="M65 64 H125 Q133 64 133 76 L129 130 Q128 140 117 140 H73 Q62 140 61 130 L57 76 Q57 64 65 64 Z" fill="url(#dollGloss)" opacity="0.4" />
        {/* Arms */}
        <rect x="42" y="68" width="16" height="66" rx="8" fill="url(#dollLimb)" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
        <rect x="132" y="68" width="16" height="66" rx="8" fill="url(#dollLimb)" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
        {/* Legs */}
        <path d="M73 140 H93 L91 236 Q91 244 85 244 Q79 244 78 236 Z" fill={heat(total('legs'))} stroke={lethal('legs') ? '#fff' : 'rgba(0,0,0,0.65)'} strokeWidth={lethal('legs') ? 2.5 : 2} />
        <path d="M97 140 H117 L112 236 Q111 244 105 244 Q99 244 99 236 Z" fill={heat(total('legs'))} stroke={lethal('legs') ? '#fff' : 'rgba(0,0,0,0.65)'} strokeWidth={lethal('legs') ? 2.5 : 2} />

        {/* ── Callout cards ── */}
        <Callout part="head" label="HEAD" cardY={12} ax={116} ay={30} />
        <Callout part="chest" label="CHEST" cardY={94} ax={130} ay={100} />
        <Callout part="legs" label="LEGS" cardY={176} ax={114} ay={196} />
      </svg>

      <div className="doll-weapon-tag">
        <img src={icon(weapon.icon)} alt="" onError={hideOnError} />
        <span>{weapon.name}</span>
      </div>
    </div>
  );
}
