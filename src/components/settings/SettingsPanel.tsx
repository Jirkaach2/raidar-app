import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useConnectionStore } from '../../stores/connection-store';
import { useMapStore } from '../../stores/map-store';
import { useTeamStore } from '../../stores/team-store';
import { useDeviceStore } from '../../stores/device-store';
import { useSpyStore } from '../../stores/spy-store';
import { useSettingsStore } from '../../stores/settings-store';
import Toggle from '../ui/Toggle';
import {
  Link2, Bell, MessageSquare, Shield, HelpCircle,
  Database, RefreshCw, Check, Power, Trash2
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

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<'connection' | 'notifications' | 'discord' | 'game'>('connection');
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

  return (
    <div className="settings-panel">
      <h2 className="settings-title">SETTINGS MANAGEMENT</h2>

      {/* Tabs Row */}
      <div className="settings-tabs">
        <button
          className={`settings-tab-btn ${activeTab === 'connection' ? 'active' : ''}`}
          onClick={() => setActiveTab('connection')}
        >
          Connection
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications & Chat
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'discord' ? 'active' : ''}`}
          onClick={() => setActiveTab('discord')}
        >
          Discord Integration
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'game' ? 'active' : ''}`}
          onClick={() => setActiveTab('game')}
        >
          Game & Recycler
        </button>
      </div>

      {/* Connection Tab */}
      {activeTab === 'connection' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--success)', marginBottom: 8, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link2 size={16} />
              AUTOMATED PAIRING
            </h3>
            <p className="text-dim" style={{ marginBottom: 16, fontSize: 12, lineHeight: 1.4 }}>
              1. Open Rust in-game settings &rarr; Rust+<br/>
              2. Click <b>"Pair with Server"</b><br/>
              The overlay will automatically intercept the token and connect.
            </p>
            <div style={{ padding: 12, background: 'rgba(0,0,0,0.5)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 16 }}>
              Status: <span style={{ color: 'var(--text-bright)', fontWeight: 'bold' }}>
                {connectionStatus === 'connected' ? `Connected to ${serverInfo?.name || 'Rust+ Server'}` : autoStatus}
              </span>
            </div>
            
            {hasPendingSteam && (
              <button onClick={handleReopenSteam} className="hud-btn hud-btn--accent" style={{ width: '100%', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Link2 size={13} />
                Reopen Steam pairing window
              </button>
            )}

            {connectionStatus === 'connected' && (
              <button onClick={handleDisconnect} className="btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <Power size={13} />
                DISCONNECT FROM SERVER
              </button>
            )}
          </div>

          {/* Seamless Server Switching List */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ color: 'var(--color-accent)', margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Database size={15} />
                SEAMLESS SERVER SWITCHING
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {profiles.length > 0 && (
                  <button
                    onClick={handleClearProfiles}
                    style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: 4,
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: '#ff6b6b',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Trash2 size={10} />
                    CLEAR ALL
                  </button>
                )}
                <button
                  onClick={fetchProfiles}
                  disabled={loadingProfiles}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <RefreshCw size={12} className={loadingProfiles ? 'spin' : ''} />
                </button>
              </div>
            </div>
            <p className="text-dim" style={{ margin: '0 0 12px 0', fontSize: 11, lineHeight: 1.4 }}>
              Click any previously paired server below to switch connections instantly without needing to pair again.
            </p>

            {profiles.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 11, fontStyle: 'italic' }}>
                No saved server profiles found. Pair a server first to populate this list.
              </div>
            ) : (
              <div className="server-switch-list">
                {profiles.map((p) => {
                  const isActive = connectionStatus === 'connected' && p.ip === currentIp && p.port === currentPort;
                  const isSwitching = switchingServerId === p.id;
                  return (
                    <div key={p.id} className={`server-switch-item ${isActive ? 'active' : ''}`}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 'bold', color: isActive ? 'var(--color-success)' : '#fff' }}>
                          {p.server_name || `${p.ip}:${p.port}`}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                          {p.ip}:{p.port} • ID: {p.player_id.slice(0, 8)}...
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isActive ? (
                          <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Check size={13} />
                            CONNECTED
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSwitchServer(p)}
                            disabled={switchingServerId !== null}
                            className="btn-secondary"
                            style={{ padding: '4px 10px', fontSize: 10, borderRadius: 4, margin: 0 }}
                          >
                            {isSwitching ? 'Switching...' : 'Switch'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteProfile(p.id, p.ip, p.port)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            color: '#ff6b6b',
                            borderRadius: 4,
                            padding: '4px 6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.12s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.22)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
                          }}
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
          </div>
        </div>
      )}

      {/* Notifications & Chat Tab */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Map Notifications */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={15} />
              MAP & APP ALERTS
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ paddingRight: 12 }}>
                  <h4 style={{ color: 'var(--color-text-bright)', margin: '0 0 4px 0', fontSize: 12 }}>NEW VENDING SHOPS</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10, lineHeight: 1.3 }}>Notify when a new player vending machine is created on the map.</p>
                </div>
                <Toggle checked={notifyNewShops} onChange={setNotifyNewShops} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 14 }}>
                <div style={{ paddingRight: 12 }}>
                  <h4 style={{ color: 'var(--color-text-bright)', margin: '0 0 4px 0', fontSize: 12 }}>SHOP STOCK UPDATES</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10, lineHeight: 1.3 }}>Notify when a shop stock changes or prices update.</p>
                </div>
                <Toggle checked={notifyNewItems} onChange={setNotifyNewItems} />
              </div>
            </div>
          </div>

          {/* Team Chat Broadcasts */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={15} />
              IN-GAME TEAM CHAT BROADCASTS
            </h3>
            <p className="text-dim" style={{ margin: '0 0 16px 0', fontSize: 11, lineHeight: 1.4 }}>
              Automatically post these status alerts directly into your in-game <b>team chat</b> so your teammates stay synced.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>SERVER EVENTS → CHAT</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Cargo, Patrol Heli, Chinook & crate spawns.</p>
                </div>
                <Toggle checked={settings.broadcastEvents} onChange={settings.setBroadcastEvents} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>NEW SHOPS → CHAT</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Announce newly-opened shops and their grid coordinates.</p>
                </div>
                <Toggle checked={settings.broadcastNewShops} onChange={settings.setBroadcastNewShops} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>PRICE WATCH → CHAT</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>When a watched item drops under your target scrap price.</p>
                </div>
                <Toggle checked={settings.broadcastPriceWatch} onChange={settings.setBroadcastPriceWatch} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>BASE DECAY DONE → CHAT</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>When a tracked enemy base finishes decaying.</p>
                </div>
                <Toggle checked={settings.broadcastDecay} onChange={settings.setBroadcastDecay} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>TC DECAY ALERTS</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Alert when a paired Tool Cupboard runs out of upkeep resources.</p>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>App</span>
                    <Toggle checked={settings.tcDecayNotifyApp} onChange={settings.setTcDecayNotifyApp} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>Chat</span>
                    <Toggle checked={settings.tcDecayNotifyChat} onChange={settings.setTcDecayNotifyChat} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>SMART ALARMS</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Alert when smart alarms are triggered (raid notifications).</p>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>App</span>
                    <Toggle checked={settings.notifyAlarms} onChange={settings.setNotifyAlarms} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>Chat</span>
                    <Toggle checked={settings.broadcastAlarms} onChange={settings.setBroadcastAlarms} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: settings.notifyAlarms || settings.broadcastAlarms || settings.discordAlarms ? 1 : 0.4, paddingTop: 8, paddingLeft: 16 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 11 }}>CROSS-SERVER ALARMS</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Show smart alarms from other paired Rust servers (e.g. when on a different server).</p>
                </div>
                <Toggle checked={settings.crossServerAlarms} onChange={settings.setCrossServerAlarms} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>TEAMMATE DEATHS</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>When teammates die, show indicators on the map and/or broadcast to chat.</p>
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>Map</span>
                    <Toggle checked={settings.markTeammateDeaths} onChange={settings.setMarkTeammateDeaths} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>App</span>
                    <Toggle checked={settings.notifyDeaths} onChange={settings.setNotifyDeaths} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>Chat</span>
                    <Toggle checked={settings.broadcastDeaths} onChange={settings.setBroadcastDeaths} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>SHOW TEAMMATE DEATHS ON MAP</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>If disabled, only YOUR own deaths appear on the live map.</p>
                </div>
                <Toggle checked={settings.showTeammateDeathsOnMap} onChange={settings.setShowTeammateDeathsOnMap} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discord Webhooks Tab */}
      {activeTab === 'discord' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {botAvailable === false && (
            <div style={{
              background: 'rgba(232, 69, 69, 0.1)',
              border: '1px solid rgba(232, 69, 69, 0.35)',
              padding: '12px 16px',
              borderRadius: 8,
              color: '#f87171',
              fontSize: '11.5px',
              lineHeight: '1.5'
            }}>
              <strong style={{ display: 'block', marginBottom: 4, color: '#ef4444', fontSize: '12px' }}>
                ⚠️ DISCORD BOT OFFLINE
              </strong>
              The Raidar companion bot is currently offline or unreachable. Discord integration features (linking new servers, configuring whitelist permissions, and pushing notifications) are temporarily unavailable.
            </div>
          )}

          {/* ── Raidar Bot link ── */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ color: 'var(--color-accent)', margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={15} />
                RAIDAR BOT
              </h3>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
                padding: '3px 9px', borderRadius: 20,
                background: botLinks.length ? 'rgba(111,207,115,0.14)' : 'rgba(255,255,255,0.06)',
                color: botLinks.length ? 'var(--color-success)' : 'var(--color-text-dim)',
                border: `1px solid ${botLinks.length ? 'rgba(111,207,115,0.4)' : 'var(--color-border)'}`,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: botLinks.length ? 'var(--color-success)' : 'var(--color-text-muted)' }} />
                {loadingLinks ? 'CHECKING…' : botLinks.length ? `LINKED · ${botLinks.length}` : 'NOT LINKED'}
              </span>
            </div>
            <p className="text-dim" style={{ margin: '0 0 14px 0', fontSize: 11, lineHeight: 1.45 }}>
              Connect this app to the Raidar Discord bot so your team can check status, control devices and get alarm notifications from Discord — even when this app is closed. Your current server and devices transfer automatically.
            </p>

            {botLinks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {botLinks.map((l) => (
                  <div key={l.guildId} style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 7, background: 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MessageSquare size={15} color="#5865F2" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.guildName}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.serverName || 'Rust server'}</div>
                      </div>
                      <button
                        onClick={() => handleUnlink(l.guildId)}
                        title="Unlink this server"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: 'transparent', border: '1px solid var(--color-danger)', borderRadius: 6, color: 'var(--color-danger)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        <Trash2 size={12} /> Unlink
                      </button>
                    </div>

                    {/* Device-control whitelist */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: '#8b857c', marginBottom: 6 }}>WHO CAN CONTROL DEVICES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {(l.allowedUserIds.length ? l.allowedUserIds : []).map((id) => (
                          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 6px 3px 9px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', borderRadius: 14, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                            {id}
                            <button onClick={() => handleRemoveAllowed(l.guildId, id)} disabled={botAvailable === false} title="Remove" style={{ display: 'flex', background: 'transparent', border: 'none', color: 'var(--color-text-dim)', cursor: botAvailable === false ? 'default' : 'pointer', padding: 0, opacity: botAvailable === false ? 0.3 : 1 }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 11, height: 11 }}><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
                            </button>
                          </span>
                        ))}
                        {l.allowedUserIds.length === 0 && (
                          <span style={{ fontSize: 10.5, color: 'var(--color-text-dim)', fontStyle: 'italic' }}>Server admins only (no one whitelisted yet)</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          placeholder="Discord user ID"
                          value={allowDraft[l.guildId] || ''}
                          onChange={(e) => setAllowDraft((d) => ({ ...d, [l.guildId]: e.target.value.replace(/\D/g, '') }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddAllowed(l.guildId); }}
                          disabled={botAvailable === false}
                          style={{ flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)', borderRadius: 5, color: 'var(--color-text)', fontSize: 11.5, fontFamily: 'var(--font-mono)', outline: 'none', opacity: botAvailable === false ? 0.5 : 1 }}
                        />
                        <button
                          onClick={() => handleAddAllowed(l.guildId)}
                          disabled={botAvailable === false || !(allowDraft[l.guildId] || '').trim()}
                          style={{ padding: '6px 14px', background: 'var(--color-accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, fontWeight: 700, cursor: (botAvailable === false || !(allowDraft[l.guildId] || '').trim()) ? 'default' : 'pointer', opacity: (botAvailable === false || !(allowDraft[l.guildId] || '').trim()) ? 0.5 : 1 }}
                        >
                          Add
                        </button>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 9.5, color: 'var(--color-text-dim)', lineHeight: 1.4 }}>
                        -# Enable Developer Mode in Discord, right-click a user → Copy User ID. Listed users (and server admins) can use <strong>/control</strong>, <strong>/toggle</strong> and <strong>/say</strong>.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--color-border)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
                {botLinks.length ? 'Link another server' : 'Link a Discord server'}
              </div>
              <p className="text-dim" style={{ margin: '0 0 10px 0', fontSize: 10.5, lineHeight: 1.4 }}>
                In your Discord server, run <strong style={{ color: 'var(--color-accent)' }}>/link</strong> and paste the 6-character code below.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="ABC123"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  disabled={botAvailable === false}
                  style={{ flex: 1, padding: '9px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', fontSize: 15, letterSpacing: '4px', textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', outline: 'none', opacity: botAvailable === false ? 0.5 : 1 }}
                />
                <button
                  onClick={handleLinkBot}
                  disabled={linking || linkCode.trim().length < 6 || botAvailable === false}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: 'var(--color-accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: (linking || linkCode.trim().length < 6 || botAvailable === false) ? 'default' : 'pointer', opacity: (linking || linkCode.trim().length < 6 || botAvailable === false) ? 0.5 : 1 }}
                >
                  <Link2 size={13} /> {linking ? 'Linking…' : 'Link'}
                </button>
              </div>
            </div>

            {botLinks.length > 0 && (
              <button
                onClick={handleTestNotify}
                disabled={botAvailable === false}
                style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', fontSize: 11.5, fontWeight: 600, cursor: botAvailable === false ? 'default' : 'pointer', opacity: botAvailable === false ? 0.4 : 1 }}
              >
                🔔 Send test notification
              </button>
            )}
          </div>

          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={15} />
              DISCORD WEBHOOK INTEGRATION
            </h3>
            <p className="text-dim" style={{ margin: '0 0 16px 0', fontSize: 11, lineHeight: 1.4 }}>
              Redirect notifications to specific Discord channels. Create a webhook URL in your Discord server's channel settings and paste them below. Feature-specific URLs override the default fallback.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Default Webhook URL */}
              <div className="webhook-row">
                <label className="webhook-label">DEFAULT FALLBACK WEBHOOK URL</label>
                <input
                  type="password"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={settings.discordWebhookUrl}
                  onChange={(e) => settings.setDiscordWebhookUrl(e.target.value)}
                  className="webhook-input"
                />
              </div>

              {/* Ping Role */}
              <div className="webhook-row">
                <label className="webhook-label">PING ROLE ON ALERT</label>
                <input
                  type="text"
                  placeholder="everyone, a role ID, or blank"
                  value={settings.discordPingRole}
                  onChange={(e) => settings.setDiscordPingRole(e.target.value)}
                  className="webhook-input"
                />
                <span className="text-dim" style={{ fontSize: 9 }}>Type "everyone" to tag @everyone, or paste a numerical role ID.</span>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, margin: '6px 0' }}>
                <h4 style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>FEATURE-SPECIFIC WEBHOOK CHANNELS</h4>
              </div>

              {/* Smart Alarms Webhook */}
              <div className="webhook-row">
                <div className="webhook-label-wrapper">
                  <span className="webhook-label">Smart Alarms (`alarms`)</span>
                  <Toggle checked={settings.discordAlarms} onChange={settings.setDiscordAlarms} />
                </div>
                <input
                  type="password"
                  placeholder="Feature-specific Webhook URL (Overrides Default)"
                  value={settings.discordWebhooks.alarms || ''}
                  onChange={(e) => settings.setDiscordWebhookFor('alarms', e.target.value)}
                  className="webhook-input"
                />
              </div>

              {/* Price Watch Webhook */}
              <div className="webhook-row">
                <div className="webhook-label-wrapper">
                  <span className="webhook-label">Price Watch (`price_watch`)</span>
                  <Toggle checked={settings.discordPriceWatch} onChange={settings.setDiscordPriceWatch} />
                </div>
                <input
                  type="password"
                  placeholder="Feature-specific Webhook URL (Overrides Default)"
                  value={settings.discordWebhooks.price_watch || ''}
                  onChange={(e) => settings.setDiscordWebhookFor('price_watch', e.target.value)}
                  className="webhook-input"
                />
              </div>

              {/* Base Decay Webhook */}
              <div className="webhook-row">
                <div className="webhook-label-wrapper">
                  <span className="webhook-label">Base Decay & TC Upkeep (`decay`)</span>
                  <Toggle checked={settings.tcDecayNotifyDiscord || settings.discordDecay} onChange={(v) => { settings.setTcDecayNotifyDiscord(v); settings.setDiscordDecay(v); }} />
                </div>
                <input
                  type="password"
                  placeholder="Feature-specific Webhook URL (Overrides Default)"
                  value={settings.discordWebhooks.decay || ''}
                  onChange={(e) => settings.setDiscordWebhookFor('decay', e.target.value)}
                  className="webhook-input"
                />
              </div>

              {/* Crate Unlocks Webhook */}
              <div className="webhook-row">
                <div className="webhook-label-wrapper">
                  <span className="webhook-label">Locked Crate Unlocks (`crates`)</span>
                  <Toggle checked={settings.crateNotifyDiscord} onChange={settings.setCrateNotifyDiscord} />
                </div>
                <input
                  type="password"
                  placeholder="Feature-specific Webhook URL (Overrides Default)"
                  value={settings.discordWebhooks.crates || ''}
                  onChange={(e) => settings.setDiscordWebhookFor('crates', e.target.value)}
                  className="webhook-input"
                />
              </div>

              {/* Cargo Ship Webhook */}
              <div className="webhook-row">
                <div className="webhook-label-wrapper">
                  <span className="webhook-label">Cargo Ship Events (`cargo`)</span>
                  <Toggle checked={settings.discordCargo} onChange={settings.setDiscordCargo} />
                </div>
                <input
                  type="password"
                  placeholder="Feature-specific Webhook URL (Overrides Default)"
                  value={settings.discordWebhooks.cargo || ''}
                  onChange={(e) => settings.setDiscordWebhookFor('cargo', e.target.value)}
                  className="webhook-input"
                />
              </div>

              {/* Heli / Chinook Webhook */}
              <div className="webhook-row">
                <div className="webhook-label-wrapper">
                  <span className="webhook-label">Patrol Heli & Chinook Events (`heli_chinook`)</span>
                  <Toggle checked={settings.discordHeli} onChange={settings.setDiscordHeli} />
                </div>
                <input
                  type="password"
                  placeholder="Feature-specific Webhook URL (Overrides Default)"
                  value={settings.discordWebhooks.heli_chinook || ''}
                  onChange={(e) => settings.setDiscordWebhookFor('heli_chinook', e.target.value)}
                  className="webhook-input"
                />
              </div>

              {/* Watchlist Spy Webhook */}
              <div className="webhook-row">
                <div className="webhook-label-wrapper">
                  <span className="webhook-label">Rust Spy Offline/Online (`spy`)</span>
                  <Toggle checked={settings.enemyNotifyDiscord || settings.enemyOnlineNotifyDiscord} onChange={(v) => { settings.setEnemyNotifyDiscord(v); settings.setEnemyOnlineNotifyDiscord(v); }} />
                </div>
                <input
                  type="password"
                  placeholder="Feature-specific Webhook URL (Overrides Default)"
                  value={settings.discordWebhooks.spy || ''}
                  onChange={(e) => settings.setDiscordWebhookFor('spy', e.target.value)}
                  className="webhook-input"
                />
              </div>

              {/* Watchlist Bans Webhook */}
              <div className="webhook-row">
                <div className="webhook-label-wrapper">
                  <span className="webhook-label">Watchlist Game/VAC Bans (`bans`)</span>
                  <Toggle checked={settings.discordBans} onChange={settings.setDiscordBans} />
                </div>
                <input
                  type="password"
                  placeholder="Feature-specific Webhook URL (Overrides Default)"
                  value={settings.discordWebhooks.bans || ''}
                  onChange={(e) => settings.setDiscordWebhookFor('bans', e.target.value)}
                  className="webhook-input"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game & Recycler Tab */}
      {activeTab === 'game' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Overlay card */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={15} />
              GAME OVERLAY MODE
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>OVERLAY INTERACTION</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Keeps the window on top of Rust. Run Rust in Borderless window mode.</p>
                </div>
                <Toggle checked={settings.overlayMode} onChange={settings.setOverlayMode} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>SHOW / HIDE HOTKEY</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Global overlay toggling shortcut (e.g. F8).</p>
                </div>
                <input
                  type="text"
                  value={settings.overlayHotkey}
                  onChange={(e) => settings.setOverlayHotkey(e.target.value.trim())}
                  placeholder="F8"
                  style={{ width: 120, padding: '6px 8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none' }}
                />
              </div>

            </div>
          </div>

          {/* Recycler card */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={15} />
              RECYCLER MULTIPLIER
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>AUTO-DETECT MULTIPLIER</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Try to read the gather multiplier from the server name.</p>
                </div>
                <Toggle checked={settings.recyclerAutoDetect} onChange={settings.setRecyclerAutoDetect} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
                <div>
                  <h4 style={{ color: '#fff', margin: '0 0 2px 0', fontSize: 12 }}>MANUAL MULTIPLIER</h4>
                  <p className="text-dim" style={{ margin: 0, fontSize: 10 }}>Recycler resource scale override for modded servers.</p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={settings.recyclerMultiplier}
                  onChange={(e) => { settings.setRecyclerAutoDetect(false); settings.setRecyclerMultiplier(parseInt(e.target.value) || 1); }}
                  style={{ width: 60, padding: '6px 8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', fontSize: 12, outline: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* BattleMetrics & Token */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={15} />
              BATTLEMETRICS INTEGRATION
            </h3>
            <p className="text-dim" style={{ margin: '0 0 14px 0', fontSize: 11, lineHeight: 1.4 }}>
              Enables offline/online enemy tracking in Rust Spy. Obtain your token from your BattleMetrics account settings page.
            </p>
            <input
              type="password"
              placeholder="Paste BattleMetrics token..."
              value={settings.battlemetricsToken}
              onChange={(e) => settings.setBattlemetricsToken(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', fontSize: 12, outline: 'none' }}
            />
          </div>

          {/* RustMaps API key — caves + water well shopkeeper */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={15} />
              RUSTMAPS INTEGRATION
            </h3>
            <p className="text-dim" style={{ margin: '0 0 14px 0', fontSize: 11, lineHeight: 1.4 }}>
              Shows caves and the jungle Water Well Shopkeeper on the map — these aren't sent over Rust+, so they're pulled from the generated map by seed + size. Get a free API key at rustmaps.com → account → API. Cached per wipe, so it only calls once.
            </p>
            <input
              type="password"
              placeholder="Paste RustMaps API key..."
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', fontSize: 12, outline: 'none' }}
            />
          </div>

          {/* App updates */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={15} />
              APP UPDATES
            </h3>
            <p className="text-dim" style={{ margin: '0 0 14px 0', fontSize: 11, lineHeight: 1.4 }}>
              Raidar checks for updates automatically on launch and installs them in the background. You can also check manually.
              {appVersion && <> Current version: <strong style={{ color: 'var(--color-text)' }}>v{appVersion}</strong>.</>}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--color-accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700, cursor: checkingUpdate ? 'default' : 'pointer', opacity: checkingUpdate ? 0.6 : 1 }}
              >
                <RefreshCw size={13} />
                {checkingUpdate ? 'Checking…' : 'Check for Updates'}
              </button>
              {updateStatus && <span style={{ fontSize: 10.5, color: 'var(--color-text-dim)', lineHeight: 1.4 }}>{updateStatus}</span>}
            </div>
          </div>

          {/* Locked Crate Default Seconds */}
          <div className="settings-card glass-panel" style={{ margin: 0, maxWidth: '100%' }}>
            <h3 style={{ color: 'var(--color-accent)', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <HelpCircle size={15} />
              LOCKED CRATE HACK TIMER
            </h3>
            <p className="text-dim" style={{ margin: '0 0 14px 0', fontSize: 11, lineHeight: 1.4 }}>
              Configure the default countdown duration for hacked chinook crates (vanilla is 15 minutes).
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={1}
                max={60}
                value={Math.round(settings.defaultCrateSeconds / 60 * 100) / 100 % 1 === 0 ? settings.defaultCrateSeconds / 60 : (settings.defaultCrateSeconds / 60).toFixed(1)}
                onChange={(e) => {
                  const mins = parseFloat(e.target.value);
                  if (!isNaN(mins)) settings.setDefaultCrateSeconds(Math.round(mins * 60));
                }}
                style={{ width: 70, padding: '6px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.35)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: 12, outline: 'none' }}
              />
              <span className="text-dim" style={{ fontSize: 12 }}>minutes</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
