import { create } from 'zustand';
import { account, fetchSubscription, type AppUser } from '../utils/appwrite';

interface AuthState {
  user: AppUser | null;
  planName: string;       // 'Scout' (free) by default
  loading: boolean;
  busy: boolean;
  error: string;
  /** Restore an existing session (call once on startup). */
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshPlan: () => Promise<void>;
  /** Sign in using a one-time code minted from the web session (web → app). */
  loginWithCode: (code: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  planName: 'Scout',
  loading: true,
  busy: false,
  error: '',

  init: async () => {
    try {
      const u = await account.get();
      set({ user: u, loading: false });
      get().refreshPlan();
    } catch {
      set({ user: null, loading: false });
    }
  },

  refreshPlan: async () => {
    const u = get().user;
    if (!u) { set({ planName: 'Scout' }); return; }
    const sub = await fetchSubscription(u.$id);
    set({ planName: sub?.planName || 'Scout' });
  },

  login: async (email, password) => {
    set({ busy: true, error: '' });
    try {
      try { await account.deleteSession('current'); } catch { /* none */ }
      await account.createEmailPasswordSession(email, password);
      const u = await account.get();
      set({ user: u, busy: false });
      get().refreshPlan();
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : 'Could not sign in.' });
      throw e;
    }
  },

  register: async (name, email, password) => {
    set({ busy: true, error: '' });
    try {
      const { ID } = await import('appwrite');
      await account.create(ID.unique(), email, password, name);
      await account.createEmailPasswordSession(email, password);
      const u = await account.get();
      set({ user: u, busy: false });
      get().refreshPlan();
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : 'Could not create account.' });
      throw e;
    }
  },

  logout: async () => {
    try { await account.deleteSession('current'); } catch { /* ignore */ }
    set({ user: null, planName: 'Scout' });
  },

  loginWithCode: async (code) => {
    set({ busy: true, error: '' });
    try {
      let decoded = '';
      try { decoded = atob(code.trim()); } catch { throw new Error('That code is not valid.'); }
      const sep = decoded.indexOf(':');
      const userId = sep > -1 ? decoded.slice(0, sep) : '';
      const secret = sep > -1 ? decoded.slice(sep + 1) : '';
      if (!userId || !secret) throw new Error('That code is not valid.');
      try { await account.deleteSession('current'); } catch { /* none */ }
      await account.createSession(userId, secret);
      const u = await account.get();
      set({ user: u, busy: false });
      get().refreshPlan();
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : 'Could not sign in with that code.' });
      throw e;
    }
  },
}));
