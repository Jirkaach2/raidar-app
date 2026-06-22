/**
 * Crafting data + recursive material rollup.
 *
 * Recipes are a curated, verified snapshot focused on the resource/explosive
 * economy plus common base staples. Amounts and research-table scrap costs are
 * the long-stable community values; Facepunch can tweak recipes between updates,
 * so this is dated and easy to extend (just add to RECIPES).
 *
 * Each ingredient amount is "per `output` produced".
 */

export type Workbench = 0 | 1 | 2 | 3;

export interface Recipe {
  name: string;
  category: string;
  ingredients: Record<string, number>;
  output: number;
  workbench: Workbench;
  researchScrap?: number; // research-table scrap cost for the blueprint
}

// Raw / non-craftable resources & components (tree leaves) and their display names.
export const LEAVES: Record<string, string> = {
  wood: 'Wood',
  stone: 'Stone',
  'metal.fragments': 'Metal Fragments',
  'metal.refined': 'High Quality Metal',
  sulfur: 'Sulfur',
  charcoal: 'Charcoal',
  cloth: 'Cloth',
  leather: 'Leather',
  'fat.animal': 'Animal Fat',
  scrap: 'Scrap',
  'crude.oil': 'Crude Oil',
  techparts: 'Tech Trash',
  gears: 'Gears',
  tarp: 'Tarp',
  rope: 'Rope',
  metalpipe: 'Metal Pipe',
  metalblade: 'Metal Blade',
  sheetmetal: 'Sheet Metal',
  roadsigns: 'Road Signs',
  springs: 'Springs',
  riflebody: 'Rifle Body',
  semibody: 'Semi Automatic Body',
  smgbody: 'SMG Body',
};

export const RECIPES: Record<string, Recipe> = {
  // ── Resources / intermediates ──
  gunpowder: {
    name: 'Gun Powder', category: 'Resources', output: 10, workbench: 1,
    ingredients: { charcoal: 30, sulfur: 20 },
  },
  lowgradefuel: {
    name: 'Low Grade Fuel', category: 'Resources', output: 4, workbench: 0,
    ingredients: { 'fat.animal': 3, cloth: 1 },
  },
  explosives: {
    name: 'Explosives', category: 'Resources', output: 1, workbench: 3, researchScrap: 500,
    ingredients: { gunpowder: 50, sulfur: 10, 'metal.fragments': 10, lowgradefuel: 3 },
  },

  // ── Raiding ──
  'grenade.beancan': {
    name: 'Beancan Grenade', category: 'Explosives', output: 1, workbench: 1, researchScrap: 20,
    ingredients: { gunpowder: 60, 'metal.fragments': 20 },
  },
  'explosive.satchel': {
    name: 'Satchel Charge', category: 'Explosives', output: 1, workbench: 1, researchScrap: 75,
    ingredients: { 'grenade.beancan': 4, rope: 1, cloth: 10 },
  },
  'explosive.timed': {
    name: 'Timed Explosive Charge (C4)', category: 'Explosives', output: 1, workbench: 3, researchScrap: 500,
    ingredients: { explosives: 20, cloth: 5, techparts: 2 },
  },
  'ammo.rocket.basic': {
    name: 'Rocket', category: 'Explosives', output: 1, workbench: 3, researchScrap: 125,
    ingredients: { gunpowder: 150, explosives: 2, 'metal.fragments': 10, metalpipe: 1 },
  },

  // ── Medical ──
  bandage: {
    name: 'Bandage', category: 'Medical', output: 1, workbench: 0,
    ingredients: { cloth: 4 },
  },

  // ── Base & building staples ──
  'cupboard.tool': {
    name: 'Tool Cupboard', category: 'Building', output: 1, workbench: 0,
    ingredients: { wood: 1000 },
  },
  'sleeping.bag': {
    name: 'Sleeping Bag', category: 'Building', output: 1, workbench: 0,
    ingredients: { cloth: 30 },
  },
  'box.wooden.large': {
    name: 'Large Wood Box', category: 'Building', output: 1, workbench: 0,
    ingredients: { wood: 250 },
  },
  'wall.external.high': {
    name: 'High External Wooden Wall', category: 'Building', output: 1, workbench: 0,
    ingredients: { wood: 1000 },
  },
  'wall.external.high.stone': {
    name: 'High External Stone Wall', category: 'Building', output: 1, workbench: 0,
    ingredients: { stone: 1500 },
  },
  workbench1: {
    name: 'Workbench Level 1', category: 'Building', output: 1, workbench: 0,
    ingredients: { wood: 500, 'metal.fragments': 100, scrap: 25 },
  },
};

/** rusthelp CDN icon for a shortname. */
export function craftIcon(short: string, size = 128): string {
  return `https://cdn.rusthelp.com/images/${size}/${short.replace(/[._]/g, '-')}.webp`;
}

/** Pretty display name for any short (recipe, leaf, or slugified fallback). */
export function craftName(short: string): string {
  if (RECIPES[short]) return RECIPES[short].name;
  if (LEAVES[short]) return LEAVES[short];
  return short.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface Rollup {
  short: string;
  qty: number;
  batches: number;
  workbench: Workbench;
  researchScrap?: number;
  direct: { short: string; qty: number }[];   // immediate ingredients
  raw: { short: string; qty: number }[];       // fully expanded raw materials
  subCrafts: { short: string; qty: number }[]; // intermediate items to craft first
}

const WB_LABEL = ['Hand / no bench', 'Workbench 1', 'Workbench 2', 'Workbench 3'];
export const workbenchLabel = (wb: Workbench) => WB_LABEL[wb];

export function rollup(short: string, qty: number): Rollup | null {
  const target = RECIPES[short];
  if (!target) return null;

  const raw: Record<string, number> = {};
  const subCrafts: Record<string, number> = {};
  let maxWB: Workbench = target.workbench;

  const walk = (s: string, need: number) => {
    const r = RECIPES[s];
    if (!r) { raw[s] = (raw[s] || 0) + need; return; }
    if (r.workbench > maxWB) maxWB = r.workbench;
    const batches = Math.ceil(need / r.output);
    subCrafts[s] = (subCrafts[s] || 0) + batches * r.output;
    for (const [ing, q] of Object.entries(r.ingredients)) walk(ing, q * batches);
  };

  const batches = Math.max(1, Math.ceil(qty / target.output));
  const direct = Object.entries(target.ingredients).map(([s, q]) => ({ short: s, qty: q * batches }));
  for (const { short: s, qty: q } of direct) walk(s, q);

  const sort = (o: Record<string, number>) =>
    Object.entries(o).map(([short, qty]) => ({ short, qty })).sort((a, b) => b.qty - a.qty);

  return {
    short, qty, batches, workbench: maxWB, researchScrap: target.researchScrap,
    direct: direct.sort((a, b) => b.qty - a.qty),
    raw: sort(raw),
    subCrafts: sort(subCrafts),
  };
}

/** All craftable items, for the picker & command palette. */
export function craftableList(): { short: string; name: string; category: string }[] {
  return Object.entries(RECIPES)
    .map(([short, r]) => ({ short, name: r.name, category: r.category }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
