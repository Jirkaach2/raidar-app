/**
 * Rust NPC missions — objectives, rewards, providers and the safe-zone
 * monuments they're offered at. Data sourced from the in-game mission set
 * (RustHelp world/missions). Icons reuse the rusthelp CDN.
 */

export interface MissionReward { name: string; qty?: number; icon?: string; }

export interface Mission {
  id: string;            // rusthelp slug — also the mission icon slug
  name: string;
  provider: string;      // NPC that hands it out
  desc: string;
  objectives: string[];
  rewards: MissionReward[];
  rewardNote?: string;   // non-item reward (e.g. unlock)
  bonus?: string;        // optional objective bonus
  cooldown?: string;     // cooldown after success
  timeLimit?: string;    // mission time limit
  requires?: string[];   // prerequisite mission names
  monuments: string[];   // canonical monument keys offering it
}

const FISHING = ['fishing_village', 'large_fishing_village'];
const DIVE = ['large_fishing_village'];
const BANDIT = ['bandit_camp'];
const OUTPOST = ['outpost'];

export const MISSIONS: Mission[] = [
  {
    id: 'tackle-the-day', name: 'Tackle the Day', provider: 'Fisherman',
    desc: 'Help the fisherman retrieve his lost tackle.',
    objectives: ['Go to the coastline', 'Retrieve the lost tackle', 'Return the tackle to the fisherman'],
    rewards: [{ name: 'Handmade Fishing Rod', qty: 1, icon: 'fishingrod-handmade' }, { name: 'Grub', qty: 15, icon: 'grub' }, { name: 'Basic Harvesting Tea', qty: 1 }],
    cooldown: '1h', timeLimit: '1h', monuments: FISHING,
  },
  {
    id: 'go-fish', name: 'Go Fish', provider: 'Fisherman',
    desc: 'Catch fish for the fisherman.',
    objectives: ['Catch 3 Fish', 'Return to the fisherman'],
    rewards: [{ name: 'Kayak', qty: 1, icon: 'kayak' }, { name: 'Paddle', qty: 1, icon: 'paddle' }, { name: 'Scrap', qty: 75, icon: 'scrap' }],
    cooldown: '1h', requires: ['Tackle the Day'], monuments: FISHING,
  },
  {
    id: 'oiled-up', name: 'Oiled Up', provider: 'Fisherman',
    desc: 'Find fuel for the fisherman.',
    objectives: ['Head out to sea', 'Open 8 oil barrels', 'Return with 100 Crude Oil'],
    rewards: [{ name: 'Scrap', qty: 250, icon: 'scrap' }, { name: 'Fish Pie', qty: 3, icon: 'pie-fish' }],
    cooldown: '1h', requires: ['Tackle the Day', 'Go Fish'], monuments: FISHING,
  },
  {
    id: 'an-important-broadcast', name: 'An Important Broadcast', provider: 'Fisherman',
    desc: 'Spread the music of the fishing village to the underwater labs.',
    objectives: ['Enter the underwater lab', 'Play station "Fishing Village 24/7" on a lab boombox', 'Repeat for the other lab boomboxes', 'Return to the mission provider'],
    rewards: [{ name: 'Scrap', qty: 100, icon: 'scrap' }, { name: 'Double Diving Tank', qty: 1, icon: 'diving-tank-double' }],
    bonus: '+25 Scrap for tagging every lab boombox', monuments: FISHING,
  },
  {
    id: 'shark-hunt', name: 'Shark Hunt', provider: 'Dive Master',
    desc: 'Kill the sharks threatening divers near the island.',
    objectives: ['Search dive sites for Sharks', 'Kill a shark', 'Speak with the dive master'],
    rewards: [{ name: 'Jackhammer', qty: 1, icon: 'jackhammer' }, { name: 'Medical Syringe', qty: 3, icon: 'syringe-medical' }, { name: 'Scrap', qty: 50, icon: 'scrap' }],
    cooldown: '8h', monuments: DIVE,
  },
  {
    id: 'underwater-bounty', name: 'Underwater Bounty', provider: 'Dive Master',
    desc: 'Search dive sites and untie crates.',
    objectives: ['Search dive sites for crates', 'Untie 10 crates', 'Speak with the dive master'],
    rewards: [{ name: 'Pump Shotgun', qty: 1, icon: 'shotgun-pump' }, { name: '12 Gauge Buckshot', qty: 12, icon: 'ammo-shotgun' }, { name: 'Scrap', qty: 100, icon: 'scrap' }],
    cooldown: '4h', monuments: DIVE,
  },
  {
    id: 'beep-in-the-deep', name: 'Beep in the Deep', provider: 'Dive Master',
    desc: 'Use a metal detector to find buried treasure in the deep sea.',
    objectives: ['Venture into the deep sea', 'Make landfall on a deep sea island', 'Use a metal detector to find the buried treasure', 'Return to the mission provider'],
    rewards: [{ name: 'Scrap', qty: 100, icon: 'scrap' }],
    cooldown: '1h 30m', monuments: DIVE,
  },
  {
    id: 'lost-bottles', name: 'Lost Bottles', provider: 'Lumberjack',
    desc: "Help the lumberjack find his lost bottle.",
    objectives: ['Go to the forest', 'Find the Vodka bottle', 'Return the bottle to the lumberjack'],
    rewards: [{ name: 'Hatchet', qty: 1, icon: 'hatchet' }],
    cooldown: '1h', timeLimit: '1h', monuments: BANDIT,
  },
  {
    id: 'collect-vood', name: 'Collect Vood', provider: 'Lumberjack',
    desc: 'Harvest wood for the lumberjack.',
    objectives: ['Move to the forest', 'Harvest Wood', 'Talk with the mission provider'],
    rewards: [{ name: 'Crossbow', qty: 1, icon: 'crossbow' }, { name: 'Wooden Arrow', qty: 15, icon: 'arrow-wooden' }, { name: 'Scrap', qty: 75, icon: 'scrap' }],
    cooldown: '1h', requires: ['Lost Bottles'], monuments: BANDIT,
  },
  {
    id: 'wildlife-cull', name: 'Wildlife Cull', provider: 'Lumberjack',
    desc: 'Cull the wildlife for the lumberjack.',
    objectives: ['Dispatch 3 Animals', 'Return to the lumberjack'],
    rewards: [{ name: 'Lumberjack Hoodie', qty: 1, icon: 'hoodie' }, { name: 'Pants', qty: 1, icon: 'pants' }, { name: 'Bucket Helmet', qty: 1, icon: 'bucket-helmet' }, { name: 'Basic Wood Tea', qty: 1 }],
    cooldown: '1h', requires: ['Lost Bottles', 'Collect Vood'], monuments: BANDIT,
  },
  {
    id: 'keeping-afloat', name: 'Keeping Afloat', provider: 'Lumberjack',
    desc: 'Help the lumberjack fulfil a delivery for the deep sea settlement.',
    objectives: ['Acquire 3000 wood', 'Venture into the deep sea', 'Reach the floating city', "Speak to the Lumberjack's contact"],
    rewards: [{ name: 'Scrap', qty: 300, icon: 'scrap' }],
    monuments: BANDIT,
  },
  {
    id: 'boar-hunt', name: 'Boar Hunt', provider: 'Hunter',
    desc: 'Find and kill a boar then return to the hunter.',
    objectives: ['Find and kill a boar', 'Talk with the mission provider'],
    rewards: [{ name: 'Scrap', qty: 150, icon: 'scrap' }, { name: 'Basic Ore Tea', qty: 1 }],
    cooldown: '1h', monuments: BANDIT,
  },
  {
    id: 'deer-hunt', name: 'Deer Hunt', provider: 'Hunter',
    desc: 'Hunt deer for the mission provider.',
    objectives: ['Find and kill 3 Deer', 'Talk with the mission provider'],
    rewards: [{ name: 'Scrap', qty: 150, icon: 'scrap' }, { name: 'Basic Scrap Tea', qty: 1 }],
    cooldown: '1h', monuments: BANDIT,
  },
  {
    id: 'gone-killing', name: 'Gone Killing', provider: 'Mission Provider',
    desc: 'Hunt down the RHIB scientists.',
    objectives: ['Kill 8 scientists on patrol boats', 'Return to the mission provider'],
    rewards: [{ name: 'Rocket Launcher', qty: 1, icon: 'rocket-launcher' }, { name: 'High Velocity Rocket', qty: 6, icon: 'ammo-rocket-hv' }],
    cooldown: '3h', monuments: BANDIT,
  },
  {
    id: 'vagabond-treasure', name: 'Vagabond Treasure', provider: 'Vagabond',
    desc: 'A simple mission to find treasure.',
    objectives: ['Find the treasure'],
    rewards: [], rewardNote: 'Loot from the Treasure Mission Box',
    cooldown: '1h', timeLimit: '6h', monuments: [...BANDIT, ...OUTPOST],
  },
  {
    id: 'oil-rig-raid', name: 'Oil Rig Raid', provider: 'Scientist',
    desc: "Retrieve the scientist's lost soda can from the oil rig.",
    objectives: ['Go to the oil rig', 'Get inside the CCTV room', 'Retrieve the soda can', 'Open the locked crate (optional)', 'Return to the mission provider'],
    rewards: [{ name: 'Scrap', qty: 200, icon: 'scrap' }],
    bonus: 'Bonus: 3 Semi-Automatic Rifle for opening the locked crate',
    cooldown: '1h 30m', monuments: OUTPOST,
  },
  {
    id: 'outpost-validation', name: 'Outpost Validation', provider: 'Scientist',
    desc: 'Find the documents at the marked location and return them to the scientist.',
    objectives: ['Go to the safe zone', 'Retrieve the documents', 'Return to the scientist'],
    rewards: [], rewardNote: 'Unlocks a permanent Outpost respawn point',
    monuments: OUTPOST,
  },
];

/** Resolve the canonical monument key from any token/key string. */
function canonicalKey(key: string): string | null {
  const k = (key || '').toLowerCase();
  if (k.includes('large_fishing') || k.includes('largefishing') || k.includes('large fishing')) return 'large_fishing_village';
  if (k.includes('fishing')) return 'fishing_village';
  if (k.includes('outpost')) return 'outpost';
  if (k.includes('bandit')) return 'bandit_camp';
  return null;
}

/** Missions offered at the given monument (by key or token). */
export function getMissionsForMonument(key: string): Mission[] {
  const canon = canonicalKey(key);
  if (!canon) return [];
  return MISSIONS.filter((m) =>
    m.monuments.includes(canon) ||
    // The large fishing village also has the fisherman, so it offers his missions too.
    (canon === 'large_fishing_village' && m.monuments.includes('fishing_village'))
  );
}

export function missionIcon(slug: string, size = 128): string {
  return `https://cdn.rusthelp.com/images/${size}/${slug}.webp`;
}

export function rewardIcon(r: MissionReward, size = 64): string {
  const slug = r.icon || r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `https://cdn.rusthelp.com/images/${size}/${slug}.webp`;
}
