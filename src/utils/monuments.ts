/**
 * Monument knowledge base.
 *
 * Monument images are bundled locally in /public/images/monuments.
 *
 * Keycard chain (current):
 *   GREEN card -> tier-1 puzzle rooms (contain a BLUE card)
 *   BLUE card  -> tier-2 puzzle rooms (contain a RED card)
 *   RED card   -> tier-3 rooms (best loot)
 *
 * Elite Crates ONLY spawn at Tier-3 monuments (Launch Site, Military Tunnel,
 * Oil Rigs, Missile Silo) — tier-2 monuments get Military crates, not Elite.
 */

export type CardType = 'green' | 'blue' | 'red';

/** An item shown in a puzzle (with optional CDN icon slug + quantity/chance). */
export interface PuzzleItem {
  name: string;
  icon?: string;   // rusthelp CDN slug, e.g. "keycard-green"
  qty?: string;    // e.g. "x1", "x2-3", "50%"
}

/** A crate spawn at a monument: which loot table, how many, and notes. */
export interface CrateSpawn {
  loot: string;     // loot table id from loot.ts (military/elite/basic/locked)
  label: string;    // display name e.g. "Elite Crate"
  count: string;    // e.g. "3", "4-6"
}

/** A scientist type guarding the monument. */
export interface ScientistSpawn {
  loot: string;     // 'scientist' | 'heavy_scientist'
  label: string;    // e.g. "Heavy Scientist", "Launch Site Scientist"
  count: number;
}

/** A puzzle: items to bring/activate, full rewards, reset time. */
export interface PuzzleStep {
  bring: PuzzleItem[];
  activate?: PuzzleItem[];
  rewards: PuzzleItem[];
  resetTime?: string;
}

/** CDN icon URL for a puzzle item slug. */
export function getItemIcon(slug: string): string {
  return `https://cdn.rusthelp.com/images/256/${slug}.webp`;
}

// Shorthand item builders for puzzle data.
const GREEN: PuzzleItem = { name: 'Green Keycard', icon: 'keycard-green' };
const BLUE: PuzzleItem = { name: 'Blue Keycard', icon: 'keycard-blue' };
const RED: PuzzleItem = { name: 'Red Keycard', icon: 'keycard-red' };
const FUSE: PuzzleItem = { name: 'Electric Fuse', icon: 'fuse' };
const BASIC_BP = (qty: string): PuzzleItem => ({ name: 'Basic Blueprint Fragment', icon: 'basicblueprintfragment', qty });
const ADV_BP = (qty: string): PuzzleItem => ({ name: 'Advanced Blueprint Fragment', icon: 'advancedblueprintfragment', qty });
const DIESEL = (qty: string): PuzzleItem => ({ name: 'Diesel Fuel', icon: 'diesel-barrel', qty });
const ELITE = (qty: string): PuzzleItem => ({ name: 'Elite Crate', icon: 'radtown-crate-elite', qty });
const MIL = (qty: string): PuzzleItem => ({ name: 'Military Crate', icon: 'radtown-crate-normal', qty });
const NORMAL = (qty: string): PuzzleItem => ({ name: 'Normal Crate', icon: 'radtown-crate-normal-2', qty });
const LOCKED = (qty: string): PuzzleItem => ({ name: 'Locked Crate', icon: 'locked-crate', qty });
const SNOWMOBILE: PuzzleItem = { name: 'Snowmobile', icon: 'snowmobile' };

export interface MonumentInfo {
  key: string;
  name: string;
  imageSlug: string;
  type: string;
  tier: string;
  safezone: boolean;
  radiation: 'none' | 'low' | 'medium' | 'high';
  radMedian?: number;   // median radiation level
  radMax?: number;      // max radiation level
  recyclers: number;
  barrels?: number;
  crateCount?: number;  // total crate count reported by rusthelp
  crates: CrateSpawn[];
  scientists: ScientistSpawn[];
  hasTunnelEntrance: boolean;
  hasChinookDropZone: boolean;
  allowsHeliCrash: boolean;
  requiresCards: CardType[];   // can need multiple cards
  optionalCards?: CardType[];  // cards that help but aren't mandatory
  givesCards: CardType[];      // can give multiple cards
  puzzles: PuzzleStep[];
  mining?: { fuel: string; runTime?: string; outputs: string[] };
  bradley?: { destroy: string; drops: string; loot: string[] };
  notes: string[];
}

export function normalizeMonumentKey(token: string): string {
  let name = (token || '').split('/').pop() || token || '';
  name = name.toLowerCase();
  if (name.endsWith('.prefab')) name = name.slice(0, -7);
  if (name.endsWith('_display_name')) name = name.slice(0, -13);
  return name;
}

export function isCaveMonument(token: string): boolean {
  const k = normalizeMonumentKey(token);
  return k.includes('cave') || k.includes('sinkhole');
}

/** True if the token is a Water Well monument (hosts the Water Well Shopkeeper). */
export function isWaterWellMonument(token: string): boolean {
  const k = normalizeMonumentKey(token);
  return k.includes('water_well') || k.includes('waterwell');
}

export function getCaveSize(token: string): number {
  const k = normalizeMonumentKey(token);
  if (k.includes('large')) return 1.0;
  if (k.includes('medium')) return 0.75;
  if (k.includes('small')) return 0.6;
  return 0.7;
}

