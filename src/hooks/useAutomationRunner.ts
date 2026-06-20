import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAutomationStore, Automation } from '../stores/automation-store';
import { useDeviceStore } from '../stores/device-store';
import { useMapStore } from '../stores/map-store';
import { getCurrentServer } from '../utils/server';

/**
 * Smart Switch automation runtime.
 *
 * Evaluates all enabled automations once per second. Time-based triggers read
 * the live in-game clock; world-event triggers are fired by App.tsx via
 * `fireAutomationEvent(...)` which records the event into a small global queue
 * that this runner drains. Storage-monitor triggers (upkeep / item counts) are
 * edge-detected from a contents cache the runner refreshes every ~20s. Switch
 * state is changed through the Rust+ set_entity_value command and mirrored into
 * the device store.
 */

type AutoEventKind =
  | 'oil_crate_triggered' | 'oil_crate_unlocked' | 'heli_crash'
  | 'patrol_heli_spawn' | 'chinook_spawn' | 'cargo_spawn' | 'cargo_departed'
  | 'crate_spawn' | 'vendor_spawn' | 'deep_sea' | 'smart_alarm';

/** Push a world-event into the queue the runner drains. Called from App.tsx. */
export function fireAutomationEvent(kind: AutoEventKind, meta?: { title?: string }) {
  const w = window as any;
  const q: { kind: AutoEventKind; title?: string }[] = w.__autoEventQueue || (w.__autoEventQueue = []);
  q.push({ kind, title: meta?.title });
}

/** Cached storage-monitor contents: item totals + upkeep expiry (epoch seconds). */
interface MonitorSnapshot { items: Record<number, number>; protectionExpiry: number; at: number; }
function monitorCache(): Record<number, MonitorSnapshot> {
  const w = window as any;
  return w.__autoMonitorCache || (w.__autoMonitorCache = {});
}

/** Refresh contents for the storage monitors referenced by active automations. */
async function refreshMonitors(monitorIds: number[]) {
  const cache = monitorCache();
  const now = Date.now();
  for (const id of monitorIds) {
    const prev = cache[id];
    if (prev && now - prev.at < 18_000) continue; // throttle ~20s per monitor
    try {
      const info: any = await invoke('get_entity_info', { entityId: id });
      const items: Record<number, number> = {};
      for (const it of (info?.items || [])) {
        const iid = Number(it.item_id);
        items[iid] = (items[iid] || 0) + Number(it.quantity || 0);
      }
      cache[id] = { items, protectionExpiry: Number(info?.protection_expiry || 0), at: now };
      // Mirror upkeep into the device store so the rest of the UI stays fresh.
      useDeviceStore.getState().updateDevice(id, {
        protectionExpiry: Number(info?.protection_expiry || 0),
        hasProtection: !!info?.has_protection,
        capacity: info?.payload_capacity,
      });
    } catch {
      // Monitor offline / out of range — leave the last snapshot in place.
    }
  }
}

/** Hours of upkeep remaining for a monitor (Infinity if unknown / no cache). */
function upkeepHoursLeft(monitorId?: number): number | null {
  if (monitorId == null) return null;
  const snap = monitorCache()[monitorId];
  if (!snap || snap.protectionExpiry <= 0) return null;
  const secs = snap.protectionExpiry - Math.floor(Date.now() / 1000);
  return Math.max(0, secs / 3600);
}

/** Total quantity of an item across a monitor's contents (null if unknown). */
function itemCount(monitorId?: number, itemId?: number): number | null {
  if (monitorId == null || itemId == null) return null;
  const snap = monitorCache()[monitorId];
  if (!snap) return null;
  return snap.items[itemId] || 0;
}

/** Evaluate a state predicate (used by both monitor triggers and conditions). */
function evalState(kind: string, monitorId: number | undefined, opts: { upkeepHours?: number; itemId?: number; itemQty?: number }): boolean | null {
  switch (kind) {
    case 'upkeep_below': {
      const h = upkeepHoursLeft(monitorId);
      return h == null ? null : h < (opts.upkeepHours ?? 24);
    }
    case 'upkeep_above': {
      const h = upkeepHoursLeft(monitorId);
      return h == null ? null : h > (opts.upkeepHours ?? 24);
    }
    case 'item_below': {
      const c = itemCount(monitorId, opts.itemId);
      return c == null ? null : c < (opts.itemQty ?? 0);
    }
    case 'item_above': {
      const c = itemCount(monitorId, opts.itemId);
      return c == null ? null : c > (opts.itemQty ?? 0);
    }
    default: return true;
  }
}

/** Does the optional gate condition pass? Unknown state = block (safe default). */
function conditionPasses(a: Automation): boolean {
  if (!a.condition || a.condition === 'none') return true;
  const res = evalState(a.condition, a.monitorId, {
    upkeepHours: a.condUpkeepHours,
    itemId: a.condItemId,
    itemQty: a.condItemQty,
  });
  return res === true;
}

