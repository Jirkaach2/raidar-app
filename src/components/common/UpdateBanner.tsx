import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Small, unobtrusive auto-update banner.
 *
 * The Rust side checks GitLab releases on launch and, when a newer signed
 * build exists, emits a sequence of `update://*` events while it downloads and
 * installs in the background. The app relaunches itself when done — this banner
 * just keeps the user informed so the relaunch isn't a surprise.
 */

type Phase = 'idle' | 'available' | 'downloading' | 'installing' | 'done';

interface AvailablePayload {
  version: string;
  current: string;
  notes?: string | null;
}
interface ProgressPayload {
  downloaded: number;
  total?: number | null;
}

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [version, setVersion] = useState('');
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<AvailablePayload>('update://available', (e) => {
      setVersion(e.payload.version);
      setPhase('downloading');
    }).then((u) => unlisteners.push(u));

    listen<ProgressPayload>('update://progress', (e) => {
      const { downloaded, total } = e.payload;
      setPhase('downloading');
      setPct(total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null);
    }).then((u) => unlisteners.push(u));

    listen('update://installing', () => setPhase('installing')).then((u) => unlisteners.push(u));
    listen('update://done', () => setPhase('done')).then((u) => unlisteners.push(u));

    return () => { unlisteners.forEach((u) => u()); };
  }, []);

  if (phase === 'idle' || phase === 'available') return null;

  const label =
    phase === 'installing' ? 'Installing update — restarting…'
    : phase === 'done' ? 'Restarting…'
    : pct !== null ? `Downloading update v${version}… ${pct}%`
    : `Downloading update v${version}…`;

  return (
    <div
      style={{
        position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 99999, minWidth: 240, maxWidth: '90vw',
        background: 'rgba(14,16,21,0.97)', border: '1px solid rgba(206,66,43,0.5)',
        borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        padding: '10px 14px', fontFamily: 'var(--font-mono)', color: '#e8e2d9',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
            border: '2px solid rgba(206,66,43,0.35)', borderTopColor: 'var(--color-accent)',
            animation: 'raidar-update-spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3px' }}>{label}</span>
      </div>
      {pct !== null && phase === 'downloading' && (
        <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-accent)', transition: 'width 0.2s' }} />
        </div>
      )}
      <style>{`@keyframes raidar-update-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
