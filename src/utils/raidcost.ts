/**
 * Raid cost calculator — explosive placement counts verified against the
 * WikiRust manually-verified raid chart (walls + doors, last verified 1 Jun 2026)
 * and cross-checked with the xgamingserver raid-cost chart. Craft recipes/sulfur
 * from wiki.facepunch.com.
 */

export type Category = 'wall' | 'door' | 'external' | 'window' | 'deployable';

export interface RaidTarget {
  key: string;
  name: string;
  hp: number;
  category: Category;
  blurb?: string;
  icon?: string; // target icon slug for CDN
  /** Verified full-HP placement counts, keyed by tool. Missing = N/A. */
  counts: Record<string, number>;
}

export const RAID_TARGETS: RaidTarget[] = [
  // ── Walls ──
  {
    key: 'wood_wall', name: 'Wood Wall', hp: 250, category: 'wall', icon: 'wood',
    blurb: 'Burns and chops. Soft side melts to a hatchet.',
    counts: {
      c4: 1, rocket: 2, propane: 2, hv_rocket: 17, incendiary: 1, satchel: 3, beancan: 13, explo_ammo: 48,
      battering_ram: 3, incendiary_bolt: 10, molotov: 4, flamethrower: 400, salvaged_sword: 10, machete: 15,
      bone_club: 150, wooden_spear: 95, stone_spear: 48, f1_grenade: 15,
      hatchet_soft: 3, hatchet_hard: 8, salvaged_axe_soft: 2, salvaged_axe_hard: 5,
      pickaxe_soft: 5, pickaxe_hard: 13, icepick_soft: 4, icepick_hard: 10,
      mortar_shell: 5, fire_arrow: 63
    },
  },
  {
    key: 'stone_wall', name: 'Stone Wall', hp: 500, category: 'wall', icon: 'stones',
    blurb: 'Standard stone tier. Fire-proof, weak to soft-side pickaxes/jackhammers.',
    counts: {
      c4: 2, rocket: 4, propane: 7, hv_rocket: 34, satchel: 10, beancan: 46, explo_ammo: 185, f1_grenade: 46,
      jackhammer_soft: 1.25, jackhammer_hard: 45, pickaxe_soft: 7, pickaxe_hard: 40,
      icepick_soft: 6, icepick_hard: 35, wooden_spear_soft: 125, stone_spear_soft: 63, salvaged_sword_soft: 35,
      mortar_shell: 17
    },
  },
  {
    key: 'sheet_wall', name: 'Sheet Metal Wall', hp: 1000, category: 'wall', icon: 'metal.fragments',
    blurb: 'Double stone HP. Melee-resistant, soft-side is vulnerable to jackhammers.',
    counts: {
      c4: 4, rocket: 8, propane: 13, hv_rocket: 67, satchel: 23, beancan: 112, explo_ammo: 400,
      jackhammer_soft: 15, jackhammer_hard: 439, pickaxe_soft: 80, pickaxe_hard: 345, icepick_hard: 298,
      mortar_shell: 34
    },
  },
  {
    key: 'armored_wall', name: 'Armored Wall (HQM)', hp: 2000, category: 'wall', icon: 'metal.refined',
    blurb: 'Toughest building tier. Highly explosive-resistant. Melee immune.',
    counts: { c4: 8, rocket: 15, propane: 26, hv_rocket: 134, satchel: 46, beancan: 223, explo_ammo: 799, mortar_shell: 67 },
  },
  // ── Doors (No soft side in Rust) ──
  {
    key: 'wood_door', name: 'Wooden Door', hp: 200, category: 'door', icon: 'door.hinged.wood',
    blurb: 'Weakest door. Very vulnerable to fire (Molotovs/Flamethrower).',
    counts: {
      c4: 1, rocket: 1, propane: 3, hv_rocket: 4, incendiary: 1, satchel: 2, beancan: 6, explo_ammo: 18,
      battering_ram: 3, incendiary_bolt: 8, molotov: 2, flamethrower: 100, salvaged_sword: 9, machete: 14,
      bone_club: 139, wooden_spear: 90, stone_spear: 45, f1_grenade: 10, hatchet: 5, salvaged_axe: 3,
      pickaxe: 13, icepick: 10, mortar_shell: 4, fire_arrow: 50
    },
  },
  {
    key: 'wood_double_door', name: 'Wooden Double Door', hp: 200, category: 'door', icon: 'door.double.hinged.wood',
    blurb: 'Wooden double doors. Same durability profiles as single doors.',
    counts: {
      c4: 1, rocket: 1, propane: 3, hv_rocket: 4, incendiary: 1, satchel: 2, beancan: 6, explo_ammo: 18,
      battering_ram: 3, incendiary_bolt: 8, molotov: 2, flamethrower: 100, salvaged_sword: 9, machete: 14,
      bone_club: 139, wooden_spear: 90, stone_spear: 45, f1_grenade: 10, hatchet: 5, salvaged_axe: 3,
      pickaxe: 13, icepick: 10, mortar_shell: 4, fire_arrow: 50
    },
  },
  {
    key: 'sheet_door', name: 'Sheet Metal Door', hp: 250, category: 'door', icon: 'door.hinged.metal',
    blurb: 'Standard early-to-mid game door. Immune to basic melee.',
    counts: { c4: 1, rocket: 2, propane: 4, hv_rocket: 8, satchel: 4, beancan: 18, explo_ammo: 63, f1_grenade: 50, mortar_shell: 9, salvaged_hammer: 24 },
  },
  {
    key: 'sheet_double_door', name: 'Sheet Metal Double Door', hp: 250, category: 'door', icon: 'door.double.hinged.metal',
    blurb: 'Double variant of sheet metal door. Same stats.',
    counts: { c4: 1, rocket: 2, propane: 4, hv_rocket: 8, satchel: 4, beancan: 18, explo_ammo: 63, f1_grenade: 50, mortar_shell: 9, salvaged_hammer: 24 },
  },
  {
    key: 'garage_door', name: 'Garage Door', hp: 600, category: 'door', icon: 'wall.frame.garagedoor',
    blurb: 'Excellent HP-per-cost door. Ideal for base airlocks.',
    counts: { c4: 2, rocket: 3, propane: 8, hv_rocket: 19, satchel: 9, beancan: 42, explo_ammo: 152, f1_grenade: 120, mortar_shell: 21, salvaged_hammer: 56 },
  },
  {
    key: 'armored_door', name: 'Armored Door', hp: 800, category: 'door', icon: 'door.hinged.toptier',
    blurb: 'Strongest single door. Requires substantial explosives.',
    counts: { c4: 3, rocket: 5, propane: 11, hv_rocket: 30, satchel: 15, beancan: 58, explo_ammo: 251, f1_grenade: 160, mortar_shell: 27, salvaged_hammer: 75 },
  },
  {
    key: 'armored_double_door', name: 'Armored Double Door', hp: 800, category: 'door', icon: 'door.double.hinged.toptier',
    blurb: 'Double variant of armored door. Identical stats.',
    counts: { c4: 3, rocket: 5, propane: 11, hv_rocket: 30, satchel: 15, beancan: 58, explo_ammo: 251, f1_grenade: 160, mortar_shell: 27, salvaged_hammer: 75 },
  },
  // ── External walls (No soft side in Rust) ──
  {
    key: 'ext_stone', name: 'High External Stone Wall', hp: 500, category: 'external', icon: 'wall.external.high.stone',
    blurb: 'Compound stone perimeter. Immune to flame/fire. Heavy melee resistant.',
    counts: { c4: 2, rocket: 4, propane: 7, hv_rocket: 34, satchel: 10, beancan: 46, explo_ammo: 185, f1_grenade: 46, mortar_shell: 17 },
  },
  {
    key: 'ext_stone_gate', name: 'High External Stone Gate', hp: 500, category: 'external', icon: 'gates.external.high.stone',
    blurb: 'Compound stone gatehouse. Identical raid cost as stone external wall.',
    counts: { c4: 2, rocket: 4, propane: 7, hv_rocket: 34, satchel: 10, beancan: 46, explo_ammo: 185, f1_grenade: 46, mortar_shell: 17 },
  },
  {
    key: 'ext_wood', name: 'High External Wood Wall', hp: 500, category: 'external', icon: 'wall.external.high',
    blurb: 'Weak to fire, HV rockets, and the battering ram.',
    counts: {
      c4: 2, rocket: 3, propane: 7, hv_rocket: 17, incendiary: 2, satchel: 6, beancan: 30, explo_ammo: 93,
      battering_ram: 6, incendiary_bolt: 20, molotov: 4, flamethrower: 500, salvaged_sword: 20, f1_grenade: 30,
      mortar_shell: 5, fire_arrow: 100
    },
  },
  {
    key: 'ext_wood_gate', name: 'High External Wood Gate', hp: 500, category: 'external', icon: 'gates.external.high.wood',
    blurb: 'Compound wood gatehouse. Same fire/explosive vulnerabilities.',
    counts: {
      c4: 2, rocket: 3, propane: 7, hv_rocket: 17, incendiary: 2, satchel: 6, beancan: 30, explo_ammo: 93,
      battering_ram: 6, incendiary_bolt: 20, molotov: 4, flamethrower: 500, salvaged_sword: 20, f1_grenade: 30,
      mortar_shell: 5, fire_arrow: 100
    },
  },
  // ── Windows & Frames (No soft side in Rust) ──
  {
    key: 'wood_window_bars', name: 'Wooden Window Bars', hp: 200, category: 'window', icon: 'wall.window.bars.wood',
    blurb: 'Basic wooden frames. Easy to burn or chop.',
    counts: {
      c4: 1, rocket: 1, propane: 3, hv_rocket: 4, incendiary: 1, satchel: 2, beancan: 6, explo_ammo: 19,
      battering_ram: 3, incendiary_bolt: 8, molotov: 2, flamethrower: 100, salvaged_sword: 9, machete: 14,
      bone_club: 139, wooden_spear: 90, stone_spear: 45, f1_grenade: 10, hatchet: 5, salvaged_axe: 3,
      mortar_shell: 4, fire_arrow: 50
    },
  },
  {
    key: 'metal_window_bars', name: 'Metal Window Bars', hp: 500, category: 'window', icon: 'wall.window.bars.metal',
    blurb: 'Solid iron bars. Same durability profile as a stone wall.',
    counts: { c4: 2, rocket: 4, propane: 7, hv_rocket: 34, satchel: 10, beancan: 46, explo_ammo: 185, f1_grenade: 46, mortar_shell: 17 },
  },
  {
    key: 'reinforced_window_bars', name: 'Reinforced Window Bars', hp: 500, category: 'window', icon: 'wall.window.bars.toptier',
    blurb: 'HQM steel bars. Identical explosive durability as metal window bars.',
    counts: { c4: 2, rocket: 4, propane: 7, hv_rocket: 34, satchel: 10, beancan: 46, explo_ammo: 185, f1_grenade: 46, mortar_shell: 17 },
  },
  {
    key: 'reinforced_glass_window', name: 'Reinforced Glass Window', hp: 500, category: 'window', icon: 'wall.window.glass.reinforced',
    blurb: 'Bulletproof reinforced glass. Same raid counts as metal window bars.',
    counts: { c4: 2, rocket: 4, propane: 7, hv_rocket: 34, satchel: 10, beancan: 46, explo_ammo: 185, f1_grenade: 46, mortar_shell: 17 },
  },
  {
    key: 'prison_cell', name: 'Prison Cell Wall/Gate', hp: 250, category: 'window', icon: 'wall.frame.cell',
    blurb: 'Steel prison bars. Extremely cheap to breach compared to solid walls.',
    counts: { c4: 1, rocket: 1, satchel: 2, beancan: 10, explo_ammo: 30, f1_grenade: 10 },
  },
  {
    key: 'chainlink_fence', name: 'Chainlink Fence/Gate', hp: 250, category: 'window', icon: 'wall.frame.fence',
    blurb: 'Wire mesh fencing. Weak against basic tools and satchels.',
    counts: { c4: 1, rocket: 1, satchel: 2, beancan: 10, explo_ammo: 30, f1_grenade: 10 },
  },
  // ── Deployables (No soft side in Rust) ──
  {
    key: 'tc', name: 'Tool Cupboard', hp: 100, category: 'deployable', icon: 'cupboard.tool',
    blurb: '100 HP — destroy to clear base ownership & building block.',
    counts: {
      c4: 1, rocket: 1, propane: 2, hv_rocket: 3, satchel: 2, beancan: 8, explo_ammo: 8,
      molotov: 1, flamethrower: 40, salvaged_sword: 5, machete: 8, wooden_spear: 70, stone_spear: 35,
      bone_club: 80, f1_grenade: 4, hatchet: 2, salvaged_axe: 1, mortar_shell: 2, fire_arrow: 6, salvaged_hammer: 10
    },
  },
  {
    key: 'turret', name: 'Auto Turret', hp: 1000, category: 'deployable', icon: 'autoturret',
    blurb: 'Target with 3 HV rockets or explosive ammo from safety.',
    counts: { c4: 2, rocket: 4, propane: 13, hv_rocket: 3, incendiary: 1, satchel: 2, explo_ammo: 300, molotov: 4, flamethrower: 400, salvaged_sword: 35, f1_grenade: 30, mortar_shell: 21, fire_arrow: 50, salvaged_hammer: 60 },
  },
  {
    key: 'sam', name: 'SAM Site', hp: 1000, category: 'deployable', icon: 'samsite',
    blurb: 'Anti-air launcher. Highly vulnerable to fire (Molotovs).',
    counts: { c4: 3, rocket: 5, propane: 13, hv_rocket: 3, satchel: 15, molotov: 3, flamethrower: 120, f1_grenade: 30, jackhammer_soft: 2, mortar_shell: 21, salvaged_hammer: 60 },
  },
  {
    key: 'flame_turret', name: 'Flame Turret', hp: 300, category: 'deployable', icon: 'flameturret',
    blurb: 'Area defense trap. Extremely flammable.',
    counts: { c4: 1, rocket: 1, satchel: 3, beancan: 15, explo_ammo: 30, molotov: 1, flamethrower: 40, hv_rocket: 1, f1_grenade: 5, salvaged_hammer: 20 },
  },
  {
    key: 'shotgun_trap', name: 'Shotgun Trap', hp: 300, category: 'deployable', icon: 'guntrap',
    blurb: 'Close-quarters trap. Pop with 1 HV Rocket or a Molotov.',
    counts: { c4: 1, rocket: 1, satchel: 2, beancan: 10, explo_ammo: 19, molotov: 1, hv_rocket: 1, f1_grenade: 5, salvaged_hammer: 20 },
  },
  {
    key: 'large_box', name: 'Large Wooden Box', hp: 250, category: 'deployable', icon: 'box.wooden.large',
    blurb: 'Storage container. Easily broken with swords or fire.',
    counts: {
      c4: 1, rocket: 1, satchel: 3, beancan: 15, explo_ammo: 30, molotov: 2, flamethrower: 100,
      salvaged_sword: 10, machete: 15, bone_club: 150, wooden_spear: 95, stone_spear: 48, f1_grenade: 15, fire_arrow: 50
    },
  },
];

