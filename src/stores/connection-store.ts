import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface ServerInfo {
  name: string;
  header_image: string;
  url: string;
  map: string;
  map_size: number;
  players: number;
  max_players: number;
  queued_players: number;
  seed: number;
  ip: string;
  port: number;
  player_steam_id?: number;
}

interface ConnectionState {
  status: ConnectionStatus;
  serverUrl: string;
  ping: number;
  lastConnected: number | null;
  errorMessage: string | null;
  serverInfo: ServerInfo | null;
  /** Bumped on every successful (re)connect so effects can re-run on switch. */
  connectEpoch: number;

  // actions
  setStatus: (status: ConnectionStatus) => void;
  bumpConnectEpoch: () => void;
  setServerUrl: (url: string) => void;
  setPing: (ms: number) => void;
  setServerInfo: (info: ServerInfo | null) => void;
  connect: () => void;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  serverUrl: '',
  ping: 0,
  lastConnected: null,
  errorMessage: null,
  serverInfo: null,
  connectEpoch: 0,

  setStatus: (status) => set({ status }),
  bumpConnectEpoch: () => set((s) => ({ connectEpoch: s.connectEpoch + 1, status: 'connected' })),
  setServerUrl: (url) => set({ serverUrl: url }),
  setPing: (ms) => set({ ping: ms }),
  setServerInfo: (serverInfo) => set({ serverInfo }),

  connect: async () => {
    // We let the SettingsPanel handle the invoke call, and then call setStatus('connected')
    // Wait, let's keep the actual tauri invoke in SettingsPanel, and just provide setters here.
  },

  disconnect: () => {
    set({ status: 'disconnected', lastConnected: null, ping: 0, serverInfo: null });
  },
}));
