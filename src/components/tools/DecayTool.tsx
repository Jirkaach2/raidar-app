import { useState, useEffect } from 'react';
import { useDecayStore, DECAY_HOURS, MAX_HP, MATERIAL_LABEL, BuildMaterial } from '../../stores/decay-store';
import { getCurrentServer, isCurrentServer } from '../../utils/server';

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'DECAYED';
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

const BLOCKS: BuildMaterial[] = ['twig', 'wood', 'stone', 'metal', 'armored'];
const DOORS: BuildMaterial[] = ['wood_door', 'sheet_door', 'garage_door', 'armored_door'];

export function DecayTool() {
  const { markers, addMarker, removeMarker } = useDecayStore();
  const setPlaceMode = useDecayStore((s) => s.setPlaceMode);
  const placeMode = useDecayStore((s) => s.placeMode);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const [label, setLabel] = useState('');
  const [grid, setGrid] = useState('');
  const [material, setMaterial] = useState<BuildMaterial>('stone');
  const [hp, setHp] = useState('');
  const [note, setNote] = useState('');
  const [screenshot, setScreenshot] = useState<string | undefined>(undefined);

  const maxHp = MAX_HP[material];

  const onFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  };

  const parsedHp = hp.trim() === '' ? undefined : Math.round(Number(hp));
  const hpValid = parsedHp === undefined || (Number.isFinite(parsedHp) && parsedHp >= 1 && parsedHp <= maxHp);

  const submit = () => {
    if (!label.trim()) return;
    if (!hpValid) return;
    const server = getCurrentServer();
    addMarker({
      label: label.trim(),
      grid: grid.trim().toUpperCase(),
      material,
      hp: parsedHp,
      startedAt: Date.now(),
      note: note.trim() || undefined,
      screenshot,
      serverId: server?.id,
      serverName: server?.name,
    });
    setLabel(''); setGrid(''); setNote(''); setHp(''); setScreenshot(undefined); setMaterial('stone');
  };

  const renderMatBtn = (mat: BuildMaterial) => (
    <button key={mat} className={`decay-mat ${material === mat ? 'active' : ''}`} onClick={() => { setMaterial(mat); setHp(''); }}>
      {MATERIAL_LABEL[mat]}<span className="decay-mat-hrs">{DECAY_HOURS[mat]}h</span>
    </button>
  );

  return (
    <div className="decay">
      {/* New marker form */}
      <div className="decay-form">
        <div className="decay-section-head"><h3>NEW DECAY MARKER</h3></div>
        <div className="decay-fields">
          <input className="decay-input" placeholder="Label (e.g. Enemy 2x2 / Sheet Door)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="decay-input decay-grid" placeholder="Grid (e.g. D7)" value={grid} onChange={(e) => setGrid(e.target.value)} />
        </div>

        <div className="decay-mat-label">BUILDING BLOCK</div>
        <div className="decay-materials">{BLOCKS.map(renderMatBtn)}</div>

        <div className="decay-mat-label">DOOR</div>
        <div className="decay-materials">{DOORS.map(renderMatBtn)}</div>

        {/* Custom HP */}
        <div className="decay-hp-row">
          <label className="decay-hp-label">Current HP (optional)</label>
          <input
            className={`decay-hp-input ${hpValid ? '' : 'invalid'}`}
            type="number"
            min={1}
            max={maxHp}
            placeholder={`1 – ${maxHp}`}
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
          <span className="decay-hp-max">/ {maxHp} max</span>
        </div>
        {!hpValid && <div className="decay-hp-warn">Enter an HP between 1 and {maxHp} for {MATERIAL_LABEL[material]}.</div>}

        <textarea className="decay-note" placeholder="Notes (loot seen, TC location, etc.)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="decay-actions">
          <label className="decay-file">
            {screenshot ? 'Change Screenshot' : 'Attach Screenshot'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {screenshot && <img className="decay-thumb" src={screenshot} alt="preview" />}
          <button className="decay-add" onClick={submit} disabled={!label.trim() || !hpValid}>Add Marker</button>
        </div>
      </div>

      {/* Existing markers */}
      <div className="decay-section-head" style={{ marginTop: 16 }}><h3>TRACKED STRUCTURES ({markers.length})</h3></div>
      {placeMode && (
        <div className="decay-placebanner">Open the Map and click a spot to pin the latest marker. <button onClick={() => setPlaceMode(false)}>Cancel</button></div>
      )}
      {markers.length === 0 ? (
        <div className="decay-empty">No decay markers yet.</div>
      ) : (
        <div className="decay-list">
          {markers.map((m) => {
            const remaining = m.decaysAt - Date.now();
            const fullWindow = DECAY_HOURS[m.material] * 3600_000;
            const pct = Math.max(0, Math.min(1, remaining / fullWindow));
            const danger = remaining <= 0 ? 'dead' : pct < 0.25 ? 'soon' : 'ok';
            // Estimated current HP drains linearly with the decay window.
            const maxH = MAX_HP[m.material];
            const estHp = remaining <= 0 ? 0 : Math.round((remaining / fullWindow) * maxH);
            return (
              <div key={m.id} className={`decay-card decay-card--${danger}`}>
                {m.screenshot && <img className="decay-card-img" src={m.screenshot} alt={m.label} />}
                <div className="decay-card-body">
                  <div className="decay-card-head">
                    <span className="decay-card-label">{m.label}</span>
                    {m.grid && <span className="decay-card-grid">{m.grid}</span>}
                    {!isCurrentServer(m.serverId) && (
                      <span className="decay-card-foreign" title={m.serverName || 'Other server'}>
                        {m.serverName ? m.serverName.slice(0, 14) : 'OTHER SERVER'}
                      </span>
                    )}
                    {m.x !== undefined && <span className="decay-card-pinned" title="Pinned on map">📍</span>}
                    <button className="decay-card-pin" title="Pin to map" onClick={() => setPlaceMode(true, m.id)}>Pin</button>
                    <button className="decay-card-del" onClick={() => removeMarker(m.id)}>×</button>
                  </div>
                  <div className="decay-card-meta">
                    <span className="decay-card-mat">{MATERIAL_LABEL[m.material]}</span>
                    <span className="decay-card-hp">{estHp} / {maxH} HP</span>
                    <span className={`decay-card-time decay-card-time--${danger}`}>{formatRemaining(remaining)}</span>
                  </div>
                  <div className="decay-bar"><div className={`decay-bar-fill decay-bar-fill--${danger}`} style={{ width: `${pct * 100}%` }} /></div>
                  {m.note && <div className="decay-card-note">{m.note}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
