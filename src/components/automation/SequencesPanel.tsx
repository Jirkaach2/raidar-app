import { useMemo, useState } from 'react';
import {
  Repeat, Play, Square, Plus, Trash2, Columns3, ShieldAlert,
  Power, GripVertical, X, Pencil, Check, Zap, Info,
} from 'lucide-react';
import { useSequenceStore, Sequence } from '../../stores/sequence-store';
import { useDeviceStore, SmartDevice } from '../../stores/device-store';
import { isCurrentServer } from '../../utils/server';
import { Select, SelectOption } from '../ui/Select';
import './SequencesPanel.css';

/** Display label for a smart device — user override wins. */
function deviceLabel(d: SmartDevice | undefined, id: number): string {
  if (!d) return `#${id}`;
  return d.customName?.trim() || d.entityName || `#${id}`;
}

interface DragInfo { seqId: string; entityId: number; }

export function SequencesPanel() {
  const sequences = useSequenceStore((s) => s.sequences);
  const add = useSequenceStore((s) => s.add);
  const devices = useDeviceStore((s) => s.devices);

  const [newName, setNewName] = useState('');

  // Switches paired on the connected server, available to assign.
  const switches = useMemo(
    () => Object.values(devices).filter((d) => d.entityType === 1 && !d.destroyed && isCurrentServer(d.serverId)),
    [devices]
  );

  const visible = useMemo(() => sequences.filter((s) => isCurrentServer(s.serverId)), [sequences]);

  return (
    <div className="seq">
      <header className="seq-head">
        <div className="seq-head__title">
          <Repeat size={18} />
          <h2>Sequences</h2>
        </div>
        <p className="seq-head__sub">Turret flip-flop — rotate power through groups to beat the 12-turret limit.</p>
      </header>

      <div className="seq-explain">
        <Info size={15} className="seq-explain__icon" />
        <div>
          <strong>The flip-flop trick.</strong> Rust only powers <b>12 turrets</b> per electrical branch.
          Split your turrets into groups, then rotate power between them on a timer: while one group is live
          the others sit dark, so you never trip the limit yet still cover every angle over time. Set a
          <b> freeze trigger</b> (a paired Smart Alarm) and every group powers on at once for full firepower
          the moment you're hit.
        </div>
      </div>

      <div className="seq-create">
        <input
          className="seq-input"
          placeholder="New sequence name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { add(newName); setNewName(''); } }}
        />
        <button
          className="seq-btn seq-btn--accent"
          disabled={!newName.trim()}
          onClick={() => { add(newName); setNewName(''); }}
        >
          <Plus size={14} /> Create
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="seq-empty">
          <Columns3 size={26} />
          <p>No sequences yet. Create one above, add a couple of groups, and drop your turret switches in.</p>
        </div>
      ) : (
        <div className="seq-list">
          {visible.map((seq) => (
            <SequenceCard key={seq.id} seq={seq} switches={switches} devices={devices} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  seq: Sequence;
  switches: SmartDevice[];
  devices: Record<number, SmartDevice>;
}

function SequenceCard({ seq, switches, devices }: CardProps) {
  const {
    remove, update, start, stop, addGroup, removeGroup, renameGroup,
    addSwitch, removeSwitch, moveSwitch, setFreeze,
  } = useSequenceStore.getState();

  const [interval, setIntervalVal] = useState(seq.intervalSeconds);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(seq.name);

  // IDs already used anywhere in this sequence — hide them from the add picker.
  const usedIds = useMemo(() => new Set(seq.groups.flatMap((g) => g.entityIds)), [seq.groups]);
  const available = switches.filter((d) => !usedIds.has(d.entityId));

  const alarms = useMemo(
    () => Object.values(devices).filter((d) => d.entityType === 2 && !d.destroyed && isCurrentServer(d.serverId)),
    [devices]
  );

  const onDrop = (groupId: string, index: number) => {
    if (!drag || drag.seqId !== seq.id) return;
    moveSwitch(seq.id, drag.entityId, groupId, index);
    setDrag(null);
  };

  return (
    <div className={`seq-card ${seq.running ? 'is-running' : ''} ${seq.frozen ? 'is-frozen' : ''}`}>
      <div className="seq-card__top">
        <div className="seq-card__name">
          {editingName ? (
            <span className="seq-name-edit">
              <input
                autoFocus
                className="seq-input seq-input--inline"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { update(seq.id, { name: nameDraft.trim() || seq.name }); setEditingName(false); } }}
              />
              <button className="seq-icon-btn" onClick={() => { update(seq.id, { name: nameDraft.trim() || seq.name }); setEditingName(false); }}>
                <Check size={14} />
              </button>
            </span>
          ) : (
            <>
              <Repeat size={15} />
              <h3>{seq.name}</h3>
              <button className="seq-icon-btn" onClick={() => { setNameDraft(seq.name); setEditingName(true); }} title="Rename">
                <Pencil size={12} />
              </button>
            </>
          )}
          <div className="seq-status">
            {seq.frozen ? (
              <span className="seq-pill seq-pill--frozen"><Zap size={11} /> Full firepower</span>
            ) : seq.running ? (
              <span className="seq-pill seq-pill--run"><Play size={11} /> Rotating</span>
            ) : (
              <span className="seq-pill seq-pill--idle"><Square size={11} /> Stopped</span>
            )}
          </div>
        </div>
        <button className="seq-icon-btn seq-icon-btn--danger" onClick={() => remove(seq.id)} title="Delete sequence">
          <Trash2 size={15} />
        </button>
      </div>

      <div className="seq-controls">
        <label className="seq-field">
          <span>Interval (s)</span>
          <input
            type="number"
            min={1}
            className="seq-input seq-input--num"
            value={interval}
            onChange={(e) => setIntervalVal(Math.max(1, Number(e.target.value) || 1))}
            onBlur={() => update(seq.id, { intervalSeconds: interval })}
          />
        </label>
        {seq.running ? (
          <button className="seq-btn seq-btn--stop" onClick={() => stop(seq.id)}>
            <Square size={14} /> Stop
          </button>
        ) : (
          <button className="seq-btn seq-btn--accent" onClick={() => start(seq.id, interval)} disabled={seq.groups.length === 0}>
            <Play size={14} /> Start
          </button>
        )}
        <button className="seq-btn seq-btn--ghost" onClick={() => addGroup(seq.id, '')}>
          <Plus size={14} /> Group
        </button>
      </div>

      {seq.groups.length === 0 ? (
        <div className="seq-no-groups">Add a group to start wiring switches.</div>
      ) : (
        <div className="seq-groups">
          {seq.groups.map((g, gi) => (
            <div
              key={g.id}
              className={`seq-group ${seq.activeGroupIndex === gi && (seq.running || seq.frozen) ? 'is-active' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(g.id, g.entityIds.length)}
            >
              <div className="seq-group__head">
                <Columns3 size={13} />
                <input
                  className="seq-input seq-input--group"
                  value={g.name}
                  onChange={(e) => renameGroup(seq.id, g.id, e.target.value)}
                />
                <span className="seq-group__count">{g.entityIds.length}</span>
                <button className="seq-icon-btn seq-icon-btn--danger" onClick={() => removeGroup(seq.id, g.id)} title="Delete group">
                  <X size={13} />
                </button>
              </div>

              <div className="seq-group__switches">
                {g.entityIds.length === 0 && <div className="seq-group__drop">Drop switches here</div>}
                {g.entityIds.map((id, idx) => {
                  const dev = devices[id];
                  const on = dev?.value ?? false;
                  return (
                    <div
                      key={id}
                      className="seq-switch"
                      draggable
                      onDragStart={() => setDrag({ seqId: seq.id, entityId: id })}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => { e.stopPropagation(); onDrop(g.id, idx); }}
                    >
                      <GripVertical size={13} className="seq-switch__grip" />
                      <Power size={12} className={on ? 'seq-switch__on' : 'seq-switch__off'} />
                      <span className="seq-switch__name">{deviceLabel(dev, id)}</span>
                      <button className="seq-icon-btn" onClick={() => removeSwitch(seq.id, g.id, id)} title="Remove">
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {available.length > 0 && (
                <Select
                  ariaLabel="Add switch"
                  placeholder="+ Add switch…"
                  value=""
                  onChange={(v) => { const n = Number(v); if (n) addSwitch(seq.id, g.id, n); }}
                  options={available.map((d): SelectOption => ({ value: d.entityId, label: deviceLabel(d, d.entityId) }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="seq-freeze">
        <div className="seq-freeze__head">
          <ShieldAlert size={14} />
          <span>Freeze on alarm</span>
        </div>
        <p className="seq-freeze__hint">When a matching Smart Alarm fires, every group powers on for full firepower.</p>
        <div className="seq-freeze__row">
          <label className="seq-field seq-field--grow">
            <span>Trigger alarm</span>
            <Select
              ariaLabel="Trigger alarm"
              value={seq.freezeAlarmFilter ?? ''}
              onChange={(v) => setFreeze(seq.id, String(v), seq.freezeCooldownSeconds ?? 5)}
              options={[
                { value: '', label: 'Any alarm' },
                ...alarms.map((a): SelectOption => ({
                  value: deviceLabel(a, a.entityId),
                  label: deviceLabel(a, a.entityId),
                })),
              ]}
            />
          </label>
          <label className="seq-field">
            <span>Cooldown (s)</span>
            <input
              type="number"
              min={1}
              className="seq-input seq-input--num"
              value={seq.freezeCooldownSeconds ?? 5}
              onChange={(e) => setFreeze(seq.id, seq.freezeAlarmFilter ?? '', Math.max(1, Number(e.target.value) || 5))}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
