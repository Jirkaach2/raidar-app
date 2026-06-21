import { create } from 'zustand';
import type { ShopOrderMeta } from './shop-sales-store';

/**
 * Market price history.
 *
 * Every poll we observe each vending machine's sell orders. For every
 * item/currency pair we record the listed unit price, tracking the lowest,
 * highest and a running average over every observation, plus how many distinct
 * listings we've seen and the most recent price. Combined with the units-sold
 * totals from the shop-sales store, this powers a "market index" of what sells
 * and what it goes for on the current server.
 *
 * Persisted per server so the intel survives restarts.
 */

export interface ItemPrice {
  itemId: number;
  itemName: string;
  currencyId: number;
  currencyName: string;
  min: number;
  max: number;
  sum: number;      // running sum of observed unit prices
  count: number;    // number of observations (for average)
  last: number;     // most recent observed unit price
  listings: number; // distinct shop listings seen this session
  updatedAt: number;
}

interface PriceHistoryState {
  /** serverId → `${itemId}:${currencyId}` → ItemPrice */
  byServer: Record<string, Record<string, ItemPrice>>;
  ingest: (serverId: string | undefined, orders: ShopOrderMeta[]) => void;
  clear: (serverId?: string) => void;
}

const STORAGE_KEY = 'raidar.priceHistory';

function load(): Record<string, Record<string, ItemPrice>> {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(usePriceHistoryStore.getState().byServer)); } catch { /* ignore */ }
  }, 2000);
}

export const usePriceHistoryStore = create<PriceHistoryState>((set, get) => ({
  byServer: load(),

  ingest: (serverId, orders) => {
    if (!orders || orders.length === 0) return;
    const sid = serverId || 'srv';
    const byServer = { ...get().byServer };
    const table = { ...(byServer[sid] || {}) };
    const now = Date.now();
    let touched = false;

    for (const o of orders) {
      const price = o.cost_per_item;
      if (!price || price <= 0) continue;
      // Per-unit price in the listed currency.
      const unit = o.quantity > 0 ? price / o.quantity : price;
      const key = `${o.item_id}:${o.currency_id}`;
      const prev = table[key];
      if (prev) {
        table[key] = {
          ...prev,
          min: Math.min(prev.min, unit),
          max: Math.max(prev.max, unit),
          sum: prev.sum + unit,
          count: prev.count + 1,
          last: unit,
          listings: prev.listings + 1,
          updatedAt: now,
          itemName: o.item_name || prev.itemName,
          currencyName: o.currency_name || prev.currencyName,
        };
      } else {
        table[key] = {
          itemId: o.item_id, itemName: o.item_name || `Item ${o.item_id}`,
          currencyId: o.currency_id, currencyName: o.currency_name || 'scrap',
          min: unit, max: unit, sum: unit, count: 1, last: unit, listings: 1, updatedAt: now,
        };
      }
      touched = true;
    }

    if (!touched) return;
    byServer[sid] = table;
    set({ byServer });
    scheduleSave();
  },

  clear: (serverId) => set((s) => {
    if (!serverId) { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } return { byServer: {} }; }
    const byServer = { ...s.byServer }; delete byServer[serverId];
    scheduleSave();
    return { byServer };
  }),
}));
