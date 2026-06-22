/**
 * Rust loadout & damage calculator data.
 *
 * Armor protection values + the clothing slot/layer system are taken from the
 * Facepunch wiki (verified June 2026 "Built Different" snapshot). Weapon base
 * damage, headshot multipliers and damage types come from the rustly.com damage
 * chart + facepunch/totalrust item pages.
 *
 * Damage model (matches Rust):
 *   finalDamage = baseDamage × bodyMultiplier × (1 − coverageProtection[type])
 * where coverageProtection is the COMBINED reduction of all armor layers
 * covering that body part for the relevant damage TYPE (projectile / melee /
 * explosion). Layers stack multiplicatively. Armor only reduces damage on the
 * parts it covers — exposed skin takes full damage.
 */

export type ArmorSlot = 'head' | 'chest' | 'legs' | 'hands' | 'feet';
export type DamageType = 'projectile' | 'melee' | 'explosion';

export interface Protection {
  projectile: number;   // 0-1 fraction (damage reduced)
  melee: number;
  explosion: number;
  bite?: number;
  radiation?: number;
  cold?: number;         // negative = makes you colder
}

export interface ArmorPiece {
  key: string;
  name: string;
  icon: string;               // rusthelp CDN shortname (dots→dashes)
  tier: 'clothing' | 'wood' | 'bone' | 'roadsign' | 'metal' | 'heavy' | 'hazmat' | 'ballistic';
  /** Body slots this piece occupies. Multi-slot = full-body suit. */
  slots: ArmorSlot[];
  /** Fills BOTH clothing layers of its body part (blocks stacking another L2). */
  dualLayer?: boolean;
  /** Which clothing layer: 1 = inner (shirt/pants/hat), 2 = outer (armor). */
  layer: 1 | 2;
  protection: Protection;
  /** Debuffs (heavy plate). */
  blocksADS?: boolean;
  speedPenalty?: number;
  /**
   * Other equipment slots this piece makes unusable while worn. Heavy Plate
   * Jacket blocks the hands slot ("inability to wear any other chest or hand
   * armor"); the full Heavy Plate set additionally locks out footwear.
   */
  blocksSlots?: ArmorSlot[];
  /** Craftable armor accepts up to N protective inserts (0–3, bone = 1). */
  insertSlots?: number;
  /** Inserts currently socketed (insert keys). Set on equipped clones only. */
  inserts?: string[];
  waterproof?: boolean;
  /** Full-face/full-head item — nothing else fits on the head (no bandana etc). */
  fullFace?: boolean;
  /**
   * Alternate skins of the same suit that swap protection values (e.g. Hazmat
   * ↔ Arctic Suit). The base piece is variant 0; the UI offers a switch.
   */
  variants?: { name: string; icon: string; protection: Protection; waterproof?: boolean }[];
  /**
   * Inner-layer attachment points this item occupies (head slot only). Lets a
   * face item (bandana) coexist with a hat (beenie). Items sharing any point
   * can't be worn together. Undefined = occupies the whole inner layer.
   */
  sub?: ('face' | 'hat')[];
}

/** Craftable armor inserts (verified vs rustclash insert tables, June 2026). */
export interface ArmorInsert {
  key: string;
  name: string;
  icon: string;
  projectile: number;
  melee: number;
  radiation: number;
  explosion: number;
  cold?: number;
}

export const ARMOR_INSERTS: ArmorInsert[] = [
  { key: 'metal', name: 'Metal Insert', icon: 'clothing.mod.armorinsert_metal',
    projectile: 0.04, melee: 0.02, radiation: 0, explosion: 0 },
  { key: 'wood', name: 'Wooden Insert', icon: 'clothing.mod.armorinsert_wood',
    projectile: 0.02, melee: 0.02, radiation: 0, explosion: 0 },
  { key: 'lead', name: 'Lead Insert', icon: 'clothing.mod.armorinsert_lead',
    projectile: 0.01, melee: 0.01, radiation: 0.05, explosion: 0 },
  { key: 'asbestos', name: 'Asbestos Insert', icon: 'clothing.mod.armorinsert_asbestos',
    projectile: 0.01, melee: 0.01, radiation: 0, explosion: 0.08 },
];

export const BODY_PARTS = ['head', 'chest', 'legs'] as const;
export type BodyPart = typeof BODY_PARTS[number];

export const PART_TO_SLOT: Record<BodyPart, ArmorSlot> = {
  head: 'head', chest: 'chest', legs: 'legs',
};

const P = (projectile: number, melee: number, explosion = 0, cold = 0, radiation = 0, bite = 0): Protection =>
  ({ projectile, melee, explosion, cold, radiation, bite });