export interface ResourceCost {
  sulfur?: number;
  charcoal?: number;
  metalFrags?: number;
  lowGrade?: number;
  hqm?: number;
  techTrash?: number;
  cloth?: number;
  rope?: number;
  metalPipe?: number;
  wood?: number;
  propaneTank?: number;
  stone?: number;
  bone?: number;
  scrap?: number;
  metalBlade?: number;
  tarp?: number;
  sheetMetal?: number;
  roadsign?: number;
  spring?: number;
  gears?: number;
}

export interface RaidTool {
  key: string;
  name: string;
  short: string;
  icon: string;   // rusthelp CDN item shortname
  /** Raw resources to craft ONE, fully broken down (verified recipes). */
  cost: ResourceCost;
  /** Final-assembly craft time for ONE (seconds). */
  craftSeconds: number;
  /** In-raid detonation / fuse delay once placed (seconds). 0 = instant. */
  fuseSeconds: number;
  /** In-raid active throw/shoot/swing duration per unit (seconds). */
  useSeconds: number;
  /** Workbench level required to craft (1-3). 0 = no bench needed. */
  wb: number;
  /** Direct research table cost (scrap). 0 = default craft/unresearchable. */
  researchScrap?: number;
  /** Tool category type for navigation tabs */
  type: 'explosive' | 'fire' | 'melee' | 'siege';
  /**
   * Eco/impractical methods (beancans, explosive ammo) are excluded from the
   * "best value mix" optimiser. They still appear as standalone options.
   */
  eco?: boolean;
  /** Reusable siege vehicle: count is hits, resources are built once. */
  fixedCost?: boolean;
  blurb: string;
}

