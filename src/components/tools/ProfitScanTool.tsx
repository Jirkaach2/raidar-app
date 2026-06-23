import { useMemo, useState, useEffect } from 'react';
import { useMapStore } from '../../stores/map-store';
import { useUiStore } from '../../stores/ui-store';
import { getItemIconUrl } from '../../utils/items';
import { getGridCoordinate } from '../../utils/grid';
import './ProfitScanTool.css';

/**
 * Profit Scanner — finds profitable 2-step vending trades.
 */

interface Order {
  item_id: number;
  item_name?: string;
  quantity: number;
  cost_per_item: number;
  currency_id: number;
  currency_name?: string;
  amount_in_stock?: number;
}

interface ShopOrder {
  order: Order;
  shop: string;
  grid: string;
  id: string;
  x: number;
  y: number;
}

interface ProfitRoute {
  id: string;
  currencyId: number;
  currencyName: string;
  midId: number;
  midName: string;
  step1: ShopOrder; // buy M with C
  step2: ShopOrder; // buy C with M
  n1: number;       // step-1 trade count
  n2: number;       // step-2 trade count
  spent: number;    // C spent
  gained: number;   // C gained
  profit: number;   // gained - spent
}

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
function lcm(a: number, b: number): number { return (a / gcd(a, b)) * b; }

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return `${n}`;
}

function getItemStackSize(_itemId: number, itemName?: string): number {
  const name = (itemName || '').toLowerCase();
  // Guns / Weapons / Tools / Armor are usually 1
  if (
    name.includes('rifle') || name.includes('pistol') || name.includes('shotgun') ||
    name.includes('smg') || name.includes('launcher') || name.includes('bow') ||
    name.includes('crossbow') || name.includes('axe') || name.includes('pickaxe') ||
    name.includes('sword') || name.includes('cleaver') || name.includes('hatchet') ||
    name.includes('jacket') || name.includes('pants') || name.includes('helmet') || name.includes('mask') ||
    name.includes('hoodie') || name.includes('boots') || name.includes('gloves') ||
    name.includes('cctv') || name.includes('targeting computer') || name.includes('card')
  ) {
    return 1;
  }
  // Components / Meds / Ammo / Throwables are usually 20 or 10 or 50
  if (
    name.includes('spring') || name.includes('gear') || name.includes('pipe') ||
    name.includes('blade') || name.includes('tech') || name.includes('semi body') ||
    name.includes('rifle body') || name.includes('smg body') || name.includes('fuse') ||
    name.includes('ammo') || name.includes('bullet') || name.includes('syringe') ||
    name.includes('medkit') || name.includes('grenade') || name.includes('explosive')
  ) {
    return 20;
  }
  // Resources like Wood, Stone, Metal Ore, Sulfur Ore, Charcoal, Metal Fragments, HQM
  if (name.includes('high quality metal') || name.includes('hqm')) {
    return 100;
  }
  if (
    name.includes('wood') || name.includes('stone') || name.includes('metal') ||
    name.includes('sulfur') || name.includes('charcoal') || name.includes('ore') ||
    name.includes('gunpowder') || name.includes('low grade') || name.includes('cloth') ||
    name.includes('leather')
  ) {
    return 1000;
  }
  // Default fallback: 50
  return 50;
}

