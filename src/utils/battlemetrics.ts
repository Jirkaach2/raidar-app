import { invoke } from '@tauri-apps/api/core';

const BASE = 'https://api.battlemetrics.com';

export interface BmPlayer {
  id: string;
  name: string;
  online?: boolean;
  lastSeen?: string;
  /** True if confirmed to have session history on the connected server. */
  onServer?: boolean;
  /** Epoch ms last seen ON the connected server (0 = unknown/never). */
  lastSeenOnServer?: number;
}

export interface BmSession {
  start: string;      // ISO
  stop: string | null; // ISO or null if still online
  serverName?: string;
  serverId?: string;
}

function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Search players by name. */
export async function searchPlayers(token: string, query: string): Promise<BmPlayer[]> {
  const url = `${BASE}/players?filter[search]=${encodeURIComponent(query)}&page[size]=20`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`BattleMetrics ${res.status}`);
  const json = await res.json();
  return (json.data || []).map((d: any) => ({
    id: d.id,
    name: d.attributes?.name ?? 'Unknown',
    online: !!d.attributes?.online,
    lastSeen: d.attributes?.lastSeen,
  }));
}

/**
 * Search players by name, but only return those who have played the given
 * BattleMetrics server within the last `withinDays` (default 31). This filters
 * out the pile of unrelated same-name accounts BattleMetrics returns.
 * If serverId is null (couldn't resolve the server), falls back to plain search.
 */
export async function searchPlayersOnServer(
  token: string,
  query: string,
  serverId: string | null,
  _withinDays = 31,
): Promise<BmPlayer[]> {
  // Primary: ask BattleMetrics for players matching the name ON this server.
  // These are flagged onServer:true and sorted to the top so a generic name
  // (e.g. "dave") surfaces the player who actually plays here first.
  const onServer: BmPlayer[] = [];
  const onServerIds = new Set<string>();
  if (serverId) {
    try {
      // include=server is needed for BattleMetrics to attach the per-player
      // server relationship meta (online / lastSeen) for the filtered server.
      const url = `${BASE}/players?filter[search]=${encodeURIComponent(query)}`
        + `&filter[servers]=${encodeURIComponent(serverId)}`
        + `&include=server&fields[server]=name&page[size]=25`;
      const res = await fetch(url, { headers: authHeaders(token) });
      if (res.ok) {
        const json = await res.json();
        for (const d of json.data || []) {
          // Per-server last-seen lives in the player's server relationship meta.
          // NOTE: meta.online here is the GLOBAL online flag — not reliable for
          // "on this server", so we resolve real online state separately.
          const srvRels = d.relationships?.servers?.data || [];
          const rel = srvRels.find((r: any) => r.id === serverId) || srvRels[0];
          const meta = rel?.meta || {};
          const lastSeenStr: string | undefined = meta.lastSeen || d.attributes?.lastSeen;
          onServer.push({
            id: d.id,
            name: d.attributes?.name ?? 'Unknown',
            online: false,
            lastSeen: lastSeenStr,
            lastSeenOnServer: lastSeenStr ? new Date(lastSeenStr).getTime() : 0,
            onServer: true,
          });
          onServerIds.add(d.id);
        }
      }
    } catch { /* fall through */ }
  }
  // Also run a plain name search so the user can still find someone whose
  // server name didn't resolve — but mark them onServer:false and list them
  // AFTER the verified on-server matches.
  let global: BmPlayer[] = [];
  try {
    global = (await searchPlayers(token, query)).filter((p) => !onServerIds.has(p.id));
  } catch { /* ignore */ }
  return [...onServer, ...global];
}

/**
 * Resolve accurate "online on THIS server" for search results. Uses the SAME
 * reliable method as tracking — a player with an open (no-stop) session on this
 * server is online now — rather than the server roster include, which BM doesn't
 * always populate. Capped + parallel to stay fast.
 */
export async function enrichServerPresence(
  token: string, players: BmPlayer[], serverId: string | null, max = 12,
): Promise<BmPlayer[]> {
  const targets = players.filter((p) => p.onServer).slice(0, max);
  await Promise.all(targets.map(async (p) => {
    try {
      const pres = await getServerPresence(token, p.id, serverId);
      // Match the added-players tab exactly: a player with ANY open session is
      // shown online (the tab uses sessionsToBuckets which does the same).
      p.online = pres.online || pres.online_anywhere;
      if (pres.lastSeenOnServer) p.lastSeenOnServer = pres.lastSeenOnServer;
    } catch { /* leave as-is */ }
  }));
  // Re-sort: online first, then most-recently-seen on the server.
  return [...players].sort((a, b) => {
    if (!!b.onServer !== !!a.onServer) return (b.onServer ? 1 : 0) - (a.onServer ? 1 : 0);
    if (!!b.online !== !!a.online) return (b.online ? 1 : 0) - (a.online ? 1 : 0);
    return (b.lastSeenOnServer || 0) - (a.lastSeenOnServer || 0);
  });
}

