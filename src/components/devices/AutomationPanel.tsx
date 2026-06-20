import { useMemo, useState } from 'react';
import {
  useAutomationStore, Automation, AutomationTrigger, AutomationAction, ConditionType,
  describeTrigger, describeAction, describeCondition,
} from '@/stores/automation-store';
import { useDeviceStore } from '@/stores/device-store';
import { getCurrentServer, isCurrentServer } from '@/utils/server';
import { getItemName, getItemIconUrl } from '@/utils/items';
import {
  Plus, Trash2, Zap, Power, X, ToggleLeft, ToggleRight, Repeat,
  Moon, Sun, Clock, Timer, Bot, Ship, Anchor, Package, Box,
  Flame, Plane, Waves, Store, ChevronRight, Lightbulb, Bell,
  ShieldAlert, PackageOpen, Boxes, Filter,
} from 'lucide-react';
import './AutomationPanel.css';

type IconType = typeof Zap;

interface TriggerDef {
  key: AutomationTrigger;
  label: string;
  desc: string;
  Icon: IconType;
}
interface TriggerGroup {
  label: string;
  triggers: TriggerDef[];
}

const TRIGGER_GROUPS: TriggerGroup[] = [
  {
    label: 'In-game time',
    triggers: [
      { key: 'nightfall', label: 'Nightfall', desc: 'When the sun sets', Icon: Moon },
      { key: 'daybreak', label: 'Daybreak', desc: 'When the sun rises', Icon: Sun },
      { key: 'game_time', label: 'Specific hour', desc: 'At a chosen in-game hour', Icon: Clock },
    ],
  },
  {
    label: 'Schedule',
    triggers: [
      { key: 'interval', label: 'Repeat interval', desc: 'Every N seconds / minutes / hours', Icon: Timer },
    ],
  },
  {
    label: 'Base & storage',
    triggers: [
      { key: 'upkeep_below', label: 'Upkeep running low', desc: 'TC upkeep drops below N hours left', Icon: ShieldAlert },
      { key: 'item_below', label: 'Item running low', desc: 'A box/TC holds fewer than N of an item', Icon: PackageOpen },
      { key: 'item_above', label: 'Item stocked up', desc: 'A box/TC holds more than N of an item', Icon: Boxes },
    ],
  },
  {
    label: 'World events',
    triggers: [
      { key: 'cargo_spawn', label: 'Cargo spawns', desc: 'Cargo ship appears on the map', Icon: Ship },
      { key: 'cargo_departed', label: 'Cargo leaves', desc: 'Cargo ship sails off the map', Icon: Anchor },
      { key: 'patrol_heli_spawn', label: 'Patrol heli spawns', desc: 'The patrol helicopter arrives', Icon: Plane },
      { key: 'heli_crash', label: 'Heli crashes', desc: 'A patrol heli is downed', Icon: Flame },
      { key: 'chinook_spawn', label: 'Chinook (CH47)', desc: 'A Chinook enters the map', Icon: Plane },
      { key: 'crate_spawn', label: 'Locked crate', desc: 'A locked crate spawns', Icon: Package },
      { key: 'oil_crate_triggered', label: 'Oil rig hacked', desc: 'An oil rig crate is triggered', Icon: Box },
      { key: 'oil_crate_unlocked', label: 'Oil rig unlocked', desc: 'An oil rig crate finishes', Icon: Box },
      { key: 'vendor_spawn', label: 'Travelling vendor', desc: 'The travelling vendor appears', Icon: Store },
      { key: 'deep_sea', label: 'Deep Sea opens', desc: 'The Deep Sea event begins', Icon: Waves },
    ],
  },
  {
    label: 'Base alerts',
    triggers: [
      { key: 'smart_alarm', label: 'Smart alarm', desc: 'A Smart Alarm push fires (raid alert)', Icon: Bell },
    ],
  },
];

const TRIGGER_BY_KEY: Record<string, TriggerDef> = Object.fromEntries(
  TRIGGER_GROUPS.flatMap((g) => g.triggers).map((t) => [t.key, t]),
);

