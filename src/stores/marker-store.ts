import { create } from 'zustand';
import { isCurrentServer } from '@/utils/server';

/**
 * Custom user map markers — player-placed pins for bases, stashes, farms,
 * roam routes, enemy bases, etc. Persisted to localStorage per server.
 */

export type CustomMarkerKind =
  | 'base' | 'enemy' | 'stash' | 'farm' | 'loot' | 'sulfur' | 'danger'
  | 'tunnel' | 'sleeper' | 'roam' | 'heli' | 'flag' | 'pin';

export interface CustomMarkerStyle {
  label: string;
  color: string;
  /** Lucide icon name resolved in the component. */
  icon: CustomMarkerKind;
}

export const MARKER_KINDS: Record<CustomMarkerKind, CustomMarkerStyle> = {
  base:    { label: 'Our Base',     color: '#6fcf73', icon: 'base' },
  enemy:   { label: 'Enemy Base',   color: '#ef4444', icon: 'enemy' },
  stash:   { label: 'Stash',        color: '#f5c451', icon: 'stash' },
  farm:    { label: 'Farm Spot',    color: '#8fe093', icon: 'farm' },
  loot:    { label: 'Loot',         color: '#e6a64a', icon: 'loot' },
  sulfur:  { label: 'Sulfur Node',  color: '#e8d44a', icon: 'sulfur' },
  danger:  { label: 'Danger',       color: '#ff7043', icon: 'danger' },
  tunnel:  { label: 'Tunnel/Entry', color: '#a855f7', icon: 'tunnel' },
  sleeper: { label: 'Sleeper',      color: '#cfd4dc', icon: 'sleeper' },
  roam:    { label: 'Roam Route',   color: '#58c6e8', icon: 'roam' },
  heli:    { label: 'Heli Pad',     color: '#ff9d3b', icon: 'heli' },
  flag:    { label: 'Objective',    color: '#ce422b', icon: 'flag' },
  pin:     { label: 'Marker',       color: '#58c6e8', icon: 'pin' },
};

export interface CustomMarker {
  id: string;
  kind: CustomMarkerKind;
  label: string;
  note?: string;
  x: number;             // normalized 0-1
  y: number;
  /**
   * Display size multiplier. Drives BOTH the on-map pin px and its label font
   * px from one factor. Allowed range is 0.1 (really small) … 2.0 (large);
   * defaults to 1. Persisted with the rest of the marker.
   */
  scale?: number;
  createdAt: number;
  serverId?: string;     // `ip:port`
  serverName?: string;
}

interface MarkerState {
  markers: CustomMarker[];
  /** Map is in "drop a marker" mode; next map click places `pendingKind`. */
  placeMode: boolean;
  pendingKind: CustomMarkerKind;
  /**
   * Id of the marker currently in "move" mode. When set, the map shows a hint
   * banner + crosshair cursor and the next map click relocates this marker to
   * the clicked coordinate (an explicit, self-explanatory alternative to drag).
   */
  movingId: string | null;
  setPlaceMode: (on: boolean, kind?: CustomMarkerKind) => void;
  placeAt: (x: number, y: number, serverId?: string, serverName?: string) => void;
  addMarker: (m: Omit<CustomMarker, 'id' | 'createdAt'>) => void;
  updateMarker: (id: string, data: Partial<CustomMarker>) => void;
  removeMarker: (id: string) => void;
  /** Enter move mode for a marker (cancels any pending placement). */
  beginMove: (id: string) => void;
  /** Leave move mode without relocating anything. */
  cancelMove: () => void;
  /** Relocate the marker that's currently in move mode, then exit move mode. */
  moveTo: (x: number, y: number) => void;
  /**
   * Bulk-delete markers. `scope: 'current'` (default) only removes markers on
   * the currently-connected server (matching the map's render filter), while
   * `scope: 'all'` wipes every saved marker across all servers.
   */
  clearMarkers: (scope?: 'current' | 'all') => void;
}

const STORAGE_KEY = 'raidar.customMarkers';

function load(): CustomMarker[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function save(markers: CustomMarker[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(markers)); } catch { /* ignore */ }
}

export const useMarkerStore = create<MarkerState>((set, get) => ({
  markers: load(),
  placeMode: false,
  pendingKind: 'pin',
  movingId: null,

  setPlaceMode: (on, kind) => set((s) => ({ placeMode: on, pendingKind: kind ?? s.pendingKind, movingId: on ? null : s.movingId })),

  placeAt: (x, y, serverId, serverName) => {
    const { pendingKind } = get();
    const style = MARKER_KINDS[pendingKind];
    const marker: CustomMarker = {
      id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: pendingKind,
      label: style.label,
      x, y,
      scale: 1,
      createdAt: Date.now(),
      serverId, serverName,
    };
    const markers = [...get().markers, marker];
    save(markers);
    set({ markers, placeMode: false });
  },

  addMarker: (m) => {
    const marker: CustomMarker = { ...m, id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
    const markers = [...get().markers, marker];
    save(markers);
    set({ markers });
  },

  updateMarker: (id, data) => {
    // Keep `scale` inside the supported 0.1 (really small) … 2.0 (large) band so
    // persisted values never drift outside what the sliders allow.
    const clamped: Partial<CustomMarker> =
      data.scale !== undefined
        ? { ...data, scale: Math.max(0.1, Math.min(2, data.scale)) }
        : data;
    const markers = get().markers.map((m) => (m.id === id ? { ...m, ...clamped } : m));
    save(markers);
    set({ markers });
  },

  removeMarker: (id) => {
    const markers = get().markers.filter((m) => m.id !== id);
    save(markers);
    set((s) => ({ markers, movingId: s.movingId === id ? null : s.movingId }));
  },

  beginMove: (id) => set({ movingId: id, placeMode: false }),

  cancelMove: () => set({ movingId: null }),

  moveTo: (x, y) => {
    const { movingId } = get();
    if (!movingId) return;
    const nx = Math.max(0, Math.min(1, x));
    const ny = Math.max(0, Math.min(1, y));
    const markers = get().markers.map((m) => (m.id === movingId ? { ...m, x: nx, y: ny } : m));
    save(markers);
    set({ markers, movingId: null });
  },

  clearMarkers: (scope = 'current') => {
    const markers = scope === 'all'
      ? []
      : get().markers.filter((m) => !isCurrentServer(m.serverId));
    save(markers);
    set({ markers });
  },
}));
