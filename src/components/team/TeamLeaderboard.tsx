import { useEffect, useMemo, useState } from 'react';
import {
  Crown, Clock, ChevronDown, ChevronRight, Home, Building2,
  Footprints, Moon, Skull, Trophy, Users,
} from 'lucide-react';
import { useLeaderboardStore, getLeaderboardRows } from '@/stores/leaderboard-store';
import type { LeaderboardRow, CurrentZone } from '@/stores/leaderboard-store';
import { useTeamStore } from '@/stores/team-store';
import { useActivityStore } from '@/stores/activity-store';
import './TeamLeaderboard.css';

/** Zone palette shared by the legend, segmented bar and breakdown rows. */
const ZONE_META = {
  base:     { label: 'Base',     color: '#6fcf73', Icon: Home },
  monument: { label: 'Monument', color: '#e8a838', Icon: Building2 },
  roaming:  { label: 'Roaming',  color: '#58c6e8', Icon: Footprints },
  afk:      { label: 'AFK',      color: '#e84545', Icon: Moon },
} as const;

type ZoneKey = keyof typeof ZONE_META;
const ZONE_ORDER: ZoneKey[] = ['base', 'monument', 'roaming', 'afk'];

/** Format a millisecond duration as e.g. "2h 04m" / "12m 30s" / "45s". */
function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function currentZoneLabel(zone: CurrentZone, monument: string | null): string {
  if (zone === 'offline') return 'Offline';
  if (zone === 'monument') return monument ? `At ${monument}` : 'At monument';
  if (zone === 'base') return 'At base';
  if (zone === 'afk') return 'AFK';
  return 'Roaming';
}

/** Segmented horizontal bar showing Base / Monument / Roaming / AFK proportions. */
function ActivityBar({ row }: { row: LeaderboardRow }) {
  const segs = ZONE_ORDER.map((k) => ({ k, pct: row.breakdown[k].pct, color: ZONE_META[k].color }))
    .filter((s) => s.pct > 0.5);
  return (
    <div className="tlb-bar" role="img" aria-label="activity breakdown">
      {segs.length === 0 ? (
        <div className="tlb-bar__empty" />
      ) : (
        segs.map((s) => (
          <div
            key={s.k}
            className="tlb-bar__seg"
            style={{ width: `${s.pct}%`, background: s.color }}
            title={`${ZONE_META[s.k].label} ${Math.round(s.pct)}%`}
          />
        ))
      )}
    </div>
  );
}

function rankBadge(rank: number): string {
  if (rank === 1) return 'tlb-rank--gold';
  if (rank === 2) return 'tlb-rank--silver';
  if (rank === 3) return 'tlb-rank--bronze';
  return '';
}

