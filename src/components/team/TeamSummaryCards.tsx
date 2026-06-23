import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Trophy, Clock, Flame, Skull, Users, Zap, Moon,
  type LucideIcon,
} from 'lucide-react';
import { useLeaderboardStore, getLeaderboardRows } from '@/stores/leaderboard-store';
import { useActivityStore } from '@/stores/activity-store';
import { useTeamStore } from '@/stores/team-store';
import './TeamSummaryCards.css';

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

/** Format a clock time (HH:MM) for "when did it happen" sub-lines. */
function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type CardTone = 'mvp' | 'accent' | 'success' | 'danger' | 'warning' | 'info';

interface CardData {
  id: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone: CardTone;
}

/** A member is considered "in game" (counts toward concurrency) unless offline. */
const ONLINE_SAMPLE_MS = 3 * 60_000; // need a few minutes before AFK call-outs are fair

function SummaryCard({ card }: { card: CardData }) {
  const Icon = card.icon;
  return (
    <div className={`tsc-card tsc-card--${card.tone}`}>
      <div className="tsc-card__icon">
        <Icon size={16} />
      </div>
      <div className="tsc-card__body">
        <span className="tsc-card__label">{card.label}</span>
        <span className="tsc-card__value" title={card.value}>{card.value}</span>
        <span className="tsc-card__sub" title={card.sub}>{card.sub}</span>
      </div>
    </div>
  );
}

export function TeamSummaryCards() {
  // Subscribe so the cards react to live store updates as well as the 1s tick.
  const entries = useLeaderboardStore((s) => s.entries);
  const activityStats = useActivityStore((s) => s.stats);
  const members = useTeamStore((s) => s.members);

  // 1s tick so elapsed times advance smoothly between polls.
  const [now, setNow] = useState(() => Date.now());

  // Within-session derived maxima that no store holds.
  const peakRef = useRef<{ count: number; at: number }>({ count: 0, at: 0 });
  const uptimeStartRef = useRef<number | null>(null);
  const hasDroppedRef = useRef(false);

  useEffect(() => {
    const update = () => {
      const t = Date.now();
      const onlineCount = useTeamStore
        .getState()
        .members.filter((m) => m.status !== 'offline').length;

      // Peak concurrent online this session.
      if (onlineCount > peakRef.current.count) {
        peakRef.current = { count: onlineCount, at: t };
      }

      // Continuous "1+ member online" streak. Seed from the leaderboard session
      // start the first time we observe activity; restart from the moment the
      // team comes back after ever dropping to zero.
      if (onlineCount > 0) {
        if (uptimeStartRef.current == null) {
          uptimeStartRef.current = hasDroppedRef.current
            ? t
            : useLeaderboardStore.getState().sessionStart;
        }
      } else {
        uptimeStartRef.current = null;
        hasDroppedRef.current = true;
      }

      setNow(t);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const cards = useMemo<CardData[]>(() => {
    // entries / members referenced so the memo recomputes on store changes too.
    void entries;
    void members;
    const rows = getLeaderboardRows(now);
    const out: CardData[] = [];

    const deathsFor = (steamId: string) => activityStats[steamId]?.deaths ?? 0;

    // ── MVP of the Wipe — blended score rewarding real playtime + low AFK. ──
    let mvp = null as null | { row: typeof rows[number]; score: number };
    for (const r of rows) {
      const score = r.realMs * (1 - r.afkPct / 200);
      if (r.realMs > 0 && (!mvp || score > mvp.score)) mvp = { row: r, score };
    }
    if (mvp) {
      const r = mvp.row;
      out.push({
        id: 'mvp',
        icon: Trophy,
        label: 'MVP of the Wipe',
        value: r.name,
        sub: `${fmtDuration(r.realMs)} real · ${Math.round(r.breakdown.roaming.pct)}% roaming · ${deathsFor(r.steamId)} deaths`,
        tone: 'mvp',
      });
    }

    // ── Total Playtime — sum of total online time + average per member. ──
    const totalOnlineMs = rows.reduce((sum, r) => sum + r.totalOnlineMs, 0);
    if (totalOnlineMs > 0 && rows.length > 0) {
      out.push({
        id: 'total',
        icon: Clock,
        label: 'Total Playtime',
        value: fmtDuration(totalOnlineMs),
        sub: `${fmtDuration(totalOnlineMs / rows.length)} avg · ${rows.length} member${rows.length === 1 ? '' : 's'}`,
        tone: 'accent',
      });
    }

    // ── Most Active — highest real playtime. ──
    const mostActive = rows.find((r) => r.realMs > 0) ?? null; // rows are sorted by realMs desc
    if (mostActive) {
      out.push({
        id: 'active',
        icon: Flame,
        label: 'Most Active',
        value: mostActive.name,
        sub: `${fmtDuration(mostActive.realMs)} real playtime`,
        tone: 'success',
      });
    }

    // ── Most Deaths — from the activity store. ──
    let mostDeaths = null as null | { name: string; deaths: number };
    for (const st of Object.values(activityStats)) {
      if (st.deaths > 0 && (!mostDeaths || st.deaths > mostDeaths.deaths)) {
        mostDeaths = { name: st.name, deaths: st.deaths };
      }
    }
    if (mostDeaths) {
      out.push({
        id: 'deaths',
        icon: Skull,
        label: 'Most Deaths',
        value: mostDeaths.name,
        sub: `${mostDeaths.deaths} death${mostDeaths.deaths === 1 ? '' : 's'} this session`,
        tone: 'danger',
      });
    }

    // ── Team Record — peak concurrent online this session. ──
    if (peakRef.current.count > 0) {
      out.push({
        id: 'record',
        icon: Users,
        label: 'Team Record',
        value: `${peakRef.current.count} online`,
        sub: `peak concurrent · ${fmtClock(peakRef.current.at)}`,
        tone: 'info',
      });
    }

    // ── Uptime Streak — continuous "1+ member online" time. ──
    if (uptimeStartRef.current != null) {
      out.push({
        id: 'uptime',
        icon: Zap,
        label: 'Uptime Streak',
        value: fmtDuration(Math.max(0, now - uptimeStartRef.current)),
        sub: '1+ member online',
        tone: 'warning',
      });
    }

    // ── Biggest AFKer — highest AFK% with a fair minimum sample. ──
    let afker = null as null | typeof rows[number];
    for (const r of rows) {
      if (r.totalOnlineMs >= ONLINE_SAMPLE_MS && r.afkPct > 0) {
        if (!afker || r.afkPct > afker.afkPct) afker = r;
      }
    }
    if (afker) {
      out.push({
        id: 'afk',
        icon: Moon,
        label: 'Biggest AFKer',
        value: afker.name,
        sub: `${Math.round(afker.afkPct)}% AFK · ${fmtDuration(afker.afkMs)} idle`,
        tone: 'warning',
      });
    }

    return out;
  }, [now, entries, activityStats, members]);

  if (cards.length === 0) return null;

  return (
    <div className="tsc-row" role="list" aria-label="Team summary stats">
      {cards.map((card) => (
        <SummaryCard key={card.id} card={card} />
      ))}
    </div>
  );
}
