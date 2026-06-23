import { useMemo, useRef, useState } from 'react';
import {
  useWorkflowStore, Workflow, WorkflowDraft, WorkflowTrigger, WorkflowConditionType,
  WorkflowActionType, WorkflowCondition, WorkflowAction, WorkflowTriggerParams,
  WORKFLOW_TEMPLATES, MESSAGE_VARIABLES, genId,
  describeWorkflowTrigger, describeWorkflowAction,
} from '@/stores/workflow-store';
import { useDeviceStore } from '@/stores/device-store';
import { useTeamStore } from '@/stores/team-store';
import { getCurrentServer, isCurrentServer } from '@/utils/server';
import {
  Workflow as WorkflowIcon, Plus, Trash2, Copy, Pencil, X, Power, ChevronRight,
  ChevronUp, ChevronDown, Zap, MessageSquare, Send, Timer, GitBranch, Filter,
  Repeat, Sparkles, Clock, Moon, Sun, Users, Bell, ToggleRight, ShieldAlert, Radio, Globe,
} from 'lucide-react';
import './WorkflowsPanel.css';

type IconType = typeof Zap;

interface TriggerDef { key: WorkflowTrigger; label: string; desc: string; Icon: IconType; }
interface TriggerGroup { label: string; triggers: TriggerDef[]; }

const TRIGGER_GROUPS: TriggerGroup[] = [
  {
    label: 'Time',
    triggers: [
      { key: 'night_start', label: 'Nightfall', desc: 'When the sun sets', Icon: Moon },
      { key: 'day_start', label: 'Daybreak', desc: 'When the sun rises', Icon: Sun },
      { key: 'custom_time', label: 'Scheduled time', desc: 'At a chosen clock time', Icon: Clock },
    ],
  },
  {
    label: 'Team',
    triggers: [
      { key: 'first_teammate_online', label: 'First teammate online', desc: 'Someone comes online (was empty)', Icon: Users },
      { key: 'all_teammates_offline', label: 'All teammates offline', desc: 'The last teammate goes offline', Icon: Users },
      { key: 'specific_teammate_online', label: 'Teammate online', desc: 'A named teammate comes online', Icon: Users },
      { key: 'specific_teammate_offline', label: 'Teammate offline', desc: 'A named teammate goes offline', Icon: Users },
    ],
  },
  {
    label: 'Devices & base',
    triggers: [
      { key: 'smart_alarm', label: 'Smart alarm', desc: 'A Smart Alarm push fires', Icon: Bell },
      { key: 'switch_state_changed', label: 'Switch changes', desc: 'A paired switch flips on/off', Icon: ToggleRight },
      { key: 'upkeep_low', label: 'Upkeep low', desc: 'TC upkeep drops below N hours', Icon: ShieldAlert },
      { key: 'upkeep_restored', label: 'Upkeep restored', desc: 'TC upkeep recovers above N hours', Icon: ShieldAlert },
    ],
  },
  {
    label: 'Players & world',
    triggers: [
      { key: 'tracked_player_joins', label: 'Tracked player joins', desc: 'A tracked player comes online', Icon: Radio },
      { key: 'tracked_player_leaves', label: 'Tracked player leaves', desc: 'A tracked player goes offline', Icon: Radio },
      { key: 'event_alert', label: 'World event', desc: 'A world event appears on the map', Icon: Globe },
    ],
  },
];

const TRIGGER_BY_KEY: Record<string, TriggerDef> = Object.fromEntries(
  TRIGGER_GROUPS.flatMap((g) => g.triggers).map((t) => [t.key, t]),
);

const REVERSIBLE: WorkflowTrigger[] = [
  'day_start', 'night_start', 'first_teammate_online', 'all_teammates_offline',
  'specific_teammate_online', 'specific_teammate_offline', 'upkeep_low', 'upkeep_restored',
  'tracked_player_joins', 'tracked_player_leaves',
];

const CONDITION_OPTIONS: { key: WorkflowConditionType; label: string }[] = [
  { key: 'during_night', label: 'Only during night' },
  { key: 'during_day', label: 'Only during day' },
  { key: 'teammate_online', label: 'Only if teammate online' },
  { key: 'teammate_offline', label: 'Only if teammate offline' },
  { key: 'switch_on', label: 'Only if switch is ON' },
  { key: 'switch_off', label: 'Only if switch is OFF' },
];

