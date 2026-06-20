import { useMemo } from 'react';
import { useMapStore } from '@/stores/map-store';
import { getGridCoordinate, getNormalizedCoordinates } from '@/utils/grid';
import { isWaterWellMonument } from '@/utils/monuments';
import { getItemShortname } from '@/utils/items';
import { Droplet, MapPin, ArrowRight } from 'lucide-react';
import './WaterWellVendor.css';

function icon(itemId: number): string | null {
  const sn = getItemShortname(itemId);
  return sn ? `https://cdn.rusthelp.com/images/256/${sn.replace(/[._]/g, '-')}.webp` : null;
}

/**
 * Water Well Shopkeeper detector.
 *
 * The Water Well NPC is a live vending machine (marker type 3) that sits on a
 * Water Well monument. Rather than hardcode a rotating offer table, we find the
 * vending machine(s) nearest a Water Well and surface their REAL live stock and
 * prices straight from the server's sell_orders.
 */
export function WaterWellVendor() {
  const markers = useMapStore((s) => s.markers);
  const monuments = useMapStore((s) => s.monuments);
  const mapSize = useMapStore((s) => s.mapSize);
  const oceanMargin = useMapStore((s) => s.oceanMargin || 0);
  const mapImageWidth = useMapStore((s) => s.mapImageWidth || 0);
  const mapImageHeight = useMapStore((s) => s.mapImageHeight || 0);

  const wells = useMemo(() => {
    const shops = markers.filter((m) => m.type === 'vending_machine' && m.raw?.sell_orders?.length);

    // 1) Primary: match the shopkeeper by its marker NAME. The Water Well NPC
    //    vending machine is broadcast as a normal type-3 marker with a name.
    const byName = (label: string) => {
      const l = (label || '').toLowerCase();
      return l.includes('water well') || l.includes('waterwell') || l.includes('well shopkeeper');
    };

    // 2) Fallback: proximity to a Water Well monument IF the server reports one.
    const wellPos = monuments
      .filter((m) => isWaterWellMonument(m.token))
      .map((m) => getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin));

    const seen = new Set<string>();
    const out: { id: string; x: number; y: number; grid: string; orders: any[] }[] = [];
    for (const vm of shops) {
      const nearWell = wellPos.some((p) => Math.hypot(vm.x - p.x, vm.y - p.y) < 0.04);
      if (!byName(vm.label || '') && !nearWell) continue;
      if (seen.has(vm.id)) continue;
      seen.add(vm.id);
      const grid = vm.raw ? getGridCoordinate(vm.raw.x, vm.raw.y, mapSize) : '?';
      out.push({ id: vm.id, x: vm.x, y: vm.y, grid, orders: vm.raw.sell_orders as any[] });
    }
    return out;
  }, [markers, monuments, mapSize, oceanMargin, mapImageWidth, mapImageHeight]);

  if (wells.length === 0) return null;

  const locate = (x: number, y: number, id: string) => {
    useMapStore.getState().setViewport({ x: -(x - 0.5) * 800 * 2, y: -(y - 0.5) * 800 * 2, zoom: 2.0 });
    useMapStore.getState().selectMarker(id);
  };

  return (
    <div className="wwv">
      <div className="wwv-head">
        <span className="wwv-title"><Droplet size={14} /> WATER WELL SHOPKEEPER</span>
        <span className="wwv-sub">live stock · {wells.length} detected</span>
      </div>

      {wells.map((w) => (
        <div key={w.id} className="wwv-card">
          <div className="wwv-card-head">
            <span className="wwv-grid">{w.grid}</span>
            <button className="wwv-locate" onClick={() => locate(w.x, w.y, w.id)} title="Show on map">
              <MapPin size={12} /> Locate
            </button>
          </div>
          <div className="wwv-orders">
            {w.orders.map((o, i) => {
              const out = (o.amount_in_stock ?? 0) <= 0;
              const itemIc = icon(o.item_id);
              const curIc = icon(o.currency_id);
              return (
                <div key={i} className={`wwv-order ${out ? 'out' : ''}`}>
                  <span className="wwv-side">
                    <span className="wwv-qty">{o.quantity}×</span>
                    {itemIc && <img src={itemIc} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                    <span className="wwv-name">{o.item_name || 'Item'}</span>
                  </span>
                  <ArrowRight size={11} className="wwv-arrow" />
                  <span className="wwv-side wwv-cost">
                    <span className="wwv-qty">{o.cost_per_item}×</span>
                    {curIc && <img src={curIc} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                    <span className="wwv-name">{o.currency_name || 'Scrap'}</span>
                  </span>
                  <span className={`wwv-stock ${out ? 'no' : 'yes'}`}>{out ? 'OUT' : o.amount_in_stock}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
