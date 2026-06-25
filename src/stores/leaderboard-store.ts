import { create } from 'zustand';
import type { TeamMember } from './team-store';
import type { RustMonument } from './map-store';
import { useMarkerStore } from './marker-store';
import { isCurrentServer } from '@/utils/server';
import { getMonumentName } from '@/utils/monuments';

/**
 * Team Leaderboard store — ranks teammates by REAL playtime (total online time
 * minus AFK time) accumulated across the current session.
 *
 * Pattern mirrors activity-store.ts: a single `record(...)` action is called
 * once per team poll by the wiring layer. Each call computes the elapsed delta
 * since the previous call and attributes it to the member's current zone, which
 * is derived entirely from REAL data (team-store positions, map-store monuments
 * and marker-store custom 'base' pins). We never invent time for offline
 * members, and time is only accumulated while a member is online.
 *
 * This is in-memory only (NOT persisted) and resets when the session resets.
 */

/** A zone a member can be spending time in on a given tick. */
export type LeaderboardZone = 'base' | 'monument' | 'roaming' | 'afk';

/** Current location classification (adds 'offline' for live display). */
export type CurrentZone = LeaderboardZone | 'offline';

/** Per-member accumulated session totals (all times in milliseconds). */
export interface LeaderboardEntry {
  steamId: string;
  name: string;
  isLeader: boolean;
  /** Total time observed online this session. */
  totalOnlineMs: number;
  /** Time spent AFK (online but not moving for > AFK_MS). */
  afkMs: number;
  /** Active time spent in each zone (sums to realMs). */
  zone: { base: number; monument: number; roaming: number };
  /** Live classification from the most recent record() call. */
  currentZone: CurrentZone;
  /** Name of the nearest monument when currentZone === 'monument'. */
  currentMonument: string | null;
  online: boolean;
  // — internal movement / AFK bookkeeping —
  _lastWorldX: number;
  _lastWorldY: number;
  _lastMovedAt: number;
  /** Timestamp of the last record() call that touched this member. */
  _lastRecordAt: number;
}

/** A badge derived from a member's real-playtime ratios. */
export interface LeaderboardBadge {
  id: string;
  label: string;
  color: string;
  /** Short explanation shown on hover / in expanded view. */
  hint: string;
}

/** A fully-derived, ranked row ready for rendering. */
export interface LeaderboardRow {
  rank: number;
  steamId: string;
  name: string;
  isLeader: boolean;
  online: boolean;
  totalOnlineMs: number;
  afkMs: number;
  /** realMs = totalOnlineMs - afkMs (the value we rank by). */
  realMs: number;
  afkPct: number;            // 0-100
  currentZone: CurrentZone;
  currentMonument: string | null;
  /** Per-zone active time in ms and as a percent of totalOnlineMs. */
  breakdown: {
    base: { ms: number; pct: number };
    monument: { ms: number; pct: number };
    roaming: { ms: number; pct: number };
    afk: { ms: number; pct: number };
  };
  badges: LeaderboardBadge[];
}

interface LeaderboardState {
  entries: Record<string, LeaderboardEntry>;
  sessionStart: number;
  record: (members: TeamMember[], monuments: RustMonument[], mapSize: number, now: number) => void;
  reset: () => void;
}

// — tuning constants —
/** Online but not moving for longer than this counts as AFK (mirrors activity-store). */
const AFK_MS = 5 * 60_000;
/** Movement above this many world units resets the AFK timer. */
const MOVE_THRESHOLD_WORLD = 2;
/** Within this many world units of a monument counts as "at" that monument. */
const MONUMENT_RADIUS_WORLD = 130;
/** Within this normalized distance (fraction of map) of a 'base' pin counts as "at base". */
const BASE_RADIUS_NORM = 0.035;
/** Clamp a single tick's elapsed delta so a long poll gap / sleep can't inflate totals. */
const MAX_TICK_MS = 30_000;
/** Hard cap on tracked members to bound memory (teams are tiny; this is defensive). */
const MAX_ENTRIES = 50;

/**
 * Resolve a member's world position. Prefers raw world coords; falls back to
 * scaling normalized coords by mapSize so AFK/monument logic still works.
 * Returns null when no position data is available at all.
 */
function worldPos(m: TeamMember, mapSize: number): { x: number; y: number } | null {
  if (typeof m.rawX === 'number' && typeof m.rawY === 'number') {
    return { x: m.rawX, y: m.rawY };
  }
  if (typeof m.x === 'number' && typeof m.y === 'number' && mapSize > 0) {
    return { x: m.x * mapSize, y: m.y * mapSize };
  }
  return null;
}

