import { useMemo, useState } from 'react';
import {
  Terminal, Play, Trash2, Crosshair, Target, Skull, Activity,
  ArrowUpRight, ArrowDownLeft, Ban, LayoutGrid, ListOrdered, Ruler, Swords,
} from 'lucide-react';
import './CombatLogTool.css';

type EventType = 'dealt' | 'taken' | 'invalid' | 'kill' | 'death' | 'generic' | 'entity';
type Zone = 'head' | 'chest' | 'stomach' | 'arms' | 'legs' | 'other';
type View = 'overview' | 'timeline';

interface CombatEvent {
  time: string;
  attacker: string;   // resolved, human-readable
  victim: string;     // resolved, human-readable
  weapon: string;     // resolved display name ('' when unknown)
  ammo: string;       // resolved ammo/projectile ('' when none)
  area: string;       // bone / hit area ('' when none)
  zone: Zone;         // bucketed body region
  distance: string;   // formatted, e.g. "18.2m"
  oldHp: number | null;
  newHp: number | null;
  damage: number | null;  // only set when both HP values are present
  info: string;
  type: EventType;
}

interface ZoneCount { hits: number; dmg: number; }

interface OpponentStat {
  name: string;
  damageDealt: number;
  damageTaken: number;
  hitsDealt: number;
  hitsTaken: number;
  headshots: number;
  invalids: number;
  weapons: string[];
  maxDistance: number;
  distSum: number;
  distSamples: number;
  killed: boolean;   // you killed them
  died: boolean;     // they killed you
  zones: Record<Zone, ZoneCount>;
}

interface HitDistribution {
  zones: Record<Zone, ZoneCount>;
  totalHits: number;
  totalDmg: number;
}

const emptyStats = {
  damageDealt: 0, damageTaken: 0, headshots: 0,
  hits: 0, invalids: 0, kills: 0, deaths: 0,
};
const zc = (): ZoneCount => ({ hits: 0, dmg: 0 });
const emptyZones = (): Record<Zone, ZoneCount> => ({
  head: zc(), chest: zc(), stomach: zc(), arms: zc(), legs: zc(), other: zc(),
});
const emptyDist = (): HitDistribution => ({ zones: emptyZones(), totalHits: 0, totalDmg: 0 });

const SAMPLE_LOG_PVP = `00:01.12 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle head 18.2m 100.0 65.2 hit
00:01.35 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle chest 18.1m 65.2 40.5 hit
00:01.55 Ninja_Pete 76561198000000002 you 76561198000000001 assets/prefabs/weapons/mp5/mp5.entity.prefab ammo.pistol chest 18.0m 100.0 80.4 hit
00:01.78 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle head 18.0m 40.5 10.1 hit
00:01.99 Ninja_Pete 76561198000000002 you 76561198000000001 assets/prefabs/weapons/mp5/mp5.entity.prefab ammo.pistol stomach 18.0m 80.4 55.2 hit
00:02.12 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle leftarm 18.0m 55.2 38.0 hit
00:02.40 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle chest 18.0m 10.1 0.0 killed
00:03.40 assets/prefabs/npc/scientist/scientistnpc_roam.prefab 0 you 76561198000000001 assets/prefabs/weapons/spas12/spas12.entity.prefab ammo.shotgun rightleg 9.4m 100.0 71.0 hit
00:03.95 you 76561198000000001 assets/prefabs/npc/scientist/scientistnpc_roam.prefab 0 assets/prefabs/weapons/spear wooden/spear.wooden.entity.prefab ammo.spear head 4.1m 80.0 0.0 killed
00:05.10 Bolt_Andy 76561198000000003 you 76561198000000001 assets/prefabs/weapons/bolt rifle/bolt.entity.prefab ammo.rifle head 115.4m 55.2 0.0 killed`;

const SAMPLE_LOG_DESYNC = `10:14.05 you 76561198000000001 Shifty_Sam 76561198000000004 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle chest 25.4m 100.0 75.1 hit
10:14.22 you 76561198000000001 Shifty_Sam 76561198000000004 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle chest 25.5m 75.1 invalid projectile_invalid
10:14.40 you 76561198000000001 Shifty_Sam 76561198000000004 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle head 25.5m 75.1 invalid projectile_invalid
10:14.65 Shifty_Sam 76561198000000004 you 76561198000000001 assets/prefabs/weapons/smg/smg.entity.prefab ammo.pistol chest 25.2m 100.0 60.5 hit 0.42 187ms
10:14.80 Shifty_Sam 76561198000000004 you 76561198000000001 assets/prefabs/weapons/smg/smg.entity.prefab ammo.pistol head 25.1m 60.5 15.0 hit 0.39 203ms
10:15.02 Shifty_Sam 76561198000000004 you 76561198000000001 assets/prefabs/weapons/smg/smg.entity.prefab ammo.pistol chest 25.0m 15.0 0.0 killed 0.40 211ms`;

