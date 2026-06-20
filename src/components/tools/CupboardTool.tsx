import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDeviceStore } from '../../stores/device-store';
import { useConnectionStore } from '../../stores/connection-store';
import { getItemIconUrl, getItemName } from '../../utils/items';
import { recordUpkeepSample } from '../../utils/upkeep';
import { getCurrentServerId } from '../../utils/server';

/**
 * Tool Cupboard & Storage Box dashboard.
 *
 * Reads Storage Monitors (entity type 3). Differentiates between a TC and a generic
 * Storage Box by inspecting its contents. Renders TCs with upkeep information, and
 * standard boxes as a generic grid of items.
 */

interface TcData {
  entityId: number;
  name: string;
  items: { item_id: number; quantity: number }[];
  protectionExpiry: number; // seconds from now
  hasProtection: boolean;
  fetchedAt: number;
  capacity: number;
}

// Items that are completely forbidden from entering a TC.
// If any of these are present, it is 100% a Storage Box.
const FORBIDDEN_TC_ITEMS = new Set([
  -1156329241, // sulfur.ore
  -821946849, // sulfur
  -592016202, // gunpowder
  1162463777, // explosives
  1050986417, // lowgradefuel
  -1938052175, // cloth
  -891243783, // fat.animal
]);

function isToolCupboard(data: TcData): boolean {
  const name = (data.name || '').toLowerCase();
  if (name.includes('tc') || name.includes('cupboard') || name.includes('cabinet') || name.includes('tool')) {
    return true;
  }
  // If it has explicitly reported protection expiry from the server > 0, it's definitely a TC
  if (data.protectionExpiry > 0) return true;
  if (data.capacity === 36) return true;
  
  // Check if any forbidden items are inside
  const hasForbidden = data.items.some(i => FORBIDDEN_TC_ITEMS.has(i.item_id));
  if (hasForbidden) return false;

  // Fallback: If has_protection is true, or if it's empty but has 36 capacity
  return data.hasProtection || data.capacity === 36;
}