// Verified raw-resource costs & recipes.
export const RAID_TOOLS: RaidTool[] = [
  {
    key: 'c4', name: 'C4 (Timed Explosive)', short: 'C4', icon: 'explosive.timed',
    cost: { sulfur: 2200, charcoal: 3000, metalFrags: 200, lowGrade: 60, techTrash: 2, cloth: 5 },
    craftSeconds: 30, fuseSeconds: 10, useSeconds: 2.0, wb: 3, researchScrap: 500, type: 'explosive',
    blurb: 'Highest damage per placement. Most sulfur-efficient on tough walls.',
  },
  {
    key: 'rocket', name: 'Rocket', short: 'Rocket', icon: 'ammo.rocket.basic',
    cost: { sulfur: 1400, charcoal: 1950, metalFrags: 100, lowGrade: 30, metalPipe: 2 },
    craftSeconds: 10, fuseSeconds: 0, useSeconds: 4.5, wb: 3, researchScrap: 500, type: 'explosive',
    blurb: 'Instant impact + splash that can hit several walls at once.',
  },
  {
    key: 'hv_rocket', name: 'High Velocity Rocket', short: 'HV Rocket', icon: 'ammo.rocket.hv',
    cost: { sulfur: 200, charcoal: 300, metalPipe: 1 },
    craftSeconds: 8, fuseSeconds: 0, useSeconds: 4.5, wb: 2, researchScrap: 125, type: 'explosive',
    blurb: 'Cheap & fast (100 gunpowder + 1 pipe) but low structure damage. Best for auto turrets & SAM sites.',
  },
  {
    key: 'incendiary', name: 'Incendiary Rocket', short: 'Incin. Rocket', icon: 'ammo.rocket.fire',
    cost: { sulfur: 610, charcoal: 900, metalFrags: 10, lowGrade: 250, metalPipe: 2 },
    craftSeconds: 8, fuseSeconds: 0, useSeconds: 4.5, wb: 2, researchScrap: 125, type: 'explosive',
    blurb: 'Fire damage shreds wood & turrets. Fire near the target, not at it.',
  },
  {
    key: 'mortar_shell', name: 'Mortar Shell', short: 'Mortar', icon: 'ammo.mortar.basic',
    cost: { sulfur: 300, charcoal: 450, metalPipe: 0.5 },
    craftSeconds: 5, fuseSeconds: 5, useSeconds: 8.0, wb: 2, researchScrap: 125, type: 'explosive', eco: true,
    blurb: 'Tier-2 long-range artillery shell. Deals indirect explosive damage.',
  },
  {
    key: 'satchel', name: 'Satchel Charge', short: 'Satchel', icon: 'explosive.satchel',
    cost: { sulfur: 480, charcoal: 720, metalFrags: 80, rope: 1, wood: 10 },
    craftSeconds: 25, fuseSeconds: 9, useSeconds: 2.0, wb: 1, researchScrap: 125, type: 'explosive',
    blurb: 'Cheap mid-game boom (4 beancans + rope). Random 6-12s fuse & can dud.',
  },
  {
    key: 'beancan', name: 'Beancan Grenade', short: 'Beancan', icon: 'grenade.beancan',
    cost: { sulfur: 120, charcoal: 180, metalFrags: 20 },
    craftSeconds: 8, fuseSeconds: 4, useSeconds: 2.5, wb: 1, researchScrap: 75, type: 'explosive', eco: true,
    blurb: 'Very cheap but unreliable — 15% dud rate, random 3-5s fuse, slow per-HP.',
  },
  {
    key: 'explo_ammo', name: 'Explosive 5.56 Ammo', short: 'Explo 5.56', icon: 'ammo.rifle.explosive',
    cost: { sulfur: 25, charcoal: 30, metalFrags: 5 },
    craftSeconds: 3, fuseSeconds: 0, useSeconds: 0.15, wb: 2, researchScrap: 125, type: 'explosive', eco: true,
    blurb: 'Per-round eco raiding. Needs a rifle and a lot of patience.',
  },
  {
    key: 'f1_grenade', name: 'F1 Grenade', short: 'F1', icon: 'grenade.f1',
    cost: { sulfur: 100, charcoal: 150, metalFrags: 25 },
    craftSeconds: 4, fuseSeconds: 3.5, useSeconds: 2.0, wb: 1, researchScrap: 75, type: 'explosive', eco: true,
    blurb: 'Weak but reliable grenade. Best for soft-siding wood or popping traps.',
  },
  {
    key: 'molotov', name: 'Molotov Cocktail', short: 'Molotov', icon: 'grenade.molotov',
    cost: { lowGrade: 50, cloth: 20 },
    craftSeconds: 6, fuseSeconds: 4, useSeconds: 2.0, wb: 1, researchScrap: 75, type: 'fire',
    blurb: 'Creates a pool of fire. Perfect for eco wood structures and TCs.',
  },
  {
    key: 'flamethrower', name: 'Flamethrower Fuel', short: 'LGF Fuel', icon: 'flamethrower',
    cost: { lowGrade: 1 },
    craftSeconds: 0.1, fuseSeconds: 0, useSeconds: 0.1, wb: 2, researchScrap: 125, type: 'fire', eco: true,
    blurb: 'Low grade fuel consumed. Spray in bursts to maximize fire burn.',
  },
  {
    key: 'fire_arrow', name: 'Fire Arrow', short: 'Fire Arrow', icon: 'arrow.fire',
    cost: { wood: 10, lowGrade: 5, cloth: 1 },
    craftSeconds: 1.5, fuseSeconds: 0, useSeconds: 3.5, wb: 1, researchScrap: 75, type: 'fire',
    blurb: 'Burning arrow. Creates fire patches that deal damage over time to wood.',
  },
  {
    key: 'salvaged_sword', name: 'Salvaged Sword', short: 'Sword', icon: 'salvaged.sword',
    cost: { metalFrags: 15, metalBlade: 1 },
    craftSeconds: 20, fuseSeconds: 0, useSeconds: 45.0, wb: 1, researchScrap: 75, type: 'melee', eco: true,
    blurb: 'Very fast melee tool. Smashes wood doors & TCs silently. Swings drain durability in 45s.',
  },
  {
    key: 'machete', name: 'Machete', short: 'Machete', icon: 'machete',
    cost: { wood: 100, metalFrags: 40 },
    craftSeconds: 20, fuseSeconds: 0, useSeconds: 50.0, wb: 0, researchScrap: 0, type: 'melee', eco: true,
    blurb: 'Default blueprint melee tool. Decent for cheap wood raiding.',
  },
  {
    key: 'bone_club', name: 'Bone Club', short: 'Bone Club', icon: 'bone.club',
    cost: { bone: 20 },
    craftSeconds: 10, fuseSeconds: 0, useSeconds: 35.0, wb: 0, researchScrap: 0, type: 'melee', eco: true,
    blurb: 'Primitive blunt tool. Silent, slow, uses bone fragments.',
  },
  {
    key: 'wooden_spear', name: 'Wooden Spear', short: 'Wood Spear', icon: 'spear.wooden',
    cost: { wood: 300 },
    craftSeconds: 15, fuseSeconds: 0, useSeconds: 40.0, wb: 0, researchScrap: 0, type: 'melee', eco: true,
    blurb: 'Extremely cheap primitive spear. Slow but requires only wood.',
  },
  {
    key: 'stone_spear', name: 'Stone Spear', short: 'Stone Spear', icon: 'spear.stone',
    cost: { wood: 300, stone: 100 },
    craftSeconds: 15, fuseSeconds: 0, useSeconds: 45.0, wb: 0, researchScrap: 0, type: 'melee', eco: true,
    blurb: 'Slightly upgraded spear. Deals higher damage than wooden spear.',
  },
  {
    key: 'salvaged_hammer', name: 'Salvaged Hammer', short: 'Hammer', icon: 'hammer.salvaged',
    cost: { metalFrags: 50, metalPipe: 1 },
    craftSeconds: 20, fuseSeconds: 0, useSeconds: 45.0, wb: 1, researchScrap: 75, type: 'melee', eco: true,
    blurb: 'Heavy eco-raid tool. Slow but damages metal doors and traps.',
  },
  {
    key: 'jackhammer', name: 'Jackhammer', short: 'Jackhammer', icon: 'jackhammer',
    cost: { scrap: 150 },
    craftSeconds: 0, fuseSeconds: 0, useSeconds: 60.0, wb: 0, researchScrap: 0, type: 'melee', eco: true, fixedCost: true,
    blurb: 'King of soft-side eco raiding. Buy at Outpost. Active use breaks it in 60s.',
  },
  {
    key: 'pickaxe', name: 'Metal Pickaxe', short: 'Pickaxe', icon: 'pickaxe',
    cost: { wood: 100, metalFrags: 125 },
    craftSeconds: 25, fuseSeconds: 0, useSeconds: 45.0, wb: 2, researchScrap: 75, type: 'melee', eco: true,
    blurb: 'Standard metal pick. Swings drain durability in 45s.',
  },
  {
    key: 'icepick', name: 'Salvaged Icepick', short: 'Icepick', icon: 'icepick.salvaged',
    cost: { metalPipe: 5, metalBlade: 1 },
    craftSeconds: 30, fuseSeconds: 0, useSeconds: 50.0, wb: 2, researchScrap: 75, type: 'melee', eco: true,
    blurb: 'Sleek salvaged pick. Swings drain durability in 50s.',
  },
  {
    key: 'hatchet', name: 'Metal Hatchet', short: 'Hatchet', icon: 'hatchet',
    cost: { wood: 100, metalFrags: 75 },
    craftSeconds: 25, fuseSeconds: 0, useSeconds: 40.0, wb: 1, researchScrap: 75, type: 'melee', eco: true,
    blurb: 'Standard metal hatchet. Best for wooden structures. Lasts 40s.',
  },
  {
    key: 'salvaged_axe', name: 'Salvaged Axe', short: 'Salvaged Axe', icon: 'axe.salvaged',
    cost: { metalPipe: 5, metalBlade: 1 },
    craftSeconds: 30, fuseSeconds: 0, useSeconds: 45.0, wb: 2, researchScrap: 75, type: 'melee', eco: true,
    blurb: 'Upgrade axe. Highly effective for chopping wood walls/doors.',
  },
  {
    key: 'propane', name: 'Propane Explosive Bomb', short: 'Propane', icon: 'catapult.ammo.explosive',
    cost: { sulfur: 200, charcoal: 300, propaneTank: 1 },
    craftSeconds: 10, fuseSeconds: 3, useSeconds: 5.0, wb: 2, researchScrap: 125, type: 'siege',
    blurb: 'Catapult ammo (100 gunpowder + propane tank). ~77 structure dmg per hit — fire it from afar.',
  },
  {
    key: 'battering_ram', name: 'Battering Ram', short: 'Ram', icon: 'batteringram',
    cost: { wood: 500, hqm: 100, sheetMetal: 2, tarp: 1 },
    craftSeconds: 30, fuseSeconds: 0, useSeconds: 1.5, wb: 2, researchScrap: 30, type: 'siege', fixedCost: true,
    blurb: 'Siege vehicle. Smashes wood & stone only. 1.5s per hit.',
  },
  {
    key: 'incendiary_bolt', name: 'Incendiary Bolt (Ballista)', short: 'Incin. Bolt', icon: 'ballista.bolt.incendiary',
    cost: { metalFrags: 50, cloth: 10, lowGrade: 10 },
    craftSeconds: 10, fuseSeconds: 0, useSeconds: 3.5, wb: 2, researchScrap: 125, type: 'siege',
    blurb: 'Ballista fire bolt. Burns wood structures from range.',
  },
];

