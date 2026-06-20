import { useConnectionStore } from '../stores/connection-store';

/** Identity of a Rust server, used to group cross-server items. */
export interface ServerRef {
  id: string;        // stable id, `ip:port`
  name: string;      // display name
  ip: string;
  port: number | null;
}

/** Build a stable server id from ip + port. */
export function makeServerId(ip?: string, port?: number | null): string {
  if (!ip) return '';
  return `${ip}:${port ?? ''}`;
}

/** The server we're currently connected to (or null if not connected). */
export function getCurrentServer(): ServerRef | null {
  const info = useConnectionStore.getState().serverInfo;
  if (!info || !info.ip) return null;
  return {
    id: makeServerId(info.ip, info.port),
    name: info.name || `${info.ip}:${info.port}`,
    ip: info.ip,
    port: info.port,
  };
}

export function getCurrentServerId(): string {
  return getCurrentServer()?.id ?? '';
}

/** True if the given server id matches the currently-connected server. */
export function isCurrentServer(serverId?: string): boolean {
  if (!serverId) return true; // untagged (legacy) — treat as current
  const cur = getCurrentServerId();
  if (!cur) return true;       // not connected yet — don't hide anything
  return serverId === cur;
}
