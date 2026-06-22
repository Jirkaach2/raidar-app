import { useState, useMemo, useEffect } from 'react';
import { Hammer, Search, Layers, Package, FlaskConical, Wrench } from 'lucide-react';
import { craftableList, rollup, craftIcon, craftName, workbenchLabel } from '../../utils/crafting';
import { useUiStore } from '../../stores/ui-store';
import './CraftCalcTool.css';

const WB_TONE = ['wb0', 'wb1', 'wb2', 'wb3'];

function ItemIcon({ short, size = 26 }: { short: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) return <span className="cc-ico cc-ico--fallback" style={{ width: size, height: size }}>{craftName(short).charAt(0)}</span>;
  return <img className="cc-ico" src={craftIcon(short)} width={size} height={size} alt="" loading="lazy" onError={() => setErr(true)} />;
}

export function CraftCalcTool() {
  const craftItem = useUiStore((s) => s.craftItem);
  const setCraftItem = useUiStore((s) => s.setCraftItem);

  const items = useMemo(() => craftableList(), []);
  const [selected, setSelected] = useState<string>(craftItem || 'explosive.timed');
  const [qty, setQty] = useState(1);
  const [search, setSearch] = useState('');

  // React to a palette preselection.
  useEffect(() => {
    if (craftItem) {
      setSelected(craftItem);
      setQty(1);
      setCraftItem(null);
    }
  }, [craftItem, setCraftItem]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.short.includes(q)) : items;
  }, [items, search]);

  const result = useMemo(() => rollup(selected, Math.max(1, qty)), [selected, qty]);

  const grouped = useMemo(() => {
    const m: Record<string, typeof items> = {};
    for (const it of filtered) (m[it.category] ||= []).push(it);
    return Object.entries(m);
  }, [filtered]);

  return (
    <div className="cc">
      <header className="cc-header">
        <div className="cc-header-title">
          <span className="cc-header-icon"><Hammer size={20} /></span>
          <div>
            <h2>Crafting Cost Calculator</h2>
            <p>Full material rollup, workbench tier and research scrap for any recipe.</p>
          </div>
        </div>
      </header>

      <div className="cc-body">
        {/* Picker */}
        <aside className="cc-picker">
          <div className="cc-search"><Search size={13} /><input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="cc-list">
            {grouped.map(([cat, list]) => (
              <div key={cat} className="cc-group">
                <div className="cc-group-label">{cat}</div>
                {list.map((it) => (
                  <button key={it.short} className={`cc-item ${it.short === selected ? 'active' : ''}`} onClick={() => setSelected(it.short)}>
                    <ItemIcon short={it.short} size={22} />
                    <span>{it.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <div className="cc-none">No recipes match.</div>}
          </div>
        </aside>

        {/* Result */}
        <section className="cc-result">
          {!result ? (
            <div className="cc-empty">Select an item to see its crafting breakdown.</div>
          ) : (
            <>
              <div className="cc-target">
                <ItemIcon short={result.short} size={48} />
                <div className="cc-target-info">
                  <h3>{craftName(result.short)}</h3>
                  <div className="cc-target-meta">
                    <span className={`cc-wb cc-wb--${WB_TONE[result.workbench]}`}><Wrench size={11} /> {workbenchLabel(result.workbench)}</span>
                    {result.researchScrap !== undefined && (
                      <span className="cc-scrap"><FlaskConical size={11} /> {result.researchScrap} scrap to research</span>
                    )}
                  </div>
                </div>
                <div className="cc-qty">
                  <label>Qty</label>
                  <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
                </div>
              </div>

              <div className="cc-cols">
                <div className="cc-card">
                  <h4 className="cc-card-h"><Package size={13} /> Raw materials</h4>
                  <div className="cc-mats">
                    {result.raw.map((m) => (
                      <div key={m.short} className="cc-mat">
                        <ItemIcon short={m.short} />
                        <span className="cc-mat-name">{craftName(m.short)}</span>
                        <span className="cc-mat-qty">×{m.qty.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cc-card">
                  <h4 className="cc-card-h"><Layers size={13} /> Direct ingredients</h4>
                  <div className="cc-mats">
                    {result.direct.map((m) => (
                      <div key={m.short} className="cc-mat">
                        <ItemIcon short={m.short} />
                        <span className="cc-mat-name">{craftName(m.short)}</span>
                        <span className="cc-mat-qty">×{m.qty.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {result.subCrafts.length > 0 && (
                    <>
                      <h4 className="cc-card-h cc-card-h--sub"><Hammer size={13} /> Craft these first</h4>
                      <div className="cc-mats">
                        {result.subCrafts.map((m) => (
                          <div key={m.short} className="cc-mat cc-mat--sub" onClick={() => setSelected(m.short)} title="Open this sub-recipe">
                            <ItemIcon short={m.short} />
                            <span className="cc-mat-name">{craftName(m.short)}</span>
                            <span className="cc-mat-qty">×{m.qty.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <p className="cc-note">Recipe snapshot — Facepunch may adjust amounts between updates. Furnace wood for smelting ore is not included.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