export function isHiddenMonument(token: string): boolean {
  const key = normalizeMonumentKey(token);
  const hidden = [
    'monument_marker', 'monumentmarker',
    'module_900x900', '2way_moonpool', 'twoway_moonpool', 'moonpool',
    'dungeonbase', 'dungeon_base',
    'power_sub_small', 'power_sub_big', 'powersubstation',
    'train_tunnel_link',
  ];
  if (hidden.includes(key)) return true;
  if (key.includes('moonpool')) return true;
  if (key.includes('module_')) return true;
  if (key.includes('substation')) return true;
  if (key.includes('monument_marker') || key === 'marker') return true;
  if (/^\d+x\d+$/.test(key)) return true;
  return false;
}

export function getMonumentName(token: string): string {
  const info = getMonumentInfo(token);
  if (info) return info.name;
  const key = normalizeMonumentKey(token);
  const dictionary: Record<string, string> = {
    train_tunnel: 'TRAIN TUNNEL',
    fishing_village_a: 'FISHING VILLAGE',
    fishing_village_b: 'FISHING VILLAGE',
    fishing_village_c: 'FISHING VILLAGE',
    large_fishing_village: 'LARGE FISHING VILLAGE',
    swamp_a: 'SWAMP', swamp_b: 'SWAMP', swamp_c: 'SWAMP',
  };
  if (dictionary[key]) return dictionary[key];
  return key.replace(/_/g, ' ').replace(/\b[abcde]$/i, '').replace(/\b\d+\b/g, '').trim().toUpperCase();
}

/**
 * Local monument images (bundled in /public/images/monuments). Keyed by the
 * canonical monument key. Monuments without a local image return null.
 */
const LOCAL_MONUMENT_IMAGES: Record<string, string> = {
  abandoned_military_base: '/images/monuments/abandoned_military_base.webp',
  airfield: '/images/monuments/airfield.jpg',
  arctic_research_base: '/images/monuments/arctic_research_base.jpg',
  dome: '/images/monuments/dome.jpg',
  fishing_village: '/images/monuments/fishing_village.webp',
  large_fishing_village: '/images/monuments/large_fishing_village.webp',
  gas_station: '/images/monuments/gas_station.webp',
  launch_site: '/images/monuments/launch_site.jpg',
  military_tunnel: '/images/monuments/military_tunnel.jpg',
  missile_silo: '/images/monuments/missile_silo.jpg',
  oil_rig_large: '/images/monuments/oil_rig_large.webp',
  oil_rig_small: '/images/monuments/oil_rig_small.webp',
  outpost: '/images/monuments/outpost.webp',
  power_plant: '/images/monuments/power_plant.webp',
  radtown: '/images/monuments/radtown.jpg',
  supermarket: '/images/monuments/supermarket.jfif',
  train_yard: '/images/monuments/train_yard.webp',
  underwater_lab: '/images/monuments/underwater_lab.jfif',
  water_treatment: '/images/monuments/water_treatment.jpg',
  giant_excavator: '/images/monuments/giant_excavator.webp',
  jungle_ziggurat: '/images/monuments/jungle_ziggurat.jfif',
  junkyard: '/images/monuments/junkyard.jpg',
  lighthouse: '/images/monuments/lighthouse.jpg',
  mining_outpost: '/images/monuments/mining_outpost.jpg',
  satellite_dish: '/images/monuments/satellite_dish.jpg',
  sewer_branch: '/images/monuments/sewer_branch.jpg',
  // All mining quarries share the sulfur-quarry image (Giant Excavator is
  // handled separately above — it's its own monument).
  sulfur_quarry: '/images/monuments/sulfur_quarry.webp',
  stone_quarry: '/images/monuments/sulfur_quarry.webp',
  hqm_quarry: '/images/monuments/sulfur_quarry.webp',
  swamp: '/images/monuments/swamp.jfif',
  ferry_terminal: '/images/monuments/ferry_terminal.jpg',
  harbor: '/images/monuments/harbor.jpg',
};

export function getMonumentImageUrl(token: string): string | null {
  const info = getMonumentInfo(token);
  const key = info?.key ?? normalizeMonumentKey(token);
  return LOCAL_MONUMENT_IMAGES[key] ?? null;
}

