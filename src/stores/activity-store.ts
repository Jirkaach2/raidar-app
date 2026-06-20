import { create } from 'zustand';

/**
 * Activity store: passively records gameplay events derived from the Rust+ API.
 *
 * - Teammate online/offline/death transitions (a passive K/D-style death count).
 * - Event spawns (cargo / heli / chinook / crate) with timestamps.
 * - Per-member "last seen" grid + AFK detection (no position change).
 *
 * The Rust+ API does NOT expose kills, so we track DEATHS only (deaths are
 * derivable from is_alive flips). Kills cannot be tracked without a server
 * plugin, so K/D is reported as a death count + deaths-per-hour.
 */

export type ActivityKind =
  | 'online' | 'offline' | 'death' | 'respawn'
  | 'event_cargo' | 'event_heli' | 'event_chinook' | 'event_crate';

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  label: string;       // human text e.g. "Jirka died at D7"
  detail?: string;     // grid or extra info
  timestamp: number;
}

export interface MemberStat {
  steamId: string;
  name: string;
  deaths: number;
  lastSeenGrid: string;
  lastMovedAt: number;   // last time their position changed
  lastGrid: string;      // grid used for movement comparison
  online: boolean;
  alive: boolean;
}

interface ActivityState {
  log: ActivityEntry[];
  stats: Record<string, MemberStat>;
  /** Snapshot of last-seen online/alive state to detect transitions. */
  _prev: Record<string, { online: boolean; alive: boolean; x: number; y: number }>;
  _prevEvents: Set<string>;
  sessionStart: number;

  recordTeam: (members: any[], gridFn: (x: number, y: number) => string) => void;
  recordEvents: (markers: { id: string; type: string; detail?: string }[]) => void;
  clear: () => void;
}

function push(log: ActivityEntry[], kind: ActivityKind, label: string, detail?: string): ActivityEntry[] {
  const entry: ActivityEntry = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind, label, detail, timestamp: Date.now(),
  };
  // Keep newest first, cap at 200.
  return [entry, ...log].slice(0, 200);
}

const AFK_MS = 5 * 60_000; // 5 min without moving = AFK

export const useActivityStore = create<ActivityState>((set, get) => ({
  log: [],
  stats: {},
  _prev: {},
  _prevEvents: new Set(),
  sessionStart: Date.now(),

  recordTeam: (members, gridFn) => {
    const { _prev, stats } = get();
    let log = get().log;
    const nextPrev = { ..._prev };
    const nextStats = { ...stats };

    for (const m of members) {
      const id = String(m.steam_id);
      const grid = gridFn(m.x, m.y);
      const prev = _prev[id];
      const online = !!m.is_online;
      const alive = !!m.is_alive;

      // init stat
      if (!nextStats[id]) {
        nextStats[id] = {
          steamId: id, name: m.name, deaths: 0,
          lastSeenGrid: grid, lastMovedAt: Date.now(), lastGrid: grid,
          online, alive,
        };
      }
      const stat = { ...nextStats[id], name: m.name, online, alive, lastSeenGrid: grid };

      if (prev) {
        // Online/offline transitions
        if (online && !prev.online) log = push(log, 'online', `${m.name} came online`, grid);
        if (!online && prev.online) log = push(log, 'offline', `${m.name} went offline`, grid);
        // Death/respawn transitions (only count while we knew them)
        if (!alive && prev.alive) {
          log = push(log, 'death', `${m.name} died`, grid);
          stat.deaths += 1;
        }
        if (alive && !prev.alive) log = push(log, 'respawn', `${m.name} respawned`, grid);

        // Movement / AFK tracking
        const moved = Math.abs(m.x - prev.x) > 1 || Math.abs(m.y - prev.y) > 1;
        if (moved) {
          stat.lastMovedAt = Date.now();
          stat.lastGrid = grid;
        }
      }

      nextStats[id] = stat;
      nextPrev[id] = { online, alive, x: m.x, y: m.y };
    }

    set({ log, stats: nextStats, _prev: nextPrev });
  },

  recordEvents: (markers) => {
    const seen = get()._prevEvents;
    let log = get().log;
    const present = new Set<string>();
    const KIND: Record<string, ActivityKind> = {
      cargo_ship: 'event_cargo', patrol_heli: 'event_heli',
      chinook: 'event_chinook', crate: 'event_crate',
    };
    const LABEL: Record<string, string> = {
      cargo_ship: 'Cargo Ship spawned', patrol_heli: 'Patrol Helicopter inbound',
      chinook: 'Chinook (CH47) inbound', crate: 'Locked Crate dropped',
    };
    for (const mk of markers) {
      const kind = KIND[mk.type];
      if (!kind) continue;
      present.add(mk.id);
      if (!seen.has(mk.id)) {
        log = push(log, kind, LABEL[mk.type], mk.detail);
      }
    }
    // Carry forward only still-present ids so re-spawns log again.
    set({ log, _prevEvents: present });
  },

  clear: () => set({ log: [], stats: {}, _prev: {}, _prevEvents: new Set() }),
}));

export const ACTIVITY_AFK_MS = AFK_MS;
