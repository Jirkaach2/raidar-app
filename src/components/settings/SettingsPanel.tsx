import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useConnectionStore } from '../../stores/connection-store';
import { useMapStore } from '../../stores/map-store';
import { useTeamStore } from '../../stores/team-store';
import { useDeviceStore } from '../../stores/device-store';
import { useSpyStore } from '../../stores/spy-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useRustMapsStore } from '../../stores/rustmaps-store';
import Toggle from '../ui/Toggle';
import {
  Link2, Bell, MessageSquare, Shield, HelpCircle,
  Database, RefreshCw, Check, Power, Trash2,
  Volume2, VolumeX, Play, Upload, TrendingUp,
  SlidersHorizontal, Plug, Info, Eye, EyeOff,
  Monitor, Map as MapIcon, Webhook, KeyRound,
  Skull, Radio,
} from 'lucide-react';
import { confirmDialog } from '../../stores/confirm-store';
import './SettingsPanel.css';

interface ServerProfile {
  id: number;
  ip: string;
  port: number;
  player_id: string;
  player_token: number;
  server_name: string;
  last_connected: string;
}

type SettingsCategory =
  | 'connection'
  | 'overlay'
  | 'notifications'
  | 'sounds'
  | 'discord'
  | 'integrations'
  | 'tuning'
  | 'about';

interface CategoryDef {
  id: SettingsCategory;
  label: string;
  hint: string;
  Icon: typeof Link2;
}

/** Categories grouped into labelled sections for a cleaner left rail. */
const NAV_GROUPS: { group: string; items: CategoryDef[] }[] = [
  {
    group: 'Setup',
    items: [
      { id: 'connection', label: 'Connection', hint: 'Pairing & servers', Icon: Link2 },
      { id: 'overlay', label: 'Overlay', hint: 'In-game window', Icon: Monitor },
    ],
  },
  {
    group: 'Alerts',
    items: [
      { id: 'notifications', label: 'Notifications', hint: 'Alerts & team chat', Icon: Bell },
      { id: 'sounds', label: 'Sounds', hint: 'Audio alerts', Icon: Volume2 },
      { id: 'discord', label: 'Discord', hint: 'Bot & webhooks', Icon: MessageSquare },
    ],
  },
  {
    group: 'Data & Tools',
    items: [
      { id: 'integrations', label: 'Integrations', hint: 'API keys', Icon: Plug },
      { id: 'tuning', label: 'Server Tuning', hint: 'Rates & timers', Icon: SlidersHorizontal },
    ],
  },
  {
    group: 'App',
    items: [
      { id: 'about', label: 'About', hint: 'Version & updates', Icon: Info },
    ],
  },
];

const ALL_CATEGORIES: CategoryDef[] = NAV_GROUPS.flatMap((g) => g.items);

/* ── Presentational building blocks ─────────────────────────────────────── */

/** A titled, glassy settings card with an icon, optional description + status. */
function SettingsSection({
  icon, title, description, status, children,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section glass-panel">
      <header className="settings-section__head">
        <div className="settings-section__title">
          <span className="settings-section__icon">{icon}</span>
          <h3>{title}</h3>
        </div>
        {status}
      </header>
      {description && <p className="settings-section__desc">{description}</p>}
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

/** A small labelled group of related rows inside a section. */
function FieldGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="field-group">
      {label && <div className="field-group__label">{label}</div>}
      <div className="field-group__rows">{children}</div>
    </div>
  );
}

