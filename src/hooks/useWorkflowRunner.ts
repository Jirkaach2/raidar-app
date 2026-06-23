import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  useWorkflowStore, Workflow, WorkflowTrigger, WorkflowCondition,
  resolveMessageVariables, MessageContext,
} from '../stores/workflow-store';
import { useDeviceStore, SmartDevice } from '../stores/device-store';
import { useTeamStore, TeamMember } from '../stores/team-store';
import { useMapStore, TimeInfo } from '../stores/map-store';
import { useSpyStore } from '../stores/spy-store';
import { isCurrentServer } from '../utils/server';
import { getGridCoordinate } from '../utils/grid';
import { broadcastToTeam, sendDiscordWebhook } from '../stores/settings-store';

/**
 * WORKFLOWS runtime.
 *
 * Once per second we edge-detect every enabled workflow's trigger from live app
 * state (the in-game clock, team roster, paired devices, tracked players and map
 * events). When a trigger fires and all of the workflow's conditions hold, the
 * action list runs IN ORDER — toggling switches, posting to team chat, pinging
 * Discord, pausing (`wait`) or chaining into another workflow (`trigger_workflow`,
 * guarded by a recursion-depth cap).
 *
 * Smart-alarm pushes arrive on the `smart-alarm` Tauri event; we subscribe once
 * and drain a small queue each tick (we never touch the automation runner's own
 * `window.__autoEventQueue`).
 *
 * Paired triggers (day↔night, first-online↔all-offline, specific on↔off,
 * upkeep low↔restored, tracked join↔leave) support `autoReverse`: when the
 * REVERSE edge fires we re-run only the switch toggles inverted, leaving chat /
 * Discord actions alone so we don't double-spam.
 */

const COOLDOWN_MS = 5_000;       // per-workflow anti-spam window
const MAX_DEPTH = 4;             // trigger_workflow recursion cap
const MONITOR_TTL_MS = 18_000;   // throttle get_entity_info per monitor

/** World-event marker types we surface through the `event_alert` trigger. */
const EVENT_LABELS: Record<string, string> = {
  patrol_heli: 'Patrol Helicopter',
  cargo_ship: 'Cargo Ship',
  chinook: 'Chinook (CH47)',
  crate: 'Locked Crate',
  explosion: 'Heli Crash',
  vendor: 'Travelling Vendor',
};

const REVERSE_TRIGGER: Partial<Record<WorkflowTrigger, WorkflowTrigger>> = {
  day_start: 'night_start',
  night_start: 'day_start',
  first_teammate_online: 'all_teammates_offline',
  all_teammates_offline: 'first_teammate_online',
  specific_teammate_online: 'specific_teammate_offline',
  specific_teammate_offline: 'specific_teammate_online',
  upkeep_low: 'upkeep_restored',
  upkeep_restored: 'upkeep_low',
  tracked_player_joins: 'tracked_player_leaves',
  tracked_player_leaves: 'tracked_player_joins',
};

interface MonitorSnap { expiry: number; at: number; }

interface RunnerState {
  prevHour?: number;
  prevClock?: number;
  prevOnline?: Set<string>;
  prevAnyOnline?: boolean;
  prevSwitch: Record<number, boolean>;
  prevTracked?: Record<string, boolean>;
  prevMarkerIds?: Set<string>;
  upkeepLow: Record<string, boolean>;
  lastRun: Record<string, number>;
  monitorCache: Record<number, MonitorSnap>;
}

interface Signals {
  crossedSunrise: boolean;
  crossedSunset: boolean;
  clockCrossed: (h: number, m: number) => boolean;
  firstOnlineEdge: boolean;
  allOfflineEdge: boolean;
  newlyOnline: string[];
  newlyOffline: string[];
  alarms: { title: string; message: string }[];
  switchChanges: Record<number, { from: boolean; to: boolean }>;
  trackedJoined: string[];
  trackedLeft: string[];
  newEvents: { event: string; grid: string }[];
}

function deviceName(devices: Record<number, SmartDevice>, id: number): string {
  const d = devices[id];
  return d?.customName || d?.entityName || `#${id}`;
}

/** Is it currently daytime in-game (between sunrise and sunset)? */
function isDay(time: TimeInfo | null | undefined): boolean {
  if (!time) return true;
  const { time: t, sunrise: sr, sunset: ss } = time;
  if (sr <= ss) return t >= sr && t < ss;
  return t >= sr || t < ss;
}

/** Hours of upkeep remaining for a monitor (null if unknown / no cache). */
function upkeepHoursLeft(monitorId: number | undefined, cache: Record<number, MonitorSnap>): number | null {
  if (monitorId == null) return null;
  const snap = cache[monitorId];
  if (!snap || snap.expiry <= 0) return null;
  const secs = snap.expiry - Math.floor(Date.now() / 1000);
  return Math.max(0, secs / 3600);
}

