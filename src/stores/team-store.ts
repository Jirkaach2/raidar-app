import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export type PlayerStatus = 'online' | 'offline' | 'dead';

export interface TeamMember {
  id: string;
  name: string;
  status: PlayerStatus;
  grid: string;          // e.g. "C4"
  health: number;        // 0-100
  isLeader: boolean;
  color: string;
  lastSeen: number;
  x?: number;            // normalized map x (0-1)
  y?: number;            // normalized map y (0-1)
  rawX?: number;         // raw world x
  rawY?: number;         // raw world y
  rotation?: number;     // facing direction in degrees
  isSelf?: boolean;      // is this the connected player
  spawnTime?: number;
  deathTime?: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  color?: string;
  steamId?: string;
  isYou?: boolean;
  isSystem?: boolean;
}

interface TeamState {
  members: TeamMember[];
  chatMessages: ChatMessage[];
  unreadCount: number;
  selfSteamId: string | null;

  // actions
  setMembers: (members: TeamMember[]) => void;
  updateMember: (id: string, data: Partial<TeamMember>) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setChatHistory: (messages: ChatMessage[]) => void;
  addSystemMessage: (text: string) => void;
  setSelfSteamId: (id: string | null) => void;
  clearUnread: () => void;
  sendMessage: (text: string) => void;
  reset: () => void;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  members: [],
  chatMessages: [],
  unreadCount: 0,
  selfSteamId: null,

  setMembers: (members) => set({ members }),

  updateMember: (id, data) =>
    set((s) => ({
      members: s.members.map((m) => (m.id === id ? { ...m, ...data } : m)),
    })),

  addChatMessage: (msg) =>
    set((s) => {
      // Drop our own bot command replies from the in-app chat view (they're
      // [BOT]-prefixed and only meant for in-game team chat).
      if (typeof msg.text === 'string' && msg.text.trim().startsWith('[BOT]')) {
        return s;
      }
      // De-duplicate by id
      if (s.chatMessages.some((m) => m.id === msg.id)) {
        return s;
      }

      // Tag ownership if we know our own steam id.
      const isYou = msg.isYou ?? (s.selfSteamId != null && msg.steamId === s.selfSteamId);

      return {
        chatMessages: [...s.chatMessages, { ...msg, isYou }],
        unreadCount: s.unreadCount + (isYou ? 0 : 1),
      };
    }),

  setChatHistory: (messages) =>
    set((s) => {
      const seen = new Set<string>();
      const merged: ChatMessage[] = [];
      // History first, then any locally-known messages not already present.
      [...messages, ...s.chatMessages].forEach((m) => {
        if (seen.has(m.id)) return;
        if (typeof m.text === 'string' && m.text.trim().startsWith('[BOT]')) return;
        seen.add(m.id);
        merged.push(m);
      });
      merged.sort((a, b) => a.timestamp - b.timestamp);
      return { chatMessages: merged };
    }),

  addSystemMessage: (text) =>
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        {
          id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: 'System',
          text,
          timestamp: Date.now(),
          isSystem: true,
        },
      ],
    })),

  setSelfSteamId: (selfSteamId) => set({ selfSteamId }),

  clearUnread: () => set({ unreadCount: 0 }),

  sendMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      await invoke('send_team_message', { message: trimmed });

      get().clearUnread();
    } catch (e) {
      console.error('Failed to send team message:', e);
      const msg = String(e);
      // The server rejects team chat when you're not actually in a team.
      if (msg.toLowerCase().includes('team') || msg.toLowerCase().includes('not sent')) {
        get().addSystemMessage('You have to be in a team!');
      } else {
        get().addSystemMessage(`Failed to send message: ${msg}`);
      }
    }
  },

  reset: () =>
    set({
      members: [],
      chatMessages: [],
      unreadCount: 0,
      selfSteamId: null,
    }),
}));