// ── Armor & clothing — exact RustLabs/RustClash wearable database values (current) ──
export const ARMOR_PIECES: ArmorPiece[] = [
  // ───── HEAD ─────
  { key: 'ballistic.helmet', name: 'Ballistic Helmet', icon: 'ballistic.helmet', tier: 'ballistic',
    slots: ['head'], layer: 2, fullFace: true, protection: P(0.60, 0.70, 0.13, -0.03, 0, 0.10) },
  { key: 'heavy.plate.helmet', name: 'Heavy Plate Helmet', icon: 'heavy.plate.helmet', tier: 'heavy',
    slots: ['head'], layer: 2, dualLayer: true, fullFace: true, speedPenalty: 0.1, protection: P(0.90, 0.80, 0.17, -0.17, 0.07, 0.13) },
  { key: 'metal.facemask', name: 'Metal Facemask', icon: 'metal.facemask', tier: 'metal',
    slots: ['head'], layer: 2, insertSlots: 3, fullFace: true, protection: P(0.50, 0.70, 0.08, -0.04, 0, 0.08) },
  { key: 'coffeecan.helmet', name: 'Coffee Can Helmet', icon: 'coffeecan.helmet', tier: 'metal',
    slots: ['head'], layer: 2, insertSlots: 3, fullFace: true, protection: P(0.35, 0.50, 0.08, 0, 0.05, 0.08) },
  { key: 'riot.helmet', name: 'Riot Helmet', icon: 'riot.helmet', tier: 'roadsign',
    slots: ['head'], layer: 2, insertSlots: 3, protection: P(0.25, 0.80, 0.08, 0.06, 0.05, 0.13) },
  { key: 'bucket.helmet', name: 'Bucket Helmet', icon: 'bucket.helmet', tier: 'metal',
    slots: ['head'], layer: 2, insertSlots: 3, protection: P(0.20, 0.50, 0.08, 0.06, 0.04, 0.08) },
  { key: 'clatter.helmet', name: 'Clatter Helmet', icon: 'clatter.helmet', tier: 'metal',
    slots: ['head'], layer: 2, insertSlots: 3, protection: P(0.20, 0.50, 0.08, 0.06, 0.04, 0.08) },
  { key: 'wood.armor.helmet', name: 'Wood Armor Helmet', icon: 'wood.armor.helmet', tier: 'wood',
    slots: ['head'], layer: 2, insertSlots: 3, protection: P(0.15, 0.25, 0, 0.07, 0.02, 0.03) },
  { key: 'deer.skull.mask', name: 'Bone Helmet', icon: 'deer.skull.mask', tier: 'bone',
    slots: ['head'], layer: 2, insertSlots: 1, fullFace: true, protection: P(0.25, 0.40, 0.07, 0, 0.04, 0.13) },
  { key: 'hat.wolf', name: 'Wolf Headdress', icon: 'hat.wolf', tier: 'bone',
    slots: ['head'], layer: 2, protection: P(0.30, 0.60, 0.13, 0.06, 0.04, 0.10) },
  { key: 'attire.nesthat', name: 'Nest Hat', icon: 'attire.nesthat', tier: 'bone',
    slots: ['head'], layer: 2, protection: P(0.30, 0.60, 0.13, 0.06, 0.04, 0.10) },
  { key: 'attire.snowman.helmet', name: 'Snowman Helmet', icon: 'attire.snowman.helmet', tier: 'clothing',
    slots: ['head'], layer: 2, protection: P(0.20, 0.25, 0, 0.10, 0.05, 0.07) },
  { key: 'hat.miner', name: 'Miners Hat', icon: 'hat.miner', tier: 'clothing',
    slots: ['head'], layer: 2, protection: P(0.20, 0.25, 0, 0.10, 0.05, 0.07) },
  { key: 'twitch.headset', name: 'Headset', icon: 'twitch.headset', tier: 'clothing',
    slots: ['head'], layer: 2, protection: P(0.20, 0.25, 0, 0.10, 0.05, 0.07) },
  // Inner head layer (worn under most helmets/masks for cold/comfort)
  { key: 'mask.bandana', name: 'Bandana Mask', icon: 'mask.bandana', tier: 'clothing',
    slots: ['head'], layer: 1, sub: ['face'], protection: P(0.05, 0.10, 0, 0.10, 0.03, 0.03) },
  { key: 'mask.balaclava', name: 'Improvised Balaclava', icon: 'mask.balaclava', tier: 'clothing',
    slots: ['head'], layer: 1, sub: ['face', 'hat'], protection: P(0.15, 0.15, 0.03, 0.13, 0.03, 0.03) },
  { key: 'hat.beenie', name: 'Beenie Hat', icon: 'hat.beenie', tier: 'clothing',
    slots: ['head'], layer: 1, sub: ['hat'], protection: P(0.10, 0.10, 0, 0.07, 0.01, 0.03) },
  { key: 'hat.boonie', name: 'Boonie Hat', icon: 'hat.boonie', tier: 'clothing',
    slots: ['head'], layer: 1, sub: ['hat'], protection: P(0.15, 0.15, 0, 0.07, 0.02, 0.03) },
  { key: 'burlap.headwrap', name: 'Burlap Headwrap', icon: 'burlap.headwrap', tier: 'clothing',
    slots: ['head'], layer: 1, sub: ['hat'], protection: P(0.15, 0.15, 0, 0.07, 0.02, 0.03) },
  { key: 'hat.cap', name: 'Baseball Cap', icon: 'hat.cap', tier: 'clothing',
    slots: ['head'], layer: 1, sub: ['hat'], protection: P(0.10, 0.10, 0, 0.07, 0.01, 0.03) },
  { key: 'nightvisiongoggles', name: 'Night Vision Goggles', icon: 'nightvisiongoggles', tier: 'clothing',
    slots: ['head'], layer: 1, sub: ['face'], protection: P(0.15, 0.20, 0, 0.04, 0, 0.03) },

  // ───── CHEST ─────
  { key: 'ballistic.vest', name: 'Ballistic Vest', icon: 'ballistic.vest', tier: 'ballistic',
    slots: ['chest'], layer: 2, protection: P(0.35, 0.20, 0.03, -0.03, 0, 0.03) },
  { key: 'heavy.plate.jacket', name: 'Heavy Plate Jacket', icon: 'heavy.plate.jacket', tier: 'heavy',
    slots: ['chest'], layer: 2, dualLayer: true, blocksADS: true, speedPenalty: 0.2, blocksSlots: ['hands'], protection: P(0.75, 0.70, 0.17, -0.17, 0.07, 0.12) },
  { key: 'metal.plate.torso', name: 'Metal Chest Plate', icon: 'metal.plate.torso', tier: 'metal',
    slots: ['chest'], layer: 2, insertSlots: 3, protection: P(0.25, 0.20, 0, -0.08, 0, 0.03) },
  { key: 'roadsign.jacket', name: 'Road Sign Jacket', icon: 'roadsign.jacket', tier: 'roadsign',
    slots: ['chest'], layer: 2, insertSlots: 3, protection: P(0.20, 0.25, 0, -0.08, 0, 0.10) },
  { key: 'wood.armor.jacket', name: 'Wood Chestplate', icon: 'wood.armor.jacket', tier: 'wood',
    slots: ['chest'], layer: 2, insertSlots: 3, protection: P(0.10, 0.40, 0.05, 0, 0.05, 0.05) },
  { key: 'bone.armor.jacket', name: 'Bone Armor', icon: 'bone.armor.suit', tier: 'bone',
    slots: ['chest', 'legs', 'hands', 'feet'], layer: 2, dualLayer: true, protection: P(0.25, 0.40, 0.07, 0, 0.04, 0.13) },
  { key: 'hoodie', name: 'Hoodie', icon: 'hoodie', tier: 'clothing',
    slots: ['chest'], layer: 1, protection: P(0.20, 0.15, 0, 0.08, 0.05, 0.06) },
  { key: 'jacket.snow', name: 'Snow Jacket', icon: 'jacket.snow', tier: 'clothing',
    slots: ['chest'], layer: 1, dualLayer: true, protection: P(0.20, 0.30, 0, 0.17, 0.20, 0.05) },
  { key: 'shirt.collared', name: 'Shirt', icon: 'shirt.collared', tier: 'clothing',
    slots: ['chest'], layer: 1, protection: P(0.15, 0.15, 0, 0.06, 0.03, 0.05) },
  { key: 'shirt.tanktop', name: 'Tank Top', icon: 'shirt.tanktop', tier: 'clothing',
    slots: ['chest'], layer: 1, protection: P(0.10, 0.10, 0, 0.02, 0.02, 0.03) },
  { key: 'bdu.shirt', name: 'BDU Shirt', icon: 'bdu.shirt', tier: 'clothing',
    slots: ['chest'], layer: 1, protection: P(0.25, 0.20, 0, 0.05, 0.05, 0.06) },
  { key: 'tshirt', name: 'T-Shirt', icon: 'tshirt', tier: 'clothing',
    slots: ['chest'], layer: 1, protection: P(0.15, 0.15, 0, 0.06, 0.03, 0.05) },

  // ───── LEGS ─────
  { key: 'ballistic.legs', name: 'Ballistic Leg Armor', icon: 'ballistic.legarmor', tier: 'ballistic',
    slots: ['legs'], layer: 2, protection: P(0.30, 0.40, 0.03, -0.03, 0, 0.10) },
  { key: 'heavy.plate.pants', name: 'Heavy Plate Pants', icon: 'heavy.plate.pants', tier: 'heavy',
    slots: ['legs'], layer: 2, dualLayer: true, speedPenalty: 0.1, blocksSlots: ['feet'], protection: P(0.75, 0.70, 0.17, -0.17, 0.07, 0.12) },
  { key: 'roadsign.kilt', name: 'Road Sign Kilt', icon: 'roadsign.kilt', tier: 'roadsign',
    slots: ['legs'], layer: 2, insertSlots: 3, protection: P(0.20, 0.25, 0, -0.08, 0, 0.10) },
  { key: 'wood.armor.pants', name: 'Wood Armor Pants', icon: 'wood.armor.pants', tier: 'wood',
    slots: ['legs'], layer: 2, insertSlots: 3, protection: P(0.10, 0.40, 0.05, 0, 0.05, 0.05) },
  { key: 'pants', name: 'Pants', icon: 'pants', tier: 'clothing',
    slots: ['legs'], layer: 1, protection: P(0.15, 0.15, 0, 0.08, 0.05, 0.03) },
  { key: 'bdu.pants', name: 'BDU Pants', icon: 'bdu.pants', tier: 'clothing',
    slots: ['legs'], layer: 1, protection: P(0.20, 0.15, 0, 0.06, 0.05, 0.03) },
  { key: 'shorts', name: 'Shorts', icon: 'pants.shorts', tier: 'clothing',
    slots: ['legs'], layer: 1, protection: P(0.10, 0.10, 0, 0.07, 0.02, 0.03) },

  // ───── HANDS ─────
  { key: 'roadsign.gloves', name: 'Road Sign Gloves', icon: 'roadsign.gloves', tier: 'roadsign',
    slots: ['hands'], layer: 2, protection: P(0.10, 0.25, 0, -0.08, 0, 0.10) },
  { key: 'woodarmor.gloves', name: 'Wood Armor Gloves', icon: 'woodarmor.gloves', tier: 'wood',
    slots: ['hands'], layer: 2, protection: P(0.07, 0.10, 0, 0.05, 0.04, 0.05) },
  { key: 'tactical.gloves', name: 'Tactical Gloves', icon: 'tactical.gloves', tier: 'clothing',
    slots: ['hands'], layer: 2, protection: P(0.10, 0.05, 0, 0.07, 0.05, 0.02) },
  { key: 'burlap.gloves', name: 'Leather Gloves', icon: 'burlap.gloves', tier: 'clothing',
    slots: ['hands'], layer: 2, protection: P(0.05, 0.05, 0, 0.05, 0.04, 0.02) },

  // ───── FEET ─────
  { key: 'shoes.boots', name: 'Boots', icon: 'shoes.boots', tier: 'clothing',
    slots: ['feet'], layer: 2, protection: P(0.10, 0.10, 0, 0.08, 0.03, 0.03) },
  { key: 'attire.hide.boots', name: 'Hide Boots', icon: 'attire.hide.boots', tier: 'clothing',
    slots: ['feet'], layer: 2, protection: P(0.05, 0.05, 0, 0.05, 0.02, 0.03) },
  { key: 'burlap.shoes', name: 'Burlap Shoes', icon: 'burlap.shoes', tier: 'clothing',
    slots: ['feet'], layer: 2, protection: P(0.05, 0.05, 0, 0.03, 0.02, 0.02) },

  // ───── FULL-BODY SUITS ─────
  { key: 'hazmatsuit', name: 'Hazmat Suit', icon: 'hazmatsuit', tier: 'hazmat',
    slots: ['head', 'chest', 'legs', 'hands', 'feet'], layer: 2, dualLayer: true, waterproof: true,
    protection: P(0.30, 0.30, 0.05, 0.08, 0.50, 0.08),
    variants: [
      { name: 'Hazmat Suit', icon: 'hazmatsuit', waterproof: true, protection: P(0.30, 0.30, 0.05, 0.08, 0.50, 0.08) },
      { name: 'Arctic Suit', icon: 'hazmatsuit.arcticsuit', waterproof: true, protection: P(0.30, 0.30, 0.03, 0.33, 0.33, 0.05) },
    ] },
  { key: 'scientistsuit_heavy', name: 'Heavy Scientist Suit', icon: 'scientistsuit.heavy', tier: 'hazmat',
    slots: ['head', 'chest', 'legs', 'hands', 'feet'], layer: 2, dualLayer: true, protection: P(0.30, 0.30, 0.05, 0.08, 0.50, 0.08) },
  { key: 'attire.ninja.suit', name: 'Ninja Suit', icon: 'attire.ninja.suit', tier: 'hazmat',
    slots: ['head', 'chest', 'legs', 'hands', 'feet'], layer: 2, dualLayer: true, waterproof: true, protection: P(0.25, 0.30, 0.05, 0.08, 0.15, 0.08) },
  { key: 'halloween.surgeonsuit', name: 'Surgeon Scrubs', icon: 'halloween.surgeonsuit', tier: 'hazmat',
    slots: ['head', 'chest', 'legs', 'hands', 'feet'], layer: 2, dualLayer: true, waterproof: true, protection: P(0.25, 0.30, 0.05, 0.08, 0.15, 0.08) },
  // Partial suit — covers head/chest/legs but leaves hands & feet free.
  { key: 'paintballoveralls.suit', name: 'Paintball Overalls', icon: 'paintballoveralls.suit', tier: 'hazmat',
    slots: ['head', 'chest', 'legs'], layer: 2, dualLayer: true, protection: P(0.25, 0.30, 0.05, 0.08, 0.15, 0.08) },
];