const isMonitorTrigger = (t: AutomationTrigger) => t === 'upkeep_below' || t === 'item_below' || t === 'item_above';
const isItemTrigger = (t: AutomationTrigger) => t === 'item_below' || t === 'item_above';

const ACTIONS: { key: AutomationAction; label: string; Icon: IconType }[] = [
  { key: 'on', label: 'Turn ON', Icon: ToggleRight },
  { key: 'off', label: 'Turn OFF', Icon: ToggleLeft },
  { key: 'toggle', label: 'Toggle', Icon: Repeat },
  { key: 'pulse', label: 'Pulse', Icon: Zap },
];

/** Common base/raid resources for the item picker, keyed by Rust item id. */
const COMMON_ITEMS: { id: number; name: string }[] = [
  { id: -151838493, name: 'Wood' },
  { id: -2099697608, name: 'Stones' },
  { id: 69511070, name: 'Metal Fragments' },
  { id: 317398316, name: 'High Quality Metal' },
  { id: -1581843485, name: 'Sulfur' },
  { id: -1938052175, name: 'Charcoal' },
  { id: -265876753, name: 'Gunpowder' },
  { id: -946369541, name: 'Low Grade Fuel' },
  { id: -932201673, name: 'Scrap' },
  { id: -858312878, name: 'Cloth' },
];

const COND_OPTIONS: { key: ConditionType; label: string }[] = [
  { key: 'none', label: 'Always (no condition)' },
  { key: 'upkeep_below', label: 'Only if upkeep is below…' },
  { key: 'upkeep_above', label: 'Only if upkeep is above…' },
  { key: 'item_below', label: 'Only if item count is below…' },
  { key: 'item_above', label: 'Only if item count is above…' },
];

/** Quick-start presets: common real-world setups, one tap to prefill the form. */
interface Preset {
  label: string;
  hint: string;
  Icon: IconType;
  trigger: AutomationTrigger;
  action: AutomationAction;
  gameHour?: number;
  pulseSeconds?: number;
  upkeepHours?: number;
}
const PRESETS: Preset[] = [
  { label: 'Base lights at night', hint: 'Lights ON at nightfall', Icon: Lightbulb, trigger: 'nightfall', action: 'on' },
  { label: 'Lights off at dawn', hint: 'Lights OFF at daybreak', Icon: Sun, trigger: 'daybreak', action: 'off' },
  { label: 'Low upkeep warning', hint: 'Light ON under 12h upkeep', Icon: ShieldAlert, trigger: 'upkeep_below', action: 'on', upkeepHours: 12 },
  { label: 'Raid alarm siren', hint: 'Siren pulse 30s on alarm', Icon: Bell, trigger: 'smart_alarm', action: 'pulse', pulseSeconds: 30 },
  { label: 'Furnace auto-off', hint: 'OFF when wood runs low', Icon: PackageOpen, trigger: 'item_below', action: 'off' },
  { label: 'Heli alert beacon', hint: 'Beacon pulse 15s on heli', Icon: Plane, trigger: 'patrol_heli_spawn', action: 'pulse', pulseSeconds: 15 },
];

