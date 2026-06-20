import { create } from 'zustand';

/**
 * User-placed locked crate timers.
 *
 * Rust+ no longer exposes locked-crate map markers (Facepunch removed them
 * ~2023), so players time crates manually. A locked crate is either:
 *   - dropped by the Chinook (CH47) at a monument that has a drop zone — max 1
 *     per monument; positioned automatically at that monument, or
 *   - one of the 3 Cargo Ship crates (front / middle / back) — max 1 each,
 *     positioned relative to the live Cargo Ship marker.
 *
 * The default hackable unlock time is 15 minutes, but the user can enter a
 * custom timer (mm:ss or hh:mm:ss). Persisted to localStorage.
 */

export const DEFAULT_UNLOCK_SECONDS = 15 * 60;

export type CargoPos = 'front' | 'mid-front' | 'mid-back' | 'back';

/** target is 'cargo' for the Cargo Ship, otherwise a monument key. */
export interface CrateMarker {
  id: string;
  target: string;            // 'cargo' | monument key (e.g. 'launch_site') | 'heli_crash_<grid>'
  label: string;             // display label (monument name or "Cargo")
  cargoPos?: CargoPos;       // only for cargo crates
  /** Marker kind — drives the on-map icon. 'heli' renders the crash explosion. */
  kind?: 'crate' | 'heli';
  /** Crash-site grid (heli only), e.g. "D7". */
  grid?: string;
  /** Direct map coordinates (used for heli crash crates). */
  x?: number;
  y?: number;
  /** Epoch ms when the timer started. */
  startedAt: number;
  /** Epoch ms when it unlocks. */
  unlocksAt: number;
  note?: string;
  /** Server this crate belongs to (`ip:port`) + display name. */
  serverId?: string;
  serverName?: string;
}

interface CrateState {
  markers: CrateMarker[];
  addMarker: (m: Omit<CrateMarker, 'id'>) => void;
  updateMarker: (id: string, data: Partial<CrateMarker>) => void;
  removeMarker: (id: string) => void;
}

const STORAGE_KEY = 'rustoverlay.crateMarkers';

function load(): CrateMarker[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(markers: CrateMarker[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
  } catch {
    /* ignore */
  }
}

/**
 * Parse a timer string into seconds.
 *  - "mm:ss"      → minutes + seconds  (e.g. "13:54" = 13m 54s)
 *  - "hh:mm:ss"   → hours + minutes + seconds
 *  - plain number → minutes (e.g. "15" = 15m)
 * Returns null if unparseable.
 */
export function parseTimer(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10) * 60; // plain minutes
  const parts = t.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.length === 2) return nums[0] * 60 + nums[1];                  // mm:ss
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]; // hh:mm:ss
  return null;
}

export const useCrateStore = create<CrateState>((set, get) => ({
  markers: load(),

  addMarker: (m) => {
    const marker: CrateMarker = {
      ...m,
      id: `crate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
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
