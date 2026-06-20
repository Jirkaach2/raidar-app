import { useState, useMemo, useEffect } from 'react';
import { RECYCLABLES, computeRecycle, RecyclerType } from '../../utils/recycler';
import { getItemIcon } from '../../utils/monuments';
import { useSettingsStore, detectMultiplierFromName } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';
import Toggle from '../ui/Toggle';

export function RecyclerTool() {
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [type, setType] = useState<RecyclerType>('monument');
  const [search, setSearch] = useState('');

  const multiplier = useSettingsStore((s) => s.recyclerMultiplier);
  const autoDetect = useSettingsStore((s) => s.recyclerAutoDetect);
  const setMultiplier = useSettingsStore((s) => s.setRecyclerMultiplier);
  const setAutoDetect = useSettingsStore((s) => s.setRecyclerAutoDetect);
  const serverInfo = useConnectionStore((s) => s.serverInfo);

  // Auto-detect server gather multiplier from the server name when enabled.
  useEffect(() => {
    if (autoDetect && serverInfo?.name) {
      const detected = detectMultiplierFromName(serverInfo.name);
      if (detected !== multiplier) setMultiplier(detected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect, serverInfo?.name]);

  const filtered = useMemo(
    () => RECYCLABLES.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  );
  const outputs = useMemo(() => computeRecycle(basket, type, multiplier), [basket, type, multiplier]);
  const totalItems = Object.values(basket).reduce((a, b) => a + b, 0);

  const setCount = (id: string, n: number) =>
    setBasket((b) => ({ ...b, [id]: Math.max(0, n) }));

  return (
    <div className="recycler">
      <div className="recycler-grid">
        {/* Input */}
        <div className="recycler-input">
          <div className="recycler-section-head">
            <h3>INPUT</h3>
            <button className="recycler-clear" onClick={() => setBasket({})}>Remove All</button>
          </div>
          <input
            className="recycler-search"
            placeholder="Search components…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="recycler-items">
            {filtered.map((c) => {
              const count = basket[c.id] || 0;
              return (
                <div key={c.id} className={`recycler-item ${count > 0 ? 'has-count' : ''}`}>
                  <img src={getItemIcon(c.icon)} alt={c.name} title={c.name}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                  <div className="recycler-item-name">{c.name}</div>
                  <div className="recycler-stepper">
                    <button onClick={() => setCount(c.id, count - 1)}>−</button>
                    <input value={count} onChange={(e) => setCount(c.id, parseInt(e.target.value) || 0)} />
                    <button onClick={() => setCount(c.id, count + 1)}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recycler type + output */}
        <div className="recycler-output-col">
          <div className="recycler-section-head"><h3>SERVER MULTIPLIER</h3></div>
          <div className="recycler-mult">
            <div style={{ marginBottom: 8 }}>
              <Toggle 
                checked={autoDetect} 
                onChange={setAutoDetect} 
                label="Auto-detect from server name" 
                size="sm" 
              />
            </div>
            <div className="recycler-mult-row">
              {[1, 2, 3, 5, 10].map((m) => (
                <button key={m} className={`recycler-mult-btn ${multiplier === m ? 'active' : ''}`}
                  onClick={() => { setAutoDetect(false); setMultiplier(m); }}>{m}x</button>
              ))}
              <input className="recycler-mult-input" type="number" min={1} value={multiplier}
                onChange={(e) => { setAutoDetect(false); setMultiplier(parseInt(e.target.value) || 1); }} />
            </div>
            {autoDetect && serverInfo?.name && (
              <div className="recycler-mult-note">Detected {multiplier}x from “{serverInfo.name}”</div>
            )}
          </div>

          <div className="recycler-section-head" style={{ marginTop: 16 }}><h3>RECYCLER TYPE</h3></div>
          <div className="recycler-types">
            <button className={`recycler-type ${type === 'monument' ? 'active' : ''}`} onClick={() => setType('monument')}>
              <span className="recycler-type-title">Monument Recycler</span>
              <span className="recycler-type-sub">~60% yield · faster · exposed</span>
            </button>
            <button className={`recycler-type ${type === 'safezone' ? 'active' : ''}`} onClick={() => setType('safezone')}>
              <span className="recycler-type-title">Safe-Zone Recycler</span>
              <span className="recycler-type-sub">~40% yield · slower · protected</span>
            </button>
          </div>

          <div className="recycler-section-head" style={{ marginTop: 16 }}><h3>OUTPUT</h3></div>
          <div className="recycler-output">
            {totalItems === 0 ? (
              <div className="recycler-empty">Add components to see the yield.</div>
            ) : outputs.length === 0 ? (
              <div className="recycler-empty">No yield.</div>
            ) : (
              <div className="recycler-output-list">
                {outputs.map((o) => (
                  <div key={o.item} className="recycler-output-item">
                    {o.icon && <img src={getItemIcon(o.icon)} alt={o.item}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                    <span className="recycler-output-amt">×{o.amount}</span>
                    <span className="recycler-output-name">{o.item}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="recycler-note">Yields are averages; single-unit components have a chance-based return.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