export function AutomationPanel() {
  const automations = useAutomationStore((s) => s.automations);
  const add = useAutomationStore((s) => s.add);
  const remove = useAutomationStore((s) => s.remove);
  const toggleEnabled = useAutomationStore((s) => s.toggleEnabled);
  const devicesObj = useDeviceStore((s) => s.devices);

  // Switches on the connected server are the only ones we can automate.
  const switches = useMemo(
    () => Object.values(devicesObj).filter((d) => Number(d.entityType) === 1 && isCurrentServer(d.serverId)),
    [devicesObj],
  );
  // Paired Smart Alarms — used to offer named choices for the alarm filter.
  const alarms = useMemo(
    () => Object.values(devicesObj).filter((d) => Number(d.entityType) === 2 && isCurrentServer(d.serverId)),
    [devicesObj],
  );
  // Paired Storage Monitors (TCs / boxes) — supply upkeep & item data.
  const monitors = useMemo(
    () => Object.values(devicesObj).filter((d) => Number(d.entityType) === 3 && isCurrentServer(d.serverId)),
    [devicesObj],
  );

  const [showForm, setShowForm] = useState(false);
  const [entityId, setEntityId] = useState<number | null>(null);
  const [trigger, setTrigger] = useState<AutomationTrigger>('nightfall');
  const [action, setAction] = useState<AutomationAction>('on');
  const [intervalValue, setIntervalValue] = useState(5);
  const [intervalUnit, setIntervalUnit] = useState<'s' | 'm' | 'h'>('m');
  const [gameHour, setGameHour] = useState(20);
  const [pulseSeconds, setPulseSeconds] = useState(10);
  const [alarmFilter, setAlarmFilter] = useState('');
  // Storage-monitor trigger params.
  const [monitorId, setMonitorId] = useState<number | null>(null);
  const [upkeepHours, setUpkeepHours] = useState(12);
  const [itemId, setItemId] = useState<number>(COMMON_ITEMS[0].id);
  const [itemQty, setItemQty] = useState(1000);
  // Optional condition gate.
  const [condition, setCondition] = useState<ConditionType>('none');
  const [condUpkeepHours, setCondUpkeepHours] = useState(12);
  const [condItemId, setCondItemId] = useState<number>(COMMON_ITEMS[0].id);
  const [condItemQty, setCondItemQty] = useState(1000);

  const srv = getCurrentServer();

  const openForm = () => {
    if (switches.length === 1) setEntityId(switches[0].entityId);
    if (monitors.length >= 1) setMonitorId((m) => m ?? monitors[0].entityId);
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEntityId(null);
    setTrigger('nightfall');
    setAction('on');
    setAlarmFilter('');
    setCondition('none');
  };

  const applyPreset = (p: Preset) => {
    setTrigger(p.trigger);
    setAction(p.action);
    if (p.gameHour != null) setGameHour(p.gameHour);
    if (p.pulseSeconds != null) setPulseSeconds(p.pulseSeconds);
    if (p.upkeepHours != null) setUpkeepHours(p.upkeepHours);
    if (switches.length === 1) setEntityId(switches[0].entityId);
    if (isMonitorTrigger(p.trigger) && monitors.length >= 1) setMonitorId((m) => m ?? monitors[0].entityId);
    setShowForm(true);
  };

  const monitorTriggerValid = !isMonitorTrigger(trigger) || monitorId != null;
  const condValid = condition === 'none' || monitorId != null;
  const canCreate = entityId != null && monitorTriggerValid && condValid;

  const submit = () => {
    if (!canCreate || entityId == null) return;
    const dev = devicesObj[entityId];
    const intervalSeconds = intervalUnit === 's' ? intervalValue : intervalUnit === 'm' ? intervalValue * 60 : intervalValue * 3600;
    const needsMonitor = isMonitorTrigger(trigger) || condition !== 'none';
    add({
      enabled: true,
      entityId,
      entityName: dev?.customName || dev?.entityName || `Switch ${entityId}`,
      trigger,
      action,
      intervalSeconds: trigger === 'interval' ? Math.max(5, intervalSeconds) : undefined,
      gameHour: trigger === 'game_time' ? gameHour : undefined,
      pulseSeconds: action === 'pulse' ? Math.max(1, pulseSeconds) : undefined,
      alarmFilter: trigger === 'smart_alarm' && alarmFilter.trim() ? alarmFilter.trim() : undefined,
      monitorId: needsMonitor && monitorId != null ? monitorId : undefined,
      upkeepHours: trigger === 'upkeep_below' ? Math.max(1, upkeepHours) : undefined,
      itemId: isItemTrigger(trigger) ? itemId : undefined,
      itemName: isItemTrigger(trigger) ? getItemName(itemId) : undefined,
      itemQty: isItemTrigger(trigger) ? Math.max(0, itemQty) : undefined,
      condition: condition !== 'none' ? condition : undefined,
      condUpkeepHours: condition === 'upkeep_below' || condition === 'upkeep_above' ? Math.max(1, condUpkeepHours) : undefined,
      condItemId: condition === 'item_below' || condition === 'item_above' ? condItemId : undefined,
      condItemName: condition === 'item_below' || condition === 'item_above' ? getItemName(condItemId) : undefined,
      condItemQty: condition === 'item_below' || condition === 'item_above' ? Math.max(0, condItemQty) : undefined,
      serverId: srv?.id,
      serverName: srv?.name,
    });
    resetForm();
  };

  const mine = automations.filter((a) => !a.serverId || isCurrentServer(a.serverId));
  const activeCount = mine.filter((a) => a.enabled).length;

  // Live preview of the rule being built.
  const previewName = entityId != null ? (devicesObj[entityId]?.customName || devicesObj[entityId]?.entityName || `Switch ${entityId}`) : 'a switch';
  const previewTrigger = describeTrigger({
    trigger, gameHour, alarmFilter, upkeepHours, itemName: getItemName(itemId), itemQty,
    intervalSeconds: intervalUnit === 's' ? intervalValue : intervalUnit === 'm' ? intervalValue * 60 : intervalValue * 3600,
  } as Automation);
  const previewAction = describeAction({ action, pulseSeconds } as Automation);
  const previewCond = condition !== 'none'
    ? describeCondition({ condition, condUpkeepHours, condItemName: getItemName(condItemId), condItemQty } as Automation)
    : null;

  const itemIcon = (id: number) => getItemIconUrl(id) || '';

  return (
    <div className="automation-section">
      <div className="automation-head">
        <h3><Zap size={14} /> SWITCH AUTOMATIONS</h3>
        <div className="automation-head-right">
          {mine.length > 0 && (
            <span className="auto-count">{activeCount} active{mine.length > activeCount ? ` · ${mine.length - activeCount} off` : ''}</span>
          )}
          {switches.length > 0 && !showForm && (
            <button className="auto-add-btn" onClick={openForm}>
              <Plus size={13} /> New
            </button>
          )}
        </div>
      </div>

      {switches.length === 0 && (
        <div className="auto-empty">
          <Power size={20} />
          <p>Pair a <b>Smart Switch</b> on this server to start programming automations — turn lights, alarms, turrets or doors on automatically. Pair a <b>Storage Monitor</b> too to react to upkeep and item counts.</p>
        </div>
      )}

      {/* Quick-start presets */}
      {switches.length > 0 && !showForm && mine.length === 0 && (
        <div className="auto-presets">
          <span className="auto-presets-label">QUICK START</span>
          <div className="auto-presets-grid">
            {PRESETS.map((p) => (
              <button key={p.label} className="auto-preset" onClick={() => applyPreset(p)}>
                <p.Icon size={15} />
                <span className="auto-preset-label">{p.label}</span>
                <span className="auto-preset-hint">{p.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showForm && switches.length > 0 && (
        <div className="auto-form">
          <div className="auto-form-head">
            <span>New automation</span>
            <button className="auto-form-close" onClick={resetForm} aria-label="Close"><X size={14} /></button>
          </div>

          {/* Step 1 — Switch */}
          <div className="auto-step">
            <span className="auto-step-num">1</span>
            <label className="auto-label">CONTROL WHICH SWITCH</label>
          </div>
          <div className="auto-select-wrap">
            <select className="auto-select" value={entityId ?? ''} onChange={(e) => setEntityId(Number(e.target.value) || null)}>
              <option value="">Select a switch…</option>
              {switches.map((s) => (
                <option key={s.entityId} value={s.entityId}>{s.customName || s.entityName} (#{s.entityId})</option>
              ))}
            </select>
            <ChevronRight size={14} className="auto-select-chev" />
          </div>

          {/* Step 2 — Trigger */}
          <div className="auto-step">
            <span className="auto-step-num">2</span>
            <label className="auto-label">WHEN THIS HAPPENS</label>
          </div>
          <div className="auto-select-wrap">
            <select className="auto-select" value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationTrigger)}>
              {TRIGGER_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.triggers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </optgroup>
              ))}
            </select>
            <ChevronRight size={14} className="auto-select-chev" />
          </div>
          {TRIGGER_BY_KEY[trigger] && (
            <span className="auto-trigger-desc">{TRIGGER_BY_KEY[trigger].desc}</span>
          )}

          {trigger === 'interval' && (
            <div className="auto-row">
              <input className="auto-num" type="number" min={1} value={intervalValue}
                onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))} />
              <div className="auto-select-wrap auto-unit">
                <select className="auto-select" value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as any)}>
                  <option value="s">seconds</option>
                  <option value="m">minutes</option>
                  <option value="h">hours</option>
                </select>
                <ChevronRight size={14} className="auto-select-chev" />
              </div>
            </div>
          )}

          {trigger === 'game_time' && (
            <div className="auto-row">
              <input className="auto-num" type="number" min={0} max={23} value={gameHour}
                onChange={(e) => setGameHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))} />
              <span className="auto-suffix">:00 in-game hour (0–23)</span>
            </div>
          )}

          {/* Storage monitor selector + params */}
          {isMonitorTrigger(trigger) && (
            <div className="auto-monitor-block">
              {monitors.length === 0 ? (
                <span className="auto-warn"><ShieldAlert size={13} /> Pair a Storage Monitor on a TC or box to use this trigger.</span>
              ) : (
                <>
                  <div className="auto-select-wrap">
                    <select className="auto-select" value={monitorId ?? ''} onChange={(e) => setMonitorId(Number(e.target.value) || null)}>
                      <option value="">Select a storage monitor…</option>
                      {monitors.map((m) => (
                        <option key={m.entityId} value={m.entityId}>{m.customName || m.entityName} (#{m.entityId})</option>
                      ))}
                    </select>
                    <ChevronRight size={14} className="auto-select-chev" />
                  </div>

                  {trigger === 'upkeep_below' && (
                    <div className="auto-row">
                      <input className="auto-num" type="number" min={1} value={upkeepHours}
                        onChange={(e) => setUpkeepHours(Math.max(1, parseInt(e.target.value) || 1))} />
                      <span className="auto-suffix">hours of upkeep remaining</span>
                    </div>
                  )}

                  {isItemTrigger(trigger) && (
                    <div className="auto-row auto-row-item">
                      <div className="auto-select-wrap auto-item-select">
                        {itemIcon(itemId) && <img className="auto-item-icon" src={itemIcon(itemId)} alt="" />}
                        <select className="auto-select has-icon" value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
                          {COMMON_ITEMS.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                        <ChevronRight size={14} className="auto-select-chev" />
                      </div>
                      <input className="auto-num" type="number" min={0} value={itemQty}
                        onChange={(e) => setItemQty(Math.max(0, parseInt(e.target.value) || 0))} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {trigger === 'smart_alarm' && (
            <div className="auto-alarm-filter">
              {alarms.length > 0 ? (
                <div className="auto-select-wrap">
                  <select className="auto-select" value={alarmFilter} onChange={(e) => setAlarmFilter(e.target.value)}>
                    <option value="">Any Smart Alarm</option>
                    {alarms.map((al) => (
                      <option key={al.entityId} value={al.customName || al.entityName}>{al.customName || al.entityName}</option>
                    ))}
                  </select>
                  <ChevronRight size={14} className="auto-select-chev" />
                </div>
              ) : (
                <input className="auto-text" type="text" placeholder="Match alarm title (blank = any)"
                  value={alarmFilter} onChange={(e) => setAlarmFilter(e.target.value)} />
              )}
              <span className="auto-suffix">Leave on "Any" to react to every alarm push.</span>
            </div>
          )}

          {/* Step 3 — Action */}
          <div className="auto-step">
            <span className="auto-step-num">3</span>
            <label className="auto-label">DO THIS</label>
          </div>
          <div className="auto-action-grid">
            {ACTIONS.map((a) => (
              <button key={a.key} className={`auto-action-btn ${action === a.key ? 'active' : ''}`} onClick={() => setAction(a.key)}>
                <a.Icon size={14} /> {a.label}
              </button>
            ))}
          </div>

          {action === 'pulse' && (
            <div className="auto-row">
              <input className="auto-num" type="number" min={1} value={pulseSeconds}
                onChange={(e) => setPulseSeconds(Math.max(1, parseInt(e.target.value) || 1))} />
              <span className="auto-suffix">seconds ON, then auto-OFF</span>
            </div>
          )}

          {/* Optional condition gate */}
          <div className="auto-step">
            <span className="auto-step-num"><Filter size={11} /></span>
            <label className="auto-label">ONLY IF (OPTIONAL)</label>
          </div>
          <div className="auto-select-wrap">
            <select className="auto-select" value={condition} onChange={(e) => setCondition(e.target.value as ConditionType)}>
              {COND_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <ChevronRight size={14} className="auto-select-chev" />
          </div>

          {condition !== 'none' && (
            <div className="auto-monitor-block">
              {monitors.length === 0 ? (
                <span className="auto-warn"><ShieldAlert size={13} /> Pair a Storage Monitor to use a condition.</span>
              ) : (
                <>
                  {/* Reuse the same monitor unless a monitor trigger already set one */}
                  {!isMonitorTrigger(trigger) && (
                    <div className="auto-select-wrap">
                      <select className="auto-select" value={monitorId ?? ''} onChange={(e) => setMonitorId(Number(e.target.value) || null)}>
                        <option value="">Read from which monitor…</option>
                        {monitors.map((m) => (
                          <option key={m.entityId} value={m.entityId}>{m.customName || m.entityName} (#{m.entityId})</option>
                        ))}
                      </select>
                      <ChevronRight size={14} className="auto-select-chev" />
                    </div>
                  )}

                  {(condition === 'upkeep_below' || condition === 'upkeep_above') && (
                    <div className="auto-row">
                      <input className="auto-num" type="number" min={1} value={condUpkeepHours}
                        onChange={(e) => setCondUpkeepHours(Math.max(1, parseInt(e.target.value) || 1))} />
                      <span className="auto-suffix">hours of upkeep</span>
                    </div>
                  )}

                  {(condition === 'item_below' || condition === 'item_above') && (
                    <div className="auto-row auto-row-item">
                      <div className="auto-select-wrap auto-item-select">
                        {itemIcon(condItemId) && <img className="auto-item-icon" src={itemIcon(condItemId)} alt="" />}
                        <select className="auto-select has-icon" value={condItemId} onChange={(e) => setCondItemId(Number(e.target.value))}>
                          {COMMON_ITEMS.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                        <ChevronRight size={14} className="auto-select-chev" />
                      </div>
                      <input className="auto-num" type="number" min={0} value={condItemQty}
                        onChange={(e) => setCondItemQty(Math.max(0, parseInt(e.target.value) || 0))} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Live preview */}
          <div className="auto-preview">
            <span className="auto-preview-label">PREVIEW</span>
            <p>
              <b>{previewName}</b> will <b>{previewAction}</b> <span className="auto-preview-when">{previewTrigger.toLowerCase()}</span>
              {previewCond ? <> — <span className="auto-preview-cond">only if {previewCond}</span></> : null}.
            </p>
          </div>

          <div className="auto-form-actions">
            <button className="auto-cancel" onClick={resetForm}>Cancel</button>
            <button className="auto-save" onClick={submit} disabled={!canCreate}>
              <Plus size={13} /> Create automation
            </button>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="auto-list">
          {mine.map((a: Automation) => {
            const Icon = TRIGGER_BY_KEY[a.trigger]?.Icon || Bot;
            const cond = describeCondition(a);
            return (
              <div key={a.id} className={`auto-card ${a.enabled ? '' : 'is-disabled'}`}>
                <span className="auto-card-icon"><Icon size={15} /></span>
                <div className="auto-card-body">
                  <span className="auto-card-name">{a.entityName}</span>
                  <span className="auto-card-rule">
                    {describeTrigger(a)} <ChevronRight size={10} /> {describeAction(a)}
                  </span>
                  {cond && <span className="auto-card-cond"><Filter size={9} /> only if {cond}</span>}
                </div>
                <button className={`auto-power ${a.enabled ? 'on' : 'off'}`} title={a.enabled ? 'Enabled — click to pause' : 'Paused — click to enable'}
                  onClick={() => toggleEnabled(a.id)}>
                  <Power size={13} />
                </button>
                <button className="auto-del" onClick={() => remove(a.id)} title="Delete"><Trash2 size={13} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
