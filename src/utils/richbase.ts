/**
 * Rich Base Tracker.
 *
 * Ranks player vending machines by the scrap-equivalent worth of the goods they
 * have IN STOCK. For each distinct item the shop sells:
 *
 *     itemValue (scrap) = perUnitValue × unitsInStock
 *
 * Key correctness rules:
 *  • A vending machine's storage is SHARED. If the same item is listed across
 *    several of the 6 slots, the `amount_in_stock` on each slot reads from the
 *    same pool — so we DEDUPE by item and take the MAX stock, never the sum
 *    (3 slots showing 7.2k Sulfur Ore = 7.2k total, not 21.6k).
 *  • `perUnitValue` is a curated intrinsic scrap worth per unit of the item
 *    (what it's actually worth to a raider), NOT the shop's asking price — a
 *    troll price can't skew the ranking.
 *  • Only in-stock items count. NPC / safe-zone shops are excluded.
 */

import { getItemShortname, getItemName } from './items';

/**
 * Intrinsic scrap-equivalent value PER UNIT for valuable item shortnames.
 * Tuned so bulk raw materials (sulfur, frags) are low per-unit but add up, and
 * finished boom / guns / components are high. Items not listed here are treated
 * as near-worthless clutter (food, building blocks, cosmetics) and ignored.
 */
