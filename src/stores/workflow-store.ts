import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useTeamStore, TeamMember } from './team-store';
import { useMapStore } from './map-store';
import { getCurrentServer } from '../utils/server';

/**
 * WORKFLOWS — a small automation engine: one trigger → optional conditions →
 * an ordered list of actions.
 *
 * Where the Smart-Switch automation store binds a single trigger to a single
 * switch action, a Workflow chains several actions together (toggle switches,
 * post to team chat, ping Discord, wait, or even fire another workflow) and
 * gates the whole chain behind any number of state conditions. The runtime
 * (see useWorkflowRunner) edge-detects each trigger from live app state once a
 * second and executes the action list in order.
 *
 * Triggers:
 *  - day_start / night_start       → in-game sun crosses sunrise / sunset
 *  - custom_time                   → a chosen real-clock HH:MM is reached
 *  - first_teammate_online         → team goes from nobody → at least one online
 *  - all_teammates_offline         → team goes from someone online → nobody
 *  - specific_teammate_online      → a named teammate comes online
 *  - specific_teammate_offline     → a named teammate goes offline
 *  - smart_alarm                   → a Smart Alarm push fires (optional filter)
 *  - switch_state_changed          → a paired switch flips (optional target)
 *  - upkeep_low / upkeep_restored  → a monitored TC's upkeep crosses N hours
 *  - tracked_player_joins / leaves → a tracked (spy) player toggles online
 *  - event_alert                   → a world event marker appears on the map
 */

export type WorkflowTrigger =
  | 'day_start'
  | 'night_start'
  | 'custom_time'
  | 'first_teammate_online'
  | 'all_teammates_offline'
  | 'specific_teammate_online'
  | 'specific_teammate_offline'
  | 'smart_alarm'
  | 'switch_state_changed'
  | 'upkeep_low'
  | 'upkeep_restored'
  | 'tracked_player_joins'
  | 'tracked_player_leaves'
  | 'event_alert';

/**
 * Conditions are gates evaluated against live state when the trigger fires.
 * We deliberately ONLY model state we can actually read from the app — there is
 * no population/queue condition because server population isn't reliably
 * available from the Rust+ API.
 */
export type WorkflowConditionType =
  | 'during_night'
  | 'during_day'
  | 'teammate_online'
  | 'teammate_offline'
  | 'switch_on'
  | 'switch_off';

export type WorkflowActionType =
  | 'toggle_switch'
  | 'team_chat'
  | 'discord'
  | 'wait'
  | 'trigger_workflow';

/** Trigger configuration. Only the fields relevant to a trigger are used. */
export interface WorkflowTriggerParams {
  /** custom_time / in-game hour helpers. */
  gameHour?: number;
  scheduleHour?: number;
  scheduleMinute?: number;
  /** specific_teammate_* — the teammate display name to watch. */
  teammateName?: string;
  /** switch_state_changed — which switch, and the state edge to fire on. */
  switchEntityId?: number;
  switchState?: boolean; // true = fire when it turns ON, false = OFF, undefined = any
  /** smart_alarm — only fire when the alarm title contains this text. */
  alarmFilter?: string;
  /** upkeep_low / upkeep_restored — threshold hours + the monitor to read. */
  upkeepHours?: number;
  monitorId?: number;
}

export interface WorkflowCondition {
  id: string;
  type: WorkflowConditionType;
  /** teammate_online / teammate_offline. */
  teammateName?: string;
  /** switch_on / switch_off. */
  switchEntityId?: number;
}

export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  /** toggle_switch. */
  entityId?: number;
  switchAction?: 'on' | 'off' | 'toggle';
  /** team_chat / discord — supports {variable} tokens. */
  message?: string;
  /** wait — seconds to pause before the next action. */
  seconds?: number;
  /** trigger_workflow — id of another workflow whose actions to run. */
  targetWorkflowId?: string;
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  triggerParams: WorkflowTriggerParams;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  /** For paired triggers, re-run switch toggles inverted on the reverse edge. */
  autoReverse?: boolean;
  serverId?: string;
  serverName?: string;
  createdAt: number;
  lastFired?: number;
  runCount?: number;
}

