import { useState, useEffect, useRef } from 'react';
import { useSpyStore, analyzeSchedule, PlayerActivity, EnemyGroup } from '../../stores/spy-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';
import { searchPlayersOnServer, getPlayerSessions, sessionsToBuckets, findServerIdByName, playerHasServerHistory, BmPlayer, findPlayerBySteamId, enrichServerPresence } from '../../utils/battlemetrics';
import './SpyPanel.css';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function fmtHour(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}${ampm}`;
}

function heat(v: number): string {
  if (v <= 0.001) return 'rgba(255,255,255,0.04)';
  const g = Math.round(60 + v * 180);
  return `rgba(40, ${g}, 60, ${0.35 + v * 0.65})`;
}

function ago(ts: number): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Tab = 'team' | 'tracked' | 'profile';

export function SpyPanel() {
  const players = useSpyStore((s) => s.players);
  const tracked = useSpyStore((s) => s.tracked);
  const groups = useSpyStore((s) => s.groups);
  const groupOf = useSpyStore((s) => s.groupOf);
  const addGroup = useSpyStore((s) => s.addGroup);
  const removeGroup = useSpyStore((s) => s.removeGroup);
  const renameGroup = useSpyStore((s) => s.renameGroup);
  const clear = useSpyStore((s) => s.clear);
  const [tab, setTab] = useState<Tab>('team');
  const [selected, setSelected] = useState<string | null>(null);
  // Active group filter in the enemies tab. null = all, or a groupId.
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  // Group create/rename modal state.
  const [groupModal, setGroupModal] = useState<{ mode: 'create' | 'rename'; id?: string; value: string } | null>(null);

  const teamList = Object.values(players).sort((a, b) => b.totalSeenMs - a.totalSeenMs);
  const trackedListAll = Object.values(tracked).sort((a, b) => b.totalSeenMs - a.totalSeenMs);
  const trackedList = activeGroup
    ? trackedListAll.filter((p) => groupOf[p.steamId] === activeGroup)
    : trackedListAll;
  const list: PlayerActivity[] = tab === 'team' ? teamList : trackedList;

  const sel = (selected && list.find((p) => p.steamId === selected)) || list[0] || null;
  const groupList = Object.values(groups).sort((a, b) => a.createdAt - b.createdAt);
  const activeGroupObj = activeGroup ? groups[activeGroup] : null;

  const newGroup = () => setGroupModal({ mode: 'create', value: '' });

  const submitGroupModal = () => {
    if (!groupModal) return;
    const name = groupModal.value.trim();
    if (!name) return;
    if (groupModal.mode === 'create') {
      const id = addGroup(name);
      setActiveGroup(id);
    } else if (groupModal.id) {
      renameGroup(groupModal.id, name);
    }
    setGroupModal(null);
  };

  return (
    <div className="spy-panel">
      <div className="spy-head">
        <div>
          <h1 className="spy-title">RUST SPY</h1>
          <p className="spy-sub">Read their schedule · Predict · Plan · Raid</p>
        </div>
        <div className="spy-head-stats">
          <div><span className="spy-stat-num">{list.length}</span><span className="spy-stat-lbl">TRACKED</span></div>
          <div><span className="spy-stat-num">{list.filter((p) => p.online).length}</span><span className="spy-stat-lbl">ONLINE</span></div>
          {tab === 'team' && teamList.length > 0 && <button className="spy-clear" onClick={clear}>Reset</button>}
        </div>
      </div>

      <div className="settings-tabs" style={{ padding: '0 22px 12px' }}>
        <button className={`settings-tab-btn ${tab === 'team' ? 'active' : ''}`} onClick={() => { setTab('team'); setSelected(null); }}>Team (Live)</button>
        <button className={`settings-tab-btn ${tab === 'tracked' ? 'active' : ''}`} onClick={() => { setTab('tracked'); setSelected(null); }}>Enemies (BattleMetrics)</button>
        <button className={`settings-tab-btn ${tab === 'profile' ? 'active' : ''}`} onClick={() => { setTab('profile'); setSelected(null); }}>Player Server History</button>
      </div>

      {tab === 'profile' && <PlayerServerHistory />}

      {tab === 'tracked' && (
        <>
          <BmSearch onPicked={(id) => setSelected(`bm-${id}`)} />

          {/* Group filter chips */}
          <div className="spy-groups">
            <button className={`spy-group-chip ${!activeGroup ? 'active' : ''}`} onClick={() => setActiveGroup(null)}>
              All ({trackedListAll.length})
            </button>
            {groupList.map((g) => {
              const count = trackedListAll.filter((p) => groupOf[p.steamId] === g.id).length;
              const online = trackedListAll.filter((p) => groupOf[p.steamId] === g.id && p.online).length;
              return (
                <button
                  key={g.id}
                  className={`spy-group-chip ${activeGroup === g.id ? 'active' : ''}`}
                  onClick={() => setActiveGroup(g.id)}
                  style={{ borderColor: `${g.color}99` }}
                >
                  <span className="spy-group-dot" style={{ background: g.color }} />
                  {g.name} ({count})
                  {online > 0 && <span className="spy-group-online">{online}●</span>}
                </button>
              );
            })}
            <button className="spy-group-chip spy-group-new" onClick={newGroup}>+ Group</button>
          </div>
        </>
      )}

      {/* Group overview when a group is selected */}
      {tab === 'tracked' && activeGroupObj && (
        <GroupOverview
          group={activeGroupObj}
          members={trackedListAll.filter((p) => groupOf[p.steamId] === activeGroupObj.id)}
          onRename={() => setGroupModal({ mode: 'rename', id: activeGroupObj.id, value: activeGroupObj.name })}
          onDelete={() => { removeGroup(activeGroupObj.id); setActiveGroup(null); }}
        />
      )}

      {tab !== 'profile' && (list.length === 0 ? (
        <div className="spy-empty">
          {tab === 'team' ? (
            <>
              <p>No team activity tracked yet.</p>
              <p className="spy-empty-sub">
                Connect & join a team — the Spy passively records each teammate's online/offline
                windows over time to reveal their sleep & play schedule.
              </p>
            </>
          ) : (
            <>
              <p>{activeGroup ? 'No enemies in this group yet.' : 'No enemies tracked yet.'}</p>
              <p className="spy-empty-sub">
                {activeGroup
                  ? 'Open an enemy below and assign them to this group.'
                  : 'Add a BattleMetrics API token in Settings, then search a player above to pull their real cross-server session history and build their raid-window schedule.'}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="spy-body">
          <div className="spy-players scrollable">
            {list.map((p) => {
              const { raidStart, raidEnd } = analyzeSchedule(p.buckets);
              const g = groupOf[p.steamId] ? groups[groupOf[p.steamId]] : null;
              return (
                <button
                  key={p.steamId}
                  className={`spy-player ${sel?.steamId === p.steamId ? 'active' : ''}`}
                  onClick={() => setSelected(p.steamId)}
                >
                  <span className={`spy-dot ${p.online ? 'on' : 'off'}`} />
                  <span className="spy-player-name">{p.name}</span>
                  {g && <span className="spy-player-group" style={{ background: `${g.color}22`, color: g.color, borderColor: `${g.color}66` }}>{g.name}</span>}
                  <span className="spy-player-raid">{fmtHour(raidStart)}–{fmtHour(raidEnd)}</span>
                </button>
              );
            })}
          </div>

          {sel && <SpyDetail key={sel.steamId} player={sel} />}
        </div>
      ))}

      {/* Group create / rename modal */}
      {groupModal && (
        <div className="spy-modal-backdrop" onClick={() => setGroupModal(null)}>
          <div className="spy-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="spy-modal-title">{groupModal.mode === 'create' ? 'NEW ENEMY GROUP' : 'RENAME GROUP'}</h3>
            <p className="spy-modal-sub">
              {groupModal.mode === 'create'
                ? 'Group enemies by clan or location (e.g. "Bridge Clan", "Zerg at D7").'
                : 'Give this group a new name.'}
            </p>
            <input
              autoFocus
              className="spy-modal-input"
              placeholder="Group name…"
              value={groupModal.value}
              onChange={(e) => setGroupModal({ ...groupModal, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') submitGroupModal(); if (e.key === 'Escape') setGroupModal(null); }}
            />
            <div className="spy-modal-actions">
              <button className="spy-modal-btn spy-modal-cancel" onClick={() => setGroupModal(null)}>Cancel</button>
              <button className="spy-modal-btn spy-modal-confirm" onClick={submitGroupModal} disabled={!groupModal.value.trim()}>
                {groupModal.mode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact overview for the currently-selected enemy group. */
function GroupOverview({ group, members, onRename, onDelete }: {
  group: import('../../stores/spy-store').EnemyGroup;
  members: PlayerActivity[];
  onRename: () => void;
  onDelete: () => void;
}) {
  const onlineCount = members.filter((m) => m.online).length;
  // Aggregate the group's weekly buckets to find a shared raid window.
  const agg = members.length
    ? members.reduce((acc, m) => {
        for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) acc[d][h] += m.buckets[d][h];
        return acc;
      }, Array.from({ length: 7 }, () => Array(24).fill(0)))
    : Array.from({ length: 7 }, () => Array(24).fill(0));
  // Average across members so analyzeSchedule sees per-player intensity.
  const avg = agg.map((row) => row.map((v) => (members.length ? v / members.length : 0)));
  const { raidStart, raidEnd } = analyzeSchedule(avg);

  return (
    <div className="spy-group-overview" style={{ borderColor: `${group.color}55` }}>
      <div className="spy-go-head">
        <span className="spy-go-title">
          <span className="spy-group-dot" style={{ background: group.color }} />
          {group.name}
        </span>
        <div className="spy-go-actions">
          <button className="spy-go-btn" onClick={onRename} title="Rename group">✎</button>
          <button className="spy-go-btn spy-go-del" onClick={onDelete} title="Delete group">🗑</button>
        </div>
      </div>
      <div className="spy-go-stats">
        <div className="spy-go-stat">
          <span className="spy-go-num">{members.length}</span>
          <span className="spy-go-lbl">MEMBERS</span>
        </div>
        <div className="spy-go-stat">
          <span className="spy-go-num" style={{ color: onlineCount ? '#6fcf73' : undefined }}>{onlineCount}</span>
          <span className="spy-go-lbl">ONLINE NOW</span>
        </div>
        <div className="spy-go-stat">
          <span className="spy-go-num" style={{ color: group.color }}>{fmtHour(raidStart)}–{fmtHour(raidEnd)}</span>
          <span className="spy-go-lbl">GROUP RAID WINDOW</span>
        </div>
      </div>
      {members.length > 0 && (
        <div className="spy-go-members">
          {members.map((m) => (
            <span key={m.steamId} className="spy-go-member">
              <span className={`spy-dot ${m.online ? 'on' : 'off'}`} />{m.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BmSearch({ onPicked }: { onPicked: (bmId: string) => void }) {
  const token = useSettingsStore((s) => s.battlemetricsToken);
  const setTracked = useSpyStore((s) => s.setTracked);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<BmPlayer[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onlyServer, setOnlyServer] = useState(true);
  const [serverResolved, setServerResolved] = useState(true);

  const doSearch = async () => {
    if (!token) { setErr('Add a BattleMetrics token in Settings first.'); return; }
    if (!q.trim()) return;
    setBusy(true); setErr(null);
    try {
      const srvName = useConnectionStore.getState().serverInfo?.name || '';
      const serverId = srvName ? await findServerIdByName(token, srvName) : null;
      setServerResolved(!!serverId);

      const targetQuery = q.trim();
      const match = targetQuery.match(/(?:profiles|profile)\/(\d{17})/);
      const isDigits17 = /^\d{17}$/.test(targetQuery);
      const steamId = isDigits17 ? targetQuery : (match ? match[1] : null);

      if (steamId) {
        const player = await findPlayerBySteamId(token, steamId);
        if (player) {
          setResults([player]);
        } else {
          setErr('No BattleMetrics profile found for this SteamID.');
          setResults([]);
        }
      } else {
        const results = await searchPlayersOnServer(token, targetQuery, serverId);
        // Fill accurate online + last-seen-on-server from session history.
        const enriched = await enrichServerPresence(token, results, serverId);
        setResults(enriched);
        if (enriched.length === 0) {
          setErr(serverId
            ? 'No players with that name have played this server in the last month.'
            : 'No results (could not match the current server).');
        }
      }
    } catch (e) {
      setErr(`Search failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const track = async (p: BmPlayer) => {
    setBusy(true); setErr(null);
    try {
      // The search already filtered by server (p.onServer), which is the
      // authoritative history check. Only fall back to the session re-check for
      // results that AREN'T already confirmed on-server (e.g. global matches).
      if (!p.onServer) {
        const srvName = useConnectionStore.getState().serverInfo?.name || '';
        if (srvName) {
          const serverId = await findServerIdByName(token, srvName);
          if (serverId) {
            const onServer = await playerHasServerHistory(token, p.id, serverId);
            if (!onServer) {
              setErr(`${p.name} has no session history on this server — not tracking.`);
              setBusy(false);
              return;
            }
          }
        }
      }
      const sessions = await getPlayerSessions(token, p.id);
      const { buckets, online, lastSeen } = sessionsToBuckets(sessions);
      setTracked(p.id, p.name, buckets, online, lastSeen);
      setResults([]);
      setQ('');
      onPicked(p.id);
    } catch (e) {
      setErr(`Failed to load sessions: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // When "only this server" is on and the server resolved, hide global matches.
  const shown = (onlyServer && serverResolved)
    ? results.filter((p) => p.onServer)
    : results;
  const hiddenCount = results.length - shown.length;

  return (
    <div className="spy-bm">
      <div className="spy-bm-search">
        <input
          className="spy-bm-input"
          placeholder="Search a player name on BattleMetrics…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <button className="spy-bm-btn" onClick={doSearch} disabled={busy}>{busy ? '…' : 'Search'}</button>
      </div>
      {results.length > 0 && (
        <label className="spy-bm-filter">
          <input type="checkbox" checked={onlyServer} onChange={(e) => setOnlyServer(e.target.checked)} />
          <span>Only players with history on this server{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}</span>
        </label>
      )}
      {err && <div className="spy-bm-err">{err}</div>}
      {shown.length > 0 && (
        <div className="spy-bm-results">
          {shown.map((p) => (
            <button key={p.id} className="spy-bm-result" onClick={() => track(p)}>
              <span className={`spy-dot ${p.online ? 'on' : 'off'}`} />
              <span className="spy-bm-result-name">{p.name}</span>
              {p.online
                ? <span className="spy-bm-badge spy-bm-online">ONLINE NOW</span>
                : p.onServer
                  ? <span className="spy-bm-badge spy-bm-played" title="Has played on this server before">PLAYED HERE</span>
                  : <span className="spy-bm-badge spy-bm-other" title="No record on this server">OTHER SERVER</span>}
              {!p.online && p.lastSeenOnServer ? (
                <span className="spy-bm-lastseen" title="Last seen on this server">last: {ago(p.lastSeenOnServer)}</span>
              ) : (!p.online && p.lastSeen ? (
                <span className="spy-bm-lastseen" title="Last seen anywhere">last: {ago(new Date(p.lastSeen).getTime())}</span>
              ) : null)}
              <span className="spy-bm-add">+ track</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Themed custom dropdown for assigning an enemy to a group. */
function GroupSelect({ value, groups, onChange }: {
  value: string;
  groups: EnemyGroup[];
  onChange: (groupId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = groups.find((g) => g.id === value);

  return (
    <div className="grp-select" ref={ref}>
      <button className="grp-select-trigger" onClick={() => setOpen((o) => !o)}>
        {current
          ? <span className="grp-select-cur"><span className="spy-group-dot" style={{ background: current.color }} />{current.name}</span>
          : <span className="grp-select-cur grp-select-none">Unassigned</span>}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="grp-select-menu">
          <button className={`grp-select-opt ${!value ? 'active' : ''}`} onClick={() => { onChange(null); setOpen(false); }}>
            Unassigned
          </button>
          {groups.map((g) => (
            <button key={g.id} className={`grp-select-opt ${value === g.id ? 'active' : ''}`} onClick={() => { onChange(g.id); setOpen(false); }}>
              <span className="spy-group-dot" style={{ background: g.color }} />{g.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SpyDetail({ player }: { player: PlayerActivity }) {
  const removeTracked = useSpyStore((s) => s.removeTracked);
  const groups = useSpyStore((s) => s.groups);
  const groupOf = useSpyStore((s) => s.groupOf);
  const assignToGroup = useSpyStore((s) => s.assignToGroup);
  const isBm = player.steamId.startsWith('bm-');
  const { hourly, raidStart, raidEnd } = analyzeSchedule(player.buckets);
  const trackedHours = Math.max(1, Math.round((Date.now() - player.firstTrackedAt) / 3_600_000));
  const groupList = Object.values(groups).sort((a, b) => a.createdAt - b.createdAt);
  const currentGroup = groupOf[player.steamId] || '';

  return (
    <div className="spy-detail scrollable">
      <div className="spy-detail-head">
        <div>
          <h2 className="spy-detail-name">{player.name}</h2>
          <span className="spy-detail-meta">
            <span className={`spy-dot ${player.online ? 'on' : 'off'}`} />
            {player.online ? 'Online now' : `Last seen ${ago(player.lastOfflineAt)}`}
            {!isBm && ` · tracked ${trackedHours}h`}
          </span>
        </div>
        <div className="spy-raid-badge">
          <span className="spy-raid-lbl">LIKELY RAID WINDOW</span>
          <span className="spy-raid-time">{fmtHour(raidStart)} — {fmtHour(raidEnd)}</span>
        </div>
      </div>

      {isBm && (
        <div className="spy-detail-controls">
          <div className="spy-group-select-wrap">
            <span className="spy-group-select-lbl">GROUP</span>
            <GroupSelect
              value={currentGroup}
              groups={groupList}
              onChange={(gid) => assignToGroup(player.steamId, gid)}
            />
          </div>
          <button className="spy-untrack" onClick={() => removeTracked(player.steamId.replace('bm-', ''))}>Stop tracking</button>
        </div>
      )}

      <div className="spy-section-lbl">DAILY ACTIVITY (avg)</div>
      <div className="spy-hourly">
        {hourly.map((v, h) => (
          <div key={h} className="spy-hour-col" title={`${fmtHour(h)} · ${Math.round(v * 100)}% active`}>
            <div className="spy-hour-bar" style={{ height: `${6 + v * 54}px`, background: heat(v) }} />
            {h % 6 === 0 && <span className="spy-hour-lbl">{fmtHour(h)}</span>}
          </div>
        ))}
      </div>

      <div className="spy-section-lbl" style={{ marginTop: 18 }}>WEEKLY PATTERN</div>
      <div className="spy-heatmap">
        <div className="spy-heat-hours">
          <span /> {[0, 4, 8, 12, 16, 20].map((h) => <span key={h}>{fmtHour(h)}</span>)}
        </div>
        {player.buckets.map((row, d) => (
          <div key={d} className="spy-heat-row">
            <span className="spy-heat-day">{DAYS[d]}</span>
            <div className="spy-heat-cells">
              {row.map((v, h) => (
                <div key={h} className="spy-heat-cell" title={`${DAYS[d]} ${fmtHour(h)} · ${Math.round((v / 60) * 100)}%`}
                  style={{ background: heat(v / 60) }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="spy-note">
        {isBm
          ? 'Built from BattleMetrics session history across servers.'
          : 'Built passively from Rust+ team data over time — runs longer = sharper pattern.'}
      </div>
    </div>
  );
}


function fmtPlaytime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `${h.toLocaleString('en-US')}h`;
  return `${Math.floor(seconds / 60)}m`;
}

/**
 * BattleMetrics player server history — search a player and see every server they
 * play, ranked by time spent, plus recent sessions. Pure intel, no tracking.
 */
function PlayerServerHistory() {
  const token = useSettingsStore((s) => s.battlemetricsToken);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<BmPlayer[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ name: string; servers: any[]; sessions: any[] } | null>(null);

  const doSearch = async () => {
    if (!token) { setErr('Add a BattleMetrics token in Settings first.'); return; }
    if (!q.trim()) return;
    setBusy(true); setErr(null); setProfile(null);
    try {
      const mod = await import('../../utils/battlemetrics');
      
      const targetQuery = q.trim();
      const match = targetQuery.match(/(?:profiles|profile)\/(\d{17})/);
      const isDigits17 = /^\d{17}$/.test(targetQuery);
      const steamId = isDigits17 ? targetQuery : (match ? match[1] : null);

      if (steamId) {
        const player = await mod.findPlayerBySteamId(token, steamId);
        if (player) {
          setResults([]);
          setProfile(await mod.getPlayerProfile(token, player.id));
        } else {
          setErr('No BattleMetrics profile found for this SteamID.');
        }
      } else {
        setResults(await mod.searchPlayers(token, targetQuery));
      }
    } catch (e) {
      setErr(`Search failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const review = async (p: BmPlayer) => {
    setBusy(true); setErr(null); setResults([]);
    try {
      const mod = await import('../../utils/battlemetrics');
      setProfile(await mod.getPlayerProfile(token, p.id));
    } catch (e) {
      setErr(`Failed to load profile: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return <div className="spy-empty"><p>BattleMetrics token required.</p><p className="spy-empty-sub">Add your token in Settings to review player profiles across servers.</p></div>;
  }

  return (
    <div className="spy-profile">
      <div className="spy-bm-search">
        <input
          className="spy-bm-input"
          placeholder="Search a player name to see their server history…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <button className="spy-bm-btn" onClick={doSearch} disabled={busy}>{busy ? '…' : 'Search'}</button>
      </div>
      {err && <div className="spy-bm-err">{err}</div>}

      {results.length > 0 && !profile && (
        <div className="spy-bm-results">
          {results.map((p) => (
            <button key={p.id} className="spy-bm-result" onClick={() => review(p)}>
              <span>{p.name}</span>
              <span className="spy-bm-add">server history →</span>
            </button>
          ))}
        </div>
      )}

      {profile && (
        <div className="spy-profile-card">
          <div className="spy-profile-head">
            <h2 className="spy-detail-name">{profile.name}</h2>
            <button className="spy-untrack" onClick={() => { setProfile(null); }}>← Back</button>
          </div>
          <div className="spy-section-lbl">SERVERS PLAYED ({profile.servers.length})</div>
          {profile.servers.length === 0 ? (
            <div className="spy-empty-sub">No server play history available for this player.</div>
          ) : (
            <div className="spy-profile-servers">
              {profile.servers.slice(0, 40).map((s) => (
                <div key={s.serverId} className="spy-profile-server">
                  <span className="spy-profile-server-name">{s.serverName}</span>
                  <span className="spy-profile-server-time">{fmtPlaytime(s.timePlayedSeconds)}</span>
                  {s.rank ? <span className="spy-profile-server-rank">#{s.rank}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