const TOOL_BY_KEY: Record<string, RaidTool> = Object.fromEntries(RAID_TOOLS.map((t) => [t.key, t]));

export const RESOURCE_META: { key: keyof ResourceCost; label: string; slug: string }[] = [
  { key: 'sulfur', label: 'Sulfur', slug: 'sulfur' },
  { key: 'charcoal', label: 'Charcoal', slug: 'charcoal' },
  { key: 'metalFrags', label: 'Metal Frags', slug: 'metal.fragments' },
  { key: 'lowGrade', label: 'Low Grade Fuel', slug: 'lowgradefuel' },
  { key: 'hqm', label: 'High Quality Metal', slug: 'metal.refined' },
  { key: 'techTrash', label: 'Tech Trash', slug: 'techparts' },
  { key: 'cloth', label: 'Cloth', slug: 'cloth' },
  { key: 'rope', label: 'Rope', slug: 'rope' },
  { key: 'metalPipe', label: 'Metal Pipe', slug: 'metalpipe' },
  { key: 'wood', label: 'Wood', slug: 'wood' },
  { key: 'propaneTank', label: 'Propane Tank', slug: 'propanetank' },
  { key: 'stone', label: 'Stone', slug: 'stones' },
  { key: 'bone', label: 'Bone Fragments', slug: 'bone.fragments' },
  { key: 'scrap', label: 'Scrap', slug: 'scrap' },
  { key: 'metalBlade', label: 'Metal Blade', slug: 'metalblade' },
  { key: 'tarp', label: 'Tarp', slug: 'tarp' },
  { key: 'sheetMetal', label: 'Sheet Metal', slug: 'sheet.metal' },
  { key: 'roadsign', label: 'Road Sign', slug: 'roadsigns' },
  { key: 'spring', label: 'Spring', slug: 'spring' },
  { key: 'gears', label: 'Gears', slug: 'gears' },
];