/** Nearest monument within range; returns its display name or null. */
function nearestMonument(m: TeamMember, monuments: RustMonument[]): string | null {
  if (typeof m.rawX !== 'number' || typeof m.rawY !== 'number') return null;
  let bestName: string | null = null;
  let bestDist = MONUMENT_RADIUS_WORLD;
  for (const mon of monuments) {
    const dx = mon.x - m.rawX;
    const dy = mon.y - m.rawY;
    const dist = Math.hypot(dx, dy);
    if (dist <= bestDist) {
      bestDist = dist;
      bestName = getMonumentName(mon.token);
    }
  }
  return bestName;
}

/** True if the member is near any custom 'base' marker on the current server. */
function atBase(m: TeamMember): boolean {
  if (typeof m.x !== 'number' || typeof m.y !== 'number') return false;
  const markers = useMarkerStore.getState().markers;
  for (const mk of markers) {
    if (mk.kind !== 'base') continue;
    if (!isCurrentServer(mk.serverId)) continue;
    const dist = Math.hypot(mk.x - m.x, mk.y - m.y);
    if (dist <= BASE_RADIUS_NORM) return true;
  }
  return false;
}

export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
  entries: {},
  sessionStart: Date.now(),

  record: (members, monuments, mapSize, now) => {
    const prev = get().entries;
    const next: Record<string, LeaderboardEntry> = { ...prev };

    for (const m of members) {
      const id = String(m.id);
      const online = m.status === 'online' || m.status === 'dead';
      const pos = worldPos(m, mapSize);

      let e = next[id];
      if (!e) {
        // First sighting — seed bookkeeping, accumulate nothing this tick.
        e = {
          steamId: id,
          name: m.name,
          isLeader: !!m.isLeader,
          totalOnlineMs: 0,
          afkMs: 0,
          zone: { base: 0, monument: 0, roaming: 0 },
          currentZone: online ? 'roaming' : 'offline',
          currentMonument: null,
          online,
          _lastWorldX: pos ? pos.x : 0,
          _lastWorldY: pos ? pos.y : 0,
          _lastMovedAt: now,
          _lastRecordAt: now,
        };
        next[id] = e;
        continue;
      }

      const updated: LeaderboardEntry = {
        ...e,
        name: m.name,
        isLeader: !!m.isLeader,
        online,
      };

      // Reconnect reset: when a member transitions offline→online this tick,
      // reset their AFK timer and re-seed the movement baseline so they aren't
      // instantly flagged AFK on return.
      if (online && !e.online) {
        updated._lastMovedAt = now;
        if (pos) {
          updated._lastWorldX = pos.x;
          updated._lastWorldY = pos.y;
        }
      }

      // Detect movement to maintain the AFK timer.
      if (pos) {
        const moved =
          Math.abs(pos.x - e._lastWorldX) > MOVE_THRESHOLD_WORLD ||
          Math.abs(pos.y - e._lastWorldY) > MOVE_THRESHOLD_WORLD;
        if (moved) {
          updated._lastMovedAt = now;
          updated._lastWorldX = pos.x;
          updated._lastWorldY = pos.y;
        }
      }

      // Only accumulate time while online. Attribute the elapsed delta to the
      // zone the member was in at the START of the interval (their last known
      // classification), which we recompute fresh below for currentZone.
      if (online && e.online) {
        const delta = Math.min(Math.max(0, now - e._lastRecordAt), MAX_TICK_MS);
        if (delta > 0) {
          updated.totalOnlineMs += delta;
          switch (e.currentZone) {
            case 'afk': updated.afkMs += delta; break;
            case 'base': updated.zone = { ...updated.zone, base: updated.zone.base + delta }; break;
            case 'monument': updated.zone = { ...updated.zone, monument: updated.zone.monument + delta }; break;
            default: updated.zone = { ...updated.zone, roaming: updated.zone.roaming + delta }; break;
          }
        }
      }

      // Recompute the current zone for the next interval.
      if (!online) {
        updated.currentZone = 'offline';
        updated.currentMonument = null;
      } else {
        const afk = now - updated._lastMovedAt > AFK_MS;
        if (afk) {
          updated.currentZone = 'afk';
          updated.currentMonument = null;
        } else if (atBase(m)) {
          updated.currentZone = 'base';
          updated.currentMonument = null;
        } else {
          const mon = nearestMonument(m, monuments);
          if (mon) {
            updated.currentZone = 'monument';
            updated.currentMonument = mon;
          } else {
            updated.currentZone = 'roaming';
            updated.currentMonument = null;
          }
        }
      }

      updated._lastRecordAt = now;
      next[id] = updated;
    }

    // Bound memory: if we somehow exceed the cap, keep the most-online members.
    let entries = next;
    const ids = Object.keys(entries);
    if (ids.length > MAX_ENTRIES) {
      const kept = ids
        .sort((a, b) => entries[b].totalOnlineMs - entries[a].totalOnlineMs)
        .slice(0, MAX_ENTRIES);
      const trimmed: Record<string, LeaderboardEntry> = {};
      for (const id of kept) trimmed[id] = entries[id];
      entries = trimmed;
    }

    set({ entries });
  },

  reset: () => set({ entries: {}, sessionStart: Date.now() }),
}));