export interface RustWeapon {
  key: string;
  name: string;
  icon: string;
  category: 'rifles' | 'smgs' | 'pistols' | 'shotguns' | 'bows' | 'melee' | 'explosive';
  damage: number;        // base damage per hit at point-blank (torso, 1×)
  headMult: number;      // headshot multiplier
  type: DamageType;
  rpm?: number;
  /** Pellets per shot (shotguns). Total damage = damage × pellets at point-blank. */
  pellets?: number;
  /** True if this is an area/explosive that ignores most armor differently. */
  aoe?: boolean;
  /**
   * Distance-based damage falloff (Rust uses ammo velocity → effective range).
   * `effectiveRange` = metres before damage starts dropping; past that it falls
   * linearly toward `minDamageFraction` of base by `maxRange`. Melee/explosive
   * leave these undefined (no falloff in this model).
   */
  effectiveRange?: number;
  maxRange?: number;
  minDamageFraction?: number;
  /** Ammo family — drives the ammo-type selector in the UI. */
  ammoClass?: '556' | 'pistol' | 'shotgun' | 'arrow';
  note?: string;
}

// Body-part base multipliers (chest = 1.0). Head uses weapon.headMult.
export const PART_MULT: Record<BodyPart, 'head' | number> = {
  head: 'head', chest: 1.0, legs: 0.5,
};

