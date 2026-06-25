import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useBanTrackerStore } from '../../stores/ban-tracker-store';
import {
  Search, Shield, ShieldAlert, ShieldCheck, ExternalLink,
  Copy, FileText, Database, User, Clock, AlertTriangle,
  CheckCircle2, Trash2, History, AlertCircle, BookmarkCheck
} from 'lucide-react';
import './PlayerLookupTool.css';

interface ProfileData {
  steamid64: string;
  steamid: string;
  steam3: string;
  steamidurl: string;
  inviteurl?: string;
  csgofriend?: string;
}

interface ProfileBans {
  vac: string;
  tradeban: string;
  communityban: string;
  amount_game_bans: string;
  steamid_ban: string;
  rusthackreport: string;
  rusthackreport_url?: string;
  rusthackreport_days_old?: string;
}

interface PrivateNotes {
  private_note_count: string;
  notes: string[];
}

interface SteamIdData {
  steamid_optout: string;
  vac_banned_friends: string;
  trade_banned_friends: string;
  game_banned_friends: string;
  community_banned_friends: string;
  url_changes: string;
  friend_history_count: string;
  friend_count: string;
  name_history_count: string;
}

interface SteamIdApiResponse {
  auth: {
    auth: string;
    patreon: string;
    daily_count: string;
    daily_limit: string;
  };
  custom_watch_list?: {
    watch_result: string;
    id: string;
    category: string;
  };
  profile: ProfileData;
  profile_bans: ProfileBans;
  private_notes?: PrivateNotes;
  steamid_data?: SteamIdData;
}

interface SteamProfile {
  name: string;
  avatar_url: string;
  privacy_state: string;
  is_vac_banned: boolean;
  trade_ban_state: string;
  is_limited: boolean;
  rust_hours: number | null;
  recent_hours: number | null;
  steam_level: number;
  is_playing_rust: boolean;
}

const getSteamLevelColor = (lvl: number): string => {
  const tens = Math.floor(lvl / 10) % 10;
  const colors = [
    '#9b9b9b', // 0-9 (Grey)
    '#c02942', // 10-19 (Red)
    '#d95b43', // 20-29 (Orange)
    '#fe7f2d', // 30-39 (Yellow)
    '#4ecdc4', // 40-49 (Green)
    '#4582ec', // 50-59 (Blue)
    '#a855f7', // 60-69 (Purple)
    '#ec4899', // 70-79 (Pink)
    '#14b8a6', // 80-89 (Teal)
    '#f59e0b', // 90-99 (Amber)
  ];
  return colors[tens] || '#9b9b9b';
};

// ---------------------------------------------------------------------------
// Rich Rust stats display configuration.
//
// Every tile is driven purely by `rustStats.all_stats`, which the backend fills
// with the REAL `<stat><name>X</name><value>Y</value></stat>` pairs found in
// the Steam stats XML. A tile resolves the first matching key that is actually
// present (some Rust stat api-names have historical spelling variants), and a
// tile is only rendered when its value exists. Derived metrics (K/D, accuracy,
// hit rates, …) are computed from those same real values. As a result the UI
// can never display an invented number — absent keys simply don't render.
// ---------------------------------------------------------------------------

type AllStats = Record<string, number>;

interface StatEntry {
  label: string;
  keys?: string[];                 // real Steam stat api-name candidates (first present wins)
  derived?: (s: AllStats) => number | null; // computed metric (null => hidden)
  format?: 'count' | 'percent' | 'ratio';
}

interface StatSection {
  title: string;
  entries: StatEntry[];
}

const firstPresent = (s: AllStats, keys: string[]): number | null => {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(s, k) && typeof s[k] === 'number') {
      return s[k];
    }
  }
  return null;
};

const rate = (num: number | null, den: number | null): number | null => {
  if (num === null || den === null || den <= 0) return null;
  return num / den;
};

