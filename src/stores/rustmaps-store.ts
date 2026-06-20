import { create } from 'zustand';
import { fetchMapMonuments, RmMonument, RmStats, RustMapsError } from '../utils/rustmaps';
import { useMapStore } from './map-store';

/**
 * RustMaps overlay store.
 *
 * Fetches the procedural map's monument list (caves, water wells, tunnels,
 * underwater labs) + map stats from RustMaps using the server's seed + size.
 * These aren't in the Rust+ feed. Cached in localStorage per seed:size so a
 * wipe only costs one API call. The map component projects the raw WORLD
 * coordinates itself so positions stay correct regardless of load order.
 */

type Status = 'idle' | 'loading' | 'generating' | 'ready' | 'error' | 'no_key';

interface Cached { monuments: RmMonument[]; stats: RmStats | null; }

interface RustMapsState {
  status: Status;
  message: string;
  key: string | null;        // `${size}:${seed}` currently loaded
  raw: RmMonument[];         // world-coord monuments (projected by the map layer)
  stats: RmStats | null;
  load: (apiKey: string, size: number, seed: number) => Promise<void>;
  clear: () => void;
}

const CACHE_PREFIX = 'rustoverlay.rustmaps.';

function cacheGet(key: string): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Back-compat: older cache stored a bare monuments array.
    if (Array.isArray(parsed)) return { monuments: parsed, stats: null };
    return parsed;
  } catch { return null; }
}
function cacheSet(key: string, data: Cached) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)); } catch { /* ignore */ }
}

function counts(mons: RmMonument[]) {
  let caves = 0, wells = 0;
  for (const m of mons) {
    const t = m.type.toLowerCase();
    if (t.includes('cave') || t.includes('sinkhole')) caves++;
    else if (t.includes('water well') || t.includes('waterwell')) wells++;
  }
  return { caves, wells };
}

export const useRustMapsStore = create<RustMapsState>((set, get) => ({
  status: 'idle',
  message: '',
  key: null,
  raw: [],
  stats: null,

  load: async (apiKey, size, seed) => {
    if (!size || !seed) {
      set({ status: 'error', message: `Server didn't report a seed/size (seed=${seed}, size=${size}).` });
      return;
    }
    const cacheKey = `${size}:${seed}`;
    if (get().key === cacheKey && (get().status === 'ready' || get().status === 'loading')) return;

    const cached = cacheGet(cacheKey);
    if (cached) {
      set({ status: 'ready', message: '', key: cacheKey, raw: cached.monuments, stats: cached.stats });
      return;
    }

    if (!apiKey.trim()) {
      set({ status: 'no_key', message: 'Add a RustMaps API key in Settings to show caves, the Water Well, tunnels & labs.', key: cacheKey, raw: [], stats: null });
      return;
    }

    set({ status: 'loading', message: 'Loading map extras from RustMaps…', key: cacheKey, raw: [], stats: null });
    try {
      const { monuments, stats } = await fetchMapMonuments(apiKey, size, seed);
      cacheSet(cacheKey, { monuments, stats });
      set({ status: 'ready', message: '', raw: monuments, stats });
      const { caves, wells } = counts(monuments);
      useMapStore.getState().addToast('RustMaps loaded', `${caves} caves · ${wells} water well${wells === 1 ? '' : 's'} added to the map.`, 'success');
    } catch (e) {
      console.error('[RustMaps] load failed', e);
      if (e instanceof RustMapsError) {
        if (e.code === 'generating') {
          set({ status: 'generating', message: 'RustMaps is generating this map — it will appear automatically when ready (usually 1-3 min).' });
          useMapStore.getState().addToast('RustMaps generating', 'This map is being generated — extras will appear automatically in a couple minutes.', 'info');
          let attempts = 0;
          const poll = async () => {
            attempts++;
            if (get().key !== cacheKey || attempts > 18) return;
            try {
              const { monuments, stats } = await fetchMapMonuments(apiKey, size, seed);
              if (get().key !== cacheKey) return;
              cacheSet(cacheKey, { monuments, stats });
              set({ status: 'ready', message: '', raw: monuments, stats });
              const { caves, wells } = counts(monuments);
              useMapStore.getState().addToast('RustMaps loaded', `${caves} caves · ${wells} water well${wells === 1 ? '' : 's'} added to the map.`, 'success');
            } catch (err) {
              if (err instanceof RustMapsError && err.code === 'generating') setTimeout(poll, 20_000);
            }
          };
          setTimeout(poll, 20_000);
          return;
        }
        set({ status: e.code === 'no_key' ? 'no_key' : 'error', message: e.message });
        useMapStore.getState().addToast('RustMaps', e.message, 'warning');
        return;
      }
      set({ status: 'error', message: 'Failed to reach RustMaps.' });
      useMapStore.getState().addToast('RustMaps', 'Failed to reach RustMaps.', 'warning');
    }
  },

  clear: () => set({ status: 'idle', message: '', key: null, raw: [], stats: null }),
}));
