import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTeamStore, TeamMember, ChatMessage } from '../stores/team-store';
import { useMapStore } from '../stores/map-store';
import { useDeviceStore } from '../stores/device-store';
import { useSettingsStore } from '../stores/settings-store';
import { useCameraStore } from '../stores/camera-store';
import { getGridCoordinate } from '../utils/grid';

export function useRustPlusEvents() {
  useEffect(() => {
    let unlistenPromise: Promise<() => void>;

    async function setupListener() {
      unlistenPromise = listen('rustplus-event', (event) => {
        const payload: any = event.payload;

        if (payload.broadcast) {
          const { team_changed, team_message, entity_changed, camera_rays } = payload.broadcast;

          if (camera_rays) {
            // Ray data arrives as a byte array (serde Vec<u8>). Normalize to Uint8Array.
            const raw = camera_rays.ray_data;
            const rayData = raw instanceof Uint8Array
              ? raw
              : Uint8Array.from(Array.isArray(raw) ? raw : Object.values(raw || {}));
            useCameraStore.getState().setFrame({
              rayData,
              sampleOffset: camera_rays.sample_offset || 0,
              verticalFov: camera_rays.vertical_fov,
              distance: camera_rays.distance,
              entities: (camera_rays.entities || []).map((e: any) => ({
                entityId: e.entity_id, type: e.type, name: e.name,
              })),
              receivedAt: Date.now(),
            });
          }

          if (team_changed) {
            console.log('Team changed:', team_changed);
            if (team_changed.team_info) {
              const rawMembers = team_changed.team_info.members || [];
              const leaderId = String(team_changed.team_info.leader_steam_id);
              const mapSize = useMapStore.getState().mapSize;
              const mapped: TeamMember[] = rawMembers.map((m: any) => {
                const grid = getGridCoordinate(m.x, m.y, mapSize);
                
                return {
                  id: String(m.steam_id),
                  name: m.name,
                  status: m.is_online ? (m.is_alive ? 'online' : 'dead') : 'offline',
                  grid,
                  health: m.is_alive ? 100 : 0,
                  isLeader: String(m.steam_id) === leaderId,
                  color: '#58c6e8', // Default color
                  lastSeen: Date.now(),
                };
              });
              useTeamStore.getState().setMembers(mapped);
            }
          }

          if (team_message && team_message.message) {
            const m = team_message.message;
            const selfId = useTeamStore.getState().selfSteamId;
            const members = useTeamStore.getState().members;
            const byName = members.find((mb) => mb.name === m.name);
            const steamId = byName?.id || String(m.steam_id);
            const chatMsg: ChatMessage = {
              id: `c-${m.time}-${steamId}`,
              sender: m.name,
              text: m.message,
              timestamp: m.time * 1000,
              color: m.color,
              steamId,
              isYou: selfId != null && steamId === selfId,
            };
            useTeamStore.getState().addChatMessage(chatMsg);

            // Team-chat command system. Any teammate can trigger `!commands`.
            // Ignore our own bot replies (prefixed [BOT]) to avoid loops.
            const body = (m.message || '').trim();
            if (body.startsWith('!') && !body.startsWith('[BOT]')) {
              import('../utils/commands').then(({ handleTeamCommand }) => {
                try { handleTeamCommand(body); } catch { /* ignore */ }
              });
            }
          }

          if (entity_changed) {
            console.log('Entity changed:', entity_changed);
            const entityId = entity_changed.entity_id;
            const payload = entity_changed.payload || {};
            const value = !!payload.value;
            const device = useDeviceStore.getState().devices[entityId];

            // Update the stored device state.
            useDeviceStore.getState().updateDevice(entityId, {
              value,
              capacity: payload.capacity,
              hasProtection: payload.has_protection,
              protectionExpiry: payload.protection_expiry,
            });

            // Smart Alarm (type 2) turning ON. Show an in-app toast here, but
            // DON'T broadcast to team chat — the FCM 'smart-alarm' push carries
            // the user's real alarm title/message and handles broadcasting.
            const isAlarm = Number(device?.entityType) === 2;
            if (value && (isAlarm || device === undefined)) {
              const name = device?.customName || device?.entityName || `Alarm ${entityId}`;
              const settings = useSettingsStore.getState();
              if (settings.notifyAlarms) {
                useMapStore.getState().addToast(
                  'Alarm Triggered',
                  `${name} just went off!`,
                  'warning',
                );
              }
            }
          }
        }
      });
    }

    setupListener();

    return () => {
      if (unlistenPromise) {
        unlistenPromise.then(unlisten => unlisten());
      }
    };
  }, []);
}
