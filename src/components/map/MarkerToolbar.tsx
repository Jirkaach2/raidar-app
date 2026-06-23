import { useEffect, useMemo, useState } from 'react';
import { useMarkerStore, MARKER_KINDS, CustomMarkerKind } from '@/stores/marker-store';
import { isCurrentServer } from '@/utils/server';
import {
  MapPin, Home, Skull, Package, Pickaxe, Boxes, AlertTriangle, X,
  DoorOpen, Moon, Footprints, Plane, Flag, Trash2, Pencil, List, Plus, Check,
  Search,
} from 'lucide-react';
import './MarkerToolbar.css';

const KIND_ICON: Record<CustomMarkerKind, typeof Home> = {
  base: Home, enemy: Skull, stash: Package, farm: Pickaxe, loot: Boxes,
  sulfur: Boxes, danger: AlertTriangle, tunnel: DoorOpen, sleeper: Moon,
  roam: Footprints, heli: Plane, flag: Flag, pin: MapPin,
};

/** Logical groupings so the picker reads as categories instead of a flat wall. */
const CATEGORIES: { id: string; label: string; kinds: CustomMarkerKind[] }[] = [
  { id: 'base', label: 'Base & Storage', kinds: ['base', 'stash'] },
  { id: 'threat', label: 'Threats', kinds: ['enemy', 'danger', 'sleeper'] },
  { id: 'resource', label: 'Resources', kinds: ['farm', 'sulfur', 'loot'] },
  { id: 'nav', label: 'Navigation', kinds: ['roam', 'tunnel', 'heli', 'flag', 'pin'] },
];

/** Quick reverse lookup: which category a given kind belongs to. */
const KIND_CATEGORY: Record<CustomMarkerKind, string> = CATEGORIES.reduce(
  (acc, cat) => {
    cat.kinds.forEach((k) => { acc[k] = cat.id; });
    return acc;
  },
  {} as Record<CustomMarkerKind, string>,
);

type Tab = 'place' | 'manage';
type Filter = 'all' | string;

