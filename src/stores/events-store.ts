import { create } from 'zustand';

/**
 * Live world-event state derived from map markers each poll:
 *  - Cargo Ship docking at a harbor (with a countdown until it leaves).
 *  - Traveling Vendor presence.
 *  - Heli crash sites (Explosion markers left by a downed Patrol Heli).
 *
 * These are transient (not persisted) and rebuilt from the marker stream.
 */

export interface TimedEvent {
  id: string;
  kind: 'cargo_dock' | 'vendor' | 'crash' | 'deep_sea';
  label: string;
  grid?: string;
  /** Epoch ms when the timed phase ends (e.g. cargo undocks). 0 = no timer. */
  endsAt: number;
  startedAt: number;
  x?: number;
  y?: number;
}

interface EventsState {
  events: Record<string, TimedEvent>;
  upsert: (e: TimedEvent) => void;
  remove: (id: string) => void;
  get: (id: string) => TimedEvent | undefined;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: {},
  upsert: (e) => set((s) => ({ events: { ...s.events, [e.id]: e } })),
  remove: (id) => set((s) => {
    if (!s.events[id]) return s;
    const next = { ...s.events };
    delete next[id];
    return { events: next };
  }),
  get: (id) => get().events[id],
}));