/** Distance presets used by the range selector in the UI (metres). */
export const RANGE_PRESETS = [
  { key: 'pointblank', label: 'Point Blank', metres: 0 },
  { key: 'close', label: 'Close (15m)', metres: 15 },
  { key: 'mid', label: 'Mid (50m)', metres: 50 },
  { key: 'long', label: 'Long (100m)', metres: 100 },
  { key: 'extreme', label: 'Extreme (150m)', metres: 150 },
] as const;

/**
 * Damage multiplier for a weapon at a given distance. Bullets keep full damage
 * within effectiveRange, then fall off linearly to minDamageFraction at maxRange
 * (matching Rust's velocity-based falloff, e.g. AK ≈ −6% per 50m).
 */
export function rangeFalloff(weapon: RustWeapon, metres: number): number {
  if (!weapon.effectiveRange || !weapon.maxRange || metres <= weapon.effectiveRange) return 1;
  const floor = weapon.minDamageFraction ?? 0.5;
  if (metres >= weapon.maxRange) return floor;
  const t = (metres - weapon.effectiveRange) / (weapon.maxRange - weapon.effectiveRange);
  return 1 - t * (1 - floor);
}

// ── Weapons (verified vs Facepunch wiki ammo tables, June 2026) ──
// Damage is per primary-ammo hit. 5.56 rifles read 50 on the AK page; SMGs/most
// pistols use Pistol Bullet (37.5). Falloff tuned to community values (~6%/50m).
export const RUST_WEAPONS: RustWeapon[] = [
  // Rifles (5.56) — full damage to ~75-100m, gentle falloff after
  { key: 'rifle.ak', name: 'Assault Rifle (AK-47)', icon: 'rifle.ak', category: 'rifles', damage: 50, headMult: 2.0, type: 'projectile', rpm: 450, effectiveRange: 75, maxRange: 300, minDamageFraction: 0.55, ammoClass: '556' },
  { key: 'rifle.lr300', name: 'LR-300', icon: 'rifle.lr300', category: 'rifles', damage: 40, headMult: 2.0, type: 'projectile', rpm: 500, effectiveRange: 75, maxRange: 300, minDamageFraction: 0.55, ammoClass: '556' },
  { key: 'rifle.ak.m16', name: 'M16A2 (burst)', icon: 'm16a2', category: 'rifles', damage: 35, headMult: 2.0, type: 'projectile', rpm: 600, effectiveRange: 70, maxRange: 300, minDamageFraction: 0.55, ammoClass: '556', note: '3-round burst · loot-only' },
  { key: 'rifle.semiauto', name: 'Semi-Auto Rifle', icon: 'rifle.semiauto', category: 'rifles', damage: 40, headMult: 2.0, type: 'projectile', rpm: 343, effectiveRange: 60, maxRange: 250, minDamageFraction: 0.5, ammoClass: '556' },
  { key: 'rifle.sks', name: 'SKS', icon: 'rifle.semiauto', category: 'rifles', damage: 42.5, headMult: 2.0, type: 'projectile', rpm: 380, effectiveRange: 70, maxRange: 300, minDamageFraction: 0.55, ammoClass: '556' },
  { key: 'lmg.m249', name: 'M249', icon: 'lmg.m249', category: 'rifles', damage: 65, headMult: 2.0, type: 'projectile', rpm: 500, effectiveRange: 75, maxRange: 300, minDamageFraction: 0.55, ammoClass: '556' },
  { key: 'rifle.l96', name: 'L96 Rifle', icon: 'rifle.l96', category: 'rifles', damage: 80, headMult: 2.0, type: 'projectile', rpm: 25, effectiveRange: 150, maxRange: 600, minDamageFraction: 0.8, ammoClass: '556' },
  { key: 'rifle.bolt', name: 'Bolt Action Rifle', icon: 'rifle.bolt', category: 'rifles', damage: 80, headMult: 2.0, type: 'projectile', rpm: 32, effectiveRange: 120, maxRange: 500, minDamageFraction: 0.75, ammoClass: '556' },
  { key: 'rifle.m39', name: 'M39 Rifle', icon: 'rifle.m39', category: 'rifles', damage: 50, headMult: 2.0, type: 'projectile', rpm: 300, effectiveRange: 80, maxRange: 350, minDamageFraction: 0.6, ammoClass: '556' },
  { key: 'hmlmg', name: 'HMLMG', icon: 'hmlmg', category: 'rifles', damage: 57.5, headMult: 2.0, type: 'projectile', rpm: 500, effectiveRange: 70, maxRange: 300, minDamageFraction: 0.5, ammoClass: '556' },
  // SMGs (Pistol Bullet = 37.5) — short effective range, steeper falloff
  { key: 'smg.thompson', name: 'Thompson', icon: 'smg.thompson', category: 'smgs', damage: 37.5, headMult: 2.0, type: 'projectile', rpm: 400, effectiveRange: 30, maxRange: 150, minDamageFraction: 0.4, ammoClass: 'pistol' },
  { key: 'smg.2', name: 'Custom SMG', icon: 'smg.2', category: 'smgs', damage: 35, headMult: 2.0, type: 'projectile', rpm: 480, effectiveRange: 25, maxRange: 120, minDamageFraction: 0.4, ammoClass: 'pistol' },
  { key: 'smg.mp5', name: 'MP5A4', icon: 'smg.mp5', category: 'smgs', damage: 40, headMult: 2.0, type: 'projectile', rpm: 600, effectiveRange: 30, maxRange: 150, minDamageFraction: 0.4, ammoClass: 'pistol' },
  { key: 't1_smg', name: 'Handmade SMG', icon: 't1.smg', category: 'smgs', damage: 30, headMult: 2.0, type: 'projectile', rpm: 480, effectiveRange: 20, maxRange: 100, minDamageFraction: 0.35, ammoClass: 'pistol' },
  // Pistols
  { key: 'pistol.m92', name: 'M92 Pistol', icon: 'pistol.m92', category: 'pistols', damage: 45, headMult: 2.0, type: 'projectile', rpm: 400, effectiveRange: 30, maxRange: 150, minDamageFraction: 0.5, ammoClass: 'pistol' },
  { key: 'pistol.python', name: 'Python Revolver', icon: 'pistol.python', category: 'pistols', damage: 50, headMult: 2.0, type: 'projectile', rpm: 171, effectiveRange: 40, maxRange: 180, minDamageFraction: 0.6, ammoClass: 'pistol' },
  { key: 'pistol.revolver', name: 'Revolver', icon: 'pistol.revolver', category: 'pistols', damage: 35, headMult: 2.0, type: 'projectile', rpm: 171, effectiveRange: 25, maxRange: 120, minDamageFraction: 0.5, ammoClass: 'pistol' },
  { key: 'pistol.semiauto', name: 'Semi-Auto Pistol', icon: 'pistol.semiauto', category: 'pistols', damage: 35, headMult: 2.0, type: 'projectile', rpm: 400, effectiveRange: 25, maxRange: 120, minDamageFraction: 0.5, ammoClass: 'pistol' },
  { key: 'pistol.prototype17', name: 'Prototype 17', icon: 'pistol.prototype17', category: 'pistols', damage: 40, headMult: 2.0, type: 'projectile', rpm: 400, effectiveRange: 30, maxRange: 150, minDamageFraction: 0.5, ammoClass: 'pistol' },
  { key: 'revolver.hc', name: 'High Caliber Revolver', icon: 'revolver.hc', category: 'pistols', damage: 65, headMult: 2.0, type: 'projectile', rpm: 120, effectiveRange: 40, maxRange: 180, minDamageFraction: 0.6, ammoClass: 'pistol' },
  { key: 'pistol.nailgun', name: 'Nailgun', icon: 'pistol.nailgun', category: 'pistols', damage: 15, headMult: 1.5, type: 'projectile', rpm: 462, effectiveRange: 10, maxRange: 60, minDamageFraction: 0.3 },
  { key: 'pistol.eoka', name: 'Eoka Pistol', icon: 'pistol.eoka', category: 'pistols', damage: 27, headMult: 2.5, type: 'projectile', rpm: 30, pellets: 14, ammoClass: 'shotgun', note: '14 pellets — point-blank only' },
  // Shotguns (per-pellet × pellets; heavy close-range falloff)
  { key: 'shotgun.pump', name: 'Pump Shotgun', icon: 'shotgun.pump', category: 'shotguns', damage: 14, headMult: 2.0, type: 'projectile', rpm: 55, pellets: 14, effectiveRange: 6, maxRange: 30, minDamageFraction: 0.15, ammoClass: 'shotgun', note: '14 pellets · max ~196 point-blank' },
  { key: 'shotgun.spas12', name: 'Spas-12', icon: 'shotgun.spas12', category: 'shotguns', damage: 14, headMult: 2.0, type: 'projectile', rpm: 120, pellets: 14, effectiveRange: 6, maxRange: 30, minDamageFraction: 0.15, ammoClass: 'shotgun', note: '14 pellets' },
  { key: 'shotgun.double', name: 'Double Barrel', icon: 'shotgun.double', category: 'shotguns', damage: 14, headMult: 2.0, type: 'projectile', rpm: 200, pellets: 14, effectiveRange: 6, maxRange: 30, minDamageFraction: 0.15, ammoClass: 'shotgun', note: '14 pellets · both barrels' },
  { key: 'shotgun.m4', name: 'M4 Shotgun', icon: 'shotgun.m4', category: 'shotguns', damage: 14, headMult: 2.0, type: 'projectile', rpm: 90, pellets: 14, effectiveRange: 6, maxRange: 30, minDamageFraction: 0.15, ammoClass: 'shotgun', note: '14 pellets' },
  { key: 'shotgun.waterpipe', name: 'Waterpipe Shotgun', icon: 'shotgun.waterpipe', category: 'shotguns', damage: 14, headMult: 2.0, type: 'projectile', rpm: 24, pellets: 14, effectiveRange: 5, maxRange: 25, minDamageFraction: 0.15, ammoClass: 'shotgun', note: '14 pellets' },
  // Bows
  { key: 'bow.hunting', name: 'Hunting Bow', icon: 'bow.hunting', category: 'bows', damage: 50, headMult: 2.0, type: 'projectile', rpm: 60 },
  { key: 'bow.compound', name: 'Compound Bow', icon: 'bow.compound', category: 'bows', damage: 75, headMult: 2.0, type: 'projectile', rpm: 50, note: 'Max draw' },
  { key: 'crossbow', name: 'Crossbow', icon: 'crossbow', category: 'bows', damage: 60, headMult: 2.0, type: 'projectile', rpm: 45 },
  // Melee
  { key: 'machete', name: 'Machete', icon: 'machete', category: 'melee', damage: 35, headMult: 2.0, type: 'melee', rpm: 85 },
  { key: 'salvaged.sword', name: 'Salvaged Sword', icon: 'salvaged.sword', category: 'melee', damage: 45, headMult: 2.0, type: 'melee', rpm: 80 },
  { key: 'knife.combat', name: 'Combat Knife', icon: 'knife.combat', category: 'melee', damage: 35, headMult: 2.0, type: 'melee', rpm: 110 },
  { key: 'longsword', name: 'Longsword', icon: 'longsword', category: 'melee', damage: 60, headMult: 2.0, type: 'melee', rpm: 70 },
  { key: 'mace', name: 'Mace', icon: 'mace', category: 'melee', damage: 50, headMult: 2.0, type: 'melee', rpm: 75 },
  { key: 'salvaged.cleaver', name: 'Salvaged Cleaver', icon: 'salvaged.cleaver', category: 'melee', damage: 38, headMult: 2.0, type: 'melee', rpm: 95 },
  { key: 'spear.stone', name: 'Stone Spear', icon: 'spear.stone', category: 'melee', damage: 35, headMult: 2.0, type: 'melee', rpm: 80 },
  { key: 'bone.club', name: 'Bone Club', icon: 'bone.club', category: 'melee', damage: 13, headMult: 2.0, type: 'melee', rpm: 90 },
  { key: 'rock', name: 'Rock', icon: 'rock', category: 'melee', damage: 12, headMult: 2.0, type: 'melee', rpm: 100 },
  // Explosives (direct-hit player damage; armor uses explosion resist)
  { key: 'ammo.rocket.basic', name: 'Rocket (direct hit)', icon: 'ammo.rocket.basic', category: 'explosive', damage: 350, headMult: 1.0, type: 'explosion', aoe: true, note: 'Direct impact + 3.8m splash' },
  { key: 'ammo.rocket.hv', name: 'HV Rocket (direct hit)', icon: 'ammo.rocket.hv', category: 'explosive', damage: 200, headMult: 1.0, type: 'explosion', aoe: true, note: 'Direct impact + small splash' },
  { key: 'ammo.rocket.fire', name: 'Incendiary Rocket', icon: 'ammo.rocket.fire', category: 'explosive', damage: 25, headMult: 1.0, type: 'explosion', aoe: true, note: 'Low direct, fire DoT' },
  { key: 'explosive.timed', name: 'C4 (Timed Explosive)', icon: 'explosive.timed', category: 'explosive', damage: 550, headMult: 1.0, type: 'explosion', aoe: true, note: 'Lethal in blast radius' },
  { key: 'explosive.satchel', name: 'Satchel Charge', icon: 'explosive.satchel', category: 'explosive', damage: 130, headMult: 1.0, type: 'explosion', aoe: true },
  { key: 'grenade.f1', name: 'F1 Grenade', icon: 'grenade.f1', category: 'explosive', damage: 60, headMult: 1.0, type: 'explosion', aoe: true, note: 'Fragmentation' },
  { key: 'grenade.beancan', name: 'Beancan Grenade', icon: 'grenade.beancan', category: 'explosive', damage: 35, headMult: 1.0, type: 'explosion', aoe: true },
  { key: 'ammo.grenadelauncher.he', name: '40mm HE Grenade', icon: 'ammo.grenadelauncher.he', category: 'explosive', damage: 130, headMult: 1.0, type: 'explosion', aoe: true },
];