async function applyAction(a: Automation) {
  const ds = useDeviceStore.getState();
  const dev = ds.devices[a.entityId];
  const current = dev?.value ?? false;

  let target: boolean;
  switch (a.action) {
    case 'on': target = true; break;
    case 'off': target = false; break;
    case 'toggle': target = !current; break;
    case 'pulse': target = true; break;
    default: target = current;
  }

  try {
    await invoke('set_entity_value', { entityId: a.entityId, value: target });
    ds.updateDevice(a.entityId, { value: target });

    // Pulse: schedule the OFF flip after pulseSeconds.
    if (a.action === 'pulse') {
      const secs = Math.max(1, a.pulseSeconds || 5);
      setTimeout(async () => {
        try {
          await invoke('set_entity_value', { entityId: a.entityId, value: false });
          useDeviceStore.getState().updateDevice(a.entityId, { value: false });
        } catch { /* device offline; ignore */ }
      }, secs * 1000);
    }
  } catch {
    // Switch unreachable (out of range / unpaired). Skip silently.
  }
}

export function useAutomationRunner() {
  useEffect(() => {
    const tick = async () => {
      const { automations, markFired } = useAutomationStore.getState();
      if (automations.length === 0) return;

      const now = Date.now();
      const srv = getCurrentServer();
      const srvId = srv?.id;
      const time = useMapStore.getState().timeInfo;

      // Refresh the storage monitors any active automation depends on (trigger
      // or condition). Fire-and-forget — results land in the cache for later ticks.
      const monitorIds = new Set<number>();
      for (const a of automations) {
        if (!a.enabled) continue;
        if (a.monitorId != null && (a.trigger === 'upkeep_below' || a.trigger === 'item_below' || a.trigger === 'item_above' || (a.condition && a.condition !== 'none'))) {
          monitorIds.add(a.monitorId);
        }
      }
      if (monitorIds.size > 0) void refreshMonitors([...monitorIds]);

      // Drain the world-event queue this tick.
      const w = window as any;
      const queue: { kind: AutoEventKind; title?: string }[] = w.__autoEventQueue || (w.__autoEventQueue = []);
      const drained = queue.splice(0, queue.length);
      const firedEvents = new Set(drained.map((e) => e.kind));
      const alarmTitles = drained.filter((e) => e.kind === 'smart_alarm').map((e) => (e.title || '').toLowerCase());

      // Day/night edge detection from the in-game clock.
      const prevHour = w.__autoPrevHour as number | undefined;
      const curHour = time?.time;
      let crossedSunset = false;
      let crossedSunrise = false;
      let crossedGameHour: ((h: number) => boolean) | null = null;
      if (time && curHour !== undefined) {
        if (prevHour !== undefined && prevHour !== curHour) {
          const passed = (target: number) => {
            // Handle wrap-around midnight.
            if (prevHour <= curHour) return target > prevHour && target <= curHour;
            return target > prevHour || target <= curHour;
          };
          crossedSunset = passed(time.sunset);
          crossedSunrise = passed(time.sunrise);
          crossedGameHour = passed;
        }
        w.__autoPrevHour = curHour;
      }

      // Per-automation edge memory for state-based monitor triggers.
      const edge: Record<string, boolean> = w.__autoEdgeState || (w.__autoEdgeState = {});

      for (const a of automations) {
        if (!a.enabled) continue;
        // Only run automations bound to the connected server.
        if (a.serverId && srvId && a.serverId !== srvId) continue;

        let fire = false;
        switch (a.trigger) {
          case 'interval': {
            const secs = Math.max(5, a.intervalSeconds || 300);
            if (!a.lastFired || now - a.lastFired >= secs * 1000) fire = true;
            break;
          }
          case 'nightfall': fire = crossedSunset; break;
          case 'daybreak': fire = crossedSunrise; break;
          case 'game_time':
            fire = !!crossedGameHour && crossedGameHour(a.gameHour ?? 0);
            break;
          case 'oil_crate_triggered': fire = firedEvents.has('oil_crate_triggered'); break;
          case 'oil_crate_unlocked': fire = firedEvents.has('oil_crate_unlocked'); break;
          case 'heli_crash': fire = firedEvents.has('heli_crash'); break;
          case 'patrol_heli_spawn': fire = firedEvents.has('patrol_heli_spawn'); break;
          case 'chinook_spawn': fire = firedEvents.has('chinook_spawn'); break;
          case 'cargo_spawn': fire = firedEvents.has('cargo_spawn'); break;
          case 'cargo_departed': fire = firedEvents.has('cargo_departed'); break;
          case 'crate_spawn': fire = firedEvents.has('crate_spawn'); break;
          case 'vendor_spawn': fire = firedEvents.has('vendor_spawn'); break;
          case 'deep_sea': fire = firedEvents.has('deep_sea'); break;
          case 'smart_alarm': {
            if (firedEvents.has('smart_alarm')) {
              const filter = (a.alarmFilter || '').trim().toLowerCase();
              fire = !filter || alarmTitles.some((t) => t.includes(filter));
            }
            break;
          }
          // Storage-monitor state triggers — fire once on the false→true edge so
          // a switch flips when the threshold is first crossed, not every tick.
          case 'upkeep_below':
          case 'item_below':
          case 'item_above': {
            const state = evalState(a.trigger, a.monitorId, { upkeepHours: a.upkeepHours, itemId: a.itemId, itemQty: a.itemQty });
            if (state !== null) {
              const prev = edge[a.id] || false;
              if (state && !prev) fire = true;
              edge[a.id] = state;
            }
            break;
          }
        }

        if (fire && conditionPasses(a)) {
          markFired(a.id, now);
          applyAction(a);
        }
      }
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
}
