import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useTeamStore } from './team-store';
import { useMapStore } from './map-store';
import { getCurrentServer } from '../utils/server';

/**
 * App-wide user settings (persisted to localStorage).
 *
 * Chat-broadcast toggles push automated messages into the in-game TEAM chat
 * via the Rust+ sendTeamMessage command. The recycler multiplier supports
 * modded (gather-rate) servers.
 */
interface SettingsState {
  // Team-chat broadcast toggles
  broadcastEvents: boolean;       // cargo/heli/chinook spawns → team chat
  broadcastNewShops: boolean;     // new vending machines → team chat
  broadcastDecay: boolean;        // decay timer finished → team chat
  broadcastPriceWatch: boolean;   // price-watch hits → team chat
  broadcastAlarms: boolean;       // smart alarm triggered → team chat
  notifyAlarms: boolean;          // smart alarm triggered → in-app notification
  broadcastDeaths: boolean;       // teammate died → team chat
  notifyDeaths: boolean;          // teammate died → in-app notification
  markTeammateDeaths: boolean;    // place a death marker on the map
  showTeammateDeathsOnMap: boolean; // show teammate deaths on map (off = only your own)
  // Enemy (BattleMetrics) offline transitions
  enemyNotifyChat: boolean;       // enemy went offline → team chat
  enemyNotifyApp: boolean;        // enemy went offline → in-app notification
  enemyNotifyDiscord: boolean;    // enemy went offline → discord webhook
  // Enemy online transitions (offline → online)
  enemyOnlineNotifyChat: boolean;
  enemyOnlineNotifyApp: boolean;
  enemyOnlineNotifyDiscord: boolean;
  // Auto-detect oil rig / large oil rig locked-crate triggers (Chinook drop)
  autoOilRigCrates: boolean;
  /** Default locked-crate unlock time in seconds (vanilla 900 = 15m). */
  defaultCrateSeconds: number;
  // Locked crate unlocked (timer hit 0) notifications
  crateNotifyChat: boolean;       // crate opened → team chat
  crateNotifyApp: boolean;        // crate opened → in-app notification
  crateNotifyDiscord: boolean;    // crate opened → discord webhook

  // Game overlay mode (float over RustClient.exe)
  overlayMode: boolean;           // click-through always-on-top overlay
  overlayHotkey: string;          // global shortcut to show/hide the overlay



  // Cross-server notification filtering
  crossServerAlarms: boolean;     // show smart alarms from other servers

  // Recycler
  recyclerMultiplier: number;     // resource multiplier for modded servers
  recyclerAutoDetect: boolean;    // try to read the multiplier from server name

  // BattleMetrics (Rust Spy enemy tracking)
  battlemetricsToken: string;

  // RustMaps API key (caves / water well + other monuments from seed+size)
  rustmapsKey: string;

  // Raidar Discord bot base URL (for seamless /link from the app)
  discordBotUrl: string;

  // Discord webhook integration
  discordWebhookUrl: string;        // default/fallback webhook endpoint
  discordPingRole: string;          // role id to ping, or 'everyone', or '' for none
  discordAlarms: boolean;           // smart alarm → discord
  discordPriceWatch: boolean;       // price-watch hit → discord
  discordDecay: boolean;            // decay finished → discord
  discordBans: boolean;             // watchlist ban → discord
  discordCargo: boolean;            // cargo ship events → discord
  discordHeli: boolean;             // patrol heli & chinook events → discord
  /** Tool Cupboard started decaying (upkeep ran out) notifications. */
  tcDecayNotifyApp: boolean;
  tcDecayNotifyChat: boolean;
  tcDecayNotifyDiscord: boolean;
  /** Optional per-feature webhook overrides (feature key → URL). */
  discordWebhooks: Record<string, string>;

  // Sounds settings
  soundEnabled: boolean;
  soundVolume: number;
  /** Map marker size multiplier (0.25 = tiny, 1 = default, 2 = large). */
  markerScale: number;
  customSounds: Record<string, string | null>;
  /** Per-event enable flags. Missing key = enabled (default on). */
  soundEvents: Record<string, boolean>;

  // Vending sales rate multiplier
  vendingMultiplier: number;