export const PLAYER_HP = 100;
export type Loadout = Partial<Record<ArmorSlot, ArmorPiece[]>>;

/**
 * Selectable ammo types. `damageMult` scales the bullet's base damage,
 * `rangeMult` widens/narrows effective range (HV flies further, incendiary
 * drops sooner), and `dot`/`splash` flag the secondary effects. Values are
 * cross-referenced from the Facepunch wiki ammo pages + community testing:
 *   • HV   — same direct damage, flatter trajectory & longer effective range.
 *   • Incendiary — ~+12% direct + a burning damage-over-time, slower/short.
 *   • Explosive  — same direct damage + structure/AoE splash, slower & arcs.
 */
export interface AmmoType {
  key: string;
  name: string;
  short: string;
  damageMult: number;
  rangeMult: number;
  dot?: number;          // extra burn damage over its duration (approx total)
  splash?: boolean;
  note?: string;
}

export const AMMO_TYPES: Record<NonNullable<RustWeapon['ammoClass']>, AmmoType[]> = {
  '556': [
    { key: 'standard', name: '5.56 Rifle Ammo', short: 'Standard', damageMult: 1, rangeMult: 1 },
    { key: 'hv', name: 'HV 5.56 Ammo', short: 'HV', damageMult: 1, rangeMult: 1.35, note: 'Faster, far less drop — better at range' },
    { key: 'incendiary', name: 'Incendiary 5.56', short: 'Incendiary', damageMult: 1.12, rangeMult: 0.8, dot: 10, note: '+fire DoT, more bullet drop' },
    { key: 'explosive', name: 'Explosive 5.56', short: 'Explosive', damageMult: 1, rangeMult: 0.85, splash: true, note: 'Direct + structure/AoE splash' },
  ],
  pistol: [
    { key: 'standard', name: 'Pistol Bullet', short: 'Standard', damageMult: 1, rangeMult: 1 },
    { key: 'hv', name: 'HV Pistol Ammo', short: 'HV', damageMult: 1, rangeMult: 1.3, note: 'Faster, flatter — better at range' },
    { key: 'incendiary', name: 'Incendiary Pistol', short: 'Incendiary', damageMult: 1.1, rangeMult: 0.85, dot: 8, note: '+fire DoT' },
  ],
  shotgun: [
    { key: 'handmade', name: 'Handmade Shell', short: 'Handmade', damageMult: 0.65, rangeMult: 0.9, note: 'Cheap, weaker pellets' },
    { key: '12gauge', name: '12 Gauge Buckshot', short: 'Buckshot', damageMult: 1, rangeMult: 1 },
    { key: 'slug', name: '12 Gauge Slug', short: 'Slug', damageMult: 1, rangeMult: 2.2, note: 'Single solid slug, long range (treated as 1 pellet)' },
    { key: 'incendiary', name: 'Incendiary Shell', short: 'Incendiary', damageMult: 0.85, rangeMult: 0.9, dot: 12, note: '+fire DoT' },
  ],
  arrow: [
    { key: 'wooden', name: 'Wooden Arrow', short: 'Wooden', damageMult: 1, rangeMult: 1 },
    { key: 'hv', name: 'HV Arrow', short: 'HV', damageMult: 0.75, rangeMult: 1.4, note: 'Faster, flatter, less damage' },
    { key: 'bone', name: 'Bone Arrow', short: 'Bone', damageMult: 1.1, rangeMult: 0.85 },
    { key: 'fire', name: 'Fire Arrow', short: 'Fire', damageMult: 0.6, rangeMult: 0.8, dot: 15 },
  ],
};

