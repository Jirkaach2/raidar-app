import { create } from 'zustand';

/**
 * Cheap content signature for a marker list. Used to change-gate setMarkers so
 * subscribers don't re-render every poll when nothing meaningful changed.
 * Positions are quantized so sub-pixel jitter doesn't defeat the gate, but real
 * movement (events) and stock changes (vending machines) still register.
 */
function markersSignature(markers: { id: string; type: string; x: number; y: number; raw?: any }[]): string {
  let s = `${markers.length}`;
  for (const m of markers) {
    const qx = Math.round(m.x * 1000);
    const qy = Math.round(m.y * 1000);
    let stock = '';
    const orders = m.raw?.sell_orders;
    if (orders && orders.length) {
      // Sum stock so a restock/sale flips the signature without a full hash.
      let acc = 0;
      for (const o of orders) acc += (o.amount_in_stock ?? 0) + (o.cost_per_item ?? 0);
      stock = `:${orders.length}:${acc}`;
    }
    s += `|${m.id},${m.type},${qx},${qy}${stock}`;
  }
  return s;
}

export type MarkerType =
  | 'player'
  | 'patrol_heli'
  | 'cargo_ship'
  | 'crate'
  | 'vending_machine'
  | 'explosion'
  | 'chinook'
  | 'vendor'
  | 'death';

export interface MapMarker {
  id: string;
  type: MarkerType;
  label: string;
  x: number;      // 0-1 normalised
  y: number;      // 0-1 normalised
  rotation?: number;
  color?: string;
  playerId?: string;
  detail?: string;
  timestamp: number;
  raw?: any;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface RustMonument {
  token: string;
  x: number;
  y: number;
}

export interface TimeInfo {
  dayLengthMinutes: number;  // real minutes for a full in-game day
  timeScale: number;
  sunrise: number;           // in-game hour (0-24) the sun rises
  sunset: number;            // in-game hour (0-24) the sun sets
  time: number;              // current in-game hour (0-24)
  receivedAt: number;        // Date.now() when this snapshot was taken (for interpolation)
}

interface MapState {
  mapSize: number;         // world units
  mapImageWidth: number;   // image pixels width
  mapImageHeight: number;  // image pixels height
  mapImageBase64: string | null;
  oceanMargin: number;     // margin added around the actual map in the image
  monuments: RustMonument[];
  markers: MapMarker[];
  viewport: Viewport;
  showGrid: boolean;
  selectedMarkerId: string | null;
  
  // Tactical Overlays
  showDeathMarkers: boolean;     // master toggle for death markers on the map
  showEventTimers: boolean;      // Active Events widget
  showDayNight: boolean;         // Day/Night widget
  showVendingShops: boolean;
  showResources: boolean;
  showRustExtras: boolean;     // caves + water well (RustMaps)
  showTeam: boolean;
  showRoster: boolean;
  selectedMonumentToken: string | null;
  
  // Resource Filters
  resourceMode: 'markers' | 'heatmap';
  resourceDensity: number; // 0-100
  selectedResources: string[];

  // Notification settings
  notifyNewShops: boolean;
  notifyNewItems: boolean;
  priceWatches: PriceWatch[];
  toasts: ToastMessage[];
  isFirstMarkersLoad: boolean;
  deathLog: DeathLogEntry[];

  // In-game time
  timeInfo: TimeInfo | null;

  // actions
  setMapData: (mapImageWidth: number, mapImageHeight: number, mapImageBase64: string, monuments: RustMonument[], oceanMargin: number) => void;
  setMarkers: (markers: MapMarker[]) => void;
  addMarker: (marker: MapMarker) => void;
  removeMarker: (id: string) => void;
  setViewport: (vp: Partial<Viewport>) => void;
  toggleGrid: () => void;
  selectMarker: (id: string | null) => void;
  setTimeInfo: (info: TimeInfo | null) => void;
  
  // Overlay actions
  toggleDeathMarkers: () => void;
  toggleEventTimers: () => void;
  toggleDayNight: () => void;
  toggleVendingShops: () => void;
  toggleResources: () => void;
  toggleRustExtras: () => void;
  toggleTeam: () => void;
  toggleRoster: () => void;
  selectMonument: (token: string | null) => void;
  setResourceMode: (mode: 'markers' | 'heatmap') => void;
  setResourceDensity: (density: number) => void;
  toggleResource: (resourceKey: string) => void;
  
  setNotifyNewShops: (enabled: boolean) => void;
  setNotifyNewItems: (enabled: boolean) => void;
  addPriceWatch: (itemId: number, itemName: string, maxCost: number, currencyId: number, currencyName: string) => void;
  updatePriceWatch: (id: string, maxCost: number, currencyId: number, currencyName: string) => void;
  removePriceWatch: (id: string) => void;
  addToast: (title: string, message: string, type?: 'info' | 'success' | 'warning', extra?: Partial<ToastMessage>) => void;
  removeToast: (id: string) => void;
  addDeath: (entry: DeathLogEntry) => void;
  clearDeathLog: () => void;
  reset: () => void;
}

export interface PriceWatch {
  id: string;
  itemId: number;
  itemName: string;
  maxCost: number;
  currencyId: number;
  currencyName: string;
}

export interface DeathLogEntry {
  id: string;
  playerName: string;
  steamId: string;
  x: number;  // normalized 0-1
  y: number;  // normalized 0-1
  grid: string;
  timestamp: number;
}

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  shopName?: string;
  grid?: string;
  orders?: {
    item_id: number;
    item_name: string;
    quantity: number;
    cost_per_item: number;
    currency_id: number;
    currency_name: string;
    amount_in_stock: number;
  }[];
}