// Format a raw count: toLocaleString, with k/M abbreviations for large values.
const formatCount = (n: number): string => {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 100_000) {
    return `${Math.round(n / 1000)}k`;
  }
  if (n >= 10_000) {
    const v = n / 1000;
    return `${v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return n.toLocaleString('en-US');
};

const STAT_SECTIONS: StatSection[] = [
  {
    title: 'PVP STATS',
    entries: [
      { label: 'K/D', derived: (s) => rate(firstPresent(s, ['kill_player']), firstPresent(s, ['deaths'])), format: 'ratio' },
      { label: 'Kills', keys: ['kill_player'] },
      { label: 'Deaths', keys: ['deaths'] },
      { label: 'Headshots', keys: ['headshot'] },
      { label: 'HS Hit Rate', derived: (s) => rate(firstPresent(s, ['headshot']), firstPresent(s, ['kill_player'])), format: 'percent' },
      { label: 'Accuracy', derived: (s) => rate(firstPresent(s, ['bullet_hit', 'bullet_hit_player']), firstPresent(s, ['bullet_fired'])), format: 'percent' },
      { label: 'Bullets Hit', keys: ['bullet_hit', 'bullet_hit_player'] },
      { label: 'Bullets Fired', keys: ['bullet_fired'] },
    ],
  },
  {
    title: 'BULLET HITS BREAKDOWN',
    entries: [
      { label: 'Building', keys: ['bullet_hit_building'] },
      { label: 'Sign', keys: ['bullet_hit_sign'] },
      { label: 'Dead Players', keys: ['bullet_hit_deadplayers', 'bullet_hit_corpse'] },
      { label: 'Stag', keys: ['bullet_hit_stag'] },
      { label: 'Bears', keys: ['bullet_hit_bear'] },
      { label: 'Boars', keys: ['bullet_hit_boar'] },
      { label: 'Wolves', keys: ['bullet_hit_wolf'] },
    ],
  },
  {
    title: 'KILL BREAKDOWN',
    entries: [
      { label: 'Scientists', keys: ['kill_scientist', 'killed_scientist'] },
      { label: 'Sharks', keys: ['kill_shark'] },
      { label: 'MLRS', keys: ['kill_mlrs', 'killed_by_mlrs'] },
      { label: 'Dweller', keys: ['kill_dweller', 'kill_simpleshark'] },
    ],
  },
  {
    title: 'EXPLOSIVES & MELEE',
    entries: [
      { label: 'Rockets Fired', keys: ['rocket_fired'] },
      { label: 'Grenades', keys: ['grenade_thrown', 'thrown_grenade'] },
      { label: 'Melee Strikes', keys: ['melee_strikes', 'melee_thrown'] },
    ],
  },
  {
    title: 'ANIMAL KILLS',
    entries: [
      { label: 'Bears', keys: ['kill_bear'] },
      { label: 'Boars', keys: ['kill_boar'] },
      { label: 'Stag', keys: ['kill_stag'] },
      { label: 'Horses', keys: ['kill_horse'] },
      { label: 'Wolves', keys: ['kill_wolf'] },
      { label: 'Chickens', keys: ['kill_chicken'] },
    ],
  },
  {
    title: 'BOW STATS',
    entries: [
      { label: 'Shots Fired', keys: ['arrow_fired'] },
      { label: 'Player Hits', keys: ['arrow_hit_player'] },
      { label: 'Building Hits', keys: ['arrow_hit_building'] },
      {
        label: 'Hit Rate',
        derived: (s) => {
          const hits = (firstPresent(s, ['arrow_hit_player']) ?? 0) + (firstPresent(s, ['arrow_hit_building']) ?? 0);
          const fired = firstPresent(s, ['arrow_fired']);
          if (fired === null || fired <= 0) return null;
          return hits / fired;
        },
        format: 'percent',
      },
    ],
  },
  {
    title: 'SHOTGUN STATS',
    entries: [
      { label: 'Shots Fired', keys: ['shotgun_fired'] },
      { label: 'Player Hits', keys: ['shotgun_hit_player'] },
      { label: 'Building Hits', keys: ['shotgun_hit_building'] },
      {
        label: 'Hit Rate',
        derived: (s) => {
          const hits = (firstPresent(s, ['shotgun_hit_player']) ?? 0) + (firstPresent(s, ['shotgun_hit_building']) ?? 0);
          const fired = firstPresent(s, ['shotgun_fired']);
          if (fired === null || fired <= 0) return null;
          return hits / fired;
        },
        format: 'percent',
      },
    ],
  },
  {
    title: 'DEATH STATS',
    entries: [
      { label: 'Fall', keys: ['death_fall'] },
      { label: 'Suicides', keys: ['death_suicide'] },
      { label: 'Entity', keys: ['death_entity'] },
    ],
  },
  {
    title: 'WOUNDS',
    entries: [
      { label: 'Times Wounded', keys: ['wounded', 'times_wounded'] },
      { label: 'Times Healed', keys: ['wounded_healed', 'times_healed'] },
    ],
  },
  {
    title: 'GATHERING',
    entries: [
      { label: 'Wood', keys: ['acquired_wood', 'harvested_wood'] },
      { label: 'Stones', keys: ['acquired_stones', 'harvested_stones'] },
      { label: 'Metal Ore', keys: ['acquired_metal.ore', 'acquired_metal_ore'] },
      { label: 'Scrap', keys: ['acquired_scrap'] },
      { label: 'Cloth', keys: ['harvested_cloth', 'acquired_cloth'] },
      { label: 'Leather', keys: ['harvested_leather', 'acquired_leather'] },
      { label: 'Low Grade', keys: ['acquired_lowgradefuel', 'acquired_low_grade_fuel'] },
    ],
  },
  {
    title: 'BUILDING',
    entries: [
      { label: 'Blocks Placed', keys: ['placed_blocks'] },
      { label: 'Blocks Upgraded', keys: ['upgraded_blocks'] },
    ],
  },
  {
    title: 'SURVIVAL',
    entries: [
      { label: 'Calories', keys: ['calories_consumed'] },
      { label: 'Water', keys: ['water_consumed'] },
    ],
  },
  {
    title: 'MENU USAGE',
    entries: [
      { label: 'Inventory Opens', keys: ['INVENTORY_OPENED', 'inventory_opened'] },
      { label: 'Crafting Opens', keys: ['CRAFTING_OPENED', 'crafting_opened'] },
      { label: 'Map Opens', keys: ['MAP_OPENED', 'map_opened'] },
    ],
  },
  {
    title: 'OTHER',
    entries: [
      { label: 'Barrels Destroyed', keys: ['destroyed_barrels'] },
      { label: 'Items Dropped', keys: ['item_drop'] },
      { label: 'Blueprints Learned', keys: ['blueprint_studied', 'BLUEPRINT_STUDIED'] },
      { label: 'Missions', keys: ['MISSION_COMPLETE', 'missions_complete'] },
      { label: 'Voice Chat', keys: ['VOICE_SECONDS', 'seconds_speaking'] },
      { label: 'Items Examined', keys: ['examine'] },
      { label: 'Friendly Waves', keys: ['gesture_wave_count'] },
      { label: 'Bee Attacks', keys: ['BEE_ATTACKS', 'bee_attacks'] },
      { label: 'Pipes Connected', keys: ['PIPES_CONNECTED', 'pipes_connected'] },
      { label: 'Wires Connected', keys: ['WIRES_CONNECTED', 'wires_connected'] },
      { label: 'Heli Landings', keys: ['HELI_LANDINGS', 'minicopter_landings'] },
      { label: 'Tin Can Alarms', keys: ['TIN_CAN_ALARM', 'tin_can_alarm_triggered'] },
      { label: 'Kayak Distance', keys: ['KAYAK_METERS', 'kayak_distance'] },
      { label: 'Horse Distance', keys: ['HORSE_METERS', 'horse_distance_ridden'] },
    ],
  },
];

const formatStatValue = (value: number, format: StatEntry['format']): string => {
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (format === 'ratio') return value.toFixed(2);
  return formatCount(value);
};

// Resolve a tile's display value, or null when it should not be rendered.
const resolveStatEntry = (entry: StatEntry, all: AllStats): { value: number; text: string } | null => {
  let value: number | null = null;
  if (entry.derived) {
    value = entry.derived(all);
  } else if (entry.keys) {
    value = firstPresent(all, entry.keys);
  }
  if (value === null || Number.isNaN(value)) return null;
  // Raw counts of exactly 0 are uninteresting; derived ratios/percents at 0 are
  // still meaningful context, so keep them.
  if (!entry.derived && value <= 0) return null;
  return { value, text: formatStatValue(value, entry.format) };
};

// ---------------------------------------------------------------------------
// Cheat-risk scoring.
//
// ONE transparent 0–100 score built purely from REAL signals. Each contributing
// signal is pushed as a {label, points} factor so the UI can show exactly how
// the number was reached. Bands: LOW 0–24 (green), MEDIUM 25–59 (amber),
// HIGH 60–100 (red). Combat-derived signals are gated on the stats being public
// AND having enough volume (kills > 50, bullets_fired > 500) so a handful of
// lucky fights can never push a legit player into a false-positive. No factor
// is added unless the data it depends on is actually present.
// ---------------------------------------------------------------------------

type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH';

interface RiskFactor {
  label: string;
  points: number;
}

interface CheatRisk {
  score: number;        // clamped 0–100
  band: RiskBand;
  factors: RiskFactor[];
  combatEvaluated: boolean; // true when we had public stats with enough volume
}

const bandFor = (score: number): RiskBand => {
  if (score >= 60) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
};

const getCheaterRisk = (
  profile: SteamProfile | null,
  stats: any | null,
  apiBans: ProfileBans | null,
  steamIdData?: SteamIdData | null,
): CheatRisk => {
  const factors: RiskFactor[] = [];
  let combatEvaluated = false;

  // ── Hard ban signals (always trustworthy when present) ──────────────────
  if (apiBans) {
    if (apiBans.vac === '1') {
      factors.push({ label: 'Active VAC ban on record', points: 40 });
    }
    const gameBans = Number(apiBans.amount_game_bans) || 0;
    if (gameBans > 0) {
      factors.push({
        label: `${gameBans} game ban${gameBans > 1 ? 's' : ''} on record`,
        points: Math.min(50, gameBans * 25),
      });
    }
    if (apiBans.rusthackreport === '1') {
      const days = apiBans.rusthackreport_days_old;
      factors.push({
        label: `Flagged by @RustHackReport${days ? ` (${days}d ago)` : ''}`,
        points: 45,
      });
    }
  }

  // ── Banned-friends cluster (cheaters group together) ────────────────────
  if (steamIdData) {
    const friends = Number(steamIdData.friend_count) || 0;
    const bannedFriends =
      (Number(steamIdData.vac_banned_friends) || 0) +
      (Number(steamIdData.game_banned_friends) || 0);
    if (friends >= 5 && bannedFriends > 0) {
      const ratio = bannedFriends / friends;
      const pct = Math.round(ratio * 100);
      if (ratio >= 0.30) {
        factors.push({ label: `${bannedFriends}/${friends} friends banned (${pct}% — cheater cluster)`, points: 25 });
      } else if (ratio >= 0.15) {
        factors.push({ label: `${bannedFriends}/${friends} friends banned (${pct}%)`, points: 15 });
      } else if (bannedFriends >= 3) {
        factors.push({ label: `${bannedFriends} banned friends`, points: 8 });
      }
    }
  }

  // ── Account playtime (only meaningful when the profile is public) ───────
  if (profile && profile.privacy_state === 'public') {
    const hours = profile.rust_hours;
    if (hours !== null && hours !== undefined) {
      if (hours < 50) {
        factors.push({ label: `Very low Rust playtime (${Math.round(hours)} h)`, points: 20 });
      } else if (hours < 250) {
        factors.push({ label: `Low Rust playtime (${Math.round(hours)} h)`, points: 10 });
      }
    }
  }

  // ── Combat-derived signals — public stats + sufficient volume only ──────
  if (stats && stats.privacy === 'public') {
    const kills = Number(stats.kills) || 0;
    const deaths = Number(stats.deaths) || 0;
    const fired = Number(stats.bullet_fired) || 0;
    const hits = Number(stats.bullet_hit) || 0;
    const headshots = Number(stats.headshots) || 0;

    const enoughKills = kills > 50;
    const enoughBullets = fired > 500;

    if (enoughKills || enoughBullets) combatEvaluated = true;

    // K/D and headshot ratio need a meaningful kill sample.
    if (enoughKills) {
      const kd = kills / (deaths || 1);
      if (kd > 6) {
        factors.push({ label: `Anomalous K/D ${kd.toFixed(2)} over ${kills.toLocaleString('en-US')} kills`, points: 25 });
      } else if (kd > 3.5) {
        factors.push({ label: `High K/D ${kd.toFixed(2)} over ${kills.toLocaleString('en-US')} kills`, points: 12 });
      }

      const hsRate = headshots / kills;
      if (hsRate > 0.50) {
        factors.push({ label: `Extreme headshot-to-kill ratio ${(hsRate * 100).toFixed(0)}%`, points: 25 });
      } else if (hsRate > 0.38) {
        factors.push({ label: `Elevated headshot-to-kill ratio ${(hsRate * 100).toFixed(0)}%`, points: 12 });
      }
    }

    // Accuracy needs a meaningful number of shots fired.
    if (enoughBullets) {
      const accuracy = hits / fired;
      if (accuracy > 0.40) {
        factors.push({ label: `Anomalous accuracy ${(accuracy * 100).toFixed(1)}% (aimbot indicator)`, points: 25 });
      } else if (accuracy > 0.32) {
        factors.push({ label: `Suspiciously high accuracy ${(accuracy * 100).toFixed(1)}%`, points: 12 });
      }
    }
  }

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, raw));

  // Highest-impact factors first so the most important reasons read at the top.
  factors.sort((a, b) => b.points - a.points);

  return { score, band: bandFor(score), factors, combatEvaluated };
};

export function PlayerLookupTool() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SteamIdApiResponse | null>(null);
  const [steamProfile, setSteamProfile] = useState<SteamProfile | null>(null);
  const [rustStats, setRustStats] = useState<any | null>(null);
  const [inventory, setInventory] = useState<any | null>(null);
  const [invLoading, setInvLoading] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [showDetailedStats, setShowDetailedStats] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; name: string }[]>([]);

  const { trackedPlayers, trackPlayer, untrackPlayer, checkBans } = useBanTrackerStore();

  useEffect(() => {
    const saved = localStorage.getItem('rust_player_lookup_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const formatted = parsed.map((item: any) => {
            if (typeof item === 'string') {
              return { id: item, name: item };
            }
            return item;
          });
          setHistory(formatted);
        }
      } catch (e) {
        // Ignore
      }
    }
    // Check bans on load quietly
    checkBans();
  }, []);

  const saveToHistory = (id: string, name: string) => {
    if (!id) return;
    const next = [{ id, name }, ...history.filter(h => h.id !== id)].slice(0, 10);
    setHistory(next);
    localStorage.setItem('rust_player_lookup_history', JSON.stringify(next));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('rust_player_lookup_history');
  };

  const handleOpenLink = (url?: string) => {
    if (!url) return;
    invoke('open_external_url', { url }).catch(err => {
      console.error("Failed to open URL via Tauri shell:", err);
    });
  };

  const handleSearch = async (targetInput: string) => {
    const trimmed = targetInput.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSteamProfile(null);
    setRustStats(null);
    setInventory(null);
    setShowAllItems(false);
    setShowDetailedStats(false);
    setNoteError(null);

    try {
      let steamId64 = '';

      // Direct URL regex extraction first
      const profilesMatch = trimmed.match(/profiles\/(\d{17})/);
      const steamIdUkMatch = trimmed.match(/profile\/(\d{17})/);
      const isDigits17 = /^\d{17}$/.test(trimmed);

      if (profilesMatch) {
        steamId64 = profilesMatch[1];
      } else if (steamIdUkMatch) {
        steamId64 = steamIdUkMatch[1];
      } else if (isDigits17) {
        steamId64 = trimmed;
      }

      // If not resolved to SteamID64, run convert API
      if (!steamId64) {
        const convertUrl = `https://steamidapi.uk/v2/convert.php?myid=76561198283682068&apikey=TH3W6XURLPS359V0NYGW&input=${encodeURIComponent(trimmed)}`;
        const convertRes = await fetch(convertUrl);
        if (!convertRes.ok) {
          throw new Error(`Conversion API failed: ${convertRes.statusText}`);
        }
        const convertData = await convertRes.json();
        if (convertData.converted && convertData.converted.length > 0 && convertData.converted[0].steamid64) {
          steamId64 = convertData.converted[0].steamid64;
        } else {
          throw new Error('Could not convert input to a valid SteamID64.');
        }
      }

      // Query SteamID API
      const lookupUrl = `https://steamidapi.uk/v2/steamid.php?myid=76561198283682068&apikey=TH3W6XURLPS359V0NYGW&input=${steamId64}`;
      const lookupRes = await fetch(lookupUrl);
      if (!lookupRes.ok) {
        throw new Error(`SteamID API failed: ${lookupRes.statusText}`);
      }
      const lookupData = await lookupRes.json();

      if (lookupData.auth?.auth !== 'ok') {
        throw new Error('API Key error or invalid response from SteamID.uk API.');
      }

      if (!lookupData.profile || !lookupData.profile.steamid64) {
        throw new Error('No profile data returned for this player.');
      }

      setResult(lookupData);

      let pName = lookupData.profile?.steamid || steamId64;

      // Fetch Steam Profile details in backend
      try {
        const profileInfo = await invoke<SteamProfile>('get_steam_profile_info', { steamId: steamId64 });
        if (profileInfo?.name) {
          pName = profileInfo.name;
        }

        // NOTE: We intentionally do NOT fall back to BattleMetrics for the Rust
        // hours figure. BattleMetrics reports session playtime tracked across
        // specific servers (summed `timePlayedSeconds`), which is a DIFFERENT
        // metric from Steam's total "hrs on record" and reads lower than the
        // real total (this was the source of the wrong "3,675 hrs"). The backend
        // already sources the true Steam total (games XML → HTML profile →
        // RustStats `time_played`); if none of those are available we leave the
        // hours unset and the UI degrades to "Hours Private" rather than showing
        // a misleading number from an unrelated source.

        setSteamProfile(profileInfo);
      } catch (err) {
        console.error("Failed to fetch steam profile info:", err);
      }

      saveToHistory(steamId64, pName);

      // Fetch Rust XML statistics
      try {
        const stats = await invoke<any>('get_rust_member_stats', { steamId: steamId64 });
        setRustStats(stats);
      } catch (err) {
        console.error("Failed to fetch rust member stats:", err);
      }

      // Fetch & value the player's public Rust inventory (best-effort).
      setInvLoading(true);
      invoke<any>('get_steam_inventory', { steamId: steamId64 })
        .then((inv) => setInventory(inv))
        .catch((err) => console.error('Failed to fetch inventory:', err))
        .finally(() => setInvLoading(false));
    } catch (err: any) {
      setError(err.message || 'An error occurred during lookup.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result || !noteText.trim()) return;

    setSubmittingNote(true);
    setNoteError(null);

    try {
      const formData = new URLSearchParams();
      formData.append('note', noteText.trim());

      const res = await fetch(`https://steamidapi.uk/v2/add_private_note.php?myid=76561198283682068&apikey=TH3W6XURLPS359V0NYGW&input=${result.profile.steamid64}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      });

      if (!res.ok) {
        throw new Error(`Note API failed: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.status?.comment_added === '1') {
        setResult(prev => {
          if (!prev) return prev;
          const prevNotes = prev.private_notes?.notes || [];
          return {
            ...prev,
            private_notes: {
              private_note_count: String(prevNotes.length + 1),
              notes: [...prevNotes, noteText.trim()]
            }
          };
        });
        setNoteText('');
      } else {
        throw new Error(data.error || 'Failed to add note.');
      }
    } catch (err: any) {
      setNoteError(err.message || 'Error adding private note.');
    } finally {
      setSubmittingNote(false);
    }
  };

  const isBanned = (bans: ProfileBans) => {
    return (
      bans.vac === '1' ||
      Number(bans.amount_game_bans) > 0 ||
      bans.communityban === '1' ||
      bans.tradeban === '1' ||
      bans.rusthackreport === '1'
    );
  };

  const handleTrackBan = () => {
    if (!result) return;
    const isCurrentlyTracked = trackedPlayers.some(p => p.steamId === result.profile.steamid64);

    if (isCurrentlyTracked) {
      untrackPlayer(result.profile.steamid64);
    } else {
      trackPlayer({
        steamId: result.profile.steamid64,
        name: steamProfile?.name || result.profile.steamid64,
        vac: result.profile_bans.vac,
        amount_game_bans: result.profile_bans.amount_game_bans,
        communityban: result.profile_bans.communityban,
        tradeban: result.profile_bans.tradeban
      });
    }
  };

  const isPlayerTracked = result ? trackedPlayers.some(p => p.steamId === result.profile.steamid64) : false;

  // Compute the cheat-risk analysis once per render so the badge, meter and
  // factor list all stay in sync.
  const risk = steamProfile ? getCheaterRisk(steamProfile, rustStats, result?.profile_bans ?? null, result?.steamid_data) : null;
  const bandKey = risk ? risk.band.toLowerCase() : 'low';

  return (
    <div className="decay player-lookup pl-root">
      <div className="decay-section-head pl-head">
        <User size={15} className="pl-head-icon" />
        <h3>PLAYER STEAMID LOOKUP</h3>
      </div>
      <p className="text-dim pl-sub">
        Copy a SteamID, SteamID64, or F7 report profile URL from Rust and look it up instantly to inspect active bans, RustHackReport tweets, friend stats, and Rust hours.
      </p>

      {/* Search Input */}
      <div className="pl-search-row">
        <div className="pl-search-wrap">
          <Search size={14} className="pl-search-icon" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter SteamID, SteamID64, or Profile URL..."
            className="decay-input pl-input"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(input)}
          />
        </div>
        <button
          onClick={() => handleSearch(input)}
          disabled={loading || !input.trim()}
          className="decay-add pl-search-btn"
        >
          <Search size={13} />
          {loading ? 'Scanning...' : 'Search'}
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="pl-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="pl-loading">
          <div className="camview-rec-dot" style={{ width: 12, height: 12 }} />
          <span className="pl-loading-text">QUERY IN PROGRESS...</span>
        </div>
      )}

      {/* Results details */}
      {result && !loading && (
        <div className="lookup-results pl-results">

          {/* ── (b) BANS / RED FLAGS BANNER ───────────────────────────── */}
          {isBanned(result.profile_bans) ? (
            <div className="pl-banner pl-banner--danger">
              <div className="pl-banner-title">
                <ShieldAlert size={16} />
                <span>RED FLAGS / BANS DETECTED</span>
              </div>

              <div className="pl-ban-chips">
                {result.profile_bans.rusthackreport === '1' && (
                  <div className="pl-rhr">
                    <span className="pl-rhr-label">
                      <AlertTriangle size={12} />
                      RUST HACK REPORTED! ({result.profile_bans.rusthackreport_days_old || '?'} days ago)
                    </span>
                    {result.profile_bans.rusthackreport_url && (
                      <button className="pl-rhr-link" onClick={() => handleOpenLink(result.profile_bans.rusthackreport_url)}>
                        Open Tweet Report <ExternalLink size={10} />
                      </button>
                    )}
                  </div>
                )}
                {result.profile_bans.vac === '1' && (
                  <span className="pl-chip pl-chip--red"><ShieldAlert size={10} /> VAC BANNED</span>
                )}
                {Number(result.profile_bans.amount_game_bans) > 0 && (
                  <span className="pl-chip pl-chip--red"><ShieldAlert size={10} /> GAME BANS: {result.profile_bans.amount_game_bans}</span>
                )}
                {result.profile_bans.communityban === '1' && (
                  <span className="pl-chip pl-chip--amber"><ShieldAlert size={10} /> COMMUNITY BANNED</span>
                )}
                {result.profile_bans.tradeban === '1' && (
                  <span className="pl-chip pl-chip--amber"><ShieldAlert size={10} /> TRADE BANNED</span>
                )}
                {result.profile_bans.steamid_ban === '1' && (
                  <span className="pl-chip pl-chip--red"><ShieldAlert size={10} /> STEAMID BANNED</span>
                )}
              </div>
            </div>
          ) : (
            <div className="pl-banner pl-banner--clean">
              <CheckCircle2 size={16} />
              <span>NO ACTIVE BANS ON RECORD (CLEAN STATUS)</span>
            </div>
          )}

          {/* ── (a) IDENTITY HEADER ───────────────────────────────────── */}
          <div className="pl-identity">
            <div className="pl-identity-row">
              {/* Avatar with status border + Steam level badge */}
              <div className="pl-avatar-wrap">
                <img
                  src={steamProfile?.avatar_url || 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'}
                  alt="Avatar"
                  className={`pl-avatar ${isBanned(result.profile_bans) ? 'pl-avatar--banned' : 'pl-avatar--clean'}`}
                />
                {steamProfile && (
                  <div
                    className="pl-level-badge"
                    title={`Steam Level ${steamProfile.steam_level}`}
                    style={{
                      border: `2px solid ${getSteamLevelColor(steamProfile.steam_level)}`,
                      boxShadow: `0 0 6px ${getSteamLevelColor(steamProfile.steam_level)}, 0 2px 4px rgba(0,0,0,0.6)`,
                    }}
                  >
                    {steamProfile.steam_level}
                  </div>
                )}
              </div>

              {/* Name + privacy + hours chips */}
              <div className="pl-id-main">
                <div className="pl-id-name-row">
                  <h4 className="pl-name">{steamProfile?.name || result.profile.steamid || 'Unknown'}</h4>
                  {steamProfile && (
                    <span className={`pl-privacy ${steamProfile.privacy_state === 'public' ? 'pl-privacy--public' : 'pl-privacy--private'}`}>
                      {steamProfile.privacy_state}
                    </span>
                  )}
                </div>

                <div className="pl-chips-row">
                  {steamProfile?.rust_hours !== undefined && steamProfile?.rust_hours !== null ? (
                    <div className="pl-hours-chip">
                      <Clock size={10} className="pl-hours-icon" />
                      <span className="pl-chip-label">RUST:</span>
                      <span className="pl-chip-val">{Math.round(steamProfile.rust_hours).toLocaleString('en-US')} hrs</span>
                    </div>
                  ) : (
                    <div className="pl-hours-missing">
                      <Clock size={10} />
                      <span>{steamProfile?.privacy_state === 'private' ? 'Hours Private' : 'No Rust play history found'}</span>
                    </div>
                  )}

                  {steamProfile?.recent_hours !== undefined && steamProfile?.recent_hours !== null && steamProfile.recent_hours > 0 && (
                    <div className="pl-hours-chip pl-hours-chip--2wk" title="Rust playtime over the last 2 weeks">
                      <span className="pl-chip-label">2-WK:</span>
                      <span className="pl-chip-val pl-chip-val--amber">{Math.round(steamProfile.recent_hours)} hrs</span>
                      <span className="pl-chip-sub">· {(steamProfile.recent_hours / 14).toFixed(1)}/day</span>
                    </div>
                  )}

                  {steamProfile?.is_playing_rust && (
                    <div className="pl-playing">
                      <span className="pl-playing-dot" />
                      <span className="pl-playing-text">PLAYING NOW</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Ban tracking toggle */}
              <button className={`pl-track-btn ${isPlayerTracked ? 'pl-track-btn--on' : ''}`} onClick={handleTrackBan}>
                {isPlayerTracked ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                {isPlayerTracked ? 'UNTRACK BANS' : 'TRACK FOR BANS'}
              </button>
            </div>

            {/* Quick links */}
            <div className="pl-links">
              <button className="pl-link-btn" onClick={() => handleOpenLink(`https://steamcommunity.com/profiles/${result.profile.steamid64}`)}>
                <span>STEAM PROFILE</span>
                <ExternalLink size={10} />
              </button>
              <button className="pl-link-btn" onClick={() => handleOpenLink(`https://steamid.uk/profile/${result.profile.steamid64}`)}>
                <span>STEAMID.UK</span>
                <ExternalLink size={10} />
              </button>
            </div>
          </div>

          {/* ── (c) CHEAT RISK CARD ───────────────────────────────────── */}
          {risk && (
            <div className="pl-card pl-risk">
              <div className="pl-risk-head">
                <span className="pl-risk-title">
                  <ShieldAlert size={12} /> CHEAT RISK ANALYSIS
                </span>
                <span className={`pl-risk-badge pl-risk-badge--${bandKey}`}>
                  {risk.band} RISK · {risk.score}/100
                </span>
              </div>

              {/* Score meter */}
              <div className="pl-risk-meter">
                <div className={`pl-risk-meter-fill pl-risk-meter-fill--${bandKey}`} style={{ width: `${risk.score}%` }} />
              </div>
              <div className="pl-risk-scale">
                <span>LOW 0</span>
                <span>MED 25</span>
                <span>HIGH 60</span>
                <span>100</span>
              </div>

              {/* Contributing factors */}
              <div className="pl-factors">
                {risk.factors.length > 0 ? (
                  risk.factors.map((f, i) => (
                    <div key={i} className="pl-factor">
                      <span className="pl-factor-label">{f.label}</span>
                      <span className="pl-factor-pts">+{f.points}</span>
                    </div>
                  ))
                ) : (
                  <div className="pl-risk-clean">
                    <CheckCircle2 size={13} />
                    <span>No cheat indicators detected from the available data.</span>
                  </div>
                )}
              </div>

              {rustStats && rustStats.privacy === 'public' && !risk.combatEvaluated && (
                <span className="pl-risk-note">
                  Combat-based signals skipped — not enough match volume (needs 50+ kills or 500+ shots) to score reliably.
                </span>
              )}
              {(!rustStats || rustStats.privacy !== 'public') && (
                <span className="pl-risk-note">
                  Combat-based signals unavailable — this player's Rust stats are private or unsynced. Score reflects bans, friend network and playtime only.
                </span>
              )}
            </div>
          )}

          {/* ── (d) COMBAT SCORECARD ──────────────────────────────────── */}
          {rustStats && (() => {
            const kills = Number(rustStats.kills) || 0;
            const deaths = Number(rustStats.deaths) || 0;
            const headshots = Number(rustStats.headshots) || 0;
            const fired = Number(rustStats.bullet_fired) || 0;
            const hits = Number(rustStats.bullet_hit) || 0;
            const kd = kills / (deaths || 1);
            const accuracy = fired > 0 ? hits / fired : 0;
            const hsRate = kills > 0 ? headshots / kills : 0;
            const isPrivateOrUnsynced = rustStats.privacy === 'private' || (kills === 0 && deaths === 0 && headshots === 0);

            return (
              <div className="pl-card">
                <div className="pl-section-divider"><span>COMBAT SCORECARD</span></div>

                {isPrivateOrUnsynced ? (
                  <div className="pl-combat-private">
                    <AlertTriangle size={16} />
                    <span style={{ fontWeight: 700 }}>PRIVATE PROFILE / UNSYNCED</span>
                    <span className="pl-combat-private-sub">
                      This player's game details are private on Steam, or their profile has not been tracked/synced on RustStats.io.
                    </span>
                  </div>
                ) : (
                  <div className="pl-combat-grid">
                    <div className="pl-combat-tile">
                      <span className="pl-combat-label">K / D</span>
                      <span className={`pl-combat-val ${kills > 50 && kd > 3.5 ? 'pl-combat-val--flag' : ''}`}>{kd.toFixed(2)}</span>
                    </div>
                    <div className="pl-combat-tile">
                      <span className="pl-combat-label">Accuracy</span>
                      <span className={`pl-combat-val ${fired > 500 && accuracy > 0.32 ? 'pl-combat-val--flag' : ''}`}>{(accuracy * 100).toFixed(1)}%</span>
                    </div>
                    <div className="pl-combat-tile">
                      <span className="pl-combat-label">Headshot-to-Kill</span>
                      <span className={`pl-combat-val ${kills > 50 && hsRate > 0.38 ? 'pl-combat-val--flag' : ''}`}>{(hsRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="pl-combat-tile">
                      <span className="pl-combat-label">Kills</span>
                      <span className="pl-combat-val">{kills.toLocaleString('en-US')}</span>
                    </div>
                    <div className="pl-combat-tile">
                      <span className="pl-combat-label">Deaths</span>
                      <span className="pl-combat-val">{deaths.toLocaleString('en-US')}</span>
                    </div>
                    <div className="pl-combat-tile">
                      <span className="pl-combat-label">Headshots</span>
                      <span className="pl-combat-val">{headshots.toLocaleString('en-US')}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── (e) DETAILED RUST CAREER STATS (collapsible) ──────────── */}
          {rustStats && (() => {
            const all: AllStats = (rustStats.all_stats && typeof rustStats.all_stats === 'object') ? rustStats.all_stats : {};
            const hasAllStats = Object.keys(all).length > 0;

            // No per-stat breakdown available. If the profile is private, show a
            // tasteful note; otherwise stay silent (the combat scorecard above
            // already summarises what is known). Tiles are never invented.
            if (!hasAllStats) {
              if (rustStats.privacy === 'private') {
                return (
                  <div className="pl-stats-private">
                    <Shield size={12} />
                    <span>This player's detailed Rust statistics are private.</span>
                  </div>
                );
              }
              return null;
            }

            const heroDef = STAT_SECTIONS.find((s) => s.title === 'PVP STATS');
            const heroTiles = (heroDef ? heroDef.entries : [])
              .map((entry) => ({ entry, resolved: resolveStatEntry(entry, all) }))
              .filter((t) => t.resolved !== null) as { entry: StatEntry; resolved: { value: number; text: string } }[];

            const compactSections = STAT_SECTIONS
              .filter((s) => s.title !== 'PVP STATS')
              .map((section) => {
                const tiles = section.entries
                  .map((entry) => ({ entry, resolved: resolveStatEntry(entry, all) }))
                  .filter((t) => t.resolved !== null) as { entry: StatEntry; resolved: { value: number; text: string } }[];
                return { section, tiles };
              })
              .filter((s) => s.tiles.length > 0);

            if (heroTiles.length === 0 && compactSections.length === 0) {
              return (
                <div className="pl-stats-private">
                  <Database size={12} />
                  <span>Detailed Rust statistics are not available for this profile.</span>
                </div>
              );
            }

            return (
              <div className="pl-card pl-stats">
                <div className="pl-stats-head">
                  <Database size={12} className="pl-card-icon" />
                  <span className="pl-card-title">RUST CAREER STATISTICS</span>
                  <span className="pl-stats-live">(live Steam data)</span>
                  <button className="pl-collapse-btn" onClick={() => setShowDetailedStats((v) => !v)}>
                    {showDetailedStats ? '▲ HIDE BREAKDOWN' : '▼ FULL BREAKDOWN'}
                  </button>
                </div>

                {/* Hero PVP metrics — always visible headline numbers */}
                {heroTiles.length > 0 && (
                  <div className="pl-hero-grid">
                    {heroTiles.map(({ entry, resolved }) => (
                      <div key={entry.label} className="pl-hero-tile" title={`${entry.label}: ${resolved.value.toLocaleString('en-US')}`}>
                        <span className="pl-hero-val">{resolved.text}</span>
                        <span className="pl-hero-label">{entry.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Compact sections — collapsed by default to keep things tidy */}
                {showDetailedStats && compactSections.map(({ section, tiles }) => (
                  <div key={section.title} className="pl-stat-section">
                    <div className="pl-stat-section-head">
                      <span className="pl-stat-bar" />
                      <span className="pl-stat-section-title">{section.title}</span>
                    </div>
                    <div className="pl-tile-grid">
                      {tiles.map(({ entry, resolved }) => (
                        <div key={entry.label} className="pl-tile" title={`${entry.label}: ${resolved.value.toLocaleString('en-US')}`}>
                          <span className="pl-tile-label">{entry.label}</span>
                          <span className="pl-tile-val">{resolved.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── (f) INVENTORY SCAN — public Rust inventory + market value ── */}
          {(invLoading || inventory) && (
            <div className="pl-card">
              <div className="pl-inv-head">
                <span className="pl-inv-title"><Database size={13} /> INVENTORY SCAN</span>
                {inventory && !inventory.is_private && (
                  <span className="pl-inv-estimate">${inventory.total_value.toFixed(2)} estimate</span>
                )}
              </div>

              {invLoading && !inventory ? (
                <div className="pl-inv-msg">
                  <div className="camview-rec-dot" style={{ width: 10, height: 10 }} /> SCANNING INVENTORY &amp; PRICING…
                </div>
              ) : inventory && inventory.is_private ? (
                <div className="pl-inv-msg"><Shield size={12} /> This player's Steam inventory is private.</div>
              ) : inventory && inventory.distinct_items === 0 ? (
                <div className="pl-inv-msg">No Rust items in this player's public inventory.</div>
              ) : inventory ? (
                <>
                  {/* Value summary */}
                  <div className="pl-inv-summary">
                    <div className="pl-inv-stat pl-inv-stat--total">
                      <div className="pl-inv-stat-label">TOTAL VALUE</div>
                      <div className="pl-inv-stat-val">${inventory.total_value.toFixed(2)}</div>
                    </div>
                    <div className="pl-inv-stat pl-inv-stat--tradable">
                      <div className="pl-inv-stat-label">TRADABLE</div>
                      <div className="pl-inv-stat-val pl-inv-stat-val--tradable">${inventory.tradable_value.toFixed(2)}</div>
                    </div>
                    <div className="pl-inv-stat">
                      <div className="pl-inv-stat-label">ITEMS</div>
                      <div className="pl-inv-stat-val">{inventory.total_items}</div>
                    </div>
                    <div className="pl-inv-stat">
                      <div className="pl-inv-stat-label">PRICED</div>
                      <div className="pl-inv-stat-val--sm">{inventory.priced_count} priced · {inventory.unpriced_count} unpriced</div>
                    </div>
                  </div>

                  {/* Item grid — most valuable first; show top 7, expand on demand */}
                  <div className="pl-inv-grid">
                    {inventory.items.slice(0, showAllItems ? 200 : 7).map((it: any, i: number) => (
                      <div key={i} className="pl-inv-item">
                        <div className="pl-inv-item-img">
                          {it.icon_url ? <img src={it.icon_url} alt="" /> : <Database size={20} style={{ color: 'var(--color-text-dim)' }} />}
                          {it.count > 1 && <span className="pl-inv-item-count">×{it.count}</span>}
                        </div>
                        <div className="pl-inv-item-name" title={it.name}>{it.name}</div>
                        <div className="pl-inv-item-meta">
                          <span className="pl-inv-item-type">{it.item_type || 'Item'}</span>
                          {it.price != null ? (
                            <span className="pl-inv-item-price">${it.price.toFixed(2)}</span>
                          ) : (
                            <span className="pl-inv-item-noprice">—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {inventory.distinct_items > 7 && (
                    <button className="pl-inv-toggle" onClick={() => setShowAllItems((v) => !v)}>
                      {showAllItems ? '▲ Show top 7 only' : `▼ View all ${inventory.distinct_items} item types`}
                    </button>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* ── STEAM SYSTEM IDENTIFIERS ──────────────────────────────── */}
          <div className="pl-card">
            <div className="pl-card-head">
              <Database size={12} className="pl-card-icon" />
              <span className="pl-card-title">STEAM SYSTEM IDENTIFIERS</span>
            </div>

            <table className="pl-id-table">
              <tbody>
                <tr>
                  <td className="pl-id-key">SteamID64</td>
                  <td className="pl-id-val pl-id-val--strong">
                    <span>{result.profile.steamid64}</span>
                    <button className="pl-copy" title="Copy SteamID64" onClick={() => navigator.clipboard.writeText(result.profile.steamid64)}>
                      <Copy size={10} />
                    </button>
                  </td>
                </tr>
                <tr>
                  <td className="pl-id-key">SteamID</td>
                  <td className="pl-id-val">{result.profile.steamid}</td>
                </tr>
                <tr>
                  <td className="pl-id-key">Steam3</td>
                  <td className="pl-id-val">{result.profile.steam3}</td>
                </tr>
                {result.profile.inviteurl && (
                  <tr>
                    <td className="pl-id-key">Invite Link</td>
                    <td className="pl-id-val">{result.profile.inviteurl}</td>
                  </tr>
                )}
                {result.profile.csgofriend && (
                  <tr>
                    <td className="pl-id-key">Friend Code</td>
                    <td className="pl-id-val">{result.profile.csgofriend}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── FRIENDS & DATABASE STATS ──────────────────────────────── */}
          {result.steamid_data && (
            <div className="pl-card">
              <div className="pl-card-head">
                <User size={12} className="pl-card-icon" />
                <span className="pl-card-title">FRIENDS &amp; DATABASE STATS</span>
              </div>

              <div className="pl-fdb-grid">
                <div className="pl-fdb-col">
                  <div className="pl-fdb-row">
                    <span className="pl-fdb-key">Total Friends</span>
                    <span className="pl-fdb-val">{result.steamid_data.friend_count || '0'}</span>
                  </div>
                  <div className="pl-fdb-row">
                    <span className="pl-fdb-key">Friend History</span>
                    <span className="pl-fdb-val">{result.steamid_data.friend_history_count || '0'}</span>
                  </div>
                  <div className="pl-fdb-row">
                    <span className="pl-fdb-key">Names History</span>
                    <span className="pl-fdb-val">{result.steamid_data.name_history_count || '0'}</span>
                  </div>
                </div>

                <div className="pl-fdb-col">
                  <div className="pl-fdb-row">
                    <span className="pl-fdb-key">VAC Banned Friends</span>
                    <span className={`pl-fdb-val ${Number(result.steamid_data.vac_banned_friends) > 0 ? 'pl-fdb-val--red' : ''}`}>
                      {result.steamid_data.vac_banned_friends || '0'}
                    </span>
                  </div>
                  <div className="pl-fdb-row">
                    <span className="pl-fdb-key">Game Banned Friends</span>
                    <span className={`pl-fdb-val ${Number(result.steamid_data.game_banned_friends) > 0 ? 'pl-fdb-val--red' : ''}`}>
                      {result.steamid_data.game_banned_friends || '0'}
                    </span>
                  </div>
                  <div className="pl-fdb-row">
                    <span className="pl-fdb-key">Comm Banned Friends</span>
                    <span className={`pl-fdb-val ${Number(result.steamid_data.community_banned_friends) > 0 ? 'pl-fdb-val--amber' : ''}`}>
                      {result.steamid_data.community_banned_friends || '0'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── (g) PRIVATE NOTES ─────────────────────────────────────── */}
          <div className="pl-card">
            <div className="pl-card-head">
              <FileText size={12} className="pl-card-icon" />
              <span className="pl-card-title">MY PRIVATE PLAYER NOTES</span>
            </div>

            {result.private_notes?.notes && result.private_notes.notes.length > 0 ? (
              <div className="pl-notes-list">
                {result.private_notes.notes.map((n, idx) => (
                  <div key={idx} className="pl-note">{n}</div>
                ))}
              </div>
            ) : (
              <div className="pl-note-empty">No notes added for this SteamID yet.</div>
            )}

            <form onSubmit={handleAddNote} className="pl-note-form">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write a custom note for this player (cheater details, clan, base location...)"
                maxLength={512}
                className="pl-note-area"
              />
              {noteError && <div className="pl-note-err">{noteError}</div>}
              <button type="submit" disabled={submittingNote || !noteText.trim()} className="decay-add pl-note-submit">
                <BookmarkCheck size={12} />
                {submittingNote ? 'Saving...' : 'Add Note'}
              </button>
            </form>
          </div>

          <button className="pl-back-btn" onClick={() => { setResult(null); setSteamProfile(null); }}>
            &larr; BACK TO WATCHLIST
          </button>
        </div>
      )}

      {/* ── WATCHLIST / BAN TRACKER LIST ────────────────────────────── */}
      {!result && !loading && (
        <div className="pl-watch">
          <div className="pl-watch-head">
            <Shield size={12} className="pl-card-icon" />
            <span className="pl-watch-head-title">BAN MONITOR WATCHLIST ({trackedPlayers.length})</span>
          </div>

          {trackedPlayers.length === 0 ? (
            <div className="pl-watch-empty">
              No players tracked for bans yet. Search a player above and click "Track for Bans" to monitor their profile in the background.
            </div>
          ) : (
            <div className="pl-watch-list">
              {trackedPlayers.map((p) => {
                const hasBans = p.vac === '1' || Number(p.amount_game_bans) > 0 || p.communityban === '1' || p.tradeban === '1';
                return (
                  <div key={p.steamId} className="pl-watch-item">
                    <div className="pl-watch-item-main" onClick={() => { setInput(p.steamId); handleSearch(p.steamId); }}>
                      <div className="pl-watch-name">{p.name}</div>
                      <div className="pl-watch-id">{p.steamId}</div>
                    </div>

                    <div className="pl-watch-right">
                      <span className={`pl-watch-status ${hasBans ? 'pl-watch-status--banned' : 'pl-watch-status--clean'}`}>
                        {hasBans ? <ShieldAlert size={10} /> : <ShieldCheck size={10} />}
                        {hasBans ? 'BANNED' : 'CLEAN'}
                      </span>
                      <button className="pl-untrack" title="Remove from watchlist" onClick={() => untrackPlayer(p.steamId)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search History */}
          {history.length > 0 && (
            <div className="pl-hist">
              <div className="pl-hist-head">
                <div className="pl-hist-head-title">
                  <History size={10} />
                  <span>Recent Lookups</span>
                </div>
                <button className="pl-hist-clear" onClick={clearHistory}>
                  <Trash2 size={10} />
                  <span>CLEAR HISTORY</span>
                </button>
              </div>
              <div className="pl-hist-chips">
                {history.map(({ id, name }) => (
                  <button key={id} className="pl-hist-chip" title={`SteamID: ${id}`} onClick={() => { setInput(id); handleSearch(id); }}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