/** Refresh upkeep expiry for the monitors any active workflow depends on. */
async function refreshMonitors(ids: number[], cache: Record<number, MonitorSnap>) {
  const now = Date.now();
  for (const id of ids) {
    const prev = cache[id];
    if (prev && now - prev.at < MONITOR_TTL_MS) continue;
    try {
      const info: any = await invoke('get_entity_info', { entityId: id });
      cache[id] = { expiry: Number(info?.protection_expiry || 0), at: now };
      useDeviceStore.getState().updateDevice(id, {
        protectionExpiry: Number(info?.protection_expiry || 0),
        hasProtection: !!info?.has_protection,
      });
    } catch {
      // Monitor offline / out of range — keep the previous snapshot.
    }
  }
}

function conditionPasses(
  c: WorkflowCondition,
  devices: Record<number, SmartDevice>,
  members: TeamMember[],
  time: TimeInfo | null,
): boolean {
  switch (c.type) {
    case 'during_night': return !isDay(time);
    case 'during_day': return isDay(time);
    case 'teammate_online': return members.some((m) => m.name === c.teammateName && m.status === 'online');
    case 'teammate_offline': return !members.some((m) => m.name === c.teammateName && m.status === 'online');
    case 'switch_on': return c.switchEntityId != null && !!devices[c.switchEntityId]?.value;
    case 'switch_off': return c.switchEntityId != null && !devices[c.switchEntityId]?.value;
    default: return true;
  }
}

function evaluateTrigger(
  trigger: WorkflowTrigger,
  w: Workflow,
  sig: Signals,
  devices: Record<number, SmartDevice>,
  upkeepEdge: Record<string, 'low' | 'restored' | null>,
): { fired: boolean; ctx: MessageContext } {
  const p = w.triggerParams || {};
  switch (trigger) {
    case 'day_start': return { fired: sig.crossedSunrise, ctx: {} };
    case 'night_start': return { fired: sig.crossedSunset, ctx: {} };
    case 'custom_time': return { fired: sig.clockCrossed(p.scheduleHour ?? 0, p.scheduleMinute ?? 0), ctx: {} };
    case 'first_teammate_online': return { fired: sig.firstOnlineEdge, ctx: { player: sig.newlyOnline.join(', ') } };
    case 'all_teammates_offline': return { fired: sig.allOfflineEdge, ctx: {} };
    case 'specific_teammate_online': {
      const n = p.teammateName;
      return { fired: !!n && sig.newlyOnline.includes(n), ctx: { player: n || '' } };
    }
    case 'specific_teammate_offline': {
      const n = p.teammateName;
      return { fired: !!n && sig.newlyOffline.includes(n), ctx: { player: n || '' } };
    }
    case 'smart_alarm': {
      const f = (p.alarmFilter || '').trim().toLowerCase();
      const match = sig.alarms.find((a) => !f || (a.title || '').toLowerCase().includes(f) || (a.message || '').toLowerCase().includes(f));
      return { fired: sig.alarms.length > 0 && !!match, ctx: { alarm_name: match?.title || match?.message || '' } };
    }
    case 'switch_state_changed': {
      const id = p.switchEntityId;
      if (id == null) return { fired: false, ctx: {} };
      const ch = sig.switchChanges[id];
      if (!ch) return { fired: false, ctx: {} };
      const ok = p.switchState === undefined || ch.to === p.switchState;
      return { fired: ok, ctx: { switch_name: deviceName(devices, id), switch_state: ch.to ? 'on' : 'off' } };
    }
    case 'upkeep_low':
      return { fired: upkeepEdge[w.id] === 'low', ctx: { hours: p.upkeepHours ?? 24, upkeep: `<${p.upkeepHours ?? 24}h` } };
    case 'upkeep_restored':
      return { fired: upkeepEdge[w.id] === 'restored', ctx: { hours: p.upkeepHours ?? 24, upkeep: `>${p.upkeepHours ?? 24}h` } };
    case 'tracked_player_joins': return { fired: sig.trackedJoined.length > 0, ctx: { player: sig.trackedJoined.join(', ') } };
    case 'tracked_player_leaves': return { fired: sig.trackedLeft.length > 0, ctx: { player: sig.trackedLeft.join(', ') } };
    case 'event_alert': {
      const e = sig.newEvents[0];
      return { fired: sig.newEvents.length > 0, ctx: { event: e?.event || '', grid: e?.grid || '' } };
    }
    default: return { fired: false, ctx: {} };
  }
}

