import { create } from 'zustand';

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
  /** Display scale multiplier (0.6 – 2.0). */
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
  setPlaceMode: (on: boolean, kind?: CustomMarkerKind) => void;
  placeAt: (x: number, y: number, serverId?: string, serverName?: string) => void;
  addMarker: (m: Omit<CustomMarker, 'id' | 'createdAt'>) => void;
  updateMarker: (id: string, data: Partial<CustomMarker>) => void;
  removeMarker: (id: string) => void;
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

  setPlaceMode: (on, kind) => set((s) => ({ placeMode: on, pendingKind: kind ?? s.pendingKind })),

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
    const markers = get().markers.map((m) => (m.id === id ? { ...m, ...data } : m));
    save(markers);
    set({ markers });
  },

  removeMarker: (id) => {
    const markers = get().markers.filter((m) => m.id !== id);
    save(markers);
    set({ markers });
  },
}));
