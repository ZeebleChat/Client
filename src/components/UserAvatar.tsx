/**
 * User avatar component.
 * Displays user avatar image if available, otherwise shows initials.
 * Supports explicit avatarId or falls back to avatar cache lookup.
 * Reacts to cache updates via custom event.
 */
import { useState, useEffect } from 'react';
import { getAuthAttachmentUrl } from '../api';
import { getAvatarCache, AVATAR_CACHE_EVENT } from '../avatarCache';
import styles from './UserAvatar.module.css';

interface Props {
name: string | null | undefined;
/** Explicit avatar attachment ID — if omitted, falls back to cache lookup by name */
avatarId?: string | null;
size?: number;
/** Border radius in px — defaults to 12 */
radius?: number;
style?: React.CSSProperties;
color?: string;
className?: string;
}

export default function UserAvatar({ name, avatarId, size = 36, radius = 12, style, color, className }: Props) {
  const safeName = name || '?';
  const initials = safeName.slice(0, 2).toUpperCase();

  // Track cache version so we re-render when the cache updates
  const [, setCacheVer] = useState(0);

  useEffect(() => {
    // Only listen for cache events when we rely on the cache (no explicit avatarId)
    if (avatarId !== undefined) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ identity: string }>).detail;
      if (detail.identity === safeName) setCacheVer(v => v + 1);
    };
    window.addEventListener(AVATAR_CACHE_EVENT, handler);
    return () => window.removeEventListener(AVATAR_CACHE_EVENT, handler);
  }, [safeName, avatarId]);

  // Use explicit avatarId, then fall back to cache
  const resolvedId = avatarId !== undefined ? avatarId : getAvatarCache(safeName);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: radius,
    fontSize: size * 0.34,
    color: color ?? 'var(--text-1)',
    ...style,
  };

  if (resolvedId) {
    return (
      <div className={`${styles.wrap}${className ? ` ${className}` : ''}`} style={containerStyle}>
        <img
          src={getAuthAttachmentUrl(resolvedId)}
          alt={safeName}
          className={styles.img}
          onError={e => {
            (e.target as HTMLImageElement).style.display = 'none';
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) {
              const fb = document.createElement('span');
              fb.textContent = initials;
              parent.appendChild(fb);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className={`${styles.wrap} ${styles.initials}${className ? ` ${className}` : ''}`} style={containerStyle}>
      {initials}
    </div>
  );
}