  setBroadcastEvents: (v: boolean) => void;
  setBroadcastNewShops: (v: boolean) => void;
  setBroadcastDecay: (v: boolean) => void;
  setBroadcastPriceWatch: (v: boolean) => void;
  setBroadcastAlarms: (v: boolean) => void;
  setNotifyAlarms: (v: boolean) => void;
  setBroadcastDeaths: (v: boolean) => void;
  setNotifyDeaths: (v: boolean) => void;
  setMarkTeammateDeaths: (v: boolean) => void;
  setShowTeammateDeathsOnMap: (v: boolean) => void;
  setEnemyNotifyChat: (v: boolean) => void;
  setEnemyNotifyApp: (v: boolean) => void;
  setEnemyNotifyDiscord: (v: boolean) => void;
  setEnemyOnlineNotifyChat: (v: boolean) => void;
  setEnemyOnlineNotifyApp: (v: boolean) => void;
  setEnemyOnlineNotifyDiscord: (v: boolean) => void;
  setAutoOilRigCrates: (v: boolean) => void;
  setDefaultCrateSeconds: (v: number) => void;
  setCrateNotifyChat: (v: boolean) => void;
  setCrateNotifyApp: (v: boolean) => void;
  setCrateNotifyDiscord: (v: boolean) => void;
  setOverlayMode: (v: boolean) => void;
  setOverlayHotkey: (v: string) => void;

  setCrossServerAlarms: (v: boolean) => void;
  setRecyclerMultiplier: (v: number) => void;
  setRecyclerAutoDetect: (v: boolean) => void;
  setBattlemetricsToken: (v: string) => void;
  setRustmapsKey: (v: string) => void;
  setDiscordBotUrl: (v: string) => void;
  setDiscordWebhookUrl: (v: string) => void;
  setDiscordPingRole: (v: string) => void;
  setDiscordAlarms: (v: boolean) => void;
  setDiscordPriceWatch: (v: boolean) => void;
  setDiscordDecay: (v: boolean) => void;
  setDiscordBans: (v: boolean) => void;
  setDiscordCargo: (v: boolean) => void;
  setDiscordHeli: (v: boolean) => void;
  setTcDecayNotifyApp: (v: boolean) => void;
  setTcDecayNotifyChat: (v: boolean) => void;
  setTcDecayNotifyDiscord: (v: boolean) => void;
  setDiscordWebhookFor: (feature: string, url: string) => void;

  setSoundEnabled: (v: boolean) => void;
  setSoundVolume: (v: number) => void;
  setMarkerScale: (v: number) => void;
  setCustomSound: (action: string, base64: string | null) => void;
  setSoundEvent: (action: string, enabled: boolean) => void;
  setVendingMultiplier: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      broadcastEvents: true,
      broadcastNewShops: false,
      broadcastDecay: true,
      broadcastPriceWatch: true,
      broadcastAlarms: true,
      notifyAlarms: true,
      broadcastDeaths: true,
      notifyDeaths: true,
      markTeammateDeaths: true,
      showTeammateDeathsOnMap: true,
      enemyNotifyChat: true,
      enemyNotifyApp: true,
      enemyNotifyDiscord: false,
      enemyOnlineNotifyChat: true,
      enemyOnlineNotifyApp: true,
      enemyOnlineNotifyDiscord: false,
      autoOilRigCrates: true,
      defaultCrateSeconds: 900,
      crateNotifyChat: true,
      crateNotifyApp: true,
      crateNotifyDiscord: false,

      overlayMode: false,
      overlayHotkey: 'F8',

      crossServerAlarms: true,
      recyclerMultiplier: 1,
      recyclerAutoDetect: true,
      battlemetricsToken: '',
      rustmapsKey: '',
      discordBotUrl: '',

      discordWebhookUrl: '',
      discordPingRole: '',
      discordAlarms: true,
      discordPriceWatch: false,
      discordDecay: false,
      discordBans: true,
      discordCargo: true,
      discordHeli: true,
      tcDecayNotifyApp: true,
      tcDecayNotifyChat: true,
      tcDecayNotifyDiscord: false,
      discordWebhooks: {},

