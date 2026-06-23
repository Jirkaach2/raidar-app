import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import AppShell from './components/layout/AppShell';
import MapView from './components/map/MapView';
import SteamLoginOverlay from './components/common/SteamLoginOverlay';
import { TeamPanel } from './components/team/TeamPanel';
import { VendingPanel } from './components/vending/VendingPanel';
import { DevicePanel } from './components/devices/DevicePanel';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { ToolsPanel } from './components/tools/ToolsPanel';
import { SpyPanel } from './components/spy/SpyPanel';

import { useRustPlusEvents } from './hooks/useRustPlusEvents';
import { useOverlayMode } from './hooks/useOverlayMode';
import { useAutomationRunner, fireAutomationEvent } from './hooks/useAutomationRunner';
import { useConnectionStore } from './stores/connection-store';
import { useTeamStore, TeamMember, ChatMessage } from './stores/team-store';
import { useMapStore } from './stores/map-store';
import { useActivityStore } from './stores/activity-store';
import { useSpyStore } from './stores/spy-store';
import { useSettingsStore, broadcastToTeam, sendDiscordWebhook } from './stores/settings-store';
import { useDecayStore } from './stores/decay-store';
import { useDeviceStore } from './stores/device-store';
import { useEventsStore } from './stores/events-store';
import { useCrateStore } from './stores/crate-store';
import { useShopSalesStore } from './stores/shop-sales-store';
import { usePriceHistoryStore } from './stores/price-history-store';
import { getGridCoordinate, getNormalizedCoordinates } from './utils/grid';
import { isCurrentServer, getCurrentServer } from './utils/server';
import { getMonumentInfo, normalizeMonumentKey } from './utils/monuments';
import { getItemName, getItemIconUrl } from './utils/items';
import './App.css';
import { triggerSound } from './utils/sounds';

import { useUiStore } from './stores/ui-store';
import { useAuthStore } from './stores/auth-store';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { UpdateBanner } from './components/common/UpdateBanner';
import { CommandPalette } from './components/common/CommandPalette';
import AppShellLogin from './components/layout/LoginGate';
/**
 * Returns a poll delay that backs off hard when the window is hidden, so the
 * overlay stops hammering CPU while running in the background. `activeMs` is
 * the normal foreground interval; hidden multiplies it.
 */
function pollDelay(activeMs: number, hiddenMultiplier = 8): number {
  return document.hidden ? activeMs * hiddenMultiplier : activeMs;
}

/**
 * Vending-machine names that belong to the Deep Sea event. These event-only
 * merchant stalls (Medical shop, etc.) shouldn't appear on the live map.
 */
const DEEP_SEA_SHOP_NAMES = [
  'medical shop',
  'deep sea',
  'components shop',
  'resources shop',
  'weapons shop',
  'explosives shop',
];

/** Normalized distance between two markers (0-1 map space). */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Raw Rust+ marker type 3 = VendingMachine. */
function mapMarkerTypeIsShop(typeId: number): boolean {
  return typeId === 3;
}

/**
 * True if a shop's normalized position sits inside the Outpost or Bandit Camp
 * safe-zone. Those are the map's trade hubs — their vending stock rotates
 * constantly, so "new shop" alerts there are pure noise.
 */
function isShopInSafeZone(nx: number, ny: number): boolean {
  const mapState = useMapStore.getState();
  const { monuments, mapSize, mapImageWidth, mapImageHeight, oceanMargin } = mapState;
  for (const m of monuments) {
    const key = normalizeMonumentKey(m.token);
    const info = getMonumentInfo(m.token);
    const k = info?.key || key;
    if (
      k === 'outpost' || k === 'bandit_camp' || k.includes('fishing') ||
      key.includes('outpost') || key.includes('bandit') || key.includes('fishing')
    ) {
      const p = getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
      if (Math.hypot(nx - p.x, ny - p.y) < 0.045) return true;
    }
  }
  return false;
}

/**
 * Detect timed world events from the live markers each poll:
 *  - Cargo Ship docking at a Harbor (≈8-10 min stop) with a countdown.
 *  - Oil Rig / Large Oil Rig locked-crate trigger: a Chinook (CH47) lingering
 *    over a rig means the card puzzle fired → auto-start a 15-min crate timer.
 *  - Heli crash sites (Explosion markers) and the Travelling Vendor.
 * Fires team-chat / in-app / Discord alerts (respecting settings) on changes.
 */
