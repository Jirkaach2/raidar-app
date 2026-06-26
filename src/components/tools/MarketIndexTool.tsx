import { useMemo, useState } from 'react';
import { usePriceHistoryStore, ItemPrice } from '@/stores/price-history-store';
import { useShopSalesStore } from '@/stores/shop-sales-store';
import { useConnectionStore } from '@/stores/connection-store';
import { isCurrentServer, getCurrentServerId } from '@/utils/server';
import { getItemIconUrl, getItemName } from '@/utils/items';
import { isNpcShop } from '@/utils/shops';
import { TrendingUp, BarChart3, Search, Trash2, Flame, ArrowDown, ArrowUp, Minus, Bot, Check, Copy } from 'lucide-react';
import './MarketIndex.css';

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k`;
  return Math.round(n).toLocaleString('en-US');
}
function price(n: number): string { return n >= 100 ? Math.round(n).toString() : n.toFixed(n < 10 ? 1 : 0); }

/**
 * Aggregate units sold per item across every tracked shop on this server.
 * When `excludeNpc` is set, NPC / safe-zone vendor shops are left out so the
 * ranking reflects genuine player-market demand only.
 */
function useMostSold(excludeNpc: boolean) {
  const shops = useShopSalesStore((s) => s.shops);
  return useMemo(() => {
    const tally: Record<number, { id: number; name: string; units: number }> = {};
    Object.values(shops).forEach((shop) => {
      if (!isCurrentServer(shop.serverId)) return;
      if (excludeNpc && isNpcShop(shop.shopName, shop.x, shop.y)) return;
      Object.entries(shop.soldUnits).forEach(([id, units]) => {
        const key = Number(id);
        if (!tally[key]) tally[key] = { id: key, name: shop.names[key] || getItemName(key), units: 0 };
        tally[key].units += units as number;
      });
    });
    return Object.values(tally).sort((a, b) => b.units - a.units);
  }, [shops, excludeNpc]);
}

/** Columns the price table can be sorted by. */
type SortKey = 'listings' | 'avg' | 'recent' | 'low' | 'high' | 'last';

export function MarketIndexTool() {
  const byServer = usePriceHistoryStore((s) => s.byServer);
  const clear = usePriceHistoryStore((s) => s.clear);
  // Re-render when the connection changes so the right server's table shows.
  useConnectionStore((s) => s.serverInfo);
  const serverId = getCurrentServerId();
  const [excludeNpc, setExcludeNpc] = useState(true); // hide NPC shops by default
  const mostSold = useMostSold(excludeNpc);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('listings');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Click a column header to sort by it; clicking the active column flips the
  // direction. Price columns default to ascending (cheapest first) since that's
  // the most useful first glance; everything else defaults to descending.
  const sortByColumn = (key: SortKey) => {
    if (key === sort) { setDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSort(key);
    setDir(key === 'low' ? 'asc' : 'desc');
  };

  const prices = useMemo(() => {
    const table = byServer[serverId || 'srv'] || {};
    let list = Object.values(table) as ItemPrice[];
    if (q.trim()) { const s = q.toLowerCase(); list = list.filter((p) => p.itemName.toLowerCase().includes(s)); }
    const metric = (p: ItemPrice): number => {
      switch (sort) {
        case 'avg': return p.sum / p.count;
        case 'recent': return p.updatedAt;
        case 'low': return p.min;
        case 'high': return p.max;
        case 'last': return p.last;
        default: return p.listings;
      }
    };
    return [...list].sort((a, b) => (dir === 'asc' ? metric(a) - metric(b) : metric(b) - metric(a)));
  }, [byServer, serverId, q, sort, dir]);

  const maxUnits = mostSold[0]?.units || 1;
  const hasData = prices.length > 0 || mostSold.length > 0;

  // Quick-share: copy a one-line price summary so users can paste it into chat.
  const copyRow = (p: ItemPrice) => {
    const key = `${p.itemId}:${p.currencyId}`;
    const avg = p.sum / p.count;
    const text = `${p.itemName} — low ${price(p.min)} / avg ${price(avg)} / high ${price(p.max)} ${p.currencyName}`;
    navigator.clipboard?.writeText(text).then(
      () => { setCopiedKey(key); setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200); },
      () => { /* clipboard unavailable — non-fatal */ },
    );
  };

  // Header cell with a sort affordance + active-direction arrow.
  const sortArrow = (key: SortKey) => (sort === key ? (dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : null);

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
          <div className="mkt-section-h" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flame size={13} /> MOST SOLD ITEMS</span>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: excludeNpc ? 'var(--color-accent)' : 'var(--color-text-dim)' }}
              title="Exclude NPC / safe-zone vendor shops from the index"
            >
              <input type="checkbox" checked={excludeNpc} onChange={(e) => setExcludeNpc(e.target.checked)} style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }} />
              <Bot size={11} /> Hide NPC shops
            </label>
          </div>
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
            {mostSold.length === 0 && <div className="mkt-none">No sales observed yet{excludeNpc ? ' (NPC shops hidden)' : ''}.</div>}
          </div>

          {/* PRICE INDEX */}
          <div className="mkt-section-h" style={{ marginTop: 16 }}><BarChart3 size={13} /> PRICE INDEX</div>
          <div className="mkt-toolbar">
            <div className="mkt-search"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" /></div>
            <div className="mkt-sort">
              <button className={sort === 'listings' ? 'on' : ''} onClick={() => sortByColumn('listings')}>Most listed</button>
              <button className={sort === 'avg' ? 'on' : ''} onClick={() => sortByColumn('avg')}>Highest avg</button>
              <button className={sort === 'recent' ? 'on' : ''} onClick={() => sortByColumn('recent')}>Recent</button>
            </div>
          </div>
          <div className="mkt-table">
            <div className="mkt-row mkt-row-h">
              <span style={{ cursor: 'pointer' }} onClick={() => sortByColumn('listings')} title="Sort by item / listings">Item {sortArrow('listings')}</span>
              <span style={{ cursor: 'pointer' }} onClick={() => sortByColumn('low')} title="Sort by lowest price"><ArrowDown size={11} /> Low {sortArrow('low')}</span>
              <span style={{ cursor: 'pointer' }} onClick={() => sortByColumn('avg')} title="Sort by average price"><Minus size={11} /> Avg {sortArrow('avg')}</span>
              <span style={{ cursor: 'pointer' }} onClick={() => sortByColumn('high')} title="Sort by highest price"><ArrowUp size={11} /> High {sortArrow('high')}</span>
              <span style={{ cursor: 'pointer' }} onClick={() => sortByColumn('last')} title="Sort by last price">Last {sortArrow('last')}</span>
            </div>
            {prices.slice(0, 40).map((p) => {
              const avg = p.sum / p.count;
              const rowKey = `${p.itemId}:${p.currencyId}`;
              const copied = copiedKey === rowKey;
              return (
                <div className="mkt-row" key={rowKey} onClick={() => copyRow(p)} style={{ cursor: 'pointer' }} title="Click to copy price summary">
                  <span className="mkt-item">
                    {getItemIconUrl(p.itemId) && <img src={getItemIconUrl(p.itemId)!} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />}
                    <span className="mkt-item-name">{p.itemName}<small>{p.currencyName}</small></span>
                    {copied ? <Check size={11} style={{ color: 'var(--color-success, #6fcf73)', flexShrink: 0 }} /> : <Copy size={10} style={{ color: 'var(--color-text-dim)', opacity: 0.5, flexShrink: 0 }} />}
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
