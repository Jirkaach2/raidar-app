import { useMapStore } from '../stores/map-store';
import { getNormalizedCoordinates } from './grid';

/**
 * Single source of truth for "is this vending machine an NPC / safe-zone shop?".
 *
 * This is the EXACT detection every surface uses (Market search, Best Shops,
 * Market Index, sale-tracking, map markers), so shops classify identically
 * everywhere. The detection is deliberately ACCURATE and CONSERVATIVE: a normal
 * player shop must never be mistaken for an NPC shop just because it happens to
 * sit near the coast or carry a generic word in its name. A shop is an NPC shop
 * only when either:
 *   1. its name matches a genuine NPC vendor / safe-zone label, OR
 *   2. it sits VERY close to an actual safe-zone monument (Outpost / Bandit
 *      Camp only).
 *
 * `nx`/`ny` are the shop's NORMALIZED map coordinates (0-1), matching the
 * coordinate space used for markers and monuments elsewhere in the app.
 *
 * NOTE: "deep sea" lives in its own detector (`isDeepSeaShop`) and takes
 * precedence — a deep-sea shop is NEVER also counted as an NPC shop.
 */
const NPC_SHOP_NAMES = [
  'outpost', 'bandit camp', 'air wolf', 'airwolf', 'dome',
  'small oil rig', 'large oil rig',
  // Literal stall names that ONLY the NPC safe-zone shops ever use.
  'medical supplies', 'components', 'resources shop', 'weapons shop',
];

/**
 * Monument tokens whose immediate vicinity hosts a real safe-zone NPC vendor.
 * Only the two actual safe-zone monuments qualify — fishing/ranch/barn/stable
 * are NOT here, since player shops legitimately cluster near them.
 */
const NPC_MONUMENT_KEYS = ['outpost', 'bandit'];

/**
 * Proximity (in normalized 0-1 map units) for a shop to count as "at" a
 * safe-zone monument. Kept very tight so only shops literally inside the
 * safe-zone are flagged — not nearby player bases.
 */
const MONUMENT_ZONE_RADIUS = 0.02;

export function isNpcShop(label: string, nx: number, ny: number): boolean {
  // Deep-sea shops take precedence and are never treated as NPC shops.
  if (isDeepSeaShop(label, nx, ny)) return false;

  const lname = (label || '').toLowerCase();
  if (NPC_SHOP_NAMES.some((n) => lname.includes(n))) return true;

  const { monuments, mapSize, mapImageWidth, mapImageHeight, oceanMargin } = useMapStore.getState();
  for (const m of monuments) {
    const key = (m.token || '').toLowerCase();
    if (NPC_MONUMENT_KEYS.some((k) => key.includes(k))) {
      const p = getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
      if (Math.hypot(nx - p.x, ny - p.y) <= MONUMENT_ZONE_RADIUS) return true;
    }
  }
  return false;
}

/**
 * Detects a deep-sea vendor shop. These are NOT regular NPC shops, so they stay
 * visible everywhere and are flagged with their own distinct badge / map marker.
 *
 * A deep-sea shop's true signature is that it is physically OUTSIDE the playable
 * map grid — out in the deep ocean beyond the map border. We detect it by name
 * ('deep sea'/'deepsea'), OR when the shop's normalized coordinates fall outside
 * the playable band defined by the ocean margin. The Underwater Lab is a normal
 * monument, NOT the deep-sea vendor, so monument-proximity is intentionally not
 * used here.
 */
const DEEP_SEA_NAMES = ['deep sea', 'deepsea', 'deep-sea'];

/** Fallback band width (fraction of the image) when map metadata is missing. */
const DEFAULT_OCEAN_MARGIN_FRACTION = 0.06;

export function isDeepSeaShop(label: string, nx: number, ny: number): boolean {
  const lname = (label || '').toLowerCase();
  if (DEEP_SEA_NAMES.some((n) => lname.includes(n))) return true;

  const { oceanMargin, mapImageWidth } = useMapStore.getState();
  // margin = ocean border thickness as a fraction of the image. Guard against a
  // missing/zero image width (divide-by-zero) by falling back to ~0.06.
  const margin = mapImageWidth > 0 && oceanMargin > 0
    ? oceanMargin / mapImageWidth
    : DEFAULT_OCEAN_MARGIN_FRACTION;

  // Outside the playable band (in the ocean border / beyond the map) → deep sea.
  return nx < margin || nx > 1 - margin || ny < margin || ny > 1 - margin;
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