/** Default (first) ammo type for a weapon, or null if it has no ammo class. */
export function defaultAmmo(weapon: RustWeapon): AmmoType | null {
  if (!weapon.ammoClass) return null;
  return AMMO_TYPES[weapon.ammoClass][0];
}

/**
 * Combined protection fraction covering a body part for a damage type. Layers
 * stack MULTIPLICATIVELY (each reduces the remaining damage), matching Rust.
 * Socketed inserts add their per-type protection to the host piece.
 */
export function partProtection(loadout: Loadout, slot: ArmorSlot, type: DamageType): number {
  const pieces = loadout[slot] || [];
  let remaining = 1;
  for (const p of pieces) remaining *= (1 - pieceProtection(p, type));
  return 1 - remaining;
}

/** A single piece's protection for a damage type, including socketed inserts. */
export function pieceProtection(p: ArmorPiece, type: DamageType): number {
  let v = p.protection[type] || 0;
  if (p.inserts?.length && (type === 'projectile' || type === 'melee' || type === 'explosion')) {
    for (const key of p.inserts) {
      const ins = ARMOR_INSERTS.find((i) => i.key === key);
      if (ins) v += ins[type] || 0;
    }
  }
  return Math.min(1, v);
}

/** A piece's radiation/cold value including inserts (radiation only). */
export function pieceMisc(p: ArmorPiece, kind: 'radiation' | 'cold'): number {
  let v = p.protection[kind] || 0;
  if (p.inserts?.length && kind === 'radiation') {
    for (const key of p.inserts) {
      const ins = ARMOR_INSERTS.find((i) => i.key === key);
      if (ins) v += ins.radiation || 0;
    }
  }
  return v;
}

