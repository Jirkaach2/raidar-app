import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useMapStore } from '@/stores/map-store';
import MapGrid from './MapGrid';
import MapMarkers from './MapMarkers';
import TeamMarkers from './TeamMarkers';
import MonumentInfoPanel from './MonumentInfoPanel';
import EventInfoPanel from './EventInfoPanel';
import { getNormalizedCoordinates, gridToNormalizedCoordinates } from '../../utils/grid';
import { isCurrentServer, getCurrentServer } from '../../utils/server';
import { getMonumentName, isHiddenMonument, isCaveMonument, monumentGivesCard, monumentHasRecycler, monumentHasFeature, normalizeMonumentKey, getMonumentInfo } from '../../utils/monuments';
import { useDecayStore, DECAY_HOURS, MATERIAL_LABEL, MAX_HP } from '../../stores/decay-store';
import { useMarkerStore } from '../../stores/marker-store';
import { MARKER_KINDS } from '../../stores/marker-store';
import { useRustMapsStore } from '../../stores/rustmaps-store';
import { useCrateStore } from '../../stores/crate-store';
import { useSettingsStore } from '../../stores/settings-store';
import { Trash2, X, LockOpen, RotateCcw, Plus, Minus, Info, Flame, Home, Skull, Package, Pickaxe, Boxes, AlertTriangle, MapPin, DoorOpen, Moon, Footprints, Plane, Flag, Move, Droplet, Mountain } from 'lucide-react';
import { getLootTable } from '../../utils/loot';
import { LootTableView } from '../common/LootTableView';
import './CrateCtrl.css';

/**
 * Zoomable / pannable map canvas.
 * Uses CSS transforms for viewport manipulation.
 */
export default function MapCanvas() {
  const viewport = useMapStore(s => s.viewport);
  const setViewport = useMapStore(s => s.setViewport);
  const showGrid = useMapStore(s => s.showGrid);
  const mapImageBase64 = useMapStore(s => s.mapImageBase64);
  const monuments = useMapStore(s => s.monuments);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const zoomAnim = useRef<{
    target: number; live: number; liveX: number; liveY: number;
    anchorX: number; anchorY: number; mapX: number; mapY: number; raf: number | null;
  }>({ target: 1, live: 1, liveX: 0, liveY: 0, anchorX: 0, anchorY: 0, mapX: 0, mapY: 0, raf: null });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const decayPlaceMode = useDecayStore(s => s.placeMode);
  const pinAtDecay = useDecayStore(s => s.pinAt);
  const markerPlaceMode = useMarkerStore(s => s.placeMode);
  const placeCustomMarker = useMarkerStore(s => s.placeAt);
  const markerMovingId = useMarkerStore(s => s.movingId);
  const moveCustomMarker = useMarkerStore(s => s.moveTo);
  const cancelMarkerMove = useMarkerStore(s => s.cancelMove);

  const MAP_SIZE = 800; // rendered px (before zoom)

  // While in decay- or custom-marker placement mode, a click on the map pins
  // the marker at the clicked normalized coordinate. While a marker is in
  // "move" mode, the click relocates that marker instead.
  const handleMapClick = useCallback((e: React.MouseEvent) => {
    if (!mapRef.current) return;
    if (!decayPlaceMode && !markerPlaceMode && !markerMovingId) return;
    const rect = mapRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
      if (markerMovingId) {
        moveCustomMarker(nx, ny);
      } else if (markerPlaceMode) {
        const srv = getCurrentServer();
        placeCustomMarker(nx, ny, srv?.id, srv?.name);
      } else if (decayPlaceMode) {
        pinAtDecay(nx, ny);
      }
    }
  }, [decayPlaceMode, markerPlaceMode, markerMovingId, pinAtDecay, placeCustomMarker, moveCustomMarker]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
  }, [viewport.x, viewport.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setViewport({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  }, [isPanning, panStart, setViewport]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const anim = zoomAnim.current;
    const container = containerRef.current;
    const vp = useMapStore.getState().viewport;
    const base = anim.raf != null ? anim.target : vp.zoom;
    const factor = Math.exp(-e.deltaY * 0.0015);
    anim.target = Math.min(5, Math.max(0.5, base * factor));

    // Compute the map-local point under the cursor so we can keep it pinned while
    // the scale animates (zoom-to-cursor). Screen position of a map-local point p:
    //   screen = containerCenter + (tx,ty) + zoom*(p - MAP_SIZE/2)
    // Solve for p at the current live transform, then re-derive (tx,ty) each frame
    // so that same p stays under the cursor.
    if (container) {
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left; // cursor in container space
      const cy = e.clientY - rect.top;
      const ccX = rect.width / 2;
      const ccY = rect.height / 2;
      anim.anchorX = cx;
      anim.anchorY = cy;
      const liveZ = anim.raf != null ? anim.live : vp.zoom;
      const liveTX = anim.raf != null ? anim.liveX : vp.x;
      const liveTY = anim.raf != null ? anim.liveY : vp.y;
      // map-local coordinate currently under the cursor
      anim.mapX = (cx - ccX - liveTX) / liveZ + MAP_SIZE / 2;
      anim.mapY = (cy - ccY - liveTY) / liveZ + MAP_SIZE / 2;
    }

    if (anim.raf != null) return;
    // Animate by writing the transform DIRECTLY to the DOM node each frame so we
    // don't re-render every marker/grid element 60×/sec (that was the lag). The
    // store is only updated once the glide settles.
    anim.live = vp.zoom;
    anim.liveX = vp.x;
    anim.liveY = vp.y;

    // Promote the map to a stable GPU layer for the DURATION of the glide only.
    // While scaling rapidly this composites from one cached texture (smooth, and
    // crucially avoids the blank/black frame the browser shows when it re-rasters
    // the big layer mid-zoom). We drop it again on settle so the final frame
    // re-rasterizes crisp — no permanent blur.
    if (mapRef.current) mapRef.current.style.willChange = 'transform';

    let last = performance.now();
    const step = (nowT: number) => {
      const dt = Math.min(50, nowT - last);
      last = nowT;
      // Frame-rate independent exponential smoothing (~0.28 per 60fps frame).
      const k = 1 - Math.pow(1 - 0.28, dt / (1000 / 60));
      anim.live += (anim.target - anim.live) * k;
      const settled = Math.abs(anim.target - anim.live) < 0.001;
      const z = settled ? anim.target : anim.live;

      // Re-derive translation so the anchored map point stays under the cursor.
      const rect = container ? container.getBoundingClientRect() : null;
      const ccX = rect ? rect.width / 2 : 0;
      const ccY = rect ? rect.height / 2 : 0;
      const tx = anim.anchorX - ccX - z * (anim.mapX - MAP_SIZE / 2);
      const ty = anim.anchorY - ccY - z * (anim.mapY - MAP_SIZE / 2);
      anim.liveX = tx;
      anim.liveY = ty;

      if (mapRef.current) {
        mapRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`;
      }
      if (settled) {
        anim.raf = null;
        setViewport({ zoom: anim.target, x: tx, y: ty }); // commit final transform once
        // Drop will-change and let the layer re-rasterize at the final scale so
        // it stays crisp instead of stuck on the cached low-res texture.
        requestAnimationFrame(() => {
          if (mapRef.current) mapRef.current.style.willChange = 'auto';
        });
        return;
      }
      anim.raf = requestAnimationFrame(step);
    };
    anim.raf = requestAnimationFrame(step);
  }, [setViewport]);

  // Release pan if mouse leaves
  useEffect(() => {
    const handleUp = () => setIsPanning(false);
    window.addEventListener('mouseup', handleUp);
    const anim = zoomAnim.current;
    return () => {
      window.removeEventListener('mouseup', handleUp);
      if (anim.raf != null) cancelAnimationFrame(anim.raf);
    };
  }, []);

  // Escape cancels an in-progress marker move so the user is never stuck in
  // move mode.
  useEffect(() => {
    if (!markerMovingId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelMarkerMove(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [markerMovingId, cancelMarkerMove]);

  // When the app regains focus/visibility (or after first paint), the webview
  // sometimes leaves the composited map layer stuck at a stale, blurry raster.
  // Nudge it to re-rasterize crisp by briefly forcing a repaint of the layer.
  useEffect(() => {
    const refresh = () => {
      const el = mapRef.current;
      if (!el) return;
      // Toggle a no-op transform suffix to invalidate the cached layer texture.
      el.style.transform = `translate3d(${useMapStore.getState().viewport.x}px, ${useMapStore.getState().viewport.y}px, 0.0001px) scale(${useMapStore.getState().viewport.zoom})`;
      requestAnimationFrame(() => {
        if (!mapRef.current) return;
        const v = useMapStore.getState().viewport;
        mapRef.current.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.zoom})`;
      });
    };
    const onVis = () => { if (!document.hidden) refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    // Also run shortly after mount to fix the initial blurry-on-load case.
    const t = setTimeout(refresh, 120);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(t);
    };
  }, []);

  const transformStyle: React.CSSProperties = {
    width: MAP_SIZE,
    height: MAP_SIZE,
    transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
    transformOrigin: 'center center',
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -MAP_SIZE / 2,
    marginLeft: -MAP_SIZE / 2,
    // NO permanent `will-change` — it pins the layer to a low-res GPU texture
    // that stays blurry (esp. after load / returning from offscreen). Transforms
    // still composite smoothly, and the zoom animation writes transforms directly
    // to the DOM, so we keep smoothness AND crispness with no cached-texture blur.
    transition: 'none',
  };

  return (
    <div
      ref={containerRef}
      className="mapview__map-canvas"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleMapClick}
    >
      <div ref={mapRef} style={{ ...transformStyle, cursor: (decayPlaceMode || markerPlaceMode || markerMovingId) ? 'crosshair' : undefined }}>
        {/* Terrain base (real map or procedural fallback) */}
        {mapImageBase64 ? (
          <img 
            src={`data:image/jpeg;base64,${mapImageBase64}`} 
            draggable={false}
            alt="Rust Map"
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              objectFit: 'cover',
              zIndex: 0
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              borderRadius: 'var(--radius-lg)',
              background: `
                radial-gradient(ellipse at 30% 25%, rgba(34,60,40,0.35) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 60%, rgba(34,60,40,0.25) 0%, transparent 45%),
                radial-gradient(ellipse at 50% 80%, rgba(45,65,50,0.20) 0%, transparent 40%),
                radial-gradient(ellipse at 15% 65%, rgba(30,55,70,0.30) 0%, transparent 35%),
                radial-gradient(ellipse at 85% 20%, rgba(60,50,30,0.25) 0%, transparent 40%),
                radial-gradient(circle at 85% 70%, rgba(25,50,80,0.40) 0%, transparent 30%),
                radial-gradient(circle at 10% 90%, rgba(25,50,80,0.35) 0%, transparent 25%),
                var(--color-bg-deep)
              `,
              border: '1px solid var(--color-border)',
              zIndex: 0
            }}
          />
        )}

        {/* Position-dependent layers only render once the real map metadata
            (image dimensions + ocean margin) has loaded, so markers don't
            briefly appear in the wrong spot then snap into place. */}
        {mapImageBase64 && (
          <>
            {/* Monument feature icons (cards / recyclers from resource filters) */}
            <MonumentFeatureIcons monuments={monuments} />

            {/* Monument labels */}
            <MapMonumentLabels monuments={monuments} />

            {/* Decay base markers */}
            <DecayMapMarkers />

            {/* RustMaps-sourced extras: caves + water well shopkeeper */}
            <RustMapsExtras />

            {/* User-placed custom markers (bases, stashes, enemies…) */}
            <CustomMapMarkers />

            {/* User-placed locked crate timers */}
            <CrateMapMarkers />
          </>
        )}

        {/* Grid overlay */}
        {showGrid && mapImageBase64 && <MapGrid size={MAP_SIZE} />}

        {/* Markers */}
        {mapImageBase64 && (
          <>
            <MapMarkers />

            {/* Live teammate positions (arrow + name + HP) */}
            <TeamMarkers />
          </>
        )}
      </div>

      {/* Move-marker hint banner — explicit, self-explanatory move mode. */}
      {markerMovingId && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 10, zIndex: 80,
            padding: '8px 10px 8px 14px', borderRadius: 10, whiteSpace: 'nowrap',
            background: 'rgba(14,16,21,0.97)', border: '1px solid var(--color-accent)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <Move size={14} color="var(--color-accent)" />
          <span style={{ fontSize: 11.5, color: 'var(--color-text)', fontWeight: 600 }}>
            Click anywhere on the map to move this marker here
          </span>
          <button
            onClick={() => cancelMarkerMove()}
            title="Cancel move"
            aria-label="Cancel move"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
              background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-dim)',
            }}
          >
            <X size={12} /> Cancel
          </button>
        </div>
      )}

      {/* Monument detail panel (overlay, outside the transformed map) */}
      <MonumentInfoPanel />

      {/* Event detail panel (heli / chinook / cargo / locked crate) */}
      <EventInfoPanel />
    </div>
  );
}