const ITEM_VALUE: Record<string, number> = {
  // ── Explosives & raid tools (high) ──
  'explosive.timed': 600,           // C4
  'ammo.rocket.basic': 280,         // Rocket
  'ammo.rocket.hv': 50,             // HV Rocket
  'ammo.rocket.fire': 180,          // Incendiary Rocket
  'ammo.rocket.mlrs': 350,          // MLRS Rocket
  'ammo.rocket.smoke': 20,
  'aiming.module.mlrs': 500,        // MLRS Aiming Module
  'explosives': 30,                 // Raw Explosives
  'gunpowder': 1,                   // Gunpowder
  'ammo.rifle.explosive': 6,        // Explosive 5.56
  'grenade.satchel': 90,            // Satchel Charge
  'grenade.beancan': 16,            // Beancan Grenade
  'grenade.f1': 14,                 // F1 Grenade
  'grenade.flashbang': 6,
  'ammo.grenadelauncher.he': 50,    // 40mm HE
  'survey.charge': 5,

  // ── Raw / refined materials (bulk, low per-unit) ──
  'sulfur.ore': 0.16,
  'sulfur': 0.22,
  'metal.refined': 4,               // HQM
  'metal.fragments': 0.04,
  'metal.ore': 0.05,
  'charcoal': 0.01,
  'lowgradefuel': 0.25,
  'crude.oil': 1,
  'cloth': 0.12,
  'leather': 0.12,
  'wood': 0.003,
  'stones': 0.005,
  'scrap': 1,
  'fat.animal': 0.1,

  // ── Components (mid) ──
  'techparts': 22,                  // Tech Trash
  'targeting.computer': 250,        // Targeting Computer
  'cctv.camera': 90,                // CCTV Camera
  'rifle.body': 30,                 // Rifle Body
  'smg.body': 18,                   // SMG Body
  'semibody': 14,                   // Semi Auto Body
  'pistol.body': 8,
  'metalpipe': 6,                   // Metal Pipe
  'metalblade': 4,                  // Metal Blade
  'gears': 9,                       // Gears
  'metalspring': 12,                // Metal Spring
  'roadsigns': 7,                   // Road Signs
  'sheetmetal': 8,                  // Sheet Metal
  'tarp': 22,                       // Tarp
  'rope': 3,
  'sewingkit': 9,
  'electric.fuse': 8,               // Electric Fuse
  'propanetank': 6,

  // ── Weapons (high) ──
  'rifle.ak': 280,                  // AK-47
  'rifle.ak.ice': 300,              // Ice AK
  'rifle.m16': 260,                 // M16A2
  'lmg.m249': 600,                  // M249
  'rifle.bolt': 200,                // Bolt Action
  'rifle.l96': 320,                 // L96
  'rifle.m39': 180,                 // M39
  'rifle.lr300': 240,               // LR-300
  'hmlmg': 220,                     // HMLMG
  'smg.mp5': 130,                   // MP5
  'smg.thompson': 80,               // Thompson
  'smg.2': 60,                      // Custom SMG
  'pistol.m92': 70,                 // M92
  'pistol.python': 55,              // Python
  'pistol.prototype17': 110,        // Prototype 17
  'pistol.semiauto': 25,
  'pistol.revolver': 12,
  'rifle.semiauto': 50,             // SAR
  'shotgun.spas12': 100,            // SPAS-12
  'shotgun.m4': 130,                // M4 Shotgun
  'shotgun.pump': 55,               // Pump Shotgun
  'shotgun.double': 25,
  'multiplegrenadelauncher': 200,   // MGL
  'rocket.launcher': 120,           // Rocket Launcher
  'minigun': 220,
  'crossbow': 12,
  'bow.compound': 25,

  // ── Ammo (mid bulk) ──
  'ammo.rifle': 1,                  // 5.56
  'ammo.rifle.hv': 1.2,
  'ammo.rifle.incendiary': 2,
  'ammo.pistol': 0.5,
  'ammo.pistol.hv': 0.6,
  'ammo.shotgun': 0.8,
  'ammo.shotgun.slug': 1,

  // ── Armor / gear (high) ──
  'metal.facemask': 110,            // Metal Facemask
  'metal.plate.torso': 110,         // Metal Chest Plate
  'heavy.plate.helmet': 70,
  'heavy.plate.jacket': 80,
  'heavy.plate.pants': 70,
  'roadsign.jacket': 40,
  'roadsign.kilt': 28,
  'roadsign.gloves': 22,
  'coffeecan.helmet': 26,
  'riot.helmet': 18,
  'bucket.helmet': 12,
  'wood.armor.jacket': 8,
  'hazmatsuit': 30,
  'metal.boots': 25,
  'attire.hide.boots': 4,

  // ── Base defense / electrical (high) ──
  'autoturret': 350,                // Auto Turret
  'samsite': 240,                   // SAM Site
  'guntrap': 60,                    // Shotgun Trap
  'flameturret': 40,                // Flame Turret
  'generator.wind.scrap': 130,      // Wind Turbine
  'electric.battery.rechargable.large': 110,
  'electric.battery.rechargable.medium': 40,
  'fluid.combiner': 15,
  'electrical.combiner': 15,
  'electrical.branch': 8,
  'smart.switch': 15,
  'smart.alarm': 15,
  'doorcloser': 12,
  'searchlight': 20,
  'igniter': 10,
  'laserdetector': 12,
  'hbhfsensor': 14,
  'electric.heater': 10,

  // ── Medical (mid) ──
  'largemedkit': 18,                // Large Medkit
  'syringe.medical': 5,             // Medical Syringe
  'bandage': 1,

  // ── Keycards / misc valuables ──
  'keycard_red': 60,
  'keycard_blue': 25,
  'keycard_green': 5,
  'supply.signal': 70,              // Supply Signal
  'diesel_barrel': 50,              // Diesel
  'workbench3': 120,                // T3 Workbench
  'workbench2': 30,
  'box.repair': 20,
  'mixingtable': 12,
  'research.table': 15,
  'fishingrod.handmade': 4,
  'chainsaw': 60,
  'jackhammer': 50,
};

/** Items that flag a base as a genuine RAID TARGET (used for highlight order). */
const RAID_VALUABLES = new Set<string>([
  'explosive.timed', 'ammo.rocket.basic', 'ammo.rocket.hv', 'ammo.rocket.fire',
  'ammo.rocket.mlrs', 'aiming.module.mlrs', 'explosives', 'gunpowder', 'sulfur',
  'sulfur.ore', 'ammo.rifle.explosive', 'grenade.satchel', 'grenade.beancan',
  'grenade.f1', 'ammo.grenadelauncher.he', 'metal.refined',
  'rifle.ak', 'rifle.ak.ice', 'rifle.m16', 'lmg.m249', 'rifle.bolt', 'rifle.l96',
  'rifle.m39', 'rifle.lr300', 'hmlmg', 'smg.mp5', 'smg.thompson', 'smg.2',
  'pistol.m92', 'pistol.python', 'pistol.prototype17', 'rifle.semiauto',
  'shotgun.spas12', 'shotgun.m4', 'shotgun.pump', 'multiplegrenadelauncher', 'minigun',
  'metal.facemask', 'metal.plate.torso', 'heavy.plate.helmet', 'heavy.plate.jacket',
  'heavy.plate.pants', 'roadsign.jacket', 'roadsign.kilt', 'coffeecan.helmet',
  'autoturret', 'samsite', 'guntrap', 'targeting.computer', 'cctv.camera',
  'techparts', 'diesel_barrel', 'keycard_red', 'generator.wind.scrap',
]);

