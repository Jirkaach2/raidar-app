import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link2 } from 'lucide-react';
import { useMapStore } from '@/stores/map-store';
import { useConnectionStore } from '@/stores/connection-store';
import MapCanvas from './MapCanvas';
import EventAlert from './EventAlert';
import DayNightWidget from './DayNightWidget';
import EventTimersWidget from './EventTimersWidget';
import { TacticalOverlays } from './TacticalOverlays';
import { MarkerToolbar } from './MarkerToolbar';
import { MapInfoCard } from './MapInfoCard';
import VendingShopDetailPanel from './VendingShopDetailPanel';
import './MapView.css';

export default function MapView() {
  const showGrid = useMapStore(s => s.showGrid);
  const viewport = useMapStore(s => s.viewport);
  const toggleGrid = useMapStore(s => s.toggleGrid);
  const setViewport = useMapStore(s => s.setViewport);
  const showEventTimers = useMapStore(s => s.showEventTimers);
  const showDayNight = useMapStore(s => s.showDayNight);
  const connectionStatus = useConnectionStore(s => s.status);
  const [hasPendingSteam, setHasPendingSteam] = useState(false);

  useEffect(() => {
    if (connectionStatus === 'connected') return;
    const checkPending = async () => {
      try {
        const hasPending = await invoke<boolean>('has_pending_steam_login');
        setHasPendingSteam(hasPending);
      } catch {}
    };
    checkPending();
    const interval = setInterval(checkPending, 2000);
    return () => clearInterval(interval);
  }, [connectionStatus]);

  const handleReopenSteam = async () => {
    try {
      await invoke('reopen_steam_login');
    } catch (e: any) {
      useMapStore.getState().addToast('Steam Login', e?.message || e, 'warning');
    }
  };

  const handleZoomIn = () => {
    setViewport({ zoom: Math.min(viewport.zoom + 0.25, 4) });
  };

  const handleZoomOut = () => {
    setViewport({ zoom: Math.max(viewport.zoom - 0.25, 0.5) });
  };

  const handleReset = () => {
    setViewport({ zoom: 1, x: 0, y: 0 });
  };

  return (
    <div className="mapview">
      {/* Main canvas */}
      <div className="mapview__canvas-wrap">
        <MapCanvas />
      </div>

      {connectionStatus !== 'connected' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', color: 'var(--text-dim)', backdropFilter: 'blur(4px)'
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.5 }}>
             <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
             <path d="M12 12 2.1 12"/>
             <path d="M12 12l7.07 7.07"/>
          </svg>
          <h2 style={{ letterSpacing: '2px', color: 'var(--text-bright)', marginBottom: '8px' }}>AWAITING CONNECTION</h2>
          <p>Go to the Settings panel to pair with your server</p>
          {hasPendingSteam && (
            <button
              onClick={handleReopenSteam}
              className="btn-accent"
              style={{
                marginTop: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'var(--accent-color, #da5e2a)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                fontSize: '11px',
                letterSpacing: '0.5px',
                boxShadow: '0 0 10px rgba(218, 94, 42, 0.4)'
              }}
            >
              <Link2 size={13} />
              Reopen Steam pairing window
            </button>
          )}
        </div>
      )}

      {/* HUD top-left info */}
      <div className="mapview__hud-top">
        <div className="mapview__hud-chip mapview__hud-chip--accent">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          LIVE MAP
        </div>
        <div className="mapview__hud-chip">
          ZOOM {(viewport.zoom * 100).toFixed(0)}%
        </div>
        <div className="mapview__hud-chip">
          SEED 31415926
        </div>
      </div>

      {/* Tactical Overlays HUD (bottom-left) */}
      {connectionStatus === 'connected' && <TacticalOverlays />}

      {/* Top-right controls */}
      <div className="mapview__controls">
        <button className="mapview__ctrl-btn" onClick={handleZoomIn} title="Zoom In">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <button className="mapview__ctrl-btn" onClick={handleZoomOut} title="Zoom Out">
          <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <button className="mapview__ctrl-btn" onClick={handleReset} title="Reset View">
          <svg viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button
          className={`mapview__ctrl-btn ${showGrid ? 'mapview__ctrl-btn--active' : ''}`}
          onClick={toggleGrid}
          title="Toggle Grid"
        >
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
        {/* Marker drop tool — sits in the same control stack, under the grid btn */}
        {connectionStatus === 'connected' && <MarkerToolbar />}
      </div>

      {/* Center crosshair */}
      <div className="mapview__crosshair" />

      {/* Day / Night info */}
      {connectionStatus === 'connected' && (
        <div style={{ position: 'absolute', bottom: 20, right: 16, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <MapInfoCard />
          {showEventTimers && <EventTimersWidget />}
          {showDayNight && <DayNightWidget />}
        </div>
      )}

      {/* Vending machine detail panel (right floating sidebar) */}
      {connectionStatus === 'connected' && <VendingShopDetailPanel />}

      {/* Event alerts */}
      <EventAlert />
    </div>
  );
}