/**
 * Find a BattleMetrics player by their Steam ID (steamID64).
 *
 * NOTE: BattleMetrics only allows SteamID/identifier lookups for server owners
 * (a token tied to a server they RCON-manage). For everyone else this returns
 * nothing, so the SteamID search has been removed from the UI — search by name.
 */
export async function findPlayerBySteamId(token: string, steamId: string): Promise<BmPlayer | null> {
  const sid = steamId.trim();
  if (!/^\d{17}$/.test(sid)) {
    throw new Error('Enter a valid 17-digit SteamID64.');
  }

  // Approach 1: player search with the SteamID wrapped in quotes (BattleMetrics'
  // recommended exact-match syntax). Only works for server-owner tokens.
  for (const term of [`"${sid}"`, sid]) {
    try {
      const url = `${BASE}/players?filter[search]=${encodeURIComponent(term)}&page[size]=10`;
      const res = await fetch(url, { headers: authHeaders(token) });
      if (res.ok) {
        const json = await res.json();
        const data = json.data || [];
        if (data.length > 0) {
          return { id: data[0].id, name: data[0].attributes?.name ?? 'Unknown' };
        }
      }
    } catch { /* try next */ }
  }

  // Approach 2: identifier match endpoint (needs Global Player Matching opt-in).
  try {
    const res = await fetch(`${BASE}/players/match?include=player`, {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            type: 'identifier',
            attributes: { type: 'steamID', identifier: sid },
          },
        ],
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const fromIncluded = (json.included || []).find((i: any) => i.type === 'player');
      if (fromIncluded) {
        return { id: fromIncluded.id, name: fromIncluded.attributes?.name ?? 'Unknown' };
      }
      const rel = (json.data || [])[0]?.relationships?.player?.data;
      if (rel?.id) {
        const pres = await fetch(`${BASE}/players/${rel.id}`, { headers: authHeaders(token) });
        if (pres.ok) {
          const pj = await pres.json();
          return { id: rel.id, name: pj.data?.attributes?.name ?? `Player ${rel.id}` };
        }
        return { id: rel.id, name: `Player ${rel.id}` };
      }
    }
  } catch { /* ignore */ }

  // Approach 3: Steam ID username lookup fallback.
  try {
    const info = await invoke<{ name: string }>('get_steam_profile_info', { steamId: sid });
    if (info && info.name && info.name !== 'Unknown') {
      const players = await searchPlayers(token, info.name);
      if (players.length > 0) {
        // Look for exact match first, else return first
        const exact = players.find(p => p.name.toLowerCase() === info.name.toLowerCase());
        return exact || players[0];
      }
    }
  } catch (err) {
    console.error('Steam ID lookup fallback failed:', err);
  }

  return null;
}

/** Get a player's recent sessions (online windows). */
export async function getPlayerSessions(token: string, playerId: string): Promise<BmSession[]> {
  const url = `${BASE}/players/${playerId}/relationships/sessions?page[size]=100`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`BattleMetrics ${res.status}`);
  const json = await res.json();
  const servers: Record<string, string> = {};
  (json.included || []).forEach((inc: any) => {
    if (inc.type === 'server') servers[inc.id] = inc.attributes?.name;
  });
  return (json.data || []).map((d: any) => ({
    start: d.attributes?.start,
    stop: d.attributes?.stop ?? null,
    serverName: servers[d.relationships?.server?.data?.id] || undefined,
    serverId: d.relationships?.server?.data?.id,
  }));
}

/**
 * Re-check a tracked player's current online state from their latest sessions.
 * A session with no stop time means they're online right now.
 */
export async function getPlayerOnlineState(token: string, playerId: string): Promise<{ online: boolean; lastSeen: number }> {
  const sessions = await getPlayerSessions(token, playerId);
  let online = false;
  let lastSeen = 0;
  for (const s of sessions) {
    const stop = s.stop ? new Date(s.stop).getTime() : Date.now();
    if (s.stop === null) online = true;
    lastSeen = Math.max(lastSeen, stop);
  }
  return { online, lastSeen };
}

/**
 * Per-server presence for a player: are they online ON this server right now,
 * and when were they last seen ON this server (epoch ms, 0 if never).
 * Derived from session history (accurate, unlike the search `online` attr).
 */
