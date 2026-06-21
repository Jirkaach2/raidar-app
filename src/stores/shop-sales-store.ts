import { create } from 'zustand';

/**
 * Shop sales tracker.
 *
 * Vending machines broadcast every sell order with an `amount_in_stock`. When
 * that stock DROPS between two polls, the difference is the number of purchases
 * made — each purchase hands over `quantity` of the item for `cost_per_item`
 * currency. We accumulate, per shop:
 *   • soldUnits[itemId]   — total units of each item sold
 *   • earned[currencyId]  — total currency the shop has taken in
 *   • saleEvents          — number of individual purchases observed
 *
 * Restocks (stock increases) and brand-new listings are ignored, so the totals
 * only ever grow from genuine sales we actually witnessed while connected.
 * Persisted per server so the leaderboard survives restarts.
 */

export interface ShopOrderMeta {
  item_id: number;
  item_name: string;
  quantity: number;
  cost_per_item: number;
  currency_id: number;
  currency_name: string;
  amount_in_stock: number;
}

export interface ShopMeta {
  shopName: string;
  grid: string;
  x: number;          // normalized 0-1
  y: number;
  serverId?: string;
  serverName?: string;
  isNpc?: boolean;
}

export interface ShopSales extends ShopMeta {
  key: string;
  firstSeen: number;
  lastSale: number;
  saleEvents: number;                       // total purchases observed
  soldUnits: Record<number, number>;        // itemId → units sold
  earned: Record<number, number>;           // currencyId → currency received
  /** Display-name cache so the UI can render without re-resolving item ids. */
  names: Record<number, string>;
  /** Last seen stock per order signature (to diff next poll). */
  lastStock: Record<string, number>;
}

interface ShopSalesState {
  shops: Record<string, ShopSales>;
  /** Feed one shop's current orders; auto-detects + records any sales. */
  ingest: (meta: ShopMeta, orders: ShopOrderMeta[]) => void;
  clear: () => void;
  removeShop: (key: string) => void;
}

const STORAGE_KEY = 'raidar.shopSales';

function load(): Record<string, ShopSales> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  // Debounced — sales ingest runs every poll, no need to hit storage each time.
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(useShopSalesStore.getState().shops)); } catch { /* ignore */ }
  }, 1500);
}

/** Stable shop key — position is fixed per shop, names can collide. */
function shopKey(meta: ShopMeta): string {
  const sx = Math.round(meta.x * 1000);
  const sy = Math.round(meta.y * 1000);
  return `${meta.serverId || 'srv'}:${sx}:${sy}`;
}
function orderSig(o: ShopOrderMeta): string {
  return `${o.item_id}:${o.cost_per_item}:${o.currency_id}:${o.quantity}`;
}

export const useShopSalesStore = create<ShopSalesState>((set, get) => ({
  shops: load(),

  ingest: (meta, orders) => {
    if (!orders || orders.length === 0) return;
    const key = shopKey(meta);
    const now = Date.now();
    const shops = { ...get().shops };
    const prev = shops[key];

    const shop: ShopSales = prev
      ? { ...prev, ...meta, key, soldUnits: { ...prev.soldUnits }, earned: { ...prev.earned }, names: { ...prev.names }, lastStock: { ...prev.lastStock } }
      : {
          ...meta, key, firstSeen: now, lastSale: 0, saleEvents: 0,
          soldUnits: {}, earned: {}, names: {}, lastStock: {},
        };

    const nextStock: Record<string, number> = {};
    const metaBySig: Record<string, ShopOrderMeta> = {};
    let sawSale = false;

    // Aggregate stock per order signature. Sellers often list the SAME item in
    // multiple slots, and Rust+ doesn't guarantee slot order between polls — so
    // summing all matching slots makes the diff order-independent and stops
    // phantom "sales" from slots simply being reordered.
    for (const o of orders) {
      const stock = o.amount_in_stock ?? -1;
      if (stock < 0) continue; // NPC / infinite stock
      const sig = orderSig(o);
      nextStock[sig] = (nextStock[sig] || 0) + stock;
      if (!metaBySig[sig]) metaBySig[sig] = o;
    }

    // A single shop can't realistically sell more than this of one item between
    // two ~1s polls; a bigger drop means the machine was relisted/rebuilt, not a
    // real sale — ignore it (just reset the baseline).
    const MAX_PLAUSIBLE_DROP = 500;

    for (const sig in nextStock) {
      const stock = nextStock[sig];
      const prevStock = shop.lastStock[sig];
      if (prevStock !== undefined && stock < prevStock) {
        const purchases = prevStock - stock;
        if (purchases > 0 && purchases <= MAX_PLAUSIBLE_DROP) {
          const o = metaBySig[sig];
          shop.soldUnits[o.item_id] = (shop.soldUnits[o.item_id] || 0) + purchases * o.quantity;
          shop.earned[o.currency_id] = (shop.earned[o.currency_id] || 0) + purchases * o.cost_per_item;
          shop.saleEvents += purchases;
          shop.names[o.item_id] = o.item_name;
          shop.names[o.currency_id] = o.currency_name;
          shop.lastSale = now;
          sawSale = true;
        }
      }
    }
    shop.lastStock = nextStock;

    // Only persist shops we've actually recorded a sale for, OR keep tracking
    // ones already in the table. Skip storing a fresh shop until its first sale
    // so the leaderboard isn't flooded with every idle machine on the map.
    if (!prev && !sawSale) {
      // Still need to remember its stock baseline to catch the FIRST sale, so
      // stash a lightweight tracking entry without revenue.
      shops[key] = shop;
      set({ shops });
      return;
    }

    shops[key] = shop;
    set({ shops });
    scheduleSave();
  },

  clear: () => { set({ shops: {} }); try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } },
  removeShop: (key) => set((s) => {
    const shops = { ...s.shops };
    delete shops[key];
    scheduleSave();
    return { shops };
  }),
}));