function detectWorldEvents(markers: any[], mapSize: number, rawMarkers?: any[]) {
  const settings = useSettingsStore.getState();
  const events = useEventsStore.getState();
  const mapState = useMapStore.getState();
  const monuments = mapState.monuments;
  const { mapImageWidth, mapImageHeight, oceanMargin } = mapState;

  // Helper: normalized monument position by DB key.
  const monPos = (key: string): { x: number; y: number } | null => {
    const mon = monuments.find((m) => {
      const n = normalizeMonumentKey(m.token);
      const i = getMonumentInfo(m.token)?.key;
      if (key === 'oil_rig_large' && (n.includes('oilrig_2') || n.includes('large_oil') || i === 'oil_rig_large')) return true;
      if (key === 'oil_rig_small' && (n.includes('oilrig_1') || n === 'oil_rig' || i === 'oil_rig_small')) return true;
      return n === key || i === key;
    });
    if (!mon) return null;
    return getNormalizedCoordinates(mon.x, mon.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
  };

  const cargo = markers.find((m) => m.type === 'cargo_ship');
  const persisted = (window as any).__eventState || ((window as any).__eventState = {});

  // ── Cargo docking ──
  // Harbor tokens vary by map (harbor_1, harbor_2, large_harbor, etc.), so
  // match any monument whose key contains "harbor". Cargo docks there ~8 min.
  if (cargo) {
    const harborPositions = monuments
      .filter((m) => {
        const k = normalizeMonumentKey(m.token);
        return k.includes('harbor');
      })
      .map((m) => getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin));
    const nearHarbor = harborPositions.some((h) => dist(cargo, h) < 0.022);
    const prevPos = persisted.cargoPos as { x: number; y: number } | undefined;
    const velocity = prevPos ? dist(cargo, prevPos) : 999;
    persisted.cargoPos = { x: cargo.x, y: cargo.y };

    if (!persisted.cargoPolls) {
      persisted.cargoPolls = [];
    }
    const isStationary = velocity < 0.00005;
    persisted.cargoPolls.push(nearHarbor && isStationary);
    if (persisted.cargoPolls.length > 3) {
      persisted.cargoPolls.shift();
    }
    persisted.cargoEverSeen = true;
    const isVerifiedDocked = persisted.cargoPolls.length >= 3 && persisted.cargoPolls.every((v: boolean) => v === true);

    const shouldUndock = (prevPos && velocity > 0.0005) || !nearHarbor;

    if (shouldUndock && (events.get('cargo_dock') || persisted.cargoDocked)) {
      // Cargo is moving again after a dock → fully clear the dock timer/state.
      if (events.get('cargo_dock')) {
        useEventsStore.getState().remove('cargo_dock');
        const msg = 'Cargo Ship has LEFT the Harbor';
        if (settings.notifyAlarms) useMapStore.getState().addToast('CARGO DEPARTED', msg, 'info');
        if (settings.broadcastEvents) broadcastToTeam(`[CARGO] ${msg}`);
        sendDiscordWebhook(`⚓ **Cargo Departed** — ${msg}`, 'cargo', [
          { name: 'Status', value: 'Departed from harbor', inline: true },
        ], settings.discordCargo);
      }
      persisted.cargoDocked = false;
      persisted.cargoPolls = [];
    } else if (isVerifiedDocked && !events.get('cargo_dock') && !persisted.cargoDocked) {
      // Docked & stationary — start an ~8 min countdown once.
      persisted.cargoDocked = true;
      const now = Date.now();
      useEventsStore.getState().upsert({
        id: 'cargo_dock', kind: 'cargo_dock', label: 'Cargo docked at Harbor',
        grid: cargo.detail, endsAt: now + 8 * 60_000, startedAt: now,
      });
      const msg = `Cargo Ship has DOCKED at the Harbor (${cargo.detail || '?'}) — leaves in ~8m`;
      if (settings.notifyAlarms) useMapStore.getState().addToast('CARGO DOCKED', msg, 'info');
      if (settings.broadcastEvents) broadcastToTeam(`[CARGO] ${msg}`);
      sendDiscordWebhook(`⚓ **Cargo Docked** — ${msg}`, 'cargo', [
        { name: 'Position', value: cargo.detail || '?', inline: true },
        { name: 'Departure', value: '~8 minutes', inline: true },
      ], settings.discordCargo);
    }
  } else {
    // Cargo gone entirely — clear docking state.
    if (events.get('cargo_dock')) useEventsStore.getState().remove('cargo_dock');
    if (persisted.cargoEverSeen) {
      persisted.cargoEverSeen = false;
      fireAutomationEvent('cargo_departed');
    }
    persisted.cargoPos = undefined;
    persisted.cargoDocked = false;
    persisted.cargoPolls = [];
  }

  // ── Oil Rig locked-crate auto-trigger via Chinook proximity or direct Crate marker ──
  if (settings.autoOilRigCrates) {
    const chinook = markers.find((m) => m.type === 'chinook');
    const crates = markers.filter((m) => m.type === 'crate');
    persisted.chinookRigPolls = persisted.chinookRigPolls || {};

    // Record the moment a Chinook (CH47) first appears on the map. The CH47 is
    // what flies in and spawns/hacks the oil-rig locked crate, so the gap
    // between its spawn (which we detect here) and the crate auto-detection
    // firing is "dead time" already counting against the real unlock. We stash
    // the spawn timestamp so we can deduct that elapsed delay below. Cleared
    // when no CH47 is present so a stale time can't bleed into a later event.
    if (chinook) {
      if (!persisted.chinookSpawnAt) persisted.chinookSpawnAt = Date.now();
    } else {
      persisted.chinookSpawnAt = undefined;
    }

    for (const rigKey of ['oil_rig_small', 'oil_rig_large']) {
      const rig = monPos(rigKey);
      if (!rig) continue;

      // 1. Direct type-6 crate marker proximity check (< 0.04)
      const crateNearRig = crates.find((c) => dist(c, rig) < 0.04);

      // 2. Chinook hover filter: Chinook near rig (< 0.06) for at least 2 consecutive polls
      const chinookNearRig = chinook && dist(chinook, rig) < 0.06;
      if (chinookNearRig) {
        persisted.chinookRigPolls[rigKey] = (persisted.chinookRigPolls[rigKey] || 0) + 1;
      } else {
        persisted.chinookRigPolls[rigKey] = 0;
      }
      const chinookIsHovering = persisted.chinookRigPolls[rigKey] >= 2;

      const triggered = !!crateNearRig || chinookIsHovering;
      const triggerSource = crateNearRig ? 'Crate proximity' : 'Chinook hover';

      const firedKey = `oilcrate_${rigKey}`;
      const alreadyFired = persisted[firedKey] && Date.now() - persisted[firedKey] < 20 * 60_000;

      if (triggered && !alreadyFired) {
        persisted[firedKey] = Date.now();
        fireAutomationEvent('oil_crate_triggered');
        const cs = useCrateStore.getState();
        // Don't duplicate if a timer is already running on this rig.
        if (cs.markers.some((c) => c.target === rigKey)) continue;
        const now = Date.now();
        const name = getMonumentInfo(rigKey)?.name || 'Oil Rig';
        const srv = getCurrentServer();
        const defaultDur = (useSettingsStore.getState().defaultCrateSeconds || 900) * 1000;
        // Deduct the Chinook (CH47) delay: the CH47 that triggered this crate
        // spawned earlier than this auto-detection fired (it has to fly in and
        // hover for a couple of polls first), so the crate's real countdown is
        // already partway through. Subtract the elapsed time since the CH47 was
        // first detected to make the unlock timer more accurate. Clamp so we
        // never drop below ~30s or exceed the full duration. Falls back to the
        // full duration when no CH47 spawn time is known. Only the AUTO path
        // reaches here — manually-added crates always get the full duration.
        let dur = defaultDur;
        const chinookSpawnAt = persisted.chinookSpawnAt as number | undefined;
        if (chinookSpawnAt) {
          const elapsed = now - chinookSpawnAt;
          if (elapsed > 0) {
            dur = Math.max(30_000, Math.min(defaultDur, defaultDur - elapsed));
          }
        }

        const triggerX = crateNearRig ? crateNearRig.x : rig.x;
        const triggerY = crateNearRig ? crateNearRig.y : rig.y;

        cs.addMarker({
          target: rigKey, label: name, startedAt: now, unlocksAt: now + dur,
          x: triggerX, y: triggerY,
          note: `Auto-detected (${triggerSource})`,
          serverId: srv?.id, serverName: srv?.name,
        } as any);
        const msg = `${name} locked crate TRIGGERED — unlocks in ${Math.round(dur / 60000)}m`;
        if (settings.notifyAlarms) useMapStore.getState().addToast('OIL RIG CRATE', msg, 'warning');
        if (settings.broadcastEvents) broadcastToTeam(`[OIL RIG] ${msg}`);
        sendDiscordWebhook(`🛢️ **Oil Rig** — ${msg}`, 'crates', [
          { name: 'Location', value: name, inline: true },
          { name: 'Trigger Source', value: triggerSource, inline: true },
          { name: 'Unlocks In', value: `${Math.round(dur / 60000)} minutes`, inline: true },
        ], settings.crateNotifyDiscord);
      }
    }
  }

  // ── Travelling Vendor ──
  const vendor = markers.find((m) => m.type === 'vendor');
  if (vendor) {
    const grid = vendor.detail || '?';
    useEventsStore.getState().upsert({
      id: 'vendor',
      kind: 'vendor',
      label: `Travelling Vendor (${grid})`,
      endsAt: 0,
      startedAt: Date.now(),
      grid,
    });
    if (!persisted.vendorSeen) {
      persisted.vendorSeen = true;
      const msg = `Travelling Vendor spotted at ${grid}`;
      fireAutomationEvent('vendor_spawn');
      if (settings.notifyAlarms) useMapStore.getState().addToast('TRAVELLING VENDOR', msg, 'info');
      if (settings.broadcastEvents) broadcastToTeam(`[VENDOR] ${msg}`);
      sendDiscordWebhook(`🛒 **Travelling Vendor** — ${msg}`, 'event', [
        { name: 'Location', value: grid, inline: true },
      ], settings.broadcastEvents);
    }
  } else {
    if (events.get('vendor')) {
      useEventsStore.getState().remove('vendor');
    }
    persisted.vendorSeen = false;
  }

  // ── Heli crash site (explosion marker) or Heli disappear ──
  // Rust+ sends a type-2 Explosion marker at a heli crash, but some servers
  // drop it or only send it briefly. So we ALSO infer a crash when a patrol
  // heli we've been tracking disappears from the marker stream. We require the
  // heli to have been seen for a couple of consecutive polls first, so a single
  // flickered/missing poll doesn't spawn a phantom crash.
  const explosion = markers.find((m) => m.type === 'explosion');
  const heli = markers.find((m) => m.type === 'patrol_heli');

  if (heli) {
    persisted.lastHeliPos = { x: heli.x, y: heli.y };
    persisted.lastHeliGrid = heli.detail || '?';
    persisted.heliPolls = (persisted.heliPolls || 0) + 1;
    persisted.heliMissingPolls = 0;
    // Only consider it "established" after 2 polls so a flicker isn't a crash.
    if (persisted.heliPolls >= 2) persisted.heliSeen = true;
  } else if (persisted.heliSeen) {
    // Heli is gone — count missing polls. A genuine crash leaves the heli
    // absent for good; a brief gap recovers. Require 2 missing polls.
    persisted.heliMissingPolls = (persisted.heliMissingPolls || 0) + 1;
    persisted.heliPolls = 0;
  } else {
    persisted.heliPolls = 0;
  }

  const heliVanished = !heli && !explosion && persisted.heliSeen &&
    (persisted.heliMissingPolls || 0) >= 2 && persisted.lastHeliPos &&
    // Only count a vanish as a crash if the heli was last seen INSIDE the
    // playable grid — patrol helis enter/leave from the map edge over the
    // ocean, and that despawn is not a crash. Require a margin off every edge.
    persisted.lastHeliPos.x > 0.06 && persisted.lastHeliPos.x < 0.94 &&
    persisted.lastHeliPos.y > 0.06 && persisted.lastHeliPos.y < 0.94;

  const crash = explosion
    ? { detail: explosion.detail || persisted.lastHeliGrid || '?', x: explosion.x, y: explosion.y }
    : (heliVanished ? { detail: persisted.lastHeliGrid, x: persisted.lastHeliPos.x, y: persisted.lastHeliPos.y } : null);
  const existingCrash = events.get('crash');
  const isCrashExpired = existingCrash && existingCrash.endsAt && Date.now() > existingCrash.endsAt;

  if (crash) {
    const grid = crash.detail || '?';
    const now = Date.now();

    // Only create the crash event ONCE — don't upsert every poll
    // (which would reset endsAt each time). The crash site is retained until
    // 5 minutes after the 4:30 crate timer expires, then auto-removed.
    if (!existingCrash) {
      const endsAt = now + 270000 + 5 * 60 * 1000; // 4:30 crate + 5 min grace
      useEventsStore.getState().upsert({
        id: 'crash',
        kind: 'crash',
        label: `Heli Crash Site (${grid})`,
        endsAt,
        startedAt: now,
        grid,
        x: crash.x,
        y: crash.y,
      });
    }
    
    // NOTE: We intentionally do NOT spawn a locked-crate timer for heli crashes.
    // The crash site is represented by the dedicated `crash_persistent` explosion
    // marker (injected by MapMarkers, clickable for crash details & loot). Adding
    // a crate timer here produced a SECOND overlapping marker that looked like a
    // locked crate with the explosion icon. Heli crates open by burning out, not
    // by a hack timer, so a countdown crate marker was misleading anyway.

    if (!persisted.crashSeen) {
      persisted.crashSeen = true;
      fireAutomationEvent('heli_crash');
      // Reset heli tracking so we don't re-trigger; the crash event itself now
      // persists (with its own 20-min timer) independent of heli tracking.
      persisted.heliSeen = false;
      persisted.heliPolls = 0;
      persisted.heliMissingPolls = 0;
      const msg = `Patrol Heli crashed at ${grid}`;
      if (settings.notifyAlarms) useMapStore.getState().addToast('HELI DOWN', msg, 'warning');
      if (settings.broadcastEvents) broadcastToTeam(`[HELI] ${msg}`);
      sendDiscordWebhook(`💥 **Heli Down** — ${msg}`, 'heli_chinook', [
        { name: 'Crash Site', value: grid, inline: true },
        { name: 'Crate Timer', value: 'Unlocks in ~4:30', inline: true },
      ], settings.discordHeli);
    }
  } else if (isCrashExpired) {
    useEventsStore.getState().remove('crash');
    persisted.crashSeen = false;
    // Also clear the auto-spawned heli-crash crate timer(s) so the whole crash
    // site disappears from the map 5 min after the timer expired.
    const cs = useCrateStore.getState();
    for (const m of cs.markers) {
      if (m.kind === 'heli') cs.removeMarker(m.id);
    }
  }

  // ── Deep Sea event ──
  // The Deep Sea is an offshore zone that opens/closes like a world event,
  // spawning NPC merchant stalls out in the ocean. We keep those OFF the
  // rendered map and don't try to plot a direction (the stall positions are
  // unreliable for that) — we just surface ONE "Deep Sea active" entry in the
  // Active Events list while it's running.
  if (rawMarkers && rawMarkers.length) {
    const margin = mapSize * 0.04;
    const deepSeaActive = rawMarkers.some((m) => {
      if (!mapMarkerTypeIsShop(m.marker_type)) return false;
      const n = (m.name || '').toLowerCase();
      if (DEEP_SEA_SHOP_NAMES.some((d) => d && n.includes(d))) return true;
      const wx = m.x ?? 0, wy = m.y ?? 0;
      return wx < -margin || wy < -margin || wx > mapSize + margin || wy > mapSize + margin;
    });

    if (deepSeaActive && !events.get('deep_sea')) {
      const now = Date.now();
      useEventsStore.getState().upsert({
        id: 'deep_sea', kind: 'deep_sea', label: 'Deep Sea', endsAt: 0, startedAt: now,
      });
      const msg = 'Deep Sea event is ACTIVE — offshore merchants & loot available';
      fireAutomationEvent('deep_sea');
      if (settings.notifyAlarms) useMapStore.getState().addToast('DEEP SEA', msg, 'info');
      if (settings.broadcastEvents) broadcastToTeam(`[DEEP SEA] ${msg}`);
      sendDiscordWebhook(`🌊 **Deep Sea** — ${msg}`, 'event', [
        { name: 'Status', value: 'Active — offshore merchants & loot', inline: false },
      ], settings.discordAlarms);
    } else if (!deepSeaActive && events.get('deep_sea')) {
      useEventsStore.getState().remove('deep_sea');
      const msg = 'Deep Sea event has closed';
      if (settings.notifyAlarms) useMapStore.getState().addToast('DEEP SEA', msg, 'info');
      if (settings.broadcastEvents) broadcastToTeam(`[DEEP SEA] ${msg}`);
    }
  }
}

