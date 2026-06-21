import { create } from 'zustand';
import { useMapStore } from './map-store';
import { useSettingsStore, broadcastToTeam, sendDiscordWebhook } from './settings-store';

export interface TrackedBanPlayer {
  steamId: string;
  name: string;
  vac: string;               // "0" or "1"
  amount_game_bans: string;  // e.g. "0" or "1" or "2"
  communityban: string;      // "0" or "1"
  tradeban: string;          // "0" or "1"
  lastChecked: number;
}

interface BanTrackerState {
  trackedPlayers: TrackedBanPlayer[];
  trackPlayer: (player: Omit<TrackedBanPlayer, 'lastChecked'>) => void;
  untrackPlayer: (steamId: string) => void;
  checkBans: () => Promise<void>;
}

const STORAGE_KEY = 'raidar.banTracker';

function load(): TrackedBanPlayer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(players: TrackedBanPlayer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  } catch {
    /* ignore */
  }
}

export const useBanTrackerStore = create<BanTrackerState>((set, get) => ({
  trackedPlayers: load(),

  trackPlayer: (player) => {
    const { trackedPlayers } = get();
    if (trackedPlayers.some(p => p.steamId === player.steamId)) return;
    const next = [...trackedPlayers, { ...player, lastChecked: Date.now() }];
    save(next);
    set({ trackedPlayers: next });
  },

  untrackPlayer: (steamId) => {
    const next = get().trackedPlayers.filter(p => p.steamId !== steamId);
    save(next);
    set({ trackedPlayers: next });
  },

  checkBans: async () => {
    const { trackedPlayers } = get();
    if (trackedPlayers.length === 0) return;

    let changed = false;
    const nextPlayers = [...trackedPlayers];

    for (let i = 0; i < nextPlayers.length; i++) {
      const p = nextPlayers[i];
      // Check at most once every 5 minutes (300,000 ms) to respect API key limits
      if (Date.now() - p.lastChecked < 300_000) continue;

      try {
        const lookupUrl = `https://steamidapi.uk/v2/steamid.php?myid=76561198283682068&apikey=TH3W6XURLPS359V0NYGW&input=${p.steamId}`;
        const res = await fetch(lookupUrl);
        if (!res.ok) continue;

        const data = await res.json();
        if (data.auth?.auth === 'ok' && data.profile_bans) {
          const newBans = data.profile_bans;
          
          // Detect changes
          const gotVac = newBans.vac === '1' && p.vac !== '1';
          const gotGameBans = Number(newBans.amount_game_bans) > Number(p.amount_game_bans);
          const gotComm = newBans.communityban === '1' && p.communityban !== '1';
          const gotTrade = newBans.tradeban === '1' && p.tradeban !== '1';

          if (gotVac || gotGameBans || gotComm || gotTrade) {
            // Trigger alerts!
            let alertMsg = `🚨 BAN DETECTED: Player "${p.name}" (https://steamcommunity.com/profiles/${p.steamId}) got banned!`;
            const reasons: string[] = [];
            if (gotVac) reasons.push('VAC BAN');
            if (gotGameBans) reasons.push(`GAME BAN (total: ${newBans.amount_game_bans})`);
            if (gotComm) reasons.push('COMMUNITY BAN');
            if (gotTrade) reasons.push('TRADE BAN');
            alertMsg += ` [Bans: ${reasons.join(', ')}]`;

            // 1. Toast Notification
            useMapStore.getState().addToast('BAN TRACKER ALERT', alertMsg, 'warning');

            // 2. Team Chat Broadcast
            broadcastToTeam(alertMsg);

            // 3. Discord (bot relay always; raw webhook gated by toggle)
            {
              const banFields: { name: string; value: string; inline?: boolean }[] = [
                { name: 'Player', value: p.name, inline: true },
                { name: 'Steam Profile', value: `[Link](https://steamcommunity.com/profiles/${p.steamId})`, inline: true },
              ];
              if (reasons.length > 0) {
                banFields.push({ name: 'Ban Types', value: reasons.join(', '), inline: false });
              }
              sendDiscordWebhook(`🚨 **Ban Detected** — ${p.name} has been banned!`, 'bans', banFields, useSettingsStore.getState().discordBans);
            }
          }

          // Update player entry
          nextPlayers[i] = {
            ...p,
            vac: newBans.vac,
            amount_game_bans: newBans.amount_game_bans,
            communityban: newBans.communityban,
            tradeban: newBans.tradeban,
            lastChecked: Date.now()
          };
          changed = true;
        }
      } catch (err) {
        console.error(`Error checking bans for ${p.name}:`, err);
      }
    }

    if (changed) {
      save(nextPlayers);
      set({ trackedPlayers: nextPlayers });
    }
  }
}));