/**
 * Combined protection across MULTIPLE slots for a damage type (multiplicative,
 * like layering). Used to group the minor hitboxes into Rust's 3 display zones:
 * arms/hands fold into Chest, feet fold into Legs.
 *
 * A single multi-slot piece (full-body suit) is stored in every slot it covers,
 * so we dedupe by piece key per zone — otherwise the suit gets multiplied
 * against itself (e.g. chest 30% × hands 30% = 51%) and shows inflated, uneven
 * per-zone values. A suit applies its one protection value uniformly.
 */
function groupProtection(loadout: Loadout, slots: ArmorSlot[], type: DamageType): number {
  let remaining = 1;
  const counted = new Set<string>();
  for (const slot of slots) {
    for (const p of loadout[slot] || []) {
      // Multi-slot suits occupy several slots in this zone — count once.
      if (p.slots.length > 1) {
        if (counted.has(p.key)) continue;
        counted.add(p.key);
      }
      remaining *= (1 - pieceProtection(p, type));
    }
  }
  return 1 - remaining;
}

export interface HitResult {
  part: BodyPart;
  baseDamage: number;
  multiplier: number;
  protection: number;
  finalDamage: number;
  dotDamage: number;     // extra fire/burn damage (ignores armor part mult)
  hitsToKill: number;
  ttkSeconds: number;   // time to land hitsToKill shots at the weapon's RPM
}