export const useMapStore = create<MapState>((set) => ({
  mapSize: 4000,
  mapImageWidth: 2000,
  mapImageHeight: 2000,
  mapImageBase64: null,
  oceanMargin: 0,
  monuments: [],
  markers: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  showGrid: true,
  selectedMarkerId: null,
  
  // Overlays defaults
  showDeathMarkers: true,
  showEventTimers: true,
  showDayNight: true,
  showVendingShops: true,
  showResources: false,
  showRustExtras: false,   // caves + water well off by default; user enables manually
  showTeam: true,
  showRoster: true,
  selectedMonumentToken: null,
  
  // Resource Filters defaults
  resourceMode: 'heatmap',
  resourceDensity: 30,
  selectedResources: ['stone_ore', 'metal_ore', 'sulfur_ore'],

  // Notifications defaults
  notifyNewShops: true,
  notifyNewItems: true,
  priceWatches: [],
  toasts: [],
  isFirstMarkersLoad: true,
  deathLog: [],
  timeInfo: null,

  setMapData: (mapImageWidth, mapImageHeight, mapImageBase64, monuments, oceanMargin) => 
    set({ mapImageWidth, mapImageHeight, mapImageBase64, monuments, oceanMargin }),
  setMarkers: (markers) => set((s) => {
    // Change-gate: skip the state update (and all subscriber re-renders) when
    // the marker set is materially identical to the last poll. We compare a
    // cheap signature of id/type/position/stock rather than deep-equality.
    const sig = markersSignature(markers);
    if (sig === (s as any).__markersSig) return s;
    return { markers, __markersSig: sig } as any;
  }),
  addMarker: (marker) => set((s) => ({ markers: [...s.markers, marker] })),
  removeMarker: (id) => set((s) => ({ markers: s.markers.filter((m) => m.id !== id) })),
  setViewport: (vp) => set((s) => ({ viewport: { ...s.viewport, ...vp } })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  selectMarker: (id) => set({ selectedMarkerId: id }),
  setTimeInfo: (timeInfo) => set({ timeInfo }),
  
  toggleDeathMarkers: () => set((s) => ({ showDeathMarkers: !s.showDeathMarkers })),
  toggleEventTimers: () => set((s) => ({ showEventTimers: !s.showEventTimers })),
  toggleDayNight: () => set((s) => ({ showDayNight: !s.showDayNight })),
  toggleVendingShops: () => set((s) => ({ showVendingShops: !s.showVendingShops })),
  toggleResources: () => set((s) => ({ showResources: !s.showResources })),
  toggleRustExtras: () => set((s) => ({ showRustExtras: !s.showRustExtras })),
  toggleTeam: () => set((s) => ({ showTeam: !s.showTeam })),
  toggleRoster: () => set((s) => ({ showRoster: !s.showRoster })),
  selectMonument: (token) => set({ selectedMonumentToken: token }),
  setResourceMode: (resourceMode) => set({ resourceMode }),
  setResourceDensity: (resourceDensity) => set({ resourceDensity }),
  toggleResource: (resourceKey) => set((s) => {
    const active = s.selectedResources.includes(resourceKey);
    const selectedResources = active
      ? s.selectedResources.filter((k) => k !== resourceKey)
      : [...s.selectedResources, resourceKey];
    return { selectedResources };
  }),

  setNotifyNewShops: (notifyNewShops) => set({ notifyNewShops }),
  setNotifyNewItems: (notifyNewItems) => set({ notifyNewItems }),
  addPriceWatch: (itemId, itemName, maxCost, currencyId, currencyName) => set((s) => ({
    priceWatches: [...s.priceWatches, { id: `pw-${Date.now()}`, itemId, itemName, maxCost, currencyId, currencyName }],
  })),
  updatePriceWatch: (id, maxCost, currencyId, currencyName) => set((s) => ({
    priceWatches: s.priceWatches.map((w) => (w.id === id ? { ...w, maxCost, currencyId, currencyName } : w)),
  })),
  removePriceWatch: (id) => set((s) => ({ priceWatches: s.priceWatches.filter((w) => w.id !== id) })),
  addToast: (title, message, type = 'info', extra = {}) => set((s) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { id, title, message, type, ...extra };
    setTimeout(() => {
      useMapStore.getState().removeToast(id);
    }, 7000);
    return { toasts: [...s.toasts, newToast] };
  }),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  addDeath: (entry) => set((s) => {
    // Deduplicate by id (same player death at same spot)
    if (s.deathLog.some(d => d.id === entry.id)) return s;
    // Keep max 50 entries
    const log = [...s.deathLog, entry];
    return { deathLog: log.slice(-50) };
  }),
  clearDeathLog: () => set({ deathLog: [] }),
  reset: () => set({
    mapSize: 4000,
    mapImageWidth: 2000,
    mapImageHeight: 2000,
    mapImageBase64: null,
    oceanMargin: 0,
    monuments: [],
    markers: [],
    selectedMarkerId: null,
    toasts: [],
    isFirstMarkersLoad: true,
    deathLog: [],
  }),
}));
