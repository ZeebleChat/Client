const KEY = 'zeeble_avatar_cache';
export const AVATAR_CACHE_EVENT = 'zeeble-avatar-cache-update';

function read(): Record<string, string | null> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

function write(map: Record<string, string | null>) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function setAvatarCache(identity: string, avatarId: string | null | undefined) {
  const map = read();
  map[identity] = avatarId ?? null;
  write(map);
  window.dispatchEvent(new CustomEvent(AVATAR_CACHE_EVENT, { detail: { identity } }));
}

export function getAvatarCache(identity: string): string | null {
  return read()[identity] ?? null;
}