const MONUMENT_DB: Record<string, MonumentInfo> = {
  launch_site: {
    key: 'launch_site', name: 'LAUNCH SITE', imageSlug: 'launch-site',
    type: 'Large', tier: '3', safezone: false, radiation: 'high', radMedian: 11, radMax: 52,
    recyclers: 1, barrels: 64, crateCount: 77,
    crates: [
      { loot: 'elite', label: 'Elite Crate', count: '3 (puzzle) + roams' },
      { loot: 'military', label: 'Military Crate', count: '~18' },
    ],
    scientists: [{ loot: 'scientist', label: 'Launch Site Scientist', count: 8 }],
    hasTunnelEntrance: true, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['green', 'blue', 'red'], givesCards: [],
    puzzles: [
      {
        bring: [GREEN, FUSE, RED],
        rewards: [
          { name: 'Launch Site Scientist', qty: 'x8' },
          ADV_BP('x2'), ELITE('x3'), MIL('50%'), NORMAL('50%'),
        ],
        resetTime: '~30m',
      },
    ],
    bradley: {
      destroy: '7 High Velocity Rockets, or 2 C4',
      drops: '3× APC Crate (on fire — wait to loot)',
      loot: ['High-tier weapons & components', 'M249 (rare)', 'Tech trash, HQM, rockets'],
    },
    notes: [
      'Largest, most rewarding monument. Bradley APC patrols the runway.',
      'Full hazmat required (radiation peaks 52).',
    ],
  },
  military_tunnel: {
    key: 'military_tunnel', name: 'MILITARY TUNNEL', imageSlug: 'military-tunnel',
    type: 'Large', tier: '3', safezone: false, radiation: 'medium', radMedian: 11, radMax: 26,
    recyclers: 1, barrels: 14, crateCount: 18,
    crates: [
      { loot: 'elite', label: 'Elite Crate', count: '2-3 (puzzle room)' },
      { loot: 'military', label: 'Military Crate', count: '~5' },
    ],
    scientists: [{ loot: 'heavy_scientist', label: 'Military Tunnel Scientist', count: 33 }],
    hasTunnelEntrance: true, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['green', 'blue', 'red'], givesCards: [],
    puzzles: [
      {
        bring: [FUSE, GREEN, BLUE, RED],
        rewards: [
          { name: 'Military Tunnel Scientist' },
          ADV_BP('x1'), DIESEL('x1'), ELITE('x1'), MIL('50%'), NORMAL('50%'),
        ],
        resetTime: '~30m',
      },
    ],
    notes: [
      'Needs all three keycards. Extremely heavily defended — 33 scientists with LR-300/MP5/SPAS-12.',
      'Tightest CQC monument; bring meds and armor.',
    ],
  },
  power_plant: {
    key: 'power_plant', name: 'POWER PLANT', imageSlug: 'powerplant',
    type: 'Large', tier: '2', safezone: false, radiation: 'medium', radMedian: 0, radMax: 52,
    recyclers: 3, barrels: 15, crateCount: 27,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~9' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [{ loot: 'scientist', label: 'Scientist', count: 8 }],
    hasTunnelEntrance: true, hasChinookDropZone: true, allowsHeliCrash: true,
    requiresCards: ['green', 'blue'], givesCards: ['red'],
    puzzles: [
      {
        bring: [GREEN, FUSE, BLUE],
        rewards: [RED, BASIC_BP('x1'), DIESEL('x1'), NORMAL('60%'), MIL('40%'), { name: 'Loot Barrels', qty: 'x60/40' }],
        resetTime: '~30m',
      },
    ],
    notes: ['3 recyclers on site. Green→Blue→Red sequence yields a Red Keycard. Radiation peaks 52 in the puzzle.'],
  },
  water_treatment: {
    key: 'water_treatment', name: 'WATER TREATMENT PLANT', imageSlug: 'water-treatment-plant',
    type: 'Large', tier: '2', safezone: false, radiation: 'medium', radMedian: 0, radMax: 26,
    recyclers: 1, barrels: 13, crateCount: 30,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~5' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [{ loot: 'scientist', label: 'Scientist', count: 8 }],
    hasTunnelEntrance: true, hasChinookDropZone: true, allowsHeliCrash: true,
    requiresCards: ['blue'], givesCards: ['red'],
    puzzles: [
      {
        bring: [FUSE, BLUE],
        rewards: [RED, BASIC_BP('x1'), DIESEL('x1'), NORMAL('80%'), MIL('20%')],
        resetTime: '~30m',
      },
    ],
    notes: ['Large open layout — very exposed to snipers. Blue puzzle yields a Red Keycard. Chinook drop zone.'],
  },
  train_yard: {
    key: 'train_yard', name: 'TRAIN YARD', imageSlug: 'trainyard',
    type: 'Large', tier: '2', safezone: false, radiation: 'medium', radMedian: 11, radMax: 26,
    recyclers: 1, barrels: 15, crateCount: 30,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~12' }, { loot: 'basic', label: 'Wagon/Basic Crate', count: 'several' }],
    scientists: [{ loot: 'scientist', label: 'Scientist', count: 4 }],
    hasTunnelEntrance: true, hasChinookDropZone: true, allowsHeliCrash: true,
    requiresCards: ['green', 'blue'], givesCards: ['red'],
    puzzles: [
      {
        bring: [FUSE, BLUE],
        rewards: [RED, BASIC_BP('x1'), NORMAL('50%'), MIL('50%')],
        resetTime: '~30m',
      },
      {
        bring: [FUSE, GREEN],
        rewards: [BASIC_BP('x1'), NORMAL('50%'), MIL('50%'), { name: 'Loot Barrels', qty: 'x60/40' }],
        resetTime: '~0m',
      },
    ],
    notes: ['Has both a green and a blue puzzle. Recycler at the base of the tower. Wagons loot via the coaling tower.'],
  },
  airfield: {
    key: 'airfield', name: 'AIRFIELD', imageSlug: 'airfield',
    type: 'Large', tier: '2', safezone: false, radiation: 'medium', radMedian: 11, radMax: 11,
    recyclers: 2, barrels: 11, crateCount: 29,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~10' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [{ loot: 'scientist', label: 'Airfield Scientist', count: 3 }],
    hasTunnelEntrance: true, hasChinookDropZone: true, allowsHeliCrash: true,
    requiresCards: ['green', 'blue'], givesCards: ['red'],
    puzzles: [
      {
        bring: [FUSE, GREEN, BLUE],
        rewards: [
          { name: 'Airfield Scientist' }, RED, BASIC_BP('x1'), DIESEL('x1'),
          NORMAL('50%'), MIL('50%'), { name: 'Loot Barrels', qty: 'x' },
        ],
        resetTime: '~30m',
      },
    ],
    notes: ['Green→Blue sequence yields a Red Keycard. 2 recyclers, CCTV cameras. Military crates across the hangars.'],
  },
  dome: {
    key: 'dome', name: 'THE DOME', imageSlug: 'sphere-tank',
    type: 'Medium', tier: '2', safezone: false, radiation: 'low', radMedian: 0, radMax: 11,
    recyclers: 1, barrels: 20, crateCount: 15,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~4' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: true, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Spiral climb to the top crates — no keycard puzzle. Recycler on site, low radiation. CCTV cameras.'],
  },
  radtown: {
    key: 'radtown', name: 'RADTOWN', imageSlug: 'radtown',
    type: 'Roadside', tier: '1/2/3', safezone: false, radiation: 'medium', radMedian: 0, radMax: 26,
    recyclers: 1, barrels: 15, crateCount: 29,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~2' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['green'], givesCards: ['blue'],
    puzzles: [
      {
        bring: [FUSE, GREEN],
        rewards: [BLUE, BASIC_BP('x1'), MIL('x')],
        resetTime: '~30m',
      },
    ],
    notes: ['Reworked rad town with strong mid-tier loot. Green puzzle yields a Blue Keycard. Recycler on site.'],
  },
  sewer_branch: {
    key: 'sewer_branch', name: 'SEWER BRANCH', imageSlug: 'sewer-branch',
    type: 'Medium', tier: '1', safezone: false, radiation: 'low', radMedian: 3, radMax: 11,
    recyclers: 2, barrels: 4, crateCount: 20,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~3' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['green'], givesCards: ['blue'],
    puzzles: [
      { bring: [FUSE, GREEN], rewards: [BLUE, BASIC_BP('x1'), NORMAL('50%'), MIL('50%')], resetTime: '~30m' },
    ],
    notes: ['2 recyclers — efficient component runs. Green puzzle yields a Blue Keycard. Low radiation.'],
  },
  satellite_dish: {
    key: 'satellite_dish', name: 'SATELLITE DISH', imageSlug: 'satellite-dish',
    type: 'Small', tier: '1', safezone: false, radiation: 'low', radMedian: 3, radMax: 11,
    recyclers: 1, barrels: 18, crateCount: 9,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~2' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['green'], givesCards: ['blue'],
    puzzles: [
      { bring: [FUSE, GREEN], rewards: [BLUE, BASIC_BP('x1'), NORMAL('x')], resetTime: '~30m' },
    ],
    notes: ['Open field — watch for snipers. Green puzzle yields a Blue Keycard.'],
  },
  harbor: {
    key: 'harbor', name: 'HARBOR', imageSlug: 'harbor-large',
    type: 'Oceanside', tier: '1', safezone: false, radiation: 'none',
    recyclers: 1, barrels: 45, crateCount: 11,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~2' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [],
    hasTunnelEntrance: true, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['green'], givesCards: ['blue'],
    puzzles: [
      { bring: [FUSE, GREEN], rewards: [BLUE, BASIC_BP('x1'), NORMAL('x')], resetTime: '~30m' },
    ],
    notes: ['Lots of barrels (45) for scrap/components. Green puzzle yields a Blue Keycard. No radiation.'],
  },
  supermarket: {
    key: 'supermarket', name: 'ABANDONED SUPERMARKET', imageSlug: 'supermarket',
    type: 'Roadside', tier: '1', safezone: false, radiation: 'none',
    recyclers: 1, barrels: 3, crateCount: 13,
    crates: [{ loot: 'basic', label: 'Basic / Food Crate', count: '~13' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: [], givesCards: ['green'],
    puzzles: [],
    notes: ['Safe early stop — recycler, food crates, no radiation. A free Green Keycard spawns on the back-office desk. No puzzle.'],
  },
  gas_station: {
    key: 'gas_station', name: "OXUM'S GAS STATION", imageSlug: 'gas-station',
    type: 'Roadside', tier: '1', safezone: false, radiation: 'none',
    recyclers: 1, crateCount: 16,
    crates: [{ loot: 'basic', label: 'Basic Crate', count: '~16' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: [], givesCards: ['green'],
    puzzles: [],
    notes: ['Recycler + crates. A free Green Keycard spawns on the office desk (respawns ~30m). No puzzle.'],
  },
  mining_outpost: {
    key: 'mining_outpost', name: 'MINING OUTPOST', imageSlug: 'warehouse',
    type: 'Roadside', tier: '1', safezone: false, radiation: 'none',
    recyclers: 1, crateCount: 8,
    crates: [{ loot: 'basic', label: 'Basic Crate', count: '~8' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Recycler, large furnace for smelting, vending machines. No radiation.'],
  },
  junkyard: {
    key: 'junkyard', name: 'JUNKYARD', imageSlug: 'junkyard',
    type: 'Small', tier: '1', safezone: false, radiation: 'none',
    recyclers: 1, barrels: 10, crateCount: 20,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~1-2' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Magnet crane crushes cars into scrap; Scrappy gives components. No radiation.'],
  },
  lighthouse: {
    key: 'lighthouse', name: 'LIGHTHOUSE', imageSlug: 'lighthouse',
    type: 'Oceanside', tier: '1', safezone: false, radiation: 'none',
    recyclers: 1, barrels: 10, crateCount: 10,
    crates: [{ loot: 'basic', label: 'Basic Crate', count: '~10' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: ['green'],
    puzzles: [],
    notes: ['Recycler at the base. A free Green Keycard spawns inside the tower (respawns ~30m). Low-tier but safe, no radiation. No puzzle.'],
  },
  arctic_research_base: {
    key: 'arctic_research_base', name: 'ARCTIC RESEARCH BASE', imageSlug: 'arctic-research-base',
    type: 'Medium', tier: '2', safezone: false, radiation: 'low', radMedian: 3, radMax: 11,
    recyclers: 1, barrels: 24, crateCount: 23,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~2' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [{ loot: 'scientist', label: 'Scientist', count: 10 }],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['blue'], optionalCards: ['red'], givesCards: ['red'],
    puzzles: [
      {
        bring: [BLUE],
        rewards: [RED, BASIC_BP('x1'), MIL('50%'), NORMAL('50%')],
        resetTime: '~30m',
      },
      {
        bring: [BLUE],
        rewards: [SNOWMOBILE],
        resetTime: '~0m',
      },
    ],
    notes: ['Snow biome — bring cold protection. No fuse needed. Blue puzzle yields a Red Keycard; garage gives a snowmobile.'],
  },
  abandoned_military_base: {
    key: 'abandoned_military_base', name: 'ABANDONED MILITARY BASE', imageSlug: 'desert-military-base',
    type: 'Medium', tier: '1/2/3', safezone: false, radiation: 'none',
    recyclers: 0, barrels: 4, crateCount: 9,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~2' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [{ loot: 'scientist', label: 'Military Base Scientist (LR-300/MP5)', count: 7 }],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: [
      'Randomized layout — exact numbers vary per spawn.',
      'No recycler. Guarded by scientists; an MLRS/APC turret defends some layouts.',
      'No keycard puzzle — loot is gated by the scientist defenders.',
    ],
  },
  giant_excavator: {
    key: 'giant_excavator', name: 'GIANT EXCAVATOR PIT', imageSlug: 'excavator',
    type: 'Large', tier: '1/2/3', safezone: false, radiation: 'low', radMedian: 11, radMax: 11,
    recyclers: 1, crateCount: 18,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~1' }, { loot: 'basic', label: 'Basic / Food Crate', count: 'several' }],
    scientists: [{ loot: 'scientist', label: 'Excavator Scientist', count: 18 }],
    hasTunnelEntrance: true, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: [], givesCards: [],
    puzzles: [],
    mining: {
      fuel: 'Diesel (1 Diesel = 2 minutes)',
      runTime: 'Requires 5+ Diesel to request a supply drop',
      outputs: [
        'Stones: 10,000 per 1 Diesel',
        'Metal Fragments: 5,000 per 1 Diesel',
        'Sulfur Ore: 2,000 per 1 Diesel',
        'High Quality Metal Ore: 100 per 1 Diesel'
      ],
    },
    notes: ['No keycard puzzle. Pick an output and feed Diesel to run it. Guarded by 18 scientists.'],
  },
  oil_rig_small: {
    key: 'oil_rig_small', name: 'OIL RIG', imageSlug: 'oilrig-small',
    type: 'Offshore', tier: '3', safezone: false, radiation: 'none',
    recyclers: 0, barrels: 15, crateCount: 25,
    crates: [
      { loot: 'locked', label: 'Locked Crate', count: '1 (card-triggered)' },
      { loot: 'elite', label: 'Elite Crate', count: '~1' },
      { loot: 'military', label: 'Military Crate', count: '~5' },
    ],
    scientists: [
      { loot: 'heavy_scientist', label: 'Heavy M249 Scientist', count: 2 },
      { loot: 'heavy_scientist', label: 'Heavy Spas-12 Scientist', count: 2 },
      { loot: 'heavy_scientist', label: 'Heavy Minigun Scientist', count: 1 },
    ],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: ['blue', 'red'], optionalCards: ['green'], givesCards: [],
    puzzles: [
      {
        bring: [BLUE, RED],
        rewards: [
          { name: 'Heavy Scientists', qty: 'x5' }, LOCKED('x1'), ELITE('x1'), MIL('x'),
        ],
        resetTime: '~65m',
      },
      {
        bring: [GREEN],
        rewards: [NORMAL('60%'), MIL('40%')],
        resetTime: '~65m',
      },
    ],
    notes: ['Blue + Red mandatory (Green optional for extra rooms). Heavy Scientists guard the decks. Recycler on the rig.'],
  },
  oil_rig_large: {
    key: 'oil_rig_large', name: 'LARGE OIL RIG', imageSlug: 'oilrig-large',
    type: 'Offshore', tier: '3', safezone: false, radiation: 'none',
    recyclers: 0, barrels: 33, crateCount: 26,
    crates: [
      { loot: 'locked', label: 'Locked Crate', count: '1 (card-triggered)' },
      { loot: 'elite', label: 'Elite Crate', count: '~2' },
      { loot: 'military', label: 'Military Crate', count: '~8' },
    ],
    scientists: [
      { loot: 'heavy_scientist', label: 'Heavy M249 Scientist', count: 3 },
      { loot: 'heavy_scientist', label: 'Heavy Spas-12 Scientist', count: 2 },
      { loot: 'heavy_scientist', label: 'Heavy Minigun Scientist', count: 1 },
      { loot: 'heavy_scientist', label: 'Heavy Flamethrower Scientist', count: 1 },
    ],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: ['blue', 'red'], optionalCards: ['green'], givesCards: [],
    puzzles: [
      {
        bring: [RED],
        rewards: [{ name: 'Heavy Scientists', qty: 'x7' }, LOCKED('x1'), ELITE('x1'), MIL('x')],
        resetTime: '~65m',
      },
      { bring: [BLUE], rewards: [MIL('x')], resetTime: '~65m' },
      { bring: [GREEN], rewards: [NORMAL('x'), GREEN], resetTime: '~65m' },
    ],
    notes: ['Red + Blue mandatory (Green optional). The hardest monument — 27 Heavy Scientists across multiple decks.'],
  },
  missile_silo: {
    key: 'missile_silo', name: 'MISSILE SILO', imageSlug: 'nuclear-missile-silo',
    type: 'Medium', tier: '2/3', safezone: false, radiation: 'high', radMedian: 26, radMax: 81,
    recyclers: 0, crateCount: 35,
    crates: [
      { loot: 'elite', label: 'Elite Crate', count: 'in silo' },
      { loot: 'military', label: 'Military Crate', count: '~17' },
    ],
    scientists: [{ loot: 'scientist', label: 'Missile Silo Inside Scientist', count: 27 }],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['red'], givesCards: [],
    puzzles: [
      {
        bring: [RED],
        rewards: [
          { name: 'Missile Silo Scientist' }, ADV_BP('x1'), ELITE('x1'),
          MIL('80%'), NORMAL('20%'), DIESEL('x1'),
        ],
        resetTime: '~30m',
      },
    ],
    notes: ['Red card only. Very high radiation (peaks 81) — strong hazmat required. Diesel barrels on the flatbed truck.'],
  },
  underwater_lab: {
    key: 'underwater_lab', name: 'UNDERWATER LAB', imageSlug: 'underwater-lab',
    type: 'Offshore', tier: '2', safezone: false, radiation: 'none', radMedian: 0, radMax: 52,
    recyclers: 0, barrels: 2, crateCount: 25,
    crates: [{ loot: 'military', label: 'Military Crate', count: 'several' }, { loot: 'basic', label: 'Tech/Basic Crate', count: 'several' }],
    scientists: [{ loot: 'scientist', label: 'Scientist', count: 4 }],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: ['green', 'blue'], optionalCards: ['red'], givesCards: [],
    puzzles: [
      {
        bring: [RED, FUSE],
        rewards: [ADV_BP('x1'), ELITE('x1'), { name: 'Lab crates (components/ammo/tools)' }],
        resetTime: '~30m',
      },
      {
        bring: [BLUE, GREEN, FUSE],
        rewards: [BASIC_BP('x1'), GREEN, { name: 'Lab crates (components/tools/fuel)' }],
        resetTime: '~30m',
      },
      {
        bring: [GREEN],
        rewards: [{ name: 'Lab Normal Crates', qty: 'x2' }],
        resetTime: '~30m',
      },
    ],
    notes: ['Green + Blue mandatory (Red optional for the top room). Randomized layout reached by submarine. No recycler.'],
  },
  outpost: {
    key: 'outpost', name: 'OUTPOST', imageSlug: 'compound',
    type: 'Safe Zone', tier: '0', safezone: true, radiation: 'none',
    recyclers: 3, crates: [], scientists: [],
    hasTunnelEntrance: true, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Safe zone — shops, research bench, drone marketplace, 3 recyclers.', 'Blue cards purchasable for 100 scrap. No combat/building.'],
  },
  bandit_camp: {
    key: 'bandit_camp', name: 'BANDIT CAMP', imageSlug: 'bandit-town',
    type: 'Safe Zone', tier: '0', safezone: true, radiation: 'none',
    recyclers: 2, crates: [], scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Safe zone — vendors, casino, mission givers, drone marketplace. 2 recyclers.'],
  },
  ferry_terminal: {
    key: 'ferry_terminal', name: 'FERRY TERMINAL', imageSlug: 'ferry-terminal',
    type: 'Oceanside', tier: '1/2', safezone: false, radiation: 'none',
    recyclers: 1, barrels: 32, crateCount: 11,
    crates: [{ loot: 'military', label: 'Military Crate', count: '~1' }, { loot: 'basic', label: 'Basic Crate', count: 'several' }],
    scientists: [],
    hasTunnelEntrance: true, hasChinookDropZone: false, allowsHeliCrash: true,
    requiresCards: ['green'], givesCards: ['blue'],
    puzzles: [
      { bring: [FUSE, GREEN], rewards: [BLUE, BASIC_BP('x1'), NORMAL('x')], resetTime: '~30m' },
    ],
    notes: ['Coastal monument — green puzzle yields a Blue Keycard. 32 barrels, tunnel entrance on site.'],
  },
  jungle_ziggurat: {
    key: 'jungle_ziggurat', name: 'JUNGLE ZIGGURAT', imageSlug: 'jungle-ziggurat',
    type: 'Small', tier: '1/2/3', safezone: false, radiation: 'none',
    recyclers: 1, barrels: 6, crateCount: 8,
    crates: [{ loot: 'basic', label: 'Basic Crate', count: '~8' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Jungle biome temple monument. Recycler on site, no radiation. No keycard puzzle.'],
  },
  stone_quarry: {
    key: 'stone_quarry', name: 'STONE QUARRY', imageSlug: 'mining-quarry-stone',
    type: 'Mining', tier: '1', safezone: false, radiation: 'none',
    recyclers: 0, crates: [], scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    mining: { fuel: 'Low Grade Fuel', runTime: '~2m 10s per fuel', outputs: ['~5,000 Stone per fuel', '~1,000 Metal Ore per fuel'] },
    notes: ['Feed Low Grade Fuel to run; outputs Stone + some Metal Ore. No NPCs or crates.'],
  },
  sulfur_quarry: {
    key: 'sulfur_quarry', name: 'SULFUR QUARRY', imageSlug: 'mining-quarry-sulfur',
    type: 'Mining', tier: '1', safezone: false, radiation: 'none',
    recyclers: 0, crates: [], scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    mining: { fuel: 'Low Grade Fuel', runTime: '~2m 10s per fuel', outputs: ['~1,000 Sulfur Ore per fuel'] },
    notes: ['Feed Low Grade Fuel to run; outputs Sulfur Ore. No NPCs or crates.'],
  },
  hqm_quarry: {
    key: 'hqm_quarry', name: 'HQM QUARRY', imageSlug: 'mining-quarry-hqm',
    type: 'Mining', tier: '1', safezone: false, radiation: 'none',
    recyclers: 0, crates: [], scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    mining: { fuel: 'Low Grade Fuel', runTime: '~2m 10s per fuel', outputs: ['~50 HQM Ore per fuel', 'Minimum 4 fuel → 2 HQM Ore'] },
    notes: ['Feed Low Grade Fuel to run; outputs HQM Ore (slow but valuable). No NPCs or crates.'],
  },
  ranch: {
    key: 'ranch', name: 'RANCH', imageSlug: 'ranch',
    type: 'Small', tier: '1', safezone: false, radiation: 'none',
    recyclers: 1, crateCount: 8,
    crates: [{ loot: 'basic', label: 'Basic Crate', count: '~8' }],
    scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Small farm monument with a recycler and barrels. No puzzle.'],
  },
  fishing_village: {
    key: 'fishing_village', name: 'FISHING VILLAGE', imageSlug: 'fishing_village_a',
    type: 'Safe Zone', tier: '0', safezone: true, radiation: 'none',
    recyclers: 1, crates: [], scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Safe zone — buy boats & fishing gear; recycler on site.'],
  },
  large_fishing_village: {
    key: 'large_fishing_village', name: 'LARGE FISHING VILLAGE', imageSlug: 'fishing_village_a',
    type: 'Safe Zone', tier: '0', safezone: true, radiation: 'none',
    recyclers: 1, crates: [], scientists: [],
    hasTunnelEntrance: false, hasChinookDropZone: false, allowsHeliCrash: false,
    requiresCards: [], givesCards: [],
    puzzles: [],
    notes: ['Larger safe-zone fishing village — boats, fishing gear & a recycler.'],
  },
};

export function getMonumentInfo(token: string): MonumentInfo | null {
  const key = normalizeMonumentKey(token);
  if (MONUMENT_DB[key]) return MONUMENT_DB[key];
  const aliases: [string, string][] = [
    ['launch', 'launch_site'],
    ['military_tunnel', 'military_tunnel'],
    ['powerplant', 'power_plant'],
    ['power_plant', 'power_plant'],
    ['water_treatment', 'water_treatment'],
    ['trainyard', 'train_yard'],
    ['train_yard', 'train_yard'],
    ['airfield', 'airfield'],
    ['radtown_small_3', 'dome'],
    ['sphere', 'dome'],
    ['dome', 'dome'],
    ['radtown', 'radtown'],
    ['sewer', 'sewer_branch'],
    ['satellite', 'satellite_dish'],
    ['ferry', 'ferry_terminal'],
    ['harbor', 'harbor'],
    ['supermarket', 'supermarket'],
    ['gas_station', 'gas_station'],
    ['mining_outpost', 'mining_outpost'],
    ['warehouse', 'mining_outpost'],
    ['junkyard', 'junkyard'],
    ['lighthouse', 'lighthouse'],
    ['arctic_research', 'arctic_research_base'],
    ['arctic', 'arctic_research_base'],
    ['military_base', 'abandoned_military_base'],
    ['militarybase', 'abandoned_military_base'],
    ['abandoned_military', 'abandoned_military_base'],
    ['abandonedmilitary', 'abandoned_military_base'],
    ['desert_military', 'abandoned_military_base'],
    ['excavator', 'giant_excavator'],
    ['ziggurat', 'jungle_ziggurat'],
    ['quarry_stone', 'stone_quarry'],
    ['mining_quarry_stone', 'stone_quarry'],
    ['quarry_sulfur', 'sulfur_quarry'],
    ['mining_quarry_sulfur', 'sulfur_quarry'],
    ['quarry_hqm', 'hqm_quarry'],
    ['mining_quarry_hqm', 'hqm_quarry'],
    ['oilrig_2', 'oil_rig_large'],
    ['oil_rig_large', 'oil_rig_large'],
    ['large_oil', 'oil_rig_large'],
    ['oilrig_1', 'oil_rig_small'],
    ['oil_rig_small', 'oil_rig_small'],
    ['oil_rig', 'oil_rig_small'],
    ['oilrig', 'oil_rig_small'],
    ['missile_silo', 'missile_silo'],
    ['silo', 'missile_silo'],
    ['underwater_lab', 'underwater_lab'],
    ['bandit', 'bandit_camp'],
    ['compound', 'outpost'],
    ['outpost', 'outpost'],
    ['stables', 'ranch'],
    ['ranch', 'ranch'],
    ['large_fishing', 'large_fishing_village'],
    ['fishing', 'fishing_village'],
  ];
  for (const [needle, dbKey] of aliases) {
    if (key.includes(needle) && MONUMENT_DB[dbKey]) return MONUMENT_DB[dbKey];
  }
  return null;
}

export function monumentGivesCard(token: string, card: CardType): boolean {
  const info = getMonumentInfo(token);
  return info?.givesCards.includes(card) ?? false;
}

/**
 * Derives the keycards a monument's puzzles actually require from the puzzle
 * `bring` lists (the source of truth), so the "Needs X" badges can never
 * contradict the displayed puzzle. Returns cards in green→blue→red order.
 */
export function getRequiredCards(info: MonumentInfo): CardType[] {
  const found = new Set<CardType>();
  for (const p of info.puzzles) {
    for (const item of p.bring) {
      if (item.icon === 'keycard-green') found.add('green');
      else if (item.icon === 'keycard-blue') found.add('blue');
      else if (item.icon === 'keycard-red') found.add('red');
    }
  }
  return (['green', 'blue', 'red'] as CardType[]).filter((c) => found.has(c));
}

export function monumentHasRecycler(token: string): boolean {
  const info = getMonumentInfo(token);
  return (info?.recyclers ?? 0) > 0;
}

/**
 * Monument-feature placement map.
 *
 * Several "resources" in the tactical overlay are actually fixed monument
 * features (a research table sits inside specific monuments, SAM sites guard
 * certain monuments, etc.). Rather than scattering them randomly, we place
 * their icons on the exact monuments that contain them. Keys are normalized
 * monument keys (see normalizeMonumentKey).
 */
export const MONUMENT_FEATURES: Record<string, Set<string>> = {
  // Research tables exist at the safe zones (Outpost & Bandit Camp).
  research_tables: new Set([
    'outpost', 'bandit_camp',
  ]),
  // Oil refineries: Outpost and Harbor (oil rigs have no refinery).
  refineries: new Set([
    'outpost', 'harbor',
  ]),
  // SAM sites are only at Launch Site.
  sam_sites: new Set([
    'launch_site',
  ]),
  // Auto turrets guard Outpost, Bandit Camp and Ranch (safe-zone defenses).
  turrets: new Set([
    'outpost', 'bandit_camp', 'ranch',
  ]),
  // Diesel is obtainable on the oil rigs (diesel barrels) in addition to the
  // puzzle monuments detected from their reward tables below.
  diesel: new Set([
    'oil_rig_small', 'oil_rig_large',
  ]),
};

/** Resource keys that are placed on specific monuments via MONUMENT_FEATURES. */
export const MONUMENT_PLACED_RESOURCES = new Set<string>(Object.keys(MONUMENT_FEATURES));

/** True if the given monument token provides the given monument-feature resource. */
export function monumentHasFeature(token: string, feature: string): boolean {
  // Resolve to the canonical DB key via alias matching so tokens like
  // "launchsite" / "launch_site_1" still map to "launch_site".
  const info = getMonumentInfo(token);
  const key = info?.key ?? normalizeMonumentKey(token);

  const set = MONUMENT_FEATURES[feature];
  if (set && set.has(key)) return true;

  // Puzzle-reward driven features (blueprint fragments, diesel) are derived
  // from the monument's actual puzzle reward tables instead of a static list.
  if (feature === 'basic_bp') return monumentRewards(token, 'Basic Blueprint Fragment');
  if (feature === 'advanced_bp') return monumentRewards(token, 'Advanced Blueprint Fragment');
  if (feature === 'diesel') return monumentRewards(token, 'Diesel');
  return false;
}

/** True if any of the monument's puzzle rewards include an item whose name matches. */
function monumentRewards(token: string, namePart: string): boolean {
  const info = getMonumentInfo(token);
  if (!info) return false;
  return info.puzzles.some((p) =>
    p.rewards.some((r) => r.name.toLowerCase().includes(namePart.toLowerCase())),
  );
}

/**
 * True if a monument can receive a Chinook-dropped locked crate (it has a
 * designated drop zone). The CH47 circles the map and drops a single hackable
 * locked crate at one of these monuments.
 */
export function monumentAllowsLockedCrate(token: string): boolean {
  const info = getMonumentInfo(token);
  if (!info) return false;
  // Chinook drop-zone monuments, plus the Oil Rigs (their card puzzle triggers
  // a Chinook that drops a locked crate on the rig).
  if (info.hasChinookDropZone) return true;
  return info.key === 'oil_rig_small' || info.key === 'oil_rig_large';
}

/** Flat list of all known monuments (for search / command palette). */
export function listMonuments(): { key: string; name: string }[] {
  return Object.values(MONUMENT_DB).map((m) => ({ key: m.key, name: m.name }));
}