      soundEnabled: false,
      soundVolume: 0.5,
      markerScale: 1,
      customSounds: {},
      // Per-event opt-outs (all remaining events default on once sound is enabled).
      soundEvents: {},
      vendingMultiplier: 1,

      setBroadcastEvents: (v) => set({ broadcastEvents: v }),
      setBroadcastNewShops: (v) => set({ broadcastNewShops: v }),
      setBroadcastDecay: (v) => set({ broadcastDecay: v }),
      setBroadcastPriceWatch: (v) => set({ broadcastPriceWatch: v }),
      setBroadcastAlarms: (v) => set({ broadcastAlarms: v }),
      setNotifyAlarms: (v) => set({ notifyAlarms: v }),
      setBroadcastDeaths: (v) => set({ broadcastDeaths: v }),
      setNotifyDeaths: (v) => set({ notifyDeaths: v }),
      setMarkTeammateDeaths: (v) => set({ markTeammateDeaths: v }),
      setShowTeammateDeathsOnMap: (v) => set({ showTeammateDeathsOnMap: v }),
      setEnemyNotifyChat: (v) => set({ enemyNotifyChat: v }),
      setEnemyNotifyApp: (v) => set({ enemyNotifyApp: v }),
      setEnemyNotifyDiscord: (v) => set({ enemyNotifyDiscord: v }),
      setEnemyOnlineNotifyChat: (v) => set({ enemyOnlineNotifyChat: v }),
      setEnemyOnlineNotifyApp: (v) => set({ enemyOnlineNotifyApp: v }),
      setEnemyOnlineNotifyDiscord: (v) => set({ enemyOnlineNotifyDiscord: v }),
      setAutoOilRigCrates: (v) => set({ autoOilRigCrates: v }),
      setDefaultCrateSeconds: (v) => set({ defaultCrateSeconds: Math.max(30, Math.min(3600, Math.round(v))) }),
      setCrateNotifyChat: (v) => set({ crateNotifyChat: v }),
      setCrateNotifyApp: (v) => set({ crateNotifyApp: v }),
      setCrateNotifyDiscord: (v) => set({ crateNotifyDiscord: v }),
      setOverlayMode: (v) => set({ overlayMode: v }),
      setOverlayHotkey: (v) => set({ overlayHotkey: v }),

      setCrossServerAlarms: (v) => set({ crossServerAlarms: v }),
      setRecyclerMultiplier: (v) => set({ recyclerMultiplier: Math.max(1, v) }),
      setRecyclerAutoDetect: (v) => set({ recyclerAutoDetect: v }),
      setBattlemetricsToken: (v) => set({ battlemetricsToken: v }),
      setRustmapsKey: (v) => set({ rustmapsKey: v }),
      setDiscordBotUrl: (v) => set({ discordBotUrl: v }),
      setDiscordWebhookUrl: (v) => set({ discordWebhookUrl: v }),
      setDiscordPingRole: (v) => set({ discordPingRole: v }),
      setDiscordAlarms: (v) => set({ discordAlarms: v }),
      setDiscordPriceWatch: (v) => set({ discordPriceWatch: v }),
      setDiscordDecay: (v) => set({ discordDecay: v }),
      setDiscordBans: (v) => set({ discordBans: v }),
      setDiscordCargo: (v) => set({ discordCargo: v }),
      setDiscordHeli: (v) => set({ discordHeli: v }),
      setTcDecayNotifyApp: (v) => set({ tcDecayNotifyApp: v }),
      setTcDecayNotifyChat: (v) => set({ tcDecayNotifyChat: v }),
      setTcDecayNotifyDiscord: (v) => set({ tcDecayNotifyDiscord: v }),
      setDiscordWebhookFor: (feature, url) => set((s) => ({
        discordWebhooks: { ...s.discordWebhooks, [feature]: url },
      })),

      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setSoundVolume: (v) => set({ soundVolume: v }),
      setMarkerScale: (v) => set({ markerScale: v }),
      setCustomSound: (action, base64) => set((s) => ({
        customSounds: { ...s.customSounds, [action]: base64 },
      })),
      setSoundEvent: (action, enabled) => set((s) => ({
        soundEvents: { ...s.soundEvents, [action]: enabled },
      })),
      setVendingMultiplier: (v) => set({ vendingMultiplier: Math.max(1, v) }),
    }),
    { name: 'raidar.settings' },
  ),
);

