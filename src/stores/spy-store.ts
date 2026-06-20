import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Spy store — records online/offline activity windows for tracked players so
 * we can build a sleep/activity schedule ("read their schedule").
 *
 * SOURCE & SCOPE: the Rust+ API only reports the connected player's OWN TEAM
 * members' online state. We therefore track teammates' activity over time to
 * surface their play/sleep windows. True cross-server enemy tracking would
 * require a server plugin or the BattleMetrics API and is not available from
 * Rust+ alone — so this powers a per-player activity schedule for everyone the
 * API exposes.
 *
 * Data model: per player, 7 days × 24 hours of "active minutes" buckets. Each
 * poll that sees a player online adds to the current hour bucket, building a
 * weekly heatmap and a most-likely "raid window" (their longest offline span).
 */

export interface PlayerActivity {
  steamId: string;
  name: string;
  /** buckets[day 0-6][hour 0-23] = minutes seen online that hour (capped 60). */
  buckets: number[][];
  online: boolean;
  lastOnlineAt: number;
  lastOfflineAt: number;
  totalSeenMs: number;
  firstTrackedAt: number;
}

interface SpyState {
  players: Record<string, PlayerActivity>;
  /** BattleMetrics-tracked enemy players (merged into the same view). */
  tracked: Record<string, PlayerActivity & { source: 'bm'; bmId: string }>;
  /** Named enemy groups (clans / squads). Maps groupId → group. */
  groups: Record<string, EnemyGroup>;
  /** Membership: tracked steamId (e.g. "bm-123") → groupId. */
  groupOf: Record<string, string>;
  lastSampleAt: number;
  recordSample: (members: { steam_id: any; name: string; is_online: boolean }[]) => void;
  setTracked: (bmId: string, name: string, buckets: number[][], online: boolean, lastSeen: number) => void;
  updateTrackedStatus: (bmId: string, online: boolean, lastSeen: number) => 'online' | 'offline' | null;
  removeTracked: (bmId: string) => void;
  addGroup: (name: string, color?: string) => string;
  renameGroup: (groupId: string, name: string) => void;
  removeGroup: (groupId: string) => void;
  assignToGroup: (steamId: string, groupId: string | null) => void;
  clear: () => void;
  clearTeam: () => void;
}