// ── Badge thresholds ─────────────────────────────────────────────────────────
// Reasonable, commented thresholds derived purely from real-playtime ratios.
const MIN_MINUTES = 60_000;
const GRINDER_REAL_MS = 120 * MIN_MINUTES;   // 2h+ of active (non-AFK) play
const SHORT_SESSION_MS = 20 * MIN_MINUTES;   // under 20m online total = short stint
const RATED_MIN_MS = 5 * MIN_MINUTES;        // need >=5m online before AFK-ratio badges apply

/**
 * Derive a member's badge set from their real ratios. Multiple badges can
 * apply (e.g. a 3h player with 5% AFK is both Grinder and Dedicated).
 */
function computeBadges(totalMs: number, afkMs: number): LeaderboardBadge[] {
  const badges: LeaderboardBadge[] = [];
  const realMs = Math.max(0, totalMs - afkMs);
  const afkPct = totalMs > 0 ? (afkMs / totalMs) * 100 : 0;

  // Volume badge — lots of genuine active time.
  if (realMs >= GRINDER_REAL_MS) {
    badges.push({ id: 'grinder', label: 'Grinder', color: 'var(--color-accent)', hint: '2h+ of active playtime' });
  }

  // Short-session badge — popped in briefly but stayed active.
  if (totalMs > 0 && totalMs < SHORT_SESSION_MS && afkPct < 30) {
    badges.push({ id: 'weekend-warrior', label: 'Weekend Warrior', color: 'var(--color-info)', hint: 'Short but active session' });
  }

  // AFK-ratio badges only make sense once there's enough sample.
  if (totalMs >= RATED_MIN_MS) {
    if (afkPct >= 80) {
      badges.push({ id: 'afk-lord', label: 'AFK Lord', color: 'var(--color-danger)', hint: 'Mostly AFK (80%+)' });
    } else if (afkPct >= 45) {
      badges.push({ id: 'slacker', label: 'Slacker', color: 'var(--color-warning)', hint: 'High AFK (45-80%)' });
    } else if (afkPct < 10) {
      badges.push({ id: 'dedicated', label: 'Dedicated', color: 'var(--color-success)', hint: 'Barely any AFK (<10%)' });
    } else if (afkPct <= 30) {
      badges.push({ id: 'consistent', label: 'Consistent', color: 'var(--color-info)', hint: 'Steady, low AFK (10-30%)' });
    }
  }

  return badges;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/**
 * Build the ranked leaderboard rows (desc by real playtime). Pass the current
 * timestamp so online members' elapsed time ticks smoothly between record()
 * calls — the live delta is attributed to each member's current zone.
 */
export function getLeaderboardRows(now: number): LeaderboardRow[] {
  const entries = useLeaderboardStore.getState().entries;

  const rows = Object.values(entries).map((e) => {
    // Extrapolate the time since the last record() for smooth live display.
    const liveDelta = e.online ? Math.min(Math.max(0, now - e._lastRecordAt), MAX_TICK_MS) : 0;

    let totalOnlineMs = e.totalOnlineMs;
    let afkMs = e.afkMs;
    const zone = { ...e.zone };
    if (liveDelta > 0) {
      totalOnlineMs += liveDelta;
      switch (e.currentZone) {
        case 'afk': afkMs += liveDelta; break;
        case 'base': zone.base += liveDelta; break;
        case 'monument': zone.monument += liveDelta; break;
        default: zone.roaming += liveDelta; break;
      }
    }

    const realMs = Math.max(0, totalOnlineMs - afkMs);
    const afkPct = pct(afkMs, totalOnlineMs);

    const row: LeaderboardRow = {
      rank: 0, // assigned after sort
      steamId: e.steamId,
      name: e.name,
      isLeader: e.isLeader,
      online: e.online,
      totalOnlineMs,
      afkMs,
      realMs,
      afkPct,
      currentZone: e.currentZone,
      currentMonument: e.currentMonument,
      breakdown: {
        base: { ms: zone.base, pct: pct(zone.base, totalOnlineMs) },
        monument: { ms: zone.monument, pct: pct(zone.monument, totalOnlineMs) },
        roaming: { ms: zone.roaming, pct: pct(zone.roaming, totalOnlineMs) },
        afk: { ms: afkMs, pct: afkPct },
      },
      badges: computeBadges(totalOnlineMs, afkMs),
    };
    return row;
  });

  rows.sort((a, b) => {
    if (b.realMs !== a.realMs) return b.realMs - a.realMs;
    return b.totalOnlineMs - a.totalOnlineMs;
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
