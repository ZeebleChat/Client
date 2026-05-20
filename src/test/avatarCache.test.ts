import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAvatarCache, setAvatarCache, AVATAR_CACHE_EVENT } from '../avatarCache';

beforeEach(() => {
  localStorage.clear();
});

describe('getAvatarCache', () => {
  it('returns null for unknown identity', () => {
    expect(getAvatarCache('nobody')).toBeNull();
  });

  it('returns stored avatarId', () => {
    setAvatarCache('user1', 'abc123');
    expect(getAvatarCache('user1')).toBe('abc123');
  });

  it('returns null when avatarId was set to null', () => {
    setAvatarCache('user1', 'abc123');
    setAvatarCache('user1', null);
    expect(getAvatarCache('user1')).toBeNull();
  });

  it('returns null when avatarId was set to undefined', () => {
    setAvatarCache('user1', undefined);
    expect(getAvatarCache('user1')).toBeNull();
  });
});

describe('setAvatarCache', () => {
  it('persists across multiple identities independently', () => {
    setAvatarCache('alice', 'av1');
    setAvatarCache('bob', 'av2');
    expect(getAvatarCache('alice')).toBe('av1');
    expect(getAvatarCache('bob')).toBe('av2');
  });

  it('overwrites previous value for same identity', () => {
    setAvatarCache('user1', 'old');
    setAvatarCache('user1', 'new');
    expect(getAvatarCache('user1')).toBe('new');
  });

  it('dispatches a custom event with the identity', () => {
    const handler = vi.fn();
    window.addEventListener(AVATAR_CACHE_EVENT, handler);
    setAvatarCache('user1', 'av1');
    window.removeEventListener(AVATAR_CACHE_EVENT, handler);

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ identity: 'user1' });
  });
});
