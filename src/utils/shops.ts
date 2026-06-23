import { useMapStore } from '../stores/map-store';
import { getNormalizedCoordinates } from './grid';

/**
 * Single source of truth for "is this vending machine an NPC / safe-zone shop?".
 *
 * This mirrors EXACTLY the detection the Market search uses, so every surface
 * (Market search, Best Shops, sale-tracking) classifies shops identically. A
 * shop is an NPC shop when either:
 *   1. its name matches a known NPC vendor/safe-zone label, OR
 *   2. it physically sits next to an NPC monument (Outpost / Bandit Camp /
 *      Fishing Village / Ranch-Barn-Stable).
 *
 * `nx`/`ny` are the shop's NORMALIZED map coordinates (0-1), matching the
 * coordinate space used for markers and monuments elsewhere in the app.
 */
const NPC_SHOP_NAMES = [
  'outpost', 'bandit', 'deep sea', 'medical shop', 'components shop',
  'resources shop', 'weapons shop', 'explosives shop', 'travelling vendor',
  'traveling vendor', 'wandering trader', 'air wolf', 'airwolf',
  'ranch', 'barn', 'stable', 'fishing', 'village', 'shopkeeper',
];

export function isNpcShop(label: string, nx: number, ny: number): boolean {
  const lname = (label || '').toLowerCase();
  if (NPC_SHOP_NAMES.some((n) => lname.includes(n))) return true;

  const { monuments, mapSize, mapImageWidth, mapImageHeight, oceanMargin } = useMapStore.getState();
  for (const m of monuments) {
    const key = (m.token || '').toLowerCase();
    if (
      key.includes('outpost') || key.includes('bandit') || key.includes('fishing') ||
      key.includes('barn') || key.includes('stable') || key.includes('ranch')
    ) {
      const p = getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
      if (Math.hypot(nx - p.x, ny - p.y) < 0.05) return true;
    }
  }
  return false;
}