export function MarkerToolbar() {
  const placeMode = useMarkerStore((s) => s.placeMode);
  const pendingKind = useMarkerStore((s) => s.pendingKind);
  const setPlaceMode = useMarkerStore((s) => s.setPlaceMode);
  const markers = useMarkerStore((s) => s.markers);
  const updateMarker = useMarkerStore((s) => s.updateMarker);
  const removeMarker = useMarkerStore((s) => s.removeMarker);
  const clearMarkers = useMarkerStore((s) => s.clearMarkers);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('place');
  const [confirmClear, setConfirmClear] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  // Only markers on the connected server are rendered on the map, so the
  // toolbar count + manage list mirror that exact set.
  const placed = useMemo(
    () => markers.filter((m) => isCurrentServer(m.serverId)),
    [markers],
  );
  const count = placed.length;

  // Per-kind + per-category tallies power the count pills throughout the UI.
  const { byKind, byCategory } = useMemo(() => {
    const k = {} as Record<CustomMarkerKind, number>;
    const c: Record<string, number> = {};
    for (const m of placed) {
      k[m.kind] = (k[m.kind] ?? 0) + 1;
      const catId = KIND_CATEGORY[m.kind] ?? 'nav';
      c[catId] = (c[catId] ?? 0) + 1;
    }
    return { byKind: k, byCategory: c };
  }, [placed]);

  // Manage list honours the active category filter + free-text label search.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return placed.filter((m) => {
      if (filter !== 'all' && KIND_CATEGORY[m.kind] !== filter) return false;
      if (q && !(m.label || MARKER_KINDS[m.kind].label).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [placed, filter, query]);

  // Close the panel + reset transient UI on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setConfirmClear(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Drop the confirm-clear prompt whenever the list empties or the tab changes.
  useEffect(() => { setConfirmClear(false); }, [tab, count]);

  const start = (kind: CustomMarkerKind) => {
    setPlaceMode(true, kind);
    setOpen(false);
  };

  const toggleButton = () => {
    if (placeMode) { setPlaceMode(false); return; }
    setOpen((v) => !v);
  };

  const doClear = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearMarkers('current');
    setConfirmClear(false);
  };

  return (
    <div className="mtb">
      <button
        className={`mtb-btn ${open || placeMode ? 'open' : ''}`}
        onClick={toggleButton}
        aria-label={placeMode ? 'Cancel placing marker' : 'Map markers'}
        title={placeMode ? 'Cancel placing' : 'Map markers'}
      >
        <MapPin size={15} />
      </button>
      {count > 0 && !placeMode && <span className="mtb-count" aria-hidden>{count}</span>}

      {placeMode && (
        <div className="mtb-active" role="status">
          <span className="mtb-active-dot" />
          <span className="mtb-active-text">
            Click the map to drop <b>{MARKER_KINDS[pendingKind].label}</b>
          </span>
          <button className="mtb-cancel" onClick={() => setPlaceMode(false)} title="Cancel" aria-label="Cancel placing">
            <X size={14} />
          </button>
        </div>
      )}

      {open && !placeMode && (
        <div className="mtb-panel" role="dialog" aria-label="Map markers">
          <header className="mtb-head">
            <span className="mtb-head-title">MARKERS</span>
            <span className="mtb-head-count">{count} on map</span>
            <button className="mtb-head-close" onClick={() => setOpen(false)} title="Close" aria-label="Close">
              <X size={13} />
            </button>
          </header>

          <div className="mtb-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'place'}
              className={`mtb-tab ${tab === 'place' ? 'active' : ''}`}
              onClick={() => setTab('place')}
            >
              <Plus size={12} /> Place
            </button>
            <button
              role="tab"
              aria-selected={tab === 'manage'}
              className={`mtb-tab ${tab === 'manage' ? 'active' : ''}`}
              onClick={() => setTab('manage')}
            >
              <List size={12} /> Manage{count > 0 ? ` (${count})` : ''}
            </button>
          </div>

          {tab === 'place' && (
            <div className="mtb-body">
              {CATEGORIES.map((cat) => {
                const catCount = byCategory[cat.id] ?? 0;
                return (
                  <section key={cat.id} className="mtb-cat">
                    <div className="mtb-cat-label">
                      <span>{cat.label}</span>
                      {catCount > 0 && <span className="mtb-cat-count">{catCount}</span>}
                    </div>
                    <div className="mtb-grid">
                      {cat.kinds.map((k) => {
                        const Icon = KIND_ICON[k];
                        const style = MARKER_KINDS[k];
                        const n = byKind[k] ?? 0;
                        const isActive = pendingKind === k;
                        return (
                          <button
                            key={k}
                            className={`mtb-kind ${isActive ? 'active' : ''}`}
                            onClick={() => start(k)}
                            title={`Place ${style.label}${n ? ` — ${n} on map` : ''}`}
                            aria-label={`Place ${style.label}`}
                            style={{ ['--kind-color' as string]: style.color }}
                          >
                            <span className="mtb-kind-dot" style={{ background: style.color }}>
                              <Icon size={12} color="#0c0e12" strokeWidth={2.6} />
                            </span>
                            <span className="mtb-kind-label">{style.label}</span>
                            {n > 0 && <span className="mtb-kind-count" aria-hidden>{n}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              <p className="mtb-hint">
                Pick a type, then click the map. Click any placed marker to rename, resize, move or delete it.
              </p>
            </div>
          )}

          {tab === 'manage' && (
            <div className="mtb-body">
              {count === 0 ? (
                <div className="mtb-empty">
                  <MapPin size={18} />
                  <span>No markers on this server yet.</span>
                  <button className="mtb-empty-cta" onClick={() => setTab('place')}>
                    <Plus size={12} /> Place one
                  </button>
                </div>
              ) : (
                <>
                  <div className="mtb-search">
                    <Search size={12} className="mtb-search-icon" />
                    <input
                      className="mtb-search-input"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search markers…"
                      aria-label="Search markers by label"
                    />
                    {query && (
                      <button
                        className="mtb-search-clear"
                        onClick={() => setQuery('')}
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  <div className="mtb-filters" role="group" aria-label="Filter by category">
                    <button
                      className={`mtb-chip ${filter === 'all' ? 'active' : ''}`}
                      onClick={() => setFilter('all')}
                    >
                      All <span className="mtb-chip-count">{count}</span>
                    </button>
                    {CATEGORIES.map((cat) => {
                      const n = byCategory[cat.id] ?? 0;
                      if (n === 0) return null;
                      return (
                        <button
                          key={cat.id}
                          className={`mtb-chip ${filter === cat.id ? 'active' : ''}`}
                          onClick={() => setFilter(cat.id)}
                          title={`Show ${cat.label}`}
                        >
                          {cat.label} <span className="mtb-chip-count">{n}</span>
                        </button>
                      );
                    })}
                  </div>

                  {visible.length === 0 ? (
                    <div className="mtb-empty mtb-empty--filter">
                      <span>No markers match this filter.</span>
                      <button
                        className="mtb-empty-cta"
                        onClick={() => { setFilter('all'); setQuery(''); }}
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    <div className="mtb-list">
                      {visible.map((m) => {
                        const style = MARKER_KINDS[m.kind] || MARKER_KINDS.pin;
                        const Icon = KIND_ICON[m.kind] || MapPin;
                        return (
                          <div key={m.id} className="mtb-row">
                            <span className="mtb-row-dot" style={{ background: style.color }} title={style.label}>
                              <Icon size={11} color="#0c0e12" strokeWidth={2.6} />
                            </span>
                            <span className="mtb-row-edit">
                              <Pencil size={10} className="mtb-row-pencil" />
                              <input
                                className="mtb-row-input"
                                value={m.label}
                                onChange={(e) => updateMarker(m.id, { label: e.target.value })}
                                placeholder={style.label}
                                aria-label="Marker label"
                              />
                            </span>
                            <button
                              className="mtb-row-del"
                              onClick={() => removeMarker(m.id)}
                              title="Delete marker"
                              aria-label={`Delete ${m.label || style.label}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    className={`mtb-clear ${confirmClear ? 'confirm' : ''}`}
                    onClick={doClear}
                    title="Delete every marker on this server"
                  >
                    {confirmClear ? <><Check size={12} /> Delete all {count}?</> : <><Trash2 size={12} /> Clear all</>}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