export async function getServerPresence(
  token: string, playerId: string, serverId: string | null,
): Promise<{ online: boolean; lastSeenOnServer: number; online_anywhere: boolean }> {
  const sessions = await getPlayerSessions(token, playerId);
  let online = false;
  let onlineAnywhere = false;
  let lastSeenOnServer = 0;
  for (const s of sessions) {
    const stop = s.stop ? new Date(s.stop).getTime() : Date.now();
    if (s.stop === null) onlineAnywhere = true;
    if (serverId && s.serverId === serverId) {
      if (s.stop === null) online = true;
      lastSeenOnServer = Math.max(lastSeenOnServer, stop);
    } else if (!serverId) {
      lastSeenOnServer = Math.max(lastSeenOnServer, stop);
    }
  }
  return { online, lastSeenOnServer, online_anywhere: onlineAnywhere };
}

export async function findServerIdByName(token: string, name: string): Promise<string | null> {
  if (!name) return null;
  const url = `${BASE}/servers?filter[search]=${encodeURIComponent(name)}&filter[game]=rust&page[size]=5`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) return null;
  const json = await res.json();
  const first = (json.data || [])[0];
  return first?.id ?? null;
}

/**
 * True if the player has played on the given server id (checks session history).
 */
export async function playerHasServerHistory(token: string, playerId: string, serverId: string): Promise<boolean> {
  if (!serverId) return true; // can't verify — allow
  const sessions = await getPlayerSessions(token, playerId);
  return sessions.some((s) => s.serverId === serverId);
}

/**
 * Convert sessions into a 7×24 weekly activity heatmap (minutes per hour bucket)
 * plus online state — same shape the Spy store uses, so enemy + team data merge.
 */
export function sessionsToBuckets(sessions: BmSession[]): {
  buckets: number[][]; online: boolean; lastSeen: number;
} {
  const buckets = Array.from({ length: 7 }, () => Array(24).fill(0));
  let online = false;
  let lastSeen = 0;

  for (const s of sessions) {
    const start = new Date(s.start).getTime();
    const stop = s.stop ? new Date(s.stop).getTime() : Date.now();
    if (s.stop === null) online = true;
    lastSeen = Math.max(lastSeen, stop);

    // Walk the session hour-by-hour, adding minutes to the matching bucket.
    let cur = start;
    while (cur < stop) {
      const d = new Date(cur);
      const day = d.getDay();
      const hour = d.getHours();
      const hourEnd = new Date(d).setMinutes(60, 0, 0);
      const segEnd = Math.min(stop, hourEnd);
      const mins = (segEnd - cur) / 60_000;
      buckets[day][hour] = Math.min(60, buckets[day][hour] + mins);
      cur = segEnd;
    }
  }
  return { buckets, online, lastSeen };
}

/**
 * Build a "profile review" for a player: their tracked servers with playtime +
 * rank, and recent session summary. Servers are sorted by time played (desc).
 */
export interface BmServerPlay {
  serverId: string;
  serverName: string;
  timePlayedSeconds?: number;
  lastSeen?: string;
  rank?: number;
}

export async function getPlayerProfile(token: string, playerId: string): Promise<{
  name: string;
  servers: BmServerPlay[];
  sessions: BmSession[];
}> {
  // We include both 'server' and 'servers' to guarantee retrieval on all BM accounts/token permissions
  const url = `${BASE}/players/${playerId}?include=server`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`BattleMetrics ${res.status}`);
  const json = await res.json();
  const name = json.data?.attributes?.name ?? 'Unknown';

  const serverRelations = json.data?.relationships?.servers?.data || [];
  const includedServers = (json.included || []).filter((inc: any) => inc.type === 'server');
  const serverMap = new Map<string, any>(includedServers.map((inc: any) => [inc.id, inc]));

  const servers: BmServerPlay[] = serverRelations
    .map((rel: any) => {
      const inc = serverMap.get(rel.id);
      const meta = rel.meta || {};
      return {
        serverId: rel.id,
        serverName: inc?.attributes?.name || `Server ${rel.id}`,
        timePlayedSeconds: meta.timePlayed,
        lastSeen: meta.lastSeen,
        rank: meta.rank,
      };
    })
    .sort((a: BmServerPlay, b: BmServerPlay) => (b.timePlayedSeconds || 0) - (a.timePlayedSeconds || 0));

  let sessions: BmSession[] = [];
  try { sessions = await getPlayerSessions(token, playerId); } catch { /* ignore */ }

  return { name, servers, sessions };
}


/**
 * Try to resolve a server's name by its IP address using BattleMetrics public search.
 * Scans the results to find the first game with type 'rust' matching the IP exactly.
 */
export async function resolveServerName(ip: string): Promise<string | null> {
  const cleanIp = ip.trim();
  if (!cleanIp) return null;
  try {
    const url = `${BASE}/servers?filter[search]=${encodeURIComponent(cleanIp)}&filter[game]=rust&page[size]=10`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const match = (json.data || []).find((s: any) => s.attributes?.ip === cleanIp);
    return match?.attributes?.name ?? null;
  } catch (e) {
    console.error(`Failed to resolve server name for IP ${ip}:`, e);
    return null;
  }
}

