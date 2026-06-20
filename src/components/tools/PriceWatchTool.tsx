import { useState, useMemo, useRef, useEffect } from 'react';
import { useMapStore } from '../../stores/map-store';
import { useSettingsStore } from '../../stores/settings-store';
import { getItemIconUrl, getItemName, ITEM_MAP } from '../../utils/items';
import Toggle from '../ui/Toggle';

// Common currencies vendors accept.
const ALL_CURRENCIES: { id: number; name: string; shortname?: string }[] = [
  { id: -932201673, name: 'Scrap', shortname: 'scrap' },
  { id: -1581843485, name: 'Sulfur', shortname: 'sulfur' },
  { id: 317398316, name: 'High Quality Metal', shortname: 'metal.refined' },
  { id: 69511070, name: 'Metal Fragments', shortname: 'metal.fragments' },
  { id: -151838493, name: 'Wood', shortname: 'wood' },
  { id: -2099697608, name: 'Stones', shortname: 'stones' },
  { id: -265876753, name: 'Gun Powder', shortname: 'gunpowder' },
];

export function PriceWatchTool() {
  const watches = useMapStore((s) => s.priceWatches);
  const addPriceWatch = useMapStore((s) => s.addPriceWatch);
  const updatePriceWatch = useMapStore((s) => s.updatePriceWatch);
  const removePriceWatch = useMapStore((s) => s.removePriceWatch);
  const broadcastPriceWatch = useSettingsStore((s) => s.broadcastPriceWatch);
  const setBroadcastPriceWatch = useSettingsStore((s) => s.setBroadcastPriceWatch);

  const [query, setQuery] = useState('');
  const [maxCost, setMaxCost] = useState(50);
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Currency search state
  const [currencyQuery, setCurrencyQuery] = useState('');
  const [currency, setCurrency] = useState<{ id: number; name: string }>(ALL_CURRENCIES[0]);
  const [currencySelected, setCurrencySelected] = useState(true);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);

  // Close currency dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setShowCurrencyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build a searchable item list from the item map (id → shortname).
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const out: { id: number; name: string }[] = [];
    const seen = new Set<string>();
    for (const idStr of Object.keys(ITEM_MAP)) {
      const id = Number(idStr);
      const name = getItemName(id);
      const lname = name.toLowerCase();
      if (lname.includes(q) && !seen.has(lname)) {
        seen.add(lname);
        out.push({ id, name });
        if (out.length >= 14) break;
      }
    }
    // Prefer exact / prefix matches first.
    out.sort((a, b) => {
      const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      const ap = an.startsWith(q) ? 0 : 1, bp = bn.startsWith(q) ? 0 : 1;
      return ap - bp || an.localeCompare(bn);
    });
    return out.slice(0, 12);
  }, [query]);

  // Filter currencies by searching ALL items
  const filteredCurrencies = useMemo(() => {
    const q = currencyQuery.toLowerCase().trim();
    const out: { id: number; name: string }[] = [];

    if (!q) {
      // Default common currencies if no query
      out.push({ id: -932201673, name: 'Scrap' });
      out.push({ id: -1581843485, name: 'Sulfur' });
      out.push({ id: -151838493, name: 'Wood' });
      return out;
    }

    const seen = new Set<string>();
    for (const idStr of Object.keys(ITEM_MAP)) {
      const id = Number(idStr);
      const name = getItemName(id);
      const lname = name.toLowerCase();
      if (lname.includes(q) && !seen.has(lname)) {
        seen.add(lname);
        out.push({ id, name });
        if (out.length >= 14) break;
      }
    }
    
    // Sort items
    out.sort((a, b) => {
      const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      const ap = an.startsWith(q) ? 0 : 1, bp = bn.startsWith(q) ? 0 : 1;
      return ap - bp || an.localeCompare(bn);
    });
    
    return out.slice(0, 12);
  }, [currencyQuery]);

  const submit = () => {
    if (editingId) {
      updatePriceWatch(editingId, maxCost, currency.id, currency.name);
      setEditingId(null); setPicked(null); setQuery('');
      return;
    }
    if (!picked) return;
    addPriceWatch(picked.id, picked.name, maxCost, currency.id, currency.name);
    setPicked(null); setQuery('');
  };

  const startEdit = (w: typeof watches[number]) => {
    setEditingId(w.id);
    setPicked({ id: w.itemId, name: w.itemName });
    setQuery(w.itemName);
    setMaxCost(w.maxCost);
    setCurrency({ id: w.currencyId, name: w.currencyName });
    setCurrencySelected(true);
  };

  const cancelEdit = () => {
    setEditingId(null); setPicked(null); setQuery('');
  };

  const getCurrencyIcon = (c: { id: number; shortname?: string }) => {
    return getItemIconUrl(c.id);
  };

  return (
    <div className="pricewatch">
      <div className="pw-section-head"><h3>{editingId ? 'EDIT PRICE WATCH' : 'ADD PRICE WATCH'}</h3></div>
      <p className="pw-intro">
        Get alerted when a watched item appears in a vending machine at or below your target price.
      </p>

      {/* ── Item search ── */}
      <div className="pw-form-stack">
        <label className="pw-label">Item</label>
        <div className="pw-search-wrap">
          <input
            className="pw-input"
            placeholder="Search item (e.g. Gunpowder)…"
            value={picked ? picked.name : query}
            onChange={(e) => { setPicked(null); setQuery(e.target.value); }}
          />
          {!picked && results.length > 0 && (
            <div className="pw-results">
              {results.map((r) => {
                const icon = getItemIconUrl(r.id);
                return (
                  <button key={r.id} className="pw-result" onClick={() => { setPicked(r); setQuery(r.name); }}>
                    {icon && <img src={icon} alt={r.name} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                    <span>{r.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Cost row ── */}
        <div className="pw-cost-field" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <label className="pw-label" style={{ width: 'auto', whiteSpace: 'nowrap', display: 'block' }}>Max Price <span style={{ opacity: 0.6, fontSize: '0.85em', fontWeight: 'normal', marginLeft: 4, textTransform: 'none' }}>(equals or lower than)</span></label>
          <div className="pw-number-wrap">
            <button className="pw-num-btn" onClick={() => setMaxCost(Math.max(1, maxCost - 1))}>−</button>
            <input
              type="number"
              className="pw-number"
              min={1}
              value={maxCost}
              onChange={(e) => setMaxCost(parseInt(e.target.value) || 1)}
            />
            <button className="pw-num-btn" onClick={() => setMaxCost(maxCost + 1)}>+</button>
          </div>
        </div>

        {/* ── Currency row ── */}
        <div className="pw-cost-field" style={{ width: '100%', flexDirection: 'column', alignItems: 'flex-start' }} ref={currencyRef}>
          <label className="pw-label">Currency</label>
          <div className="pw-search-wrap" style={{ width: '100%' }}>
            <input
              className="pw-input"
              placeholder="Search currency (e.g. Scrap)…"
              value={currencySelected ? currency.name : currencyQuery}
              onChange={(e) => {
                setCurrencySelected(false);
                setCurrencyQuery(e.target.value);
                setShowCurrencyDropdown(true);
              }}
              onFocus={() => {
                setShowCurrencyDropdown(true);
              }}
            />
            {showCurrencyDropdown && filteredCurrencies.length > 0 && (
              <div className="pw-results">
                {filteredCurrencies.map((c) => {
                  const icon = c.id != null ? getCurrencyIcon(c) : null;
                  return (
                    <button
                      key={c.name}
                      className={`pw-result ${currency.name === c.name ? 'is-active' : ''}`}
                      onClick={() => {
                        setCurrency(c);
                        setCurrencySelected(true);
                        setShowCurrencyDropdown(false);
                        setCurrencyQuery('');
                      }}
                    >
                      {icon && <img src={icon} alt={c.name} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                      <span>{c.name}</span>
                      {currency.name === c.name && <span style={{ marginLeft: 'auto', color: 'var(--color-accent)', fontSize: 10 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <button className="pw-add" onClick={submit} disabled={!picked && !editingId}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {editingId ? 'Save Changes' : 'Watch Item'}
        </button>
        {editingId && (
          <button className="pw-add" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-dim)' }} onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <Toggle
          checked={broadcastPriceWatch}
          onChange={setBroadcastPriceWatch}
          label="Announce hits in team chat"
          size="sm"
        />
      </div>

      <div className="pw-section-head" style={{ marginTop: 20 }}><h3>WATCHING ({watches.length})</h3></div>
      {watches.length === 0 ? (
        <div className="pw-empty">No price watches yet.</div>
      ) : (
        <div className="pw-list">
          {watches.map((w) => {
            const icon = getItemIconUrl(w.itemId);
            const currIcon = w.currencyId != null ? getItemIconUrl(w.currencyId) : null;
            return (
              <div key={w.id} className="pw-watch">
                {icon && <img src={icon} alt={w.itemName} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                <div className="pw-watch-info">
                  <span className="pw-watch-name">{w.itemName}</span>
                  <span className="pw-watch-cost">
                    ≤ {w.maxCost}
                    {currIcon && (
                      <img
                        src={currIcon}
                        alt=""
                        style={{ width: 14, height: 14, objectFit: 'contain', verticalAlign: 'middle', marginLeft: 4 }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <span style={{ marginLeft: 2 }}>{w.currencyName}</span>
                  </span>
                </div>
                <button className="pw-watch-edit" title="Edit" onClick={() => startEdit(w)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button className="pw-watch-del" onClick={() => removePriceWatch(w.id)}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