export function ProfitScanTool() {
  const markers = useMapStore((s) => s.markers);
  const monuments = useMapStore((s) => s.monuments);
  const mapSize = useMapStore((s) => s.mapSize);
  const oceanMargin = useMapStore((s) => s.oceanMargin || 0);
  const imageWidth = useMapStore((s) => s.mapImageWidth || 0);
  const imageHeight = useMapStore((s) => s.mapImageHeight || 0);
  const selectMarker = useMapStore((s) => s.selectMarker);
  const [, setTick] = useState(0);

  // Refresh occasionally so stock/price changes are reflected.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const routes = useMemo<ProfitRoute[]>(() => {
    // Gather every in-stock sell order across all shops on the map.
    const orders: ShopOrder[] = [];
    markers.forEach((m) => {
      if (m.type !== 'vending_machine' || !m.raw?.sell_orders) return;
      const grid = m.detail || getGridCoordinate(m.x, m.y, mapSize);
      const shop = m.label || 'Vending Machine';

      (m.raw.sell_orders as Order[]).forEach((o) => {
        // NPC vending machines use their actual stock now
        const stock = o.amount_in_stock ?? 0;
        if (stock <= 0) return;
        if (o.quantity <= 0 || o.cost_per_item <= 0) return;
        orders.push({ 
          order: { ...o, amount_in_stock: stock }, 
          shop, 
          grid,
          id: m.id,
          x: m.x,
          y: m.y
        });
      });
    });

    const out: ProfitRoute[] = [];
    // Step 1: buy item M with currency C. Step 2: sell M for currency C.
    for (const s1 of orders) {
      const C = s1.order.currency_id;       // starting currency
      const M = s1.order.item_id;           // intermediate item
      if (C === M) continue;
      for (const s2 of orders) {
        // s2 must sell C and accept M as payment.
        if (s2.order.item_id !== C || s2.order.currency_id !== M) continue;
        if (s2 === s1) continue;

        const mPerStep1 = s1.order.quantity;        // M gained per step-1 trade
        const mPerStep2 = s2.order.cost_per_item;    // M spent per step-2 trade
        const L = lcm(mPerStep1, mPerStep2);
        let n1 = L / mPerStep1;
        let n2 = L / mPerStep2;

        // Cap by available stock (M sold by s1, C sold by s2).
        const s1Stock = s1.order.amount_in_stock ?? 0;       // units of M for sale
        const s2Stock = s2.order.amount_in_stock ?? 0;       // units of C for sale
        const maxN1ByStock = Math.floor(s1Stock / s1.order.quantity);
        const maxN2ByStock = Math.floor(s2Stock / s2.order.quantity);

        // Cap by single trip capacity (30 slots)
        const stackSizeM = getItemStackSize(M, s1.order.item_name);
        const stackSizeC = getItemStackSize(C, s1.order.currency_name);
        const maxMAllowed = 30 * stackSizeM;
        const maxCAllowed = 30 * stackSizeC;

        const baseMPerBlock = L;
        const baseSpentCPerBlock = (L / s1.order.quantity) * s1.order.cost_per_item;
        const baseGainedCPerBlock = (L / s2.order.cost_per_item) * s2.order.quantity;
        const baseMaxCPerBlock = Math.max(baseSpentCPerBlock, baseGainedCPerBlock);

        const maxBlocksByM = Math.floor(maxMAllowed / baseMPerBlock);
        const maxBlocksByC = Math.floor(maxCAllowed / baseMaxCPerBlock);
        const inventoryCapBlocks = Math.min(maxBlocksByM, maxBlocksByC);

        // Keep the M-balanced ratio while fitting stock and inventory capacity.
        let ratioBlocks = Math.min(
          Math.floor(maxN1ByStock / n1),
          Math.floor(maxN2ByStock / n2)
        );
        ratioBlocks = Math.min(ratioBlocks, Math.max(1, inventoryCapBlocks));

        if (ratioBlocks < 1) continue;
        n1 *= ratioBlocks;
        n2 *= ratioBlocks;

        const spent = n1 * s1.order.cost_per_item;   // C spent
        const gained = n2 * s2.order.quantity;        // C gained
        const profit = gained - spent;
        if (profit <= 0) continue;

        out.push({
          id: `${s1.grid}-${M}-${s2.grid}-${C}`,
          currencyId: C,
          currencyName: s1.order.currency_name || 'Currency',
          midId: M,
          midName: s1.order.item_name || 'Item',
          step1: s1,
          step2: s2,
          n1,
          n2,
          spent,
          gained,
          profit,
        });
      }
    }

    // Best profit first; de-dupe identical routes keeping the highest profit.
    const best = new Map<string, ProfitRoute>();
    for (const r of out) {
      const ex = best.get(r.id);
      if (!ex || r.profit > ex.profit) best.set(r.id, r);
    }
    return [...best.values()].sort((a, b) => b.profit - a.profit).slice(0, 40);
  }, [markers, monuments, mapSize, oceanMargin, imageWidth, imageHeight]);

  const handleShopClick = (id: string, x: number, y: number) => {
    // Switch to Map tab
    useUiStore.getState().setActivePage('map');

    selectMarker(id);
    const MAP_SIZE = 800;
    const zoom = 2.0;
    useMapStore.getState().setViewport({
      x: -(x - 0.5) * MAP_SIZE * zoom,
      y: -(y - 0.5) * MAP_SIZE * zoom,
      zoom: zoom
    });
  };

  const midIcon = (id: number) => getItemIconUrl(id) || undefined;

  return (
    <div className="decay profit-scan ps">
      <div className="decay-section-head"><h3>PROFIT SCANNER ({routes.length})</h3></div>
      <p className="ps-sub">
        Arbitrage trade loops across player/NPC shops. Buy the intermediate item at Step 1, then sell it at Step 2. Click a step to show the shop on the map.
      </p>

      {routes.length === 0 ? (
        <div className="ps-empty">No profitable 2-step trades found right now.</div>
      ) : (
        <div className="ps-list">
          {routes.map((r) => (
            <div key={r.id} className="ps-card">
              {/* Head — intermediate item + profit focal point */}
              <div className="ps-card-head">
                <span className="ps-via">
                  {midIcon(r.midId) && <img src={midIcon(r.midId)} alt="" />}
                  via <b>{r.midName}</b>
                </span>
                <span className="ps-profit" title={`+${fmt(r.profit)} ${r.currencyName} per round trip`}>
                  {midIcon(r.currencyId) && <img src={midIcon(r.currencyId)} alt="" />}
                  <span className="ps-profit-val">+{fmt(r.profit)}</span>
                  <span className="ps-profit-unit">{r.currencyName}/trip</span>
                </span>
              </div>

              <div className="ps-steps">
                {/* Step 1 — BUY the intermediate */}
                <button
                  type="button"
                  className="ps-step ps-step--buy"
                  onClick={() => handleShopClick(r.step1.id, r.step1.x, r.step1.y)}
                  title="Center this shop on the map"
                >
                  <span className="ps-badge">1</span>
                  <span className="ps-step-body">
                    <span className="ps-step-label">
                      Buy <span className="ps-step-qty">×{r.n1}</span>
                    </span>
                    <span className="ps-flow">
                      <span className="ps-num ps-num--spend">{fmt(r.n1 * r.step1.order.cost_per_item)}</span>
                      <span className="ps-tok">{r.currencyName}</span>
                      <span className="ps-arrow">&rarr;</span>
                      {midIcon(r.midId) && <img src={midIcon(r.midId)} alt="" />}
                      <span className="ps-num ps-num--get">{fmt(r.n1 * r.step1.order.quantity)}</span>
                      <span className="ps-tok">{r.midName}</span>
                    </span>
                  </span>
                  <span className="ps-grid">
                    {r.step1.grid}
                    <JumpArrow />
                  </span>
                </button>

                {/* Step 2 — SELL the intermediate */}
                <button
                  type="button"
                  className="ps-step ps-step--sell"
                  onClick={() => handleShopClick(r.step2.id, r.step2.x, r.step2.y)}
                  title="Center this shop on the map"
                >
                  <span className="ps-badge">2</span>
                  <span className="ps-step-body">
                    <span className="ps-step-label">
                      Sell <span className="ps-step-qty">×{r.n2}</span>
                    </span>
                    <span className="ps-flow">
                      {midIcon(r.midId) && <img src={midIcon(r.midId)} alt="" />}
                      <span className="ps-num ps-num--spend">{fmt(r.n2 * r.step2.order.cost_per_item)}</span>
                      <span className="ps-tok">{r.midName}</span>
                      <span className="ps-arrow">&rarr;</span>
                      {midIcon(r.currencyId) && <img src={midIcon(r.currencyId)} alt="" />}
                      <span className="ps-num ps-num--get">{fmt(r.n2 * r.step2.order.quantity)}</span>
                      <span className="ps-tok">{r.currencyName}</span>
                    </span>
                  </span>
                  <span className="ps-grid">
                    {r.step2.grid}
                    <JumpArrow />
                  </span>
                </button>
              </div>

              {/* Footer — totals */}
              <div className="ps-foot">
                <span className="ps-foot-out">Spent <b>{fmt(r.spent)}</b> {r.currencyName}</span>
                <span className="ps-arrow">&rarr;</span>
                <span className="ps-foot-in">Gained <b>{fmt(r.gained)}</b> {r.currencyName}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JumpArrow() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