export interface RaidResult {
  toolKey: string;
  toolName: string;
  toolShort: string;
  icon: string;
  blurb: string;
  count: number;
  resources: ResourceCost;
  sulfur: number;
  craftSeconds: number;
  fuseSeconds: number;
  useSeconds: number;
  wb: number;
  fixedCost?: boolean;
  countLabel?: string;
}

function scaleResources(cost: ResourceCost, count: number): ResourceCost {
  const out: ResourceCost = {};
  for (const { key } of RESOURCE_META) {
    const v = cost[key];
    if (v) out[key] = v * count;
  }
  return out;
}

function buildResult(toolKey: string, count: number): RaidResult | null {
  const tool = TOOL_BY_KEY[toolKey];
  if (!tool || count <= 0) return null;
  const mult = tool.fixedCost ? 1 : count;
  const resources = scaleResources(tool.cost, mult);
  return {
    toolKey: tool.key, toolName: tool.name, toolShort: tool.short, icon: tool.icon, blurb: tool.blurb,
    count, resources,
    sulfur: (tool.cost.sulfur || 0) * mult,
    craftSeconds: tool.craftSeconds * mult,
    fuseSeconds: tool.fuseSeconds * count,
    useSeconds: tool.useSeconds * count, // Scale use duration by count
    wb: tool.wb,
    fixedCost: tool.fixedCost,
    countLabel: tool.fixedCost ? 'hits' : undefined,
  };
}