/** Execute a workflow's action list in order. `reverse` runs only inverted switch toggles. */
async function runActions(wf: Workflow, ctx: MessageContext, depth: number, reverse: boolean) {
  if (depth > MAX_DEPTH) return;
  for (const a of wf.actions) {
    if (reverse && a.type !== 'toggle_switch') continue;
    switch (a.type) {
      case 'toggle_switch': {
        if (a.entityId == null) break;
        const dev = useDeviceStore.getState().devices[a.entityId];
        const cur = !!dev?.value;
        let act = a.switchAction ?? 'toggle';
        if (reverse) act = act === 'on' ? 'off' : act === 'off' ? 'on' : 'toggle';
        const target = act === 'on' ? true : act === 'off' ? false : !cur;
        try {
          await invoke('set_entity_value', { entityId: a.entityId, value: target });
          useDeviceStore.getState().updateDevice(a.entityId, { value: target });
        } catch {
          // Switch unreachable — skip.
        }
        break;
      }
      case 'team_chat': {
        if (a.message) await broadcastToTeam(resolveMessageVariables(a.message, ctx));
        break;
      }
      case 'discord': {
        if (a.message) await sendDiscordWebhook(resolveMessageVariables(a.message, ctx), 'event');
        break;
      }
      case 'wait': {
        const ms = Math.max(0, (a.seconds ?? 0) * 1000);
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
        break;
      }
      case 'trigger_workflow': {
        if (a.targetWorkflowId) {
          const target = useWorkflowStore.getState().workflows.find((x) => x.id === a.targetWorkflowId);
          if (target) await runActions(target, ctx, depth + 1, false);
        }
        break;
      }
    }
  }
}