function App() {
  const activePage = useUiStore(s => s.activePage);
  const setActivePage = useUiStore(s => s.setActivePage);
  const authUser = useAuthStore(s => s.user);
  const authLoading = useAuthStore(s => s.loading);
  const authInit = useAuthStore(s => s.init);
  const connectionStatus = useConnectionStore(s => s.status);
  const connectEpoch = useConnectionStore(s => s.connectEpoch);
  const addDevice = useDeviceStore(s => s.addDevice);

  const [steamUrl, setSteamUrl] = useState<string | null>(null);

  // Listen to open-steam-login from backend sidecar or settings
  useEffect(() => {
    let unlistenOpen: (() => void) | undefined;
    let unlistenSuccess: (() => void) | undefined;

    listen<string>('open-steam-login', (event) => {
      setSteamUrl(event.payload);
    }).then((unsub) => {
      unlistenOpen = unsub;
    });

    listen('steam-login-success', () => {
      setSteamUrl(null);
    }).then((unsub) => {
      unlistenSuccess = unsub;
    });

    return () => {
      if (unlistenOpen) unlistenOpen();
      if (unlistenSuccess) unlistenSuccess();
    };
  }, []);

  // Clear the team-chat unread badge as soon as the Team tab is opened.
  const handleNavigate = (page: typeof activePage) => {
    setActivePage(page);
    if (page === 'team') useTeamStore.getState().clearUnread();
  };
  const toasts = useMapStore(s => s.toasts);
  const removeToast = useMapStore(s => s.removeToast);

  // Initialize event listeners
  useRustPlusEvents();
  useOverlayMode();
  useAutomationRunner();

  // Restore any existing Raidar session on startup (gates the whole app).
  useEffect(() => { authInit(); }, [authInit]);

  // Tell the backend when we're signed in so it can release the deferred
  // Steam/Rust+ pairing login (it's held until Raidar sign-in).
  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_app_authenticated', { authed: !!authUser });
      } catch { /* not in tauri */ }
    })();
  }, [authUser]);

  // Seamless web → app sign-in: handle `raidar://auth?userId=..&secret=..`
  // deep links (both cold-start launch and while running).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenEvent: (() => void) | undefined;
    let poll: number | undefined;
    const handle = (urls: string[] | string | null | undefined) => {
      if (!urls) return;
      const list = Array.isArray(urls) ? urls : [urls];
      const seen: Set<string> = (window as any).__dlSeen || ((window as any).__dlSeen = new Set());
      for (const raw of list) {
        try {
          const u = new URL(raw);
          if (u.protocol.replace(':', '') !== 'raidar') continue;
          const userId = (u.searchParams.get('userId') || '').replace(/[/\s]+$/, '');
          // The OS/shell can append a trailing slash to the URL — strip it off
          // the secret or the token is rejected as invalid.
          const secret = (u.searchParams.get('secret') || '').replace(/[/\s]+$/, '');
           if (userId && secret) {
            if (seen.has(secret)) return;
            if (useAuthStore.getState().busy) {
              console.log('[App] Deep link received but auth store is busy, ignoring.');
              return;
            }
            seen.add(secret);
            useAuthStore.getState().loginWithToken(userId, secret).catch(() => {});
            break;
          }
        } catch { /* not a parseable url */ }
      }
    };
    (async () => {
      try {
        const dl = await import('@tauri-apps/plugin-deep-link');
        unlisten = await dl.onOpenUrl(handle);
        const current = await dl.getCurrent().catch(() => null);
        if (current) handle(current);
      } catch { /* plugin unavailable (browser dev) */ }
      // Explicit fallback: the single-instance handler emits the launch URL.
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenEvent = await listen<string>('deep-link-received', (e) => handle(e.payload));
      } catch { /* not in tauri */ }
      // Most reliable: poll the backend for any pending deep-link URL. This
      // doesn't depend on event-listener timing or plugin forwarding.
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const tick = async () => { try { const url = await invoke<string | null>('take_pending_deep_link'); if (url) handle(url); } catch { /* ignore */ } };
        await tick();
        poll = window.setInterval(tick, 1200);
      } catch { /* not in tauri */ }
    })();
    return () => { if (unlisten) unlisten(); if (unlistenEvent) unlistenEvent(); if (poll) window.clearInterval(poll); };
  }, []);

  // Listen for entity pairing and connection success
  useEffect(() => {
    // Nothing runs until the user is signed in — no listeners, no connection
    // polling, no alarms/notifications before authentication.
    if (!authUser) return;
    let unlistenEntity: () => void;
    let unlistenConnection: () => void;
    let unlistenAlarm: () => void;
    
    async function setupListeners() {
      unlistenEntity = await listen('entity-paired', (event: any) => {
        const payload = event.payload;
        if (payload && payload.entityId != null) {
          const ip = payload.ip || '';
          const port = payload.port != null ? Number(payload.port) : null;
          addDevice({
            entityId: Number(payload.entityId),
            entityType: Number(payload.entityType),
            entityName: payload.entityName || `Entity ${payload.entityId}`,
            serverId: ip ? `${ip}:${port ?? ''}` : undefined,
            serverName: payload.serverName || undefined,
            pairedAt: Date.now(),
          });
        }
      });

      // Smart Alarm push (from the FCM sidecar). Fires even when the websocket
      // entity_changed event doesn't, so this is the reliable raid alert.
      unlistenAlarm = await listen('smart-alarm', (event: any) => {
        const payload = event.payload || {};
        const title = payload.title || 'Alarm';
        const message = payload.message || 'Your base is under attack!';
        const settings = useSettingsStore.getState();

        // Determine if the alarm is from a server other than the one we're on.
        const alarmServerId = payload.ip ? `${payload.ip}:${payload.port ?? ''}` : '';
        const foreign = alarmServerId !== '' && !isCurrentServer(alarmServerId);
        const srvName = payload.serverName || 'another server';
        const suffix = foreign ? ` (${srvName})` : '';

        // If cross-server alarms are disabled, suppress foreign ones.
        if (foreign && !settings.crossServerAlarms) return;

        // De-dupe rapid duplicate pushes (FCM can deliver the same alarm twice).
        const fired = (window as any).__fcmAlarmFired || ((window as any).__fcmAlarmFired = new Map<string, number>());
        const key = `${title}|${message}|${alarmServerId}`;
        const last = fired.get(key) || 0;
        if (Date.now() - last < 5000) return;
        fired.set(key, Date.now());

        // Fire smart-alarm automations (title carried for optional name filter).
        if (!foreign) fireAutomationEvent('smart_alarm', { title });

        if (settings.notifyAlarms) {
          useMapStore.getState().addToast(
            foreign ? `${title} · ${srvName}` : title,
            message,
            'warning',
          );
          triggerSound('smart_alarm');
        }
        if (settings.broadcastAlarms) {
          // Use a separator both the app and Rust chat read cleanly.
          broadcastToTeam(`${title}${suffix} | ${message}`);
        }
        sendDiscordWebhook(`🚨 **${title}**${suffix} — ${message}`, 'alarms', [
          { name: 'Alarm', value: title, inline: true },
          { name: 'Message', value: message, inline: false },
        ], settings.discordAlarms);
      });

      unlistenConnection = await listen('connection-success', () => {
        // A (re)connect happened — could be a NEW server. Clear stale map/team
        // data and bump the epoch so the map-fetch effect re-runs even though
        // the status was already 'connected'.
        useMapStore.getState().reset();
        useTeamStore.getState().setMembers([]);
        useConnectionStore.getState().bumpConnectEpoch();
      });
    }
    setupListeners();

    // Check if already connected on startup (in case the sidecar auto-connected before UI loaded)
    const checkConnection = async () => {
      try {
        const isConnected = await invoke<boolean>('get_connection_status');
        if (isConnected) {
          useConnectionStore.getState().setStatus('connected');
        }
      } catch (e) {}
    };
    
    checkConnection();
    const interval = setInterval(checkConnection, 2000);

    return () => {
      if (unlistenEntity) unlistenEntity();
      if (unlistenConnection) unlistenConnection();
      if (unlistenAlarm) unlistenAlarm();
      clearInterval(interval);
    };
  }, [authUser]);

  // 1. Fetch Map once on connection
  useEffect(() => {
    if (!authUser) return;
    if (connectionStatus === 'connected') {
      let active = true;
      const fetchMap = async (retries = 3) => {
        try {
          // Fetch server info first so mapSize/grid are correct before markers load.
          try {
            const serverInfo: any = await invoke('get_server_info');
            if (serverInfo && active) {
              useConnectionStore.getState().setServerInfo(serverInfo);
              if (serverInfo.map_size) {
                useMapStore.setState({ mapSize: serverInfo.map_size });
              }
              if (serverInfo.player_steam_id) {
                useTeamStore.getState().setSelfSteamId(String(serverInfo.player_steam_id));
              }
              // Pull caves + water well from RustMaps (seed + size). These aren't
              // in the Rust+ feed, so we overlay them from the generated map.
              if (serverInfo.map_size && serverInfo.seed) {
                const key = useSettingsStore.getState().rustmapsKey;
                import('./stores/rustmaps-store').then(({ useRustMapsStore }) => {
                  useRustMapsStore.getState().load(key, serverInfo.map_size, serverInfo.seed);
                });
              }
            }
          } catch (e) {
            // non-fatal; the 5s poll will retry
          }

          const mapData: any = await invoke('get_map');
          if (mapData && active) {
            useMapStore.getState().setMapData(
              mapData.width,
              mapData.height,
              mapData.jpg_image_base64,
              mapData.monuments || [],
              mapData.ocean_margin || 0
            );
          }

          // Load existing team chat history so the chat isn't empty on connect.
          try {
            const history: any = await invoke('get_team_chat');
            if (active && Array.isArray(history)) {
              const selfId = useTeamStore.getState().selfSteamId;
              const mapped: ChatMessage[] = history.map((m: any) => ({
                id: `c-${m.time}-${m.steam_id}`,
                sender: m.name,
                text: m.message,
                timestamp: m.time * 1000,
                color: m.color,
                steamId: String(m.steam_id),
                isYou: selfId != null && String(m.steam_id) === selfId,
              }));
              useTeamStore.getState().setChatHistory(mapped);
            }
          } catch (e) {
            // server may not support chat history; ignore
          }
        } catch (err) {
          console.error("Failed to fetch map:", err);
          if (retries > 0 && active) {
            setTimeout(() => fetchMap(retries - 1), 2000);
          }
        }
      };
      fetchMap();
      return () => { active = false; };
    }
  }, [authUser, connectionStatus, connectEpoch]);

  // 2. Server Info & Ping Polling (every 5 seconds)
  useEffect(() => {
    if (!authUser || connectionStatus !== 'connected') return;

    let active = true;
    let timer: any = null;

    const pollServerInfo = async () => {
      try {
        const start = performance.now();
        const serverInfo: any = await invoke('get_server_info');
        const end = performance.now();

        if (!active) return;

        const ping = Math.round(end - start);
        useConnectionStore.getState().setPing(ping);
        useConnectionStore.getState().setServerInfo(serverInfo);
        
        if (serverInfo.ip && serverInfo.port) {
          useConnectionStore.getState().setServerUrl(`${serverInfo.ip}:${serverInfo.port}`);
        }
        
        useMapStore.setState({ mapSize: serverInfo.map_size });
      } catch (err) {
        console.error("Failed to poll server info:", err);
      }

      // Poll in-game time alongside server info.
      try {
        const t: any = await invoke('get_time');
        if (active && t) {
          useMapStore.getState().setTimeInfo({
            dayLengthMinutes: t.day_length_minutes,
            timeScale: t.time_scale,
            sunrise: t.sunrise,
            sunset: t.sunset,
            time: t.time,
            receivedAt: Date.now(),
          });
        }
      } catch (err) {
        // time may be unavailable; ignore
      } finally {
        if (active) {
          timer = setTimeout(pollServerInfo, pollDelay(5000));
        }
      }
    };

    pollServerInfo();

    // Resume promptly when the window is shown again after a hidden backoff.
    const onVis = () => {
      if (!document.hidden && active) {
        if (timer) clearTimeout(timer);
        pollServerInfo();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [authUser, connectionStatus]);

  // 3. Map Markers & Team Info Polling (every 2 seconds)
  useEffect(() => {
    if (!authUser || connectionStatus !== 'connected') return;

    let active = true;
    let timer: any = null;

    const pollMarkersAndTeam = async () => {
      try {
        const mapState = useMapStore.getState();
        const { mapSize, oceanMargin, mapImageWidth, mapImageHeight } = mapState;

        // Wait until the real map metadata has loaded before computing any
        // marker/team positions — otherwise the first poll uses default
        // mapSize/oceanMargin and everything renders in the wrong spot, then
        // snaps once the map arrives.
        if (!mapState.mapImageBase64) {
          return;
        }

        // Fetch Team
        const teamInfo: any = await invoke('get_team_info');
        const deadTeamMarkers: any[] = [];
        
        if (active && teamInfo && teamInfo.members) {
          // Record passive activity (deaths, online/offline, AFK, last-seen).
          useActivityStore.getState().recordTeam(
            teamInfo.members,
            (x: number, y: number) => getGridCoordinate(x, y, mapSize),
          );
          // Record long-term activity schedule (sleep/play windows) for the Spy tool.
          useSpyStore.getState().recordSample(teamInfo.members);
          const leaderId = String(teamInfo.leader_steam_id);
          const mapped: TeamMember[] = teamInfo.members.map((m: any) => {
            const { x: normX, y: normY } = getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
            const grid = getGridCoordinate(m.x, m.y, mapSize);
            
            // Add death marker if they are dead and their coordinates are non-zero
            if (!m.is_alive && m.x !== 0 && m.y !== 0 && useSettingsStore.getState().markTeammateDeaths) {
              const deathId = `death-${m.steam_id}-${Math.floor(Date.now() / 60000)}`;
              deadTeamMarkers.push({
                id: deathId,
                type: 'death',
                label: `${m.name}'s Corpse`,
                detail: grid,
                x: normX,
                y: normY,
                timestamp: Date.now(),
                raw: m,
              });
              // Persist to death log (survives respawn)
              useMapStore.getState().addDeath({
                id: deathId,
                playerName: m.name,
                steamId: String(m.steam_id),
                x: normX,
                y: normY,
                grid,
                timestamp: Date.now(),
              });
            }

            // Detect the alive→dead transition to fire a single death alert.
            const prevAlive = (window as any).__teamAlive || ((window as any).__teamAlive = new Map<string, boolean>());
            const sid = String(m.steam_id);
            const wasAlive = prevAlive.get(sid);
            if (wasAlive === true && !m.is_alive) {
              const settings = useSettingsStore.getState();
              const isSelf = sid === useTeamStore.getState().selfSteamId;
              const who = isSelf ? 'You' : m.name;
              const isOffline = !m.is_online;
              
              if (settings.notifyDeaths) {
                const title = isOffline ? 'Teammate Died (OFFLINE)' : 'Teammate Died';
                const msg = isOffline ? `${who} died while offline` : `${who} died at ${grid}`;
                useMapStore.getState().addToast(title, msg, 'warning');
              }
              if (settings.broadcastDeaths) {
                const msg = isOffline ? `${who} died while OFFLINE` : `${who} died @ ${grid}`;
                broadcastToTeam(msg);
              }
              
              // Trigger sound (offline deaths only — the online-death cue was
              // removed for being too intrusive).
              if (isOffline) triggerSound('teammate_offline_death');
            }
            // Update alive snapshot for all players (online & offline)
            prevAlive.set(sid, !!m.is_alive);
            
            return {
              id: String(m.steam_id),
              name: m.name,
              status: m.is_online ? (m.is_alive ? 'online' : 'dead') : 'offline',
              grid,
              health: m.is_alive ? 100 : 0,
              isLeader: String(m.steam_id) === leaderId,
              color: '#58c6e8',
              lastSeen: Date.now(),
              x: normX,
              y: normY,
              rawX: m.x,
              rawY: m.y,
              rotation: m.rotation,
              isSelf: String(m.steam_id) === useTeamStore.getState().selfSteamId,
              spawnTime: m.spawn_time,
              deathTime: m.death_time,
            };
          });
          useTeamStore.getState().setMembers(mapped);
        }

        // Fetch Map Markers
        const markers: any = await invoke('get_map_markers');
        if (active && markers && Array.isArray(markers)) {
          const prevMarkers = useMapStore.getState().markers;
          // O(1) prev-marker lookup instead of O(n) .find() inside the map loop.
          const prevById = new Map<string, any>();
          for (const p of prevMarkers) prevById.set(p.id, p);

          let mappedMarkers = markers.map(m => {
            const { x: normX, y: normY } = getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
            const type = mapMarkerType(m.marker_type);
            const grid = getGridCoordinate(m.x, m.y, mapSize);

            const sell_orders = m.sell_orders ? m.sell_orders.map((o: any) => ({
              ...o,
              item_name: getItemName(o.item_id),
              currency_name: getItemName(o.currency_id),
            })) : [];

            const id = `marker-${m.id}`;

            // Preserve the ORIGINAL spawn timestamp for an existing marker so
            // moving events (cargo, heli) keep a stable "first seen" time and
            // don't re-trigger event alerts on every poll.
            const prev = prevById.get(id);
            const timestamp = prev ? prev.timestamp : Date.now();

            // Heading for moving events: derive it from the actual direction of travel (prev → current).
            // For vendor, use the server-reported rotation directly to avoid computed angle wobbling.
            const isMovingEvent = type === 'cargo_ship' || type === 'patrol_heli' || type === 'chinook';
            let rotation = m.rotation || 0;
            if (type === 'vendor') {
              rotation = m.rotation || 0;
            } else if (isMovingEvent && prev) {
              const dx = normX - prev.x;
              const dy = normY - prev.y;
              const dist = Math.hypot(dx, dy);
              if (dist > 0.0002) {
                // Screen space: y grows downward. 0° = pointing up/north, CW+.
                rotation = (Math.atan2(dx, -dy) * 180) / Math.PI;
              } else if (prev.rotation !== undefined) {
                rotation = prev.rotation; // barely moved — keep last heading
              }
            }

            return {
              id,
              type,
              label: m.name || defaultEventLabel(type),
              detail: grid,
              x: normX,
              y: normY,
              rotation,
              playerId: String(m.steam_id),
              timestamp,
              raw: { ...m, sell_orders },
            };
          }).filter(m => {
            if (m.type === null) return false;
            if (m.type === 'vending_machine') {
              // Remove Deep Sea event shops by name (Medical shop, etc.).
              const n = (m.label || '').toLowerCase();
              if (DEEP_SEA_SHOP_NAMES.some((d) => d && n.includes(d))) return false;
              // Remove shops whose world position is off the playable map (out
              // in the ocean) — the Deep Sea event spawns its stalls there, and
              // a legit vending machine is always inside the island bounds.
              const wx = m.raw?.x ?? 0;
              const wy = m.raw?.y ?? 0;
              const margin = mapSize * 0.04; // small tolerance for shoreline shops
              if (wx < -margin || wy < -margin || wx > mapSize + margin || wy > mapSize + margin) {
                return false;
              }
            }
            return true;
          }) as any[];
          
          // Add virtual death markers to the map markers list
          mappedMarkers = [...mappedMarkers, ...deadTeamMarkers];

          // Compare markers for notifications
          const { notifyNewShops, notifyNewItems, addToast, isFirstMarkersLoad } = useMapStore.getState();

          if (!isFirstMarkersLoad && prevMarkers && prevMarkers.length > 0) {
            // Count brand-new vending machines this poll. The Deep Sea / Cargo
            // event spawns several shop markers at once — that's not players
            // opening stores, so suppress the "new shop" spam for bulk batches.
            let newShopCount = 0;
            for (const nm of mappedMarkers) {
              if (nm.type === 'vending_machine' && !prevById.has(nm.id)) newShopCount++;
            }
            const bulkShopSpawn = newShopCount > 2;

            mappedMarkers.forEach(newMarker => {
              if (newMarker.type === 'vending_machine') {
                const oldMarker = prevById.get(newMarker.id);
                const rawX = newMarker.raw?.x || 0;
                const rawY = newMarker.raw?.y || 0;
                const grid = getGridCoordinate(rawX, rawY, mapSize);
                const shopName = newMarker.label || 'Vending Machine';
                // Outpost / Bandit Camp shops rotate stock constantly (they're
                // the map's trade hubs), so their "new shop" spam is noise.
                const inSafeZone = isShopInSafeZone(newMarker.x, newMarker.y);

                if (!oldMarker) {
                  if (notifyNewShops && !bulkShopSpawn && !inSafeZone) {
                    const ordersCount = newMarker.raw?.sell_orders?.length || 0;
                    addToast(
                      'NEW VENDING MACHINE',
                      `"${shopName}" opened at ${grid} with ${ordersCount} listings.`,
                      'success',
                      {
                        shopName,
                        grid,
                        orders: newMarker.raw?.sell_orders || []
                      }
                    );
                  }
                  // Broadcast new shop to team chat if enabled.
                  if (useSettingsStore.getState().broadcastNewShops && !bulkShopSpawn && !inSafeZone) {
                    broadcastToTeam(`[SHOP] "${shopName}" opened at ${grid}`);
                  }
                  // Relay new shops to the bot (→ #raidar-shops). Skip safe-zone
                  // hubs and bulk event spawns (same noise filter as above).
                  if (!bulkShopSpawn && !inSafeZone) {
                    const ordersCount = newMarker.raw?.sell_orders?.length || 0;
                    sendDiscordWebhook(`🏪 **New Shop Opened** — "${shopName}" at ${grid}`, 'shop', [
                      { name: 'Shop', value: shopName, inline: true },
                      { name: 'Location', value: grid, inline: true },
                      { name: 'Listings', value: String(ordersCount), inline: true },
                    ], useSettingsStore.getState().broadcastNewShops);
                  }
                } else if (notifyNewItems && !inSafeZone) {
                  const newOrders = newMarker.raw?.sell_orders || [];
                  const oldOrders = oldMarker.raw?.sell_orders || [];
                  // Build a compact signature of each order list and compare.
                  // Keying by item_id alone is WRONG — a shop can list the same
                  // item at several prices, which collapses the map and makes
                  // the diff fire every single poll (infinite popup spam).
                  const orderSig = (orders: any[]) => orders
                    .map((o: any) => `${o.item_id}:${o.cost_per_item}:${o.currency_id}:${o.amount_in_stock}:${o.quantity}`)
                    .sort()
                    .join('|');
                  const oldSig = orderSig(oldOrders);
                  const newSig = orderSig(newOrders);

                  if (oldSig !== newSig) {
                    // Identify which listings actually changed (for the toast).
                    const oldKeys = new Set(oldOrders.map((o: any) => `${o.item_id}:${o.cost_per_item}:${o.currency_id}:${o.amount_in_stock}`));
                    const changedOrders = newOrders.filter((o: any) =>
                      !oldKeys.has(`${o.item_id}:${o.cost_per_item}:${o.currency_id}:${o.amount_in_stock}`));

                    if (changedOrders.length > 0) {
                      addToast(
                        'SHOP STOCK UPDATE',
                        `"${shopName}" updated inventory at ${grid}.`,
                        'info',
                        {
                          shopName,
                          grid,
                          orders: changedOrders
                        }
                      );
                    }
                  }
                }
              }
            });
          }

          if (isFirstMarkersLoad) {
            useMapStore.setState({ isFirstMarkersLoad: false });
          }

          useMapStore.getState().setMarkers(mappedMarkers);

          // ── Shop sales tracking ──
          // Feed every player vending machine's current orders into the sales
          // tracker, which diffs stock vs the last poll to accumulate what each
          // shop has actually sold. NPC shops (infinite stock) are skipped.
          {
            const salesStore = useShopSalesStore.getState();
            const srv = getCurrentServer();
            mappedMarkers.forEach((mk: any) => {
              if (mk.type !== 'vending_machine') return;
              const orders = mk.raw?.sell_orders || [];
              if (orders.length === 0) return;
              const rawX = mk.raw?.x ?? 0;
              const rawY = mk.raw?.y ?? 0;
              const grid = getGridCoordinate(rawX, rawY, mapSize);
              const inSafeZone = isShopInSafeZone(mk.x, mk.y);
              salesStore.ingest(
                {
                  shopName: mk.label || 'Vending Machine',
                  grid, x: mk.x, y: mk.y,
                  serverId: srv?.id, serverName: srv?.name,
                  isNpc: inSafeZone,
                },
                orders,
              );
              // Record price observations for the market index.
              usePriceHistoryStore.getState().ingest(srv?.id, orders);
            });
          }

          // World-event detection (cargo docking / oil-rig crate triggers /
          // crash sites / traveling vendor / deep sea). Runs each poll. We pass
          // the RAW markers too so deep-sea ocean shops (which are filtered out
          // of the rendered map) can still be detected as a single event.
          detectWorldEvents(mappedMarkers, mapSize, markers);

          // Price-watch alerts: scan all shop sell orders against watch list.
          const watches = useMapStore.getState().priceWatches;
          if (watches.length > 0) {
            const alertedWatch = (window as any).__pwAlerted || ((window as any).__pwAlerted = new Set());
            mappedMarkers.forEach((mk: any) => {
              if (mk.type !== 'vending_machine') return;
              const grid = mk.detail || '';
              (mk.raw?.sell_orders || []).forEach((o: any) => {
                if ((o.amount_in_stock ?? 0) <= 0) return;
                watches.forEach((w) => {
                  if (o.item_id !== w.itemId) return;
                  if (o.currency_id !== w.currencyId) return;
                  if (o.cost_per_item <= w.maxCost) {
                    const key = `${w.id}-${mk.id}-${o.cost_per_item}`;
                    if (alertedWatch.has(key)) return;
                    alertedWatch.add(key);
                    useMapStore.getState().addToast(
                      '💰 PRICE WATCH HIT',
                      `${w.itemName} for ${o.cost_per_item} ${o.currency_name || 'scrap'} at ${grid}`,
                      'success',
                    );
                    if (useSettingsStore.getState().broadcastPriceWatch) {
                      broadcastToTeam(`[DEAL] ${w.itemName} @ ${o.cost_per_item} ${o.currency_name || 'scrap'} - ${grid}`);
                    }
                    sendDiscordWebhook(`💰 **Price Watch** — ${w.itemName} for ${o.cost_per_item} ${o.currency_name || 'scrap'} at ${grid}`, 'price_watch', [
                      { name: 'Item', value: w.itemName, inline: true },
                      { name: 'Price', value: `${o.cost_per_item} ${o.currency_name || 'scrap'}`, inline: true },
                      { name: 'Location', value: grid, inline: true },
                    ], useSettingsStore.getState().discordPriceWatch);
                  }
                });
              });
            });
          }

          // Record event spawns (cargo/heli/chinook/crate) into activity log.
          const eventMarkers = mappedMarkers
            .filter((mk: any) => ['cargo_ship', 'patrol_heli', 'chinook', 'crate'].includes(mk.type))
            .map((mk: any) => ({ id: mk.id, type: mk.type, detail: mk.detail }));
          useActivityStore.getState().recordEvents(eventMarkers);

          // Broadcast newly-seen events to team chat & Discord if enabled.
          const seen = (window as any).__evtBroadcast || ((window as any).__evtBroadcast = new Set());
          const LABEL: Record<string, string> = {
            cargo_ship: 'Cargo Ship', patrol_heli: 'Patrol Heli', chinook: 'Chinook (CH47)', crate: 'Locked Crate',
          };
          const EMOJI: Record<string, string> = {
            cargo_ship: '🚢', patrol_heli: '🚁', chinook: '🚁', crate: '📦',
          };
          const FEATURE_KEY: Record<string, string> = {
            cargo_ship: 'cargo', patrol_heli: 'heli_chinook', chinook: 'heli_chinook', crate: 'crates',
          };
          
          eventMarkers.forEach((e: any) => {
            if (seen.has(e.id)) return;
            seen.add(e.id);

            // Play event spawn sound
            triggerSound('event_spawn');

            // Fire automation triggers for newly-seen events (independent of
            // notification settings).
            if (e.type === 'cargo_ship') fireAutomationEvent('cargo_spawn');
            else if (e.type === 'patrol_heli') fireAutomationEvent('patrol_heli_spawn');
            else if (e.type === 'chinook') fireAutomationEvent('chinook_spawn');
            else if (e.type === 'crate') fireAutomationEvent('crate_spawn');

            const label = LABEL[e.type] || e.type;
            const detailText = e.detail ? ` @ ${e.detail}` : '';
            
            if (useSettingsStore.getState().broadcastEvents) {
              broadcastToTeam(`[EVENT] ${label}${detailText}`);
            }

            // Always relay to the bot (when linked); the per-feature toggle now
            // only gates the legacy raw webhook.
            const s = useSettingsStore.getState();
            if (e.type === 'cargo_ship') {
              sendDiscordWebhook(`${EMOJI[e.type]} **Cargo Ship Spawned** — Cargo Ship has spawned on the map!`, FEATURE_KEY[e.type], [
                { name: 'Event', value: 'Cargo Ship', inline: true },
              ], s.discordCargo);
            } else if (e.type === 'patrol_heli' || e.type === 'chinook') {
              sendDiscordWebhook(`${EMOJI[e.type]} **${label} Spawned** — ${label} has spawned on the map${detailText}!`, FEATURE_KEY[e.type], [
                { name: 'Event', value: label, inline: true },
                ...(e.detail ? [{ name: 'Location', value: e.detail, inline: true }] : []),
              ], s.discordHeli);
            } else if (e.type === 'crate') {
              sendDiscordWebhook(`${EMOJI[e.type]} **Locked Crate Spawned** — A new locked crate has spawned${detailText}!`, FEATURE_KEY[e.type], [
                { name: 'Location', value: e.detail || '?', inline: true },
              ], s.crateNotifyDiscord);
            }
          });
        }
      } catch (err) {
        console.error("Failed to poll markers/team:", err);
      } finally {
        if (active) {
          // Retry quickly while we're still waiting for the map metadata, then
          // settle into the normal cadence once markers can render correctly.
          const ready = !!useMapStore.getState().mapImageBase64;
          timer = setTimeout(pollMarkersAndTeam, ready ? pollDelay(1000) : 400);
        }
      }
    };

    pollMarkersAndTeam();

    // Resume promptly when the window is shown again after a hidden backoff.
    const onVis = () => {
      if (!document.hidden && active) {
        if (timer) clearTimeout(timer);
        pollMarkersAndTeam();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [authUser, connectionStatus]);

  function mapMarkerType(typeId: number): any {
    // Rust+ AppMarkerType. NOTE: on most servers the chinook-dropped Locked
    // Crate does NOT arrive as a usable type-6 marker, so we can't rely on it —
    // oil-rig crates are auto-timed from Chinook (CH47, type 4) proximity, and
    // Cargo Ship deck crates are timed relative to the Cargo Ship marker
    // (type 5). Rust+ never exposes the unlock countdown regardless.
    switch(typeId) {
      case 1: return 'player';
      case 2: return 'explosion';   // heli crash debris / explosion marker
      case 3: return 'vending_machine';
      case 4: return 'chinook';
      case 5: return 'cargo_ship';
      case 6: return 'crate';       // rarely sent; rendered if present
      case 7: return null;          // GenericRadius — plugin/event zone circle (radius+color, no name); not rendered
      case 8: return 'patrol_heli';
      case 9: return 'vendor';      // Travelling Vendor
      default: return null;         // Unknown / Undefined - skip instead of mislabelling as a player
    }
  }

  function defaultEventLabel(type: string | null): string {
    switch (type) {
      case 'patrol_heli': return 'Patrol Helicopter';
      case 'cargo_ship': return 'Cargo Ship';
      case 'chinook': return 'Chinook (CH47)';
      case 'crate': return 'Locked Crate';
      case 'vendor': return 'Travelling Vendor';
      case 'explosion': return 'Heli Crash Site';
      default: return '';
    }
  }

  // Decay deadline watcher — alerts (and optionally broadcasts) when a tracked
  // base finishes decaying.
  useEffect(() => {
    const id = setInterval(() => {
      if (!useAuthStore.getState().user) return;
      const { markers } = useDecayStore.getState();
      const fired = (window as any).__decayFired || ((window as any).__decayFired = new Set());
      const now = Date.now();
      markers.forEach((m) => {
        if (now >= m.decaysAt && !fired.has(m.id)) {
          fired.add(m.id);
          useMapStore.getState().addToast('🏚️ BASE DECAYED', `${m.label}${m.grid ? ` (${m.grid})` : ''} has fully decayed.`, 'warning');
          if (useSettingsStore.getState().broadcastDecay) {
            broadcastToTeam(`[DECAY] ${m.label}${m.grid ? ` @ ${m.grid}` : ''} has decayed - loot it!`);
          }
          if (useSettingsStore.getState().discordDecay) {
            const decayFields: { name: string; value: string; inline?: boolean }[] = [
              { name: 'Base', value: m.label, inline: true },
            ];
            if (m.grid) decayFields.push({ name: 'Location', value: m.grid, inline: true });
            sendDiscordWebhook(`🏚️ **Base Decayed** — ${m.label}${m.grid ? ` @ ${m.grid}` : ''} has fully decayed.`, 'decay', decayFields);
          }
        }
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Locked-crate unlock watcher — alerts (team chat / in-app / Discord) when a
  // crate's hack timer hits zero. Checks every second for second-accuracy.
  useEffect(() => {
    const id = setInterval(() => {
      if (!useAuthStore.getState().user) return;
      const { markers } = useCrateStore.getState();
      const fired = (window as any).__crateFired || ((window as any).__crateFired = new Set());
      const now = Date.now();
      markers.forEach((m) => {
        if (now >= m.unlocksAt && !fired.has(m.id)) {
          fired.add(m.id);
          // Fire automation event for oil-rig crate unlocks.
          if (m.target === 'oil_rig_small' || m.target === 'oil_rig_large') {
            fireAutomationEvent('oil_crate_unlocked');
          }
          const s = useSettingsStore.getState();
          const where = m.target === 'cargo'
            ? `Cargo${m.cargoPos ? ` (${m.cargoPos})` : ''}`
            : m.label;
          if (s.crateNotifyApp) {
            useMapStore.getState().addToast('🔓 CRATE UNLOCKED', `${where} locked crate is now OPEN — grab the loot!`, 'success');
          }
          if (s.crateNotifyChat) {
            broadcastToTeam(`[CRATE] ${where} locked crate is OPEN — loot it now!`);
          }
          sendDiscordWebhook(`🔓 **Locked Crate Open** — ${where} crate has unlocked. Grab the loot!`, 'crates', [
            { name: 'Crate', value: where, inline: true },
            { name: 'Status', value: 'Unlocked — Grab the loot!', inline: true },
          ], s.crateNotifyDiscord);
        }
        // Auto-remove a crate 1 minute after it opens to keep the map clean.
        if (now >= m.unlocksAt + 60_000) {
          useCrateStore.getState().removeMarker(m.id);
        }
      });
      // Prune fired ids for crates that no longer exist to bound memory.
      if (fired.size > 0) {
        const live = new Set(markers.map((m) => m.id));
        for (const fid of fired) if (!live.has(fid)) fired.delete(fid);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Tool Cupboard decay-start watcher — fires when a paired TC's upkeep runs
  // out (protected → decaying), via entity protection data.
  useEffect(() => {
    const id = setInterval(() => {
      if (!useAuthStore.getState().user) return;
      const devices = useDeviceStore.getState().devices;
      const prev = (window as any).__tcProt || ((window as any).__tcProt = new Map<number, boolean>());
      const nowSec = Math.floor(Date.now() / 1000);
      Object.values(devices).forEach((dv: any) => {
        if (Number(dv.entityType) !== 3) return;
        const exp = dv.protectionExpiry || 0;
        if (exp <= 0 && !dv.hasProtection) return;
        const protectedNow = exp > nowSec;
        const was = prev.get(dv.entityId);
        if (was === true && !protectedNow) {
          const s = useSettingsStore.getState();
          const name = dv.customName || dv.entityName || `Tool Cupboard ${dv.entityId}`;
          const msg = `${name} has run out of upkeep and is now DECAYING`;
          if (s.tcDecayNotifyApp) useMapStore.getState().addToast('🏚️ TC DECAYING', msg, 'warning');
          if (s.tcDecayNotifyChat) broadcastToTeam(`[DECAY] ${msg}`);
          sendDiscordWebhook(`🏚️ **Your Tool Cupboard is Decaying** — ${msg}`, 'tc', [
            { name: 'Tool Cupboard', value: name, inline: true },
            { name: 'Status', value: 'Upkeep expired — decaying', inline: true },
          ], s.tcDecayNotifyDiscord);
        }
        prev.set(dv.entityId, protectedNow);
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (activePage === 'team') useTeamStore.getState().clearUnread();
  }, [activePage]);

  // Re-load RustMaps extras (caves + water well) whenever the API key or the
  // connected server's seed/size changes. Covers the case where the user pastes
  // the key AFTER connecting.
  const rustmapsKey = useSettingsStore(s => s.rustmapsKey);
  const serverSeed = useConnectionStore(s => s.serverInfo?.seed);
  const serverMapSize = useConnectionStore(s => s.serverInfo?.map_size);
  useEffect(() => {
    if (!authUser || connectionStatus !== 'connected' || !serverSeed || !serverMapSize) return;
    import('./stores/rustmaps-store').then(({ useRustMapsStore }) => {
      useRustMapsStore.getState().load(rustmapsKey, serverMapSize, serverSeed);
    });
  }, [authUser, connectionStatus, rustmapsKey, serverSeed, serverMapSize]);

  // Keep the linked Discord bot pointed at whatever server the app is on.
  // When the connected server changes, push the new server + its devices to the
  // bot (no-ops if this account isn't linked).
  const syncServerIp = useConnectionStore(s => s.serverInfo?.ip);
  const syncServerPort = useConnectionStore(s => s.serverInfo?.port);
  useEffect(() => {
    if (!authUser || connectionStatus !== 'connected' || !syncServerIp || !syncServerPort) return;
    const serverId = `${syncServerIp}:${syncServerPort}`;
    const devices = Object.values(useDeviceStore.getState().devices)
      .filter((d) => d.serverId === serverId && !d.destroyed)
      .map((d) => ({ entityId: d.entityId, name: d.customName || d.entityName, type: d.entityType }));
    const t = setTimeout(() => {
      invoke('sync_discord_server', { devices })
        .then((n) => { if (Number(n) > 0) console.log(`[discord] synced server to ${n} linked guild(s)`); })
        .catch(() => { /* not linked / bot unreachable — ignore */ });
    }, 1500); // small delay so server name is saved first
    return () => clearTimeout(t);
  }, [authUser, connectionStatus, syncServerIp, syncServerPort]);

  // Periodically refresh tracked BattleMetrics enemies' online state so the
  // "online now" indicator is accurate, and notify on online→offline.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      const token = useSettingsStore.getState().battlemetricsToken;
      const tracked = useSpyStore.getState().tracked;
      if (token && Object.keys(tracked).length > 0) {
        const { getPlayerOnlineState } = await import('./utils/battlemetrics');
        for (const t of Object.values(tracked)) {
          if (!active) return;
          try {
            const { online, lastSeen } = await getPlayerOnlineState(token, t.bmId);
            const transition = useSpyStore.getState().updateTrackedStatus(t.bmId, online, lastSeen);
            if (transition === 'offline') {
              const s = useSettingsStore.getState();
              const msg = `${t.name} just went OFFLINE`;
              if (s.enemyNotifyApp) useMapStore.getState().addToast('ENEMY OFFLINE', msg, 'info');
              if (s.enemyNotifyChat) broadcastToTeam(`[SPY] ${msg}`);
              sendDiscordWebhook(`🕵️ **Spy** — ${msg}`, 'spy', [
                { name: 'Player', value: t.name, inline: true },
                { name: 'Status', value: 'Went Offline', inline: true },
              ], s.enemyNotifyDiscord);
            } else if (transition === 'online') {
              const s = useSettingsStore.getState();
              const msg = `${t.name} just came ONLINE`;
              if (s.enemyOnlineNotifyApp) useMapStore.getState().addToast('ENEMY ONLINE', msg, 'warning');
              if (s.enemyOnlineNotifyChat) broadcastToTeam(`[SPY] ${msg}`);
              sendDiscordWebhook(`🕵️ **Spy** — ${msg}`, 'spy', [
                { name: 'Player', value: t.name, inline: true },
                { name: 'Status', value: 'Came Online', inline: true },
              ], s.enemyOnlineNotifyDiscord);
            }
          } catch { /* ignore individual failures */ }
        }
      }
      if (active) setTimeout(tick, document.hidden ? 240_000 : 45_000);
    };
    const id = setTimeout(tick, 15_000);
    return () => { active = false; clearTimeout(id); };
  }, []);

  // Pause CSS animations + GPU-heavy effects whenever the overlay isn't the
  // foreground window. While floating over Rust the webview is still "visible"
  // (so visibilitychange never fires), yet the compositor keeps animating the
  // scanline, blur panels and pulsing dots every frame — stealing GPU frames
  // from the game. Tying the pause to window focus/blur reclaims those frames.
  useEffect(() => {
    const setPaused = (paused: boolean) => {
      document.body.classList.toggle('app-hidden', paused);
    };
    const apply = () => setPaused(document.hidden || !document.hasFocus());
    apply();

    const onBlur = () => setPaused(true);
    const onFocus = () => setPaused(document.hidden);

    document.addEventListener('visibilitychange', apply);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    // Tauri native focus events are the source of truth when floating over the
    // game (the browser focus/blur can be unreliable for borderless overlays).
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onFocusChanged(({ payload: focused }) => setPaused(!focused))
      .then((un) => { unlisten = un; })
      .catch(() => {});

    return () => {
      document.removeEventListener('visibilitychange', apply);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      unlisten?.();
    };
  }, []);

  // Prevent context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  const handleToastClick = (t: any) => {
    removeToast(t.id);
    if (t.shopName) {
      const mapSize = useMapStore.getState().mapSize;
      // Many shops share a name ("A Shop"), so disambiguate by grid: prefer a
      // marker whose computed grid matches the toast's grid, then fall back to
      // name-only.
      const candidates = useMapStore.getState().markers.filter(
        (m) => m.type === 'vending_machine' && m.label === t.shopName,
      );
      const marker = (t.grid
        ? candidates.find((m) => getGridCoordinate(m.raw?.x ?? 0, m.raw?.y ?? 0, mapSize) === t.grid)
        : null) || candidates[0];
      if (marker) {
        // Center the viewport on this marker (assuming 800x800 map size)
        useMapStore.setState({
          selectedMarkerId: marker.id,
          viewport: {
            x: -(marker.x * 800 - 400) * 2.5,
            y: -(marker.y * 800 - 400) * 2.5,
            zoom: 2.5
          }
        });
        setActivePage('map');
      }
    }
  };

  return (
    <div className="app-container">
      {authLoading ? (
        <div className="app-auth-splash"><div className="app-auth-splash__mark" /></div>
      ) : !authUser ? (
        <AppShellLogin />
      ) : (
      <AppShell activePage={activePage} onNavigate={handleNavigate}>
        {activePage === 'map' && <MapView />}
        {activePage === 'team' && <TeamPanel />}
        {activePage === 'vending' && <VendingPanel />}
        {activePage === 'devices' && <DevicePanel />}
        {activePage === 'tools' && <ToolsPanel />}
        {activePage === 'spy' && <SpyPanel />}
        {activePage === 'settings' && <SettingsPanel />}
      </AppShell>
      )}

      <ConfirmDialog />
      <UpdateBanner />
      {authUser && <CommandPalette />}

      {steamUrl && (
        <SteamLoginOverlay initialUrl={steamUrl} onClose={() => setSteamUrl(null)} />
      )}


      {/* Toast notifications container */}
      <div className="toasts-container">
        {toasts.map((t) => {
          const hasOrders = t.orders && t.orders.length > 0;
          return (
            <div key={t.id} className={`toast-card toast-card--${t.type}`} onClick={() => handleToastClick(t)}>
              <div className="toast-card-header">
                <span className="toast-card-title">{t.title}</span>
                <button className="toast-card-close-btn" onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}>&times;</button>
              </div>
              <div className="toast-card-body">
                <p className="toast-card-message">{t.message}</p>
                {t.shopName && t.grid && (
                  <div className="toast-shop-meta">
                    <span className="toast-shop-name">{t.shopName}</span>
                    <span className="toast-shop-grid">{t.grid}</span>
                  </div>
                )}
                {hasOrders && (
                  <div className="toast-orders-list">
                    {t.orders!.slice(0, 3).map((o: any, idx: number) => {
                      const itemIcon = getItemIconUrl(o.item_id);
                      const currencyIcon = getItemIconUrl(o.currency_id);
                      
                      return (
                        <div key={idx} className="toast-order-row">
                          <div className="toast-order-item">
                            {itemIcon && (
                              <img 
                                src={itemIcon} 
                                alt={o.item_name}
                                className="toast-item-icon"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            <span className="toast-order-qty">{o.quantity}x</span>
                            <span className="toast-order-name">{o.item_name || 'Item'}</span>
                          </div>
                          <span className="toast-order-arrow">&rarr;</span>
                          <div className="toast-order-cost">
                            <span className="toast-order-price">{o.cost_per_item}x</span>
                            {currencyIcon && (
                              <img 
                                src={currencyIcon} 
                                alt={o.currency_name}
                                className="toast-item-icon"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            <span className="toast-order-cname">{o.currency_name || 'Scrap'}</span>
                          </div>
                        </div>
                      );
                    })}
                    {t.orders!.length > 3 && (
                      <div className="toast-more-listings">
                        + {t.orders!.length - 3} more listings
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
