/**
 * Team-chat command system.
 *
 * Any teammate (or you) can type `!command` in team chat. We detect those in
 * the incoming team_message stream and respond by broadcasting back to team
 * chat. Responses are intentionally short (Rust chat truncates long lines), so
 * multi-item replies are split across several messages.
 */

import { useDeviceStore } from '../stores/device-store';
import { useCrateStore, parseTimer } from '../stores/crate-store';
import { useMapStore } from '../stores/map-store';
import { useTeamStore } from '../stores/team-store';
import { useConnectionStore } from '../stores/connection-store';
import { useEventsStore } from '../stores/events-store';
import { getCurrentServer, isCurrentServer } from './server';
import { normalizeMonumentKey, getMonumentInfo } from './monuments';
import { invoke } from '@tauri-apps/api/core';
import { broadcastToTeam } from '../stores/settings-store';

function fmtTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const DEVICE_TYPE_LABEL: Record<number, string> = {
  1: 'Switch',
  2: 'Alarm',
  3: 'Storage',
};

/** Send several chat lines with a tiny gap so the server doesn't drop them. */
async function reply(lines: string[]): Promise<void> {
  for (const line of lines) {
    await broadcastToTeam(line);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * Handle a team-chat message. Returns true if it was a command we processed.
 */
export function handleTeamCommand(text: string): boolean {
  const raw = (text || '').trim();
  if (!raw.startsWith('!')) return false;
  const parts = raw.slice(1).split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'help':
    case 'commands':
      reply([
        '[BOT] !pop !online !team !grid !status !time !sun !wipe !server !map',
        '[BOT] !cargo !heli !vendor !events !crates !devices !upkeep',
        '[BOT] !crate add <mon> <mm:ss> · !crate del/edit <name> · !switch <name>',
      ]);
      return true;

    case 'devices':
    case 'switches': {
      const devices = Object.values(useDeviceStore.getState().devices);
      if (devices.length === 0) { reply(['[BOT] No devices paired.']); return true; }
      const lines = devices.slice(0, 12).map((d: any) => {
        const label = DEVICE_TYPE_LABEL[Number(d.entityType)] || 'Device';
        const name = d.customName || d.entityName || `#${d.entityId}`;
        const state = Number(d.entityType) === 1 ? (d.value ? ' [ON]' : ' [OFF]') : '';
        return `[BOT] ${label}: ${name}${state}`;
      });
      reply([`[BOT] ${devices.length} device(s):`, ...lines]);
      return true;
    }

    case 'crates': {
      const crates = useCrateStore.getState().markers.filter((c) => isCurrentServer(c.serverId));
      if (crates.length === 0) { reply(['[BOT] No active crate timers.']); return true; }
      const now = Date.now();
      const lines = crates
        .sort((a, b) => a.unlocksAt - b.unlocksAt)
        .slice(0, 8)
        .map((c) => {
          const rem = c.unlocksAt - now;
          const where = c.target === 'cargo' ? `Cargo${c.cargoPos ? ` (${c.cargoPos})` : ''}` : c.label;
          return `[BOT] ${where}: ${rem <= 0 ? 'OPEN' : fmtTimer(rem)}`;
        });
      reply([`[BOT] ${crates.length} crate(s):`, ...lines]);
      return true;
    }

    case 'crate': {
      const sub = (args[0] || '').toLowerCase();
      const cs = useCrateStore.getState();
      if (sub === 'add') {
        // !crate add <name|monument> <mm:ss>
        if (args.length < 3) { reply(['[BOT] Usage: !crate add <monument|name> <mm:ss>']); return true; }
        const timerStr = args[args.length - 1];
        const rawName = args.slice(1, -1).join(' ');
        const secs = parseTimer(timerStr);
        if (secs == null || secs <= 0) { reply(['[BOT] Bad timer. Use mm:ss e.g. 14:30']); return true; }
        const now = Date.now();
        const srv2 = getCurrentServer();
        // Try to resolve the name to a real monument on this map (spaces or not)
        // so the crate renders at the monument. Fall back to a free label.
        const { monuments } = useMapStore.getState();
        const needle = rawName.toLowerCase().replace(/[\s_]/g, '');
        let target = rawName.toLowerCase().replace(/\s+/g, '_');
        let label = rawName;
        for (const mo of monuments) {
          const key = normalizeMonumentKey(mo.token);
          const info = getMonumentInfo(mo.token);
          const monName = (info?.name || key).toLowerCase().replace(/[\s_]/g, '');
          if (key.replace(/[\s_]/g, '').includes(needle) || monName.includes(needle)) {
            target = info?.key || key;
            label = info?.name || key.replace(/_/g, ' ').toUpperCase();
            break;
          }
        }
        cs.addMarker({ target, label, startedAt: now, unlocksAt: now + secs * 1000, serverId: srv2?.id, serverName: srv2?.name } as any);
        reply([`[BOT] Crate "${label}" added — ${fmtTimer(secs * 1000)}`]);
        return true;
      }
      if (sub === 'del' || sub === 'delete' || sub === 'remove') {
        const name = args.slice(1).join(' ').trim().toLowerCase();
        const target = cs.markers.find((c) => c.label.toLowerCase().includes(name));
        if (!target) { reply([`[BOT] No crate matching "${name}"`]); return true; }
        cs.removeMarker(target.id);
        reply([`[BOT] Removed crate "${target.label}"`]);
        return true;
      }
      if (sub === 'edit') {
        const timerStr = args[args.length - 1];
        const name = args.slice(1, -1).join(' ').toLowerCase();
        const secs = parseTimer(timerStr);
        const target = cs.markers.find((c) => c.label.toLowerCase().includes(name));
        if (!target || secs == null || secs <= 0) { reply(['[BOT] Usage: !crate edit <name> <mm:ss>']); return true; }
        const now = Date.now();
        cs.updateMarker(target.id, { startedAt: now, unlocksAt: now + secs * 1000 });
        reply([`[BOT] Crate "${target.label}" set to ${fmtTimer(secs * 1000)}`]);
        return true;
      }
      reply(['[BOT] Usage: !crate add|del|edit <name> <mm:ss>']);
      return true;
    }

    case 'switch':
    case 'toggle': {
      // !switch <name> — toggles the current value (no on/off arg). If several
      // switches match the name, toggle them all and report each new state.
      const name = args.join(' ').toLowerCase().trim();
      if (!name) { reply(['[BOT] Usage: !switch <name> (toggles it)']); return true; }
      const devices = Object.values(useDeviceStore.getState().devices);
      const matches: any[] = devices.filter((d: any) =>
        Number(d.entityType) === 1 &&
        (d.customName || d.entityName || 'Smart Switch').toLowerCase().includes(name));
      if (matches.length === 0) { reply([`[BOT] No switch matching "${name}"`]); return true; }
      const ds = useDeviceStore.getState();
      matches.forEach((sw) => {
        const next = !sw.value;
        invoke('set_entity_value', { entityId: sw.entityId, value: next })
          .then(() => {
            ds.updateDevice(sw.entityId, { value: next });
            const label = sw.customName || sw.entityName || 'Smart Switch';
            // Disambiguate same-named switches with their entity id.
            const tag = matches.length > 1 ? ` #${sw.entityId}` : '';
            reply([`[BOT] ${label}${tag} → ${next ? 'ON' : 'OFF'}`]);
          })
          .catch(() => reply([`[BOT] Failed to toggle ${sw.customName || sw.entityName || 'Smart Switch'}`]));
      });
      return true;
    }

    case 'upkeep': {
      const tcs = Object.values(useDeviceStore.getState().devices)
        .filter((d: any) => Number(d.entityType) === 3 && (d.protectionExpiry > 0 || d.hasProtection));
      if (tcs.length === 0) { reply(['[BOT] No Tool Cupboards paired.']); return true; }
      const now = Math.floor(Date.now() / 1000);
      const lines = (tcs as any[]).slice(0, 6).map((d) => {
        const left = (d.protectionExpiry || 0) - now;
        const name = d.customName || d.entityName || `TC ${d.entityId}`;
        if (left <= 0) return `[BOT] ${name}: DECAYING`;
        const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60);
        return `[BOT] ${name}: ${h}h ${m}m left`;
      });
      reply([`[BOT] Upkeep (${tcs.length} TC):`, ...lines]);
      return true;
    }

    case 'events': {
      const events = Object.values(useEventsStore.getState().events);
      const markers = useMapStore.getState().markers;
      const parts: string[] = [];
      if (markers.some((m) => m.type === 'cargo_ship')) parts.push('Cargo');
      if (markers.some((m) => m.type === 'patrol_heli')) parts.push('Patrol Heli');
      if (markers.some((m) => m.type === 'chinook')) parts.push('Chinook');
      if (events.some((e) => e.kind === 'deep_sea')) parts.push('Deep Sea');
      if (markers.some((m) => m.type === 'vendor')) parts.push('Travelling Vendor');
      reply([parts.length ? `[BOT] Active: ${parts.join(', ')}` : '[BOT] No active world events.']);
      return true;
    }

    case 'cargo': {
      const cargo = useMapStore.getState().markers.find((m) => m.type === 'cargo_ship');
      const dock = useEventsStore.getState().events['cargo_dock'];
      if (!cargo) { reply(['[BOT] No Cargo Ship on the map.']); return true; }
      if (dock) {
        const rem = dock.endsAt - Date.now();
        reply([`[BOT] Cargo docked${dock.grid ? ` @ ${dock.grid}` : ''} — leaves in ${fmtTimer(rem)}`]);
      } else {
        reply([`[BOT] Cargo Ship active${cargo.detail ? ` @ ${cargo.detail}` : ''}`]);
      }
      return true;
    }

    case 'time': {
      const t = useMapStore.getState().timeInfo;
      if (!t) { reply(['[BOT] Time data unavailable.']); return true; }
      const isDay = t.time >= t.sunrise && t.time < t.sunset;
      // Real minutes until the next transition.
      const realMinPerHour = t.dayLengthMinutes > 0 ? t.dayLengthMinutes / 24 : 0;
      let hoursUntil: number;
      if (isDay) hoursUntil = t.sunset - t.time;
      else hoursUntil = t.time < t.sunrise ? t.sunrise - t.time : 24 - t.time + t.sunrise;
      const mins = Math.round(hoursUntil * realMinPerHour);
      reply([`[BOT] ${isDay ? 'Daytime' : 'Nighttime'} — ${isDay ? 'nightfall' : 'sunrise'} in ~${mins}m`]);
      return true;
    }

    case 'pop':
    case 'players': {
      const info = useConnectionStore.getState().serverInfo;
      if (!info) { reply(['[BOT] Server info unavailable.']); return true; }
      const q = info.queued_players > 0 ? ` (+${info.queued_players} queued)` : '';
      reply([`[BOT] Players: ${info.players}/${info.max_players}${q}`]);
      return true;
    }

    case 'team': {
      const members = useTeamStore.getState().members;
      const online = members.filter((m) => m.status === 'online');
      if (members.length === 0) { reply(['[BOT] No team data.']); return true; }
      const names = online.map((m) => `${m.name}@${m.grid || '?'}`).join(', ');
      reply([`[BOT] Online ${online.length}/${members.length}: ${names || 'none'}`]);
      return true;
    }

    case 'server':
    case 'wipe': {
      const info = useConnectionStore.getState().serverInfo;
      reply([info ? `[BOT] ${info.name} — ${info.players}/${info.max_players} — ${info.map_size}m` : '[BOT] Not connected.']);
      return true;
    }

    case 'heli':
    case 'chinook': {
      // Patrol heli + Chinook locations (grid stored in marker.detail).
      const markers = useMapStore.getState().markers;
      const heli = markers.find((m) => m.type === 'patrol_heli');
      const chinook = markers.find((m) => m.type === 'chinook');
      if (!heli && !chinook) { reply(['[BOT] No Patrol Heli or Chinook on the map.']); return true; }
      const parts: string[] = [];
      if (heli) parts.push(`Patrol Heli${heli.detail ? ` @ ${heli.detail}` : ''}`);
      if (chinook) parts.push(`Chinook${chinook.detail ? ` @ ${chinook.detail}` : ''}`);
      reply([`[BOT] ${parts.join(' · ')}`]);
      return true;
    }

    case 'vendor': {
      const vendor = useMapStore.getState().markers.find((m) => m.type === 'vendor');
      reply([vendor
        ? `[BOT] Travelling Vendor${vendor.detail ? ` @ ${vendor.detail}` : ''}`
        : '[BOT] No travelling vendor on the map.']);
      return true;
    }

    case 'sun': {
      const t = useMapStore.getState().timeInfo;
      if (!t) { reply(['[BOT] Time data unavailable.']); return true; }
      const isDay = t.time >= t.sunrise && t.time < t.sunset;
      const realMinPerHour = t.dayLengthMinutes > 0 ? t.dayLengthMinutes / 24 : 0;
      let hoursUntil: number;
      if (isDay) hoursUntil = t.sunset - t.time;
      else hoursUntil = t.time < t.sunrise ? t.sunrise - t.time : 24 - t.time + t.sunrise;
      const mins = Math.round(hoursUntil * realMinPerHour);
      reply([`[BOT] ${isDay ? 'Nightfall' : 'Sunrise'} in ~${mins}m`]);
      return true;
    }

    case 'online': {
      const members = useTeamStore.getState().members;
      if (members.length === 0) { reply(['[BOT] No team data.']); return true; }
      const online = members.filter((m) => m.status === 'online').length;
      reply([`[BOT] ${online}/${members.length} teammates online`]);
      return true;
    }

    case 'status': {
      const info = useConnectionStore.getState().serverInfo;
      const t = useMapStore.getState().timeInfo;
      const parts: string[] = [];
      if (info) {
        const q = info.queued_players > 0 ? ` (+${info.queued_players}q)` : '';
        parts.push(`${info.players}/${info.max_players}${q}`);
      }
      if (t) {
        const isDay = t.time >= t.sunrise && t.time < t.sunset;
        const hh = Math.floor(t.time);
        const mm = Math.floor((t.time - hh) * 60);
        parts.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${isDay ? 'day' : 'night'}`);
      }
      reply([parts.length ? `[BOT] ${parts.join(' · ')}` : '[BOT] Status unavailable.']);
      return true;
    }

    case 'grid': {
      const members = useTeamStore.getState().members;
      const online = members.filter((m) => m.status === 'online');
      if (online.length === 0) { reply(['[BOT] No teammates online.']); return true; }
      let line = online.map((m) => `${m.name}@${m.grid || '?'}`).join(', ');
      if (line.length > 110) line = line.slice(0, 109) + '…';
      reply([`[BOT] ${line}`]);
      return true;
    }

    case 'map':
    case 'seed': {
      const info = useConnectionStore.getState().serverInfo;
      if (!info) { reply(['[BOT] Server info unavailable.']); return true; }
      reply([`[BOT] ${info.map || 'Map'} · ${info.map_size}m · seed ${info.seed}`]);
      return true;
    }

    default:
      reply([`[BOT] Unknown command "!${cmd}". Try !help`]);
      return true;
  }
}
