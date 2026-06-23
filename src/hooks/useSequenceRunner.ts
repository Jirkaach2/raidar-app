import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSequenceStore, Sequence } from '../stores/sequence-store';
import { useDeviceStore } from '../stores/device-store';
import { isCurrentServer } from '../utils/server';

/**
 * Sequence runtime — the turret flip-flop engine.
 *
 * Once per second we walk every running sequence bound to the connected server:
 *   • Frozen (alarm active): force ALL switches across ALL groups ON so every
 *     turret is live for maximum firepower while you're being hit.
 *   • Normal: when `intervalSeconds` has elapsed since the last rotation, power
 *     the next group's switches ON and every other group's switches OFF, then
 *     advance `activeGroupIndex` (wrapping) and stamp `lastRotatedAt`.
 *
 * A Smart Alarm (`smart-alarm` event) whose title matches `freezeAlarmFilter`
 * (or any alarm when the filter is blank) freezes the sequence for
 * `freezeCooldownSeconds` past the latest alarm; the freeze auto-clears once the
 * cooldown lapses and rotation resumes.
 *
 * Switch writes are change-gated against the device store's known `value` so we
 * never thrash the radio with redundant set_entity_value calls, and any failure
 * (device offline / out of range) is swallowed silently.
 */

/** Per-sequence freeze deadlines (epoch ms), kept off the persisted store. */
function freezeMap(): Record<string, number> {
  const w = window as any;
  return w.__seqFreezeUntil || (w.__seqFreezeUntil = {});
}

/** A sequence with no explicit groups treats each switch as its own group, so
 *  it rotates one switch at a time. Otherwise use the groups as authored. */
function effectiveGroups(seq: Sequence): number[][] {
  if (seq.groups.length > 0) return seq.groups.map((g) => g.entityIds);
  return [];
}

/** Push a switch to a target state, but only if it differs from what we know. */
async function setSwitch(entityId: number, value: boolean) {
  const ds = useDeviceStore.getState();
  const dev = ds.devices[entityId];
  if (dev && dev.value === value) return; // already in the intended state
  try {
    await invoke('set_entity_value', { entityId, value });
    ds.updateDevice(entityId, { value });
  } catch {
    // Device offline / unpaired / out of range — ignore and retry next tick.
  }
}

/** Drive a sequence to "every switch ON" (freeze / full firepower). */
function powerAll(seq: Sequence) {
  for (const g of seq.groups) {
    for (const id of g.entityIds) void setSwitch(id, true);
  }
}

/** Power the given group's switches ON and all others OFF. */
function powerGroup(groups: number[][], activeIndex: number) {
  groups.forEach((ids, i) => {
    const on = i === activeIndex;
    for (const id of ids) void setSwitch(id, on);
  });
}

export function useSequenceRunner() {
  // Smart-alarm listener: arm freeze deadlines for every matching sequence.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    listen<{ title?: string }>('smart-alarm', (event) => {
      const title = (event.payload?.title || '').toLowerCase();
      const now = Date.now();
      const { sequences, update } = useSequenceStore.getState();
      const deadlines = freezeMap();
      for (const seq of sequences) {
        if (!seq.running || !isCurrentServer(seq.serverId)) continue;
        const filter = (seq.freezeAlarmFilter || '').trim().toLowerCase();
        if (filter && !title.includes(filter)) continue;
        const cooldown = (seq.freezeCooldownSeconds ?? 5) * 1000;
        deadlines[seq.id] = now + cooldown;
        if (!seq.frozen) update(seq.id, { frozen: true });
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // 1s rotation tick.
  useEffect(() => {
    const tick = () => {
      const { sequences, update } = useSequenceStore.getState();
      if (sequences.length === 0) return;
      const now = Date.now();
      const deadlines = freezeMap();

      for (const seq of sequences) {
        if (!seq.running) continue;
        if (!isCurrentServer(seq.serverId)) continue;

        // Freeze handling: while the deadline is in the future, keep everything
        // ON and skip rotation. Once it lapses, clear the freeze and resume.
        const freezeUntil = deadlines[seq.id] || 0;
        if (now < freezeUntil) {
          if (!seq.frozen) update(seq.id, { frozen: true });
          powerAll(seq);
          continue;
        }
        if (seq.frozen) update(seq.id, { frozen: false });

        const groups = effectiveGroups(seq);
        if (groups.length === 0) continue; // nothing wired yet

        const intervalMs = Math.max(1, seq.intervalSeconds) * 1000;
        const due = !seq.lastRotatedAt || now - seq.lastRotatedAt >= intervalMs;
        if (!due) continue;

        // On a fresh start lastRotatedAt is 0 — power the current group now and
        // begin counting; thereafter advance to the next group each interval.
        const isFirst = !seq.lastRotatedAt;
        const nextIndex = isFirst
          ? Math.min(seq.activeGroupIndex, groups.length - 1)
          : (seq.activeGroupIndex + 1) % groups.length;

        powerGroup(groups, nextIndex);
        update(seq.id, { activeGroupIndex: nextIndex, lastRotatedAt: now });
      }
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
}
