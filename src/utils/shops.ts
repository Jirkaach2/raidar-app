import { useMapStore } from '../stores/map-store';
import { getNormalizedCoordinates } from './grid';

/**
 * Single source of truth for "is this vending machine an NPC / safe-zone shop?".
 *
 * This mirrors EXACTLY the detection the Market search uses (VendingPanel's
 * inline `isNpcShop`), so every surface (Market search, Best Shops, Market
 * Index, sale-tracking, map markers) classifies shops identically. A shop is an
 * NPC shop when either:
 *   1. its name matches a known NPC vendor/safe-zone label, OR
 *   2. it physically sits next to an NPC monument (Outpost / Bandit Camp /
 *      Fishing Village / Ranch-Barn-Stable).
 *
 * `nx`/`ny` are the shop's NORMALIZED map coordinates (0-1), matching the
 * coordinate space used for markers and monuments elsewhere in the app.
 *
 * NOTE: "deep sea" deliberately lives in its own detector (`isDeepSeaShop`) and
 * is NOT treated as a plain NPC shop — deep-sea vendor shops should stay
 * visible and be marked specially instead of being hidden with safe-zone NPCs.
 */
const NPC_SHOP_NAMES = [
  'outpost', 'bandit', 'medical shop', 'components shop',
  'resources shop', 'weapons shop', 'explosives shop', 'travelling vendor',
  'traveling vendor', 'wandering trader', 'air wolf', 'airwolf',
  'ranch', 'barn', 'stable', 'fishing', 'village', 'shopkeeper',
];

/** Monument tokens whose immediate vicinity hosts NPC/safe-zone vendors. */
const NPC_MONUMENT_KEYS = ['outpost', 'bandit', 'fishing', 'barn', 'stable', 'ranch'];

/** Proximity (in normalized 0-1 map units) for a shop to count as "at" a monument. */
const MONUMENT_ZONE_RADIUS = 0.05;

export function isNpcShop(label: string, nx: number, ny: number): boolean {
  const lname = (label || '').toLowerCase();
  if (NPC_SHOP_NAMES.some((n) => lname.includes(n))) return true;

  const { monuments, mapSize, mapImageWidth, mapImageHeight, oceanMargin } = useMapStore.getState();
  for (const m of monuments) {
    const key = (m.token || '').toLowerCase();
    if (NPC_MONUMENT_KEYS.some((k) => key.includes(k))) {
      const p = getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
      if (Math.hypot(nx - p.x, ny - p.y) < MONUMENT_ZONE_RADIUS) return true;
    }
  }
  return false;
}

/**
 * Detects a deep-sea vendor shop. These are NOT regular NPC shops (they are no
 * longer in the NPC-exclusion list), so they stay visible everywhere and can be
 * flagged with their own distinct badge / map marker.
 *
 * Detection is by name first, then by proximity to a deep-sea / underwater-lab
 * monument zone, mirroring the monument-proximity test used by `isNpcShop`.
 */
const DEEP_SEA_NAMES = ['deep sea', 'deepsea', 'deep-sea'];
const DEEP_SEA_MONUMENT_KEYS = ['deepsea', 'deep_sea', 'underwater', 'submarine'];

export function isDeepSeaShop(label: string, nx: number, ny: number): boolean {
  const lname = (label || '').toLowerCase();
  if (DEEP_SEA_NAMES.some((n) => lname.includes(n))) return true;

  const { monuments, mapSize, mapImageWidth, mapImageHeight, oceanMargin } = useMapStore.getState();
  for (const m of monuments) {
    const key = (m.token || '').toLowerCase();
    if (DEEP_SEA_MONUMENT_KEYS.some((k) => key.includes(k))) {
      const p = getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
      if (Math.hypot(nx - p.x, ny - p.y) < MONUMENT_ZONE_RADIUS) return true;
    }
  }
  return false;
}

/* ───────────────────────────── Realism filter ─────────────────────────────
 * Some shops report absurd bulk/fake data (a single order listing tens of
 * thousands of an item, free items, or impossibly large aggregate "earned"
 * totals). These thresholds reject that data so leaderboards / indexes stay
 * trustworthy. They are intentionally generous so that only clearly-bogus data
 * is dropped, never legitimate large stores.
 * -------------------------------------------------------------------------- */

/** A single sell order can't sensibly hand over more than this many units at once. */
export const MAX_ORDER_QUANTITY = 10_000;
/** A single order slot holding more than this in stock is bad/overflow data. */
export const MAX_ORDER_STOCK = 100_000;
/** Total currency a single shop could plausibly have earned (anti-overflow cap). */
export const MAX_SHOP_EARNED = 100_000_000;
/** Total units of a single item a shop could plausibly have sold. */
export const MAX_SHOP_ITEM_UNITS = 1_000_000;

/** Minimal shape needed to realism-check a sell order. */
export interface RealismOrderLike {
  quantity?: number;
  cost_per_item?: number;
  amount_in_stock?: number;
}

/**
 * True when an individual sell order looks like real, sane data.
 * Rejects: non-positive / oversized quantities, non-positive price-per-item,
 * and impossibly large stock counts.
 */
export function isRealisticOrder(o: RealismOrderLike): boolean {
  const qty = o.quantity ?? 0;
  const cost = o.cost_per_item ?? 0;
  const stock = o.amount_in_stock ?? 0;
  if (qty <= 0 || qty > MAX_ORDER_QUANTITY) return false;
  if (cost <= 0) return false;
  if (stock > MAX_ORDER_STOCK) return false;
  return true;
}

/**
 * True when a shop's accumulated totals look realistic. Used to keep fake/bulk
 * shops out of the Best Shops leaderboard. Flags shops whose total earned
 * currency, or any single item's sold-unit count, blows past the sane caps.
 */
export function areShopTotalsRealistic(
  earned: Record<number, number>,
  soldUnits: Record<number, number>,
): boolean {
  const totalEarned = Object.values(earned).reduce((a, b) => a + b, 0);
  if (totalEarned > MAX_SHOP_EARNED) return false;
  for (const units of Object.values(soldUnits)) {
    if (units > MAX_SHOP_ITEM_UNITS) return false;
  }
  return true;
}