function MapMonumentLabels({ monuments }: { monuments: any[] }) {
  const mapSize = useMapStore(s => s.mapSize);
  const oceanMargin = useMapStore(s => s.oceanMargin || 0);
  const imageWidth = useMapStore(s => s.mapImageWidth || 0);
  const imageHeight = useMapStore(s => s.mapImageHeight || 0);
  const selectMonument = useMapStore(s => s.selectMonument);
  const selectedMonumentToken = useMapStore(s => s.selectedMonumentToken);
  // Derive just whether the selected marker is a vending shop, so this layer
  // doesn't re-render on every marker poll (only when the selection changes to
  // or from a shop). Avoids recomputing all monument positions each second.
  const shopOpen = useMapStore(s => {
    if (!s.selectedMarkerId) return false;
    const sel = s.markers.find(m => m.id === s.selectedMarkerId);
    return sel?.type === 'vending_machine';
  });
  if (!monuments || monuments.length === 0) return null;

  // When a vending shop overlay is open, drop monument labels behind the
  // markers so they don't sit on top of the open shop interface.
  const containerZ = shopOpen ? 1 : 6;

  return (
    <div className="map-monuments-container" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: containerZ }}>
      {monuments.map((m, i) => {
        // Drop clutter / internal tokens (MONUMENT MARKER, MODULE 900X900, etc.)
        if (isHiddenMonument(m.token)) return null;

        const { x: normX, y: normY } = getNormalizedCoordinates(m.x, m.y, mapSize, imageWidth, imageHeight, oceanMargin);
        const isCave = isCaveMonument(m.token);
        // Caves are rendered by RustMapsExtras (seed-sourced); skip them here so
        // they don't double-render on servers that DO send a cave token.
        if (isCave) return null;
        const isTrainTunnel = /train_tunnel/i.test(m.token || '');
        const name = getMonumentName(m.token);
        // Train Station label is intentionally NOT clickable (per spec).
        // (Train Yard is a real puzzle monument and stays clickable.)
        const key = (m.token || '').toLowerCase();
        const isTrainStation = key.includes('train') && key.includes('station');
        const clickable = !isTrainTunnel && !isTrainStation && !isCave;
        const isSelected = selectedMonumentToken === m.token;

        if (isTrainTunnel) {
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${normX * 100}%`,
                top: `${normY * 100}%`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(232, 226, 217, 0.85)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 11, height: 11, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.85))' }}
              >
                <rect x="5" y="3" width="14" height="13" rx="2" />
                <path d="M9 3v4h6V3" />
                <path d="M5 11h14" />
                <circle cx="9" cy="13" r="1" fill="rgba(232, 226, 217, 0.85)" />
                <circle cx="15" cy="13" r="1" fill="rgba(232, 226, 217, 0.85)" />
                <path d="M8 16l-2 4M16 16l2 4" />
              </svg>
            </div>
          );
        }

        return (
          <div
            key={i}
            onClick={clickable ? (e) => { e.stopPropagation(); selectMonument(m.token); } : undefined}
            style={{
              position: 'absolute',
              left: `${normX * 100}%`,
              top: `${normY * 100}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: clickable && !shopOpen ? 'auto' : 'none',
              cursor: clickable ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              className="monument-label"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '5px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.7px',
                whiteSpace: 'nowrap',
                // No background pill — clean text with a strong shadow for legibility.
                color: isSelected ? '#ffd9a0' : '#fdf3e0',
                textShadow: '0 1px 2px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,1)',
                transition: 'color 0.12s',
              }}
            >
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders keycard / recycler icons on the relevant monuments when those
 * resource filters are active.
 */
function MonumentFeatureIcons({ monuments }: { monuments: any[] }) {
  const mapSize = useMapStore(s => s.mapSize);
  const oceanMargin = useMapStore(s => s.oceanMargin || 0);
  const imageWidth = useMapStore(s => s.mapImageWidth || 0);
  const imageHeight = useMapStore(s => s.mapImageHeight || 0);
  const showResources = useMapStore(s => s.showResources);
  const selectedResources = useMapStore(s => s.selectedResources);

  if (!showResources || !monuments || monuments.length === 0) return null;

  const wantGreen = selectedResources.includes('green_card');
  const wantBlue = selectedResources.includes('blue_card');
  const wantRed = selectedResources.includes('red_card');
  const wantRecycler = selectedResources.includes('recyclers');
  const wantResearch = selectedResources.includes('research_tables');
  const wantRefinery = selectedResources.includes('refineries');
  const wantSam = selectedResources.includes('sam_sites');
  const wantTurret = selectedResources.includes('turrets');
  const wantBasicBp = selectedResources.includes('basic_bp');
  const wantAdvBp = selectedResources.includes('advanced_bp');
  const wantDiesel = selectedResources.includes('diesel');
  const wantPumpJacks = selectedResources.includes('pump_jacks');

  if (!wantGreen && !wantBlue && !wantRed && !wantRecycler && !wantResearch && !wantRefinery && !wantSam && !wantTurret && !wantBasicBp && !wantAdvBp && !wantDiesel && !wantPumpJacks) return null;

  const CardIcon = ({ color }: { color: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="1.5" style={{ width: 12, height: 12 }}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" fill={color} />
      <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" stroke="rgba(0,0,0,0.45)" />
      <rect x="5" y="13" width="6" height="3" rx="0.6" fill="rgba(0,0,0,0.35)" stroke="none" />
    </svg>
  );
  const RecyclerIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M17 2.1l4 4-4 4M3 12h18M7 21.9l-4-4 4-4" />
    </svg>
  );
  const ResearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <rect x="3" y="3" width="18" height="10" rx="1" />
      <line x1="6" y1="13" x2="4" y2="21" />
      <line x1="18" y1="13" x2="20" y2="21" />
    </svg>
  );
  const RefineryIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M4 22V4c0-.5.2-1 .6-1.4C5 2.2 5.5 2 6 2h12c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4v18" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
  const SamIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M9 6V2M15 6V2" />
    </svg>
  );
  const TurretIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="7" x2="12" y2="2" />
      <line x1="12" y1="12" x2="20" y2="12" />
    </svg>
  );
  const BpIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </svg>
  );
  const DieselIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M12 22V10M18 10h-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v16h14v-6h4v6M18 10v6" />
    </svg>
  );
  const PumpJackIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M4 9l16-3" />
      <circle cx="4" cy="9" r="1.3" fill="#0c0e12" stroke="none" />
      <path d="M20 6v5M18 11h4" />
      <path d="M9 11l3 9M15 11l-3 9" />
      <line x1="7" y1="20" x2="17" y2="20" />
    </svg>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {monuments.map((m, i) => {
        if (isHiddenMonument(m.token)) return null;
        const badges: React.ReactNode[] = [];

        if (wantGreen && monumentGivesCard(m.token, 'green')) {
          badges.push(<FeatureBadge key="g" bg="#1faa4d"><CardIcon color="#2fe06d" /></FeatureBadge>);
        }
        if (wantBlue && monumentGivesCard(m.token, 'blue')) {
          badges.push(<FeatureBadge key="b" bg="#2160c4"><CardIcon color="#3b82f6" /></FeatureBadge>);
        }
        if (wantRed && monumentGivesCard(m.token, 'red')) {
          badges.push(<FeatureBadge key="r" bg="#c4263a"><CardIcon color="#ef4444" /></FeatureBadge>);
        }
        if (wantRecycler && monumentHasRecycler(m.token)) {
          badges.push(<FeatureBadge key="rec" bg="#1f9e93"><RecyclerIcon /></FeatureBadge>);
        }
        if (wantResearch && monumentHasFeature(m.token, 'research_tables')) {
          badges.push(<FeatureBadge key="res" bg="#9c4dd6"><ResearchIcon /></FeatureBadge>);
        }
        if (wantRefinery && monumentHasFeature(m.token, 'refineries')) {
          badges.push(<FeatureBadge key="ref" bg="#8a8f96"><RefineryIcon /></FeatureBadge>);
        }
        if (wantSam && monumentHasFeature(m.token, 'sam_sites')) {
          badges.push(<FeatureBadge key="sam" bg="#c43a3a"><SamIcon /></FeatureBadge>);
        }
        if (wantTurret && monumentHasFeature(m.token, 'turrets')) {
          badges.push(<FeatureBadge key="tur" bg="#5a6470"><TurretIcon /></FeatureBadge>);
        }
        if (wantBasicBp && monumentHasFeature(m.token, 'basic_bp')) {
          badges.push(<FeatureBadge key="bbp" bg="#3a7bbf"><BpIcon /></FeatureBadge>);
        }
        if (wantAdvBp && monumentHasFeature(m.token, 'advanced_bp')) {
          badges.push(<FeatureBadge key="abp" bg="#1f63c4"><BpIcon /></FeatureBadge>);
        }
        if (wantDiesel && monumentHasFeature(m.token, 'diesel')) {
          badges.push(<FeatureBadge key="dsl" bg="#37474f"><DieselIcon /></FeatureBadge>);
        }
        if (wantPumpJacks && monumentHasFeature(m.token, 'pump_jacks')) {
          badges.push(<FeatureBadge key="pj" bg="#c98a3c"><PumpJackIcon /></FeatureBadge>);
        }

        if (badges.length === 0) return null;

        const { x: normX, y: normY } = getNormalizedCoordinates(m.x, m.y, mapSize, imageWidth, imageHeight, oceanMargin);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${normX * 100}%`,
              top: `${normY * 100}%`,
              transform: 'translate(-50%, calc(-50% - 12px))',
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: 60,
            }}
          >
            {badges}
          </div>
        );
      })}
    </div>
  );
}

function FeatureBadge({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: 4,
        background: bg,
        border: '1px solid rgba(0,0,0,0.7)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.7)',
      }}
    >
      {children}
    </span>
  );
}

/** RustMaps-sourced extras: caves + the jungle Water Well shopkeeper. These
 *  monuments are NOT in the Rust+ feed, so we pull them from RustMaps by seed.
 *  We project the raw WORLD coords here so they stay correct once the map image
 *  dimensions are known (handles cache-hit-before-map-load ordering). */
function RustMapsExtras() {
  const raw = useRustMapsStore((s) => s.raw);
  const show = useMapStore((s) => s.showRustExtras);
  const mapSize = useMapStore((s) => s.mapSize);
  const imageWidth = useMapStore((s) => s.mapImageWidth || 0);
  const imageHeight = useMapStore((s) => s.mapImageHeight || 0);
  const oceanMargin = useMapStore((s) => s.oceanMargin || 0);
  const liveMonuments = useMapStore((s) => s.monuments);
  const [openId, setOpenId] = useState<string | null>(null);

  const extras = useMemo(() => {
    type Ex = { kind: 'cave' | 'water_well'; label: string; x: number; y: number };
    const out: Ex[] = [];
    if (raw.length === 0) return out;

    const isExtraType = (t: string) => {
      const lo = t.toLowerCase();
      return lo.includes('cave') || lo.includes('sinkhole') || lo.includes('water well') || lo.includes('waterwell');
    };

    // ── Auto-calibrate the RustMaps coordinate frame onto the LIVE Rust+ frame ──
    // RustMaps and Rust+ disagree on coordinate origin/scale, which is why caves
    // & the water well landed in the wrong place. Rather than guess the
    // convention, we calibrate empirically: the STANDARD monuments (Launch Site,
    // Harbor, …) appear in BOTH feeds, so the min/max extent of those shared
    // monuments must describe the same physical span. We map RustMaps' standard-
    // monument extent onto the live monuments' world extent (which already
    // projects correctly), then place caves/wells through that same transform.
    let rmMinX = Infinity, rmMaxX = -Infinity, rmMinY = Infinity, rmMaxY = -Infinity;
    for (const m of raw) {
      if (isExtraType(m.type)) continue; // standard monuments only
      if (m.wx < rmMinX) rmMinX = m.wx;
      if (m.wx > rmMaxX) rmMaxX = m.wx;
      if (m.wy < rmMinY) rmMinY = m.wy;
      if (m.wy > rmMaxY) rmMaxY = m.wy;
    }
    let lvMinX = Infinity, lvMaxX = -Infinity, lvMinY = Infinity, lvMaxY = -Infinity;
    let lvCount = 0;
    for (const m of liveMonuments) {
      if (m.x == null || m.y == null) continue;
      if (m.x < lvMinX) lvMinX = m.x;
      if (m.x > lvMaxX) lvMaxX = m.x;
      if (m.y < lvMinY) lvMinY = m.y;
      if (m.y > lvMaxY) lvMaxY = m.y;
      lvCount++;
    }
    const canCalibrate =
      lvCount >= 3 &&
      isFinite(rmMinX) && rmMaxX - rmMinX > 1 && rmMaxY - rmMinY > 1 &&
      lvMaxX - lvMinX > 1 && lvMaxY - lvMinY > 1;

    /** RustMaps world coord → Rust+ world coord that getNormalizedCoordinates expects. */
    const toRustWorld = (wx: number, wy: number): { x: number; y: number } => {
      if (canCalibrate) {
        return {
          x: lvMinX + ((wx - rmMinX) / (rmMaxX - rmMinX)) * (lvMaxX - lvMinX),
          y: lvMinY + ((wy - rmMinY) / (rmMaxY - rmMinY)) * (lvMaxY - lvMinY),
        };
      }
      // Fallback (no live monuments yet): assume centre-origin if any negative.
      const shift = (rmMinX < 0 || rmMinY < 0) ? mapSize / 2 : 0;
      return { x: wx + shift, y: wy + shift };
    };

    if (raw.length === 0) return out;

    /** "Cave Small Easy" → "Small Cave". */
    const caveLabel = (t: string) => {
      const lo = t.toLowerCase();
      const size = lo.includes('large') ? 'Large' : lo.includes('medium') ? 'Medium' : lo.includes('small') ? 'Small' : '';
      return size ? `${size} Cave` : 'Cave';
    };

    for (const m of raw) {
      const t = m.type.toLowerCase();
      let kind: Ex['kind'] | null = null;
      let label = '';
      if (t.includes('cave') || t.includes('sinkhole')) { kind = 'cave'; label = caveLabel(m.type); }
      else if (t.includes('water well') || t.includes('waterwell')) { kind = 'water_well'; label = 'Water Well'; }
      if (!kind) continue;
      const w = toRustWorld(m.wx, m.wy);
      const { x, y } = getNormalizedCoordinates(w.x, w.y, mapSize, imageWidth, imageHeight, oceanMargin);
      out.push({ kind, label, x, y });
    }
    return out;
  }, [raw, liveMonuments, mapSize, imageWidth, imageHeight, oceanMargin]);

  if (!show || extras.length === 0) return null;

  const STYLE: Record<string, { color: string; Icon: typeof Home }> = {
    cave: { color: '#e8b06a', Icon: Mountain },
    water_well: { color: '#58c6e8', Icon: Droplet },
  };

  return (
    <>
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8 }}>
      {extras.map((m, i) => {
        const id = `${m.kind}-${i}`;
        const st = STYLE[m.kind];
        const Icon = st.Icon;
        const clickable = m.kind === 'water_well';
        const isOpen = openId === id;
        // Compact teardrop. The wrapper is a zero-size point AT the coordinate;
        // the pin is absolutely placed so its bottom TIP lands exactly on it,
        // and the label floats below without shifting the pin.
        const size = 9;
        return (
          <div key={id} style={{
            position: 'absolute', left: `${m.x * 100}%`, top: `${m.y * 100}%`,
            width: 0, height: 0, pointerEvents: 'none', zIndex: isOpen ? 60 : 8,
          }}>
            <div
              onClick={clickable ? (e) => { e.stopPropagation(); setOpenId((v) => (v === id ? null : id)); } : undefined}
              title={m.label}
              style={{
                position: 'absolute', left: 0, bottom: 0, transform: 'translateX(-50%)',
                width: size, height: size, cursor: clickable ? 'pointer' : 'default',
                pointerEvents: clickable ? 'auto' : 'none',
                filter: isOpen ? `drop-shadow(0 0 3px ${st.color})` : 'drop-shadow(0 1px 1px rgba(0,0,0,0.9))',
              }}
            >
              <div style={{
                width: '100%', height: '100%', borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)',
                background: st.color, border: '0.75px solid #0c0e12',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ transform: 'rotate(45deg)', display: 'flex' }}>
                  <Icon size={5} color="#0c0e12" strokeWidth={3} />
                </span>
              </div>
            </div>
            <span style={{
              position: 'absolute', left: 0, top: 1, transform: 'translateX(-50%)',
              fontFamily: 'var(--font-mono)', fontSize: 3.2, fontWeight: 800,
              color: st.color, textShadow: '0 1px 1px rgba(0,0,0,1), 0 0 1.5px rgba(0,0,0,1)',
              whiteSpace: 'nowrap', pointerEvents: 'none', letterSpacing: '0.2px', textTransform: 'uppercase',
            }}>{m.label}</span>
          </div>
        );
      })}
    </div>
    {/* Panel rendered OUTSIDE the pointer-events:none marker layer so the
        backdrop & close button are clickable. */}
    {openId && openId.startsWith('water_well') && <WaterWellPanel onClose={() => setOpenId(null)} />}
    </>
  );
}

/** The Water Well Shopkeeper's full offer pool (source: rusthelp.com).
 *  7 are active at any time; `chance` = probability the offer is in stock.
 *  Cost is in scrap. Verified against the live wiki table. */
const WATER_WELL_OFFERS: { give: string; giveIcon: string; qty: number; cost: number; chance: number }[] = [
  { give: 'Revolver', giveIcon: 'pistol.revolver', qty: 1, cost: 102, chance: 64 },
  { give: 'Double Barrel Shotgun', giveIcon: 'shotgun.double', qty: 1, cost: 112, chance: 64 },
  { give: 'Medical Syringe', giveIcon: 'syringe.medical', qty: 2, cost: 14, chance: 64 },
  { give: 'Pistol Bullet', giveIcon: 'ammo.pistol', qty: 20, cost: 24, chance: 64 },
  { give: 'Pickaxe', giveIcon: 'pickaxe', qty: 1, cost: 36, chance: 40 },
  { give: 'Hatchet', giveIcon: 'hatchet', qty: 1, cost: 36, chance: 40 },
  { give: 'Jackhammer', giveIcon: 'jackhammer', qty: 1, cost: 172, chance: 40 },
  { give: 'Apple', giveIcon: 'apple', qty: 1, cost: 21, chance: 40 },
  { give: 'Advanced Crafting Quality Tea', giveIcon: 'craftingtea.advanced', qty: 1, cost: 55, chance: 40 },
  { give: 'Large Medkit', giveIcon: 'largemedkit', qty: 1, cost: 26, chance: 39 },
  { give: 'Chainsaw', giveIcon: 'chainsaw', qty: 1, cost: 103, chance: 39 },
  { give: 'Hazmat Suit', giveIcon: 'hazmatsuit', qty: 1, cost: 87, chance: 39 },
  { give: 'Advanced Harvesting Tea', giveIcon: 'harvestingtea.advanced', qty: 1, cost: 55, chance: 39 },
  { give: 'Advanced Healing Tea', giveIcon: 'healingtea.advanced', qty: 1, cost: 36, chance: 26 },
  { give: 'Advanced Wood Tea', giveIcon: 'woodtea.advanced', qty: 1, cost: 36, chance: 18 },
  { give: 'Advanced Ore Tea', giveIcon: 'oretea.advanced', qty: 1, cost: 41, chance: 18 },
  { give: 'Advanced Max Health Tea', giveIcon: 'maxhealthtea.advanced', qty: 1, cost: 36, chance: 18 },
  { give: 'Advanced Scrap Tea', giveIcon: 'scraptea.advanced', qty: 1, cost: 55, chance: 9 },
];

/** Water Well shopkeeper offers — a compact centered modal styled like the
 *  Travelling Vendor / event detail popup. Portaled to <body> so the map's
 *  zoom transform doesn't scale or mis-size it, and the backdrop is clickable. */
function WaterWellPanel({ onClose }: { onClose: () => void }) {
  const C = '#58c6e8';
  const cdn = (s: string) => `https://cdn.rusthelp.com/images/128/${s.replace(/[._]/g, '-')}.webp`;
  return createPortal(
    <div
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scrollable"
        style={{
          position: 'relative', width: 300, maxWidth: '88vw', maxHeight: '70vh', overflowY: 'auto',
          background: 'rgba(14, 16, 21, 0.99)', border: `1px solid ${C}55`,
          borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          fontFamily: 'var(--font-mono)', color: '#e8e2d9',
        }}
      >
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', borderTop: `3px solid ${C}`, borderTopLeftRadius: 10, borderTopRightRadius: 10, background: 'rgba(14,16,21,0.99)' }}>
          <button
            onClick={onClose} title="Close"
            style={{
              position: 'absolute', top: 11, right: 11, width: 24, height: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 5, color: '#fff', cursor: 'pointer',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 11, height: 11 }}>
              <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: '0.8px', color: C }}>WATER WELL SHOPKEEPER</h2>
          <div style={{ marginTop: 3, display: 'flex', gap: 7, alignItems: 'center' }}>
            <span style={{ fontSize: 9.5, color: '#9aa0a6' }}>Jungle NPC · trades for scrap</span>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: C, background: `${C}22`, border: `1px solid ${C}55`, padding: '1px 5px', borderRadius: 3 }}>7 ACTIVE</span>
          </div>
        </div>

        {/* Body — offer list */}
        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.8px', color: '#8b857c', marginBottom: 7 }}>
            7 OF {WATER_WELL_OFFERS.length} IN STOCK · % = SPAWN CHANCE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {WATER_WELL_OFFERS.map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, padding: '4px 7px', borderRadius: 5, background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.03)' }}>
                <span style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
                  <img src={cdn(o.giveIcon)} alt="" width={18} height={18} style={{ objectFit: 'contain' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                </span>
                <span style={{ color: '#e8e2d9', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#fff', fontWeight: 700 }}>{o.qty}×</span> {o.give}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <span style={{ color: '#cfae6d', fontWeight: 700 }}>~{o.cost}</span>
                  <img src={cdn('scrap')} alt="scrap" width={14} height={14} style={{ objectFit: 'contain' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                </span>
                <span style={{ color: '#8b857c', fontSize: 8.5, flexShrink: 0, width: 28, textAlign: 'right' }}>{o.chance}%</span>
              </div>
            ))}
          </div>
          <p style={{ margin: '9px 0 0', fontSize: 8.5, color: '#8b857c', fontStyle: 'italic', lineHeight: 1.45 }}>
            Stock rotates each restock — 7 active at a time. Source: rusthelp.com.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CUSTOM_MARKER_ICON: Record<string, typeof Home> = {
  base: Home, enemy: Skull, stash: Package, farm: Pickaxe, loot: Boxes,
  sulfur: Boxes, danger: AlertTriangle, tunnel: DoorOpen, sleeper: Moon,
  roam: Footprints, heli: Plane, flag: Flag, pin: MapPin,
};

/** User-placed custom markers (bases, stashes, enemies, farm spots…). */
function CustomMapMarkers() {
  const markers = useMarkerStore((s) => s.markers);
  const removeMarker = useMarkerStore((s) => s.removeMarker);
  const updateMarker = useMarkerStore((s) => s.updateMarker);
  const movingId = useMarkerStore((s) => s.movingId);
  const beginMove = useMarkerStore((s) => s.beginMove);
  // Global marker-size multiplier (from the Overlays "Marker size" slider).
  const globalScale = useSettingsStore((s) => s.markerScale);
  const [openId, setOpenId] = useState<string | null>(null);

  // Close the editor popup the moment a move begins, so the banner + crosshair
  // own the screen and nothing overlaps the map click.
  useEffect(() => { if (movingId) setOpenId(null); }, [movingId]);

  const placed = markers.filter((m) => isCurrentServer(m.serverId));
  if (placed.length === 0) return null;

  return (
    <div className="map-custom-markers" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8 }}>
      {placed.map((m) => {
        const style = MARKER_KINDS[m.kind] || MARKER_KINDS.pin;
        const Icon = CUSTOM_MARKER_ICON[m.kind] || MapPin;
        const isOpen = openId === m.id;
        const isMoving = movingId === m.id;
        // Per-marker scale × the global multiplier, so the Overlays slider can
        // shrink every custom marker (down to really small) at once.
        const sc = Math.max(0.1, (m.scale || 1) * (globalScale || 1));
        const headSize = 22 * sc;             // diameter of the circular pin
        const iconPx = Math.max(7, Math.round(12 * sc));
        // Below this effective size the label is dropped so the marker collapses
        // to a clean pin/dot that stays legible at 0.1×.
        const showLabel = sc >= 0.5 && !!m.label;
        const highlight = isOpen || isMoving;
        return (
          <div
            key={m.id}
            className="cmark"
            style={{
              position: 'absolute', left: `${m.x * 100}%`, top: `${m.y * 100}%`,
              transform: 'translate(-50%, -50%)', pointerEvents: 'auto',
              zIndex: highlight ? 60 : 8,
              opacity: movingId && !isMoving ? 0.45 : 1,
              transition: 'opacity 0.12s ease-out',
            }}
          >
            {/* Map pin: a clean circular head with the icon dead-centered at
                every size, centred exactly on the coordinate. Click opens the
                editor; the editor's "Move" button starts click-to-place move
                mode. */}
            <div
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); setOpenId((id) => (id === m.id ? null : m.id)); }}
              title={m.label}
              style={{
                position: 'relative', width: headSize, height: headSize, cursor: 'pointer',
                filter: highlight
                  ? `drop-shadow(0 0 6px ${style.color}) drop-shadow(0 3px 4px rgba(0,0,0,0.7))`
                  : 'drop-shadow(0 3px 4px rgba(0,0,0,0.7))',
              }}
            >
              {/* Circular head with a glossy sheen + dark rim. */}
              <div style={{
                position: 'absolute', top: 0, left: 0, width: headSize, height: headSize,
                borderRadius: '50%',
                background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 42%, rgba(0,0,0,0.22) 100%), ${style.color}`,
                border: '1.5px solid rgba(8,10,13,0.88)',
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -2px 3px rgba(0,0,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxSizing: 'border-box',
              }}>
                <Icon size={iconPx} color="#0c0e12" strokeWidth={2.7} />
              </div>
            </div>

            {/* Clean text label — no chip/box; a strong text-shadow keeps it
                legible over any map terrain. Scales with the marker size. */}
            {showLabel && (
              <span style={{
                position: 'absolute', top: `calc(100% + ${Math.max(1, 2 * sc)}px)`, left: '50%',
                transform: 'translateX(-50%)',
                maxWidth: Math.max(90, 120 * sc), overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: 'var(--font-mono)', fontSize: Math.max(7, 7.5 * sc), fontWeight: 800,
                letterSpacing: 0.2, color: style.color, whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,1)',
                pointerEvents: 'none',
              }}>{m.label}</span>
            )}

            {/* Editor popup — modern, sectioned, dark-theme card. */}
            {isOpen && (
              <div
                className="cmark-pop"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{ ['--mk-color' as string]: style.color }}
              >
                <header className="cmark-pop-head">
                  <span className="cmark-pop-head-dot">
                    <Icon size={11} color="#0c0e12" strokeWidth={2.7} />
                  </span>
                  <span className="cmark-pop-head-title">Edit marker</span>
                  <button
                    className="cmark-pop-close"
                    onClick={() => setOpenId(null)}
                    title="Close" aria-label="Close editor"
                  >
                    <X size={13} />
                  </button>
                </header>

                <div className="cmark-pop-body">
                  <label className="cmark-pop-field">
                    <span className="cmark-pop-label">NAME</span>
                    <input
                      className="cmark-pop-input"
                      value={m.label}
                      onChange={(e) => updateMarker(m.id, { label: e.target.value })}
                      placeholder={style.label}
                      aria-label="Marker name"
                    />
                  </label>

                  <label className="cmark-pop-field">
                    <span className="cmark-pop-label">NOTE</span>
                    <textarea
                      className="cmark-pop-textarea"
                      value={m.note || ''}
                      onChange={(e) => updateMarker(m.id, { note: e.target.value })}
                      placeholder="Optional note…"
                      rows={2}
                      aria-label="Marker note"
                    />
                  </label>

                  <div className="cmark-pop-field">
                    <span className="cmark-pop-label">SIZE</span>
                    <div className="cmark-pop-size">
                      <input
                        type="range" min={0.1} max={2} step={0.05} value={m.scale || 1}
                        className="cmark-pop-range"
                        onChange={(e) => updateMarker(m.id, { scale: parseFloat(e.target.value) })}
                        aria-label="Marker size"
                        title="Marker size (0.1 – 2.0)"
                      />
                      <span className="cmark-pop-size-val">{(m.scale || 1).toFixed(2)}×</span>
                    </div>
                  </div>
                </div>

                <div className="cmark-pop-actions">
                  <button
                    className="cmark-pop-btn cmark-pop-btn--move"
                    onClick={() => beginMove(m.id)}
                    title="Move this marker — then click anywhere on the map"
                  >
                    <Move size={12} /> Move marker
                  </button>
                  <button
                    className="cmark-pop-btn cmark-pop-btn--del"
                    onClick={() => { removeMarker(m.id); setOpenId(null); }}
                    title="Delete marker"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DecayMapMarkers() {
  const markers = useDecayStore((s) => s.markers);
  const mapSize = useMapStore((s) => s.mapSize);
  const oceanMargin = useMapStore((s) => s.oceanMargin || 0);
  const imageWidth = useMapStore((s) => s.mapImageWidth || 0);
  const imageHeight = useMapStore((s) => s.mapImageHeight || 0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Live countdown refresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Resolve a render position for every marker on the CURRENT server only —
  // off-server markers don't correspond to this map's geography.
  const placed = markers
    .map((m) => {
      if (!isCurrentServer(m.serverId)) return null;
      let pos: { x: number; y: number } | null = null;
      if (m.x !== undefined && m.y !== undefined) {
        pos = { x: m.x, y: m.y };
      } else if (m.grid) {
        pos = gridToNormalizedCoordinates(m.grid, mapSize, imageWidth, imageHeight, oceanMargin);
      }
      return pos ? { m, pos } : null;
    })
    .filter((v): v is { m: typeof markers[number]; pos: { x: number; y: number } } => v !== null);

  if (placed.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8 }}>
      {placed.map(({ m, pos }) => {
        const remaining = m.decaysAt - Date.now();
        const total = DECAY_HOURS[m.material] * 3600_000;
        const pct = Math.max(0, Math.min(1, remaining / total));
        const color = remaining <= 0 ? '#ef4444' : pct < 0.25 ? '#f5c451' : '#6fcf73';
        const hrsLeft = Math.max(0, Math.floor(remaining / 3600_000));
        const minLeft = Math.max(0, Math.floor((remaining % 3600_000) / 60_000));
        const countdown = remaining <= 0 ? 'DECAYED' : `${hrsLeft}h ${minLeft}m left`;
        // Estimated current HP drains linearly with the decay window.
        const maxHp = MAX_HP[m.material];
        const estHp = remaining <= 0 ? 0 : Math.round(pct * maxHp);
        const isHover = hoverId === m.id;

        return (
          <div
            key={m.id}
            onMouseEnter={() => setHoverId(m.id)}
            onMouseLeave={() => setHoverId((id) => (id === m.id ? null : id))}
            style={{
              position: 'absolute',
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              transform: 'translate(-50%, -100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'auto',
              cursor: 'pointer',
              zIndex: isHover ? 50 : 8,
            }}
          >
            {/* House/decay pin */}
            <svg viewBox="0 0 24 24" fill={color} stroke="#0c0e12" strokeWidth="1.5" style={{ width: 16, height: 16, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}>
              <path d="M12 2L2 11h3v9h6v-6h2v6h6v-9h3L12 2z" />
            </svg>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 5.5, fontWeight: 700,
              color, textShadow: '0 1px 2px rgba(0,0,0,1)', whiteSpace: 'nowrap',
            }}>
              {remaining <= 0 ? 'DECAYED' : `${hrsLeft}h${minLeft}m · ${estHp}hp`}
            </span>

            {/* Rich hover tooltip */}
            {isHover && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 6,
                  width: 180,
                  background: 'rgba(11, 13, 17, 0.97)',
                  border: `1px solid ${color}66`,
                  borderRadius: 8,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.85)',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                }}
              >
                {m.screenshot && (
                  <img
                    src={m.screenshot}
                    alt={m.label}
                    style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                  />
                )}
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fdf3e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.label}
                    </span>
                    {m.grid && (
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                        color: '#58c6e8', background: 'rgba(88,198,232,0.12)',
                        border: '1px solid rgba(88,198,232,0.25)', padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                      }}>{m.grid}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{MATERIAL_LABEL[m.material]}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color }}>{countdown}</span>
                  </div>
                  {/* Estimated HP */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Est. HP</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#58c6e8' }}>{estHp} / {maxHp}</span>
                  </div>
                  {/* Decay progress bar */}
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 3 }} />
                  </div>
                  {m.note && (
                    <div style={{ fontSize: 9.5, color: 'var(--color-text-dim)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.note}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CrateMapMarkers() {
  const markers = useCrateStore((s) => s.markers);
  const updateMarker = useCrateStore((s) => s.updateMarker);
  const removeMarker = useCrateStore((s) => s.removeMarker);
  const monuments = useMapStore((s) => s.monuments);
  const liveMarkers = useMapStore((s) => s.markers);
  const mapSize = useMapStore((s) => s.mapSize);
  const oceanMargin = useMapStore((s) => s.oceanMargin || 0);
  const imageWidth = useMapStore((s) => s.mapImageWidth || 0);
  const imageHeight = useMapStore((s) => s.mapImageHeight || 0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // 1s tick for a live countdown — only while crates exist and window is shown.
  const hasCrates = markers.length > 0;
  useEffect(() => {
    if (!hasCrates) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id == null) id = setInterval(() => setTick((t) => t + 1), 1000); };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [hasCrates]);

  // Live cargo ship marker (position + heading), if present.
  const cargo = liveMarkers.find((mk) => mk.type === 'cargo_ship');

  // Place the 3 cargo crates ALONG the ship's hull (front → mid → back) using
  // its heading so they sit directly on the cargo PNG and move with it. The
  // ship icon is ~18px (~0.022 of an 800px map), so we space crates by a small
  // fraction of that length down the hull axis.
  const cargoCratePos = (slot: string): { x: number; y: number } | null => {
    if (!cargo) return null;
    const headingDeg = (cargo.rotation || 0);
    const rad = (headingDeg * Math.PI) / 180;
    // Forward (hull-axis) unit vector and the perpendicular (beam) vector.
    const fx = Math.sin(rad);
    const fy = -Math.cos(rad);
    // Spread up to 5 slots along the hull axis so they don't overlap. The deck
    // crates on a real cargo ship cluster toward the stern, so bias slightly aft.
    const alongBy: Record<string, number> = {
      'front': 0.010, 'mid-front': 0.005, 'middle': 0, 'mid-back': -0.005, 'back': -0.010,
    };
    const along = alongBy[slot] ?? 0;
    return { x: cargo.x + fx * along, y: cargo.y + fy * along };
  };

  const placed = markers
    .map((m) => {
      if (!isCurrentServer(m.serverId)) return null;
      let pos: { x: number; y: number } | null = null;
      if (m.target === 'cargo') {
        pos = cargoCratePos(m.cargoPos || 'middle');
      } else if (m.x !== undefined && m.y !== undefined) {
        // Direct map coordinates (e.g. heli crash crates).
        pos = { x: m.x, y: m.y };
      } else {
        // Monument target — resolve from the loaded monuments by canonical key
        // (handles aliases, e.g. large oil rig's token normalizes to oilrig_2).
        const mon = monuments.find((mo) =>
          normalizeMonumentKey(mo.token) === m.target || getMonumentInfo(mo.token)?.key === m.target);
        if (mon) {
          pos = getNormalizedCoordinates(mon.x, mon.y, mapSize, imageWidth, imageHeight, oceanMargin);
        }
      }
      return pos ? { m, pos } : null;
    })
    .filter((v): v is { m: typeof markers[number]; pos: { x: number; y: number } } => v !== null);

  if (placed.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9 }}>
      {placed.map(({ m, pos }) => {
        const remaining = m.unlocksAt - Date.now();
        const total = Math.max(1, m.unlocksAt - m.startedAt);
        const pct = Math.max(0, Math.min(1, remaining / total));
        const unlocked = remaining <= 0;
        const color = unlocked ? '#6fcf73' : pct < 0.25 ? '#f5c451' : '#ff9100';
        const totalSec = Math.max(0, Math.floor(remaining / 1000));
        const hh = Math.floor(totalSec / 3600);
        const mm = Math.floor((totalSec % 3600) / 60);
        const ss = totalSec % 60;
        const shortLabel = unlocked ? 'OPEN' : (hh > 0
          ? `${hh}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
          : `${mm}:${ss.toString().padStart(2, '0')}`);
        const isHover = hoverId === m.id;
        const isCargo = m.target === 'cargo';
        const isHeli = m.kind === 'heli';

        let offsetX = 0;
        let offsetY = 0;
        if (isCargo && cargo) {
          const headingDeg = (cargo.rotation || 0);
          const rad = (headingDeg * Math.PI) / 180;
          // Beam (perpendicular to hull) unit vector — push crates onto the
          // port/starboard deck rather than off the side of the ship.
          const px = Math.cos(rad);
          const py = Math.sin(rad);
          // Alternate crates port/starboard so stacked timers stay readable.
          const slot = m.cargoPos || 'middle';
          const sides: Record<string, number> = {
            'front': 1, 'mid-front': -1, 'middle': 1, 'mid-back': -1, 'back': 1,
          };
          const side = sides[slot] ?? 1;
          // Tight to the hull (≈half the previous offset) so crates sit on deck.
          offsetX = px * side * 8;
          offsetY = py * side * 8;
        }

        return (
          <div
            key={m.id}
            onMouseEnter={() => setHoverId(m.id)}
            onMouseLeave={() => setHoverId((id) => (id === m.id ? null : id))}
            onClick={(e) => {
              e.stopPropagation();
              const secs = Math.max(0, Math.round((m.unlocksAt - Date.now()) / 1000));
              setEditVal(`${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`);
              setEditId((id) => (id === m.id ? null : m.id));
            }}
            style={{
              position: 'absolute',
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              // Cargo crates sit centered ON the ship sprite and glide with it;
              // monument crates hang as a pin above the monument.
              transform: isCargo ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'auto',
              cursor: 'pointer',
              zIndex: isHover ? 50 : 9,
              transition: isCargo ? 'left 1.5s linear, top 1.5s linear' : 'none',
              willChange: isCargo ? 'left, top' : undefined,
            }}
          >
            {/* Locked crate — in-game crate image with a black outline. Heli
                crashes render the burning-wreck explosion sprite instead.
                Cargo deck crates render small so the four don't crowd the ship. */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: isHeli ? 22 : isCargo ? 10 : 15, height: isHeli ? 22 : isCargo ? 10 : 15 }}>
              <img
                src={isHeli ? '/images/markers/explosion_sprite.png' : '/images/markers/locked_crate.webp'}
                alt={isHeli ? 'Heli Crash' : 'Locked Crate'}
                draggable={false}
                style={{
                  width: isHeli ? 20 : isCargo ? 9 : 13, height: isHeli ? 20 : isCargo ? 9 : 13, objectFit: 'contain',
                  filter: unlocked
                    ? 'drop-shadow(0 0 0 #000) drop-shadow(0 0 1px #000) drop-shadow(0 1px 2px rgba(0,0,0,0.95)) saturate(0.6) brightness(1.1)'
                    : 'drop-shadow(0 0 0 #000) drop-shadow(0 0 1px #000) drop-shadow(0 1px 2px rgba(0,0,0,0.95))',
                }}
              />
            </div>
            {/* Timer: Cargo timers are rendered as clean, high-contrast text with a strong shadow, offset perpendicular to the ship heading.
                Others are standard text under the monument pin. */}
            <span style={isCargo ? {
              position: 'absolute', zIndex: 5,
              left: `calc(50% + ${offsetX}px)`,
              top: `calc(50% + ${offsetY}px)`,
              transform: 'translate(-50%, -50%)',
              fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 800,
              color: unlocked ? '#7be081' : '#fff',
              textShadow: '0 0 3px rgba(0,0,0,1), 0 1px 2px rgba(0,0,0,1), 0 0 5px rgba(0,0,0,0.9)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            } : {
              position: 'relative', zIndex: 5,
              fontFamily: 'var(--font-mono)', fontSize: 7.5, fontWeight: 800,
              color: unlocked ? '#7be081' : '#fff',
              textShadow: '0 0 3px rgba(0,0,0,1), 0 1px 2px rgba(0,0,0,1), 0 0 5px rgba(0,0,0,0.9)',
              whiteSpace: 'nowrap', marginTop: 0, letterSpacing: '0.3px', lineHeight: 1,
            }}>
              {shortLabel}
            </span>

            {isHover && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 8,
                  width: 160,
                  background: 'rgba(15, 17, 23, 0.96)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: `1px solid rgba(255, 255, 255, 0.08)`,
                  borderRadius: '8px',
                  boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  pointerEvents: 'none',
                  fontFamily: 'var(--font-mono)',
                  zIndex: 100,
                }}
              >
                {/* HUD Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 6.5, fontWeight: 700, color, opacity: 0.8, letterSpacing: '0.8px', borderBottom: `1px solid rgba(255, 255, 255, 0.08)`, paddingBottom: 4, marginBottom: 2 }}>
                  <span>TACTICAL // {isHeli ? 'HELI_CRASH' : isCargo ? 'CARGO_DECK' : 'LAND_MONUMENT'}</span>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}` }} />
                </div>

                {/* Content */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#f1ebd9', textTransform: 'uppercase', letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isCargo ? `Cargo ${m.cargoPos ? m.cargoPos.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-') : ''}` : m.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 1 }}>
                    <span style={{ fontSize: 7, color: '#8c95a0', letterSpacing: '0.2px' }}>ETA UNLOCK:</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color, textShadow: `0 0 6px ${color}55` }}>
                      {shortLabel}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden', marginTop: 2 }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: color, boxShadow: `0 0 4px ${color}` }} />
                </div>
              </div>
            )}

            {/* Click-to-edit panel: change the timer or remove the crate */}
            {editId === m.id && (() => {
              const setTimer = (sec: number) => {
                const now = Date.now();
                updateMarker(m.id, { startedAt: now, unlocksAt: now + sec * 1000 });
              };
              const applyInput = () => {
                const parts = editVal.trim().split(':');
                let sec = 0;
                if (parts.length === 1) sec = parseInt(parts[0], 10) * 60;
                else if (parts.length === 2) sec = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                else if (parts.length === 3) sec = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
                if (!isNaN(sec) && sec >= 0) { setTimer(sec); setEditId(null); }
              };
              return (
              <div
                onClick={(e) => e.stopPropagation()}
                className="crate-ctrl"
                style={{ ['--cc-accent' as any]: color, ['--cc-glow' as any]: `${color}66` }}
              >
                <div className="crate-ctrl-head">
                  <span className="cc-icon">
                    {isHeli
                      ? <Flame size={14} color={color} />
                      : <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ width: 14, height: 14 }}><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" /><path d="M3 7l9 4 9-4" /><path d="M12 11v10" /></svg>}
                  </span>
                  <span className="crate-ctrl-title">
                    <b>{isCargo ? `Cargo ${m.cargoPos || ''}` : m.label}</b>
                    <span>{isHeli ? 'Heli Crash' : 'Locked Crate'}</span>
                  </span>
                  <button className="crate-ctrl-x" onClick={() => setEditId(null)}><X size={11} /></button>
                </div>

                <div className="crate-ctrl-count">
                  <b>{shortLabel}</b>
                  {!unlocked && <small>until unlock</small>}
                </div>
                <div className="crate-ctrl-bar"><div style={{ width: `${pct * 100}%`, background: color, boxShadow: `0 0 5px ${color}` }} /></div>

                <div className="crate-ctrl-body">
                  <div className="crate-ctrl-set">
                    <input
                      type="text" value={editVal} placeholder="15:00" autoFocus
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') applyInput(); if (e.key === 'Escape') setEditId(null); }}
                    />
                    <button className="crate-ctrl-set-btn" onClick={applyInput}>SET</button>
                  </div>

                  <div className="crate-ctrl-row">
                    <button className="cc-btn" onClick={() => setTimer((useSettingsStore.getState().defaultCrateSeconds || 900))}>
                      <RotateCcw size={10} /> RESET
                    </button>
                    <button className="cc-btn cc-btn--green" onClick={() => { const now = Date.now(); updateMarker(m.id, { startedAt: now - 1000, unlocksAt: now - 1000 }); }}>
                      <LockOpen size={10} /> UNLOCK
                    </button>
                    <button className="cc-btn cc-btn--red" onClick={() => { const now = Date.now(); const next = Math.max(0, (m.unlocksAt - now) - 60_000); updateMarker(m.id, { unlocksAt: now + next }); }}>
                      <Minus size={10} /> 1 MIN
                    </button>
                    <button className="cc-btn cc-btn--green" onClick={() => { const now = Date.now(); updateMarker(m.id, { unlocksAt: now + (m.unlocksAt - now) + 60_000 }); }}>
                      <Plus size={10} /> 1 MIN
                    </button>
                  </div>

                  {isHeli && (
                    <button className="cc-btn cc-btn--info cc-btn--full" onClick={() => { setDetailsId(m.id); setEditId(null); }}>
                      <Info size={11} /> CRASH DETAILS &amp; LOOT
                    </button>
                  )}

                  <button className="cc-btn cc-btn--red cc-btn--full" onClick={() => { removeMarker(m.id); setEditId(null); }}>
                    <Trash2 size={10} /> DELETE TIMER
                  </button>
                </div>
              </div>
              );
            })()}
          </div>
        );
      })}
      {detailsId && (() => {
        const m = markers.find((mk) => mk.id === detailsId);
        if (!m) return null;
        return <HeliCrashPanel marker={m} onClose={() => setDetailsId(null)} />;
      })()}
    </div>
  );
}