/**
 * Heuristically detect a gather-rate multiplier from a server name
 * (e.g. "Rustopia 2x", "5X Weekly", "x3 Vanilla+"). Returns 1 if none found.
 */
export function detectMultiplierFromName(name?: string): number {
  if (!name) return 1;
  const m = name.match(/(?:^|[^a-z0-9])(\d{1,3})\s*[xX]|[xX]\s*(\d{1,3})(?:[^a-z0-9]|$)/);
  const raw = m ? (m[1] || m[2]) : null;
  const val = raw ? parseInt(raw, 10) : 1;
  if (!val || val < 1 || val > 1000) return 1;
  return val;
}

/**
 * Returns true if the player appears to be in a team. This is only a hint —
 * the authoritative check is the server's response to send_team_message.
 */
export function isInTeam(): boolean {
  try {
    const members = useTeamStore.getState().members;
    return Array.isArray(members) && members.length >= 1;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget broadcast to the in-game team chat.
 *
 * We always ATTEMPT the send and let the server decide — a 1/1 team where you
 * are the leader is a valid team and chat works there, so we must not
 * pre-filter by member count. Only when the server explicitly rejects the
 * message (you're genuinely not in a team) do we fall back to an in-app toast.
 * Returns true if it was accepted by the server.
 */
export async function broadcastToTeam(text: string): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('send_team_message', { message: text });
    return true;
  } catch (e) {
    // Server rejected it (not in a team / solo) — surface in-app instead.
    const msg = String(e).toLowerCase();
    const notInTeam = msg.includes('team') || msg.includes('not sent') || msg.includes('not_found');
    if (notInTeam) {
      try {
        useMapStore.getState().addToast('TEAM ALERT', text, 'info');
      } catch { /* ignore */ }
    } else {
      console.error('broadcastToTeam failed:', e);
    }
    return false;
  }
}

/**
 * Send a message to the configured Discord webhook. Optionally prefixes a role
 * ping. `discordPingRole` can be:
 *   - 'everyone'        → @everyone
 *   - a numeric role id → <@&id>
 *   - empty             → no ping
 * No-op if no webhook URL is configured. Fire-and-forget.
 *
 * Supports rich embed fields via the optional `fields` parameter.
 * The server name is automatically injected as the first field.
 */
const FEATURE_COLORS: Record<string, number> = {
  cargo: 439956,          // cyan (#06b6d4)
  crates: 16096779,       // orange (#f59e0b)
  crate: 16096779,        // orange (#f59e0b)
  crash: 15680580,        // red (#ef4444)
  heli_chinook: 15680580,  // red (#ef4444)
  alarms: 15680580,       // red (#ef4444)
  price_watch: 1096065,   // green (#10B981)
  decay: 11817737,        // brown/orange (#b45309)
  enemy: 9133302,         // purple (#8b5cf6)
  spy: 9133302,           // purple (#8b5cf6)
  event: 439956,          // cyan
  bans: 15680580,         // red (#ef4444)
  raid: 1096065,          // green (#10B981)
};

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

/**
 * Per-feature embed presentation: an author label, an emoji accent, and a
 * thumbnail icon (rusthelp CDN) that gives each alert a distinct, modern look.
 */
const FEATURE_STYLE: Record<string, { author: string; emoji: string; thumb?: string }> = {
  cargo:        { author: 'Cargo Ship',       emoji: '🚢' },
  crates:       { author: 'Locked Crate',     emoji: '📦', thumb: 'https://cdn.rusthelp.com/images/256/locked-crate.webp' },
  crate:        { author: 'Locked Crate',     emoji: '📦', thumb: 'https://cdn.rusthelp.com/images/256/locked-crate.webp' },
  crash:        { author: 'Heli Down',        emoji: '💥', thumb: 'https://cdn.rusthelp.com/images/256/heli-crate.webp' },
  heli_chinook: { author: 'Air Event',        emoji: '🚁', thumb: 'https://cdn.rusthelp.com/images/256/heli-crate.webp' },
  alarms:       { author: 'Base Alarm',       emoji: '🚨', thumb: 'https://cdn.rusthelp.com/images/256/smart-alarm.webp' },
  price_watch:  { author: 'Price Watch',      emoji: '💰', thumb: 'https://cdn.rusthelp.com/images/256/scrap.webp' },
  decay:        { author: 'Decay Warning',    emoji: '🧱', thumb: 'https://cdn.rusthelp.com/images/256/cupboard-tool.webp' },
  enemy:        { author: 'Enemy Intel',      emoji: '🎯' },
  spy:          { author: 'Rust Spy',         emoji: '🕵️' },
  event:        { author: 'World Event',      emoji: '🌍' },
  bans:         { author: 'Ban Tracker',      emoji: '🚷' },
  raid:         { author: 'Raid Intel',       emoji: '🧨', thumb: 'https://cdn.rusthelp.com/images/256/explosive-timed.webp' },
};

export async function sendDiscordWebhook(content: string, feature?: string, fields?: DiscordField[], webhookEnabled: boolean = true): Promise<boolean> {
  // Always relay to the Raidar bot (it routes to the right channel for any
  // linked Discord servers), regardless of the legacy raw-webhook toggle.
  // Fire-and-forget; no-op if not linked.
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    invoke('notify_discord_bot', { feature: feature || 'event', content, fields: fields || null }).catch(() => {});
  } catch { /* ignore */ }

  if (!webhookEnabled) return false;

  const { discordWebhookUrl, discordPingRole, discordWebhooks } = useSettingsStore.getState();
  const url = ((feature && discordWebhooks[feature]) || discordWebhookUrl).trim();
  if (!url) return false;

  let prefix = '';
  const role = discordPingRole.trim();
  if (role.toLowerCase() === 'everyone' || role === '@everyone') {
    prefix = '@everyone';
  } else if (/^\d{5,}$/.test(role)) {
    prefix = `<@&${role}>`;
  } else if (role.startsWith('<@&') && role.endsWith('>')) {
    prefix = role;
  }

  let embedTitle = 'Live Alert';
  let embedDesc = content;
  let color = 1096065;

  if (feature && FEATURE_COLORS[feature] !== undefined) {
    color = FEATURE_COLORS[feature];
  }

  // Parse pattern: "emoji **Title** — Description"
  const match = content.match(/^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF])?\s*\*\*(.*?)\*\*\s*—\s*(.*)$/s);
  if (match) {
    const emoji = match[1] ? match[1].trim() : '';
    const titleText = match[2].trim();
    const descText = match[3].trim();
    embedTitle = emoji ? `${emoji} ${titleText}` : titleText;
    embedDesc = descText;
  }

  const style = feature ? FEATURE_STYLE[feature] : undefined;
  const server = getCurrentServer();

  // Modern embed layout:
  //  • author bar with feature label (acts as a colored "kicker")
  //  • bold title + description as a markdown quote block for emphasis
  //  • server/grid/etc. as inline fields with a divider
  //  • feature thumbnail icon on the right
  //  • timestamped footer with branding
  const embedFields: DiscordField[] = [];
  if (server?.name) {
    embedFields.push({ name: '🌐 Server', value: server.name, inline: true });
  }
  if (fields) embedFields.push(...fields);

  const niceDesc = embedDesc ? `>>> ${embedDesc}` : undefined;

  const embed: any = {
    author: { name: style?.author || 'Raidar Alert' },
    title: embedTitle,
    description: niceDesc,
    color,
    fields: embedFields.length > 0 ? embedFields : undefined,
    timestamp: new Date().toISOString(),
    footer: { text: 'Raidar · Tactical Intelligence' },
  };
  if (style?.thumb) embed.thumbnail = { url: style.thumb };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: prefix || undefined,
        username: 'Raidar',
        embeds: [embed],
        allowed_mentions: { parse: ['everyone', 'roles'] },
      }),
    });
    return true;
  } catch (e) {
    console.error('sendDiscordWebhook failed:', e);
    return false;
  }
}