/** A ready-to-save workflow (before the store assigns an id / timestamp). */
export type WorkflowDraft = Omit<Workflow, 'id' | 'createdAt'>;

interface WorkflowState {
  workflows: Workflow[];
  add: (w: WorkflowDraft) => string;
  remove: (id: string) => void;
  update: (id: string, data: Partial<Workflow>) => void;
  toggleEnabled: (id: string) => void;
  markFired: (id: string, at: number) => void;
  duplicate: (id: string) => void;
}

/** Compact unique id for workflows and their child conditions/actions. */
export function genId(prefix = 'wf'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set) => ({
      workflows: [],
      add: (w) => {
        const id = genId('wf');
        set((s) => ({
          workflows: [...s.workflows, { ...w, id, createdAt: Date.now(), runCount: w.runCount ?? 0 }],
        }));
        return id;
      },
      remove: (id) => set((s) => ({ workflows: s.workflows.filter((x) => x.id !== id) })),
      update: (id, data) => set((s) => ({
        workflows: s.workflows.map((x) => (x.id === id ? { ...x, ...data } : x)),
      })),
      toggleEnabled: (id) => set((s) => ({
        workflows: s.workflows.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)),
      })),
      markFired: (id, at) => set((s) => ({
        workflows: s.workflows.map((x) => (x.id === id ? { ...x, lastFired: at, runCount: (x.runCount ?? 0) + 1 } : x)),
      })),
      duplicate: (id) => set((s) => {
        const src = s.workflows.find((x) => x.id === id);
        if (!src) return s;
        const clone: Workflow = {
          ...src,
          id: genId('wf'),
          name: `${src.name} copy`,
          conditions: src.conditions.map((c) => ({ ...c, id: genId('cond') })),
          actions: src.actions.map((a) => ({ ...a, id: genId('act') })),
          createdAt: Date.now(),
          lastFired: undefined,
          runCount: 0,
        };
        return { workflows: [...s.workflows, clone] };
      }),
    }),
    { name: 'rust-workflows', version: 1 },
  ),
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Message variable resolution                                                */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Context supplied by the runner when a workflow fires, carrying trigger-
 * specific values for {player}, {event}, {grid}, {switch_name}, etc. Everything
 * else ({time}, {online}, {server}, …) is resolved from live stores.
 */
export interface MessageContext {
  player?: string;
  event?: string;
  grid?: string;
  switch_name?: string;
  switch_state?: string;
  alarm_name?: string;
  afk_names?: string;
  upkeep?: string;
  hours?: string | number;
  wipe?: string;
}

