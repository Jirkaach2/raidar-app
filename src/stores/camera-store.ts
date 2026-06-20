import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { CameraInfo, RawRayFrame } from '../utils/camera';

/**
 * Rust+ camera feed state.
 *
 * Subscribing asks the server to stream `cameraRays` broadcasts for a camera id.
 * The rustplus.js renderer composites the most recent ~10 frames into one image
 * (each frame only fills a subset of samples), so we keep a rolling buffer.
 */

export interface CameraFrame {
  rayData: Uint8Array;
  sampleOffset: number;
  verticalFov: number;
  distance: number;
  entities: { entityId: number; type: number; name?: string }[];
  receivedAt: number;
}

interface CameraState {
  activeCameraId: string | null;
  info: CameraInfo | null;
  connecting: boolean;
  error: string | null;
  /** Latest decoded entities (players/trees) for the overlay. */
  entities: { entityId: number; type: number; name?: string }[];
  /** Rolling buffer of recent raw ray frames for compositing. */
  rayFrames: RawRayFrame[];
  /** Monotonic counter bumped on each new frame so the view re-renders. */
  frameTick: number;

  subscribe: (cameraId: string) => Promise<void>;
  unsubscribe: () => Promise<void>;
  setFrame: (frame: CameraFrame) => void;
  sendInput: (buttons: number, mouseX: number, mouseY: number) => void;
}

const MAX_FRAMES = 12;
let resubTimer: ReturnType<typeof setInterval> | null = null;

export const useCameraStore = create<CameraState>((set, get) => ({
  activeCameraId: null,
  info: null,
  connecting: false,
  error: null,
  entities: [],
  rayFrames: [],
  frameTick: 0,

  subscribe: async (cameraId) => {
    const id = cameraId.trim();
    if (!id) return;
    if (get().activeCameraId) {
      try { await invoke('camera_unsubscribe'); } catch { /* ignore */ }
    }
    set({ connecting: true, error: null, entities: [], rayFrames: [], frameTick: 0, info: null });
    try {
      const info = await invoke<CameraInfo>('camera_subscribe', { cameraId: id });
      if (!info || !info.width) {
        set({ connecting: false, error: 'Camera not found or unavailable.' });
        return;
      }
      set({ activeCameraId: id, info, connecting: false, error: null });
      // Rust+ requires periodic re-subscription or the ray stream stops.
      if (resubTimer) clearInterval(resubTimer);
      resubTimer = setInterval(() => {
        if (get().activeCameraId === id) {
          invoke('camera_subscribe', { cameraId: id }).catch(() => {});
        } else if (resubTimer) {
          clearInterval(resubTimer);
          resubTimer = null;
        }
      }, 10_000);
    } catch (e) {
      set({ connecting: false, error: String(e).replace(/^Error:\s*/, '') });
    }
  },

  unsubscribe: async () => {
    if (resubTimer) { clearInterval(resubTimer); resubTimer = null; }
    // Optimistically clear UI state immediately so the feed stops without
    // waiting on the server round-trip (which can take seconds).
    set({ activeCameraId: null, info: null, entities: [], rayFrames: [], frameTick: 0, error: null });
    invoke('camera_unsubscribe').catch(() => {});
  },

  setFrame: (frame) => set((s) => {
    if (!s.activeCameraId) return s;
    const rayFrames = [...s.rayFrames, { rayData: frame.rayData, sampleOffset: frame.sampleOffset }];
    if (rayFrames.length > MAX_FRAMES) rayFrames.shift();
    return {
      rayFrames,
      entities: frame.entities.length ? frame.entities : s.entities,
      frameTick: s.frameTick + 1,
    };
  }),

  sendInput: (buttons, mouseX, mouseY) => {
    if (!get().activeCameraId) return;
    invoke('camera_input', { buttons, mouseX, mouseY }).catch(() => {});
  },
}));