function fmtDuration(secs: number): string {
  if (secs <= 0) return 'DECAYING';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Upkeep resource item ids are defined in utils/upkeep.ts (UPKEEP_ITEM_IDS).

export function CupboardTool() {
  const devices = useDeviceStore((s) => s.devices);
  const connectionStatus = useConnectionStore((s) => s.status);
  const storageMonitors = Object.values(devices).filter((d) => Number(d.entityType) === 3);

  const [data, setData] = useState<Record<number, TcData>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Periodically re-read TCs so upkeep burn rate can be measured over time.
  // Storage monitors update slowly, so a 2-min cadence is plenty and cheap.
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const id = setInterval(() => {
      Object.values(useDeviceStore.getState().devices)
        .filter((d: any) => Number(d.entityType) === 3)
        .forEach((sm: any) => refresh(sm.entityId, sm.entityName));
    }, 120_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  const refresh = useCallback(async (entityId: number, name: string) => {
    setLoading(entityId);
    try {
      const info: any = await invoke('get_entity_info', { entityId });
      const items = info.items || [];
      // Record a stock sample so we can measure the real per-day upkeep burn.
      recordUpkeepSample(`${getCurrentServerId()}:${entityId}`, items);
      setData((d) => ({
        ...d,
        [entityId]: {
          entityId,
          name,
          items,
          protectionExpiry: info.protection_expiry || 0,
          hasProtection: !!info.has_protection,
          capacity: info.payload_capacity || 36,
          fetchedAt: Date.now(),
        },
      }));
    } catch (e) {
      console.error('Fetch failed:', e);
    } finally {
      setLoading(null);
    }
  }, []);

  // Auto-load all storage monitors on mount and when new monitors are paired or when connection status changes to connected.
  useEffect(() => {
    if (connectionStatus === 'connected') {
      storageMonitors.forEach((sm) => refresh(sm.entityId, sm.entityName));
    }
  }, [storageMonitors.length, connectionStatus, refresh]);

  const tcs: typeof storageMonitors = [];
  const boxes: typeof storageMonitors = [];
  const pending: typeof storageMonitors = [];

  storageMonitors.forEach(sm => {
    const d = data[sm.entityId];
    if (!d) {
      // Not loaded yet — keep in a neutral "pending" bucket so a box doesn't
      // briefly flash under TOOL CUPBOARDS before being reclassified.
      pending.push(sm);
      return;
    }
    if (isToolCupboard(d)) tcs.push(sm);
    else boxes.push(sm);
  });

  return (
    <div className="tc">
      <div className="tc-section-head">
        <h3>TOOL CUPBOARDS & STORAGE MONITORS</h3>
        <span className="tc-hint">Pair a Storage Monitor in-game</span>
      </div>

      {storageMonitors.length === 0 && (
        <div className="tc-empty">
          No Storage Monitors paired yet. In Rust, place a Storage Monitor on your Tool Cupboard or a Box,
          then pair it via the Rust+ menu — it will appear here automatically.
        </div>
      )}

      {tcs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ color: 'var(--color-text-dim)', fontSize: 11, marginBottom: 12, letterSpacing: 1 }}>TOOL CUPBOARDS</h4>
          <div className="tc-list">
            {tcs.map((sm) => {
              const d = data[sm.entityId];
              const remaining = d ? d.protectionExpiry - Math.floor(Date.now() / 1000) : 0;
              const protectedNow = d ? (d.protectionExpiry > 0 && remaining > 0) : false;

              return (
                <div key={sm.entityId} className={`tc-card ${d ? (protectedNow ? 'tc-card--ok' : 'tc-card--decay') : ''}`}>
                  <div className="tc-card-head">
                    <span className="tc-card-name">{sm.customName || sm.entityName || 'Tool Cupboard'}</span>
                    <button 
                      className="tc-refresh" 
                      onClick={() => refresh(sm.entityId, sm.entityName)}
                      disabled={loading === sm.entityId}
                      title="Refresh"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.64 5.64"/>
                      </svg>
                    </button>
                  </div>

                  {!d ? (
                    <div className="tc-loading">Connecting to Rust+...</div>
                  ) : (
                    <>
                      <div className={`tc-status ${protectedNow ? 'tc-status--ok' : 'tc-status--decay'}`}>
                        <span>{protectedNow ? 'PROTECTED' : 'DECAYING'}</span>
                        <span className="tc-status-time">{protectedNow ? fmtDuration(remaining) : 'NOW'}</span>
                      </div>

                      <div className="box-grid">
                        {d.items.length === 0 ? (
                          <div className="tc-no-res" style={{ padding: 12, textAlign: 'center' }}>Cupboard is empty.</div>
                        ) : (
                          d.items.map((item, i) => (
                            <div key={i} className="box-slot" title={getItemName(item.item_id)}>
                              <img src={getItemIconUrl(item.item_id) || ''} alt="item" />
                              <span className="box-qty">
                                {item.quantity >= 1000 ? `${(item.quantity / 1000).toFixed(1).replace('.0', '')}k` : item.quantity}
                              </span>
                            </div>
                          ))
                        )}
                        {/* Pad with empty slots up to capacity (usually 36 for TC) */}
                        {Array.from({ length: Math.max(0, (d.capacity || 36) - d.items.length) }).map((_, i) => (
                          <div key={`empty-${i}`} className="box-slot empty" />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {boxes.length > 0 && (
        <div>
          <h4 style={{ color: 'var(--color-text-dim)', fontSize: 11, marginBottom: 12, letterSpacing: 1 }}>STORAGE BOXES</h4>
          <div className="tc-list">
            {boxes.map((sm) => {
              const d = data[sm.entityId];
              return (
                <div key={sm.entityId} className="tc-card">
                  <div className="tc-card-head">
                    <span className="tc-card-name">{sm.customName || sm.entityName || 'Storage Box'}</span>
                    <button 
                      className="tc-refresh" 
                      onClick={() => refresh(sm.entityId, sm.entityName)}
                      disabled={loading === sm.entityId}
                      title="Refresh"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.64 5.64"/>
                      </svg>
                    </button>
                  </div>
                  
                  {!d ? (
                    <div className="tc-loading">Loading box contents...</div>
                  ) : (
                    <div className="box-grid">
                      {d.items.length === 0 ? (
                        <div className="tc-no-res" style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-dim)' }}>Box is empty.</div>
                      ) : (
                        d.items.map((item, i) => (
                          <div key={i} className="box-slot" title={getItemName(item.item_id)}>
                            <img src={getItemIconUrl(item.item_id) || ''} alt="item" />
                            <span className="box-qty">
                              {item.quantity >= 1000 ? `${(item.quantity / 1000).toFixed(1).replace('.0', '')}k` : item.quantity}
                            </span>
                          </div>
                        ))
                      )}
                      {/* Pad with empty slots up to capacity */}
                      {Array.from({ length: Math.max(0, (d.capacity || 30) - d.items.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="box-slot empty" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <div style={{ marginTop: tcs.length > 0 || boxes.length > 0 ? 24 : 0 }}>
          <h4 style={{ color: 'var(--color-text-dim)', fontSize: 11, marginBottom: 12, letterSpacing: 1 }}>DETECTING…</h4>
          <div className="tc-list">
            {pending.map((sm) => (
              <div key={sm.entityId} className="tc-card">
                <div className="tc-card-head">
                  <span className="tc-card-name">{sm.customName || sm.entityName || 'Storage Monitor'}</span>
                </div>
                <div className="tc-loading">Reading container from Rust+…</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
