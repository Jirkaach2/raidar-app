import { useState } from 'react';
import { useMarkerStore, MARKER_KINDS, CustomMarkerKind } from '@/stores/marker-store';
import {
  MapPin, Home, Skull, Package, Pickaxe, Boxes, AlertTriangle, X,
  DoorOpen, Moon, Footprints, Plane, Flag,
} from 'lucide-react';
import './MarkerToolbar.css';

const KIND_ICON: Record<CustomMarkerKind, typeof Home> = {
  base: Home, enemy: Skull, stash: Package, farm: Pickaxe, loot: Boxes,
  sulfur: Boxes, danger: AlertTriangle, tunnel: DoorOpen, sleeper: Moon,
  roam: Footprints, heli: Plane, flag: Flag, pin: MapPin,
};

const KIND_ORDER: CustomMarkerKind[] = [
  'base', 'enemy', 'stash', 'loot', 'farm', 'sulfur',
  'danger', 'tunnel', 'sleeper', 'roam', 'heli', 'flag', 'pin',
];

export function MarkerToolbar() {
  const placeMode = useMarkerStore((s) => s.placeMode);
  const pendingKind = useMarkerStore((s) => s.pendingKind);
  const setPlaceMode = useMarkerStore((s) => s.setPlaceMode);
  const count = useMarkerStore((s) => s.markers.length);
  const [open, setOpen] = useState(false);

  const start = (kind: CustomMarkerKind) => {
    setPlaceMode(true, kind);
    setOpen(false);
  };

  return (
    <div className="mtb">
      <button
        className={`mtb-btn ${open || placeMode ? 'open' : ''}`}
        onClick={() => { if (placeMode) { setPlaceMode(false); } else { setOpen((v) => !v); } }}
        title={placeMode ? 'Cancel placing' : 'Drop a map marker'}
      >
        <MapPin size={15} />
      </button>
      {count > 0 && !placeMode && <span className="mtb-count">{count}</span>}

      {placeMode && (
        <div className="mtb-active">
          <span className="mtb-active-dot" />
          <span className="mtb-active-text">
            Click the map to drop <b>{MARKER_KINDS[pendingKind].label}</b>
          </span>
          <button className="mtb-cancel" onClick={() => setPlaceMode(false)} title="Cancel">
            <X size={14} />
          </button>
        </div>
      )}

      {open && !placeMode && (
        <div className="mtb-menu">
          <div className="mtb-menu-title">DROP A MARKER</div>
          <div className="mtb-grid">
            {KIND_ORDER.map((k) => {
              const Icon = KIND_ICON[k];
              const style = MARKER_KINDS[k];
              return (
                <button key={k} className="mtb-kind" onClick={() => start(k)} title={style.label}>
                  <span className="mtb-kind-dot" style={{ background: style.color }}>
                    <Icon size={12} color="#0c0e12" strokeWidth={2.6} />
                  </span>
                  <span className="mtb-kind-label">{style.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mtb-hint">Click a type, then click the map. Click any marker to rename, resize, move or delete it.</p>
        </div>
      )}
    </div>
  );
}