export interface EnemyGroup {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

const GROUP_COLORS = ['#ef4444', '#f59e0b', '#a855f7', '#06b6d4', '#10b981', '#ec4899', '#eab308'];

function emptyBuckets(): number[][] {
  return Array.from({ length: 7 }, () => Array(24).fill(0));
}

export const useSpyStore = create<SpyState>()(
  persist(
    (set, get) => ({
      players: {},
      tracked: {},
      groups: {},
      groupOf: {},
      lastSampleAt: 0,

      recordSample: (members) => {
        const now = Date.now();
        const last = get().lastSampleAt || now;
        const elapsedMin = Math.min(10, (now - last) / 60_000); // cap to avoid gaps
        const d = new Date(now);
        const day = d.getDay();
        const hour = d.getHours();

        const players = { ...get().players };
        for (const m of members) {
          const id = String(m.steam_id);
          let p = players[id];
          if (!p) {
            p = {
              steamId: id, name: m.name, buckets: emptyBuckets(),
              online: m.is_online, lastOnlineAt: m.is_online ? now : 0,
              lastOfflineAt: m.is_online ? 0 : now, totalSeenMs: 0, firstTrackedAt: now,
            };
          }
          const next: PlayerActivity = { ...p, name: m.name };
          if (m.is_online) {
            // Add elapsed minutes to current hour bucket (cap 60).
            const buckets = next.buckets.map((r) => r.slice());
            buckets[day][hour] = Math.min(60, buckets[day][hour] + elapsedMin);
            next.buckets = buckets;
            next.totalSeenMs += elapsedMin * 60_000;
            if (!p.online) next.lastOnlineAt = now;
            next.online = true;
          } else {
            if (p.online) next.lastOfflineAt = now;
            next.online = false;
          }
          players[id] = next;
        }
        set({ players, lastSampleAt: now });
      },

      clear: () => set({ players: {}, lastSampleAt: 0 }),

      clearTeam: () => set({ players: {}, lastSampleAt: 0 }),

      setTracked: (bmId, name, buckets, online, lastSeen) => set((s) => ({
        tracked: {
          ...s.tracked,
          [bmId]: {
            source: 'bm', bmId, steamId: `bm-${bmId}`, name, buckets,
            online, lastOnlineAt: online ? Date.now() : 0, lastOfflineAt: lastSeen,
            totalSeenMs: buckets.flat().reduce((a, b) => a + b, 0) * 60_000,
            firstTrackedAt: Date.now(),
          },
        },
      })),

      removeTracked: (bmId) => set((s) => {
        const next = { ...s.tracked };
        delete next[bmId];
        const groupOf = { ...s.groupOf };
        delete groupOf[`bm-${bmId}`];
        return { tracked: next, groupOf };
      }),

      addGroup: (name, color) => {
        const id = `g-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const existing = Object.keys(get().groups).length;
        set((s) => ({
          groups: {
            ...s.groups,
            [id]: { id, name: name.trim() || 'New Group', color: color || GROUP_COLORS[existing % GROUP_COLORS.length], createdAt: Date.now() },
          },
        }));
        return id;
      },

      renameGroup: (groupId, name) => set((s) => {
        const g = s.groups[groupId];
        if (!g) return s;
        return { groups: { ...s.groups, [groupId]: { ...g, name: name.trim() || g.name } } };
      }),

      removeGroup: (groupId) => set((s) => {
        const groups = { ...s.groups };
        delete groups[groupId];
        // Unassign any members of this group.
        const groupOf = { ...s.groupOf };
        for (const sid of Object.keys(groupOf)) {
          if (groupOf[sid] === groupId) delete groupOf[sid];
        }
        return { groups, groupOf };
      }),

      assignToGroup: (steamId, groupId) => set((s) => {
        const groupOf = { ...s.groupOf };
        if (groupId === null) delete groupOf[steamId];
        else groupOf[steamId] = groupId;
        return { groupOf };
      }),

      /**
       * Refresh a tracked player's online state. Returns the transition that
       * just occurred: 'online' (offline→online), 'offline' (online→offline),
       * or null (no change), so the caller can notify on either edge.
       */
      updateTrackedStatus: (bmId, online, lastSeen) => {
        const cur = get().tracked[bmId];
        if (!cur) return null;
        let transition: 'online' | 'offline' | null = null;
        if (!cur.online && online) transition = 'online';
        else if (cur.online && !online) transition = 'offline';
        set((s) => ({
          tracked: {
            ...s.tracked,
            [bmId]: {
              ...cur,
              online,
              lastOnlineAt: online ? Date.now() : cur.lastOnlineAt,
              lastOfflineAt: !online ? (lastSeen || Date.now()) : cur.lastOfflineAt,
            },
          },
        }));
        return transition;
      },
    }),
    { name: 'rustoverlay.spy' },
  ),
);

/**
 * Given a player's weekly buckets, compute the longest contiguous "offline"
 * window (lowest activity) as a likely raid window, plus per-hour averages.
 */
export function analyzeSchedule(buckets: number[][]): {
  hourly: number[];       // 0-1 activity per hour, averaged across days
  raidStart: number;      // hour
  raidEnd: number;        // hour
} {
  const hourly = Array(24).fill(0);
  for (let h = 0; h < 24; h++) {
    let sum = 0, days = 0;
    for (let d = 0; d < 7; d++) {
      sum += buckets[d][h];
      if (buckets[d][h] > 0) days++;
    }
    // Normalise: average minutes/60 across the 7 days.
    hourly[h] = Math.min(1, sum / (7 * 60));
  }

  // Find the longest run of low-activity hours (wrapping around midnight).
  const LOW = 0.12;
  let bestStart = 0, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < 48; i++) {
    const h = i % 24;
    if (hourly[h] <= LOW) {
      if (curStart === -1) curStart = h;
      curLen++;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else {
      curStart = -1; curLen = 0;
    }
  }
  const raidStart = bestStart % 24;
  const raidEnd = (bestStart + Math.min(bestLen, 24)) % 24;
  return { hourly, raidStart, raidEnd };
}
