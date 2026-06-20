import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

/**
 * Steam avatar cache.
 *
 * Rust+ doesn't expose player avatars, so we resolve them from each player's
 * public Steam profile XML via a backend command (`get_steam_avatar`, which
 * sidesteps browser CORS). Results are cached in-memory + localStorage so we
 * only hit Steam once per player. Private profiles resolve to '' and are
 * cached as "tried" to avoid refetching every render.
 */

interface AvatarState {
  avatars: Record<string, string>;   // steamId -> avatar URL ('' = no avatar)
  pending: Set<string>;
  fetchAvatar: (steamId?: string | null) => void;
  getAvatar: (steamId?: string | null) => string | undefined;
}

const STORAGE_KEY = 'rustoverlay.avatars';

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(avatars: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(avatars));
  } catch {
    /* ignore */
  }
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  avatars: load(),
  pending: new Set<string>(),

  getAvatar: (steamId) => {
    if (!steamId) return undefined;
    return get().avatars[steamId];
  },

  fetchAvatar: (steamId) => {
    if (!steamId) return;
    const id = String(steamId);
    const { avatars, pending } = get();
    // Already resolved (even to '') or in-flight → skip.
    if (id in avatars || pending.has(id)) return;
    if (!/^\d{16,20}$/.test(id)) return;

    pending.add(id);
    invoke<string>('get_steam_avatar', { steamId: id })
      .then((url) => {
        set((s) => {
          const next = { ...s.avatars, [id]: url || '' };
          save(next);
          return { avatars: next };
        });
      })
      .catch(() => {
        // Cache the failure as '' so we don't hammer Steam on every render.
        set((s) => {
          const next = { ...s.avatars, [id]: '' };
          save(next);
          return { avatars: next };
        });
      })
      .finally(() => {
        get().pending.delete(id);
      });
  },
}));
