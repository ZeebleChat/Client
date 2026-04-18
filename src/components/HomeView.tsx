/**
 * Home view - main screen when not in a server.
 * Shows friends list, direct messages, and DM conversation.
 * Includes WebSocket for real-time DM updates.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  fetchFriends,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  fetchFriendRequests,
  fetchDMs,
  sendDM,
  type ApiFriend,
  type ApiFriendRequest,
  type ApiDmMessage,
} from '../api';
import { getBeamIdentity, getToken } from '../auth';
import { useNotifications } from '../hooks/useNotifications';
import { getDmUrl } from '../config';
import { setAvatarCache } from '../avatarCache';
import UserAvatar from './UserAvatar';
import styles from './HomeView.module.css';

interface Props {
  onOpenAccount: () => void;
  onAddServer?: () => void;
  voiceChannel?: string | null;
  onLeaveVoice?: () => void;
  voiceMuted?: boolean;
  voiceDeafened?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
}

type FriendsTab = 'online' | 'all' | 'pending';
type Panel =
  | 'friends'
  | 'add-friend'
  | { dm: string; displayName: string };

// ── Small helpers ──────────────────────────────────────────────────────────────


function formatTs(ts: number | string | null | undefined): string {
  if (ts == null) return '';
  let d: Date;
  if (typeof ts === 'number') {
    // > 1e10 means milliseconds, otherwise seconds
    d = ts > 1e10 ? new Date(ts) : new Date(ts * 1000);
  } else {
    const s = String(ts).trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      d = n > 1e10 ? new Date(n) : new Date(n * 1000);
    } else {
      d = new Date(s.replace(' ', 'T'));
    }
  }
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Sub-components ─────────────────────────────────────────────────────────────


// ── DM Conversation panel ──────────────────────────────────────────────────────

interface DmPanelProps {
  beamIdentity: string;
  displayName: string;
  ws: WebSocket | null;
}

function DmPanel({ beamIdentity, displayName, ws }: DmPanelProps) {
  const [messages, setMessages] = useState<ApiDmMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const myBeam = getBeamIdentity();

  useEffect(() => {
    setLoading(true);
    fetchDMs(beamIdentity).then(msgs => {
      setMessages(msgs);
      setLoading(false);
    });
  }, [beamIdentity]);

  // Listen for incoming WS messages relevant to this conversation
  useEffect(() => {
    if (!ws) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const sender = data.from ?? data.sender_beam ?? '';
        const recipient = data.to ?? data.recipient_beam ?? '';
        if (
          data.type === 'dm' &&
          (sender === beamIdentity || recipient === beamIdentity)
        ) {
          const msg: ApiDmMessage = {
            id: data.id ?? data.message_id ?? `ws-${Date.now()}`,
            from: data.from ?? data.sender_beam ?? '',
            to: data.to ?? data.recipient_beam ?? '',
            content: data.content ?? data.message ?? '',
            created_at: data.created_at ?? data.timestamp ?? Date.now() / 1000,
          };
          setMessages(prev => {
            if (prev.some(m => String(m.id) === String(msg.id))) return prev;
            return [...prev, msg];
          });
        }
      } catch {
        // ignore parse errors
      }
    };
    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [ws, beamIdentity]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const optimistic: ApiDmMessage = {
      id: `opt-${Date.now()}`,
      from: myBeam,
      to: beamIdentity,
      content: text,
      created_at: Date.now() / 1000,
    };
    setMessages(prev => [...prev, optimistic]);
    await sendDM(beamIdentity, text);
  }

  return (
    <div className={styles.dmPanel}>
      <div className={styles.dmHeader}>
        <UserAvatar name={displayName} size={32} />
        <span className={styles.dmHeaderName}>{displayName}</span>
      </div>

      <div className={styles.dmMessages}>
        {loading && <div className={styles.emptyState}>Loading…</div>}
        {!loading && messages.length === 0 && (
          <div className={styles.emptyState}>No messages yet. Say hello!</div>
        )}
        {messages.map(msg => {
          const isMine = msg.from === myBeam;
          return (
            <div
              key={String(msg.id)}
              className={`${styles.dmMsgRow} ${isMine ? styles.dmMine : ''}`}
            >
              {!isMine && <UserAvatar name={msg.from} size={30} />}
              <div className={styles.dmBubble}>
                {!isMine && (
                  <div className={styles.dmSender}>{msg.from}</div>
                )}
                <div className={styles.dmText}>{msg.content}</div>
                <div className={styles.dmTime}>{formatTs(msg.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className={styles.dmInputArea}>
        <div className={styles.dmInputCapsule}>
          <input
            className={styles.dmInput}
            placeholder={`Message ${displayName}`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            autoComplete="off"
          />
          <button className={styles.dmSendBtn} onClick={handleSend} disabled={!input.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" transform="rotate(45)">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Friends view ───────────────────────────────────────────────────────────────

interface FriendsPanelProps {
  friends: ApiFriend[];
  requests: ApiFriendRequest[];
  onMessage: (beam: string, displayName: string) => void;
  onAddFriend: () => void;
  onRefresh: () => void;
}

function FriendsPanel({ friends, requests, onMessage, onAddFriend, onRefresh }: FriendsPanelProps) {
  const [tab, setTab] = useState<FriendsTab>('online');
  const [removing, setRemoving] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const online = friends.filter(f => f.status === 'online');
  const pending = requests.filter(r => r.direction === 'incoming' || !r.direction);

  async function handleRemove(id: string | number, beam: string) {
    setRemoving(beam);
    await removeFriend(id);
    setRemoving(null);
    onRefresh();
  }

  async function handleAccept(id: string | number) {
    setAccepting(String(id));
    await acceptFriendRequest(id);
    setAccepting(null);
    onRefresh();
  }

  const displayFriends = tab === 'online' ? online : friends;

  return (
    <div className={styles.friendsPanel}>
      <div className={styles.friendsHeader}>
        <div className={styles.friendsTitle}>Friends</div>
        <button className={styles.addFriendBtn} onClick={onAddFriend}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
          Add Friend
        </button>
      </div>

      <div className={styles.tabBar}>
        {(['online', 'all', 'pending'] as FriendsTab[]).map(t => (
          <button
            key={t}
            className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'online' && 'Online'}
            {t === 'all' && 'All'}
            {t === 'pending' && (
              <>
                Pending
                {pending.length > 0 && (
                  <span className={styles.pendingBadge}>{pending.length}</span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      <div className={styles.friendsList}>
        {tab !== 'pending' && displayFriends.length === 0 && (
          <div className={styles.emptyState}>
            {tab === 'online' ? 'No friends online right now.' : 'No friends yet.'}
          </div>
        )}

        {tab !== 'pending' && displayFriends.map(f => {
          const name = f.display_name || f.beam_identity;
          const avatarId = f.avatar_attachment_id != null ? String(f.avatar_attachment_id) : null;
          return (
            <div key={f.beam_identity} className={styles.friendRow}>
              <div className={styles.friendAvatarWrap}>
                <UserAvatar name={name} avatarId={avatarId} size={38} />
                <div className={`${styles.statusDot} ${f.status === 'online' ? styles.dotOnline : styles.dotOffline}`} />
              </div>
              <div className={styles.friendInfo}>
                <div className={styles.friendName}>{name}</div>
                {f.beam_identity !== name && (
                  <div className={styles.friendBeam}>{f.beam_identity}</div>
                )}
              </div>
              <div className={styles.friendActions}>
                <button
                  className={styles.actionBtn}
                  title="Message"
                  onClick={() => onMessage(f.beam_identity, name)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                {tab === 'all' && (
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    title="Remove friend"
                    disabled={removing === f.beam_identity}
                    onClick={() => handleRemove(f.id, f.beam_identity)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <line x1="22" y1="18" x2="16" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {tab === 'pending' && pending.length === 0 && (
          <div className={styles.emptyState}>No pending friend requests.</div>
        )}

        {tab === 'pending' && pending.map(req => {
          const name = req.display_name || req.from_beam || req.beam_identity || 'Unknown';
          const id = req.id;
          return (
            <div key={String(id)} className={styles.friendRow}>
              <UserAvatar name={name} size={38} />
              <div className={styles.friendInfo}>
                <div className={styles.friendName}>{name}</div>
                <div className={styles.friendBeam}>Incoming request</div>
              </div>
              <div className={styles.friendActions}>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnAccept}`}
                  disabled={accepting === String(id)}
                  onClick={() => handleAccept(id)}
                >
                  {accepting === String(id) ? '…' : 'Accept'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Add Friend view ────────────────────────────────────────────────────────────

function AddFriendPanel({ onBack }: { onBack: () => void }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const beam = value.trim();
    if (!beam) return;
    setLoading(true);
    setStatus(null);
    const result = await sendFriendRequest(beam);
    setLoading(false);
    if (result.ok) {
      setStatus({ ok: true, msg: 'Friend request sent!' });
      setValue('');
    } else {
      setStatus({ ok: false, msg: result.error || 'Failed to send request.' });
    }
  }

  return (
    <div className={styles.addFriendPanel}>
      <div className={styles.addFriendCard}>
        <div className={styles.addFriendIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
        </div>
        <h2 className={styles.addFriendTitle}>Add a Friend</h2>
        <p className={styles.addFriendSub}>
          Enter the Beam Identity of the person you want to add.
        </p>
        <div className={styles.addFriendRow}>
          <input
            className={styles.addFriendInput}
            placeholder="beam_identity»example"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className={styles.addFriendSendBtn}
            onClick={handleSend}
            disabled={loading || !value.trim()}
          >
            {loading ? '…' : 'Send Request'}
          </button>
        </div>
        {status && (
          <div className={`${styles.addFriendStatus} ${status.ok ? styles.statusOk : styles.statusErr}`}>
            {status.msg}
          </div>
        )}
        <button className={styles.backLink} onClick={onBack}>
          ← Back to Friends
        </button>
      </div>
    </div>
  );
}

// ── DM Sidebar ─────────────────────────────────────────────────────────────────

interface DmConversation {
  beamIdentity: string;
  displayName: string;
  avatarId?: string | null;
  lastSnippet?: string;
}

interface DmSidebarProps {
  conversations: DmConversation[];
  panel: Panel;
  onSelectFriends: () => void;
  onSelectAddFriend: () => void;
  onSelectDm: (beam: string, displayName: string) => void;
  onOpenAccount?: () => void;
  onAddServer?: () => void;
  voiceChannel?: string | null;
  onLeaveVoice?: () => void;
  voiceMuted?: boolean;
  voiceDeafened?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
}

function DmSidebar({
  conversations,
  panel,
  onSelectFriends,
  onSelectAddFriend,
  onSelectDm,
  onOpenAccount,
  onAddServer,
  voiceChannel,
  onLeaveVoice,
  voiceMuted,
  voiceDeafened,
  onToggleMute,
  onToggleDeafen,
}: DmSidebarProps) {
  const identity = getBeamIdentity();
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const handleCopyId = useCallback(() => {
    if (!identity) return;
    navigator.clipboard.writeText(identity).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [identity]);

  useEffect(() => {
    if (!qrOpen) return;
    const handler = (e: MouseEvent) => {
      if (qrRef.current && !qrRef.current.contains(e.target as Node)) {
        setQrOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [qrOpen]);

  const filtered = conversations.filter(c =>
    c.displayName.toLowerCase().includes(search.toLowerCase()) ||
    c.beamIdentity.toLowerCase().includes(search.toLowerCase())
  );

  const isFriendsActive = panel === 'friends';
  const activeDm = typeof panel === 'object' ? panel.dm : null;

  return (
    <div className={styles.dmSidebar}>
      <div className={styles.dmSidebarTopBtns}>
        <button className={styles.sidebarTopBtn} onClick={onOpenAccount} title="Account">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Account</span>
        </button>
        <button className={styles.sidebarTopBtn} onClick={onAddServer} title="Add Server">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Add Server</span>
        </button>
      </div>

      <div className={styles.dmSidebarHeader}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Find a conversation"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.dmSidebarScroll}>
        <button
          className={`${styles.navItem} ${isFriendsActive ? styles.navItemActive : ''}`}
          onClick={onSelectFriends}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>Friends</span>
        </button>

        <div className={styles.dmSectionHeader}>
          <span className={styles.dmSectionLabel}>Direct Messages</span>
          <button className={styles.addDmBtn} title="New DM" onClick={onSelectAddFriend}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        {filtered.length === 0 && (
          <div className={styles.noConvsMsg}>No conversations yet</div>
        )}

        {filtered.map(c => (
          <button
            key={c.beamIdentity}
            className={`${styles.dmConvItem} ${activeDm === c.beamIdentity ? styles.dmConvActive : ''}`}
            onClick={() => onSelectDm(c.beamIdentity, c.displayName)}
          >
            <UserAvatar name={c.displayName} avatarId={c.avatarId} size={34} />
            <div className={styles.convInfo}>
              <div className={styles.convName}>{c.displayName}</div>
              {c.lastSnippet && (
                <div className={styles.convSnippet}>{c.lastSnippet}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer: VC bar + user card */}
      <div className={styles.dmFooter}>
        {voiceChannel && (
          <div className={styles.dmVoiceBar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--green)" stroke="var(--green)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none"/>
            </svg>
            <div className={styles.dmVoiceBarInfo}>
              <span className={styles.dmVoiceChannel}>#{voiceChannel}</span>
            </div>
            {onToggleMute && (
              <button
                className={`${styles.dmIconBtn} ${voiceMuted ? styles.dmVoiceIconActive : ''}`}
                title={voiceMuted ? 'Unmute' : 'Mute'}
                onClick={onToggleMute}
              >
                {voiceMuted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </button>
            )}
            {onToggleDeafen && (
              <button
                className={`${styles.dmIconBtn} ${voiceDeafened ? styles.dmVoiceIconActive : ''}`}
                title={voiceDeafened ? 'Undeafen' : 'Deafen'}
                onClick={onToggleDeafen}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                  {voiceDeafened && <line x1="1" y1="1" x2="23" y2="23"/>}
                </svg>
              </button>
            )}
            {onLeaveVoice && (
              <button className={styles.dmLeaveBtn} onClick={onLeaveVoice}>Leave</button>
            )}
          </div>
        )}
        <div className={styles.dmUserCard}>
          <div className={styles.dmUfAvatarWrap}>
            <UserAvatar name={identity} size={34} radius={10} className={styles.dmUfAvatar} />
            <div className={styles.dmUfStat} />
          </div>
          <div className={styles.dmUfInfo}>
            <div
              className={styles.dmUfName}
              title={copied ? 'Copied!' : 'Click to copy'}
              onClick={handleCopyId}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              {copied ? (
                <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700 }}>Copied!</span>
              ) : (identity || 'Me')}
            </div>
            <div className={styles.dmUfId}>Online</div>
          </div>
          <div style={{ position: 'relative' }} ref={qrRef}>
            <button
              className={styles.dmIconBtn}
              title="Show friend QR code"
              onClick={() => setQrOpen(v => !v)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/>
              </svg>
            </button>
            {qrOpen && identity && (
              <div className={styles.dmQrPopup}>
                <div className={styles.dmQrLabel}>Share to add as friend</div>
                <div className={styles.dmQrCode}>
                  <QRCodeSVG value={identity} size={150} bgColor="#ffffff" fgColor="#111111" level="M" />
                </div>
                <div className={styles.dmQrBeam}>{identity}</div>
                <button className={styles.dmQrCopyBtn} onClick={() => navigator.clipboard.writeText(identity)}>
                  Copy ID
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main HomeView ──────────────────────────────────────────────────────────────

export default function HomeView({ onOpenAccount, onAddServer, voiceChannel, onLeaveVoice }: Props) {
  const [panel, setPanel] = useState<Panel>('friends');
  const [friends, setFriends] = useState<ApiFriend[]>([]);
  const [requests, setRequests] = useState<ApiFriendRequest[]>([]);
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [dmWs, setDmWs] = useState<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { notifyDm } = useNotifications();

  // Build DM conversation list from friends list
  useEffect(() => {
    const convs: DmConversation[] = friends.map(f => ({
      beamIdentity: f.beam_identity,
      displayName: f.display_name || f.beam_identity,
      avatarId: f.avatar_attachment_id != null ? String(f.avatar_attachment_id) : null,
    }));
    setConversations(convs);
  }, [friends]);

  const loadFriends = useCallback(async () => {
    const [fr, rq] = await Promise.all([fetchFriends(), fetchFriendRequests()]);
    fr.forEach(f => {
      if (f.avatar_attachment_id != null) setAvatarCache(f.beam_identity, String(f.avatar_attachment_id));
    });
    setFriends(fr);
    setRequests(rq);
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // DM WebSocket
  useEffect(() => {
    const rawUrl = getDmUrl();
    if (!rawUrl) return;

    // Guard against StrictMode double-invoke: if a WS already exists and is
    // open/connecting, don't create another one.
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const wsUrl = rawUrl.replace(/^http/, 'ws');
    const token = getToken();
    const url = `${wsUrl}/ws?token=${encodeURIComponent(token ?? '')}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setDmWs(ws);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'dm') {
          const fromBeam: string = data.from || '';
          setConversations(prev => {
            const exists = prev.some(c => c.beamIdentity === fromBeam);
            if (!exists && fromBeam) {
              return [{ beamIdentity: fromBeam, displayName: fromBeam, lastSnippet: data.content }, ...prev];
            }
            return prev.map(c =>
              c.beamIdentity === fromBeam
                ? { ...c, lastSnippet: data.content }
                : c
            );
          });
          notifyDm(fromBeam, data.content ?? '');
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => { /* silently ignore */ };

    ws.onclose = () => {
      // Only clear state if this is still the current socket
      if (wsRef.current === ws) {
        wsRef.current = null;
        setDmWs(null);
      }
    };

    return () => {
      // Close the socket but do NOT null wsRef here.
      // The readyState will become CLOSING (2), which causes the guard on the
      // next mount to skip past <= OPEN (1) and create a fresh socket.
      // onclose will handle nulling wsRef when the close completes.
      ws.close();
    };
  }, []);

  function handleSelectDm(beam: string, displayName: string) {
    setPanel({ dm: beam, displayName });
  }

  return (
    <div className={styles.homeView}>
      <DmSidebar
        conversations={conversations}
        panel={panel}
        onSelectFriends={() => setPanel('friends')}
        onSelectAddFriend={() => setPanel('add-friend')}
        onSelectDm={handleSelectDm}
        onOpenAccount={onOpenAccount}
        onAddServer={onAddServer}
        voiceChannel={voiceChannel}
        onLeaveVoice={onLeaveVoice}
      />

      <div className={styles.mainArea}>
        {panel === 'friends' && (
          <FriendsPanel
            friends={friends}
            requests={requests}
            onMessage={handleSelectDm}
            onAddFriend={() => setPanel('add-friend')}
            onRefresh={loadFriends}
          />
        )}

        {panel === 'add-friend' && (
          <AddFriendPanel onBack={() => setPanel('friends')} />
        )}

        {typeof panel === 'object' && (
          <DmPanel
            beamIdentity={panel.dm}
            displayName={panel.displayName}
            ws={dmWs}
          />
        )}
      </div>
    </div>
  );
}