const ACTION_OPTIONS: { key: WorkflowActionType; label: string; Icon: IconType }[] = [
  { key: 'toggle_switch', label: 'Toggle switch', Icon: ToggleRight },
  { key: 'team_chat', label: 'Team chat', Icon: MessageSquare },
  { key: 'discord', label: 'Discord', Icon: Send },
  { key: 'wait', label: 'Wait', Icon: Timer },
  { key: 'trigger_workflow', label: 'Run workflow', Icon: GitBranch },
];

const triggerNeedsTeammate = (t: WorkflowTrigger) => t === 'specific_teammate_online' || t === 'specific_teammate_offline';
const triggerNeedsUpkeep = (t: WorkflowTrigger) => t === 'upkeep_low' || t === 'upkeep_restored';

/** A blank editable draft used by the "New workflow" / edit flow. */
function emptyDraft(): WorkflowDraft {
  return {
    name: 'New Workflow',
    enabled: true,
    trigger: 'night_start',
    triggerParams: {},
    conditions: [],
    actions: [{ id: genId('act'), type: 'toggle_switch', switchAction: 'on' }],
    autoReverse: false,
    runCount: 0,
  };
}

export function WorkflowsPanel() {
  const workflows = useWorkflowStore((s) => s.workflows);
  const add = useWorkflowStore((s) => s.add);
  const update = useWorkflowStore((s) => s.update);
  const remove = useWorkflowStore((s) => s.remove);
  const toggleEnabled = useWorkflowStore((s) => s.toggleEnabled);
  const duplicate = useWorkflowStore((s) => s.duplicate);
  const devicesObj = useDeviceStore((s) => s.devices);
  const members = useTeamStore((s) => s.members);

  const srv = getCurrentServer();

  const switches = useMemo(
    () => Object.values(devicesObj).filter((d) => Number(d.entityType) === 1 && isCurrentServer(d.serverId)),
    [devicesObj],
  );
  const alarms = useMemo(
    () => Object.values(devicesObj).filter((d) => Number(d.entityType) === 2 && isCurrentServer(d.serverId)),
    [devicesObj],
  );
  const monitors = useMemo(
    () => Object.values(devicesObj).filter((d) => Number(d.entityType) === 3 && isCurrentServer(d.serverId)),
    [devicesObj],
  );

  const mine = workflows.filter((w) => !w.serverId || isCurrentServer(w.serverId));

  // Editor state: null = closed, otherwise the working draft. editingId set when editing existing.
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const messageRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const openNew = () => { setEditingId(null); setDraft(emptyDraft()); setShowTemplates(false); };
  const openTemplate = (build: () => WorkflowDraft) => { setEditingId(null); setDraft(build()); setShowTemplates(false); };
  const openEdit = (w: Workflow) => {
    setEditingId(w.id);
    setDraft({
      name: w.name, enabled: w.enabled, trigger: w.trigger,
      triggerParams: { ...w.triggerParams },
      conditions: w.conditions.map((c) => ({ ...c })),
      actions: w.actions.map((a) => ({ ...a })),
      autoReverse: w.autoReverse, serverId: w.serverId, serverName: w.serverName,
      lastFired: w.lastFired, runCount: w.runCount,
    });
  };
  const closeEditor = () => { setDraft(null); setEditingId(null); };

  const patch = (data: Partial<WorkflowDraft>) => setDraft((d) => (d ? { ...d, ...data } : d));
  const patchParams = (data: Partial<WorkflowTriggerParams>) =>
    setDraft((d) => (d ? { ...d, triggerParams: { ...d.triggerParams, ...data } } : d));

  // Conditions ───────────────────────────────────────────────────────────
  const addCondition = () => setDraft((d) => d && ({ ...d, conditions: [...d.conditions, { id: genId('cond'), type: 'during_night' }] }));
  const updateCondition = (id: string, data: Partial<WorkflowCondition>) =>
    setDraft((d) => d && ({ ...d, conditions: d.conditions.map((c) => (c.id === id ? { ...c, ...data } : c)) }));
  const removeCondition = (id: string) => setDraft((d) => d && ({ ...d, conditions: d.conditions.filter((c) => c.id !== id) }));

  // Actions ────────────────────────────────────────────────────────────────
  const addAction = () => setDraft((d) => d && ({ ...d, actions: [...d.actions, { id: genId('act'), type: 'toggle_switch', switchAction: 'on' }] }));
  const updateAction = (id: string, data: Partial<WorkflowAction>) =>
    setDraft((d) => d && ({ ...d, actions: d.actions.map((a) => (a.id === id ? { ...a, ...data } : a)) }));
  const removeAction = (id: string) => setDraft((d) => d && ({ ...d, actions: d.actions.filter((a) => a.id !== id) }));
  const moveAction = (idx: number, dir: -1 | 1) => setDraft((d) => {
    if (!d) return d;
    const next = [...d.actions];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return d;
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...d, actions: next };
  });
  const moveCondition = (idx: number, dir: -1 | 1) => setDraft((d) => {
    if (!d) return d;
    const next = [...d.conditions];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return d;
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...d, conditions: next };
  });

  // Insert a {token} into a message action's textarea at the caret.
  const insertToken = (actionId: string, token: string) => {
    const el = messageRefs.current[actionId];
    setDraft((d) => {
      if (!d) return d;
      const a = d.actions.find((x) => x.id === actionId);
      if (!a) return d;
      const cur = a.message ?? '';
      const start = el ? el.selectionStart : cur.length;
      const end = el ? el.selectionEnd : cur.length;
      const next = cur.slice(0, start) + token + cur.slice(end);
      return { ...d, actions: d.actions.map((x) => (x.id === actionId ? { ...x, message: next } : x)) };
    });
  };

  const save = () => {
    if (!draft) return;
    const clean: WorkflowDraft = {
      ...draft,
      name: draft.name.trim() || 'Untitled Workflow',
      autoReverse: REVERSIBLE.includes(draft.trigger) ? draft.autoReverse : false,
      serverId: draft.serverId ?? srv?.id,
      serverName: draft.serverName ?? srv?.name,
    };
    if (editingId) update(editingId, clean);
    else add(clean);
    closeEditor();
  };

  return (
    <div className="wf-panel">
      <div className="wf-head">
        <h3><WorkflowIcon size={15} /> WORKFLOWS</h3>
        <div className="wf-head-right">
          {mine.length > 0 && (
            <span className="wf-count">{mine.filter((w) => w.enabled).length} active{mine.length > mine.filter((w) => w.enabled).length ? ` · ${mine.length - mine.filter((w) => w.enabled).length} off` : ''}</span>
          )}
          {!draft && (
            <>
              <button className="wf-btn-ghost" onClick={() => setShowTemplates((v) => !v)}>
                <Sparkles size={13} /> Templates
              </button>
              <button className="wf-btn-accent" onClick={openNew}>
                <Plus size={13} /> New Workflow
              </button>
            </>
          )}
        </div>
      </div>

      {/* Template picker */}
      {showTemplates && !draft && (
        <div className="wf-templates">
          {WORKFLOW_TEMPLATES.map((t) => (
            <button key={t.key} className="wf-template" onClick={() => openTemplate(t.build)}>
              <span className="wf-template-name"><Sparkles size={12} /> {t.name}</span>
              <span className="wf-template-desc">{t.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {mine.length === 0 && !draft && (
        <div className="wf-empty">
          <WorkflowIcon size={22} />
          <p>Build a <b>workflow</b> to chain automations: pick a trigger, gate it with conditions, then run an ordered list of actions — toggle switches, post to team chat, ping Discord, wait, or fire another workflow.</p>
        </div>
      )}

      {/* Editor */}
      {draft && (
        <div className="wf-editor">
          <div className="wf-editor-head">
            <span>{editingId ? 'Edit workflow' : 'New workflow'}</span>
            <button className="wf-icon-btn" onClick={closeEditor} aria-label="Close"><X size={14} /></button>
          </div>

          <label className="wf-field">
            <span className="wf-label">NAME</span>
            <input className="wf-input" type="text" value={draft.name}
              onChange={(e) => patch({ name: e.target.value })} placeholder="Workflow name" />
          </label>

          {/* Trigger */}
          <div className="wf-section">
            <span className="wf-section-title"><Zap size={12} /> WHEN (TRIGGER)</span>
            <div className="wf-select-wrap">
              <select className="wf-select" value={draft.trigger}
                onChange={(e) => patch({ trigger: e.target.value as WorkflowTrigger, autoReverse: false })}>
                {TRIGGER_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.triggers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <ChevronRight size={14} className="wf-select-chev" />
            </div>
            {TRIGGER_BY_KEY[draft.trigger] && <span className="wf-hint">{TRIGGER_BY_KEY[draft.trigger].desc}</span>}

            {/* Trigger params */}
            {draft.trigger === 'custom_time' && (
              <div className="wf-row">
                <input className="wf-num" type="number" min={0} max={23} value={draft.triggerParams.scheduleHour ?? 20}
                  onChange={(e) => patchParams({ scheduleHour: Math.max(0, Math.min(23, parseInt(e.target.value) || 0)) })} />
                <span className="wf-suffix">:</span>
                <input className="wf-num" type="number" min={0} max={59} value={draft.triggerParams.scheduleMinute ?? 0}
                  onChange={(e) => patchParams({ scheduleMinute: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) })} />
                <span className="wf-suffix">local clock time (24h)</span>
              </div>
            )}

            {triggerNeedsTeammate(draft.trigger) && (
              <div className="wf-select-wrap">
                <select className="wf-select" value={draft.triggerParams.teammateName ?? ''}
                  onChange={(e) => patchParams({ teammateName: e.target.value || undefined })}>
                  <option value="">Select a teammate…</option>
                  {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
                <ChevronRight size={14} className="wf-select-chev" />
              </div>
            )}

            {draft.trigger === 'smart_alarm' && (
              alarms.length > 0 ? (
                <div className="wf-select-wrap">
                  <select className="wf-select" value={draft.triggerParams.alarmFilter ?? ''}
                    onChange={(e) => patchParams({ alarmFilter: e.target.value || undefined })}>
                    <option value="">Any Smart Alarm</option>
                    {alarms.map((al) => (
                      <option key={al.entityId} value={al.customName || al.entityName}>{al.customName || al.entityName}</option>
                    ))}
                  </select>
                  <ChevronRight size={14} className="wf-select-chev" />
                </div>
              ) : (
                <input className="wf-input" type="text" placeholder="Match alarm title (blank = any)"
                  value={draft.triggerParams.alarmFilter ?? ''} onChange={(e) => patchParams({ alarmFilter: e.target.value || undefined })} />
              )
            )}

            {draft.trigger === 'switch_state_changed' && (
              <div className="wf-row wf-row-wrap">
                <div className="wf-select-wrap wf-grow">
                  <select className="wf-select" value={draft.triggerParams.switchEntityId ?? ''}
                    onChange={(e) => patchParams({ switchEntityId: Number(e.target.value) || undefined })}>
                    <option value="">Select a switch…</option>
                    {switches.map((s) => <option key={s.entityId} value={s.entityId}>{s.customName || s.entityName} (#{s.entityId})</option>)}
                  </select>
                  <ChevronRight size={14} className="wf-select-chev" />
                </div>
                <div className="wf-select-wrap wf-grow">
                  <select className="wf-select"
                    value={draft.triggerParams.switchState === undefined ? 'any' : draft.triggerParams.switchState ? 'on' : 'off'}
                    onChange={(e) => patchParams({ switchState: e.target.value === 'any' ? undefined : e.target.value === 'on' })}>
                    <option value="any">on any change</option>
                    <option value="on">when it turns ON</option>
                    <option value="off">when it turns OFF</option>
                  </select>
                  <ChevronRight size={14} className="wf-select-chev" />
                </div>
              </div>
            )}

            {triggerNeedsUpkeep(draft.trigger) && (
              <>
                {monitors.length === 0 ? (
                  <span className="wf-warn"><ShieldAlert size={13} /> Pair a Storage Monitor on a TC to use this trigger.</span>
                ) : (
                  <div className="wf-select-wrap">
                    <select className="wf-select" value={draft.triggerParams.monitorId ?? ''}
                      onChange={(e) => patchParams({ monitorId: Number(e.target.value) || undefined })}>
                      <option value="">Select a storage monitor…</option>
                      {monitors.map((m) => <option key={m.entityId} value={m.entityId}>{m.customName || m.entityName} (#{m.entityId})</option>)}
                    </select>
                    <ChevronRight size={14} className="wf-select-chev" />
                  </div>
                )}
                <div className="wf-row">
                  <input className="wf-num" type="number" min={1} value={draft.triggerParams.upkeepHours ?? 24}
                    onChange={(e) => patchParams({ upkeepHours: Math.max(1, parseInt(e.target.value) || 1) })} />
                  <span className="wf-suffix">hours of upkeep threshold</span>
                </div>
              </>
            )}

            {REVERSIBLE.includes(draft.trigger) && (
              <label className="wf-check">
                <input type="checkbox" checked={!!draft.autoReverse} onChange={(e) => patch({ autoReverse: e.target.checked })} />
                <Repeat size={12} /> Auto-reverse switch toggles on the opposite trigger
              </label>
            )}
          </div>

          {/* Conditions */}
          <div className="wf-section">
            <span className="wf-section-title"><Filter size={12} /> ONLY IF (CONDITIONS)</span>
            {draft.conditions.length === 0 && <span className="wf-hint">No conditions — the workflow always runs when triggered.</span>}
            {draft.conditions.map((c, idx) => (
              <div key={c.id} className="wf-item">
                <div className="wf-item-main">
                  <div className="wf-select-wrap wf-grow">
                    <select className="wf-select" value={c.type} onChange={(e) => updateCondition(c.id, { type: e.target.value as WorkflowConditionType })}>
                      {CONDITION_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    <ChevronRight size={14} className="wf-select-chev" />
                  </div>
                  {(c.type === 'teammate_online' || c.type === 'teammate_offline') && (
                    <div className="wf-select-wrap wf-grow">
                      <select className="wf-select" value={c.teammateName ?? ''} onChange={(e) => updateCondition(c.id, { teammateName: e.target.value || undefined })}>
                        <option value="">Select teammate…</option>
                        {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                      </select>
                      <ChevronRight size={14} className="wf-select-chev" />
                    </div>
                  )}
                  {(c.type === 'switch_on' || c.type === 'switch_off') && (
                    <div className="wf-select-wrap wf-grow">
                      <select className="wf-select" value={c.switchEntityId ?? ''} onChange={(e) => updateCondition(c.id, { switchEntityId: Number(e.target.value) || undefined })}>
                        <option value="">Select switch…</option>
                        {switches.map((s) => <option key={s.entityId} value={s.entityId}>{s.customName || s.entityName}</option>)}
                      </select>
                      <ChevronRight size={14} className="wf-select-chev" />
                    </div>
                  )}
                </div>
                <div className="wf-item-tools">
                  <button className="wf-icon-btn" disabled={idx === 0} onClick={() => moveCondition(idx, -1)} aria-label="Move up"><ChevronUp size={13} /></button>
                  <button className="wf-icon-btn" disabled={idx === draft.conditions.length - 1} onClick={() => moveCondition(idx, 1)} aria-label="Move down"><ChevronDown size={13} /></button>
                  <button className="wf-icon-btn wf-danger" onClick={() => removeCondition(c.id)} aria-label="Remove"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <button className="wf-add-row" onClick={addCondition}><Plus size={12} /> Add condition</button>
          </div>

          {/* Actions */}
          <div className="wf-section">
            <span className="wf-section-title"><Zap size={12} /> DO THIS (ACTIONS)</span>
            {draft.actions.map((a, idx) => (
              <div key={a.id} className="wf-item wf-action">
                <span className="wf-step">{idx + 1}</span>
                <div className="wf-item-main">
                  <div className="wf-select-wrap wf-grow">
                    <select className="wf-select" value={a.type} onChange={(e) => updateAction(a.id, { type: e.target.value as WorkflowActionType })}>
                      {ACTION_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    <ChevronRight size={14} className="wf-select-chev" />
                  </div>

                  {a.type === 'toggle_switch' && (
                    <div className="wf-row wf-row-wrap">
                      <div className="wf-select-wrap wf-grow">
                        <select className="wf-select" value={a.entityId ?? ''} onChange={(e) => updateAction(a.id, { entityId: Number(e.target.value) || undefined })}>
                          <option value="">Select switch…</option>
                          {switches.map((s) => <option key={s.entityId} value={s.entityId}>{s.customName || s.entityName} (#{s.entityId})</option>)}
                        </select>
                        <ChevronRight size={14} className="wf-select-chev" />
                      </div>
                      <div className="wf-select-wrap wf-grow">
                        <select className="wf-select" value={a.switchAction ?? 'toggle'} onChange={(e) => updateAction(a.id, { switchAction: e.target.value as 'on' | 'off' | 'toggle' })}>
                          <option value="on">turn ON</option>
                          <option value="off">turn OFF</option>
                          <option value="toggle">toggle</option>
                        </select>
                        <ChevronRight size={14} className="wf-select-chev" />
                      </div>
                    </div>
                  )}

                  {(a.type === 'team_chat' || a.type === 'discord') && (
                    <div className="wf-message">
                      <textarea
                        ref={(el) => { messageRefs.current[a.id] = el; }}
                        className="wf-textarea" rows={2} placeholder="Message — use {variables}"
                        value={a.message ?? ''} onChange={(e) => updateAction(a.id, { message: e.target.value })} />
                      <div className="wf-chips">
                        {MESSAGE_VARIABLES.map((v) => (
                          <button key={v.token} className="wf-chip" title={v.label} onClick={() => insertToken(a.id, v.token)}>{v.token}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {a.type === 'wait' && (
                    <div className="wf-row">
                      <input className="wf-num" type="number" min={1} value={a.seconds ?? 5}
                        onChange={(e) => updateAction(a.id, { seconds: Math.max(1, parseInt(e.target.value) || 1) })} />
                      <span className="wf-suffix">seconds before the next action</span>
                    </div>
                  )}

                  {a.type === 'trigger_workflow' && (
                    <div className="wf-select-wrap wf-grow">
                      <select className="wf-select" value={a.targetWorkflowId ?? ''} onChange={(e) => updateAction(a.id, { targetWorkflowId: e.target.value || undefined })}>
                        <option value="">Select a workflow…</option>
                        {mine.filter((w) => w.id !== editingId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      <ChevronRight size={14} className="wf-select-chev" />
                    </div>
                  )}
                </div>

                <div className="wf-item-tools">
                  <button className="wf-icon-btn" disabled={idx === 0} onClick={() => moveAction(idx, -1)} aria-label="Move up"><ChevronUp size={13} /></button>
                  <button className="wf-icon-btn" disabled={idx === draft.actions.length - 1} onClick={() => moveAction(idx, 1)} aria-label="Move down"><ChevronDown size={13} /></button>
                  <button className="wf-icon-btn wf-danger" onClick={() => removeAction(a.id)} aria-label="Remove"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <button className="wf-add-row" onClick={addAction}><Plus size={12} /> Add action</button>
          </div>

          <div className="wf-editor-actions">
            <button className="wf-cancel" onClick={closeEditor}>Cancel</button>
            <button className="wf-save" onClick={save} disabled={draft.actions.length === 0}>
              <Plus size={13} /> {editingId ? 'Save changes' : 'Create workflow'}
            </button>
          </div>
        </div>
      )}

      {/* Workflow list */}
      {mine.length > 0 && !draft && (
        <div className="wf-list">
          {mine.map((w) => {
            const Icon = TRIGGER_BY_KEY[w.trigger]?.Icon || WorkflowIcon;
            return (
              <div key={w.id} className={`wf-card ${w.enabled ? '' : 'is-disabled'}`}>
                <span className="wf-card-icon"><Icon size={15} /></span>
                <div className="wf-card-body">
                  <span className="wf-card-name">
                    {w.name}
                    {w.autoReverse && <span className="wf-tag"><Repeat size={9} /> reverse</span>}
                  </span>
                  <span className="wf-card-rule">
                    {describeWorkflowTrigger(w)}
                    <ChevronRight size={10} />
                    {w.actions.map((a) => describeWorkflowAction(a)).join(' → ') || 'no actions'}
                  </span>
                  <span className="wf-card-meta">
                    {w.conditions.length > 0 && <><Filter size={9} /> {w.conditions.length} condition{w.conditions.length > 1 ? 's' : ''} · </>}
                    ran {w.runCount ?? 0}×
                  </span>
                </div>
                <div className="wf-card-tools">
                  <button className={`wf-power ${w.enabled ? 'on' : 'off'}`} title={w.enabled ? 'Enabled — click to pause' : 'Paused — click to enable'} onClick={() => toggleEnabled(w.id)}>
                    <Power size={13} />
                  </button>
                  <button className="wf-icon-btn" onClick={() => openEdit(w)} title="Edit"><Pencil size={13} /></button>
                  <button className="wf-icon-btn" onClick={() => duplicate(w.id)} title="Duplicate"><Copy size={13} /></button>
                  <button className="wf-icon-btn wf-danger" onClick={() => remove(w.id)} title="Delete"><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