/** A single label/description row with a control aligned to the right. */
function SettingRow({
  title, description, children, indent,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  indent?: boolean;
}) {
  return (
    <div className={`setting-row${indent ? ' setting-row--indent' : ''}`}>
      <div className="setting-row__text">
        <span className="setting-row__label">{title}</span>
        {description && <span className="setting-row__desc">{description}</span>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

/** A multi-target toggle row (e.g. Map / App / Chat) with small captioned switches. */
function MultiToggleRow({
  title, description, targets, indent, dimmed,
}: {
  title: string;
  description?: ReactNode;
  targets: { caption: string; checked: boolean; onChange: (v: boolean) => void }[];
  indent?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div className={`setting-row${indent ? ' setting-row--indent' : ''}`} style={dimmed ? { opacity: 0.45 } : undefined}>
      <div className="setting-row__text">
        <span className="setting-row__label">{title}</span>
        {description && <span className="setting-row__desc">{description}</span>}
      </div>
      <div className="setting-row__targets">
        {targets.map((t) => (
          <div key={t.caption} className="toggle-target">
            <span className="toggle-target__cap">{t.caption}</span>
            <Toggle checked={t.checked} onChange={t.onChange} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Password-style input with a show/hide eye toggle. */
function SecretInput({
  value, onChange, placeholder, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="secret-input">
      <input
        type={show ? 'text' : 'password'}
        className="secret-input__field"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="secret-input__toggle"
        onClick={() => setShow((s) => !s)}
        title={show ? 'Hide' : 'Show'}
        tabIndex={-1}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

/** Small status pill with a colored dot. */
function StatusPill({ tone, label }: { tone: 'on' | 'off' | 'warn' | 'error'; label: string }) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      <span className="status-pill__dot" />
      {label}
    </span>
  );
}

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsCategory>('connection');
  const [autoStatus, setAutoStatus] = useState<string>('Initializing sidecar...');
  const [profiles, setProfiles] = useState<ServerProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [botLinks, setBotLinks] = useState<{ guildId: string; guildName: string; serverName: string; allowedUserIds: string[] }[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [botAvailable, setBotAvailable] = useState<boolean | null>(null);
  const [allowDraft, setAllowDraft] = useState<Record<string, string>>({});
  const [switchingServerId, setSwitchingServerId] = useState<number | null>(null);
  const [hasPendingSteam, setHasPendingSteam] = useState(false);

  useEffect(() => {
    const checkPending = async () => {
      try {
        const hasPending = await invoke<boolean>('has_pending_steam_login');
        setHasPendingSteam(hasPending);
      } catch {}
    };
    checkPending();
    const interval = setInterval(checkPending, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleReopenSteam = async () => {
    try {
      await invoke('reopen_steam_login');
    } catch (e: any) {
      useMapStore.getState().addToast('Steam Login', e?.message || e, 'warning');
    }
  };

  const connectionStatus = useConnectionStore(s => s.status);
  const setConnectionStatus = useConnectionStore(s => s.setStatus);
  const serverInfo = useConnectionStore(s => s.serverInfo);

  const { notifyNewShops, setNotifyNewShops, notifyNewItems, setNotifyNewItems } = useMapStore();
  const settings = useSettingsStore();
  const rustmapsStatus = useRustMapsStore(s => s.status);
  const rustmapsMessage = useRustMapsStore(s => s.message);

  const currentIp = serverInfo?.ip;
  const currentPort = serverInfo?.port;

  // Load server profiles
  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const p = await invoke<ServerProfile[]>('get_server_profiles');
      setProfiles(p);

      // Auto-resolve empty/IP server names in background via BattleMetrics
      p.forEach(async (profile) => {
        const hasNoName = !profile.server_name ||
                          profile.server_name.trim() === "" ||
                          profile.server_name === profile.ip ||
                          profile.server_name === `${profile.ip}:${profile.port}`;
        if (hasNoName) {
          try {
            const { resolveServerName } = await import('../../utils/battlemetrics');
            const resolvedName = await resolveServerName(profile.ip);
            if (resolvedName) {
              await invoke('update_server_name', { id: profile.id, name: resolvedName });
              // Silently refresh list
              const updated = await invoke<ServerProfile[]>('get_server_profiles');
              setProfiles(updated);
            }
          } catch (err) {
            console.error(`Auto-resolution failed for profile ${profile.id}:`, err);
          }
        }
      });
    } catch (err) {
      console.error("Failed to fetch server profiles:", err);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleDeleteProfile = async (id: number, ip: string, port: number) => {
    const ok = await confirmDialog({
      title: 'DELETE PROFILE',
      message: 'Are you sure you want to delete this server profile from paired history?',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true
    });
    if (!ok) return;
    try {
      await invoke('delete_server_profile', { id });
      if (connectionStatus === 'connected' && ip === currentIp && port === currentPort) {
        await handleDisconnect();
      } else {
        await fetchProfiles();
      }
    } catch (err) {
      console.error("Failed to delete profile:", err);
    }
  };

  const handleClearProfiles = async () => {
    const ok = await confirmDialog({
      title: 'CLEAR ALL PAIRINGS',
      message: 'Are you sure you want to clear ALL paired server profiles? This will disconnect you and wipe all pairing histories.',
      confirmLabel: 'Clear All',
      cancelLabel: 'Cancel',
      danger: true
    });
    if (!ok) return;

    try {
      await invoke('clear_server_profiles');
      await handleDisconnect();
      await fetchProfiles();
    } catch (err) {
      console.error("Failed to clear server profiles:", err);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [connectionStatus]);

  // Load the running app version for the Updates card.
  useEffect(() => {
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((v) => setAppVersion(v))
      .catch(() => {});
  }, []);

  const handleLinkBot = async () => {
    const code = linkCode.trim().toUpperCase();
    if (!code) { useMapStore.getState().addToast('Discord Bot', 'Enter the link code from /link in Discord.', 'warning'); return; }
    setLinking(true);
    try {
      const devices = Object.values(useDeviceStore.getState().devices).map((d) => ({
        entityId: d.entityId,
        name: d.customName || d.entityName,
        type: d.entityType,
      }));
      await invoke<string>('link_discord_bot', { code, devices });
      setLinkCode('');
      await refreshLinks();
      useMapStore.getState().addToast('Discord Bot', 'Linked! Your server is now connected to the bot.', 'success');
    } catch (e: any) {
      useMapStore.getState().addToast('Discord Bot', `Link failed: ${e?.message || e}`, 'warning');
    } finally {
      setLinking(false);
    }
  };

  const refreshLinks = async () => {
    setLoadingLinks(true);
    try {
      const online = await invoke<boolean>('check_bot_health');
      setBotAvailable(online);
      if (online) {
        const links = await invoke<{ guildId: string; guildName: string; serverName: string; allowedUserIds: string[] }[]>('get_discord_links');
        setBotLinks(links);
      } else {
        setBotLinks([]);
      }
    } catch {
      setBotLinks([]);
      setBotAvailable(false);
    } finally {
      setLoadingLinks(false);
    }
  };

  const saveAllowed = async (guildId: string, userIds: string[]) => {
    try {
      await invoke('set_discord_permissions', { guildId, userIds });
      setBotLinks((links) => links.map((l) => (l.guildId === guildId ? { ...l, allowedUserIds: userIds } : l)));
    } catch (e: any) {
      useMapStore.getState().addToast('Discord Bot', `Couldn’t update whitelist: ${e?.message || e}`, 'warning');
    }
  };
  const handleAddAllowed = (guildId: string) => {
    const id = (allowDraft[guildId] || '').trim();
    if (!/^\d{5,}$/.test(id)) { useMapStore.getState().addToast('Discord Bot', 'Enter a valid Discord user ID (numbers only).', 'warning'); return; }
    const link = botLinks.find((l) => l.guildId === guildId);
    const next = Array.from(new Set([...(link?.allowedUserIds || []), id]));
    setAllowDraft((d) => ({ ...d, [guildId]: '' }));
    saveAllowed(guildId, next);
  };
  const handleRemoveAllowed = (guildId: string, id: string) => {
    const link = botLinks.find((l) => l.guildId === guildId);
    saveAllowed(guildId, (link?.allowedUserIds || []).filter((u) => u !== id));
  };

  const handleTestNotify = async () => {
    try {
      const n = await invoke<number>('notify_discord_bot', {
        feature: 'event',
        content: '🔔 **Test Notification** — your Raidar app → bot link is working!',
        fields: null,
      });
      if (Number(n) > 0) useMapStore.getState().addToast('Discord Bot', `Test sent — posted to ${n} channel${n === 1 ? '' : 's'}.`, 'success');
      else useMapStore.getState().addToast('Discord Bot', 'Reached the bot, but no channel is set. Run /channels or /alarms here in Discord.', 'warning');
    } catch (e: any) {
      useMapStore.getState().addToast('Discord Bot', `Test failed: ${e?.message || e}`, 'warning');
    }
  };

  const handleUnlink = async (guildId: string) => {
    if (!(await confirmDialog({ title: 'UNLINK SERVER', message: 'Disconnect this Discord server from the bot? Its stored credentials will be removed.', confirmLabel: 'Unlink', danger: true }))) return;
    try {
      await invoke('unlink_discord', { guildId });
      await refreshLinks();
      useMapStore.getState().addToast('Discord Bot', 'Server unlinked.', 'info');
    } catch (e: any) {
      useMapStore.getState().addToast('Discord Bot', `Unlink failed: ${e?.message || e}`, 'warning');
    }
  };

  // Load link status when the Discord tab opens.
  useEffect(() => {
    if (activeTab === 'discord') refreshLinks();
  }, [activeTab]);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus('Checking for updates…');
    try {
      const info = await invoke<{ version: string; current: string; notes?: string } | null>('check_for_update');
      if (!info) {
        setUpdateStatus("You're on the latest version.");
        return;
      }
      setUpdateStatus(`Update available: v${info.version}. Downloading & installing…`);
      // install_update downloads, installs and relaunches the app.
      await invoke('install_update');
    } catch (e: any) {
      setUpdateStatus(`Update check failed: ${e?.message || e}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    let unlistenPromise: Promise<() => void>;
    async function setupFcmListener() {
      unlistenPromise = listen('fcm-status', (event: any) => {
        if (event.payload && event.payload.status) {
          setAutoStatus(event.payload.status);
        }
      });
    }
    setupFcmListener();
    return () => {
      if (unlistenPromise) unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  const handleDisconnect = async () => {
    try {
      const res = await invoke<string>('disconnect');
      setAutoStatus(res);

      // Reset connection status and all frontend stores
      setConnectionStatus('disconnected');
      useMapStore.getState().reset();
      useTeamStore.getState().reset();
      useDeviceStore.getState().reset();
      useSpyStore.getState().clearTeam();
      useConnectionStore.getState().disconnect();
    } catch (err: any) {
      setAutoStatus(`Error: ${err}`);
    }
  };

  const handleSwitchServer = async (profile: ServerProfile) => {
    setSwitchingServerId(profile.id);
    try {
      setAutoStatus(`Connecting to ${profile.server_name || profile.ip}...`);
      setConnectionStatus('connecting');

      const res = await invoke<string>('connect', {
        ip: profile.ip,
        port: profile.port,
        playerId: profile.player_id,
        playerToken: profile.player_token
      });

      setAutoStatus(res);
      setConnectionStatus('connected');
      useConnectionStore.getState().bumpConnectEpoch();

      // Fetch server details
      const info: any = await invoke('get_server_info');
      useConnectionStore.getState().setServerInfo(info);
    } catch (err: any) {
      setAutoStatus(`Switch failed: ${err}`);
      setConnectionStatus('error');
    } finally {
      setSwitchingServerId(null);
    }
  };

  /* ── Reusable bits for the Discord webhooks list ──────────────────────── */
  const webhookFields: {
    label: string;
    feature: string;
    enabled: boolean;
    onToggle: (v: boolean) => void;
  }[] = [
    { label: 'Smart Alarms', feature: 'alarms', enabled: settings.discordAlarms, onToggle: settings.setDiscordAlarms },
    { label: 'Price Watch', feature: 'price_watch', enabled: settings.discordPriceWatch, onToggle: settings.setDiscordPriceWatch },
    { label: 'Base Decay & TC Upkeep', feature: 'decay', enabled: settings.tcDecayNotifyDiscord || settings.discordDecay, onToggle: (v) => { settings.setTcDecayNotifyDiscord(v); settings.setDiscordDecay(v); } },
    { label: 'Locked Crate Unlocks', feature: 'crates', enabled: settings.crateNotifyDiscord, onToggle: settings.setCrateNotifyDiscord },
    { label: 'Cargo Ship Events', feature: 'cargo', enabled: settings.discordCargo, onToggle: settings.setDiscordCargo },
    { label: 'Patrol Heli & Chinook', feature: 'heli_chinook', enabled: settings.discordHeli, onToggle: settings.setDiscordHeli },
    { label: 'Rust Spy Offline / Online', feature: 'spy', enabled: settings.enemyNotifyDiscord || settings.enemyOnlineNotifyDiscord, onToggle: (v) => { settings.setEnemyNotifyDiscord(v); settings.setEnemyOnlineNotifyDiscord(v); } },
    { label: 'Watchlist Game / VAC Bans', feature: 'bans', enabled: settings.discordBans, onToggle: settings.setDiscordBans },
  ];

  const crateMinutes = settings.defaultCrateSeconds / 60;
  const crateMinutesDisplay = crateMinutes % 1 === 0 ? crateMinutes : crateMinutes.toFixed(1);

  const active = ALL_CATEGORIES.find((c) => c.id === activeTab)!;

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2 className="settings-title">Settings</h2>
        <p className="settings-subtitle">Configure connections, alerts, integrations and the in-game overlay.</p>
      </div>

      <div className="settings-layout">
        {/* Left category navigation */}
        <nav className="settings-nav" aria-label="Settings categories">
          {NAV_GROUPS.map((grp) => (
            <div key={grp.group} className="settings-nav-group">
              <span className="settings-nav-group__label">{grp.group}</span>
              {grp.items.map((c) => {
                const Icon = c.Icon;
                return (
                  <button
                    key={c.id}
                    className={`settings-nav-item ${activeTab === c.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(c.id)}
                  >
                    <Icon size={16} className="settings-nav-item__icon" />
                    <span className="settings-nav-item__text">
                      <span className="settings-nav-item__label">{c.label}</span>
                      <span className="settings-nav-item__hint">{c.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Right content area */}
        <div className="settings-content">
          <div className="settings-content__head">
            <active.Icon size={18} />
            <h3>{active.label}</h3>
          </div>

          {/* ── CONNECTION ──────────────────────────────────────────── */}
          {activeTab === 'connection' && (
            <div className="settings-stack">
              <SettingsSection
                icon={<Link2 size={15} />}
                title="Automated Pairing"
                status={
                  <StatusPill
                    tone={connectionStatus === 'connected' ? 'on' : 'off'}
                    label={connectionStatus === 'connected' ? 'Connected' : 'Offline'}
                  />
                }
                description={<>In Rust, open <b>Settings → Rust+</b> and click <b>"Pair with Server"</b>. Raidar intercepts the token and connects automatically.</>}
              >
                <div className="settings-statusline">
                  Status:{' '}
                  <span className="settings-statusline__val">
                    {connectionStatus === 'connected' ? `Connected to ${serverInfo?.name || 'Rust+ Server'}` : autoStatus}
                  </span>
                </div>

                {hasPendingSteam && (
                  <button onClick={handleReopenSteam} className="btn-accent btn-block" style={{ marginTop: 12 }}>
                    <Link2 size={13} /> Reopen Steam pairing window
                  </button>
                )}

                {connectionStatus === 'connected' && (
                  <button onClick={handleDisconnect} className="btn-danger btn-block" style={{ marginTop: 12 }}>
                    <Power size={13} /> Disconnect from server
                  </button>
                )}
              </SettingsSection>

              <SettingsSection
                icon={<Database size={15} />}
                title="Seamless Server Switching"
                status={
                  <div className="settings-section__actions">
                    {profiles.length > 0 && (
                      <button onClick={handleClearProfiles} className="btn-ghost-danger">
                        <Trash2 size={11} /> Clear all
                      </button>
                    )}
                    <button onClick={fetchProfiles} disabled={loadingProfiles} className="btn-icon" title="Refresh">
                      <RefreshCw size={13} className={loadingProfiles ? 'spin' : ''} />
                    </button>
                  </div>
                }
                description="Click any previously paired server to switch instantly — no need to re-pair."
              >
                {profiles.length === 0 ? (
                  <div className="settings-empty">No saved server profiles yet. Pair a server first to populate this list.</div>
                ) : (
                  <div className="server-switch-list">
                    {profiles.map((p) => {
                      const isActive = connectionStatus === 'connected' && p.ip === currentIp && p.port === currentPort;
                      const isSwitching = switchingServerId === p.id;
                      return (
                        <div key={p.id} className={`server-switch-item ${isActive ? 'active' : ''}`}>
                          <div className="server-switch-item__info">
                            <div className={`server-switch-item__name ${isActive ? 'is-active' : ''}`}>
                              {p.server_name || `${p.ip}:${p.port}`}
                            </div>
                            <div className="server-switch-item__meta">
                              {p.ip}:{p.port} • ID: {p.player_id.slice(0, 8)}...
                            </div>
                          </div>
                          <div className="server-switch-item__actions">
                            {isActive ? (
                              <span className="server-switch-item__connected">
                                <Check size={13} /> Connected
                              </span>
                            ) : (
                              <button
                                onClick={() => handleSwitchServer(p)}
                                disabled={switchingServerId !== null}
                                className="btn-secondary btn-secondary--xs"
                              >
                                {isSwitching ? 'Switching…' : 'Switch'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteProfile(p.id, p.ip, p.port)}
                              className="btn-icon-danger"
                              title="Delete server profile"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SettingsSection>
            </div>
          )}

          {/* ── OVERLAY ─────────────────────────────────────────────── */}
          {activeTab === 'overlay' && (
            <div className="settings-stack">
              <SettingsSection
                icon={<Monitor size={15} />}
                title="Game Overlay"
                status={<StatusPill tone={settings.overlayMode ? 'on' : 'off'} label={settings.overlayMode ? 'On' : 'Off'} />}
                description="Float Raidar on top of Rust. Run the game in Borderless window mode for best results."
              >
                <SettingRow
                  title="Overlay interaction"
                  description="Keeps the window always-on-top over RustClient."
                >
                  <Toggle checked={settings.overlayMode} onChange={settings.setOverlayMode} />
                </SettingRow>
                <SettingRow
                  title="Show / hide hotkey"
                  description="Global shortcut to toggle the overlay (e.g. F8)."
                >
                  <input
                    type="text"
                    className="settings-input settings-input--sm"
                    value={settings.overlayHotkey}
                    onChange={(e) => settings.setOverlayHotkey(e.target.value.trim())}
                    placeholder="F8"
                  />
                </SettingRow>
              </SettingsSection>
            </div>
          )}

          {/* ── NOTIFICATIONS ───────────────────────────────────────── */}
          {activeTab === 'notifications' && (
            <div className="settings-stack">
              <SettingsSection
                icon={<Bell size={15} />}
                title="Map & App Alerts"
                description="In-app notifications for activity on the live map."
              >
                <SettingRow title="New vending shops" description="Notify when a new player vending machine appears on the map.">
                  <Toggle checked={notifyNewShops} onChange={setNotifyNewShops} />
                </SettingRow>
                <SettingRow title="Shop stock updates" description="Notify when a shop's stock changes or prices update.">
                  <Toggle checked={notifyNewItems} onChange={setNotifyNewItems} />
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={<MessageSquare size={15} />}
                title="Team Chat Broadcasts"
                description={<>Post these status alerts directly into your in-game <b>team chat</b> so teammates stay synced.</>}
              >
                <FieldGroup label="World & Market">
                  <SettingRow title="Server events → chat" description="Cargo, Patrol Heli, Chinook & crate spawns.">
                    <Toggle checked={settings.broadcastEvents} onChange={settings.setBroadcastEvents} />
                  </SettingRow>
                  <SettingRow title="New shops → chat" description="Announce newly-opened shops and their grid coordinates.">
                    <Toggle checked={settings.broadcastNewShops} onChange={settings.setBroadcastNewShops} />
                  </SettingRow>
                  <SettingRow title="Price watch → chat" description="When a watched item drops under your target scrap price.">
                    <Toggle checked={settings.broadcastPriceWatch} onChange={settings.setBroadcastPriceWatch} />
                  </SettingRow>
                  <SettingRow title="Base decay done → chat" description="When a tracked enemy base finishes decaying.">
                    <Toggle checked={settings.broadcastDecay} onChange={settings.setBroadcastDecay} />
                  </SettingRow>
                </FieldGroup>
              </SettingsSection>

              <SettingsSection
                icon={<Radio size={15} />}
                title="Base & Raid Alarms"
                description="Choose where each alert is delivered: the map, an in-app toast, or your in-game team chat."
              >
                <MultiToggleRow
                  title="TC decay alerts"
                  description="Alert when a paired Tool Cupboard runs out of upkeep resources."
                  targets={[
                    { caption: 'App', checked: settings.tcDecayNotifyApp, onChange: settings.setTcDecayNotifyApp },
                    { caption: 'Chat', checked: settings.tcDecayNotifyChat, onChange: settings.setTcDecayNotifyChat },
                  ]}
                />
                <MultiToggleRow
                  title="Smart alarms"
                  description="Alert when smart alarms are triggered (raid notifications)."
                  targets={[
                    { caption: 'App', checked: settings.notifyAlarms, onChange: settings.setNotifyAlarms },
                    { caption: 'Chat', checked: settings.broadcastAlarms, onChange: settings.setBroadcastAlarms },
                  ]}
                />
                <SettingRow
                  title="Cross-server alarms"
                  description="Show smart alarms from other paired Rust servers (e.g. while on a different server)."
                  indent
                >
                  <Toggle checked={settings.crossServerAlarms} onChange={settings.setCrossServerAlarms} />
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={<Skull size={15} />}
                title="Teammate Deaths"
                description="Track when teammates die — show indicators on the map, an in-app toast, or broadcast to chat."
              >
                <MultiToggleRow
                  title="Death alerts"
                  description="When teammates die, show indicators on the map and/or broadcast to chat."
                  targets={[
                    { caption: 'Map', checked: settings.markTeammateDeaths, onChange: settings.setMarkTeammateDeaths },
                    { caption: 'App', checked: settings.notifyDeaths, onChange: settings.setNotifyDeaths },
                    { caption: 'Chat', checked: settings.broadcastDeaths, onChange: settings.setBroadcastDeaths },
                  ]}
                />
                <SettingRow
                  title="Show teammate deaths on map"
                  description="If disabled, only YOUR own deaths appear on the live map."
                >
                  <Toggle checked={settings.showTeammateDeathsOnMap} onChange={settings.setShowTeammateDeathsOnMap} />
                </SettingRow>
              </SettingsSection>
            </div>
          )}

          {/* ── SOUNDS ──────────────────────────────────────────────── */}
          {activeTab === 'sounds' && (
            <div className="settings-stack">
              <SettingsSection
                icon={<Volume2 size={15} />}
                title="Sound Alerts & Notifications"
                status={<StatusPill tone={settings.soundEnabled ? 'on' : 'off'} label={settings.soundEnabled ? 'Enabled' : 'Muted'} />}
                description="Audio feedback for events, alarms and deaths."
              >
                <SettingRow title="Enable sounds" description="Master switch for all audio feedback.">
                  <Toggle checked={settings.soundEnabled} onChange={settings.setSoundEnabled} />
                </SettingRow>
                <SettingRow title="Alert volume" description="Adjust sound effect loudness level.">
                  <div className="volume-control">
                    <VolumeX size={13} className="text-dim" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.soundVolume}
                      onChange={(e) => settings.setSoundVolume(parseFloat(e.target.value))}
                      className="volume-slider"
                    />
                    <Volume2 size={13} className="text-dim" />
                    <span className="volume-value">{Math.round(settings.soundVolume * 100)}%</span>
                  </div>
                </SettingRow>

                <div className="settings-subhead">
                  <span className="settings-subhead__title">Configure sound events</span>
                  <span className="settings-subhead__desc">Toggle each alert, preview it, or upload your own WAV/MP3.</span>
                </div>

                {[
                  { section: 'Combat', events: [{ id: 'teammate_offline_death', label: 'Teammate died (offline)', desc: 'A teammate was killed while logged off — likely being raided.' }] },
                  { section: 'Base & Raid', events: [{ id: 'smart_alarm', label: 'Smart alarm triggered', desc: 'A paired smart alarm fired — possible base intrusion.' }] },
                  { section: 'World Events', events: [{ id: 'event_spawn', label: 'Event spawned', desc: 'Patrol Heli, Cargo Ship, or a locked crate appeared.' }] },
                ].map((grp) => (
                  <div key={grp.section} className="sound-group">
                    <span className="sound-group__title">{grp.section}</span>
                    {grp.events.map((act) => {
                      const hasCustom = !!settings.customSounds?.[act.id];
                      const enabled = settings.soundEvents?.[act.id] !== false;
                      return (
                        <div key={act.id} className="sound-item" style={{ opacity: enabled ? 1 : 0.55 }}>
                          <div className="sound-item__left">
                            <Toggle checked={enabled} onChange={(v) => settings.setSoundEvent(act.id, v)} size="sm" />
                            <div className="sound-item__text">
                              <span className="sound-item__label">{act.label}</span>
                              <span className="sound-item__desc">{act.desc}</span>
                            </div>
                          </div>
                          <div className="sound-item__actions">
                            <button
                              className="sound-btn"
                              title="Preview sound"
                              onClick={() => { import('../../utils/sounds').then(({ triggerSound }) => triggerSound(act.id, { force: true })); }}
                            >
                              <Play size={11} /> Test
                            </button>
                            <label className={`sound-btn ${hasCustom ? 'sound-btn--custom' : ''}`} title="Upload custom WAV/MP3 sound">
                              <Upload size={11} /> {hasCustom ? 'Custom' : 'Upload'}
                              <input
                                type="file"
                                accept="audio/*"
                                style={{ display: 'none' }}
                                onChange={(ev) => {
                                  const file = ev.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    if (typeof reader.result === 'string') {
                                      settings.setCustomSound(act.id, reader.result);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>
                            {hasCustom && (
                              <button className="sound-btn sound-btn--danger" title="Reset to default sound" onClick={() => settings.setCustomSound(act.id, null)}>
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </SettingsSection>
            </div>
          )}

          {/* ── DISCORD ─────────────────────────────────────────────── */}
          {activeTab === 'discord' && (
            <div className="settings-stack">
              {botAvailable === false && (
                <div className="settings-banner settings-banner--danger">
                  <strong>Discord bot offline</strong>
                  The Raidar companion bot is currently offline or unreachable. Linking servers, configuring whitelist permissions, and pushing notifications are temporarily unavailable.
                </div>
              )}

              <SettingsSection
                icon={<MessageSquare size={15} />}
                title="Raidar Bot"
                status={
                  <StatusPill
                    tone={loadingLinks ? 'warn' : botLinks.length ? 'on' : 'off'}
                    label={loadingLinks ? 'Checking…' : botLinks.length ? `Linked · ${botLinks.length}` : 'Not linked'}
                  />
                }
                description="Connect this app to the Raidar Discord bot so your team can check status, control devices and get alarm notifications from Discord — even when this app is closed. Your current server and devices transfer automatically."
              >
                {botLinks.length > 0 && (
                  <div className="bot-links">
                    {botLinks.map((l) => (
                      <div key={l.guildId} className="bot-link">
                        <div className="bot-link__head">
                          <div className="bot-link__avatar"><MessageSquare size={15} color="#5865F2" /></div>
                          <div className="bot-link__info">
                            <div className="bot-link__guild">{l.guildName}</div>
                            <div className="bot-link__server">{l.serverName || 'Rust server'}</div>
                          </div>
                          <button onClick={() => handleUnlink(l.guildId)} className="btn-outline-danger" title="Unlink this server">
                            <Trash2 size={12} /> Unlink
                          </button>
                        </div>
                        <div className="bot-link__whitelist">
                          <div className="bot-link__whitelist-title">Who can control devices</div>
                          <div className="bot-link__chips">
                            {l.allowedUserIds.map((id) => (
                              <span key={id} className="user-chip">
                                {id}
                                <button onClick={() => handleRemoveAllowed(l.guildId, id)} disabled={botAvailable === false} title="Remove" className="user-chip__x">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
                                </button>
                              </span>
                            ))}
                            {l.allowedUserIds.length === 0 && (
                              <span className="bot-link__empty">Server admins only (no one whitelisted yet)</span>
                            )}
                          </div>
                          <div className="settings-inline-input">
                            <input
                              type="text"
                              placeholder="Discord user ID"
                              value={allowDraft[l.guildId] || ''}
                              onChange={(e) => setAllowDraft((d) => ({ ...d, [l.guildId]: e.target.value.replace(/\D/g, '') }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddAllowed(l.guildId); }}
                              disabled={botAvailable === false}
                              className="settings-input settings-input--mono"
                            />
                            <button
                              onClick={() => handleAddAllowed(l.guildId)}
                              disabled={botAvailable === false || !(allowDraft[l.guildId] || '').trim()}
                              className="btn-accent btn-accent--sm"
                            >
                              Add
                            </button>
                          </div>
                          <p className="settings-fineprint">
                            Enable Developer Mode in Discord, right-click a user → Copy User ID. Listed users (and server admins) can use <strong>/control</strong>, <strong>/toggle</strong> and <strong>/say</strong>.
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="link-box">
                  <div className="link-box__title">{botLinks.length ? 'Link another server' : 'Link a Discord server'}</div>
                  <p className="link-box__desc">
                    In your Discord server, run <strong>/link</strong> and paste the 6-character code below.
                  </p>
                  <div className="settings-inline-input">
                    <input
                      type="text"
                      placeholder="ABC123"
                      value={linkCode}
                      onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      disabled={botAvailable === false}
                      className="link-code-input"
                    />
                    <button
                      onClick={handleLinkBot}
                      disabled={linking || linkCode.trim().length < 6 || botAvailable === false}
                      className="btn-accent"
                    >
                      <Link2 size={13} /> {linking ? 'Linking…' : 'Link'}
                    </button>
                  </div>
                </div>

                {botLinks.length > 0 && (
                  <button onClick={handleTestNotify} disabled={botAvailable === false} className="btn-secondary" style={{ marginTop: 12 }}>
                    🔔 Send test notification
                  </button>
                )}
              </SettingsSection>

              <SettingsSection
                icon={<Webhook size={15} />}
                title="Discord Webhook Integration"
                description="Redirect notifications to specific Discord channels. Create a webhook URL in your channel settings and paste it below. Feature-specific URLs override the default fallback."
              >
                <div className="webhook-row">
                  <label className="webhook-label">Default fallback webhook URL</label>
                  <SecretInput
                    value={settings.discordWebhookUrl}
                    onChange={settings.setDiscordWebhookUrl}
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                </div>

                <div className="webhook-row">
                  <label className="webhook-label">Ping role on alert</label>
                  <input
                    type="text"
                    placeholder="everyone, a role ID, or blank"
                    value={settings.discordPingRole}
                    onChange={(e) => settings.setDiscordPingRole(e.target.value)}
                    className="webhook-input"
                  />
                  <span className="settings-fineprint">Type "everyone" to tag @everyone, or paste a numerical role ID.</span>
                </div>

                <div className="settings-subhead">
                  <span className="settings-subhead__title">Feature-specific webhook channels</span>
                  <span className="settings-subhead__desc">Toggle each feature and optionally route it to its own channel.</span>
                </div>

                {webhookFields.map((f) => (
                  <div className="webhook-row" key={f.feature}>
                    <div className="webhook-label-wrapper">
                      <span className="webhook-label">{f.label} <code>{f.feature}</code></span>
                      <Toggle checked={f.enabled} onChange={f.onToggle} size="sm" />
                    </div>
                    <SecretInput
                      value={settings.discordWebhooks[f.feature] || ''}
                      onChange={(v) => settings.setDiscordWebhookFor(f.feature, v)}
                      placeholder="Feature-specific webhook URL (overrides default)"
                    />
                  </div>
                ))}
              </SettingsSection>
            </div>
          )}

          {/* ── INTEGRATIONS ────────────────────────────────────────── */}
          {activeTab === 'integrations' && (
            <div className="settings-stack">
              <SettingsSection
                icon={<MapIcon size={15} />}
                title="RustMaps"
                status={
                  rustmapsStatus === 'ready' ? <StatusPill tone="on" label="Active" />
                    : rustmapsStatus === 'loading' || rustmapsStatus === 'generating' ? <StatusPill tone="warn" label="Loading" />
                    : rustmapsStatus === 'error' ? <StatusPill tone="error" label="Error" />
                    : <StatusPill tone="off" label="Inactive" />
                }
                description="Shows caves and the jungle Water Well Shopkeeper on the map — these aren't sent over Rust+, so they're pulled from the generated map by seed + size. Get a free API key at rustmaps.com → account → API. Cached per wipe, so it only calls once."
              >
                <div className="webhook-row">
                  <label className="webhook-label">RustMaps API key</label>
                  <SecretInput value={settings.rustmapsKey} onChange={settings.setRustmapsKey} placeholder="Paste RustMaps API key..." />
                </div>
                {rustmapsStatus === 'ready' ? (
                  <div className="integration-status integration-status--ok">● Active — map extras loaded</div>
                ) : rustmapsStatus === 'loading' || rustmapsStatus === 'generating' ? (
                  <div className="integration-status integration-status--warn">● {rustmapsMessage || 'Loading map extras…'}</div>
                ) : rustmapsStatus === 'error' ? (
                  <div className="integration-status integration-status--error">● {rustmapsMessage || 'RustMaps error.'}</div>
                ) : (
                  <div className="integration-status">Add a key to enable caves, water wells, tunnels &amp; labs.</div>
                )}
              </SettingsSection>

              <SettingsSection
                icon={<KeyRound size={15} />}
                title="BattleMetrics"
                status={<StatusPill tone={settings.battlemetricsToken.trim() ? 'on' : 'off'} label={settings.battlemetricsToken.trim() ? 'Active' : 'Inactive'} />}
                description="Enables offline/online enemy tracking in Rust Spy. Obtain your token from your BattleMetrics account settings page."
              >
                <div className="webhook-row">
                  <label className="webhook-label">BattleMetrics token</label>
                  <SecretInput value={settings.battlemetricsToken} onChange={settings.setBattlemetricsToken} placeholder="Paste BattleMetrics token..." />
                </div>
              </SettingsSection>
            </div>
          )}

          {/* ── SERVER TUNING ───────────────────────────────────────── */}
          {activeTab === 'tuning' && (
            <div className="settings-stack">
              <SettingsSection
                icon={<RefreshCw size={15} />}
                title="Recycler Multiplier"
                description="Resource scaling for modded (gather-rate) servers."
              >
                <SettingRow title="Auto-detect multiplier" description="Try to read the gather multiplier from the server name.">
                  <Toggle checked={settings.recyclerAutoDetect} onChange={settings.setRecyclerAutoDetect} />
                </SettingRow>
                <SettingRow title="Manual multiplier" description="Recycler resource scale override for modded servers.">
                  <input
                    type="number"
                    min={1}
                    className="settings-input settings-input--num"
                    value={settings.recyclerMultiplier}
                    onChange={(e) => { settings.setRecyclerAutoDetect(false); settings.setRecyclerMultiplier(parseInt(e.target.value) || 1); }}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={<TrendingUp size={15} />}
                title="Vending Sales Multiplier"
                description="Scale tracked sales quantities for modded servers."
              >
                <SettingRow title="Sales multiplier" description="Multiply tracked sales quantities by this rate.">
                  <input
                    type="number"
                    min={1}
                    className="settings-input settings-input--num"
                    value={settings.vendingMultiplier}
                    onChange={(e) => settings.setVendingMultiplier(parseInt(e.target.value) || 1)}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={<HelpCircle size={15} />}
                title="Locked Crate Hack Timer"
                description="Default countdown duration for hacked Chinook crates (vanilla is 15 minutes)."
              >
                <SettingRow title="Default hack time" description="Used when a crate's timer isn't reported by the server.">
                  <div className="settings-inline">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      className="settings-input settings-input--num"
                      value={crateMinutesDisplay}
                      onChange={(e) => {
                        const mins = parseFloat(e.target.value);
                        if (!isNaN(mins)) settings.setDefaultCrateSeconds(Math.round(mins * 60));
                      }}
                    />
                    <span className="settings-hint">minutes</span>
                  </div>
                </SettingRow>
              </SettingsSection>
            </div>
          )}

          {/* ── ABOUT ───────────────────────────────────────────────── */}
          {activeTab === 'about' && (
            <div className="settings-stack">
              <SettingsSection
                icon={<Shield size={15} />}
                title="Raidar"
                description="Tactical companion overlay for Rust — live map, vending intel, raid alerts and team coordination."
              >
                <SettingRow title="Version" description="The currently running build of Raidar.">
                  <span className="settings-badge">{appVersion ? `v${appVersion}` : '—'}</span>
                </SettingRow>
                <SettingRow title="Connection" description="Current Rust+ connection state.">
                  <StatusPill
                    tone={connectionStatus === 'connected' ? 'on' : 'off'}
                    label={connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={<RefreshCw size={15} />}
                title="App Updates"
                description={<>Raidar checks for updates on launch and installs them in the background. You can also check manually.{appVersion && <> Current version: <strong>v{appVersion}</strong>.</>}</>}
              >
                <div className="settings-inline">
                  <button onClick={handleCheckUpdate} disabled={checkingUpdate} className="btn-accent">
                    <RefreshCw size={13} className={checkingUpdate ? 'spin' : ''} />
                    {checkingUpdate ? 'Checking…' : 'Check for updates'}
                  </button>
                  {updateStatus && <span className="settings-hint">{updateStatus}</span>}
                </div>
              </SettingsSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