export function TeamLeaderboard() {
  // Subscribe to the accumulated entries so the list reacts to record() calls.
  const entries = useLeaderboardStore((s) => s.entries);
  const sessionStart = useLeaderboardStore((s) => s.sessionStart);
  const members = useTeamStore((s) => s.members);
  const activityStats = useActivityStore((s) => s.stats);

  // Local 1s tick re-renders so elapsed times advance smoothly between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [expanded, setExpanded] = useState<string | null>(null);

  // Recompute ranked rows on every tick / entries change.
  const rows = useMemo(() => getLeaderboardRows(now), [entries, now]);

  const onlineCount = rows.filter((r) => r.online).length;
  const hasData = rows.length > 0;
  const hasTeam = members.length > 0;

  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <div className="tlb">
      <header className="tlb-header">
        <div className="tlb-header__title">
          <Trophy size={16} />
          <span>Team Leaderboard</span>
        </div>
        <p className="tlb-header__sub">
          Ranked by <strong>real playtime</strong> — total online time minus AFK.
        </p>
        <div className="tlb-legend">
          {ZONE_ORDER.map((k) => (
            <span className="tlb-legend__item" key={k}>
              <span className="tlb-legend__dot" style={{ background: ZONE_META[k].color }} />
              {ZONE_META[k].label}
            </span>
          ))}
        </div>
      </header>

      {!hasData ? (
        <div className="tlb-empty">
          <Users size={28} />
          <p className="tlb-empty__title">
            {hasTeam ? 'Gathering playtime…' : 'No team data yet'}
          </p>
          <p className="tlb-empty__hint">
            {hasTeam
              ? 'Hang tight — stats build up as teammates move around the map.'
              : 'Connect to a server with a team to start tracking real playtime.'}
          </p>
        </div>
      ) : (
        <>
          <div className="tlb-meta">
            <span>{onlineCount}/{rows.length} online</span>
            <span className="tlb-meta__sep">·</span>
            <span>Session {fmtDuration(Math.max(0, now - sessionStart))}</span>
          </div>

          <ul className="tlb-list">
            {rows.map((row) => {
              const isOpen = expanded === row.steamId;
              const deaths = activityStats[row.steamId]?.deaths ?? 0;
              return (
                <li key={row.steamId} className={`tlb-row ${row.online ? '' : 'tlb-row--offline'}`}>
                  <button className="tlb-row__main" onClick={() => toggle(row.steamId)}>
                    <span className={`tlb-rank ${rankBadge(row.rank)}`}>{row.rank}</span>

                    <span className="tlb-id">
                      <span className="tlb-name">
                        {row.isLeader && <Crown size={12} className="tlb-crown" />}
                        {row.name}
                      </span>
                      <span className="tlb-zone">
                        <span
                          className="tlb-zone__dot"
                          style={{ background: row.online ? ZONE_META[(row.currentZone === 'offline' ? 'roaming' : row.currentZone) as ZoneKey].color : 'var(--color-text-dim)' }}
                        />
                        {currentZoneLabel(row.currentZone, row.currentMonument)}
                      </span>
                    </span>

                    {row.badges.length > 0 && (
                      <span className="tlb-badges">
                        {row.badges.map((b) => (
                          <span
                            key={b.id}
                            className="tlb-badge"
                            style={{ color: b.color, borderColor: b.color }}
                            title={b.hint}
                          >
                            {b.label}
                          </span>
                        ))}
                      </span>
                    )}

                    <span className="tlb-times">
                      <span className="tlb-time">
                        <span className="tlb-time__label">TOTAL</span>
                        <span className="tlb-time__val">{fmtDuration(row.totalOnlineMs)}</span>
                      </span>
                      <span className="tlb-time">
                        <span className="tlb-time__label">REAL</span>
                        <span className="tlb-time__val tlb-time__val--real">{fmtDuration(row.realMs)}</span>
                      </span>
                      <span className="tlb-time">
                        <span className="tlb-time__label">AFK</span>
                        <span className="tlb-time__val tlb-time__val--afk">{Math.round(row.afkPct)}%</span>
                      </span>
                    </span>

                    <ActivityBar row={row} />

                    <span className="tlb-chevron">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="tlb-detail">
                      <div className="tlb-detail__zones">
                        {ZONE_ORDER.map((k) => {
                          const { label, color, Icon } = ZONE_META[k];
                          const b = row.breakdown[k];
                          return (
                            <div className="tlb-zoneStat" key={k}>
                              <span className="tlb-zoneStat__head" style={{ color }}>
                                <Icon size={13} /> {label}
                              </span>
                              <span className="tlb-zoneStat__val">{fmtDuration(b.ms)}</span>
                              <div className="tlb-zoneStat__track">
                                <div className="tlb-zoneStat__fill" style={{ width: `${b.pct}%`, background: color }} />
                              </div>
                              <span className="tlb-zoneStat__pct">{Math.round(b.pct)}%</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="tlb-detail__facts">
                        <div className="tlb-fact">
                          <Clock size={13} />
                          <span>Now: {currentZoneLabel(row.currentZone, row.currentMonument)}</span>
                        </div>
                        <div className="tlb-fact">
                          <Skull size={13} />
                          <span>{deaths} death{deaths === 1 ? '' : 's'} this session</span>
                        </div>
                        <div className="tlb-fact">
                          <Trophy size={13} />
                          <span>Real playtime: {fmtDuration(row.realMs)} of {fmtDuration(row.totalOnlineMs)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
