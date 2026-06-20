import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Smart Switch automation.
 *
 * Each automation binds ONE trigger to an action on ONE switch entity. The
 * runtime (see useAutomationRunner) evaluates triggers each tick and toggles
 * the bound switch via the Rust+ set_entity_value command.
 *
 * Triggers:
 *  - nightfall / daybreak  → in-game sun crossing sunset/sunrise
 *  - game_time             → a specific in-game hour (0-24)
 *  - interval              → every N seconds (real time)
 *  - oil_crate_triggered   → an oil rig locked crate hack started
 *  - oil_crate_unlocked    → an oil rig locked crate finished unlocking
 *  - heli_crash            → a patrol heli crashed
 *  - patrol_heli_spawn     → patrol heli appeared on the map
 *  - chinook_spawn         → a Chinook (CH47) appeared
 *  - cargo_spawn           → cargo ship appeared
 *  - cargo_departed        → cargo ship left the map
 *  - crate_spawn           → a locked crate appeared
 *  - vendor_spawn          → travelling vendor appeared
 *  - deep_sea              → Deep Sea event opened
 *  - smart_alarm           → a Smart Alarm push fired (optional title filter)
 *  - upkeep_below          → a TC's upkeep drops below N hours remaining
 *  - item_below            → a monitored box/TC holds fewer than N of an item
 *  - item_above            → a monitored box/TC holds more than N of an item
 *
 * Any trigger can also carry an optional `condition` gate (e.g. only fire the
 * alarm-siren if upkeep is also low) so rules can combine an event with state.
 *
 * Actions: 'on' | 'off' | 'toggle' | 'pulse' (on for `pulseSeconds`, then off).
 */

export type AutomationTrigger =
  | 'nightfall'
  | 'daybreak'
  | 'game_time'
  | 'interval'
  | 'oil_crate_triggered'
  | 'oil_crate_unlocked'
  | 'heli_crash'
  | 'patrol_heli_spawn'
  | 'chinook_spawn'
  | 'cargo_spawn'
  | 'cargo_departed'
  | 'crate_spawn'
  | 'vendor_spawn'
  | 'deep_sea'
  | 'smart_alarm'
  | 'upkeep_below'
  | 'item_below'
  | 'item_above';

export type AutomationAction = 'on' | 'off' | 'toggle' | 'pulse';

/** Optional gate evaluated alongside the trigger — the action only runs if it passes. */
export type ConditionType = 'none' | 'upkeep_below' | 'upkeep_above' | 'item_below' | 'item_above';

export interface Automation {
  id: string;
  enabled: boolean;
  entityId: number;        // switch entity to control
  entityName: string;      // cached display name
  trigger: AutomationTrigger;
  action: AutomationAction;
  /** interval trigger: seconds between fires (real time). */
  intervalSeconds?: number;
  /** game_time trigger: in-game hour 0-24 to fire at. */
  gameHour?: number;
  /** smart_alarm trigger: only fire if the alarm title contains this text (blank = any alarm). */
  alarmFilter?: string;
  /** pulse action: seconds to stay ON before auto-OFF. */
  pulseSeconds?: number;
  /** Storage monitor entity that supplies upkeep / item data for monitor triggers & conditions. */
  monitorId?: number;
  /** upkeep_below trigger / condition: hours of upkeep remaining threshold. */
  upkeepHours?: number;
  /** item_below / item_above trigger & condition: the item id to count. */
  itemId?: number;
  /** item_below / item_above: cached display name of the chosen item. */
  itemName?: string;
  /** item_below / item_above: quantity threshold. */
  itemQty?: number;
  /** Optional secondary gate that must also pass for the action to run. */
  condition?: ConditionType;
  /** Condition params (mirror the trigger param fields, used when condition != none). */
  condUpkeepHours?: number;
  condItemId?: number;
  condItemName?: string;
  condItemQty?: number;
  /** Which server this automation belongs to (ip:port). */
  serverId?: string;
  serverName?: string;
  createdAt: number;
  lastFired?: number;
}

