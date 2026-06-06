/**
 * Home view - main screen when not in a server.
 * Shows friends list, direct messages, and DM conversation.
 * Includes WebSocket for real-time DM updates.
 */
import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  fetchFriends,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  fetchFriendRequests,
  fetchDMs,
  sendDM,
  uploadDmFile,
  fetchDmAttachment,
  type ApiFriend,
  type ApiFriendRequest,
  type ApiDmMessage,
  type ApiAttachment,
  type ApiChannel,
} from '../api';
import { useVoice } from '../hooks/useVoice';
import { getBeamIdentity } from '../auth';
import { useNotifications } from '../hooks/useNotifications';
import { useAttachmentBlobUrl } from '../hooks/useAttachmentBlobUrl';
import { useDmWebSocket } from '../hooks/useDmWebSocket';
import { setAvatarCache } from '../avatarCache';
import UserAvatar from './UserAvatar';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import GiphyPicker from './GiphyPicker';
import { searchEmojis, type EmojiEntry } from './emojiData';
import { statusClass } from '../types';
import UserFooter from './UserFooter';
import styles from './HomeView.module.css';


const NOTIFIED_FR_KEY = 'zbl_notified_fr_ids';
function getNotifiedFrIds(): Set<string | number> {
  try {
    const raw = localStorage.getItem(NOTIFIED_FR_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function markFrNotified(id: string | number) {
  const ids = getNotifiedFrIds();
  ids.add(String(id));
  localStorage.setItem(NOTIFIED_FR_KEY, JSON.stringify([...ids]));
}

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

function getTimestampMs(ts: number | string | null | undefined): number {
  if (ts == null) return 0;
  if (typeof ts === 'number') return ts > 1e10 ? ts : ts * 1000;
  const s = String(ts).trim();
  if (/^\d+(\.\d+)?$/.test(s)) { const n = parseFloat(s); return n > 1e10 ? n : n * 1000; }
  return new Date(s.replace(' ', 'T')).getTime() || 0;
}

function isSameDay(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  return new Date(getTimestampMs(a)).toDateString() === new Date(getTimestampMs(b)).toDateString();
}

function formatDateLabel(ts: number | string | null | undefined): string {
  const d = new Date(getTimestampMs(ts));
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Sub-components ─────────────────────────────────────────────────────────────


function isGifUrl(content: string): boolean {
  const s = content.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/\s/.test(s)) return false;
  return /tenor\.com|giphy\.com|\.gif(\?|$)/i.test(s);
}

function DmAttachmentView({ att }: { att: ApiAttachment }) {
  const blobUrl = useAttachmentBlobUrl(att.id, fetchDmAttachment);
  const ct = att.content_type ?? '';
  const fname = att.filename ?? '';
  const isImage = ct.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fname);
  const isVideo = ct.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(fname);
  const isAudio = ct.startsWith('audio/') || /\.(mp3|ogg|wav|flac|m4a)$/i.test(fname);

  if (!blobUrl) return null;

  if (isImage) {
    return (
      <a href={blobUrl} download={fname || 'image'} className={styles.dmAttachImgLink}>
        <img src={blobUrl} alt={fname || 'image'} className={styles.dmAttachImg} />
      </a>
    );
  }
  if (isVideo) {
    return <video src={blobUrl} controls className={styles.dmAttachVideo} />;
  }
  if (isAudio) {
    return <audio src={blobUrl} controls className={styles.dmAttachAudio} preload="metadata" />;
  }
  const kb = att.size ? ` · ${(att.size / 1024).toFixed(1)} KB` : '';
  return (
    <a href={blobUrl} download={fname || 'file'} className={styles.dmAttachFile}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>{fname || 'file'}{kb}</span>
    </a>
  );
}

function getEmojiPickerTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? Theme.LIGHT : Theme.DARK;
}

// ── DM Conversation panel ──────────────────────────────────────────────────────

interface DmPanelProps {
  beamIdentity: string;
  displayName: string;
  ws: WebSocket | null;
}

interface PendingDmFile {
  file: File;
  id?: string | number;
  uploading: boolean;
  previewUrl?: string;
}

function DmPanel({ beamIdentity, displayName, ws }: DmPanelProps) {
  const [messages, setMessages] = useState<ApiDmMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(true);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPickerTheme, setEmojiPickerTheme] = useState(() => getEmojiPickerTheme());
  const [gifOpen, setGifOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiIdx, setEmojiIdx] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<PendingDmFile[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing-out' | 'ringing-in' | 'connected'>('idle');
  const callStatusRef = useRef<'idle' | 'ringing-out' | 'ringing-in' | 'connected'>('idle');

  const { voiceState, joinVoice, leaveVoice, toggleMute, handleVoiceAudio } = useVoice();

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const gifBtnRef = useRef<HTMLButtonElement>(null);
  const gifPickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef(ws);
  useEffect(() => { wsRef.current = ws; }, [ws]);
  const myBeam = getBeamIdentity();

  function setCall(s: 'idle' | 'ringing-out' | 'ringing-in' | 'connected') {
    callStatusRef.current = s;
    setCallStatus(s);
  }

  const dmVoiceSendFn = useCallback((msg: Record<string, unknown>) => {
    const sock = wsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    if (msg.type === 'voice_audio') {
      sock.send(JSON.stringify({ type: 'dm_voice_audio', to: beamIdentity, data: msg.data }));
    }
  }, [beamIdentity]);

  const emojiMatches = useMemo<EmojiEntry[]>(() => {
    if (emojiQuery === null || emojiQuery.length < 1) return [];
    return searchEmojis(emojiQuery, 8);
  }, [emojiQuery]);

  const canSend = (input.trim().length > 0 || pendingFiles.some(f => !f.uploading && f.id != null)) && !pendingFiles.some(f => f.uploading);

  const annotated = useMemo(() => messages.map((msg, i) => {
    const prev = messages[i - 1];
    const tsMs = getTimestampMs(msg.created_at);
    const isFirst = !prev || prev.from !== msg.from || (tsMs - getTimestampMs(prev.created_at)) >= 5 * 60 * 1000;
    const newDay = !prev || !isSameDay(prev.created_at, msg.created_at);
    return { ...msg, isFirst, newDay };
  }), [messages]);

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return annotated
      .map((msg, i) => ({ msg, i }))
      .filter(({ msg }) => typeof msg.content === 'string' && msg.content.toLowerCase().includes(q))
      .map(({ i }) => i);
  }, [searchQuery, annotated]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const matchMsgIdx = searchMatches[Math.min(searchIdx, searchMatches.length - 1)];
    const el = messagesRef.current?.querySelector(`[data-msgrow="${matchMsgIdx}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [searchIdx, searchMatches]);

  useEffect(() => {
    setLoading(true);
    fetchDMs(beamIdentity).then(msgs => {
      setMessages(msgs);
      setLoading(false);
    });
  }, [beamIdentity]);

  useEffect(() => {
    if (!ws) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);

        // ── Call signaling ────────────────────────────────────────────────────
        if (data.type === 'dm_call_invite' && data.from === beamIdentity) {
          setCall('ringing-in');
          return;
        }
        if (data.type === 'dm_call_answer' && data.from === beamIdentity) {
          if (data.accepted) {
            const fakeChannel: ApiChannel = { id: `dm:${beamIdentity}`, name: displayName, type: 'voice' };
            joinVoice(fakeChannel, dmVoiceSendFn).then(() => setCall('connected'));
          } else {
            setCall('idle');
          }
          return;
        }
        if (data.type === 'dm_call_end' && data.from === beamIdentity) {
          leaveVoice();
          setCall('idle');
          return;
        }
        if (data.type === 'dm_voice_audio' && data.from === beamIdentity) {
          handleVoiceAudio(data.from as string, 'dm', data.data as string);
          return;
        }

        const sender = data.from ?? data.sender_beam ?? '';
        const recipient = data.to ?? data.recipient_beam ?? '';
        // DirectMessage has no "type" field — detect by presence of sender + recipient.
        // Exclude system/pong/sent control frames which have no beam identity fields.
        if (
          sender && recipient &&
          (sender === beamIdentity || recipient === beamIdentity)
        ) {
          const rawAtts = data.attachments ?? data.files ?? [];
          const attachments: ApiAttachment[] = Array.isArray(rawAtts)
            ? (rawAtts as Record<string, unknown>[]).map((a: Record<string, unknown>) => ({
                id: (a.id ?? a.attachment_id ?? '') as string | number,
                filename: a.filename as string | undefined,
                content_type: (a.content_type ?? a.mime_type) as string | undefined,
                size: a.size as number | undefined,
              }))
            : [];
          const msg: ApiDmMessage = {
            id: data.id ?? data.message_id ?? `ws-${Date.now()}`,
            from: data.from ?? data.sender_beam ?? '',
            to: data.to ?? data.recipient_beam ?? '',
            content: data.content ?? data.message ?? '',
            created_at: data.created_at ?? data.timestamp ?? Date.now() / 1000,
            attachments: attachments.length > 0 ? attachments : undefined,
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
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => { if (emojiOpen) setEmojiPickerTheme(getEmojiPickerTheme()); }, [emojiOpen]);

  useEffect(() => {
    if (!emojiOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (emojiBtnRef.current?.contains(target)) return;
      const pickerEl = document.querySelector('.EmojiPickerReact');
      if (pickerEl?.contains(target)) return;
      setEmojiOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [emojiOpen]);

  useEffect(() => {
    if (!gifOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (gifBtnRef.current?.contains(target)) return;
      if (gifPickerRef.current?.contains(target)) return;
      setGifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [gifOpen]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const file of files) {
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      const entry: PendingDmFile = { file, uploading: true, previewUrl };
      setPendingFiles(prev => [...prev, entry]);
      const result = await uploadDmFile(file);
      if (result.ok && result.id != null) {
        setPendingFiles(prev => prev.map(f => f.file === file ? { ...f, id: result.id, uploading: false } : f));
      } else {
        setPendingFiles(prev => prev.filter(f => f.file !== file));
      }
    }
  }

  async function handleSend() {
    const text = input.trim();
    const ready = pendingFiles.filter(f => !f.uploading && f.id != null);
    if (pendingFiles.some(f => f.uploading) || (!text && ready.length === 0)) return;
    setInput('');
    setPendingFiles([]);
    const attachmentIds = ready.map(f => f.id!);
    const optimistic: ApiDmMessage = {
      id: `opt-${Date.now()}`,
      from: myBeam,
      to: beamIdentity,
      content: text,
      created_at: Date.now() / 1000,
    };
    setMessages(prev => [...prev, optimistic]);
    await sendDM(beamIdentity, text, attachmentIds);
  }

  function onEmojiClick(data: EmojiClickData) {
    const el = inputRef.current;
    if (!el) { setInput(prev => prev + data.emoji); return; }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    const next = input.slice(0, start) + data.emoji + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + data.emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function handleGifSelect(gifUrl: string) {
    setGifOpen(false);
    const optimistic: ApiDmMessage = {
      id: `opt-${Date.now()}`,
      from: myBeam,
      to: beamIdentity,
      content: gifUrl,
      created_at: Date.now() / 1000,
    };
    setMessages(prev => [...prev, optimistic]);
    sendDM(beamIdentity, gifUrl);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const emojiMatch = textBefore.match(/:([a-z0-9_+\-]{1,30})$/);
    if (emojiMatch) {
      setEmojiQuery(emojiMatch[1]);
      setEmojiIdx(0);
    } else {
      setEmojiQuery(null);
    }
  }

  function completeEmojiShortcode(entry: EmojiEntry) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const textBefore = input.slice(0, cursor);
    const emojiMatch = textBefore.match(/:([a-z0-9_+\-]{1,30})$/);
    if (!emojiMatch) return;
    const start = cursor - emojiMatch[0].length;
    const newInput = input.slice(0, start) + entry.e + ' ' + input.slice(cursor);
    setInput(newInput);
    setEmojiQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + [...entry.e].length + 1;
      el?.setSelectionRange(pos, pos);
    });
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (emojiQuery !== null && emojiMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setEmojiIdx(i => (i + 1) % emojiMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setEmojiIdx(i => (i - 1 + emojiMatches.length) % emojiMatches.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); completeEmojiShortcode(emojiMatches[emojiIdx]); return; }
      if (e.key === 'Escape') { setEmojiQuery(null); return; }
    }
    if (e.key === 'Enter') handleSend();
  }

  // End any active call when the conversation partner changes.
  useEffect(() => {
    return () => {
      if (callStatusRef.current !== 'idle') {
        wsRef.current?.send(JSON.stringify({ type: 'dm_call_end', to: beamIdentity }));
        leaveVoice();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beamIdentity]);

  function startCall() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'dm_call_invite', to: beamIdentity }));
    setCall('ringing-out');
  }

  async function acceptCall() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'dm_call_answer', to: beamIdentity, accepted: true }));
    const fakeChannel: ApiChannel = { id: `dm:${beamIdentity}`, name: displayName, type: 'voice' };
    await joinVoice(fakeChannel, dmVoiceSendFn);
    setCall('connected');
  }

  function declineCall() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'dm_call_answer', to: beamIdentity, accepted: false }));
    setCall('idle');
  }

  async function endCall() {
    wsRef.current?.send(JSON.stringify({ type: 'dm_call_end', to: beamIdentity }));
    await leaveVoice();
    setCall('idle');
  }

  function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightText(text: string, query: string) {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
    return parts.map((part, idx) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={idx} className={styles.searchHighlight}>{part}</mark>
        : part
    );
  }

  function goSearchNext() {
    if (searchMatches.length === 0) return;
    setSearchIdx(i => (i + 1) % searchMatches.length);
  }

  function goSearchPrev() {
    if (searchMatches.length === 0) return;
    setSearchIdx(i => (i - 1 + searchMatches.length) % searchMatches.length);
  }

  function openSearch() {
    setSearchOpen(true);
    setSearchQuery('');
    setSearchIdx(0);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIdx(0);
  }

  return (
    <div className={styles.dmPanelOuter}>
    <div className={styles.dmPanel}>
      <div className={styles.dmHeader}>
        <UserAvatar name={displayName} size={28} />
        <span className={styles.dmHeaderName}>{displayName}</span>
        <span className={styles.dmHeaderSep}>—</span>
        <span className={styles.dmHeaderBeam}>{beamIdentity}</span>
        <button
          className={`${styles.dmHeaderIconBtn} ${searchOpen ? styles.dmHeaderIconBtnActive : ''}`}
          title="Search in conversation"
          onClick={openSearch}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <button
          className={`${styles.dmHeaderIconBtn} ${callStatus !== 'idle' ? styles.dmHeaderIconBtnCall : ''}`}
          title={callStatus === 'connected' ? `In call with ${displayName}` : `Voice call`}
          onClick={callStatus === 'idle' ? startCall : callStatus === 'connected' ? endCall : undefined}
          disabled={callStatus === 'ringing-out' || callStatus === 'ringing-in'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.57 3.4 2 2 0 0 1 3.54 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.88-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.28 16l.64.92z"/>
          </svg>
        </button>
        <button
          className={`${styles.dmHeaderIconBtn} ${profileOpen ? styles.dmHeaderIconBtnActive : ''}`}
          title={profileOpen ? 'Hide profile' : 'Show profile'}
          onClick={() => setProfileOpen(o => !o)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
      </div>

      {searchOpen && (
        <div className={styles.dmSearchBar}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.dmSearchIcon}>
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchInputRef}
            className={styles.dmSearchInput}
            placeholder="Search messages…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchIdx(0); }}
            onKeyDown={e => {
              if (e.key === 'Escape') closeSearch();
              if (e.key === 'Enter') { e.shiftKey ? goSearchPrev() : goSearchNext(); }
            }}
          />
          {searchQuery && (
            <span className={styles.dmSearchCount}>
              {searchMatches.length > 0 ? `${searchIdx + 1} / ${searchMatches.length}` : 'No results'}
            </span>
          )}
          <button className={styles.dmSearchNav} onClick={goSearchPrev} disabled={searchMatches.length === 0} title="Previous (Shift+Enter)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
          <button className={styles.dmSearchNav} onClick={goSearchNext} disabled={searchMatches.length === 0} title="Next (Enter)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <button className={styles.dmSearchClose} onClick={closeSearch} title="Close search">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Outgoing call / in-call bar ─────────────────────────────────── */}
      {(callStatus === 'ringing-out' || callStatus === 'connected') && (
        <div className={`${styles.dmCallBar} ${callStatus === 'connected' ? styles.dmCallBarActive : ''}`}>
          {callStatus === 'ringing-out' && (
            <>
              <span className={styles.dmCallBarPulse} />
              <span className={styles.dmCallBarLabel}>Calling {displayName}…</span>
              <button className={styles.dmCallEndBtn} onClick={endCall} title="Cancel">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </>
          )}
          {callStatus === 'connected' && (
            <>
              <div className={styles.dmCallMicWrap}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {voiceState.isMuted
                    ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                    : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                  }
                </svg>
                <div className={styles.dmCallMicBar} style={{ width: `${voiceState.micLevel}%` }} />
              </div>
              <span className={styles.dmCallBarLabel}>
                {voiceState.status === 'connecting' ? 'Connecting…' : `In call · ${displayName}`}
              </span>
              <button
                className={`${styles.dmCallBtn} ${voiceState.isMuted ? styles.dmCallBtnMuted : ''}`}
                onClick={toggleMute}
                title={voiceState.isMuted ? 'Unmute' : 'Mute'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {voiceState.isMuted
                    ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                    : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                  }
                </svg>
              </button>
              <button className={styles.dmCallEndBtn} onClick={endCall} title="End call">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.45-3.45m-2.26-5.45A19.79 19.79 0 0 1 2.15 5.18 2 2 0 0 1 3.54 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5"/><line x1="23" y1="1" x2="1" y2="23"/>
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Incoming call overlay ─────────────────────────────────────────── */}
      {callStatus === 'ringing-in' && (
        <div className={styles.dmIncomingCall}>
          <UserAvatar name={displayName} size={52} />
          <div className={styles.dmIncomingName}>{displayName}</div>
          <div className={styles.dmIncomingHint}>Incoming voice call</div>
          <div className={styles.dmIncomingActions}>
            <button className={styles.dmAcceptBtn} onClick={acceptCall}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.57 3.4 2 2 0 0 1 3.54 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.88-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Accept
            </button>
            <button className={styles.dmDeclineBtn} onClick={declineCall}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.45-3.45m-2.26-5.45A19.79 19.79 0 0 1 2.15 5.18 2 2 0 0 1 3.54 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5"/><line x1="23" y1="1" x2="1" y2="23"/>
              </svg>
              Decline
            </button>
          </div>
        </div>
      )}

      <div className={styles.dmMessages} ref={messagesRef}>
        {loading && <div className={styles.emptyState}>Loading…</div>}
        {!loading && messages.length === 0 && (
          <div className={styles.dmEmptyConv}>
            <UserAvatar name={displayName} size={64} />
            <div className={styles.dmEmptyName}>{displayName}</div>
            <div className={styles.dmEmptyHint}>Start your conversation with {displayName}.</div>
          </div>
        )}
        {annotated.map((msg, i) => {
          const isMine = msg.from === myBeam;
          const isCurrentMatch = searchMatches.length > 0 && searchMatches[searchIdx] === i;
          const isMatch = searchMatches.includes(i);
          return (
            <Fragment key={String(msg.id)}>
              {msg.newDay && (
                <div className={styles.dateDivider}>
                  <span>{formatDateLabel(msg.created_at)}</span>
                </div>
              )}
              <div
                className={`${styles.msgRow} ${!msg.isFirst ? styles.msgGrouped : ''} ${isCurrentMatch ? styles.msgMatchCurrent : isMatch ? styles.msgMatchHighlight : ''}`}
                data-msgrow={i}
              >
                <div className={styles.msgAvatarCol}>
                  {msg.isFirst && <UserAvatar name={msg.from} size={40} />}
                </div>
                <div className={styles.msgContent}>
                  {msg.isFirst && (
                    <div className={styles.msgHeader}>
                      <span className={`${styles.msgAuthor} ${isMine ? styles.msgAuthorMine : ''}`}>
                        {isMine ? (myBeam || 'You') : msg.from}
                      </span>
                      <span className={styles.msgTs}>{formatTs(msg.created_at)}</span>
                    </div>
                  )}
                  {isGifUrl(msg.content)
                    ? <img src={msg.content} alt="GIF" className={styles.dmAttachImg} />
                    : msg.content && <div className={styles.msgText}>{highlightText(msg.content, searchQuery)}</div>
                  }
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className={styles.dmMsgAttachments}>
                      {msg.attachments.map(att => (
                        <DmAttachmentView key={String(att.id)} att={att} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className={styles.dmInputArea}>
        {emojiOpen && (
          <div className={styles.dmEmojiPickerWrap}>
            <EmojiPicker onEmojiClick={onEmojiClick} theme={emojiPickerTheme} lazyLoadEmojis height={380} width={320} />
          </div>
        )}
        {gifOpen && (
          <div className={styles.dmGifPickerWrap} ref={gifPickerRef}>
            <GiphyPicker onSelect={handleGifSelect} onClose={() => setGifOpen(false)} />
          </div>
        )}
{emojiQuery !== null && emojiMatches.length > 0 && (
          <div className={styles.dmEmojiShortcodeList}>
            <div className={styles.dmEmojiShortcodeHeader}>Emoji matching :{emojiQuery}</div>
            {emojiMatches.map((entry, i) => (
              <button
                key={entry.n}
                className={`${styles.dmEmojiShortcodeItem} ${i === emojiIdx ? styles.dmEmojiShortcodeItemActive : ''}`}
                onMouseDown={e => { e.preventDefault(); completeEmojiShortcode(entry); }}
              >
                <span className={styles.dmEmojiShortcodeGlyph}>{entry.e}</span>
                <span className={styles.dmEmojiShortcodeName}>:{entry.n}:</span>
              </button>
            ))}
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className={styles.dmAttachPreviews}>
            {pendingFiles.map((pf, i) => (
              <div key={i} className={styles.dmAttachPreview}>
                {pf.previewUrl && <img src={pf.previewUrl} alt={pf.file.name} className={styles.dmAttachThumb} />}
                <span className={styles.dmAttachName}>{pf.file.name}</span>
                {pf.uploading
                  ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>uploading…</span>
                  : <button className={styles.dmAttachRemove} onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}>×</button>
                }
              </div>
            ))}
          </div>
        )}
        <div className={styles.dmInputCapsule}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button className={styles.dmActBtn} onClick={() => fileInputRef.current?.click()} title="Attach file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </button>
          <input ref={inputRef} type="text" className={styles.dmInput}
            placeholder={`Message ${displayName}`}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={() => setTimeout(() => setEmojiQuery(null), 150)}
            autoComplete="off"
          />
          <button ref={emojiBtnRef} className={`${styles.dmActBtn} ${emojiOpen ? styles.dmActBtnActive : ''}`}
            onClick={() => { setEmojiOpen(o => !o); setGifOpen(false); }} title="Emoji">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
          <button ref={gifBtnRef} className={`${styles.dmActBtn} ${gifOpen ? styles.dmActBtnActive : ''}`}
            onClick={() => { setGifOpen(o => !o); setEmojiOpen(false); }} title="GIF">
            <span className={styles.dmGifLabel}>GIF</span>
          </button>
          <button className={`${styles.dmActBtn} ${styles.dmSendBtn}`} onClick={handleSend} disabled={!canSend}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(45)">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    {profileOpen && (
      <div className={styles.dmProfileSidebar}>
        <div className={styles.dmProfileBanner} />
        <div className={styles.dmProfileBody}>
          <div className={styles.dmProfileAvatarWrap}>
            <UserAvatar name={displayName} size={86} radius={23} />
          </div>
          <div className={styles.dmProfileName}>{displayName}</div>
          <div className={styles.dmProfileBeam}>{beamIdentity}</div>
          <div className={styles.dmProfileDivider} />
          <div className={styles.dmProfileSection}>
            <div className={styles.dmProfileSectionTitle}>Beam Identity</div>
            <div className={styles.dmProfileSectionValue}>{beamIdentity}</div>
          </div>
        </div>
      </div>
    )}
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
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

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
                <div className={`${styles.statusDot} ${styles[statusClass(f.status)]}`} />
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
                  confirmRemove === f.beam_identity ? (
                    <div className={styles.confirmInline}>
                      <span>Unfriend?</span>
                      <button className={`${styles.actionBtn} ${styles.actionBtnAccept}`} style={{ color: 'var(--text-2)' }} onClick={() => setConfirmRemove(null)}>Cancel</button>
                      <button className={styles.actionBtn} style={{ color: 'var(--red)' }} disabled={removing === f.beam_identity} onClick={() => { handleRemove(f.id, f.beam_identity); setConfirmRemove(null); }}>Yes</button>
                    </div>
                  ) : (
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      title="Remove friend"
                      disabled={removing === f.beam_identity}
                      onClick={() => setConfirmRemove(f.beam_identity)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <line x1="22" y1="18" x2="16" y2="18"/>
                      </svg>
                    </button>
                  )
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
  status?: string;
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
  const [search, setSearch] = useState('');

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
            <div className={styles.dmConvAvatarWrap}>
              <UserAvatar name={c.displayName} avatarId={c.avatarId} size={34} />
              <div className={`${styles.dmConvDot} ${styles[statusClass(c.status)]}`} />
            </div>
            <div className={styles.convInfo}>
              <div className={styles.convName}>{c.displayName}</div>
              {c.lastSnippet && (
                <div className={styles.convSnippet}>{c.lastSnippet}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer: VC bar (when active) + shared user card */}
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
        <UserFooter />
      </div>
    </div>
  );
}

// ── Main HomeView ──────────────────────────────────────────────────────────────

export default function HomeView({ onOpenAccount, onAddServer, voiceChannel, onLeaveVoice, voiceMuted, voiceDeafened, onToggleMute, onToggleDeafen }: Props) {
  const [panel, setPanel] = useState<Panel>('friends');
  const [friends, setFriends] = useState<ApiFriend[]>([]);
  const [requests, setRequests] = useState<ApiFriendRequest[]>([]);
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  // useDmWebSocket: auto-reconnects; sends { type:"auth", token } as the first
  // WebSocket frame (never in the URL) and waits for the token before connecting.
  const dmWs = useDmWebSocket(true);
  const { notifyDm, notifyFriendRequest } = useNotifications();
  const knownRequestIdsRef = useRef<Set<string | number> | null>(null);

  // Build DM conversation list from friends list
  useEffect(() => {
    const convs: DmConversation[] = friends.map(f => ({
      beamIdentity: f.beam_identity,
      displayName: f.display_name || f.beam_identity,
      avatarId: f.avatar_attachment_id != null ? String(f.avatar_attachment_id) : null,
      status: f.status,
    }));
    setConversations(convs);
  }, [friends]);

  const loadFriends = useCallback(async () => {
    const [fr, rq] = await Promise.all([fetchFriends(), fetchFriendRequests()]);
    fr.forEach(f => {
      if (f.avatar_attachment_id != null) setAvatarCache(f.beam_identity, String(f.avatar_attachment_id));
    });
    const incoming = rq.filter(r => r.direction === 'incoming' || !r.direction);
    const notifiedIds = getNotifiedFrIds();

    if (knownRequestIdsRef.current === null) {
      // First load — notify for any request not previously notified, then seed
      knownRequestIdsRef.current = new Set(rq.map(r => r.id));
      incoming.forEach(req => {
        if (!notifiedIds.has(String(req.id))) {
          const name = req.display_name || req.from_beam || req.beam_identity || 'Someone';
          notifyFriendRequest(name);
          markFrNotified(req.id);
        }
      });
    } else {
      // Subsequent polls — notify for any genuinely new incoming requests
      incoming.forEach(req => {
        if (!knownRequestIdsRef.current!.has(req.id)) {
          const name = req.display_name || req.from_beam || req.beam_identity || 'Someone';
          notifyFriendRequest(name);
          markFrNotified(req.id);
        }
      });
      knownRequestIdsRef.current = new Set(rq.map(r => r.id));
    }
    setFriends(fr);
    setRequests(rq);
  }, [notifyFriendRequest]);

  // Initial load + poll every 30 s
  useEffect(() => {
    loadFriends();
    const id = setInterval(loadFriends, 30_000);
    return () => clearInterval(id);
  }, [loadFriends]);

  // Immediate refresh when the tab regains focus
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') loadFriends();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadFriends]);

  // Listen for incoming DMs on the shared WS to keep the conversation
  // sidebar up to date and fire desktop notifications.
  // DirectMessage has no "type" field — detect DMs by the presence of sender_beam.
  useEffect(() => {
    if (!dmWs) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string);
        const fromBeam: string = data.sender_beam ?? data.from ?? '';
        if (!fromBeam) return; // system / pong / sent messages have no sender
        setConversations(prev => {
          const exists = prev.some(c => c.beamIdentity === fromBeam);
          if (!exists) {
            return [{ beamIdentity: fromBeam, displayName: fromBeam, lastSnippet: data.content }, ...prev];
          }
          return prev.map(c =>
            c.beamIdentity === fromBeam
              ? { ...c, lastSnippet: data.content }
              : c
          );
        });
        notifyDm(fromBeam, data.content ?? '');
      } catch {
        // ignore parse errors
      }
    };
    dmWs.addEventListener('message', handler);
    return () => dmWs.removeEventListener('message', handler);
  }, [dmWs, notifyDm]);

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
        voiceMuted={voiceMuted}
        voiceDeafened={voiceDeafened}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
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
