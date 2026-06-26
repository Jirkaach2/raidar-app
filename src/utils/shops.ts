import { useMapStore } from '../stores/map-store';

/**
 * Single source of truth for "is this vending machine an NPC / safe-zone shop?".
 *
 * This is the EXACT detection every surface uses (Market search, Best Shops,
 * Market Index, sale-tracking, map markers), so shops classify identically
 * everywhere. Detection is by NAME ONLY: a shop is an NPC shop when its name
 * matches one of the curated, real NPC vendor / safe-zone labels below
 * (case-insensitive substring match). No coordinate / monument-proximity logic
 * is used — a normal player shop is never mistaken for an NPC shop just because
 * of where it sits on the map.
 *
 * NOTE: "deep sea" lives in its own detector (`isDeepSeaShop`) and takes
 * precedence — a deep-sea shop is NEVER also counted as an NPC shop.
 */
const NPC_SHOP_NAMES = [
  'fish exchange', 'boat vendor', 'stables shopkeeper', 'outpost outfitters',
  'components', 'building', 'tools & stuff', 'weapons', 'shop keeper',
  'shopkeeper', 'air wolf', 'airwolf', 'outpost', 'bandit',
];

export function isNpcShop(label: string, _nx: number, _ny: number): boolean {
  // Deep-sea shops take precedence and are never treated as NPC shops. The
  // coordinate args are accepted for caller compatibility but only consumed by
  // the deep-sea detector — NPC detection itself is name-only.
  if (isDeepSeaShop(label, _nx, _ny)) return false;

  const lname = (label || '').toLowerCase();
  return NPC_SHOP_NAMES.some((n) => lname.includes(n));
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
const DEEP_SEA_NAMES = [
  'deep sea', 'deepsea', 'deep-sea',
  // Deep Sea event merchant stalls carry these exact names (the " shop" suffix
  // distinguishes them from the Outpost/Bandit NPC vendors named just
  // "Components" / "Weapons" with no suffix).
  'medical shop', 'components shop', 'resources shop',
  'weapons shop', 'explosives shop',
];

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
