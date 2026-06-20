import { useState, useEffect, useMemo } from 'react';
import { useCrateStore, parseTimer, DEFAULT_UNLOCK_SECONDS, CargoPos, CrateMarker } from '../../stores/crate-store';
import { useMapStore } from '../../stores/map-store';
import { useSettingsStore } from '../../stores/settings-store';
import { getMonumentName, monumentAllowsLockedCrate, normalizeMonumentKey, getMonumentImageUrl } from '../../utils/monuments';
import { getCurrentServer, isCurrentServer } from '../../utils/server';

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'UNLOCKED';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const CARGO_POS: { key: CargoPos; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'mid-front', label: 'Mid-F' },
  { key: 'mid-back', label: 'Mid-B' },
  { key: 'back', label: 'Back' },
];

export const getDeckPosition = (crate: { x: number; y: number }, cargo: { x: number; y: number; rotation?: number }): CargoPos => {
  const rotation = cargo.rotation || 0;
  const rad = (rotation * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = -Math.cos(rad);
  const dx = crate.x - cargo.x;
  const dy = crate.y - cargo.y;
  const Lf = dx * fx + dy * fy; // relative position along ship's forward heading axis
  
  if (Lf > 0.007) return 'front';
  if (Lf > 0) return 'mid-front';
  if (Lf > -0.007) return 'mid-back';
  return 'back';
};

export function CrateTool() {
  const { markers, addMarker, removeMarker, updateMarker } = useCrateStore();
  const monuments = useMapStore((s) => s.monuments);
  const liveMarkers = useMapStore((s) => s.markers);
  const defaultCrateSeconds = useSettingsStore((s) => s.defaultCrateSeconds);

  // 1s tick for live countdowns.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Build the unique list of monuments on this map that can hold a locked crate.
  const lockedCrateMonuments = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; name: string; img: string | null }[] = [];
    monuments.forEach((m) => {
      if (!monumentAllowsLockedCrate(m.token)) return;
      const key = normalizeMonumentKey(m.token);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, name: getMonumentName(m.token), img: getMonumentImageUrl(m.token) });
    });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [monuments]);

  const cargoMarker = useMemo(() => liveMarkers.find((m) => m.type === 'cargo_ship'), [liveMarkers]);
  const cargoLive = !!cargoMarker;

  // Form state
  const [target, setTarget] = useState<string>('cargo');
  const [cargoPos, setCargoPos] = useState<CargoPos>('front');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');

  // Which crate "slots" are already taken (1 per monument; front/middle/back for cargo).
  const usedCargoPos = new Set(markers.filter((m) => m.target === 'cargo').map((m) => m.cargoPos));
  const monumentTaken = (key: string) => markers.some((m) => m.target === key);

  const startTimer = (useCustom: boolean) => {
    const defaultSecs = useSettingsStore.getState().defaultCrateSeconds || DEFAULT_UNLOCK_SECONDS;
    let secs = defaultSecs;
    if (useCustom) {
      const parsed = parseTimer(custom);
      if (parsed === null || parsed <= 0) return;
      secs = parsed;
    }
    const now = Date.now();
    const server = getCurrentServer();

    if (target === 'cargo') {
      if (!cargoLive) return; // can't time a crate for a ship that isn't here
      if (usedCargoPos.has(cargoPos)) return; // slot taken
      addMarker({
        target: 'cargo',
        label: 'Cargo Ship',
        cargoPos,
        startedAt: now,
        unlocksAt: now + secs * 1000,
        note: note.trim() || undefined,
        serverId: server?.id,
        serverName: server?.name,
      });
    } else {
      if (monumentTaken(target)) return; // 1 per monument
      const name = lockedCrateMonuments.find((m) => m.key === target)?.name || target;
      addMarker({
        target,
        label: name,
        startedAt: now,
        unlocksAt: now + secs * 1000,
        note: note.trim() || undefined,
        serverId: server?.id,
        serverName: server?.name,
      });
    }
    setCustom(''); setNote('');
  };

  const startCargoTimer = (pos: CargoPos) => {
    const defaultSecs = useSettingsStore.getState().defaultCrateSeconds || DEFAULT_UNLOCK_SECONDS;
    const now = Date.now();
    const server = getCurrentServer();
    addMarker({
      target: 'cargo',
      label: 'Cargo Ship',
      cargoPos: pos,
      startedAt: now,
      unlocksAt: now + defaultSecs * 1000,
      note: note.trim() || undefined,
      serverId: server?.id,
      serverName: server?.name,
    });
  };

  const parsedCustom = parseTimer(custom);
  const customValid = parsedCustom !== null && parsedCustom > 0;
  const customTooLong = false;
  // Can't create a cargo timer when the ship isn't on the map.
  const cargoBlocked = target === 'cargo' && !cargoLive;
  const slotTaken = target === 'cargo' ? usedCargoPos.has(cargoPos) : monumentTaken(target);
  const startDisabled = slotTaken || cargoBlocked;

  // Cargo crates projection & spawn timer
  const elapsedMs = cargoMarker ? (Date.now() - cargoMarker.timestamp) : 0;
  const liveCargoCrates = useMemo(() => {
    if (!cargoMarker) return {} as Record<CargoPos, boolean>;
    const res = {} as Record<CargoPos, boolean>;
    liveMarkers.forEach((m) => {
      if (m.type === 'crate' && Math.hypot(m.x - cargoMarker.x, m.y - cargoMarker.y) < 0.05) {
        const pos = getDeckPosition(m, cargoMarker);
        res[pos] = true;
      }
    });
    return res;
  }, [liveMarkers, cargoMarker]);

  return (
    <div className="decay crate" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cargo Spawn Timeline Card */}
      {cargoLive && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(6, 182, 212, 0.03))',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
          fontFamily: 'var(--font-mono)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(6, 182, 212, 0.15)', paddingBottom: 6, marginBottom: 10 }}>
            <span style={{ color: '#06b6d4', fontSize: 13, fontWeight: 'bold' }}>⚓ CARGO TIMELINE</span>
            <span style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.45)', marginLeft: 'auto' }}>
              Entered map: {formatDuration(elapsedMs)} ago
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Crate 1: Back (Stern) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
              <span style={{ color: '#eee' }}>Crate 1 (Stern/Back)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {liveCargoCrates['back'] ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>● LIVE ON DECK</span>
                ) : (
                  <span style={{ color: '#aaa' }}>Spawned (0m)</span>
                )}
                <button
                  disabled={usedCargoPos.has('back')}
                  onClick={() => startCargoTimer('back')}
                  style={{
                    background: usedCargoPos.has('back') ? 'rgba(255,255,255,0.03)' : 'rgba(6, 182, 212, 0.2)',
                    border: usedCargoPos.has('back') ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(6, 182, 212, 0.4)',
                    color: usedCargoPos.has('back') ? 'rgba(255,255,255,0.3)' : '#06b6d4',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 9,
                    cursor: usedCargoPos.has('back') ? 'default' : 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {usedCargoPos.has('back') ? 'Active' : 'Start'}
                </button>
              </div>
            </div>

            {/* Crate 2: Mid-Back */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
              <span style={{ color: '#eee' }}>Crate 2 (Mid-Back)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {elapsedMs < 600000 ? (
                  <span style={{ color: '#f59e0b' }}>Spawns in {formatRemaining(600000 - elapsedMs)}</span>
                ) : liveCargoCrates['mid-back'] ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>● LIVE ON DECK</span>
                ) : (
                  <span style={{ color: '#aaa' }}>Spawned (10m)</span>
                )}
                <button
                  disabled={usedCargoPos.has('mid-back')}
                  onClick={() => startCargoTimer('mid-back')}
                  style={{
                    background: usedCargoPos.has('mid-back') ? 'rgba(255,255,255,0.03)' : 'rgba(6, 182, 212, 0.2)',
                    border: usedCargoPos.has('mid-back') ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(6, 182, 212, 0.4)',
                    color: usedCargoPos.has('mid-back') ? 'rgba(255,255,255,0.3)' : '#06b6d4',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 9,
                    cursor: usedCargoPos.has('mid-back') ? 'default' : 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {usedCargoPos.has('mid-back') ? 'Active' : 'Start'}
                </button>
              </div>
            </div>

            {/* Crate 3: Mid-Front */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
              <span style={{ color: '#eee' }}>Crate 3 (Mid-Front)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {elapsedMs < 1200000 ? (
                  <span style={{ color: '#f59e0b' }}>Spawns in {formatRemaining(1200000 - elapsedMs)}</span>
                ) : liveCargoCrates['mid-front'] ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>● LIVE ON DECK</span>
                ) : (
                  <span style={{ color: '#aaa' }}>Spawned (20m)</span>
                )}
                <button
                  disabled={usedCargoPos.has('mid-front')}
                  onClick={() => startCargoTimer('mid-front')}
                  style={{
                    background: usedCargoPos.has('mid-front') ? 'rgba(255,255,255,0.03)' : 'rgba(6, 182, 212, 0.2)',
                    border: usedCargoPos.has('mid-front') ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(6, 182, 212, 0.4)',
                    color: usedCargoPos.has('mid-front') ? 'rgba(255,255,255,0.3)' : '#06b6d4',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 9,
                    cursor: usedCargoPos.has('mid-front') ? 'default' : 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {usedCargoPos.has('mid-front') ? 'Active' : 'Start'}
                </button>
              </div>
            </div>

            {/* Crate 4: Front (Bow) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
              <span style={{ color: '#eee' }}>Crate 4 (Bow/Front)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {elapsedMs < 1800000 ? (
                  <span style={{ color: '#f59e0b' }}>Spawns in {formatRemaining(1800000 - elapsedMs)}</span>
                ) : liveCargoCrates['front'] ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>● LIVE ON DECK</span>
                ) : (
                  <span style={{ color: '#aaa' }}>Spawned (30m)</span>
                )}
                <button
                  disabled={usedCargoPos.has('front')}
                  onClick={() => startCargoTimer('front')}
                  style={{
                    background: usedCargoPos.has('front') ? 'rgba(255,255,255,0.03)' : 'rgba(6, 182, 212, 0.2)',
                    border: usedCargoPos.has('front') ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(6, 182, 212, 0.4)',
                    color: usedCargoPos.has('front') ? 'rgba(255,255,255,0.3)' : '#06b6d4',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 9,
                    cursor: usedCargoPos.has('front') ? 'default' : 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {usedCargoPos.has('front') ? 'Active' : 'Start'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Crate Timer Form */}
      <div className="decay-form" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 12 }}>
        <div className="decay-section-head" style={{ marginBottom: 10 }}><h3>NEW LOCKED CRATE</h3></div>

        {/* Target selector */}
        <label className="crate-field-label" style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>LOCATION</label>
        <div className="crate-targets crate-targets--grid" style={{ marginBottom: 12 }}>
          <button
            className={`crate-target crate-target--tile ${target === 'cargo' ? 'active' : ''} ${!cargoLive ? 'dim' : ''}`}
            onClick={() => setTarget('cargo')}
          >
            <span className="crate-target-thumb crate-target-thumb--cargo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 16l1.5-5h17L22 16" />
                <path d="M2 16c1.5 2 3 2 4.5 0s3-2 4.5 0s3 2 4.5 0s3-2 4.5 0" />
                <path d="M6 11V7h6l3 4" />
              </svg>
            </span>
            <span className="crate-target-name">Cargo Ship</span>
            {!cargoLive && <span className="crate-target-tag">offline</span>}
          </button>
          {lockedCrateMonuments.map((m) => (
            <button
              key={m.key}
              className={`crate-target crate-target--tile ${target === m.key ? 'active' : ''} ${monumentTaken(m.key) ? 'taken' : ''}`}
              onClick={() => setTarget(m.key)}
              title={monumentTaken(m.key) ? 'Already has an active timer' : m.name}
            >
              <span className="crate-target-thumb">
                {m.img ? (
                  <img src={m.img} alt="" draggable={false} />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
                    <path d="M3 7l9 4 9-4M12 11v10" />
                  </svg>
                )}
              </span>
              <span className="crate-target-name">{m.name}</span>
              {monumentTaken(m.key) && <span className="crate-target-check">✓</span>}
            </button>
          ))}
        </div>

        {/* Cargo position */}
        {target === 'cargo' && (
          <div style={{ marginBottom: 12 }}>
            <label className="crate-field-label" style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>DECK POSITION</label>
            <div className="crate-cargo-pos">
              {CARGO_POS.map((p) => (
                <button
                  key={p.key}
                  className={`crate-pos ${cargoPos === p.key ? 'active' : ''} ${usedCargoPos.has(p.key) ? 'taken' : ''}`}
                  onClick={() => setCargoPos(p.key)}
                  title={usedCargoPos.has(p.key) ? 'Already timed' : ''}
                >
                  {p.label}{usedCargoPos.has(p.key) ? ' ✓' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timer Input */}
        <label className="crate-field-label" style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>HACK TIMER</label>
        <div className="crate-timer-row">
          <button className="crate-start-15" onClick={() => startTimer(false)} disabled={startDisabled}>
            Start {fmtSecs(defaultCrateSeconds)}
          </button>
          <span className="crate-or">or</span>
          <input
            className="crate-custom-input"
            placeholder="mm:ss (e.g. 13:54)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && customValid && !startDisabled) startTimer(true); }}
          />
          <button className="crate-start-custom" onClick={() => startTimer(true)} disabled={!customValid || startDisabled}>
            Start
          </button>
        </div>
        {custom && !customValid && !customTooLong && <div className="crate-invalid">Use mm:ss (e.g. 13:54) or minutes.</div>}
        {cargoBlocked && <div className="crate-invalid">Cargo Ship is not on the map.</div>}
        {!cargoBlocked && slotTaken && <div className="crate-invalid">This position/monument has an active timer.</div>}

        <label className="crate-field-label" style={{ marginTop: 14, fontSize: 9, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>NOTES</label>
        <textarea className="decay-note crate-note" placeholder="Notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {/* Active Timers List */}
      <div>
        <div className="decay-section-head" style={{ marginBottom: 10 }}><h3>ACTIVE TIMERS ({markers.length})</h3></div>
        {markers.length === 0 ? (
          <div className="decay-empty">No active crate countdowns.</div>
        ) : (
          <div className="decay-list">
            {[...markers].sort((a, b) => a.unlocksAt - b.unlocksAt).map((m) => (
              <CrateCard key={m.id} m={m} onRemove={() => removeMarker(m.id)} onUpdate={updateMarker} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CrateCard({ m, onRemove, onUpdate }: { m: CrateMarker; onRemove: () => void; onUpdate: (id: string, data: Partial<CrateMarker>) => void }) {
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  const remaining = m.unlocksAt - Date.now();
  const total = Math.max(1, m.unlocksAt - m.startedAt);
  const pct = Math.max(0, Math.min(1, remaining / total));
  const danger = remaining <= 0 ? 'dead' : pct < 0.25 ? 'soon' : 'ok';
  const title = m.target === 'cargo'
    ? `Cargo · ${m.cargoPos ? m.cargoPos[0].toUpperCase() + m.cargoPos.slice(1) : ''}`
    : m.label;
  const foreign = !isCurrentServer(m.serverId);

  const startEdit = () => {
    const secs = Math.max(0, Math.round(remaining / 1000));
    const mm = Math.floor(secs / 60), ss = secs % 60;
    setEditVal(`${mm}:${ss.toString().padStart(2, '0')}`);
    setEditing(true);
  };

  const saveEdit = () => {
    const parsed = parseTimer(editVal);
    if (parsed === null || parsed <= 0) return;
    const now = Date.now();
    onUpdate(m.id, { startedAt: now, unlocksAt: now + parsed * 1000 });
    setEditing(false);
  };

  return (
    <div className={`decay-card decay-card--${danger}`}>
      <div className="decay-card-body">
        <div className="decay-card-head">
          <span className="decay-card-label">{title}</span>
          {m.target === 'cargo' && <span className="decay-card-grid">SHIP</span>}
          {foreign && (
            <span className="decay-card-foreign" title={m.serverName || 'Other server'}>
              {m.serverName ? m.serverName.slice(0, 14) : 'OTHER SERVER'}
            </span>
          )}
          <button className="decay-card-edit" onClick={editing ? () => setEditing(false) : startEdit} title="Edit timer">✎</button>
          <button className="decay-card-del" onClick={onRemove}>×</button>
        </div>
        {editing ? (
          <div className="crate-edit-row">
            <input
              className="crate-custom-input"
              autoFocus
              placeholder="mm:ss"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
            />
            <button className="crate-start-custom" onClick={saveEdit} disabled={parseTimer(editVal) === null}>Save</button>
            <button className="crate-edit-cancel" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <div className="decay-card-meta">
              <span className="decay-card-mat">{m.target === 'cargo' ? 'Cargo Crate' : 'Chinook Crate'}</span>
              <span className={`decay-card-time decay-card-time--${danger}`}>{formatRemaining(remaining)}</span>
            </div>
            <div className="decay-bar"><div className={`decay-bar-fill decay-bar-fill--${danger}`} style={{ width: `${pct * 100}%` }} /></div>
            {m.note && <div className="decay-card-note">{m.note}</div>}
          </>
        )}
      </div>
    </div>
  );
}