/** Format an in-game hour (0-24 float) as HH:MM. */
function formatGameTime(t: number | undefined): string {
  if (t == null) return '';
  const h = Math.floor(t) % 24;
  const m = Math.floor((t - Math.floor(t)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Replace {token} placeholders in a chat / Discord message with live values.
 * Unknown tokens resolve to an empty string so stray braces never leak through.
 *
 * Supported: {time} {online} {offline} {online_names} {offline_names}
 * {team_size} {server} {player} {event} {grid} {switch_name} {switch_state}
 * {alarm_name} {afk_names} {upkeep} {hours} {wipe?}
 */
export function resolveMessageVariables(text: string, ctx: MessageContext = {}): string {
  if (!text) return text;

  let members: TeamMember[] = [];
  try { members = useTeamStore.getState().members; } catch { /* store unavailable */ }
  const online = members.filter((m) => m.status === 'online');
  const offline = members.filter((m) => m.status !== 'online');

  let timeStr = '';
  try { timeStr = formatGameTime(useMapStore.getState().timeInfo?.time); } catch { /* */ }

  let serverName = '';
  try { serverName = getCurrentServer()?.name || ''; } catch { /* not connected */ }

  const map: Record<string, string> = {
    time: timeStr,
    online: String(online.length),
    offline: String(offline.length),
    online_names: online.map((m) => m.name).join(', '),
    offline_names: offline.map((m) => m.name).join(', '),
    team_size: String(members.length),
    server: serverName,
    player: ctx.player ?? '',
    event: ctx.event ?? '',
    grid: ctx.grid ?? '',
    switch_name: ctx.switch_name ?? '',
    switch_state: ctx.switch_state ?? '',
    alarm_name: ctx.alarm_name ?? '',
    afk_names: ctx.afk_names ?? '',
    upkeep: ctx.upkeep ?? '',
    hours: ctx.hours != null ? String(ctx.hours) : '',
    wipe: ctx.wipe ?? '',
    'wipe?': ctx.wipe ?? '',
  };

  return text.replace(/\{([a-z_?]+)\}/gi, (_full, key: string) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : '';
  });
}

/** Every supported message variable, surfaced as chips in the editor. */
export const MESSAGE_VARIABLES: { token: string; label: string }[] = [
  { token: '{time}', label: 'in-game time' },
  { token: '{online}', label: 'online count' },
  { token: '{offline}', label: 'offline count' },
  { token: '{online_names}', label: 'online names' },
  { token: '{offline_names}', label: 'offline names' },
  { token: '{team_size}', label: 'team size' },
  { token: '{server}', label: 'server name' },
  { token: '{player}', label: 'tracked player' },
  { token: '{event}', label: 'world event' },
  { token: '{grid}', label: 'map grid' },
  { token: '{switch_name}', label: 'switch name' },
  { token: '{switch_state}', label: 'switch state' },
  { token: '{alarm_name}', label: 'alarm name' },
  { token: '{afk_names}', label: 'AFK names' },
  { token: '{upkeep}', label: 'upkeep left' },
  { token: '{hours}', label: 'hours' },
  { token: '{wipe?}', label: 'wipe day' },
];

/* ────────────────────────────────────────────────────────────────────────── */
/*  Templates                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  /** Builds a fresh draft each call so child ids never collide. */
  build: () => WorkflowDraft;
}

const baseDraft = (
  name: string,
  trigger: WorkflowTrigger,
  triggerParams: WorkflowTriggerParams,
  actions: Omit<WorkflowAction, 'id'>[],
  opts: { conditions?: Omit<WorkflowCondition, 'id'>[]; autoReverse?: boolean } = {},
): WorkflowDraft => ({
  name,
  enabled: true,
  trigger,
  triggerParams,
  conditions: (opts.conditions ?? []).map((c) => ({ ...c, id: genId('cond') })),
  actions: actions.map((a) => ({ ...a, id: genId('act') })),
  autoReverse: opts.autoReverse,
  runCount: 0,
});

/**
 * Ready-made starting points. Switch ids are intentionally left blank so the
 * user picks the device in the editor after applying the template.
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: 'auto_lights',
    name: 'Auto Lights',
    description: 'Turn base lights on at nightfall and back off at daybreak.',
    build: () => baseDraft(
      'Auto Lights',
      'night_start',
      {},
      [{ type: 'toggle_switch', switchAction: 'on' }],
      { autoReverse: true },
    ),
  },
  {
    key: 'raid_alert',
    name: 'Raid Alert',
    description: 'Smart alarm fires → blast team chat and ping Discord.',
    build: () => baseDraft(
      'Raid Alert',
      'smart_alarm',
      { alarmFilter: '' },
      [
        { type: 'team_chat', message: '🚨 RAID ALERT — {alarm_name}! {online} online to defend.' },
        { type: 'discord', message: '🚨 **Raid Alert** — {alarm_name} tripped on {server}. {online} online.' },
      ],
    ),
  },
  {
    key: 'alarm_flood_lights',
    name: 'Alarm → Flood Lights',
    description: 'Base alarm trips → flick the flood lights on so you can see attackers.',
    build: () => baseDraft(
      'Alarm Flood Lights',
      'smart_alarm',
      { alarmFilter: '' },
      [{ type: 'toggle_switch', switchAction: 'on' }],
    ),
  },
  {
    key: 'low_upkeep_notify',
    name: 'Low Upkeep → Notify Me',
    description: 'TC upkeep drops below 24h → warn the team and ping Discord.',
    build: () => baseDraft(
      'Low Upkeep Notify',
      'upkeep_low',
      { upkeepHours: 24 },
      [
        { type: 'team_chat', message: '⚠️ Upkeep low — {upkeep} left. Top up the TC!' },
        { type: 'discord', message: '⚠️ **Upkeep Low** on {server} — {upkeep} remaining. Restock the TC.' },
      ],
    ),
  },
  {
    key: 'player_tracking',
    name: 'Player Tracking Alert',
    description: 'A tracked player comes online → notify the team and Discord.',
    build: () => baseDraft(
      'Player Tracking Alert',
      'tracked_player_joins',
      {},
      [
        { type: 'team_chat', message: '👀 {player} just came online.' },
        { type: 'discord', message: '👀 **Player Online** — {player} joined {server}.' },
      ],
    ),
  },
  {
    key: 'afk_guardian',
    name: 'AFK Guardian',
    description: 'Everyone goes offline → arm defenses; disarm when someone returns.',
    build: () => baseDraft(
      'AFK Guardian',
      'all_teammates_offline',
      {},
      [
        { type: 'toggle_switch', switchAction: 'on' },
        { type: 'discord', message: '🛡️ **AFK Guardian** — base armed, all teammates offline on {server}.' },
      ],
      { autoReverse: true },
    ),
  },
  {
    key: 'event_alert',
    name: 'Event Alert',
    description: 'A world event appears → call it out in team chat with the grid.',
    build: () => baseDraft(
      'Event Alert',
      'event_alert',
      {},
      [
        { type: 'team_chat', message: '🌍 {event} spotted at {grid}!' },
      ],
    ),
  },
];

/* ────────────────────────────────────────────────────────────────────────── */
/*  Human-readable descriptions (shared by panel summaries)                    */
/* ────────────────────────────────────────────────────────────────────────── */

export function describeWorkflowTrigger(w: Pick<Workflow, 'trigger' | 'triggerParams'>): string {
  const p = w.triggerParams || {};
  switch (w.trigger) {
    case 'day_start': return 'At daybreak';
    case 'night_start': return 'At nightfall';
    case 'custom_time': return `At ${String(p.scheduleHour ?? 0).padStart(2, '0')}:${String(p.scheduleMinute ?? 0).padStart(2, '0')}`;
    case 'first_teammate_online': return 'When the first teammate comes online';
    case 'all_teammates_offline': return 'When all teammates go offline';
    case 'specific_teammate_online': return `When ${p.teammateName || 'a teammate'} comes online`;
    case 'specific_teammate_offline': return `When ${p.teammateName || 'a teammate'} goes offline`;
    case 'smart_alarm': return p.alarmFilter ? `On smart alarm "${p.alarmFilter}"` : 'On any smart alarm';
    case 'switch_state_changed': {
      const edge = p.switchState === true ? 'turns ON' : p.switchState === false ? 'turns OFF' : 'changes';
      return `When a switch ${edge}`;
    }
    case 'upkeep_low': return `When upkeep drops below ${p.upkeepHours ?? 24}h`;
    case 'upkeep_restored': return `When upkeep recovers above ${p.upkeepHours ?? 24}h`;
    case 'tracked_player_joins': return 'When a tracked player comes online';
    case 'tracked_player_leaves': return 'When a tracked player goes offline';
    case 'event_alert': return 'When a world event appears';
    default: return w.trigger;
  }
}

export function describeWorkflowAction(a: WorkflowAction): string {
  switch (a.type) {
    case 'toggle_switch': return `Switch ${a.switchAction ?? 'toggle'}`;
    case 'team_chat': return 'Team chat';
    case 'discord': return 'Discord';
    case 'wait': return `Wait ${a.seconds ?? 0}s`;
    case 'trigger_workflow': return 'Run rule';
    default: return a.type;
  }
}
