import { useMemo, useState } from 'react';
import { useShopSalesStore, ShopSales } from '@/stores/shop-sales-store';
import { useMapStore } from '@/stores/map-store';
import { isCurrentServer } from '@/utils/server';
import { getItemShortname } from '@/utils/items';
import { Trophy, MapPin, Trash2, TrendingUp, X } from 'lucide-react';
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

  const ranked = useMemo(() => {
    const list = Object.values(shops).filter((s) => isCurrentServer(s.serverId) && s.saleEvents > 0);
    return list.sort((a, b) => {
      if (sortBy === 'sales') return b.saleEvents - a.saleEvents;
      if (sortBy === 'recent') return b.lastSale - a.lastSale;
      return totalRevenue(b) - totalRevenue(a);
    });
  }, [shops, sortBy]);

  const locate = (s: ShopSales) => {
    useMapStore.getState().setViewport({ x: -(s.x - 0.5) * 800 * 2, y: -(s.y - 0.5) * 800 * 2, zoom: 2.0 });
    useMapStore.getState().selectMarker(null);
  };

  return (
    <div className="bs">
      <div className="bs-head">
        <h3><Trophy size={14} /> BEST SELLING SHOPS</h3>
        {ranked.length > 0 && (
          <button className="bs-clear" onClick={clear} title="Reset all tracked sales"><Trash2 size={11} /> Reset</button>
        )}
      </div>
      <p className="bs-sub">
        Live-tracked while you're connected. Each shop's stock drop = a sale; we tally what every store has sold and earned.
      </p>

      {ranked.length === 0 ? (
        <div className="bs-empty">
          <TrendingUp size={20} />
          <p>No sales tracked yet. Keep the app connected — when a shop's stock drops, its sales show up here ranked by revenue.</p>
        </div>
      ) : (
        <>
          <div className="bs-sort">
            <button className={sortBy === 'revenue' ? 'active' : ''} onClick={() => setSortBy('revenue')}>Top earners</button>
            <button className={sortBy === 'sales' ? 'active' : ''} onClick={() => setSortBy('sales')}>Most sales</button>
            <button className={sortBy === 'recent' ? 'active' : ''} onClick={() => setSortBy('recent')}>Most recent</button>
          </div>

          <div className="bs-list">
            {ranked.map((s, i) => {
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
                      <span className="bs-name">{s.shopName}</span>
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
        </>
      )}
    </div>
  );
}