/** Cap a single item's contribution so one massive bulk listing can't dominate. */
const ITEM_VALUE_CAP = 8000;

export interface RichHighlight {
  name: string;
  qty: number;        // units in stock (deduped, shared storage aware)
  itemId: number;
  value: number;      // scrap-equiv intrinsic value of the in-stock units
  isRaid: boolean;
}

export interface RichShop {
  id: string;
  shopName: string;
  grid: string;
  x: number;
  y: number;
  score: number;          // total scrap-equiv value of in-stock goods
  highlights: RichHighlight[];
}

function itemUnitValue(itemId: number): number {
  const sn = getItemShortname(itemId);
  if (!sn) return 0;
  return ITEM_VALUE[sn] ?? 0;
}

/** Names of NPC / event shops that should never count as a "rich base". */
const NPC_SHOP_NAMES = [
  'outpost', 'bandit', 'deep sea', 'medical shop', 'components shop',
  'resources shop', 'weapons shop', 'explosives shop', 'travelling vendor',
  'traveling vendor', 'wandering trader', 'air wolf', 'airwolf',
  'ranch', 'barn', 'stable', 'fishing', 'village', 'shopkeeper',
];

/**
 * Analyze live map markers for rich PLAYER vending machines, valuing each shop
 * by the intrinsic worth of the goods it currently has IN STOCK.
 */
export function analyzeRichBases(
  markers: any[],
  isNpcZone?: (x: number, y: number) => boolean,
): RichShop[] {
  const out: RichShop[] = [];

  for (const m of markers) {
    if (m.type !== 'vending_machine' || !m.raw?.sell_orders) continue;

    const lname = (m.label || '').toLowerCase();
    if (NPC_SHOP_NAMES.some((n) => lname.includes(n))) continue;
    if (isNpcZone && isNpcZone(m.x, m.y)) continue;

    // Dedupe by item: vending storage is SHARED across slots, so the same item
    // in multiple slots draws from one pool — take the MAX stock, never sum.
    const byItem = new Map<number, { units: number; isRaid: boolean }>();
    for (const o of m.raw.sell_orders as any[]) {
      const stock = o.amount_in_stock ?? 0;
      if (stock <= 0) continue;
      if (itemUnitValue(o.item_id) <= 0) continue;
      const units = (o.quantity || 1) * stock;
      const sn = getItemShortname(o.item_id) || '';
      const prev = byItem.get(o.item_id);
      if (prev) {
        prev.units = Math.max(prev.units, units);  // shared storage → max, not sum
      } else {
        byItem.set(o.item_id, { units, isRaid: RAID_VALUABLES.has(sn) });
      }
    }

    let score = 0;
    const highlights: RichHighlight[] = [];
    for (const [itemId, agg] of byItem) {
      const value = Math.min(itemUnitValue(itemId) * agg.units, ITEM_VALUE_CAP);
      if (value <= 0) continue;
      score += value;
      highlights.push({
        name: getItemName(itemId) || 'Item',
        qty: agg.units,
        itemId,
        value: Math.round(value),
        isRaid: agg.isRaid,
      });
    }

    if (score <= 0) continue;

    // Highlights sorted by value contribution (raid valuables break ties up).
    const topHighlights = highlights
      .sort((a, b) => (b.value - a.value) || (Number(b.isRaid) - Number(a.isRaid)))
      .slice(0, 5);

    out.push({
      id: m.id,
      shopName: m.label || 'Vending Machine',
      grid: m.detail || '',
      x: m.x,
      y: m.y,
      score: Math.round(score),
      highlights: topHighlights,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

/** Tier label for a score (total scrap-equiv value of in-stock goods). */
export function richTier(score: number): { label: string; color: string } {
  if (score >= 8000) return { label: 'JACKPOT', color: '#ff4d4d' };
  if (score >= 3000) return { label: 'RICH', color: '#ff9100' };
  if (score >= 1000) return { label: 'STOCKED', color: '#f5c451' };
  return { label: 'MINOR', color: '#8b857c' };
}
