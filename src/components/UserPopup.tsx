/**
 * User popup component shown when clicking on a username/avatar.
 * Displays a profile card with banner, avatar, premium badge, role, status, and action buttons.
 * Positioned to avoid viewport overflow.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_MAP, fetchFriends, sendFriendRequest, fetchPublicProfile, getAuthAttachmentUrl } from '../api';
import type { PublicProfile } from '../api';
import { getBeamIdentity } from '../auth';
import UserAvatar from './UserAvatar';
import styles from './UserPopup.module.css';

export interface UserPopupInfo {
  name: string;
  role?: string | null;
  status?: string | null;
}

export interface UserPopupPos {
  x: number;
  y: number;
}

interface Props {
  user: UserPopupInfo;
  pos: UserPopupPos;
  onClose: () => void;
  onDm?: (name: string) => void;
}

const POPUP_W = 260;
const POPUP_H = 340;

export default function UserPopup({ user, pos, onClose, onDm }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const roleInfo = user.role ? ROLE_MAP[user.role] : null;
  const color = roleInfo?.color;
  const isSelf = user.name === getBeamIdentity();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [friendState, setFriendState] = useState<'loading' | 'none' | 'friends' | 'pending' | 'sending' | 'sent' | 'error'>('loading');

  useEffect(() => {
    fetchPublicProfile(user.name).then(setProfile);
  }, [user.name]);

  useEffect(() => {
    if (isSelf) { setFriendState('none'); return; }
    fetchFriends().then(friends => {
      const isFriend = friends.some(f => f.beam_identity === user.name);
      setFriendState(isFriend ? 'friends' : 'none');
    });
  }, [user.name, isSelf]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const left = pos.x + POPUP_W + 8 > window.innerWidth
    ? Math.max(8, pos.x - POPUP_W - 8)
    : pos.x + 8;
  const top = Math.min(pos.y, window.innerHeight - POPUP_H - 8);

  const style: React.CSSProperties = { position: 'fixed', top, left, zIndex: 9999 };

  async function handleAddFriend() {
    setFriendState('sending');
    const res = await sendFriendRequest(user.name);
    setFriendState(res.ok ? 'sent' : 'error');
  }

  const friendLabel =
    friendState === 'loading' ? '…' :
    friendState === 'friends' ? 'Already friends' :
    friendState === 'pending' ? 'Request pending' :
    friendState === 'sending' ? 'Sending…' :
    friendState === 'sent' ? 'Request sent!' :
    friendState === 'error' ? 'Failed — retry?' :
    'Add Friend';

  const friendDisabled = friendState === 'loading' || friendState === 'friends' || friendState === 'pending' || friendState === 'sending' || friendState === 'sent';

  const isPremium = profile?.premium ?? false;
  const bannerUrl = profile?.banner_attachment_id
    ? getAuthAttachmentUrl(String(profile.banner_attachment_id))
    : null;

  // Short display name (before »)
  const shortName = user.name.includes('»') ? user.name.split('»')[0] : user.name;

  return createPortal(
    <div ref={ref} className={styles.popup} style={style}>
      {/* Banner */}
      <div
        className={styles.banner}
        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
      >
        {!bannerUrl && <div className={styles.bannerGradient} />}
      </div>

      {/* Avatar row — overlaps banner */}
      <div className={styles.avatarRow}>
        <div className={styles.avatarWrap}>
          <UserAvatar
            name={user.name}
            avatarId={profile?.avatar_attachment_id ? String(profile.avatar_attachment_id) : undefined}
            size={56}
            radius={16}
            color={color}
          />
          {/* Status dot */}
          <div className={`${styles.statusDot} ${styles[user.status === 'online' ? 'on' : user.status === 'idle' ? 'idle' : user.status === 'dnd' ? 'dnd' : 'offline']}`} />
        </div>

        {isPremium && (
          <span className={styles.premiumBadge} title="Premium">
            ⚡ Premium
          </span>
        )}
      </div>

      {/* Info */}
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.name} style={color ? { color } : undefined}>
            {shortName}
          </span>
          {profile?.verified && <span className={styles.verifiedBadge} title="Verified">✓</span>}
        </div>
        <div className={styles.tag}>{user.name}</div>
        {roleInfo && (
          <div className={styles.role} style={{ color: roleInfo.color }}>
            {roleInfo.label ?? user.role}
          </div>
        )}
      </div>

      <div className={styles.divider} />

      {/* Actions */}
      <div className={styles.actions}>
        {onDm && (
          <button className={styles.btn} onClick={() => { onDm(user.name); onClose(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Send DM
          </button>
        )}

        {!isSelf && (
          <button className={styles.btn} disabled={friendDisabled} onClick={handleAddFriend}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {friendState === 'friends' || friendState === 'sent' ? (
                <path d="M20 6L9 17l-5-5"/>
              ) : (
                <>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </>
              )}
            </svg>
            {friendLabel}
          </button>
        )}

        <button className={styles.btn} onClick={() => { navigator.clipboard.writeText(user.name); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy ID
        </button>
      </div>
    </div>,
    document.body
  );
}
