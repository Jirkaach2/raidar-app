import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCurrentServer } from '../utils/server';

/**
 * SEQUENCES — the classic Rust turret "flip-flop".
 *
 * Rust only powers 12 turrets per electrical branch. To run more, you wire your
 * turrets into groups and rotate power between the groups on a timer: while one
 * group is live the others are dark, so you never exceed the limit yet still
 * cover every angle over time. A sequence models exactly that — an ordered list
 * of groups, each holding some smart switches, rotated round-robin every
 * `intervalSeconds`. An optional freeze trigger (a paired Smart Alarm) flips
 * every group ON at once for full firepower while you're being raided.
 */

/** A named bucket of smart switches that get powered together. */
export interface SequenceGroup {
  id: string;
  name: string;
  entityIds: number[];
}

/** A full rotation definition + its live runtime state. */
export interface Sequence {
  id: string;
  name: string;
  groups: SequenceGroup[];
  intervalSeconds: number;
  running: boolean;
  activeGroupIndex: number;
  /** Title (substring) of the Smart Alarm that triggers freeze; blank = any. */
  freezeAlarmFilter?: string;
  /** Seconds of full-firepower freeze after the latest matching alarm. */
  freezeCooldownSeconds?: number;
  serverId?: string;
  serverName?: string;
  createdAt: number;
  /** Epoch ms of the last rotation, used by the runner to time the next flip. */
  lastRotatedAt?: number;
  /** Currently frozen (full firepower) — set by the runner on alarm. */
  frozen?: boolean;
}

interface SequenceState {
  sequences: Sequence[];
  add: (name: string) => void;
  remove: (id: string) => void;
  update: (id: string, data: Partial<Sequence>) => void;
  start: (id: string, intervalSeconds?: number) => void;
  stop: (id: string) => void;
  addGroup: (seqId: string, name: string) => void;
  removeGroup: (seqId: string, groupId: string) => void;
  renameGroup: (seqId: string, groupId: string, name: string) => void;
  addSwitch: (seqId: string, groupId: string, entityId: number) => void;
  removeSwitch: (seqId: string, groupId: string, entityId: number) => void;
  moveSwitch: (seqId: string, entityId: number, toGroupId: string, toIndex: number) => void;
  setFreeze: (seqId: string, alarmFilter: string, cooldownSeconds: number) => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Map over a single sequence by id, leaving the rest untouched. */
function mapSeq(seqs: Sequence[], id: string, fn: (s: Sequence) => Sequence): Sequence[] {
  return seqs.map((s) => (s.id === id ? fn(s) : s));
}

export const useSequenceStore = create<SequenceState>()(
  persist(
    (set) => ({
      sequences: [],

      add: (name) => set((s) => {
        const srv = getCurrentServer();
        const seq: Sequence = {
          id: uid('seq'),
          name: name.trim() || 'New Sequence',
          groups: [],
          intervalSeconds: 30,
          running: false,
          activeGroupIndex: 0,
          freezeCooldownSeconds: 5,
          serverId: srv?.id,
          serverName: srv?.name,
          createdAt: Date.now(),
        };
        return { sequences: [...s.sequences, seq] };
      }),

      remove: (id) => set((s) => ({ sequences: s.sequences.filter((x) => x.id !== id) })),

      update: (id, data) => set((s) => ({ sequences: mapSeq(s.sequences, id, (x) => ({ ...x, ...data })) })),

      start: (id, intervalSeconds) => set((s) => ({
        sequences: mapSeq(s.sequences, id, (x) => ({
          ...x,
          running: true,
          intervalSeconds: intervalSeconds && intervalSeconds > 0 ? intervalSeconds : x.intervalSeconds,
          // Force an immediate rotation on the next tick.
          lastRotatedAt: 0,
          frozen: false,
        })),
      })),

      // Stop leaves the currently-active group powered ON (the runner simply
      // stops rotating); we only clear the running/frozen flags here.
      stop: (id) => set((s) => ({
        sequences: mapSeq(s.sequences, id, (x) => ({ ...x, running: false, frozen: false })),
      })),

      addGroup: (seqId, name) => set((s) => ({
        sequences: mapSeq(s.sequences, seqId, (x) => ({
          ...x,
          groups: [...x.groups, { id: uid('grp'), name: name.trim() || `Group ${x.groups.length + 1}`, entityIds: [] }],
        })),
      })),

      removeGroup: (seqId, groupId) => set((s) => ({
        sequences: mapSeq(s.sequences, seqId, (x) => {
          const groups = x.groups.filter((g) => g.id !== groupId);
          const activeGroupIndex = groups.length ? Math.min(x.activeGroupIndex, groups.length - 1) : 0;
          return { ...x, groups, activeGroupIndex };
        }),
      })),

      renameGroup: (seqId, groupId, name) => set((s) => ({
        sequences: mapSeq(s.sequences, seqId, (x) => ({
          ...x,
          groups: x.groups.map((g) => (g.id === groupId ? { ...g, name: name.trim() || g.name } : g)),
        })),
      })),

      addSwitch: (seqId, groupId, entityId) => set((s) => ({
        sequences: mapSeq(s.sequences, seqId, (x) => ({
          ...x,
          groups: x.groups.map((g) => {
            // A switch belongs to one group at a time — drop it from any other
            // group first, then append to the target group.
            if (g.id === groupId) {
              return g.entityIds.includes(entityId) ? g : { ...g, entityIds: [...g.entityIds, entityId] };
            }
            return { ...g, entityIds: g.entityIds.filter((e) => e !== entityId) };
          }),
        })),
      })),

      removeSwitch: (seqId, groupId, entityId) => set((s) => ({
        sequences: mapSeq(s.sequences, seqId, (x) => ({
          ...x,
          groups: x.groups.map((g) => (g.id === groupId ? { ...g, entityIds: g.entityIds.filter((e) => e !== entityId) } : g)),
        })),
      })),

      moveSwitch: (seqId, entityId, toGroupId, toIndex) => set((s) => ({
        sequences: mapSeq(s.sequences, seqId, (x) => {
          // Strip the switch from every group, then splice it into the target at
          // the requested index — supports both cross-group moves and reorder.
          const stripped = x.groups.map((g) => ({ ...g, entityIds: g.entityIds.filter((e) => e !== entityId) }));
          const groups = stripped.map((g) => {
            if (g.id !== toGroupId) return g;
            const ids = [...g.entityIds];
            const idx = Math.max(0, Math.min(toIndex, ids.length));
            ids.splice(idx, 0, entityId);
            return { ...g, entityIds: ids };
          });
          return { ...x, groups };
        }),
      })),

      setFreeze: (seqId, alarmFilter, cooldownSeconds) => set((s) => ({
        sequences: mapSeq(s.sequences, seqId, (x) => ({
          ...x,
          freezeAlarmFilter: alarmFilter.trim() || undefined,
          freezeCooldownSeconds: cooldownSeconds > 0 ? cooldownSeconds : 5,
        })),
      })),
    }),
    {
      name: 'rust-sequences',
      version: 1,
    }
  )
);