/**
 * Placements + full raw cost + total times for a target at a given HP.
 * Counts come from verified charts and scale proportionally for a weakened
 * target. Returned list is sorted cheapest-sulfur first.
 */
export function computeRaidCost(target: RaidTarget, hp: number, softSide: boolean = false): RaidResult[] {
  const frac = Math.max(0, Math.min(1, hp / target.hp));
  const out: RaidResult[] = [];
  for (const tool of RAID_TOOLS) {
    let countKey = tool.key;
    // Map tool keys to soft/hard specific counters if they exist (only for walls)
    if (['jackhammer', 'pickaxe', 'icepick', 'hatchet', 'salvaged_axe', 'wooden_spear', 'stone_spear', 'salvaged_sword'].includes(tool.key)) {
      const softKey = `${tool.key}_soft`;
      const hardKey = `${tool.key}_hard`;
      if (softSide && target.counts[softKey] !== undefined) {
        countKey = softKey;
      } else if (!softSide && target.counts[hardKey] !== undefined) {
        countKey = hardKey;
      } else {
        countKey = tool.key;
      }
    }
    const full = target.counts[countKey] !== undefined ? target.counts[countKey] : target.counts[tool.key];
    if (full === undefined || full <= 0) continue;
    const count = Math.max(1, Math.ceil(full * frac));
    const r = buildResult(tool.key, count);
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.sulfur - b.sulfur);
}

