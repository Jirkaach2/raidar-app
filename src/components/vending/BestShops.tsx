import { useMemo, useState } from 'react';
import { useShopSalesStore, ShopSales } from '@/stores/shop-sales-store';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { isCurrentServer } from '@/utils/server';
import { getItemShortname } from '@/utils/items';
import { isNpcShop, isDeepSeaShop, areShopTotalsRealistic } from '@/utils/shops';
import { Trophy, MapPin, Trash2, TrendingUp, X, Search, Anchor, Bot } from 'lucide-react';
import './BestShops.css';

function icon(itemId: number): string | null {
  const sn = getItemShortname(itemId);
  return sn ? `https://cdn.rusthelp.com/images/256/${sn.replace(/[._]/g, '-')}.webp` : null;
}
function exact(v: number): string { return Math.round(v).toLocaleString('en-US'); }
function ago(ts: number): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Sum every currency a shop earned into one comparable revenue number. */
function totalRevenue(s: ShopSales): number {
  return Object.values(s.earned).reduce((a, b) => a + b, 0);
}

export function BestShops() {
  const shops = useShopSalesStore((s) => s.shops);
  const clear = useShopSalesStore((s) => s.clear);
  const removeShop = useShopSalesStore((s) => s.removeShop);
  const [sortBy, setSortBy] = useState<'revenue' | 'sales' | 'recent'>('revenue');
  const [sliderVal, setSliderVal] = useState<number>(8); // Default to 8 (All Time)
  // Shop-type filter. 'player' is the default so the leaderboard focuses on
  // real player stores; NPC/deep-sea can be inspected explicitly.
  const [shopType, setShopType] = useState<'all' | 'player' | 'npc' | 'deep'>('player');
  // Hide shops with fewer than this many observed sale events. 0 = no minimum.
  const [minSales, setMinSales] = useState<number>(0);
  const [query, setQuery] = useState<string>(''); // search by shop name OR grid (e.g. "K18")

  const FILTER_OPTIONS = useMemo(() => [
    { label: 'Last 15m', dur: 15 * 60 * 1000 },
    { label: 'Last 30m', dur: 30 * 60 * 1000 },
    { label: 'Last 1h', dur: 60 * 60 * 1000 },
    { label: 'Last 3h', dur: 3 * 3600 * 1000 },
    { label: 'Last 6h', dur: 6 * 3600 * 1000 },
    { label: 'Last 12h', dur: 12 * 3600 * 1000 },
    { label: 'Last 24h', dur: 24 * 3600 * 1000 },
    { label: 'Last 3d', dur: 3 * 24 * 3600 * 1000 },
    { label: 'All Time', dur: 0 },
  ], []);

  /** Live NPC/deep-sea classification via the canonical detectors in shops.ts. */
  const classify = (s: ShopSales) => ({
    npc: isNpcShop(s.shopName, s.x, s.y),
    deep: isDeepSeaShop(s.shopName, s.x, s.y),
  });

  /** Shop-type filter match (All / Player / NPC / Deep Sea). */
  const matchesType = (s: ShopSales): boolean => {
    if (shopType === 'all') return true;
    const { npc, deep } = classify(s);
    if (shopType === 'deep') return deep;
    if (shopType === 'npc') return npc;
    // 'player' — anything that isn't an NPC or deep-sea vendor.
    return !npc && !deep;
  };

  /** Search match against shop name AND grid location (e.g. "K18"). */
  const matchesQuery = (s: ShopSales): boolean => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (s.shopName || '').toLowerCase().includes(q) || (s.grid || '').toLowerCase().includes(q);
  };

  const ranked = useMemo(() => {
    const activeOption = FILTER_OPTIONS[sliderVal] || FILTER_OPTIONS[8];
    const cutoff = activeOption.dur > 0 ? Date.now() - activeOption.dur : 0;

    const list = Object.values(shops)
      .filter((s) => isCurrentServer(s.serverId))
      .filter((s) => matchesType(s))
      .filter((s) => matchesQuery(s))
      .map((s) => {
        // If "All Time", or no transactions array is present, return as-is.
        // Also if transactions is empty but pre-aggregated sales exist, fall back to as-is for compatibility.
        if (cutoff === 0 || !s.transactions || s.transactions.length === 0) {
          if (cutoff > 0) {
            // Filter is active but there are no logged transaction records; return empty stats
            return { ...s, soldUnits: {}, earned: {}, saleEvents: 0, lastSale: 0 };
          }
          return s;
        }

        const activeTxs = s.transactions.filter((t) => t.timestamp >= cutoff);
        if (activeTxs.length === 0) {
          return { ...s, soldUnits: {}, earned: {}, saleEvents: 0, lastSale: 0 };
        }

        const soldUnits: Record<number, number> = {};
        const earned: Record<number, number> = {};
        let saleEvents = 0;
        let lastSale = 0;

        for (const t of activeTxs) {
          soldUnits[t.item_id] = (soldUnits[t.item_id] || 0) + t.quantity;
          earned[t.currency_id] = (earned[t.currency_id] || 0) + t.earned;
          saleEvents += t.purchases;
          if (t.timestamp > lastSale) lastSale = t.timestamp;
        }

        return {
          ...s,
          soldUnits,
          earned,
          saleEvents,
          lastSale
        };
      })
      .filter((s) => s.saleEvents > 0 && s.saleEvents >= minSales)
      // Realism filter: drop shops reporting fake/bulk data (absurd earned
      // totals, implausible revenue-per-sale, or money across too many
      // currencies) so they can't pollute the leaderboard. Thresholds live in
      // utils/shops.ts.
      .filter((s) => areShopTotalsRealistic(s.earned, s.soldUnits, s.saleEvents));

    return list.sort((a, b) => {
      if (sortBy === 'sales') return b.saleEvents - a.saleEvents;
      if (sortBy === 'recent') return b.lastSale - a.lastSale;
      return totalRevenue(b) - totalRevenue(a);
    });
  }, [shops, sortBy, sliderVal, shopType, minSales, query, FILTER_OPTIONS]);

  const locate = (s: ShopSales) => {
    // Switch to the Map page first so the user actually sees the shop — setting
    // the viewport alone does nothing while they're still on the vending panel.
    useUiStore.getState().setActivePage('map');
    useMapStore.getState().setViewport({ x: -(s.x - 0.5) * 800 * 2, y: -(s.y - 0.5) * 800 * 2, zoom: 2.0 });
    // Highlight the matching vending-machine marker if it's currently on the
    // map. Shops are keyed by quantized position, so match the same way.
    const qx = Math.round(s.x * 1000);
    const qy = Math.round(s.y * 1000);
    const marker = useMapStore.getState().markers.find(
      (m) => m.type === 'vending_machine' && Math.round(m.x * 1000) === qx && Math.round(m.y * 1000) === qy,
    );
    useMapStore.getState().selectMarker(marker ? marker.id : null);
  };

  // Anything tracked at all on this server (respecting the active type filter)?
  // Drives the "no data yet" empty-state independently of the search/window.
  const hasTrackedShops = Object.values(shops).some(
    (s) => isCurrentServer(s.serverId) && s.saleEvents > 0 && matchesType(s),
  );

  return (
    <div className="bs">
      <div className="bs-head">
        <h3><Trophy size={14} /> BEST SELLING SHOPS</h3>
        <div className="bs-head-actions">
          {ranked.length > 0 && (
            <button className="bs-clear" onClick={clear} title="Reset all tracked sales"><Trash2 size={11} /> Reset</button>
          )}
        </div>
      </div>
      <p className="bs-sub">
        Live-tracked while you're connected. Each shop's stock drop = a sale; we tally what every store has sold and earned.
      </p>

      {!hasTrackedShops ? (
        <div className="bs-empty">
          <TrendingUp size={20} />
          <p>No sales tracked yet. Keep the app connected — when a shop's stock drops, its sales show up here ranked by revenue.</p>
        </div>
      ) : (
        <>
          <div className="bs-search">
            <Search size={13} />
            <input
              type="text"
              placeholder="Search by shop name or grid (e.g. K18)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="bs-search-clear" onClick={() => setQuery('')} title="Clear search"><X size={12} /></button>
            )}
          </div>

          <div className="bs-sort">
            <button className={sortBy === 'revenue' ? 'active' : ''} onClick={() => setSortBy('revenue')}>Top earners</button>
            <button className={sortBy === 'sales' ? 'active' : ''} onClick={() => setSortBy('sales')}>Most sales</button>
            <button className={sortBy === 'recent' ? 'active' : ''} onClick={() => setSortBy('recent')}>Most recent</button>
          </div>

          <div className="bs-filters">
            <div className="bs-type" role="group" aria-label="Shop type filter">
              <button className={shopType === 'all' ? 'active' : ''} onClick={() => setShopType('all')}>All</button>
              <button className={shopType === 'player' ? 'active' : ''} onClick={() => setShopType('player')}>Player</button>
              <button className={shopType === 'npc' ? 'active' : ''} onClick={() => setShopType('npc')}>NPC</button>
              <button className={shopType === 'deep' ? 'active' : ''} onClick={() => setShopType('deep')}>Deep Sea</button>
            </div>
            <label className="bs-minsales" title="Hide shops with fewer than this many observed sales">
              <span>Min sales</span>
              <select value={minSales} onChange={(e) => setMinSales(parseInt(e.target.value, 10))}>
                <option value={0}>Any</option>
                <option value={5}>5+</option>
                <option value={10}>10+</option>
                <option value={25}>25+</option>
                <option value={50}>50+</option>
              </select>
            </label>
          </div>

          <div className="bs-time-slider">
            <div className="bs-slider-header">
              <span>TIME WINDOW</span>
              <span className="bs-slider-label">{FILTER_OPTIONS[sliderVal]?.label}</span>
            </div>
            <input
              type="range"
              min="0"
              max="8"
              value={sliderVal}
              onChange={(e) => setSliderVal(parseInt(e.target.value))}
              className="bs-range-input"
            />
            <div className="bs-slider-ticks">
              <span>15m</span>
              <span>1h</span>
              <span>6h</span>
              <span>12h</span>
              <span>24h</span>
              <span>All</span>
            </div>
          </div>

          {ranked.length === 0 ? (
            <div className="bs-empty" style={{ borderStyle: 'solid', background: 'transparent', padding: '16px' }}>
              <TrendingUp size={16} />
              <p>
                {query.trim()
                  ? `No shops match "${query.trim()}" in the selected window.`
                  : `No sales recorded in the selected time window (${FILTER_OPTIONS[sliderVal]?.label}). Slide to view a wider window.`}
              </p>
            </div>
          ) : (
            <div className="bs-list">
            {ranked.map((s, i) => {
              const { npc, deep } = classify(s);
              const soldItems = Object.entries(s.soldUnits)
                .map(([id, qty]) => ({ id: Number(id), qty, name: s.names[Number(id)] || `Item ${id}` }))
                .sort((a, b) => b.qty - a.qty);
              const earned = Object.entries(s.earned)
                .map(([id, amt]) => ({ id: Number(id), amt, name: s.names[Number(id)] || `Item ${id}` }))
                .sort((a, b) => b.amt - a.amt);
              return (
                <div key={s.key} className="bs-card">
                  <div className="bs-card-head">
                    <span className={`bs-rank ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
                    <div className="bs-card-id">
                      <span className="bs-name">
                        {s.shopName}
                        {deep && <span className="bs-badge bs-badge-deep" title="Deep-sea vendor shop"><Anchor size={9} /> DEEP SEA</span>}
                        {npc && !deep && <span className="bs-badge bs-badge-npc" title="NPC / safe-zone vendor shop"><Bot size={9} /> NPC</span>}
                      </span>
                      <span className="bs-meta">
                        <span className="bs-grid">{s.grid}</span>
                        <span className="bs-dot">·</span>
                        {s.saleEvents} sale{s.saleEvents === 1 ? '' : 's'}
                        <span className="bs-dot">·</span>
                        {ago(s.lastSale)}
                      </span>
                    </div>
                    <button className="bs-locate" onClick={() => locate(s)} title="Show on map"><MapPin size={13} /></button>
                    <button className="bs-del" onClick={() => removeShop(s.key)} title="Remove"><X size={13} /></button>
                  </div>

                  <div className="bs-earned">
                    <span className="bs-earned-label">EARNED</span>
                    {earned.map((e) => (
                      <span key={e.id} className="bs-earned-cell" title={e.name}>
                        {icon(e.id) && <img src={icon(e.id)!} alt="" onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }} />}
                        {exact(e.amt)}
                      </span>
                    ))}
                  </div>

                  <div className="bs-sold">
                    {soldItems.slice(0, 8).map((it) => (
                      <span key={it.id} className="bs-sold-cell" title={`${it.name}: ${exact(it.qty)} sold`}>
                        {icon(it.id) && <img src={icon(it.id)!} alt="" onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }} />}
                        <b>{exact(it.qty)}</b>
                      </span>
                    ))}
                    {soldItems.length > 8 && <span className="bs-sold-more">+{soldItems.length - 8}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </>
      )}
    </div>
  );
}
