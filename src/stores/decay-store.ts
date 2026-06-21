import { create } from 'zustand';

/**
 * Decay markers: user-placed reminders for decaying bases & structures.
 * Persisted to localStorage so they survive restarts. Each marker can hold a
 * grid reference, a structure type (sets the decay window + max HP), the
 * current HP, a deadline, an optional screenshot, and a free-text note.
 */

export type BuildMaterial =
  | 'twig' | 'wood' | 'stone' | 'metal' | 'armored'
  | 'wood_door' | 'sheet_door' | 'garage_door' | 'armored_door';

/** Full decay time (hours) per structure at 0 upkeep / no TC. */
export const DECAY_HOURS: Record<BuildMaterial, number> = {
  twig: 1,
  wood: 3,
  stone: 5,
  metal: 8,
  armored: 12,
  // Doors decay at the same rate as their tier's building blocks.
  wood_door: 3,
  sheet_door: 8,
  garage_door: 8,
  armored_door: 12,
};

/** Max HP per structure (used to clamp the user's custom HP input). */
export const MAX_HP: Record<BuildMaterial, number> = {
  twig: 10,
  wood: 250,
  stone: 500,
  metal: 1000,
  armored: 2000,
  wood_door: 200,
  sheet_door: 250,
  garage_door: 600,
  armored_door: 1000,
};

export const MATERIAL_LABEL: Record<BuildMaterial, string> = {
  twig: 'Twig',
  wood: 'Wood',
  stone: 'Stone',
  metal: 'Sheet Metal',
  armored: 'Armored (HQM)',
  wood_door: 'Wooden Door',
  sheet_door: 'Sheet Metal Door',
  garage_door: 'Garage Door',
  armored_door: 'Armored Door',
};

/** True for door structures (vs building blocks). */
export function isDoor(m: BuildMaterial): boolean {
  return m === 'wood_door' || m === 'sheet_door' || m === 'garage_door' || m === 'armored_door';
}

export interface DecayMarker {
  id: string;
  label: string;
  grid: string;
  material: BuildMaterial;
  /** Current HP (optional — user can track exact remaining HP). */
  hp?: number;
  /** Epoch ms when the structure was last full/repaired. */
  startedAt: number;
  /** Epoch ms when it fully decays. */
  decaysAt: number;
  note?: string;
  screenshot?: string; // data URL
  /** Normalized map position (0-1), if pinned to the live map. */
  x?: number;
  y?: number;
  /** Server this marker belongs to (`ip:port`) + its display name. */
  serverId?: string;
  serverName?: string;
}

interface DecayState {
  markers: DecayMarker[];
  placeMode: boolean;
  pinTargetId: string | null;
  setPlaceMode: (on: boolean, targetId?: string | null) => void;
  addMarker: (m: Omit<DecayMarker, 'id' | 'decaysAt'> & { decaysAt?: number }) => void;
  pinAt: (x: number, y: number) => void;
  updateMarker: (id: string, data: Partial<DecayMarker>) => void;
  removeMarker: (id: string) => void;
}

const STORAGE_KEY = 'raidar.decayMarkers';

function load(): DecayMarker[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(markers: DecayMarker[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
  } catch {
    /* quota / unavailable — ignore */
  }
}

export const useDecayStore = create<DecayState>((set, get) => ({
  markers: load(),
  placeMode: false,
  pinTargetId: null,

  setPlaceMode: (on, targetId = null) => set({ placeMode: on, pinTargetId: on ? targetId : null }),

  addMarker: (m) => {
    // If a current HP is supplied, the remaining decay window is proportional
    // to hp/maxHP (decay drains HP linearly over the full decay window).
    const maxHp = MAX_HP[m.material];
    const frac = m.hp != null && maxHp > 0 ? Math.max(0, Math.min(1, m.hp / maxHp)) : 1;
    const decaysAt = m.decaysAt ?? m.startedAt + DECAY_HOURS[m.material] * 3600_000 * frac;
    const marker: DecayMarker = {
      ...m,
      id: `decay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      decaysAt,
    };
    const markers = [...get().markers, marker];
    save(markers);
    set({ markers });
  },

  /** Pin a target marker (or the latest) to a map position. */
  pinAt: (x, y) => {
    const { markers, pinTargetId } = get();
    if (markers.length === 0) return;
    const targetId = pinTargetId ?? markers[markers.length - 1].id;
    const next = markers.map((m) => (m.id === targetId ? { ...m, x, y } : m));
    save(next);
    set({ markers: next, placeMode: false, pinTargetId: null });
  },

  updateMarker: (id, data) => {
    const markers = get().markers.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, ...data };
      // Recompute decay deadline if material / start / hp changed.
      if (data.material || data.startedAt != null || data.hp != null) {
        const maxHp = MAX_HP[next.material];
        const frac = next.hp != null && maxHp > 0 ? Math.max(0, Math.min(1, next.hp / maxHp)) : 1;
        next.decaysAt = next.startedAt + DECAY_HOURS[next.material] * 3600_000 * frac;
      }
      return next;
    });
    save(markers);
    set({ markers });
  },

  removeMarker: (id) => {
    const markers = get().markers.filter((m) => m.id !== id);
    save(markers);
    set({ markers });
  },
}));
