import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * User-saved Rust+ camera identifiers (CCTV / drones / turret cams).
 *
 * Players register cameras at a Computer Station with a custom identifier
 * (case-sensitive, exactly as typed in-game — e.g. "nicers1234"). We store the
 * code verbatim plus an optional friendly label so they can be re-watched
 * without retyping. Persisted to localStorage.
 */

export interface SavedCamera {
  id: string;
  /** The exact camera identifier as registered in-game (case preserved). */
  code: string;
  /** Optional friendly name shown in the list. */
  label?: string;
  addedAt: number;
}

interface SavedCamerasState {
  cameras: SavedCamera[];
  addCamera: (code: string, label?: string) => void;
  updateCamera: (id: string, data: Partial<Pick<SavedCamera, 'code' | 'label'>>) => void;
  removeCamera: (id: string) => void;
}

export const useSavedCamerasStore = create<SavedCamerasState>()(
  persist(
    (set, get) => ({
      cameras: [],
      addCamera: (code, label) => {
        const c = code.trim();
        if (!c) return;
        // Avoid duplicates by exact code.
        if (get().cameras.some((cam) => cam.code === c)) return;
        set((s) => ({
          cameras: [
            ...s.cameras,
            { id: `cam-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, code: c, label: label?.trim() || undefined, addedAt: Date.now() },
          ],
        }));
      },
      updateCamera: (id, data) => set((s) => ({
        cameras: s.cameras.map((c) => (c.id === id ? {
          ...c,
          code: data.code !== undefined ? data.code.trim() || c.code : c.code,
          label: data.label !== undefined ? (data.label.trim() || undefined) : c.label,
        } : c)),
      })),
      removeCamera: (id) => set((s) => ({ cameras: s.cameras.filter((c) => c.id !== id) })),
    }),
    { name: 'raidar.savedCameras' },
  ),
);
