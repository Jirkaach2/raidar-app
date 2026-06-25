import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDeviceStore, SmartDevice } from '@/stores/device-store';
import { useConnectionStore } from '@/stores/connection-store';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { getCurrentServerId, isCurrentServer } from '@/utils/server';
import { ToggleLeft, ToggleRight, BellRing, Database, Trash2, Edit2 } from 'lucide-react';
import { AutomationPanel } from './AutomationPanel';
import { WorkflowsPanel } from '../automation/WorkflowsPanel';
import { SequencesPanel } from '../automation/SequencesPanel';
import './DevicePanel.css';

type DeviceTab = 'devices' | 'automations' | 'workflows' | 'sequences';

export function DevicePanel() {
  const devicesObj = useDeviceStore(s => s.devices);
  const devices = Object.values(devicesObj);
  const navigateToToolsTab = useUiStore(s => s.navigateToToolsTab);
  const updateDevice = useDeviceStore(s => s.updateDevice);
  const removeDevice = useDeviceStore(s => s.removeDevice);
  const renameDevice = useDeviceStore(s => s.renameDevice);
  const connectionStatus = useConnectionStore(s => s.status);

  const [activeTab, setActiveTab] = useState<DeviceTab>('devices');
  const [loadingIds, setLoadingIds] = useState<Record<number, boolean>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');

  const startEdit = (id: number, current: string) => {
    setEditingId(id);
    setDraftName(current);
  };
  const commitEdit = () => {
    if (editingId != null) renameDevice(editingId, draftName);
    setEditingId(null);
    setDraftName('');
  };

  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    // Fetch initial status only for devices on the connected server — the
    // Rust+ socket can only query entities on the current server.
    devices.forEach(async (dev) => {
      if (!isCurrentServer(dev.serverId)) return;
      try {
        const info: any = await invoke('get_entity_info', { entityId: dev.entityId });
        if (info) {
          updateDevice(dev.entityId, {
            value: info.payload_value,
            capacity: info.payload_capacity,
            hasProtection: info.has_protection,
            protectionExpiry: info.protection_expiry,
            missCount: 0,
            destroyed: false,
          });
        }
      } catch (e: any) {
        const msg = String(e?.message || e).toLowerCase();
        if (msg.includes('not_found')) {
          // Confirm over 2 consecutive misses to avoid transient false positives.
          const prev = useDeviceStore.getState().devices[dev.entityId];
          const misses = (prev?.missCount || 0) + 1;
          if (misses >= 2 && !prev?.destroyed) {
            updateDevice(dev.entityId, { missCount: misses, destroyed: true });
            useMapStore.getState().addToast(
              dev.customName || dev.entityName || 'Smart Device',
              'No longer exists on the server (destroyed). Remove it from the list?',
              'warning',
            );
          } else {
            updateDevice(dev.entityId, { missCount: misses });
          }
        } else {
          console.error(`Failed to fetch device ${dev.entityId}:`, e);
        }
      }
    });
    // Re-run when a new device is paired (devices.length changes) so it loads
    // immediately instead of waiting for the next reconnect.
  }, [connectionStatus, devices.length]);

  const handleToggle = async (id: number, currentValue: boolean) => {
    if (connectionStatus !== 'connected') return;
    
    setLoadingIds(s => ({ ...s, [id]: true }));
    try {
      await invoke('set_entity_value', { entityId: id, value: !currentValue });
      updateDevice(id, { value: !currentValue });
    } catch (e) {
      console.error('Failed to toggle:', e);
    } finally {
      setLoadingIds(s => ({ ...s, [id]: false }));
    }
  };

  const handleForeignToggle = async (dev: SmartDevice) => {
    // Parse serverId (format: "ip:port") to get connection details.
    const parts = (dev.serverId || '').split(':');
    const serverIp = parts[0];
    const serverPort = parseInt(parts[1], 10);
    if (!serverIp || isNaN(serverPort)) return;

    const nextValue = !dev.value;
    setLoadingIds(s => ({ ...s, [dev.entityId]: true }));
    try {
      await invoke('toggle_foreign_device', {
        serverIp,
        serverPort,
        entityId: dev.entityId,
        value: nextValue,
      });
      updateDevice(dev.entityId, { value: nextValue });
      useMapStore.getState().addToast(
        `${dev.customName || dev.entityName}`,
        `Toggled on ${dev.serverName || 'foreign server'}`,
        'success',
      );
    } catch (e) {
      console.error('Failed to toggle foreign device:', e);
      useMapStore.getState().addToast(
        'TOGGLE FAILED',
        `Could not toggle ${dev.customName || dev.entityName}`,
        'warning',
      );
    } finally {
      setLoadingIds(s => ({ ...s, [dev.entityId]: false }));
    }
  };

  const getDeviceIcon = (type: number, active: boolean) => {
    switch(type) {
      case 1: // Switch
        return active ? <ToggleRight size={18} className="text-success" /> : <ToggleLeft size={18} className="text-dim" />;
      case 2: // Alarm
        return <BellRing size={18} className={active ? 'text-danger alarm-shake' : 'text-dim'} />;
      case 3: // Storage Monitor
        return <Database size={18} className="text-accent" />;
      default:
        return <Database size={18} />;
    }
  };

  const getUpkeepLabel = (expiry: number) => {
    if (!expiry || expiry <= 0) return null;
    const now = Math.floor(Date.now() / 1000);
    const left = expiry - now;
    if (left <= 0) return <span className="upkeep-expiry text-danger" style={{ color: 'var(--color-danger)' }}>DECAYING!</span>;
    const days = Math.floor(left / 86400);
    const hours = Math.floor((left % 86400) / 3600);
    if (days > 0) return <span className="upkeep-expiry text-success" style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>{days}d {hours}h left</span>;
    const mins = Math.floor((left % 3600) / 60);
    return <span className="upkeep-expiry text-warning" style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>{hours}h {mins}m left</span>;
  };

  // Group devices by server: the connected one first, then others.
  const currentServerId = getCurrentServerId();
  const onCurrent = devices.filter((d) => isCurrentServer(d.serverId));
  const otherDevices = devices.filter((d) => !isCurrentServer(d.serverId));

  // Group "other" devices by their server for labelled sections.
  const otherGroups = new Map<string, SmartDevice[]>();
  otherDevices.forEach((d) => {
    const key = d.serverId || 'unknown';
    if (!otherGroups.has(key)) otherGroups.set(key, []);
    otherGroups.get(key)!.push(d);
  });

  const renderCard = (dev: SmartDevice, foreign: boolean) => {
    const devType = Number(dev.entityType);
    const isStorageMonitor = devType === 3;
    const active = !!dev.value;
    const typeClass = devType === 1 ? 'dev-switch' : devType === 2 ? 'dev-alarm' : 'dev-storage';
    return (
      <div
        key={`${dev.serverId || ''}-${dev.entityId}`}
        className={`device-card ${typeClass} ${active ? 'is-on-card' : ''} ${isStorageMonitor && !foreign ? 'is-clickable' : ''} ${foreign ? 'is-foreign' : ''}`}
        onClick={isStorageMonitor && !foreign ? () => navigateToToolsTab('cupboard') : undefined}
      >
        <div className="device-card-header">
          <div className={`device-icon ${active ? 'is-active' : ''}`}>
            {getDeviceIcon(devType, active)}
          </div>
          <div className="device-info">
            {editingId === dev.entityId ? (
              <input
                className="device-name-input"
                value={draftName}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') { setEditingId(null); setDraftName(''); }
                }}
                placeholder="Device name"
              />
            ) : (
              <div className="device-name-row">
                <h3 className="device-name">{dev.customName || dev.entityName}</h3>
                <button
                  className="device-name-edit"
                  title="Rename"
                  onClick={(e) => { e.stopPropagation(); startEdit(dev.entityId, dev.customName || dev.entityName); }}
                >
                  <Edit2 size={12} />
                </button>
              </div>
            )}
            <div className="device-meta text-dim">
              ID: {dev.entityId}{foreign && dev.serverName ? ` · ${dev.serverName}` : ''}
            </div>
          </div>

          <div className="device-actions">
            {/* Toggle/indicator only work on the connected server. */}
            {devType === 1 && !foreign && (
              <button
                className={`device-toggle ${dev.value ? 'is-on' : 'is-off'} ${loadingIds[dev.entityId] ? 'is-loading' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleToggle(dev.entityId, !!dev.value); }}
                disabled={loadingIds[dev.entityId]}
              >
                {dev.value ? 'ON' : 'OFF'}
              </button>
            )}
            {devType === 1 && foreign && (
              <button
                className={`device-toggle ${dev.value ? 'is-on' : 'is-off'} ${loadingIds[dev.entityId] ? 'is-loading' : ''} is-foreign-toggle`}
                title={`Toggle on ${dev.serverName || 'foreign server'}`}
                onClick={(e) => { e.stopPropagation(); handleForeignToggle(dev); }}
                disabled={loadingIds[dev.entityId]}
              >
                {dev.value ? 'ON' : 'OFF'}
              </button>
            )}
            {devType === 2 && !foreign && (
              <div className={`device-indicator ${dev.value ? 'is-alarming' : 'is-quiet'}`} />
            )}

            <button className="device-delete" onClick={(e) => { e.stopPropagation(); removeDevice(dev.entityId); }} title="Unpair">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {devType === 3 && !foreign && (
          <div className="device-tc-info" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dev.protectionExpiry !== undefined && dev.protectionExpiry > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <span className="text-dim" style={{ fontSize: '10px' }}>TC UPKEEP TIMER:</span>
                {getUpkeepLabel(dev.protectionExpiry)}
              </div>
            )}
            {dev.capacity !== undefined && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                  <span className="text-dim">TC STORAGE: {dev.capacity}/30 SLOTS FILLED</span>
                  <span className="text-accent" style={{ fontWeight: 'bold', color: '#58c6e8' }}>{Math.round((dev.capacity / 30) * 100)}%</span>
                </div>
                <div className="device-storage-bar" style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div className="storage-fill" style={{ height: '100%', background: '#58c6e8', width: `${Math.min(100, ((dev.capacity || 0) / 30) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="device-panel glass-panel">
      <div className="device-header">
        <h2 className="device-title">SMART DEVICES</h2>
        <p className="device-subtitle text-dim">
          To add a device, go in-game, look at a smart device, hold 'E', and click "Pair".
        </p>
      </div>

      <div className="device-tabbar" role="tablist">
        {([
          { id: 'devices', label: 'Devices' },
          { id: 'automations', label: 'Automations' },
          { id: 'workflows', label: 'Rules' },
          { id: 'sequences', label: 'Rotations' },
        ] as { id: DeviceTab; label: string }[]).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`device-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'devices' && (
        <div className="device-list scrollable">
          {devices.length === 0 ? (
            <div className="device-empty">
              <svg viewBox="0 0 24 24"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
              <p>No paired devices.</p>
            </div>
          ) : (
            <>
              {/* Current server devices */}
              {onCurrent.length > 0 && (
                <>
                  <div className="device-group-label">
                    {currentServerId ? 'THIS SERVER' : 'PAIRED DEVICES'}
                  </div>
                  {onCurrent.map((dev) => renderCard(dev, false))}
                </>
              )}

              {/* Devices from other servers */}
              {[...otherGroups.entries()].map(([sid, devs]) => (
                <div key={sid}>
                  <div className="device-group-label device-group-label--foreign">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    {devs[0]?.serverName || 'OTHER SERVER'} · OFF-SERVER
                  </div>
                  {devs.map((dev) => renderCard(dev, true))}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {activeTab === 'automations' && (
        <div className="device-tab-content scrollable">
          <AutomationPanel />
        </div>
      )}

      {activeTab === 'workflows' && (
        <div className="device-tab-content scrollable">
          <WorkflowsPanel />
        </div>
      )}

      {activeTab === 'sequences' && (
        <div className="device-tab-content scrollable">
          <SequencesPanel />
        </div>
      )}
    </div>
  );
}