interface AutomationState {
  automations: Automation[];
  add: (a: Omit<Automation, 'id' | 'createdAt'>) => void;
  remove: (id: string) => void;
  update: (id: string, data: Partial<Automation>) => void;
  toggleEnabled: (id: string) => void;
  markFired: (id: string, at: number) => void;
}

export const useAutomationStore = create<AutomationState>()(
  persist(
    (set) => ({
      automations: [],
      add: (a) => set((s) => ({
        automations: [
          ...s.automations,
          { ...a, id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() },
        ],
      })),
      remove: (id) => set((s) => ({ automations: s.automations.filter((x) => x.id !== id) })),
      update: (id, data) => set((s) => ({
        automations: s.automations.map((x) => (x.id === id ? { ...x, ...data } : x)),
      })),
      toggleEnabled: (id) => set((s) => ({
        automations: s.automations.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)),
      })),
      markFired: (id, at) => set((s) => ({
        automations: s.automations.map((x) => (x.id === id ? { ...x, lastFired: at } : x)),
      })),
    }),
    { name: 'rust-automations', version: 1 },
  ),
);

/** Human-readable description of an automation's trigger. */
export function describeTrigger(a: Automation): string {
  switch (a.trigger) {
    case 'nightfall': return 'At nightfall';
    case 'daybreak': return 'At daybreak';
    case 'game_time': return `At ${String(a.gameHour ?? 0).padStart(2, '0')}:00 in-game`;
    case 'interval': {
      const s = a.intervalSeconds || 0;
      if (s >= 3600) return `Every ${(s / 3600).toFixed(s % 3600 === 0 ? 0 : 1)}h`;
      if (s >= 60) return `Every ${(s / 60).toFixed(s % 60 === 0 ? 0 : 1)}m`;
      return `Every ${s}s`;
    }
    case 'oil_crate_triggered': return 'When an oil rig crate is triggered';
    case 'oil_crate_unlocked': return 'When an oil rig crate unlocks';
    case 'heli_crash': return 'When a patrol heli crashes';
    case 'patrol_heli_spawn': return 'When the patrol heli spawns';
    case 'chinook_spawn': return 'When a Chinook (CH47) spawns';
    case 'cargo_spawn': return 'When cargo ship spawns';
    case 'cargo_departed': return 'When cargo ship leaves';
    case 'crate_spawn': return 'When a locked crate spawns';
    case 'vendor_spawn': return 'When the travelling vendor appears';
    case 'deep_sea': return 'When the Deep Sea event opens';
    case 'smart_alarm': return a.alarmFilter ? `On smart alarm "${a.alarmFilter}"` : 'On any smart alarm';
    case 'upkeep_below': return `When upkeep drops below ${a.upkeepHours ?? 24}h`;
    case 'item_below': return `When ${a.itemName || 'item'} drops below ${a.itemQty ?? 0}`;
    case 'item_above': return `When ${a.itemName || 'item'} rises above ${a.itemQty ?? 0}`;
    default: return a.trigger;
  }
}

/** Human-readable description of an automation's optional gate condition. */
export function describeCondition(a: Automation): string | null {
  switch (a.condition) {
    case 'upkeep_below': return `upkeep under ${a.condUpkeepHours ?? 24}h`;
    case 'upkeep_above': return `upkeep over ${a.condUpkeepHours ?? 24}h`;
    case 'item_below': return `${a.condItemName || 'item'} under ${a.condItemQty ?? 0}`;
    case 'item_above': return `${a.condItemName || 'item'} over ${a.condItemQty ?? 0}`;
    default: return null;
  }
}

/** Human-readable description of the action. */
export function describeAction(a: Automation): string {
  switch (a.action) {
    case 'on': return 'turn ON';
    case 'off': return 'turn OFF';
    case 'toggle': return 'toggle';
    case 'pulse': return `pulse ${a.pulseSeconds || 5}s`;
    default: return a.action;
  }
}
