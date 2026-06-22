import { create } from 'zustand';

export type WipeSchedule =
  | { type: 'weekly'; day: number; hour: number }                 // every <day> at <hour>
  | { type: 'biweekly'; day: number; hour: number; anchor: string } // every 14d aligned to anchor wipe (ISO date)
  | { type: 'monthly'; day: number; hour: number }                // first <day> of month (force wipe)
  | { type: 'date'; date: string };                               // one-off ISO datetime

export interface WipeServer {
  id: string;
  name: string;
  schedule: WipeSchedule;
  note?: string;
  remindMinutes?: number; // notify this many minutes before (0 = off)
}

const KEY = 'raidar_wipe_servers';

function load(): WipeServer[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}
function save(servers: WipeServer[]) {
  try { localStorage.setItem(KEY, JSON.stringify(servers)); } catch { /* ignore */ }
}

interface WipeState {
  servers: WipeServer[];
  add: (s: Omit<WipeServer, 'id'>) => void;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<WipeServer>) => void;
}

export const useWipeStore = create<WipeState>((set) => ({
  servers: load(),
  add: (s) => set((st) => { const servers = [...st.servers, { ...s, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }]; save(servers); return { servers }; }),
  remove: (id) => set((st) => { const servers = st.servers.filter((x) => x.id !== id); save(servers); return { servers }; }),
  update: (id, patch) => set((st) => { const servers = st.servers.map((x) => x.id === id ? { ...x, ...patch } : x); save(servers); return { servers }; }),
}));

const DAY_MS = 86_400_000;

/** Set a date to the next occurrence of weekday `day` at `hour` (local), >= from. */
function nextWeekdayAt(from: Date, day: number, hour: number): Date {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  let diff = (day - d.getDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= from.getTime()) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** First <day> weekday of the month containing `ref` at `hour`. */
function firstWeekdayOfMonth(ref: Date, day: number, hour: number): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1, hour, 0, 0, 0);
  d.setDate(1 + ((day - d.getDay() + 7) % 7));
  return d;
}

/** Compute the next wipe Date for a schedule, or null. */
export function nextWipe(schedule: WipeSchedule, now: Date = new Date()): Date | null {
  switch (schedule.type) {
    case 'weekly':
      return nextWeekdayAt(now, schedule.day, schedule.hour);
    case 'biweekly': {
      const anchor = new Date(schedule.anchor);
      anchor.setHours(schedule.hour, 0, 0, 0);
      if (isNaN(anchor.getTime())) return nextWeekdayAt(now, schedule.day, schedule.hour);
      const periods = Math.ceil((now.getTime() - anchor.getTime()) / (14 * DAY_MS));
      let next = new Date(anchor.getTime() + Math.max(0, periods) * 14 * DAY_MS);
      if (next.getTime() <= now.getTime()) next = new Date(next.getTime() + 14 * DAY_MS);
      return next;
    }
    case 'monthly': {
      let first = firstWeekdayOfMonth(now, schedule.day, schedule.hour);
      if (first.getTime() <= now.getTime()) {
        first = firstWeekdayOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1), schedule.day, schedule.hour);
      }
      return first;
    }
    case 'date': {
      const d = new Date(schedule.date);
      return isNaN(d.getTime()) ? null : d;
    }
  }
}