// ── helpers ────────────────────────────────────────────────
const titleCase = (s: string) =>
  s.replace(/[._\-]+/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Format a raw distance token ("18.20m" / "18.2") into a tidy "18.2m". */
function fmtDistance(raw: string): string {
  if (!raw) return '—';
  const n = parseFloat(raw);
  if (!isFinite(n)) return raw;
  return `${n.toFixed(1)}m`;
}

/** Turn a weapon column (short name OR full prefab path) into a clean display name. */
function resolveWeapon(raw: string): string {
  if (!raw) return '';
  let seg = raw.trim();
  if (seg.includes('/')) seg = seg.slice(seg.lastIndexOf('/') + 1);
  seg = seg
    .replace(/\.entity\.prefab$/i, '')
    .replace(/\.deployed$/i, '')
    .replace(/\.prefab$/i, '')
    .replace(/\.entity$/i, '');
  const n = seg.toLowerCase().replace(/[._\-\s]/g, '');
  if (!n) return '';

  if (n.includes('ak47') || n.includes('rifleak')) return 'AK-47';
  if (n.includes('lr300') || n.includes('lr3') || n === 'lr') return 'LR-300';
  if (n.includes('m249')) return 'M249';
  if (n.includes('m39')) return 'M39';
  if (n.includes('mp5')) return 'MP5';
  if (n.includes('thompson')) return 'Thompson';
  if (n.includes('customsmg') || n.includes('smg') || n.includes('custom')) return 'Custom SMG';
  if (n.includes('bolt')) return 'Bolt Action';
  if (n.includes('l96') || n.includes('m92')) return n.includes('l96') ? 'L96' : 'M92';
  if (n.includes('semiautorifle') || n.includes('sar')) return 'Semi-Auto Rifle';
  if (n.includes('crossbow')) return 'Crossbow';
  if (n.includes('bow') || n.includes('compound')) return 'Bow';
  if (n.includes('spas') || n.includes('pump') || n.includes('double') || n.includes('shotgun') || n.includes('waterpipe')) return 'Shotgun';
  if (n.includes('nailgun') || n.includes('nail')) return 'Nailgun';
  if (n.includes('rocket') || n.includes('rpg')) return 'Rocket';
  if (n.includes('grenade') || n.includes('f1')) return 'Grenade';
  if (n.includes('revolver')) return 'Revolver';
  if (n.includes('python')) return 'Python';
  if (n.includes('m92')) return 'M92';
  if (n.includes('semiautopistol') || n.includes('semiauto') || n.includes('pistol')) return 'Pistol';
  if (n.includes('spear')) return 'Spear';
  if (n.includes('machete') || n.includes('knife') || n.includes('salvaged') || n.includes('mace') || n.includes('sword')) return 'Melee';
  if (n.includes('rock')) return 'Rock';
  if (n.includes('eoka')) return 'Eoka';
  if (n.includes('flame')) return 'Flamethrower';
  if (n.includes('beancan') || n.includes('satchel')) return 'Explosive';
  return titleCase(seg) || raw;
}

/** Turn the ammo/projectile column into a short, readable label ('' when not meaningful). */
function resolveAmmo(raw: string): string {
  if (!raw) return '';
  const s = raw.trim().toLowerCase();
  if (!s || s === '0' || s === '-1' || s.includes('/') || s.endsWith('.prefab')) return '';

  if (s.includes('rocket')) return 'Rocket';
  if (s.includes('slug')) return 'Slug';
  if (s.includes('handmade')) return 'Handmade';
  if (s.includes('shotgun')) return 'Buckshot';
  if (s.includes('pistol')) return 'Pistol';
  if (s.includes('rifle') && s.includes('hv')) return 'HV 5.56';
  if (s.includes('rifle') && s.includes('explosive')) return 'Explo 5.56';
  if (s.includes('rifle') && s.includes('incendiary')) return 'Incen 5.56';
  if (s.includes('rifle')) return '5.56';
  if (s.includes('nail')) return 'Nails';
  if (s.includes('arrow') && s.includes('hv')) return 'HV Arrow';
  if (s.includes('arrow') && s.includes('fire')) return 'Fire Arrow';
  if (s.includes('arrow') && s.includes('bone')) return 'Bone Arrow';
  if (s.includes('arrow')) return 'Arrow';
  // melee / thrown weapons re-state themselves in the ammo column → not useful as ammo
  if (s.includes('spear') || s.includes('grenade') || s.includes('melee')) return '';
  return titleCase(s.replace(/^ammo\./, ''));
}

// Keywords that mark a token as a world entity / deployable / NPC / animal — never a player.
// Used only as a fallback when no SteamID64 is present (the strongest player signal).
const ENTITY_KEYWORDS = [
  // loot & deployables
  'barrel', 'lootbarrel', 'wall', 'door', 'window', 'box', 'crate', 'barricade',
  'furnace', 'campfire', 'building', 'foundation', 'floor', 'roof', 'wallframe',
  'shelf', 'locker', 'sleepingbag', 'workbench', 'cupboard', 'toolcupboard',
  'hatch', 'gate', 'embrasure', 'ladder', 'sign', 'lantern', 'planter',
  'shutter', 'fridge', 'shopfront', 'turret', 'samsite', 'beartrap',
  'landmine', 'spikes', 'flameturret', 'deployable', 'prefab',
  // NPCs & animals
  'scientist', 'tunneldweller', 'dweller', 'scarecrow', 'murderer', 'zombie',
  'npc', 'bear', 'wolf', 'boar', 'stag', 'deer', 'chicken', 'shark', 'horse',
  'bradley', 'helicopter', 'patrolheli', 'animal',
];

/**
 * Decide whether a single name token denotes a real player (vs prefab / NPC / entity / placeholder).
 * A real player is: the literal `you`, a 17-digit SteamID64, or a plain gamertag that is neither a
 * prefab path, a `player_<n>` placeholder, nor an entity/NPC keyword.
 */
function isPlayerToken(raw: string): boolean {
  const v = (raw || '').trim();
  if (!v) return false;
  if (v.toLowerCase() === 'you') return true;
  if (/^\d{17}$/.test(v)) return true;             // SteamID64
  if (v.includes('/')) return false;               // prefab path (e.g. assets/prefabs/...)
  if (/^player_?\d+$/i.test(v)) return false;      // placeholder, not a usable gamertag
  if (/\.(prefab|entity|deployed)\b/i.test(v)) return false;
  const n = v.toLowerCase().replace(/[._\-\s]/g, '');
  if (ENTITY_KEYWORDS.some((k) => n.includes(k))) return false;
  return true;                                     // plain gamertag
}

/**
 * Whether one side of a combat line (its name column + optional id column) resolves to an actual
 * player. A valid 17-digit SteamID64 is the strongest signal; otherwise fall back to the name token.
 */
function isPlayerSide(nameRaw: string, idRaw: string): boolean {
  if (/^\d{17}$/.test((idRaw || '').trim())) return true; // real Steam account ⇒ player
  return isPlayerToken(nameRaw);
}

/**
 * Resolve an actor (attacker/victim) for display using both its name and id columns.
 * `player_<n>` placeholders are cleaned to the short SteamID (when available) or "Unknown".
 */
function resolveActor(nameRaw: string, idRaw: string): string {
  const name = (nameRaw || '').trim();
  const id = (idRaw || '').trim();
  if (/^player_?\d+$/i.test(name)) {
    return /^\d{17}$/.test(id) ? `Steam …${id.slice(-5)}` : 'Unknown';
  }
  return resolveName(name);
}

/** Turn an attacker/target column (name, steamID64, or prefab path) into a clean label. */
function resolveName(raw: string): string {
  if (!raw) return 'Unknown';
  const v = raw.trim();
  if (v.toLowerCase() === 'you') return 'You';
  if (/^player_?\d+$/i.test(v)) return 'Unknown';  // Rust placeholder when display name is missing
  if (/^\d{17}$/.test(v)) return `Steam …${v.slice(-5)}`;

  if (v.includes('/')) {
    const lower = v.toLowerCase();
    if (lower.includes('scientist')) return 'Scientist';
    if (lower.includes('tunneldweller') || lower.includes('tunnel_dweller')) return 'Tunnel Dweller';
    if (lower.includes('scarecrow')) return 'Scarecrow';
    if (lower.includes('murderer')) return 'Murderer';
    if (lower.includes('bradley')) return 'Bradley APC';
    if (lower.includes('patrolhelicopter') || lower.includes('helicopter')) return 'Patrol Heli';
    if (lower.includes('bear')) return 'Bear';
    if (lower.includes('wolf')) return 'Wolf';
    if (lower.includes('boar')) return 'Boar';
    if (lower.includes('stag') || lower.includes('deer')) return 'Stag';
    if (lower.includes('chicken')) return 'Chicken';
    if (lower.includes('shark')) return 'Shark';
    let seg = v.slice(v.lastIndexOf('/') + 1)
      .replace(/\.prefab$/i, '').replace(/\.entity$/i, '')
      .replace(/npc[_\s]*/i, '').replace(/[_\s]*roam$/i, '');
    return titleCase(seg) || 'NPC';
  }
  return v; // plain readable player name
}

const HEAD = ['head'];
const CHEST = ['chest', 'breast', 'spine', 'body', 'neck', 'clavicle', 'shoulder'];
const STOMACH = ['stomach', 'pelvis', 'hip', 'abdomen', 'groin'];
function zoneOf(area: string): Zone {
  const a = area.toLowerCase().replace(/[._\-\s]/g, '');
  if (!a) return 'other';
  if (HEAD.includes(a) || a.includes('head') || a.includes('jaw') || a.includes('skull')) return 'head';
  if (CHEST.some((k) => a.includes(k))) return 'chest';
  if (STOMACH.some((k) => a.includes(k))) return 'stomach';
  if (/arm|hand|finger|elbow|wrist|forearm|thumb/.test(a)) return 'arms';
  if (/leg|thigh|calf|knee|foot|feet|shin|ankle|toe/.test(a)) return 'legs';
  return 'other';
}

const ZONE_META: { key: Zone; label: string }[] = [
  { key: 'head', label: 'Head' },
  { key: 'chest', label: 'Chest' },
  { key: 'stomach', label: 'Stomach' },
  { key: 'arms', label: 'Arms' },
  { key: 'legs', label: 'Legs' },
  { key: 'other', label: 'Other' },
];

const ZONE_COLOR: Record<Zone, string> = {
  head: 'var(--color-danger)',
  chest: 'var(--color-accent)',
  stomach: 'var(--color-warning)',
  arms: 'var(--color-info)',
  legs: 'var(--color-success)',
  other: 'var(--color-text-muted)',
};

export function CombatLogTool() {
  const [logText, setLogText] = useState('');
  const [parsed, setParsed] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const [view, setView] = useState<View>('overview');
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [stats, setStats] = useState({ ...emptyStats });
  const [opponents, setOpponents] = useState<Record<string, OpponentStat>>({});
  const [hitDistribution, setHitDistribution] = useState<HitDistribution>(emptyDist());

  const loadSample = (sample: string) => { setLogText(sample); parseLog(sample); };

  const clearLog = () => {
    setLogText(''); setEvents([]); setParsed(false); setShowInput(true); setView('overview');
    setStats({ ...emptyStats }); setOpponents({}); setHitDistribution(emptyDist());
  };

  const parseLog = (textToParse?: string) => {
    const text = textToParse !== undefined ? textToParse : logText;
    if (!text.trim()) return;

    const parsedEvents: CombatEvent[] = [];
    let dmgDealt = 0, dmgTaken = 0, hs = 0, hits = 0, invalids = 0, kills = 0, deaths = 0;
    const dist = emptyDist();
    const opponentMap: Record<string, OpponentStat> = {};

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const low = line.toLowerCase();
      if (low.startsWith('time') || low.startsWith('active') || low.startsWith('attacker')) continue;

      const t = line.split(/\s+/);
      if (t.length < 6) continue;

      // Anchor on the distance token (e.g. "18.2m") — everything is positioned around it.
      const di = t.findIndex((tok, idx) => idx > 0 && /^\d+(\.\d+)?m$/i.test(tok));
      if (di < 4) continue; // not a parseable combat line

      const time = t[0];
      const distanceRaw = t[di];
      const oldRaw = t[di + 1];
      const newRaw = t[di + 2];
      const info = t.slice(di + 3).join(' ').trim();
      const area = di - 1 > 0 ? t[di - 1] : '';
      const ammoRaw = di - 2 > 0 ? t[di - 2] : '';
      const middle = t.slice(1, di - 2); // attacker, attackerId, target, targetId, weapon…

      // Locate the two numeric ID columns inside `middle`.
      const idIdx: number[] = [];
      middle.forEach((tok, i) => { if (/^\d+$/.test(tok)) idIdx.push(i); });

      let attackerRaw = '', victimRaw = '', weaponRaw = '';
      let attackerIdRaw = '', victimIdRaw = '';
      if (idIdx.length >= 2) {
        const a = idIdx[0], b = idIdx[1];
        attackerRaw = middle.slice(0, a).join(' ');
        attackerIdRaw = middle[a];
        victimRaw = middle.slice(a + 1, b).join(' ');
        victimIdRaw = middle[b];
        weaponRaw = middle.slice(b + 1).join(' ');
      } else if (idIdx.length === 1) {
        const a = idIdx[0];
        attackerRaw = middle.slice(0, a).join(' ');
        attackerIdRaw = middle[a];
        const rest = middle.slice(a + 1);
        victimRaw = rest[0] || '';
        weaponRaw = rest.slice(1).join(' ');
      } else {
        attackerRaw = middle[0] || '';
        victimRaw = middle[1] || '';
        weaponRaw = middle.slice(2).join(' ');
      }

      const attacker = resolveActor(attackerRaw, attackerIdRaw);
      const victim = resolveActor(victimRaw, victimIdRaw);
      const weapon = resolveWeapon(weaponRaw);
      const ammo = resolveAmmo(ammoRaw);

      const oldHp = oldRaw && /^\d+(\.\d+)?$/.test(oldRaw) ? parseFloat(oldRaw) : null;
      const newHp = newRaw && /^\d+(\.\d+)?$/.test(newRaw) ? parseFloat(newRaw) : null;
      const isInvalid = /invalid|projectile_invalid|desync/i.test(newRaw + ' ' + info);
      // Damage is only real when both HP readings are present — never estimated.
      const damage = oldHp !== null && newHp !== null ? Math.max(0, Math.round(oldHp - newHp)) : null;
      const distNum = parseFloat(distanceRaw);
      const zone = zoneOf(area);

      const isAtkYou = attacker === 'You';
      const isVicYou = victim === 'You';
      // Only real players count toward kills/deaths — barrels, deployables and NPCs do not.
      const atkPlayer = isPlayerSide(attackerRaw, attackerIdRaw);
      const vicPlayer = isPlayerSide(victimRaw, victimIdRaw);
      const isKillEvent = !isInvalid && (/killed|death/i.test(info) || newHp === 0);

      let type: EventType = 'generic';
      if (isInvalid) {
        type = 'invalid';
      } else if (isAtkYou) {
        // You as attacker: a finishing blow on a non-player is an entity kill, not a player kill.
        if (isKillEvent) type = vicPlayer ? 'kill' : 'entity';
        else type = 'dealt';
      } else if (isVicYou) {
        // You as victim: only a player finishing you counts as a death.
        type = (isKillEvent && atkPlayer) ? 'death' : 'taken';
      } else {
        type = 'generic';
      }

      parsedEvents.push({
        time, attacker, victim, weapon, ammo, area: area || '', zone,
        distance: fmtDistance(distanceRaw), oldHp, newHp, damage, info, type,
      });

      if (type === 'kill') kills++;
      else if (type === 'death') deaths++;

      // opponent aggregation (skip self / unknown)
      const opName = isAtkYou ? victim : attacker;
      if (opName && opName !== 'You' && opName !== 'Unknown') {
        const op = opponentMap[opName] ?? (opponentMap[opName] = {
          name: opName, damageDealt: 0, damageTaken: 0, hitsDealt: 0, hitsTaken: 0,
          headshots: 0, invalids: 0, weapons: [], maxDistance: 0, distSum: 0, distSamples: 0,
          killed: false, died: false, zones: emptyZones(),
        });

        if (isFinite(distNum) && distNum > 0) {
          op.distSum += distNum; op.distSamples++;
          if (distNum > op.maxDistance) op.maxDistance = distNum;
        }

        if (isInvalid) { invalids++; op.invalids++; }
        else if (type === 'dealt' || type === 'kill' || type === 'entity') {
          hits++; op.hitsDealt++;
          if (damage !== null) { dmgDealt += damage; op.damageDealt += damage; }
          if (weapon && !op.weapons.includes(weapon)) op.weapons.push(weapon);
          dist.zones[zone].hits++; dist.totalHits++;
          op.zones[zone].hits++;
          if (damage !== null) { dist.zones[zone].dmg += damage; dist.totalDmg += damage; op.zones[zone].dmg += damage; }
          if (zone === 'head') { hs++; op.headshots++; }
          if (type === 'kill') op.killed = true;
        } else if (type === 'taken' || type === 'death') {
          op.hitsTaken++;
          if (damage !== null) { dmgTaken += damage; op.damageTaken += damage; }
          if (type === 'death') op.died = true;
        }
      }
    }

    setEvents(parsedEvents);
    setStats({ damageDealt: Math.round(dmgDealt), damageTaken: Math.round(dmgTaken), headshots: hs, hits, invalids, kills, deaths });
    setOpponents(opponentMap);
    setHitDistribution(dist);
    setParsed(true);
    setShowInput(false);
  };

  // ── derived presentation values ─────────────────────────
  const pct = (n: number) => hitDistribution.totalHits > 0 ? Math.round((n / hitDistribution.totalHits) * 100) : 0;

  const shotsFired = stats.hits + stats.invalids;
  const hitRate = shotsFired > 0 ? Math.round((stats.hits / shotsFired) * 100) : 0;
  const headshotRate = stats.hits > 0 ? Math.round((stats.headshots / stats.hits) * 100) : 0;
  const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : String(stats.kills);

  const opponentList = useMemo(
    () => Object.values(opponents).sort((a, b) => (b.damageDealt + b.damageTaken) - (a.damageDealt + a.damageTaken)),
    [opponents],
  );

  // Global rollups read straight off the parsed events (keeps parse logic untouched).
  const derived = useMemo(() => {
    let inHits = 0, distSum = 0, distN = 0;
    for (const e of events) {
      const d = parseFloat(e.distance);
      if (isFinite(d) && d > 0) { distSum += d; distN++; }
      if (e.type === 'taken' || e.type === 'death') inHits++;
    }
    return { inHits, avgDistance: distN ? distSum / distN : 0, distSamples: distN };
  }, [events]);

  // Body regions sorted by frequency for the breakdown bars.
  const distRows = useMemo(
    () => ZONE_META
      .map((z) => ({ key: z.key, label: z.label, hits: hitDistribution.zones[z.key].hits, dmg: hitDistribution.zones[z.key].dmg }))
      .filter((z) => z.key !== 'other' || z.hits > 0)
      .sort((a, b) => b.hits - a.hits || b.dmg - a.dmg),
    [hitDistribution],
  );

  const maxZoneHits = useMemo(
    () => Math.max(1, ...ZONE_META.map((z) => hitDistribution.zones[z.key].hits)),
    [hitDistribution],
  );

  // Heatmap intensity for a body region (0 → no hits, 1 → busiest region).
  const regionStyle = (zone: Zone) => {
    const h = hitDistribution.zones[zone].hits;
    return {
      fill: ZONE_COLOR[zone],
      fillOpacity: h === 0 ? 0.06 : 0.22 + 0.78 * (h / maxZoneHits),
      stroke: ZONE_COLOR[zone],
      strokeOpacity: h === 0 ? 0.25 : 0.65,
      strokeWidth: 1.3,
    };
  };

  const outcomeOf = (op: OpponentStat): { label: string; cls: string } => {
    if (op.killed && op.died) return { label: 'Traded', cls: 'cl-out--trade' };
    if (op.killed) return { label: 'Killed', cls: 'cl-out--win' };
    if (op.died) return { label: 'Died', cls: 'cl-out--loss' };
    return { label: 'No KO', cls: 'cl-out--none' };
  };

  const rowClass = (ev: CombatEvent) => {
    if (ev.type === 'invalid') return 'cl-row--invalid';
    if (ev.type === 'kill') return 'cl-row--kill';
    if (ev.type === 'death') return 'cl-row--death';
    if (ev.type === 'entity') return 'cl-row--entity';
    if (ev.type === 'dealt') return 'cl-row--out';
    if (ev.type === 'taken') return 'cl-row--in';
    return 'cl-row--generic';
  };

  const resultTag = (ev: CombatEvent) => {
    switch (ev.type) {
      case 'kill': return 'KILL';
      case 'death': return 'DEATH';
      case 'entity': return 'DESTROYED';
      case 'invalid': return 'INVALID';
      case 'dealt': return 'HIT';
      case 'taken': return 'TOOK';
      default: return (ev.info || 'EVENT').toUpperCase().slice(0, 10);
    }
  };

  return (
    <div className="cl">
      <header className="cl-header">
        <div className="cl-header-title">
          <span className="cl-header-icon"><Terminal size={20} /></span>
          <div>
            <h2>Combat Log Analyzer</h2>
            <p>Paste your in-game <code>combatlog</code> output for damage, accuracy and hit telemetry.</p>
          </div>
        </div>
        {parsed && (
          <div className="cl-header-actions">
            <div className="cl-viewtabs" role="tablist" aria-label="View mode">
              <button
                role="tab" aria-selected={view === 'overview'}
                className={`cl-viewtab ${view === 'overview' ? 'is-active' : ''}`}
                onClick={() => setView('overview')}
              ><LayoutGrid size={13} /> Overview</button>
              <button
                role="tab" aria-selected={view === 'timeline'}
                className={`cl-viewtab ${view === 'timeline' ? 'is-active' : ''}`}
                onClick={() => setView('timeline')}
              ><ListOrdered size={13} /> Timeline</button>
            </div>
            <button className="cl-mini-btn" onClick={() => setShowInput((v) => !v)}>{showInput ? 'Hide log' : 'Edit log'}</button>
            <button className="cl-mini-btn cl-mini-btn--danger" onClick={clearLog}><Trash2 size={13} /> Reset</button>
          </div>
        )}
      </header>

      {/* Input */}
      {(showInput || !parsed) && (
        <section className="cl-input-card">
          <div className="cl-term">
            <div className="cl-term-bar">
              <span className="cl-dot red" /><span className="cl-dot amber" /><span className="cl-dot green" />
              <span className="cl-term-title">RUST_CONSOLE · combatlog</span>
            </div>
            <textarea
              className="cl-textarea"
              placeholder={"Press F1 in-game  →  type 'combatlog'  →  copy the output  →  paste it here…\n\n00:01.12  you  76561…  Ninja_Pete  76561…  ak47  ammo.rifle  head  18.2m  100  65  hit"}
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="cl-input-actions">
            <button className="cl-parse" onClick={() => parseLog()}><Play size={14} /> Analyze</button>
            <span className="cl-input-sep">or load a sample</span>
            <button className="cl-sample" onClick={() => loadSample(SAMPLE_LOG_PVP)}>PVP fight</button>
            <button className="cl-sample" onClick={() => loadSample(SAMPLE_LOG_DESYNC)}>Desync / invalid</button>
          </div>
        </section>
      )}

      {!parsed ? (
        <div className="cl-hint-empty">
          <span className="cl-hint-icon"><Crosshair size={30} /></span>
          <h4>No combat log loaded</h4>
          <ol className="cl-steps">
            <li>In Rust, press <kbd>F1</kbd> to open the console.</li>
            <li>Type <code>combatlog</code> and press <kbd>Enter</kbd>.</li>
            <li>Select the output, copy it, and paste it above.</li>
            <li>Hit <strong>Analyze</strong> — or try a sample log.</li>
          </ol>
          <p>You'll get damage dealt/taken, hit rate, headshot rate, a body-part hit breakdown and per-opponent encounter summaries.</p>
        </div>
      ) : (
        <>
          {/* ── Scoreboard: outgoing vs incoming at a glance ── */}
          <div className="cl-board">
            <div className="cl-board-side cl-board-side--out">
              <span className="cl-board-tag"><ArrowUpRight size={14} /> You dealt</span>
              <span className="cl-board-val">{stats.damageDealt}</span>
              <span className="cl-board-unit">damage</span>
              <div className="cl-board-meta">
                <span>{stats.hits} hit{stats.hits === 1 ? '' : 's'}</span>
                <span className="cl-board-dot">•</span>
                <span>{stats.kills} kill{stats.kills === 1 ? '' : 's'}</span>
              </div>
            </div>

            <div className="cl-board-mid">
              <span className="cl-board-kd-label"><Swords size={12} /> K / D</span>
              <div className="cl-board-kd">
                <span className="cl-board-kd-k">{stats.kills}</span>
                <span className="cl-board-kd-sep">/</span>
                <span className="cl-board-kd-d">{stats.deaths}</span>
              </div>
              <span className="cl-board-kd-ratio">{kd} ratio</span>
            </div>

            <div className="cl-board-side cl-board-side--in">
              <span className="cl-board-tag"><ArrowDownLeft size={14} /> You took</span>
              <span className="cl-board-val">{stats.damageTaken}</span>
              <span className="cl-board-unit">damage</span>
              <div className="cl-board-meta">
                <span>{derived.inHits} hit{derived.inHits === 1 ? '' : 's'}</span>
                <span className="cl-board-dot">•</span>
                <span>{stats.deaths} death{stats.deaths === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>

          {/* ── Secondary KPIs ── */}
          <div className="cl-kpis">
            <div className="cl-kpi">
              <span className="cl-kpi-k"><Target size={12} /> Accuracy</span>
              <span className="cl-kpi-v">{hitRate}<small>%</small></span>
              <span className="cl-kpi-sub">{stats.hits} of {shotsFired} shots</span>
            </div>
            <div className="cl-kpi">
              <span className="cl-kpi-k"><Crosshair size={12} /> Headshots</span>
              <span className="cl-kpi-v">{headshotRate}<small>%</small></span>
              <span className="cl-kpi-sub">{stats.headshots} landed</span>
            </div>
            <div className="cl-kpi">
              <span className="cl-kpi-k"><Ruler size={12} /> Avg distance</span>
              <span className="cl-kpi-v">{derived.avgDistance.toFixed(1)}<small>m</small></span>
              <span className="cl-kpi-sub">over {derived.distSamples} shot{derived.distSamples === 1 ? '' : 's'}</span>
            </div>
            <div className="cl-kpi">
              <span className="cl-kpi-k"><Activity size={12} /> Shots logged</span>
              <span className="cl-kpi-v">{shotsFired}</span>
              <span className="cl-kpi-sub">{stats.hits} hit · {derived.inHits} taken</span>
            </div>
            <div className={`cl-kpi ${stats.invalids > 0 ? 'cl-kpi--warn' : ''}`}>
              <span className="cl-kpi-k"><Ban size={12} /> Invalid</span>
              <span className="cl-kpi-v">{stats.invalids}</span>
              <span className="cl-kpi-sub">desync / rejected</span>
            </div>
          </div>

          {view === 'overview' ? (
            <div className="cl-grid">
              {/* LEFT: hit distribution */}
              <div className="cl-col">
                <section className="cl-card">
                  <div className="cl-card-head">
                    <h3 className="cl-card-h"><Target size={14} /> Hit distribution</h3>
                    <span className="cl-card-sub">{hitDistribution.totalHits} landed{hitDistribution.totalDmg > 0 ? ` · ${hitDistribution.totalDmg} dmg` : ''}</span>
                  </div>

                  {hitDistribution.totalHits === 0 ? (
                    <div className="cl-none">No landed hits to chart.</div>
                  ) : (
                    <div className="cl-dist">
                      {/* Body heatmap silhouette */}
                      <div className="cl-body-wrap">
                        <svg className="cl-body" viewBox="0 0 120 200" role="img" aria-label="Body hit heatmap">
                          <circle cx={60} cy={22} r={16} style={regionStyle('head')}>
                            <title>{`Head · ${hitDistribution.zones.head.hits} hits · ${hitDistribution.zones.head.dmg} dmg`}</title>
                          </circle>
                          <rect x={40} y={42} width={40} height={34} rx={11} style={regionStyle('chest')}>
                            <title>{`Chest · ${hitDistribution.zones.chest.hits} hits · ${hitDistribution.zones.chest.dmg} dmg`}</title>
                          </rect>
                          <rect x={42} y={78} width={36} height={26} rx={9} style={regionStyle('stomach')}>
                            <title>{`Stomach · ${hitDistribution.zones.stomach.hits} hits · ${hitDistribution.zones.stomach.dmg} dmg`}</title>
                          </rect>
                          <rect x={20} y={46} width={14} height={52} rx={7} style={regionStyle('arms')}>
                            <title>{`Arms · ${hitDistribution.zones.arms.hits} hits · ${hitDistribution.zones.arms.dmg} dmg`}</title>
                          </rect>
                          <rect x={86} y={46} width={14} height={52} rx={7} style={regionStyle('arms')}>
                            <title>{`Arms · ${hitDistribution.zones.arms.hits} hits · ${hitDistribution.zones.arms.dmg} dmg`}</title>
                          </rect>
                          <rect x={43} y={106} width={15} height={80} rx={7} style={regionStyle('legs')}>
                            <title>{`Legs · ${hitDistribution.zones.legs.hits} hits · ${hitDistribution.zones.legs.dmg} dmg`}</title>
                          </rect>
                          <rect x={62} y={106} width={15} height={80} rx={7} style={regionStyle('legs')}>
                            <title>{`Legs · ${hitDistribution.zones.legs.hits} hits · ${hitDistribution.zones.legs.dmg} dmg`}</title>
                          </rect>
                        </svg>
                        <span className="cl-body-cap">Darker = more hits</span>
                      </div>

                      {/* Sorted breakdown bars */}
                      <div className="cl-dist-bars">
                        <div className="cl-bars-head">
                          <span>Region</span><span>Share</span><span className="cl-bars-head-n">Hits</span><span className="cl-bars-head-n">Dmg</span>
                        </div>
                        <div className="cl-bars">
                          {distRows.map((z) => {
                            const p = pct(z.hits);
                            return (
                              <div className={`cl-bar-row ${z.hits === 0 ? 'is-empty' : ''}`} key={z.key}>
                                <span className={`cl-bar-key cl-z-${z.key}`}><span className={`cl-bar-swatch cl-zbg-${z.key}`} />{z.label}</span>
                                <div className="cl-bar-track">
                                  <div className={`cl-bar-fill cl-zbg-${z.key}`} style={{ width: `${z.hits === 0 ? 0 : Math.max(4, p)}%` }} />
                                  <span className="cl-bar-pct">{p}%</span>
                                </div>
                                <span className="cl-bar-n">{z.hits}</span>
                                <span className="cl-bar-dmg">{z.dmg > 0 ? z.dmg : '—'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </div>

              {/* RIGHT: encounter summaries */}
              <div className="cl-col">
                <section className="cl-card cl-card--fill">
                  <div className="cl-card-head">
                    <h3 className="cl-card-h"><Skull size={14} /> Encounters</h3>
                    <span className="cl-card-sub">{opponentList.length} opponent{opponentList.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="cl-opps">
                    {opponentList.map((op) => {
                      const tot = op.damageDealt + op.damageTaken;
                      const dealtPct = tot > 0 ? Math.round((op.damageDealt / tot) * 100) : 50;
                      const hsRate = op.hitsDealt > 0 ? Math.round((op.headshots / op.hitsDealt) * 100) : 0;
                      const avgDist = op.distSamples > 0 ? op.distSum / op.distSamples : 0;
                      const out = outcomeOf(op);
                      return (
                        <div key={op.name} className="cl-opp">
                          <div className="cl-opp-top">
                            <span className="cl-opp-name">{op.name}</span>
                            <span className={`cl-out ${out.cls}`}>{out.label}</span>
                          </div>

                          <div className="cl-opp-bar" title={`${op.damageDealt} dealt vs ${op.damageTaken} taken`}>
                            {op.damageDealt > 0 && <div className="cl-opp-bar-dealt" style={{ width: `${dealtPct}%` }} />}
                            {op.damageTaken > 0 && <div className="cl-opp-bar-taken" style={{ width: `${100 - dealtPct}%` }} />}
                          </div>
                          <div className="cl-opp-barkey">
                            <span className="cl-up">{op.damageDealt} dealt</span>
                            <span className="cl-down">{op.damageTaken} taken</span>
                          </div>

                          <div className="cl-opp-stats">
                            <div className="cl-stat"><span className="cl-stat-k"><ArrowUpRight size={10} /> Dealt</span><span className="cl-stat-v cl-up">{op.damageDealt}<small> / {op.hitsDealt} hit</small></span></div>
                            <div className="cl-stat"><span className="cl-stat-k"><ArrowDownLeft size={10} /> Taken</span><span className="cl-stat-v cl-down">{op.damageTaken}<small> / {op.hitsTaken} hit</small></span></div>
                            <div className="cl-stat"><span className="cl-stat-k"><Crosshair size={10} /> Headshot</span><span className="cl-stat-v">{hsRate}<small>%</small></span></div>
                            <div className="cl-stat"><span className="cl-stat-k"><Ruler size={10} /> Distance</span><span className="cl-stat-v">{avgDist.toFixed(1)}<small> avg / {op.maxDistance.toFixed(1)} max</small></span></div>
                          </div>

                          {op.hitsDealt > 0 && (
                            <div className="cl-opp-zones">
                              {ZONE_META.map((z) => op.zones[z.key].hits > 0 && (
                                <span key={z.key} className={`cl-chip cl-area--${z.key}`}>{z.label} {op.zones[z.key].hits}</span>
                              ))}
                            </div>
                          )}

                          <div className="cl-opp-foot">
                            {op.weapons.length > 0
                              ? op.weapons.map((w) => <span key={w} className="cl-wchip">{w}</span>)
                              : <span className="cl-mut">no weapon resolved</span>}
                            {op.invalids > 0 && <span className="cl-inv-chip"><Ban size={10} /> {op.invalids} invalid</span>}
                          </div>
                        </div>
                      );
                    })}
                    {opponentList.length === 0 && <div className="cl-none">No opponents parsed.</div>}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            /* TIMELINE VIEW */
            <section className="cl-card">
              <div className="cl-card-head">
                <h3 className="cl-card-h"><Activity size={14} /> Combat timeline</h3>
                <div className="cl-legend cl-legend--inline">
                  <span className="cl-legend-item"><span className="cl-legend-swatch cl-sw-out" /> You dealt</span>
                  <span className="cl-legend-item"><span className="cl-legend-swatch cl-sw-in" /> You took</span>
                  <span className="cl-legend-item"><span className="cl-legend-swatch cl-sw-kill" /> Kill</span>
                  <span className="cl-legend-item"><span className="cl-legend-swatch cl-sw-death" /> Death</span>
                  <span className="cl-legend-item"><span className="cl-legend-swatch cl-sw-inv" /> Invalid</span>
                </div>
              </div>
              {events.length === 0 ? (
                <div className="cl-none">No events parsed.</div>
              ) : (
                <div className="cl-table-wrap">
                  <table className="cl-table">
                    <thead>
                      <tr>
                        <th className="cl-c-time">Time</th>
                        <th className="cl-c-dir">Dir</th>
                        <th>Attacker → Target</th>
                        <th>Weapon</th>
                        <th>Ammo</th>
                        <th>Area</th>
                        <th className="cl-c-num">Dist</th>
                        <th className="cl-c-num">Dmg</th>
                        <th className="cl-c-num">HP</th>
                        <th className="cl-c-res">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((ev, i) => {
                        const out = ev.type === 'dealt' || ev.type === 'kill' || ev.type === 'entity';
                        const inc = ev.type === 'taken' || ev.type === 'death';
                        const isHead = ev.zone === 'head' && ev.type !== 'invalid';
                        return (
                          <tr key={i} className={rowClass(ev)}>
                            <td className="cl-c-time">{ev.time}</td>
                            <td className="cl-c-dir">
                              {out && <span className="cl-dirbadge cl-dirbadge--out"><ArrowUpRight size={12} /></span>}
                              {inc && <span className="cl-dirbadge cl-dirbadge--in"><ArrowDownLeft size={12} /></span>}
                              {ev.type === 'invalid' && <span className="cl-dirbadge cl-dirbadge--inv"><Ban size={11} /></span>}
                              {ev.type === 'generic' && <span className="cl-dirbadge cl-dirbadge--gen">·</span>}
                            </td>
                            <td className="cl-c-pair"><span className="cl-atk">{ev.attacker}</span> <span className="cl-arrow">→</span> <span className="cl-vic">{ev.victim}</span></td>
                            <td>{ev.weapon ? <span className="cl-wpn">{ev.weapon}</span> : <span className="cl-mut">—</span>}</td>
                            <td>{ev.ammo ? <span className="cl-ammo">{ev.ammo}</span> : <span className="cl-mut">—</span>}</td>
                            <td className="cl-c-area">
                              {ev.area
                                ? <span className={`cl-chip cl-area--${ev.zone}`}>{isHead && <Crosshair size={9} className="cl-hs-ico" />}{ev.area}</span>
                                : <span className="cl-mut">—</span>}
                            </td>
                            <td className="cl-c-num">{ev.distance}</td>
                            <td className="cl-c-num">{ev.damage != null && ev.damage > 0 ? <span className={out ? 'cl-up' : 'cl-down'}>−{ev.damage}</span> : <span className="cl-mut">—</span>}</td>
                            <td className="cl-c-num cl-hp">{ev.oldHp != null && ev.newHp != null ? <>{ev.oldHp.toFixed(0)}<span className="cl-arrow">→</span>{ev.newHp.toFixed(0)}</> : <span className="cl-mut">—</span>}</td>
                            <td className="cl-c-res"><span className={`cl-res cl-res--${ev.type}`}>{resultTag(ev)}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
