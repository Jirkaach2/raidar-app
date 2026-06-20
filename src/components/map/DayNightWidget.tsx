import React, { useEffect, useState, useRef } from 'react';
import { useMapStore } from '../../stores/map-store';

/**
 * Smart day/night widget for the live map.
 *
 * Rust+ reports the in-game time as a 0..24 hour value, plus the sunrise and
 * sunset hours and how many real-world minutes a full in-game day lasts.
 *
 * dayLengthMinutes = total real-world minutes for a full in-game 24-hour cycle.
 * timeScale        = the instantaneous multiplier for the clock speed.
 *                    It changes dynamically (e.g. night runs faster on most
 *                    servers), so we CANNOT use it to predict the future.
 *
 * Approach: Every poll snapshot we compute a wall-clock deadline for the next
 * day↔night transition and count down to that. Between polls we only use the
 * base rate (24 / dayLengthMinutes) to smoothly interpolate the displayed clock
 * so it doesn't jump every 5s.  The countdown itself is a simple
 * (deadline − now) difference, so it can never jitter or add phantom seconds.
 */

function formatClock(hour: number): string {
  // hour is 0..24
  let h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDuration(realSeconds: number): string {
  if (!isFinite(realSeconds) || realSeconds < 0) return '--';
  const totalSeconds = Math.round(realSeconds);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 16, height: 16 }}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ width: 15, height: 15 }}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const DayNightWidget = React.memo(function DayNightWidget() {
  const timeInfo = useMapStore(s => s.timeInfo);
  // Tick once per second so the countdown stays live without burning CPU.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id == null) id = setInterval(() => setNowMs(Date.now()), 1000); };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => (document.hidden ? stop() : (setNowMs(Date.now()), start()));
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Persist the computed wall-clock transition deadline between renders so it
  // doesn't reset every tick — only when a new server snapshot arrives.
  const deadlineRef = useRef<{ receivedAt: number; deadlineMs: number; targetIsDay: boolean } | null>(null);

  if (!timeInfo) return null;

  const { sunrise, sunset, dayLengthMinutes, timeScale = 1.0, receivedAt } = timeInfo;

  // ------------------------------------------------------------------
  // Base rate: how many game-hours pass per real minute (ignoring
  // the dynamic timeScale).  This is used ONLY for the smooth
  // interpolated clock display between poll snapshots.
  // ------------------------------------------------------------------
  const baseGameHoursPerRealMin = dayLengthMinutes > 0 ? 24 / dayLengthMinutes : 0;

  // Interpolate the displayed clock smoothly from the last snapshot.
  // We use the base rate here (not timeScale) because over the 5 s poll
  // interval the base rate is close enough, and it prevents the clock
  // from visibly jumping every time timeScale fluctuates.
  const elapsedRealMin = Math.max(0, (nowMs - receivedAt) / 60000);
  const time = (timeInfo.time + elapsedRealMin * baseGameHoursPerRealMin) % 24;

  const isDay = time >= sunrise && time < sunset;

  // In-game hours of daylight vs darkness.
  const dayHours = sunset - sunrise;
  const nightHours = 24 - dayHours;

  // ------------------------------------------------------------------
  // Wall-clock deadline for the next day/night transition.
  //
  // LOCKED once per phase.  We compute a deadline when:
  //   (a) we have none yet (first render / reconnect), or
  //   (b) the server reports a DIFFERENT phase than what we're tracking
  //       (the actual day↔night boundary happened), or
  //   (c) the current deadline has expired (countdown reached 0 but the
  //       server hasn't confirmed the switch yet — recompute so the
  //       display doesn't sit at 0s forever).
  //
  // Within a single phase the deadline is NEVER recalculated, so the
  // countdown ticks down exactly 1 real second per tick with zero jumps.
  // ------------------------------------------------------------------
  const snapshotIsDay = timeInfo.time >= sunrise && timeInfo.time < sunset;
  const needsDeadline =
    !deadlineRef.current ||                                          // (a)
    deadlineRef.current.targetIsDay === snapshotIsDay ||              // (b) phase flipped
    deadlineRef.current.deadlineMs <= nowMs;                          // (c) expired

  if (needsDeadline) {
    let gameHoursRemaining: number;
    if (snapshotIsDay) {
      gameHoursRemaining = sunset - timeInfo.time;
    } else {
      gameHoursRemaining = timeInfo.time < sunrise
        ? sunrise - timeInfo.time
        : 24 - timeInfo.time + sunrise;
    }

    // Effective speed at this moment (base rate × timeScale).
    const effectiveGameHoursPerRealMin = baseGameHoursPerRealMin * timeScale;
    const realMsRemaining = effectiveGameHoursPerRealMin > 0
      ? (gameHoursRemaining / effectiveGameHoursPerRealMin) * 60000
      : 0;

    deadlineRef.current = {
      receivedAt,
      deadlineMs: receivedAt + realMsRemaining,
      targetIsDay: !snapshotIsDay,   // what comes AFTER the transition
    };
  }

  const deadline = deadlineRef.current!;
  const realSecondsRemaining = Math.max(0, (deadline.deadlineMs - nowMs) / 1000);

  // ------------------------------------------------------------------
  // Day / Night length summary (total durations, not countdown).
  // Use the base rate (no timeScale) for the "off" phase, and effective
  // rate for the current phase.
  // ------------------------------------------------------------------
  const baseMinPerGameHour = baseGameHoursPerRealMin > 0 ? 1 / baseGameHoursPerRealMin : 0;
  const effectiveMinPerGameHour = (baseGameHoursPerRealMin * timeScale) > 0
    ? 1 / (baseGameHoursPerRealMin * timeScale)
    : 0;

  const dayRealSeconds = dayHours * (isDay ? effectiveMinPerGameHour : baseMinPerGameHour) * 60;
  const nightRealSeconds = nightHours * (!isDay ? effectiveMinPerGameHour : baseMinPerGameHour) * 60;

  const accent = isDay ? '#f5c451' : '#7aa2e8';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 8,
        minWidth: 168,
        background: 'rgba(11, 13, 17, 0.82)',
        border: `1px solid ${accent}55`,
        backdropFilter: 'blur(6px)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        fontFamily: 'var(--font-mono)',
        color: '#e8e2d9',
        pointerEvents: 'none',
      }}
    >
      {/* Header: current state + clock */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent, fontWeight: 700, letterSpacing: '1px', fontSize: 12 }}>
          <span style={{ color: accent, display: 'flex' }}>{isDay ? <SunIcon /> : <MoonIcon />}</span>
          {isDay ? 'DAYTIME' : 'NIGHTTIME'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{formatClock(time)}</span>
      </div>

      {/* Countdown to next transition */}
      <div style={{ fontSize: 11, color: '#cfc8bd' }}>
        {isDay ? 'Nightfall in ' : 'Sunrise in '}
        <span style={{ color: accent, fontWeight: 700 }}>{formatDuration(realSecondsRemaining)}</span>
      </div>

      {/* Day/Night length summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 9, color: '#8b857c', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#f5c451', display: 'flex' }}><SunIcon /></span>
          {formatDuration(dayRealSeconds)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#7aa2e8', display: 'flex' }}><MoonIcon /></span>
          {formatDuration(nightRealSeconds)}
        </span>
      </div>
    </div>
  );
});

export default DayNightWidget;
