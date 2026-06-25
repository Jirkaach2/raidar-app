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
  HelpCircle,
} from 'lucide-react';
import { Select, SelectOption } from '@/components/ui/Select';
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
  { key: 'trigger_workflow', label: 'Run another rule', Icon: GitBranch },
];

const triggerNeedsTeammate = (t: WorkflowTrigger) => t === 'specific_teammate_online' || t === 'specific_teammate_offline';
const triggerNeedsUpkeep = (t: WorkflowTrigger) => t === 'upkeep_low' || t === 'upkeep_restored';

/** A blank editable draft used by the "New rule" / edit flow. */
function emptyDraft(): WorkflowDraft {
  return {
    name: 'New Rule',
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
  const [showGuide, setShowGuide] = useState(false);
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
      name: draft.name.trim() || 'Untitled Rule',
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
        <div className="wf-head-title">
          <h3><WorkflowIcon size={15} /> RULES</h3>
          <span className="wf-tagline">When this happens, do that.</span>
        </div>
        <div className="wf-head-right">
          {mine.length > 0 && (
            <span className="wf-count">{mine.filter((w) => w.enabled).length} active{mine.length > mine.filter((w) => w.enabled).length ? ` · ${mine.length - mine.filter((w) => w.enabled).length} off` : ''}</span>
          )}
          {!draft && (
            <>
              <button className={`wf-btn-ghost ${showGuide ? 'is-on' : ''}`} onClick={() => setShowGuide((v) => !v)} title="How rules work">
                <HelpCircle size={13} /> How it works
              </button>
              <button className="wf-btn-ghost" onClick={() => setShowTemplates((v) => !v)}>
                <Sparkles size={13} /> Use a template
              </button>
              <button className="wf-btn-accent" onClick={openNew}>
                <Plus size={13} /> New Rule
              </button>
            </>
          )}
        </div>
      </div>

      {/* How it works */}
      {showGuide && !draft && (
        <div className="wf-guide">
          <div className="wf-guide-icon"><HelpCircle size={16} /></div>
          <div className="wf-guide-body">
            <strong>What's a Rule?</strong>
            <p>A rule watches for <b>one trigger</b> (nightfall, a smart alarm, a teammate coming online…), checks any <b>conditions</b> you set, then runs an ordered list of <b>actions</b> — flip switches, post to team chat, ping Discord, wait, or run another rule.</p>
            <p className="wf-guide-eg"><b>Example:</b> <i>When a smart alarm fires → turn ON the flood lights → post "🚨 Raid!" to team chat.</i></p>
          </div>
        </div>
      )}

      {/* Template picker */}
      {showTemplates && !draft && (
        <div className="wf-templates">
          <span className="wf-templates-label">START FROM A PRESET</span>
          <div className="wf-templates-grid">
            {WORKFLOW_TEMPLATES.map((t) => (
              <button key={t.key} className="wf-template" onClick={() => openTemplate(t.build)}>
                <span className="wf-template-name"><Sparkles size={12} /> {t.name}</span>
                <span className="wf-template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {mine.length === 0 && !draft && (
        <div className="wf-empty">
          <div className="wf-empty-icon"><WorkflowIcon size={26} /></div>
          <h4>No rules yet</h4>
          <p>A <b>rule</b> chains automations: pick a trigger, gate it with conditions, then run actions — toggle switches, post to team chat, ping Discord, wait, or fire another rule.</p>
          <div className="wf-empty-actions">
            <button className="wf-btn-accent" onClick={openNew}><Plus size={13} /> Create your first rule</button>
            <button className="wf-btn-ghost" onClick={() => setShowTemplates(true)}><Sparkles size={13} /> Use a template</button>
          </div>
        </div>
      )}

      {/* Editor */}
      {draft && (
        <div className="wf-editor">
          <div className="wf-editor-head">
            <span>{editingId ? 'Edit rule' : 'New rule'}</span>
            <button className="wf-icon-btn" onClick={closeEditor} aria-label="Close"><X size={14} /></button>
          </div>

          <label className="wf-field">
            <span className="wf-label">NAME</span>
            <input className="wf-input" type="text" value={draft.name}
              onChange={(e) => patch({ name: e.target.value })} placeholder="Rule name" />
          </label>

          {/* Trigger */}
          <div className="wf-section">
            <span className="wf-section-title"><Zap size={12} /> WHEN (TRIGGER)</span>
            <Select
              ariaLabel="Trigger"
              value={draft.trigger}
              onChange={(v) => patch({ trigger: v as WorkflowTrigger, autoReverse: false })}
              options={TRIGGER_GROUPS.flatMap((g) =>
                g.triggers.map((t): SelectOption => ({ value: t.key, label: t.label, group: g.label })),
              )}
            />
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
              <Select
                ariaLabel="Teammate"
                placeholder="Select a teammate…"
                value={draft.triggerParams.teammateName ?? ''}
                onChange={(v) => patchParams({ teammateName: (v as string) || undefined })}
                options={members.map((m): SelectOption => ({ value: m.name, label: m.name }))}
              />
            )}

            {draft.trigger === 'smart_alarm' && (
              alarms.length > 0 ? (
                <Select
                  ariaLabel="Smart alarm"
                  value={draft.triggerParams.alarmFilter ?? ''}
                  onChange={(v) => patchParams({ alarmFilter: (v as string) || undefined })}
                  options={[
                    { value: '', label: 'Any Smart Alarm' },
                    ...alarms.map((al): SelectOption => ({
                      value: al.customName || al.entityName,
                      label: al.customName || al.entityName,
                    })),
                  ]}
                />
              ) : (
                <input className="wf-input" type="text" placeholder="Match alarm title (blank = any)"
                  value={draft.triggerParams.alarmFilter ?? ''} onChange={(e) => patchParams({ alarmFilter: e.target.value || undefined })} />
              )
            )}

            {draft.trigger === 'switch_state_changed' && (
              <div className="wf-row wf-row-wrap">
                <div className="wf-grow">
                  <Select
                    ariaLabel="Switch"
                    placeholder="Select a switch…"
                    value={draft.triggerParams.switchEntityId ?? ''}
                    onChange={(v) => patchParams({ switchEntityId: Number(v) || undefined })}
                    options={switches.map((s): SelectOption => ({ value: s.entityId, label: `${s.customName || s.entityName} (#${s.entityId})` }))}
                  />
                </div>
                <div className="wf-grow">
                  <Select
                    ariaLabel="Switch change"
                    value={draft.triggerParams.switchState === undefined ? 'any' : draft.triggerParams.switchState ? 'on' : 'off'}
                    onChange={(v) => patchParams({ switchState: v === 'any' ? undefined : v === 'on' })}
                    options={[
                      { value: 'any', label: 'on any change' },
                      { value: 'on', label: 'when it turns ON' },
                      { value: 'off', label: 'when it turns OFF' },
                    ]}
                  />
                </div>
              </div>
            )}

            {triggerNeedsUpkeep(draft.trigger) && (
              <>
                {monitors.length === 0 ? (
                  <span className="wf-warn"><ShieldAlert size={13} /> Pair a Storage Monitor on a TC to use this trigger.</span>
                ) : (
                  <Select
                    ariaLabel="Storage monitor"
                    placeholder="Select a storage monitor…"
                    value={draft.triggerParams.monitorId ?? ''}
                    onChange={(v) => patchParams({ monitorId: Number(v) || undefined })}
                    options={monitors.map((m): SelectOption => ({ value: m.entityId, label: `${m.customName || m.entityName} (#${m.entityId})` }))}
                  />
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
            {draft.conditions.length === 0 && <span className="wf-hint">No conditions — the rule always runs when triggered.</span>}
            {draft.conditions.map((c, idx) => (
              <div key={c.id} className="wf-item">
                <div className="wf-item-main">
                  <div className="wf-grow">
                    <Select
                      ariaLabel="Condition"
                      value={c.type}
                      onChange={(v) => updateCondition(c.id, { type: v as WorkflowConditionType })}
                      options={CONDITION_OPTIONS.map((o): SelectOption => ({ value: o.key, label: o.label }))}
                    />
                  </div>
                  {(c.type === 'teammate_online' || c.type === 'teammate_offline') && (
                    <div className="wf-grow">
                      <Select
                        ariaLabel="Teammate"
                        placeholder="Select teammate…"
                        value={c.teammateName ?? ''}
                        onChange={(v) => updateCondition(c.id, { teammateName: (v as string) || undefined })}
                        options={members.map((m): SelectOption => ({ value: m.name, label: m.name }))}
                      />
                    </div>
                  )}
                  {(c.type === 'switch_on' || c.type === 'switch_off') && (
                    <div className="wf-grow">
                      <Select
                        ariaLabel="Switch"
                        placeholder="Select switch…"
                        value={c.switchEntityId ?? ''}
                        onChange={(v) => updateCondition(c.id, { switchEntityId: Number(v) || undefined })}
                        options={switches.map((s): SelectOption => ({ value: s.entityId, label: s.customName || s.entityName }))}
                      />
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
                  <div className="wf-grow">
                    <Select
                      ariaLabel="Action type"
                      value={a.type}
                      onChange={(v) => updateAction(a.id, { type: v as WorkflowActionType })}
                      options={ACTION_OPTIONS.map((o): SelectOption => ({ value: o.key, label: o.label }))}
                    />
                  </div>

                  {a.type === 'toggle_switch' && (
                    <div className="wf-row wf-row-wrap">
                      <div className="wf-grow">
                        <Select
                          ariaLabel="Switch"
                          placeholder="Select switch…"
                          value={a.entityId ?? ''}
                          onChange={(v) => updateAction(a.id, { entityId: Number(v) || undefined })}
                          options={switches.map((s): SelectOption => ({ value: s.entityId, label: `${s.customName || s.entityName} (#${s.entityId})` }))}
                        />
                      </div>
                      <div className="wf-grow">
                        <Select
                          ariaLabel="Switch action"
                          value={a.switchAction ?? 'toggle'}
                          onChange={(v) => updateAction(a.id, { switchAction: v as 'on' | 'off' | 'toggle' })}
                          options={[
                            { value: 'on', label: 'turn ON' },
                            { value: 'off', label: 'turn OFF' },
                            { value: 'toggle', label: 'toggle' },
                          ]}
                        />
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
                    <div className="wf-grow">
                      <Select
                        ariaLabel="Target workflow"
                        placeholder="Select a rule…"
                        value={a.targetWorkflowId ?? ''}
                        onChange={(v) => updateAction(a.id, { targetWorkflowId: (v as string) || undefined })}
                        options={mine.filter((w) => w.id !== editingId).map((w): SelectOption => ({ value: w.id, label: w.name }))}
                      />
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
              <Plus size={13} /> {editingId ? 'Save changes' : 'Create rule'}
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
