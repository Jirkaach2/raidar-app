/**
 * Recycler yields for commonly-recycled components.
 * Values from the rustly.com recycler yield chart (monument recycler, full
 * yield). Columns: Scrap, High Quality Metal, Metal Fragments, Cloth.
 *
 * Safe-zone recyclers (Outpost / Bandit Camp) give less scrap; some monument
 * recyclers (Airfield, Supermarket, Arctic) give +20%. We model two modes:
 *   - monument  : the standard chart values below
 *   - safezone  : scrap reduced (~60% of monument), materials unchanged
 */

export interface RecycleOutput {
  item: string;
  icon?: string;
  monument: number;
  safezone: number;
}

export interface RecyclableComponent {
  id: string;
  name: string;
  icon: string;      // rusthelp CDN slug for the input item
  scrap: number;     // scrap per item (monument)
  hqm?: number;      // high quality metal
  frags?: number;    // metal fragments
  cloth?: number;    // cloth
  techparts?: number; // tech trash
}

// Scrap at safe-zone recyclers is reduced; materials are unchanged.
const SAFEZONE_SCRAP_MULT = 0.6;

export const RECYCLABLES: RecyclableComponent[] = [
  { id: 'riflebody',   name: 'Rifle Body',           icon: 'riflebody',          scrap: 25, hqm: 2 },
  { id: 'techparts',   name: 'Tech Trash',           icon: 'techparts',          scrap: 20, hqm: 1 },
  { id: 'semibody',    name: 'Semi Automatic Body',  icon: 'semibody',           scrap: 15, hqm: 2, frags: 75 },
  { id: 'smgbody',     name: 'SMG Body',             icon: 'smgbody',            scrap: 15, hqm: 2 },
  { id: 'metalspring', name: 'Metal Spring',         icon: 'metalspring',        scrap: 10, hqm: 1 },
  { id: 'gears',       name: 'Gears',                icon: 'gears',              scrap: 10, frags: 13 },
  { id: 'cctv',        name: 'CCTV Camera',          icon: 'cctv-camera',        scrap: 0, hqm: 1, techparts: 1 },
  { id: 'targeting',   name: 'Targeting Computer',   icon: 'targeting-computer', scrap: 0, hqm: 1, techparts: 1 },
  { id: 'fuse',        name: 'Electric Fuse',        icon: 'fuse',               scrap: 20 },
  { id: 'metalpipe',   name: 'Metal Pipe',           icon: 'metalpipe',          scrap: 5, hqm: 1 },
  { id: 'roadsigns',   name: 'Road Signs',           icon: 'roadsigns',          scrap: 5, hqm: 1 },
  { id: 'sheetmetal',  name: 'Sheet Metal',          icon: 'sheetmetal',         scrap: 8, hqm: 1, frags: 100 },
  { id: 'metalblade',  name: 'Metal Blade',          icon: 'metalblade',         scrap: 2, frags: 15 },
  { id: 'sewingkit',   name: 'Sewing Kit',           icon: 'sewingkit',          scrap: 0, cloth: 10 },
  { id: 'tarp',        name: 'Tarp',                 icon: 'tarp',               scrap: 0, cloth: 50 },
  { id: 'rope',        name: 'Rope',                 icon: 'rope',               scrap: 0, cloth: 15 },
  { id: 'propanetank', name: 'Propane Tank',         icon: 'propanetank',        scrap: 1, frags: 50 },
  { id: 'emptycan',    name: 'Empty Can',            icon: 'can-tuna',           scrap: 0, frags: 10 },
];

export type RecyclerType = 'monument' | 'safezone';

export function computeRecycle(
  basket: Record<string, number>,
  type: RecyclerType,
  multiplier: number = 1,
): { item: string; icon?: string; amount: number }[] {
  const totals: Record<string, { icon?: string; amount: number }> = {
    Scrap: { icon: 'scrap', amount: 0 },
    'High Quality Metal': { icon: 'metal-refined', amount: 0 },
    'Metal Fragments': { icon: 'metal-fragments', amount: 0 },
    Cloth: { icon: 'cloth', amount: 0 },
    'Tech Trash': { icon: 'techparts', amount: 0 },
  };
  for (const comp of RECYCLABLES) {
    const count = basket[comp.id] || 0;
    if (count <= 0) continue;
    const scrap = type === 'safezone' ? comp.scrap * SAFEZONE_SCRAP_MULT : comp.scrap;
    totals.Scrap.amount += scrap * count;
    if (comp.hqm) totals['High Quality Metal'].amount += comp.hqm * count;
    if (comp.frags) totals['Metal Fragments'].amount += comp.frags * count;
    if (comp.cloth) totals.Cloth.amount += comp.cloth * count;
    if (comp.techparts) totals['Tech Trash'].amount += comp.techparts * count;
  }
  const mult = multiplier > 0 ? multiplier : 1;
  return Object.entries(totals)
    .map(([item, v]) => ({ item, icon: v.icon, amount: Math.floor(v.amount * mult) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}