export function useWorkflowRunner() {
  const stateRef = useRef<RunnerState>({
    prevSwitch: {},
    upkeepLow: {},
    lastRun: {},
    monitorCache: {},
  });

  useEffect(() => {
    const st = stateRef.current;
    const alarmQueue: { title: string; message: string }[] = [];

    // Subscribe once to smart-alarm pushes; drained each tick.
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<{ title?: string; message?: string }>('smart-alarm', (event) => {
      alarmQueue.push({ title: event.payload?.title || '', message: event.payload?.message || '' });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    const tick = () => {
      const workflows = useWorkflowStore.getState().workflows;
      if (workflows.length === 0) {
        alarmQueue.length = 0;
        return;
      }

      const now = Date.now();
      const time = useMapStore.getState().timeInfo;
      const members = useTeamStore.getState().members;
      const devices = useDeviceStore.getState().devices;

      // ── In-game day/night crossing ──────────────────────────────────────
      let crossedSunrise = false;
      let crossedSunset = false;
      const curHour = time?.time;
      if (time && curHour !== undefined) {
        const prev = st.prevHour;
        if (prev !== undefined && prev !== curHour) {
          const passed = (target: number) => (prev <= curHour
            ? target > prev && target <= curHour
            : target > prev || target <= curHour);
          crossedSunrise = passed(time.sunrise);
          crossedSunset = passed(time.sunset);
        }
        st.prevHour = curHour;
      }

      // ── Real-clock crossing for custom_time ─────────────────────────────
      const d = new Date(now);
      const curClock = d.getHours() * 60 + d.getMinutes();
      const prevClock = st.prevClock;
      st.prevClock = curClock;
      const clockCrossed = (h: number, m: number): boolean => {
        if (prevClock === undefined || prevClock === curClock) return false;
        const target = (((h % 24) + 24) % 24) * 60 + (((m % 60) + 60) % 60);
        return prevClock < curClock
          ? target > prevClock && target <= curClock
          : target > prevClock || target <= curClock;
      };

      // ── Team roster edges ───────────────────────────────────────────────
      const onlineSet = new Set(members.filter((m) => m.status === 'online').map((m) => m.name));
      const prevOnline = st.prevOnline;
      const newlyOnline: string[] = [];
      const newlyOffline: string[] = [];
      if (prevOnline) {
        onlineSet.forEach((n) => { if (!prevOnline.has(n)) newlyOnline.push(n); });
        prevOnline.forEach((n) => { if (!onlineSet.has(n)) newlyOffline.push(n); });
      }
      const anyOnline = onlineSet.size > 0;
      const firstOnlineEdge = st.prevAnyOnline === false && anyOnline;
      const allOfflineEdge = st.prevAnyOnline === true && !anyOnline && members.length > 0;
      st.prevOnline = onlineSet;
      st.prevAnyOnline = anyOnline;

      // ── Switch value changes ────────────────────────────────────────────
      const switchChanges: Record<number, { from: boolean; to: boolean }> = {};
      for (const dev of Object.values(devices)) {
        if (Number(dev.entityType) !== 1) continue;
        const cur = !!dev.value;
        const prev = st.prevSwitch[dev.entityId];
        if (prev !== undefined && prev !== cur) switchChanges[dev.entityId] = { from: prev, to: cur };
        st.prevSwitch[dev.entityId] = cur;
      }

      // ── Tracked (spy) players ───────────────────────────────────────────
      const trackedJoined: string[] = [];
      const trackedLeft: string[] = [];
      let tracked: Record<string, { steamId: string; name: string; online: boolean }> = {};
      try { tracked = useSpyStore.getState().tracked as any; } catch { /* spy store unavailable */ }
      const curTracked: Record<string, boolean> = {};
      const prevTracked = st.prevTracked;
      for (const t of Object.values(tracked)) {
        curTracked[t.steamId] = t.online;
        if (prevTracked) {
          const was = prevTracked[t.steamId];
          if (was !== undefined && was !== t.online) {
            if (t.online) trackedJoined.push(t.name);
            else trackedLeft.push(t.name);
          }
        }
      }
      st.prevTracked = curTracked;

      // ── New world-event markers ─────────────────────────────────────────
      const markers = useMapStore.getState().markers;
      const mapSize = useMapStore.getState().mapSize;
      const newEvents: { event: string; grid: string }[] = [];
      const curIds = new Set<string>();
      const prevIds = st.prevMarkerIds;
      for (const mk of markers) {
        curIds.add(mk.id);
        const label = EVENT_LABELS[mk.type];
        if (!label) continue;
        if (prevIds && !prevIds.has(mk.id)) {
          const raw = mk.raw || {};
          const grid = (typeof raw.grid === 'string' && raw.grid)
            || (raw.x != null && raw.y != null ? getGridCoordinate(Number(raw.x), Number(raw.y), mapSize) : '');
          newEvents.push({ event: label, grid });
        }
      }
      st.prevMarkerIds = curIds;

      // ── Smart-alarm queue ───────────────────────────────────────────────
      const alarms = alarmQueue.splice(0, alarmQueue.length);

      const sig: Signals = {
        crossedSunrise, crossedSunset, clockCrossed,
        firstOnlineEdge, allOfflineEdge, newlyOnline, newlyOffline,
        alarms, switchChanges, trackedJoined, trackedLeft, newEvents,
      };

      // ── Upkeep edges (per-workflow, threshold-dependent) ────────────────
      const monitorIds = new Set<number>();
      for (const w of workflows) {
        if (!w.enabled) continue;
        if ((w.trigger === 'upkeep_low' || w.trigger === 'upkeep_restored') && w.triggerParams.monitorId != null) {
          monitorIds.add(w.triggerParams.monitorId);
        }
      }
      if (monitorIds.size > 0) void refreshMonitors([...monitorIds], st.monitorCache);

      const upkeepEdge: Record<string, 'low' | 'restored' | null> = {};
      for (const w of workflows) {
        if (w.trigger !== 'upkeep_low' && w.trigger !== 'upkeep_restored') continue;
        const h = upkeepHoursLeft(w.triggerParams.monitorId, st.monitorCache);
        if (h == null) { upkeepEdge[w.id] = null; continue; }
        const low = h < (w.triggerParams.upkeepHours ?? 24);
        const prev = st.upkeepLow[w.id];
        upkeepEdge[w.id] = prev !== undefined && prev !== low ? (low ? 'low' : 'restored') : null;
        st.upkeepLow[w.id] = low;
      }

      // ── Evaluate every workflow ─────────────────────────────────────────
      for (const w of workflows) {
        if (!w.enabled) continue;
        if (w.serverId && !isCurrentServer(w.serverId)) continue;

        const onCooldown = now - (st.lastRun[w.id] ?? 0) < COOLDOWN_MS;
        if (onCooldown) continue;

        const prim = evaluateTrigger(w.trigger, w, sig, devices, upkeepEdge);
        if (prim.fired) {
          if (w.conditions.every((c) => conditionPasses(c, devices, members, time))) {
            st.lastRun[w.id] = now;
            useWorkflowStore.getState().markFired(w.id, now);
            void runActions(w, prim.ctx, 0, false);
          }
          continue;
        }

        if (w.autoReverse) {
          const rev = REVERSE_TRIGGER[w.trigger];
          if (rev) {
            const r = evaluateTrigger(rev, w, sig, devices, upkeepEdge);
            if (r.fired) {
              st.lastRun[w.id] = now;
              void runActions(w, r.ctx, 0, true);
            }
          }
        }
      }
    };

    const id = setInterval(tick, 1000);
    return () => {
      disposed = true;
      clearInterval(id);
      if (unlisten) unlisten();
    };
  }, []);
}