/** Per-body-part damage for a weapon vs a loadout at a given distance (metres). */
export function computeHits(weapon: RustWeapon, loadout: Loadout, metres = 0, ammo?: AmmoType | null): HitResult[] {
  const dmgMult = ammo?.damageMult ?? 1;
  const rangeMult = ammo?.rangeMult ?? 1;
  // Slugs behave as a single projectile rather than a pellet spread.
  const isSlug = ammo?.key === 'slug';
  const pellets = isSlug ? 1 : weapon.pellets;
  // Apply ammo range multiplier by stretching the weapon's effective range.
  const stretched: RustWeapon = rangeMult === 1 ? weapon : {
    ...weapon,
    effectiveRange: weapon.effectiveRange ? weapon.effectiveRange * rangeMult : weapon.effectiveRange,
    maxRange: weapon.maxRange ? weapon.maxRange * rangeMult : weapon.maxRange,
  };
  const perHitBase = (pellets ? weapon.damage * pellets : weapon.damage) * dmgMult;
  const perHit = perHitBase * rangeFalloff(stretched, metres);
  const dot = ammo?.dot ?? 0;
  const secsPerShot = weapon.rpm && weapon.rpm > 0 ? 60 / weapon.rpm : 0;
  return BODY_PARTS.map((part) => {
    // Explosives deal uniform damage to every body part — no head/leg scaling.
    const mult = weapon.type === 'explosion'
      ? 1
      : (PART_MULT[part] === 'head' ? weapon.headMult : (PART_MULT[part] as number));
    const slot = PART_TO_SLOT[part];
    const prot = partProtection(loadout, slot, weapon.type);
    const finalDamage = perHit * mult * (1 - prot);
    const total = finalDamage + dot;
    const htk = total > 0 ? Math.ceil(PLAYER_HP / total) : Infinity;
    return {
      part, baseDamage: perHit, multiplier: mult, protection: prot, finalDamage,
      dotDamage: dot,
      hitsToKill: htk,
      ttkSeconds: htk === Infinity ? Infinity : (htk - 1) * secsPerShot,
    };
  });
}

/** Total effective HP vs a damage type (how much raw damage to die), torso. */
export function effectiveHP(loadout: Loadout, type: DamageType): number {
  const prot = partProtection(loadout, 'chest', type);
  return PLAYER_HP / (1 - prot);
}

export interface ArmorSetSummary {
  projectile: number; melee: number; explosion: number;
  speedPenalty: number; blocksADS: boolean;
  /** Global stats (summed across all worn pieces, like the in-game panel). */
  radiation: number; cold: number; animal: number; explosionGlobal: number;
  waterproof: boolean;
}

/** Aggregate set summary using the chest as the representative torso value. */
export function setSummary(loadout: Loadout): ArmorSetSummary {
  let speed = 0; let ads = false;
  let radiation = 0; let cold = 0; let animal = 0; let waterproof = false;
  // A multi-slot suit is stored as the same piece in several slots — count each
  // unique worn piece only once for the global totals.
  const seen = new Set<string>();
  for (const slot of Object.keys(loadout) as ArmorSlot[]) {
    for (const p of loadout[slot] || []) {
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      speed += p.speedPenalty || 0;
      if (p.blocksADS) ads = true;
      if (p.waterproof) waterproof = true;
      radiation += pieceMisc(p, 'radiation');
      cold += p.protection.cold || 0;
      animal += p.protection.bite || 0;
    }
  }
  return {
    projectile: partProtection(loadout, 'chest', 'projectile'),
    melee: partProtection(loadout, 'chest', 'melee'),
    explosion: partProtection(loadout, 'chest', 'explosion'),
    speedPenalty: speed, blocksADS: ads,
    // Explosion protection is per body part, not additive across pieces — show
    // the torso's combined value rather than a meaningless sum.
    radiation, cold, animal, explosionGlobal: partProtection(loadout, 'chest', 'explosion'), waterproof,
  };
}

/**
 * Per-zone protection for the parts panel. Rust groups armor coverage into
 * three display zones: Head, Chest (incl. arms/hands) and Legs (incl. feet).
 * Gloves therefore contribute to the Chest zone and boots to the Legs zone.
 */
export interface PartSummary { part: BodyPart; projectile: number; melee: number; explosion: number; }
const ZONE_SLOTS: Record<BodyPart, ArmorSlot[]> = {
  head: ['head'],
  chest: ['chest', 'hands'],
  legs: ['legs', 'feet'],
};
export function partSummaries(loadout: Loadout): PartSummary[] {
  return BODY_PARTS.map((part) => {
    const slots = ZONE_SLOTS[part];
    return {
      part,
      projectile: groupProtection(loadout, slots, 'projectile'),
      melee: groupProtection(loadout, slots, 'melee'),
      explosion: groupProtection(loadout, slots, 'explosion'),
    };
  });
}

/** Slots made unusable by currently-equipped pieces (e.g. heavy plate). */
export function blockedSlots(loadout: Loadout): Set<ArmorSlot> {
  const blocked = new Set<ArmorSlot>();
  for (const slot of Object.keys(loadout) as ArmorSlot[]) {
    for (const p of loadout[slot] || []) {
      for (const b of p.blocksSlots || []) blocked.add(b);
    }
  }
  return blocked;
}

/** Preset loadouts players actually run. */
export interface LoadoutPreset { name: string; pieces: string[]; }
export const LOADOUT_PRESETS: LoadoutPreset[] = [
  { name: 'Full Metal', pieces: ['metal.facemask', 'metal.plate.torso', 'roadsign.kilt', 'hoodie', 'pants', 'roadsign.gloves', 'shoes.boots'] },
  { name: 'Heavy Plate', pieces: ['heavy.plate.helmet', 'heavy.plate.jacket', 'heavy.plate.pants'] },
  { name: 'Ballistic', pieces: ['ballistic.helmet', 'ballistic.vest', 'ballistic.legs', 'bdu.shirt', 'bdu.pants', 'roadsign.gloves', 'shoes.boots'] },
  { name: 'Roadsign / Coffee', pieces: ['coffeecan.helmet', 'roadsign.jacket', 'roadsign.kilt', 'hoodie', 'pants', 'roadsign.gloves', 'shoes.boots'] },
  { name: 'Budget Fight', pieces: ['bucket.helmet', 'roadsign.jacket', 'roadsign.kilt', 'hoodie', 'pants', 'shoes.boots'] },
  { name: 'Wood Tier', pieces: ['wood.armor.helmet', 'wood.armor.jacket', 'wood.armor.pants', 'hoodie', 'pants'] },
  { name: 'Hazmat', pieces: ['hazmatsuit'] },
  { name: 'Naked', pieces: [] },
];
