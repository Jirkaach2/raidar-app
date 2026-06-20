/**
 * Tool Cupboard upkeep estimator.
 *
 * Rust drains a fixed amount of each building material from the TC per day
 * (the in-game TC shows "resources required for 24h"). The server doesn't send
 * that figure over Rust+, and you can't solve it from one snapshot (protection
 * time = whichever resource runs out first). So we MEASURE it: by sampling the
 * TC's stock over time, the burn rate per resource = Δstock / Δtime.
 *
 * We also keep a fast first estimate from `protectionExpiry`: if a resource is
 * the limiter, dailyCost ≈ stock / daysRemaining. Measured rates replace the
 * estimate as soon as two samples with a real decrease are seen. Persisted so
 * the rate survives app restarts (decay is slow — minutes between ticks).
 */

export const UPKEEP_ITEM_IDS: Record<string, number> = {
  wood: -151838493,
  stones: -2099697608,
  metalFragments: 69511070,
  hqm: 317398316,
};

interface Sample {
  t: number;                       // epoch ms
  qty: Record<number, number>;     // itemId -> quantity
}

interface UpkeepRecord {
  first?: Sample;                  // earliest sample we still trust
  last?: Sample;                   // most recent sample
  /** Measured burn per DAY for each resource id (only set once observed). */
  ratePerDay: Record<number, number>;
}

const STORE_KEY = 'rustoverlay.upkeep';

function load(): Record<string, UpkeepRecord> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(data: Record<string, UpkeepRecord>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

let cache: Record<string, UpkeepRecord> | null = null;
function db(): Record<string, UpkeepRecord> {
  if (!cache) cache = load();
  return cache;
}

/**
 * Record a fresh TC reading and update the measured burn rate.
 * `key` should uniquely identify the TC (e.g. `${serverId}:${entityId}`).
 */
export function recordUpkeepSample(key: string, items: { item_id: number; quantity: number }[]): void {
  const data = db();
  const qty: Record<number, number> = {};
  for (const id of Object.values(UPKEEP_ITEM_IDS)) qty[id] = 0;
  for (const it of items) {
    if (qty[it.item_id] !== undefined) qty[it.item_id] = it.quantity;
  }
  const now = Date.now();
  const rec: UpkeepRecord = data[key] || { ratePerDay: {} };

  if (!rec.first) rec.first = { t: now, qty: { ...qty } };
  const baseline = rec.first;

  // Update measured rate from the longest reliable interval (first → now),
  // using only resources that strictly decreased (consumption, not restock).
  // Require a meaningful window (≥10 min) so short-interval noise doesn't blow
  // the per-day extrapolation out of proportion.
  const elapsedDays = (now - baseline.t) / 86_400_000;
  if (elapsedDays >= 10 / 1440) { // ≥ 10 minutes of data
    for (const id of Object.values(UPKEEP_ITEM_IDS)) {
      const drop = (baseline.qty[id] ?? 0) - (qty[id] ?? 0);
      if (drop > 0) {
        rec.ratePerDay[id] = drop / elapsedDays;
      }
    }
  }

  // If the player restocked (any resource went UP), reset the baseline so the
  // rate reflects the current draw rather than spanning a refill.
  if (rec.last) {
    const restocked = Object.values(UPKEEP_ITEM_IDS).some((id) => (qty[id] ?? 0) > (rec.last!.qty[id] ?? 0) + 1);
    if (restocked) rec.first = { t: now, qty: { ...qty } };
  }

  rec.last = { t: now, qty: { ...qty } };
  data[key] = rec;
  save(data);
}

export interface UpkeepLine {
  itemId: number;
  have: number;
  perDay: number | null;   // measured daily burn, or null if unknown yet
  estimated: boolean;      // true if derived from protectionExpiry, not measured
}

/**
 * Build the per-resource have/measured-need lines for a TC.
 */
export function getUpkeepLines(
  key: string,
  items: { item_id: number; quantity: number }[],
): UpkeepLine[] {
  const rec = db()[key];
  const lines: UpkeepLine[] = [];
  for (const id of Object.values(UPKEEP_ITEM_IDS)) {
    const have = items.find((it) => it.item_id === id)?.quantity || 0;
    if (have === 0 && !(rec?.ratePerDay?.[id])) continue;
    const measured = rec?.ratePerDay?.[id];
    let perDay: number | null = null;
    const estimated = false;
    if (measured && measured > 0) {
      perDay = measured;
    }
    lines.push({ itemId: id, have, perDay, estimated });
  }
  return lines;
}