export interface ComboResult {
  parts: RaidResult[];
  sulfur: number;
  craftSeconds: number;
  fuseSeconds: number;
  wb: number;
}

/**
 * Cheapest-sulfur COMBINATION to destroy `hp` of a target.
 */
export function computeBestCombo(target: RaidTarget, hp: number): ComboResult | null {
  const tools = RAID_TOOLS
    .map((t) => {
      const full = target.counts[t.key];
      if (!full || full <= 0 || t.eco || t.type !== 'explosive') return null;
      return { key: t.key, sulfur: t.cost.sulfur || 0, effDmg: target.hp / full };
    })
    .filter((v): v is { key: string; sulfur: number; effDmg: number } => v !== null);
  if (tools.length === 0 || hp <= 0) return null;

  const STEP = 1;
  const N = Math.ceil(hp / STEP);
  const best = new Array(N + 1).fill(Infinity);
  const choice = new Array(N + 1).fill(-1);
  best[0] = 0;
  for (let i = 1; i <= N; i++) {
    for (let ti = 0; ti < tools.length; ti++) {
      const dmgBuckets = Math.max(1, Math.round(tools[ti].effDmg / STEP));
      const prev = Math.max(0, i - dmgBuckets);
      const cand = best[prev] + tools[ti].sulfur;
      if (cand < best[i]) { best[i] = cand; choice[i] = ti; }
    }
  }
  if (!isFinite(best[N])) return null;

  const counts: Record<string, number> = {};
  let i = N;
  let guard = 0;
  while (i > 0 && choice[i] >= 0 && guard++ < 100000) {
    const t = tools[choice[i]];
    counts[t.key] = (counts[t.key] || 0) + 1;
    i -= Math.max(1, Math.round(t.effDmg / STEP));
  }
  const parts = Object.entries(counts)
    .map(([key, c]) => buildResult(key, c))
    .filter((r): r is RaidResult => r !== null)
    .sort((a, b) => b.sulfur - a.sulfur);
  return {
    parts,
    sulfur: parts.reduce((s, p) => s + p.sulfur, 0),
    craftSeconds: parts.reduce((s, p) => s + p.craftSeconds, 0),
    fuseSeconds: parts.reduce((s, p) => s + p.fuseSeconds, 0),
    wb: parts.reduce((m, p) => Math.max(m, p.wb), 0),
  };
}

/** Sum every resource line across a set of results (for grand totals). */
export function sumResources(results: { resources: ResourceCost }[]): ResourceCost {
  const out: ResourceCost = {};
  for (const r of results) {
    for (const { key } of RESOURCE_META) {
      const v = r.resources[key];
      if (v) out[key] = (out[key] || 0) + v;
    }
  }
  return out;
}