/** Full heli-crash details: crash info + clickable loot tables (crates + wreck). */
function HeliCrashPanel({ marker, onClose }: { marker: { grid?: string; label?: string }; onClose: () => void }) {
  const [lootPopup, setLootPopup] = useState<string | null>(null);
  const grid = marker.grid || '?';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="scrollable" style={{ position: 'relative', width: 360, maxWidth: '92%', maxHeight: '85%', overflowY: 'auto', background: 'rgba(14,16,21,0.98)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, boxShadow: '0 24px 70px rgba(0,0,0,0.75)', fontFamily: 'var(--font-mono)', color: '#e8e2d9' }}>
        <div style={{ position: 'relative', padding: '16px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', borderTop: '3px solid #ef4444', borderTopLeftRadius: 12, borderTopRightRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/images/markers/explosion_sprite.png" alt="" style={{ width: 38, height: 38, objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '1px', color: '#ef4444' }}>HELI CRASH</h2>
            <div style={{ marginTop: 3, fontSize: 10, color: '#9aa0a6' }}>Patrol Helicopter wreck
              <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: '#ef4444', background: '#ef444422', border: '1px solid #ef444455', padding: '1px 6px', borderRadius: 3 }}>{grid}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, color: '#fff', cursor: 'pointer' }}><X size={12} /></button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { label: 'Crates', value: '4 (burning — wait to loot)' },
              { label: 'Body gibs', value: 'HQM · Metal Frags · Charcoal' },
              { label: 'Fire duration', value: '~2-3 min before crates open' },
              { label: 'Visible to', value: 'Whole server (debris marker)' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '6px 9px' }}>
                <span style={{ color: '#8b857c' }}>{r.label}</span>
                <span style={{ color: '#e8e2d9', fontWeight: 600, textAlign: 'right' }}>{r.value}</span>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', color: '#8b857c', marginBottom: 6 }}>LOOT (tap for drop %)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <button onClick={() => setLootPopup('heli_crate')} style={lootBtnStyle('#f5c451')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#f5c451" strokeWidth="2" style={{ width: 12, height: 12 }}><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" /><path d="M3 7l9 4 9-4" /><path d="M12 11v10" /></svg>
                  Helicopter Crate
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: '#f5c451', fontWeight: 700 }}>×4</span><span style={{ color: '#8b857c', fontSize: 9 }}>loot ›</span></span>
              </button>
              <button onClick={() => setLootPopup('heli_body')} style={lootBtnStyle('#ef6b6b')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame size={12} color="#ef6b6b" /> Farm the Wreck</span>
                <span style={{ color: '#8b857c', fontSize: 9 }}>gibs ›</span>
              </button>
            </div>
          </div>

          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              'Crates pop once the fuselage finishes burning — bring a tool.',
              'Mine the burnt-out body for ~100-150 HQM, metal fragments & charcoal.',
              'Crash site is visible to everyone — expect company.',
              'The main rotor may still spin on the ground; mind your step.',
            ].map((n, i) => <li key={i} style={{ fontSize: 10.5, color: '#c4bdb1', lineHeight: 1.45 }}>{n}</li>)}
          </ul>
        </div>

        {lootPopup && <CrateLootPopup tableId={lootPopup} onClose={() => setLootPopup(null)} />}
      </div>
    </div>
  );
}

function lootBtnStyle(c: string): React.CSSProperties {
  return { textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, background: `${c}11`, border: `1px solid ${c}33`, borderRadius: 5, padding: '7px 9px', color: '#e8e2d9', fontFamily: 'var(--font-mono)' };
}

/** Loot table popup (drop list) used by the heli crash panel. */
function CrateLootPopup({ tableId, onClose }: { tableId: string; onClose: () => void }) {
  const table = getLootTable(tableId);
  if (!table) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="scrollable" style={{ width: 320, maxWidth: '90%', maxHeight: '80%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(14,16,21,0.99)', border: '1px solid rgba(245,196,81,0.4)', borderRadius: 12, boxShadow: '0 24px 70px rgba(0,0,0,0.75)', fontFamily: 'var(--font-mono)', color: '#e8e2d9' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onClose} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, color: '#fff', cursor: 'pointer' }}><X size={11} /></button>
        </div>
        <LootTableView table={table} />
      </div>
    </div>
  );
}




