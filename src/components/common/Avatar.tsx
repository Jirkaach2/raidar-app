import { useEffect } from 'react';
import { useAvatarStore } from '../../stores/avatar-store';

interface AvatarProps {
  steamId?: string | null;
  name: string;
  size?: number;
  color?: string;
}

/**
 * Player avatar resolved from Steam. Falls back to a colored initial bubble
 * while loading or when the Steam profile is private / has no avatar.
 */
export function Avatar({ steamId, name, size = 28, color }: AvatarProps) {
  const fetchAvatar = useAvatarStore((s) => s.fetchAvatar);
  const url = useAvatarStore((s) => (steamId ? s.avatars[String(steamId)] : undefined));

  useEffect(() => {
    if (steamId) fetchAvatar(steamId);
  }, [steamId, fetchAvatar]);

  const initial = (name || '?').charAt(0).toUpperCase();
  const bg = color || 'var(--surface-raised, #2a2f38)';

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        draggable={false}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '1px solid rgba(0,0,0,0.45)',
        }}
      />
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: size * 0.42,
        fontWeight: 700,
        color: '#fff',
        textShadow: '0 1px 1px rgba(0,0,0,0.6)',
        border: '1px solid rgba(0,0,0,0.45)',
      }}
    >
      {initial}
    </span>
  );
}
