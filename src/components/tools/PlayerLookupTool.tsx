import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useBanTrackerStore } from '../../stores/ban-tracker-store';
import {
  Search, Shield, ShieldAlert, ShieldCheck, ExternalLink,
  Copy, FileText, Database, User, Clock, AlertTriangle,
  CheckCircle2, Trash2, History, AlertCircle, BookmarkCheck
} from 'lucide-react';

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
}const getSteamLevelColor = (lvl: number): string => {
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

const getCheaterRisk = (
  profile: SteamProfile | null,
  stats: any | null,
  apiBans: ProfileBans | null,
  steamIdData?: SteamIdData | null,
) => {
  let score = 0;
  const reasons: string[] = [];

  if (apiBans) {
    if (apiBans.vac === '1') {
      score += 40;
      reasons.push('Has active Steam VAC ban');
    }
    const gameBans = Number(apiBans.amount_game_bans) || 0;
    if (gameBans > 0) {
      score += Math.min(50, gameBans * 25);
      reasons.push(`Has active game ban(s): ${gameBans}`);
    }
    if (apiBans.rusthackreport === '1') {
      score += 45;
      reasons.push(`Flagged on Twitter @RustHackReport (${apiBans.rusthackreport_days_old || '?'} days ago)`);
    }
  }

  // Banned-friends ratio is one of the strongest real cheater signals: cheaters
  // cluster together, so a high % of VAC/game-banned friends is a big red flag.
  if (steamIdData) {
    const friends = Number(steamIdData.friend_count) || 0;
    const bannedFriends =
      (Number(steamIdData.vac_banned_friends) || 0) +
      (Number(steamIdData.game_banned_friends) || 0);
    if (friends >= 5 && bannedFriends > 0) {
      const ratio = bannedFriends / friends;
      if (ratio >= 0.30) {
        score += 30;
        reasons.push(`${bannedFriends}/${friends} friends banned (${Math.round(ratio * 100)}% — cheater cluster)`);
      } else if (ratio >= 0.15) {
        score += 18;
        reasons.push(`${bannedFriends}/${friends} friends banned (${Math.round(ratio * 100)}%)`);
      } else if (bannedFriends >= 3) {
        score += 8;
        reasons.push(`${bannedFriends} banned friends`);
      }
    }
    // Frequent name/URL changes are common on cheater re-rolls.
    const nameChanges = Number(steamIdData.name_history_count) || 0;
    if (nameChanges >= 15) {
      score += 8;
      reasons.push(`Many alias changes (${nameChanges}) — possible ban evasion`);
    }
  }

  if (profile) {
    if (profile.privacy_state === 'private') {
      if (profile.steam_level <= 3) {
        score += 15;
        reasons.push('Private profile with extremely low level (probable alt/throwaway)');
      } else {
        score += 5;
      }
    } else {
      const hours = profile.rust_hours;
      if (hours !== null) {
        if (hours < 50) {
          score += 25;
          reasons.push(`Extremely low Rust playtime: ${Math.round(hours)} hrs (potential alt account)`);
        } else if (hours < 250) {
          score += 15;
          reasons.push(`Low Rust playtime: ${Math.round(hours)} hrs`);
        } else if (hours > 2500) {
          score -= 20;
        }
      } else {
        score += 10;
      }

      if (profile.steam_level <= 2) {
        score += 15;
        reasons.push(`Steam account level is very low: ${profile.steam_level} (recently created / alt)`);
      }
    }
  }

  if (stats && stats.privacy === 'public') {
    const kills = stats.kills || 0;
    const deaths = stats.deaths || 0;
    const kd = kills / (deaths || 1);
    const accuracy = stats.bullet_fired > 0 ? (stats.bullet_hit / stats.bullet_fired) : 0;
    const hsRate = kills > 0 ? (stats.headshots / kills) : 0;

    if (kills > 20) {
      if (kd > 6.0) {
        score += 35;
        reasons.push(`Highly anomalous K/D ratio: ${kd.toFixed(2)}`);
      } else if (kd > 3.0) {
        score += 20;
        reasons.push(`High K/D ratio: ${kd.toFixed(2)}`);
      }

      if (hsRate > 0.50) {
        score += 30;
        reasons.push(`Extremely high Headshot-to-Kill rate: ${(hsRate * 100).toFixed(1)}%`);
      } else if (hsRate > 0.38) {
        score += 15;
        reasons.push(`Elevated Headshot-to-Kill rate: ${(hsRate * 100).toFixed(1)}%`);
      }
    }

    if (stats.bullet_fired > 200) {
      if (accuracy > 0.40) {
        score += 35;
        reasons.push(`Highly anomalous bullet accuracy: ${(accuracy * 100).toFixed(1)}% (aimbot/recoil script indicator)`);
      } else if (accuracy > 0.32) {
        score += 20;
        reasons.push(`Suspiciously high bullet accuracy: ${(accuracy * 100).toFixed(1)}%`);
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (score >= 60) risk = 'HIGH';
  else if (score >= 25) risk = 'MEDIUM';

  return { risk, score, reasons };
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

  return (
    <div className="decay player-lookup" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="decay-section-head" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <User size={15} style={{ color: 'var(--color-accent)' }} />
        <h3 style={{ margin: 0 }}>PLAYER STEAMID LOOKUP</h3>
      </div>
      <p className="text-dim" style={{ margin: '0 0 4px 0', fontSize: 11, lineHeight: 1.4 }}>
        Copy a SteamID, SteamID64, or F7 report profile URL from Rust and look it up instantly to inspect active bans, RustHackReport tweets, friend stats, and Rust hours.
      </p>

      {/* Search Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--color-text-dim)' }} />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter SteamID, SteamID64, or Profile URL..."
            className="decay-input"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(input)}
            style={{ flex: 1, paddingLeft: 32, background: 'rgba(0, 0, 0, 0.4)', borderColor: 'var(--color-border)' }}
          />
        </div>
        <button
          onClick={() => handleSearch(input)}
          disabled={loading || !input.trim()}
          className="decay-add"
          style={{ minWidth: 90, margin: 0, background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Search size={13} />
          {loading ? 'Scanning...' : 'Search'}
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '30px 0' }}>
          <div className="camview-rec-dot" style={{ width: 12, height: 12, marginRight: 8 }} />
          <span style={{ fontSize: 12, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>QUERYS IN PROGRESS...</span>
        </div>
      )}

      {/* Results details */}
      {result && !loading && (
        <div className="lookup-results" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          
          {/* BAN / RED FLAGS BANNER */}
          {isBanned(result.profile_bans) ? (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 8,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontWeight: 'bold', fontSize: 13 }}>
                <ShieldAlert size={16} />
                <span>RED FLAGS / BANS CACHED</span>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.profile_bans.rusthackreport === '1' && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#fff',
                    padding: '6px 10px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 'bold',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    width: '100%'
                  }}>
                    <span style={{ color: '#ff8a80', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={12} />
                      RUST HACK REPORTED! ({result.profile_bans.rusthackreport_days_old || '?'} days ago)
                    </span>
                    {result.profile_bans.rusthackreport_url && (
                      <button
                        onClick={() => handleOpenLink(result.profile_bans.rusthackreport_url)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#58c6e8',
                          textDecoration: 'underline',
                          fontSize: 9,
                          fontFamily: 'var(--font-mono)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        Open Tweet Report <ExternalLink size={10} />
                      </button>
                    )}
                  </div>
                )}
                {result.profile_bans.vac === '1' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>
                    <ShieldAlert size={10} /> VAC BANNED
                  </span>
                )}
                {Number(result.profile_bans.amount_game_bans) > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>
                    <ShieldAlert size={10} /> GAME BANS: {result.profile_bans.amount_game_bans}
                  </span>
                )}
                {result.profile_bans.communityban === '1' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ff9100', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>
                    <ShieldAlert size={10} /> COMMUNITY BANNED
                  </span>
                )}
                {result.profile_bans.tradeban === '1' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ff9100', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>
                    <ShieldAlert size={10} /> TRADE BANNED
                  </span>
                )}
                {result.profile_bans.steamid_ban === '1' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>
                    <ShieldAlert size={10} /> STEAMID BANNED
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 8,
              padding: '10px 12px',
              color: '#10b981',
              fontSize: 11,
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <CheckCircle2 size={16} />
              <span>NO ACTIVE BANS CACHED (CLEAN STATUS)</span>
            </div>
          )}

          {/* VISUALLY ENHANCED OVERVIEW CARD */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* Avatar with status border and Official Steam level badge */}
              <div style={{ position: 'relative' }}>
                <img
                  src={steamProfile?.avatar_url || 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'}
                  alt="Avatar"
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 8,
                    border: isBanned(result.profile_bans) ? '2px solid #ef4444' : '2px solid #10b981',
                    objectFit: 'cover',
                    boxShadow: isBanned(result.profile_bans) ? '0 0 10px rgba(239, 68, 68, 0.35)' : '0 0 10px rgba(16, 185, 129, 0.3)'
                  }}
                />
                {steamProfile && (
                  <div 
                    title={`Steam Level ${steamProfile.steam_level}`}
                    style={{
                      position: 'absolute',
                      bottom: -5,
                      right: -5,
                      border: `2px solid ${getSteamLevelColor(steamProfile.steam_level)}`,
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 'bold',
                      color: '#fff',
                      backgroundColor: '#1b2838',
                      boxShadow: `0 0 6px ${getSteamLevelColor(steamProfile.steam_level)}, 0 2px 4px rgba(0,0,0,0.6)`,
                    }}
                  >
                    {steamProfile.steam_level}
                  </div>
                )}
              </div>

              {/* Name, Rust Hours and Actions */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {steamProfile?.name || result.profile.steamid || 'Unknown'}
                  </h4>
                  {steamProfile && (
                    <span style={{
                      fontSize: 8,
                      textTransform: 'uppercase',
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: steamProfile.privacy_state === 'public' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: steamProfile.privacy_state === 'public' ? '#10b981' : '#ef4444',
                      border: steamProfile.privacy_state === 'public' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)'
                    }}>
                      {steamProfile.privacy_state}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  {steamProfile?.rust_hours !== undefined && steamProfile.rust_hours !== null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(206,66,43,0.12)', border: '1px solid rgba(206,66,43,0.3)', padding: '2px 6px', borderRadius: 4 }}>
                      <Clock size={10} style={{ color: 'var(--color-accent)' }} />
                      <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>RUST:</span>
                      <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
                        {Math.round(steamProfile.rust_hours).toLocaleString('en-US')} hrs
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} />
                      <span>{steamProfile?.privacy_state === 'private' ? 'Hours Private' : 'No Rust play history found'}</span>
                    </div>
                  )}

                  {steamProfile?.recent_hours !== undefined && steamProfile.recent_hours !== null && steamProfile.recent_hours > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '2px 6px', borderRadius: 4 }} title="Rust playtime over the last 2 weeks">
                      <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>2-WK:</span>
                      <span style={{ fontSize: 10, fontWeight: 'bold', color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                        {Math.round(steamProfile.recent_hours)} hrs
                      </span>
                      <span style={{ fontSize: 8.5, color: 'var(--color-text-dim)' }}>
                        · {(steamProfile.recent_hours / 14).toFixed(1)}/day
                      </span>
                    </div>
                  )}

                  {steamProfile?.is_playing_rust && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 6px', borderRadius: 4 }}>
                      <style>{`
                        @keyframes playing-pulse {
                          0% { transform: scale(0.9); opacity: 0.6; }
                          50% { transform: scale(1.25); opacity: 1; }
                          100% { transform: scale(0.9); opacity: 0.6; }
                        }
                        .playing-pulse-dot {
                          animation: playing-pulse 2s infinite ease-in-out;
                        }
                      `}</style>
                      <span className="playing-pulse-dot" style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        boxShadow: '0 0 6px #10b981',
                        display: 'inline-block'
                      }}></span>
                      <span style={{ fontSize: 9, fontWeight: 'bold', color: '#10b981', fontFamily: 'var(--font-mono)' }}>PLAYING NOW</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Ban tracking toggle */}
              <button
                onClick={handleTrackBan}
                style={{
                  background: isPlayerTracked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.12)',
                  border: isPlayerTracked ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(6, 182, 212, 0.35)',
                  color: isPlayerTracked ? '#ff6b6b' : '#06b6d4',
                  borderRadius: 6,
                  padding: '5px 9px',
                  fontSize: 10,
                  fontWeight: 'bold',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {isPlayerTracked ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                {isPlayerTracked ? 'UNTRACK BANS' : 'TRACK FOR BANS'}
              </button>
            </div>

            {/* Profile Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
              <button
                onClick={() => handleOpenLink(`https://steamcommunity.com/profiles/${result.profile.steamid64}`)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '5px 0',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4
                }}
              >
                <span>STEAM PROFILE</span>
                <ExternalLink size={10} />
              </button>
              <button
                onClick={() => handleOpenLink(`https://steamid.uk/profile/${result.profile.steamid64}`)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '5px 0',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4
                }}
              >
                <span>STEAMID.UK</span>
                <ExternalLink size={10} />
              </button>

            </div>

          </div>

          {/* CHEAT PROBABILITY & COMBAT scorecard CARD */}
          {steamProfile && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldAlert size={12} style={{ color: 'var(--color-accent)' }} />
                  <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)', letterSpacing: '0.5px' }}>CHEAT PROBABILITY ANALYSIS</span>
                </div>
                {(() => {
                  const analysis = getCheaterRisk(steamProfile, rustStats, result.profile_bans, result.steamid_data);
                  const color = analysis.risk === 'HIGH' ? '#ef4444' : analysis.risk === 'MEDIUM' ? '#f59e0b' : '#10b981';
                  const bg = analysis.risk === 'HIGH' ? 'rgba(239,68,68,0.12)' : analysis.risk === 'MEDIUM' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';
                  return (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 'bold',
                      color: color,
                      backgroundColor: bg,
                      border: `1px solid ${color}`,
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {analysis.risk} RISK ({analysis.score}%)
                    </span>
                  );
                })()}
              </div>

              {/* Combat Scorecard Section */}
              {(() => {
                const analysis = getCheaterRisk(steamProfile, rustStats, result.profile_bans, result.steamid_data);
                const kills = rustStats ? rustStats.kills : 0;
                const deaths = rustStats ? rustStats.deaths : 0;
                const kd = rustStats ? (kills / (deaths || 1)) : 0;
                const accuracy = rustStats && rustStats.bullet_fired > 0 ? (rustStats.bullet_hit / rustStats.bullet_fired) : 0;
                const hsRate = rustStats && rustStats.kills > 0 ? (rustStats.headshots / rustStats.kills) : 0;
                const reliableKills = kills >= 20;
                const cappedKd = Math.min(kd, 10);
                const pvpScore = reliableKills ? Math.min(1000, Math.round((cappedKd * 200) + (accuracy * 60) + (hsRate * 40))) : null;

                const isPrivateOrUnsynced = rustStats && (rustStats.privacy === 'private' || (rustStats.kills === 0 && rustStats.deaths === 0 && rustStats.headshots === 0));

                if (isPrivateOrUnsynced) {
                  return (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }}></div>
                        <span style={{ padding: '0 12px', fontSize: 10, fontWeight: 'bold', color: 'var(--color-text-dim)', letterSpacing: '2px', fontFamily: 'var(--font-mono)' }}>COMBAT</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }}></div>
                      </div>
                      <div style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.06)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        borderRadius: 6,
                        padding: '10px 12px',
                        color: '#f59e0b',
                        fontSize: 11,
                        lineHeight: 1.4,
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <AlertTriangle size={16} />
                        <span style={{ fontWeight: 'bold' }}>PRIVATE PROFILE / UNSYNCED</span>
                        <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
                          This player's game details are private on Steam, or their profile has not been tracked/synced on RustStats.io.
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }}></div>
                      <span style={{ padding: '0 12px', fontSize: 10, fontWeight: 'bold', color: 'var(--color-text-dim)', letterSpacing: '2px', fontFamily: 'var(--font-mono)' }}>COMBAT</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }}></div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      {/* Left Column */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: '#fff' }}>PvP score</span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 'bold',
                            color: '#fff',
                            background: 'rgba(255,255,255,0.08)',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontFamily: 'var(--font-mono)'
                          }}>
                            {rustStats && rustStats.privacy === 'public' && reliableKills ? `${pvpScore}/1000` : rustStats && rustStats.privacy === 'public' ? '—' : '—'}
                            {rustStats && rustStats.privacy === 'public' && !reliableKills && (
                              <span style={{ fontSize: 8, color: '#f59e0b', marginLeft: 4 }}>insufficient data</span>
                            )}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Kills</span>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                            {rustStats && rustStats.privacy === 'public' ? rustStats.kills.toLocaleString('en-US') : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                            Headshot-to-Kill
                            {rustStats && rustStats.privacy === 'public' && kills < 50 && (
                              <span style={{ fontSize: 8, color: '#f59e0b', marginLeft: 4 }}>(est.)</span>
                            )}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                            {rustStats && rustStats.privacy === 'public' ? `${(hsRate * 100).toFixed(1)}%` : '—'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Right Column */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: '#fff' }}>Cheat</span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 'bold',
                            color: analysis.score > 55 ? '#ff6b6b' : analysis.score > 25 ? '#f59e0b' : '#10b981',
                            background: analysis.score > 55 ? 'rgba(239,68,68,0.12)' : analysis.score > 25 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                            border: `1px solid ${analysis.score > 55 ? 'rgba(239,68,68,0.25)' : analysis.score > 25 ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}`,
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontFamily: 'var(--font-mono)'
                          }}>
                            {analysis.score}/100
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>K/D</span>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                            {rustStats && rustStats.privacy === 'public' ? kd.toFixed(2) : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Accuracy</span>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                            {rustStats && rustStats.privacy === 'public' ? `${(accuracy * 100).toFixed(1)}%` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Reasons list */}
              {(() => {
                const analysis = getCheaterRisk(steamProfile, rustStats, result.profile_bans, result.steamid_data);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
                    {analysis.reasons.length > 0 ? (
                      analysis.reasons.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, color: 'var(--color-text-dim)', lineHeight: 1.3 }}>
                          <span style={{ color: 'var(--color-accent)', marginTop: 1 }}>•</span>
                          <span>{r}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#10b981' }}>
                        <CheckCircle2 size={12} />
                        <span>No cheat indicators or anomalies detected.</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* INVENTORY SCAN — public Rust inventory + best-effort Steam Market value */}
          {(invLoading || inventory) && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
                  <Database size={13} /> INVENTORY SCAN
                </span>
                {inventory && !inventory.is_private && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                    ${inventory.total_value.toFixed(2)} estimate
                  </span>
                )}
              </div>

              {invLoading && !inventory ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0', color: 'var(--color-text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <div className="camview-rec-dot" style={{ width: 10, height: 10 }} /> SCANNING INVENTORY &amp; PRICING…
                </div>
              ) : inventory && inventory.is_private ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-dim)', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                  <Shield size={12} /> This player's Steam inventory is private.
                </div>
              ) : inventory && inventory.distinct_items === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--color-text-dim)', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                  No Rust items in this player's public inventory.
                </div>
              ) : inventory ? (
                <>
                  {/* Value summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
                    <div style={{ background: 'rgba(206,66,43,0.08)', border: '1px solid rgba(206,66,43,0.25)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, color: 'var(--color-text-dim)', letterSpacing: 0.4 }}>TOTAL VALUE</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>${inventory.total_value.toFixed(2)}</div>
                    </div>
                    <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, color: 'var(--color-text-dim)', letterSpacing: 0.4 }}>TRADABLE</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>${inventory.tradable_value.toFixed(2)}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, color: 'var(--color-text-dim)', letterSpacing: 0.4 }}>ITEMS</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>{inventory.total_items}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, color: 'var(--color-text-dim)', letterSpacing: 0.4 }}>PRICED</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                        {inventory.priced_count} priced · {inventory.unpriced_count} unpriced
                      </div>
                    </div>
                  </div>

                  {/* Item grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 8 }}>
                    {inventory.items.slice(0, 60).map((it: any, i: number) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 56, background: 'rgba(0,0,0,0.25)', borderRadius: 6, position: 'relative' }}>
                          {it.icon_url ? <img src={it.icon_url} alt="" style={{ maxHeight: 50, maxWidth: '90%', objectFit: 'contain' }} /> : <Database size={20} style={{ color: 'var(--color-text-dim)' }} />}
                          {it.count > 1 && (
                            <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '0 4px', borderRadius: 4 }}>×{it.count}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.name}>{it.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 8.5, color: 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.item_type || 'Item'}</span>
                          {it.price != null ? (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)' }}>${it.price.toFixed(2)}</span>
                          ) : (
                            <span style={{ fontSize: 8.5, color: 'var(--color-text-dim)' }}>—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {inventory.distinct_items > 60 && (
                    <div style={{ fontSize: 9, color: 'var(--color-text-dim)', textAlign: 'center', marginTop: 8 }}>
                      +{inventory.distinct_items - 60} more item types
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* RICH RUST STAT BREAKDOWN — only real keys present in the Steam XML */}
          {rustStats && (() => {
            const all: AllStats = (rustStats.all_stats && typeof rustStats.all_stats === 'object') ? rustStats.all_stats : {};
            const hasAllStats = Object.keys(all).length > 0;

            // No per-stat breakdown available. If the profile is private, show a
            // tasteful note; otherwise stay silent (the combat scorecard above
            // already summarises what is known). Tiles are never invented.
            if (!hasAllStats) {
              if (rustStats.privacy === 'private') {
                return (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 10,
                    color: 'var(--color-text-dim)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    <Shield size={12} style={{ color: 'var(--color-text-dim)' }} />
                    <span>This player's detailed Rust statistics are private.</span>
                  </div>
                );
              }
              return null;
            }

            // Split the headline PVP metrics into prominent "hero" tiles and
            // render every other section as a compact tile grid. A tile only
            // appears when its real value resolves, and a section only appears
            // when it has at least one tile — so nothing is ever fabricated.
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
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 10,
                  color: 'var(--color-text-dim)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <Database size={12} style={{ color: 'var(--color-text-dim)' }} />
                  <span>Detailed Rust statistics are not available for this profile.</span>
                </div>
              );
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Database size={12} style={{ color: 'var(--color-accent)' }} />
                  <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)', letterSpacing: '0.5px' }}>
                    RUST CAREER STATISTICS
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                    (live Steam data)
                  </span>
                </div>

                {/* HERO PVP METRICS — the headline numbers, shown large */}
                {heroTiles.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 10 }}>
                    {heroTiles.map(({ entry, resolved }) => (
                      <div
                        key={entry.label}
                        title={`${entry.label}: ${resolved.value.toLocaleString('en-US')}`}
                        style={{
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.25))',
                          border: '1px solid var(--color-border)',
                          borderTop: '2px solid var(--color-accent)',
                          borderRadius: 8,
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        <span style={{
                          fontSize: 24,
                          fontWeight: 800,
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          lineHeight: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {resolved.text}
                        </span>
                        <span style={{
                          fontSize: 9,
                          color: 'var(--color-text-dim)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {entry.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* COMPACT SECTIONS — everything else, grouped under its title */}
                {compactSections.map(({ section, tiles }) => (
                  <div
                    key={section.title}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ width: 4, height: 12, background: 'var(--color-accent)', borderRadius: 2, display: 'inline-block' }} />
                      <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)', letterSpacing: '0.5px', fontFamily: 'var(--font-mono)' }}>
                        {section.title}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}>
                      {tiles.map(({ entry, resolved }) => (
                        <div
                          key={entry.label}
                          title={`${entry.label}: ${resolved.value.toLocaleString('en-US')}`}
                          style={{
                            background: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 6,
                            padding: '8px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                            minWidth: 0,
                          }}
                        >
                          <span style={{
                            fontSize: 9,
                            color: 'var(--color-text-dim)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {entry.label}
                          </span>
                          <span style={{
                            fontSize: 15,
                            fontWeight: 'bold',
                            color: 'var(--color-accent)',
                            fontFamily: 'var(--font-mono)',
                            lineHeight: 1.1,
                          }}>
                            {resolved.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* DETAIL COORD & XML CODES TABLE */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Database size={12} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)' }}>STEAM SYSTEM IDENTIFIERS</span>
            </div>

            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--color-text-dim)' }}>SteamID64</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    <span>{result.profile.steamid64}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(result.profile.steamid64);
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-dim)',
                        fontSize: 9,
                        padding: '2px 4px',
                        borderRadius: 3,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Copy SteamID64"
                    >
                      <Copy size={10} />
                    </button>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--color-text-dim)' }}>SteamID</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{result.profile.steamid}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--color-text-dim)' }}>Steam3</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{result.profile.steam3}</td>
                </tr>
                {result.profile.inviteurl && (
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '6px 0', color: 'var(--color-text-dim)' }}>Invite Link</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{result.profile.inviteurl}</td>
                  </tr>
                )}
                {result.profile.csgofriend && (
                  <tr>
                    <td style={{ padding: '6px 0', color: 'var(--color-text-dim)' }}>Friend Code</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{result.profile.csgofriend}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* STEAMID.UK DATA & STATISTICS */}
          {result.steamid_data && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <User size={12} style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)' }}>FRIENDS & DATABASE STATS</span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Total Friends</span>
                    <span style={{ fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>{result.steamid_data.friend_count || '0'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Friend History</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{result.steamid_data.friend_history_count || '0'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Names History</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{result.steamid_data.name_history_count || '0'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>VAC Banned Friends</span>
                    <span style={{
                      fontWeight: 'bold',
                      fontFamily: 'var(--font-mono)',
                      color: Number(result.steamid_data.vac_banned_friends) > 0 ? '#ef4444' : 'var(--color-text)'
                    }}>
                      {result.steamid_data.vac_banned_friends || '0'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Game Banned Friends</span>
                    <span style={{
                      fontWeight: 'bold',
                      fontFamily: 'var(--font-mono)',
                      color: Number(result.steamid_data.game_banned_friends) > 0 ? '#ef4444' : 'var(--color-text)'
                    }}>
                      {result.steamid_data.game_banned_friends || '0'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Comm Banned Friends</span>
                    <span style={{
                      fontWeight: 'bold',
                      fontFamily: 'var(--font-mono)',
                      color: Number(result.steamid_data.community_banned_friends) > 0 ? '#ff9100' : 'var(--color-text)'
                    }}>
                      {result.steamid_data.community_banned_friends || '0'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PRIVATE NOTES SECTION */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <FileText size={12} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)' }}>MY PRIVATE PLAYER NOTES</span>
            </div>

            {result.private_notes?.notes && result.private_notes.notes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {result.private_notes.notes.map((n, idx) => (
                  <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 4, fontSize: 11, color: '#ccc', borderLeft: '2px solid var(--color-accent)' }}>
                    {n}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontStyle: 'italic', marginBottom: 10 }}>No notes added for this SteamID yet.</div>
            )}

            <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write a custom note for this player (cheater details, clan, base location...)"
                maxLength={512}
                style={{
                  width: '100%',
                  minHeight: 48,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--color-border)',
                  color: '#fff',
                  fontSize: 11,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              {noteError && <div style={{ color: '#ff6b6b', fontSize: 10 }}>{noteError}</div>}
              <button
                type="submit"
                disabled={submittingNote || !noteText.trim()}
                className="decay-add"
                style={{ alignSelf: 'flex-end', fontSize: 10, padding: '4px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <BookmarkCheck size={12} />
                {submittingNote ? 'Saving...' : 'Add Note'}
              </button>
            </form>
          </div>
          
          <button
            onClick={() => { setResult(null); setSteamProfile(null); }}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              color: '#fff',
              padding: '8px',
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            &larr; BACK TO WATCHLIST
          </button>
        </div>
      )}

      {/* WATCHLIST / BAN TRACKER LIST */}
      {!result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Shield size={12} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)' }}>BAN MONITOR WATCHLIST ({trackedPlayers.length})</span>
          </div>

          {trackedPlayers.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.01)',
              border: '1px dashed var(--color-border)',
              borderRadius: 8,
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--color-text-dim)',
              fontSize: 11
            }}>
              No players tracked for bans yet. Search a player above and click "Track for Bans" to monitor their profile in the background.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {trackedPlayers.map((p) => {
                const hasBans = p.vac === '1' || Number(p.amount_game_bans) > 0 || p.communityban === '1' || p.tradeban === '1';
                return (
                  <div
                    key={p.steamId}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8
                    }}
                  >
                    <div
                      onClick={() => {
                        setInput(p.steamId);
                        handleSearch(p.steamId);
                      }}
                      style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {p.steamId}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: hasBans ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: hasBans ? '#ef4444' : '#10b981',
                        border: hasBans ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {hasBans ? <ShieldAlert size={10} /> : <ShieldCheck size={10} />}
                        {hasBans ? 'BANNED' : 'CLEAN'}
                      </span>
                      <button
                        onClick={() => untrackPlayer(p.steamId)}
                        title="Remove from watchlist"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-dim)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
                      >
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
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <History size={10} style={{ color: 'var(--color-text-muted)' }} />
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Recent Lookups</span>
                </div>
                <button 
                  onClick={clearHistory} 
                  style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 9, cursor: 'pointer', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <Trash2 size={10} />
                  <span>CLEAR HISTORY</span>
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {history.map(({ id, name }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setInput(id);
                      handleSearch(id);
                    }}
                    title={`SteamID: ${id}`}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4,
                      padding: '3px 8px',
                      color: 'var(--color-text-dim)',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-dim)'; }}
                  >
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

