import { create } from 'zustand';

/**
 * Notifications Log store.
 *
 * This is a passive, append-only feed of notifications/events that occur over
 * the lifetime of the app. The wiring layer mirrors the app's central
 * `addToast(title, message, type, extra)` call (see map-store.ts `ToastMessage`)
 * into this store by calling `push(...)` from inside addToast. Because of that,
 * entries here are shaped to be compatible with what addToast provides:
 *   - title, message, type ('info' | 'success' | 'warning')
 *   - an optional `grid` (ToastMessage carries an optional `grid`)
 *
 * The store NEVER fabricates entries — it only holds what is explicitly pushed.
 */

export type NotificationType = 'info' | 'success' | 'warning';

export interface NotificationEntry {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  /** High-level bucket (Cargo, Heli, Crate, …). Inferred when not supplied. */
  category?: string;
  /** Optional map grid reference (e.g. "D7") carried over from a toast. */
  grid?: string;
  timestamp: number;
  read: boolean;
}

/** Shape accepted by `push`. Mirrors the useful fields of addToast(). */
export interface NotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  category?: string;
  grid?: string;
}

/** Max entries retained; older ones are trimmed off the tail. */
const MAX_ENTRIES = 200;

/**
 * Best-effort category inference from the title/message when one isn't given.
 * Kept intentionally small and keyword-based — it only sorts entries into
 * sensible buckets for the filter chips, it never invents data.
 */
function inferCategory(title: string, message: string): string | undefined {
  const text = `${title} ${message}`.toLowerCase();
  if (text.includes('cargo')) return 'Cargo';
  if (text.includes('chinook') || text.includes('ch47')) return 'Chinook';
  if (text.includes('heli') || text.includes('patrol')) return 'Heli';
  if (text.includes('crate')) return 'Crate';
  if (text.includes('shop') || text.includes('vending') || text.includes('vendor')) return 'Vending';
  if (text.includes('alarm')) return 'Alarm';
  if (text.includes('died') || text.includes('death')) return 'Death';
  if (text.includes('price')) return 'Price';
  if (text.includes('ban')) return 'Ban';
  return undefined;
}

interface NotificationsState {
  entries: NotificationEntry[];
  unreadCount: number;
  push: (n: NotificationInput) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  entries: [],
  unreadCount: 0,

  push: (n) => set((s) => {
    const entry: NotificationEntry = {
      id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: n.title,
      message: n.message,
      type: n.type ?? 'info',
      category: n.category ?? inferCategory(n.title, n.message),
      grid: n.grid,
      timestamp: Date.now(),
      read: false,
    };
    // Newest first, capped at MAX_ENTRIES.
    const entries = [entry, ...s.entries].slice(0, MAX_ENTRIES);
    // Unread is the count of unread entries actually retained after the trim.
    const unreadCount = entries.reduce((acc, e) => acc + (e.read ? 0 : 1), 0);
    return { entries, unreadCount };
  }),

  markAllRead: () => set((s) => ({
    entries: s.entries.map((e) => (e.read ? e : { ...e, read: true })),
    unreadCount: 0,
  })),

  remove: (id) => set((s) => {
    const entries = s.entries.filter((e) => e.id !== id);
    const unreadCount = entries.reduce((acc, e) => acc + (e.read ? 0 : 1), 0);
    return { entries, unreadCount };
  }),

  clear: () => set({ entries: [], unreadCount: 0 }),
}));
