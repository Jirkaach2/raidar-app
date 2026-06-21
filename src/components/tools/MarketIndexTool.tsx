import { useMemo, useState } from 'react';
import { usePriceHistoryStore, ItemPrice } from '@/stores/price-history-store';
import { useShopSalesStore } from '@/stores/shop-sales-store';
import { useConnectionStore } from '@/stores/connection-store';
import { isCurrentServer, getCurrentServerId } from '@/utils/server';
import { getItemIconUrl, getItemName } from '@/utils/items';
import { TrendingUp, BarChart3, Search, Trash2, Flame, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import './MarketIndex.css';

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k`;
  return Math.round(n).toLocaleString('en-US');
}
function price(n: number): string { return n >= 100 ? Math.round(n).toString() : n.toFixed(n < 10 ? 1 : 0); }

/** Aggregate units sold per item across every tracked shop on this server. */
function useMostSold() {
  const shops = useShopSalesStore((s) => s.shops);
  return useMemo(() => {
    const tally: Record<number, { id: number; name: string; units: number }> = {};
    Object.values(shops).forEach((shop) => {
      if (!isCurrentServer(shop.serverId)) return;
      Object.entries(shop.soldUnits).forEach(([id, units]) => {
        const key = Number(id);
        if (!tally[key]) tally[key] = { id: key, name: shop.names[key] || getItemName(key), units: 0 };
        tally[key].units += units as number;
      });
    });
    return Object.values(tally).sort((a, b) => b.units - a.units);
  }, [shops]);
}

export function MarketIndexTool() {
  const byServer = usePriceHistoryStore((s) => s.byServer);
  const clear = usePriceHistoryStore((s) => s.clear);
  // Re-render when the connection changes so the right server's table shows.
  useConnectionStore((s) => s.serverInfo);
  const serverId = getCurrentServerId();
  const mostSold = useMostSold();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'listings' | 'avg' | 'recent'>('listings');

  const prices = useMemo(() => {
    const table = byServer[serverId || 'srv'] || {};
    let list = Object.values(table) as ItemPrice[];
    if (q.trim()) { const s = q.toLowerCase(); list = list.filter((p) => p.itemName.toLowerCase().includes(s)); }
    return list.sort((a, b) => {
      if (sort === 'avg') return b.sum / b.count - a.sum / a.count;
      if (sort === 'recent') return b.updatedAt - a.updatedAt;
      return b.listings - a.listings;
    });
  }, [byServer, serverId, q, sort]);

  const maxUnits = mostSold[0]?.units || 1;
  const hasData = prices.length > 0 || mostSold.length > 0;

  return (
    <div className="mkt">
      <div className="mkt-head">
        <h3><BarChart3 size={15} /> MARKET INDEX</h3>
        {hasData && <button className="mkt-clear" onClick={() => clear(serverId)} title="Reset tracked prices"><Trash2 size={11} /> Reset</button>}
      </div>
      <p className="mkt-sub">Live market intel — what's selling most and the lowest, average and highest prices recorded across every shop while you're connected.</p>

      {!hasData ? (
        <div className="mkt-empty"><TrendingUp size={20} /><p>No market data yet. Stay connected — as shops list and sell items, the index fills in automatically.</p></div>
      ) : (
        <>
          {/* MOST SOLD */}
          <div className="mkt-section-h"><Flame size={13} /> MOST SOLD ITEMS</div>
          <div className="mkt-sold">
            {mostSold.slice(0, 8).map((it, i) => (
              <div className="mkt-sold-row" key={it.id}>
                <span className={`mkt-rank ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
                {getItemIconUrl(it.id) && <img src={getItemIconUrl(it.id)!} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />}
                <span className="mkt-sold-name">{it.name}</span>
                <div className="mkt-sold-bar"><span style={{ width: `${(it.units / maxUnits) * 100}%` }} /></div>
                <b className="mkt-sold-units">{fmt(it.units)}</b>
              </div>
            ))}
            {mostSold.length === 0 && <div className="mkt-none">No sales observed yet.</div>}
          </div>

          {/* PRICE INDEX */}
          <div className="mkt-section-h" style={{ marginTop: 16 }}><BarChart3 size={13} /> PRICE INDEX</div>
          <div className="mkt-toolbar">
            <div className="mkt-search"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" /></div>
            <div className="mkt-sort">
              <button className={sort === 'listings' ? 'on' : ''} onClick={() => setSort('listings')}>Most listed</button>
              <button className={sort === 'avg' ? 'on' : ''} onClick={() => setSort('avg')}>Highest avg</button>
              <button className={sort === 'recent' ? 'on' : ''} onClick={() => setSort('recent')}>Recent</button>
            </div>
          </div>
          <div className="mkt-table">
            <div className="mkt-row mkt-row-h"><span>Item</span><span><ArrowDown size={11} /> Low</span><span><Minus size={11} /> Avg</span><span><ArrowUp size={11} /> High</span><span>Last</span></div>
            {prices.slice(0, 40).map((p) => {
              const avg = p.sum / p.count;
              return (
                <div className="mkt-row" key={`${p.itemId}:${p.currencyId}`}>
                  <span className="mkt-item">
                    {getItemIconUrl(p.itemId) && <img src={getItemIconUrl(p.itemId)!} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />}
                    <span className="mkt-item-name">{p.itemName}<small>{p.currencyName}</small></span>
                  </span>
                  <span className="mkt-low">{price(p.min)}</span>
                  <span className="mkt-avg">{price(avg)}</span>
                  <span className="mkt-high">{price(p.max)}</span>
                  <span className="mkt-last">{price(p.last)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
