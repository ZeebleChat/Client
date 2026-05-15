import { useState, useRef, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import TenorPicker from './TenorPicker';
import UserPopup, { type UserPopupInfo, type UserPopupPos } from './UserPopup';
import VideoPlayer from './VideoPlayer';
import Lightbox from './Lightbox';
import type { ApiMessage, ApiEditHistoryEntry } from '../api';
import { getRoleColor, uploadFile, getAttachmentUrl, editMessage, deleteMessage, fetchMessageHistory } from '../api';
import { getBeamIdentity } from '../auth';
import UserAvatar from './UserAvatar';
import { formatTime } from '../types';
import styles from './ChatMain.module.css';
import { searchEmojis, type EmojiEntry } from './emojiData';
import type { EmojiManifest, EmojiEntry as PackEmojiEntry } from '../resourcePack';

marked.setOptions({ gfm: true, breaks: true });

function injectMentionHighlights(html: string, myName: string): string {
  const myBase = myName?.split('»')[0]?.trim() ?? '';
  const parts = html.split(/(<\/?(?:code|pre)[^>]*>)/);
  let depth = 0;
  // Match @display name»hash (spaces allowed before ») OR @singleword
  const mentionRe = /@((?:[^\s»@<]+\s)*[^\s»@<]+»[a-zA-Z0-9]+|[^\s»@<]+)/g;
  return parts.map(part => {
    if (/^<(?:code|pre)/.test(part)) { depth++; return part; }
    if (/^<\/(?:code|pre)/.test(part)) { depth--; return part; }
    if (depth > 0) return part;
    return part.replace(mentionRe, (_match, name) => {
      const base = name.split('»')[0].trim();
      const cls = base === myBase && myBase ? 'zbl-mention zbl-mention-me' : 'zbl-mention';
      return `<span class="${cls}">@${name}</span>`;
    });
  }).join('');
}

function expandPackEmojis(text: string, emojis: PackEmojiEntry[], baseUrl: string): string {
  if (!emojis.length) return text;
  const map = new Map(emojis.map(e => [e.shortcode, e]));
  return text.replace(/:([a-z0-9_+\-]{1,40}):/g, (match, code) => {
    const entry = map.get(code);
    if (!entry) return match;
    const src = baseUrl + entry.file;
    return `<img src="${src}" alt=":${entry.shortcode}:" class="pack-emoji" title=":${entry.shortcode}:" loading="eager" />`;
  });
}

function renderMarkdown(text: string, myIdentity?: string, packEmojis?: PackEmojiEntry[], packBaseUrl?: string): string {
  const expanded = packEmojis?.length ? expandPackEmojis(text, packEmojis, packBaseUrl!) : text;
  const md = marked.parse(expanded) as string;
  const withMentions = myIdentity ? injectMentionHighlights(md, myIdentity) : md;
  return DOMPurify.sanitize(withMentions, { USE_PROFILES: { html: true } });
}

function MarkdownContent({ content, myIdentity, packEmojis, packBaseUrl }: {
  content: string;
  myIdentity?: string;
  packEmojis?: PackEmojiEntry[];
  packBaseUrl?: string;
}) {
  const html = useMemo(
    () => renderMarkdown(content, myIdentity, packEmojis, packBaseUrl),
    [content, myIdentity, packEmojis, packBaseUrl],
  );
  return <div className={styles.msgText} dangerouslySetInnerHTML={{ __html: html }} />;
}

function getEmojiPickerTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? Theme.LIGHT : Theme.DARK;
}

function emojiOnlyCount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Strip ZWJ, variation selectors, skin tone modifiers, whitespace
  const stripped = trimmed.replace(/[\s\u200d\ufe0f\u20e3\u{1f3fb}-\u{1f3ff}]/gu, '');
  if (!stripped || !/^\p{Extended_Pictographic}+$/u.test(stripped)) return null;
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const count = [...seg.segment(trimmed)].filter(s => s.segment.trim().length > 0).length;
    return count;
  } catch {
    return 1;
  }
}

function isGifUrl(content: string): boolean {
  const s = content.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/\s/.test(s)) return false;
  return /tenor\.com|giphy\.com|\.gif(\?|$)/i.test(s);
}

interface Props {
  channelName: string;
  channelId: string | number | null;
  messages: ApiMessage[];
  onSend: (content: string, attachmentIds?: (string | number)[]) => void;
  onReply: (content: string, replyTo: string | number, attachmentIds?: (string | number)[]) => void;
  loading?: boolean;
  roleMap?: Record<string, string | null | undefined>;
  onOpenSidebar?: () => void;
  emojiManifest?: EmojiManifest;
  packBaseUrl?: string;
}

function getUserColor(beamIdentity: string, roleMap?: Record<string, string | null | undefined>): string {
  return getRoleColor(roleMap?.[beamIdentity]);
}

function InlineImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img src={src} alt={alt} className={styles.attachImg} onClick={() => setOpen(true)} style={{ cursor: 'zoom-in' }} />
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function AttachmentView({ att }: { att: NonNullable<ApiMessage['attachments']>[number] }) {
  const url = getAttachmentUrl(att.id);
  const ct = att.content_type ?? '';
  const fname = att.filename ?? '';
  const isImage = ct.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fname);
  const isVideo = ct.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(fname);
  const isAudio = ct.startsWith('audio/') || /\.(mp3|ogg|wav|flac|m4a)$/i.test(fname);

  if (isImage) return <InlineImage src={url} alt={fname || 'attachment'} />;
  if (isVideo) return <VideoPlayer src={url} className={styles.attachVideo} />;
  if (isAudio) return <audio src={url} controls className={styles.attachAudio} preload="metadata" />;

  const kb = att.size ? ` · ${(att.size / 1024).toFixed(1)} KB` : '';
  return (
    <a href={url} target="_blank" rel="noreferrer" className={styles.attachFile}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>{fname || 'file'}{kb}</span>
    </a>
  );
}

interface HistoryState {
  entries: ApiEditHistoryEntry[];
  viewIdx: number;
  open: boolean;
}

interface MessageRowProps {
  msg: ApiMessage & { _optimistic?: boolean };
  onUserClick: (e: React.MouseEvent, name: string) => void;
  roleMap?: Record<string, string | null | undefined>;
  isMyMsg: boolean;
  isEditing: boolean;
  editValue: string;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
  onEditChange: (v: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
  historyState?: HistoryState;
  onHistoryToggle: () => void;
  onHistoryNav: (dir: -1 | 1) => void;
  replyMsg?: ApiMessage | null;
  myIdentity?: string;
  packEmojis?: PackEmojiEntry[];
  packBaseUrl?: string;
}

function MessageRow({
  msg, onUserClick, roleMap,
  isMyMsg, isEditing, editValue, editInputRef, onEditChange, onEditKeyDown,
  onStartEdit, onDelete, onReply, historyState, onHistoryToggle, onHistoryNav, replyMsg, myIdentity,
  packEmojis, packBaseUrl,
}: MessageRowProps) {
  const color = getUserColor(msg.beam_identity, roleMap);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const viewingHistory = historyState?.open && historyState.viewIdx < historyState.entries.length;
  const histEntries = historyState?.entries ?? [];
  const histIdx = historyState?.viewIdx ?? histEntries.length;
  const totalVersions = histEntries.length + 1;

  const hasActions = !msg._optimistic;

  return (
    <div className={`${styles.msgRow} ${msg._optimistic ? styles.optimistic : ''} ${isEditing ? styles.editingRow : ''}`}>
      <button className={styles.msgAvBtn} onClick={e => onUserClick(e, msg.beam_identity)}>
        <UserAvatar name={msg.beam_identity} size={36} radius={12} color={color} className={styles.msgAv} />
      </button>
      <div className={styles.msgContent}>
      {hasActions && !isEditing && (
        <div className={styles.msgActions} ref={dropdownRef}>
          <button
            className={styles.msgActionsBtn}
            onClick={() => setDropdownOpen(o => !o)}
            title="Message actions"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
          {dropdownOpen && (
            <div className={styles.msgDropdown}>
              <button className={styles.msgDropdownItem} onClick={() => { setDropdownOpen(false); onReply(); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 17 4 12 9 7"/>
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                </svg>
                Reply
              </button>
              {isMyMsg && (
                <button className={styles.msgDropdownItem} onClick={() => { setDropdownOpen(false); onStartEdit(); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit message
                </button>
              )}
              {msg.edited_at && (
                <button className={styles.msgDropdownItem} onClick={() => { setDropdownOpen(false); onHistoryToggle(); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                  </svg>
                  Edit history
                </button>
              )}
              {isMyMsg && (
                <button className={`${styles.msgDropdownItem} ${styles.msgDropdownItemDanger}`} onClick={() => { setDropdownOpen(false); onDelete(); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  Delete message
                </button>
              )}
            </div>
          )}
        </div>
      )}
        <div className={styles.msgMeta}>
          <span className={styles.msgName} style={{ color, cursor: 'pointer' }} onClick={e => onUserClick(e, msg.beam_identity)}>
            {msg.beam_identity.split('»')[0] || msg.beam_identity}
          </span>
          <span className={styles.msgTime}>{formatTime(msg.created_at)}</span>
          {msg.edited_at && !isEditing && (
            <button className={styles.editedBtn} onClick={onHistoryToggle} title="View edit history">
              (edited)
            </button>
          )}
          {historyState?.open && histEntries.length > 0 && !isEditing && (
            <span className={styles.historyNav}>
              <button
                className={styles.historyArrow}
                onClick={() => onHistoryNav(-1)}
                disabled={histIdx === 0}
                title="Older version"
              >‹</button>
              <span className={styles.historyLabel}>
                {histIdx < histEntries.length
                  ? `v${histIdx + 1}/${totalVersions}`
                  : 'current'}
              </span>
              <button
                className={styles.historyArrow}
                onClick={() => onHistoryNav(1)}
                disabled={histIdx === histEntries.length}
                title="Newer version"
              >›</button>
            </span>
          )}
          {historyState?.open && histEntries.length === 0 && !isEditing && (
            <span className={styles.historyLabel} style={{ marginLeft: 4 }}>no history</span>
          )}
        </div>

        {replyMsg && !isEditing && (
          <div className={styles.replyPreview}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}>
              <polyline points="9 17 4 12 9 7"/>
              <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
            <span className={styles.replyPreviewName}>{replyMsg.beam_identity.split('»')[0]}</span>
            <span className={styles.replyPreviewText}>
              {replyMsg.content ? replyMsg.content.slice(0, 80) + (replyMsg.content.length > 80 ? '…' : '') : '📎 attachment'}
            </span>
          </div>
        )}
        {msg.reply_to != null && !replyMsg && !isEditing && (
          <div className={styles.replyPreview}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}>
              <polyline points="9 17 4 12 9 7"/>
              <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
            <span className={styles.replyPreviewText} style={{ fontStyle: 'italic' }}>Original message not loaded</span>
          </div>
        )}

        {isEditing ? (
          <div className={styles.editRow}>
            <input
              ref={editInputRef}
              className={styles.editInput}
              value={editValue}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={onEditKeyDown}
              autoComplete="off"
            />
            <span className={styles.editHint}>
              <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to cancel
              {isMyMsg && <span> · editing your message</span>}
            </span>
          </div>
        ) : viewingHistory ? (
          <div className={styles.historyContent}>
            <MarkdownContent content={histEntries[histIdx].content} myIdentity={myIdentity} packEmojis={packEmojis} packBaseUrl={packBaseUrl} />
            <span className={styles.historyTimestamp}>
              {new Date(histEntries[histIdx].edited_at * 1000).toLocaleString()}
            </span>
          </div>
        ) : (
          msg.content && (() => {
            if (isGifUrl(msg.content)) return <InlineImage src={msg.content} alt="GIF" />;
            const ec = emojiOnlyCount(msg.content);
            if (ec !== null && ec <= 5) {
              const cls = ec <= 2 ? styles.jumboEmoji : styles.jumboEmojiSm;
              return <span className={cls}>{msg.content}</span>;
            }
            return <MarkdownContent content={msg.content} myIdentity={myIdentity} packEmojis={packEmojis} packBaseUrl={packBaseUrl} />;
          })()
        )}

        {!isEditing && !viewingHistory && msg.attachments && msg.attachments.length > 0 && (
          <div className={styles.attachments}>
            {msg.attachments.map(att => <AttachmentView key={String(att.id)} att={att} />)}
          </div>
        )}
      </div>
    </div>
  );
}

interface PendingFile {
  file: File;
  id?: string | number;
  uploading: boolean;
  previewUrl?: string;
}

export default function ChatMain({ channelName, channelId, messages, onSend, onReply, loading, roleMap, onOpenSidebar, emojiManifest, packBaseUrl }: Props) {
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPickerTheme, setEmojiPickerTheme] = useState(() => getEmojiPickerTheme());
  const [gifOpen, setGifOpen] = useState(false);
  const [userPopup, setUserPopup] = useState<{ user: UserPopupInfo; pos: UserPopupPos } | null>(null);
  const [replyingTo, setReplyingTo] = useState<(ApiMessage & { _optimistic?: boolean }) | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiIdx, setEmojiIdx] = useState(0);

  // Edit mode state
  const [editingMsgId, setEditingMsgId] = useState<string | number | null>(null);
  const [editInput, setEditInput] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // History viewer state: msgId → HistoryState
  const [historyMap, setHistoryMap] = useState<Record<string | number, HistoryState>>({});

  const myIdentity = getBeamIdentity();

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const gifBtnRef = useRef<HTMLButtonElement>(null);
  const gifPickerRef = useRef<HTMLDivElement>(null);

  const memberNames = useMemo(() => Object.keys(roleMap ?? {}), [roleMap]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return memberNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQuery, memberNames]);

  const packEmojiEntries = emojiManifest?.emojis ?? [];

  const standardEmojiMatches = useMemo<EmojiEntry[]>(() => {
    if (emojiQuery === null || emojiQuery.length < 1) return [];
    return searchEmojis(emojiQuery, 8);
  }, [emojiQuery]);

  const packEmojiMatches = useMemo<PackEmojiEntry[]>(() => {
    if (emojiQuery === null || emojiQuery.length < 1 || !packEmojiEntries.length) return [];
    const q = emojiQuery.toLowerCase();
    return packEmojiEntries.filter(e =>
      e.shortcode.includes(q) || e.name.toLowerCase().includes(q) || e.tags?.some(t => t.includes(q))
    ).slice(0, 6);
  }, [emojiQuery, packEmojiEntries]);

  const allEmojiMatches = useMemo(() => [
    ...standardEmojiMatches.map(e => ({ kind: 'standard' as const, entry: e })),
    ...packEmojiMatches.map(e => ({ kind: 'pack' as const, entry: e })),
  ], [standardEmojiMatches, packEmojiMatches]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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

  // Focus edit input when edit mode starts
  useEffect(() => {
    if (editingMsgId !== null) {
      setTimeout(() => editInputRef.current?.focus(), 30);
    }
  }, [editingMsgId]);

  function handleGifSelect(gifUrl: string) {
    setGifOpen(false);
    if (!channelId) return;
    onSend(gifUrl);
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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    inputRef.current?.focus();
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    const entry: PendingFile = { file, uploading: true, previewUrl };
    setPendingFiles(prev => [...prev, entry]);
    const result = await uploadFile(file);
    if (result.ok && result.id != null) {
      setPendingFiles(prev => prev.map(f => f.file === file ? { ...f, id: result.id, uploading: false } : f));
    } else {
      setPendingFiles(prev => prev.filter(f => f.file !== file));
    }
  }

  function removePending(file: File) {
    setPendingFiles(prev => {
      const entry = prev.find(f => f.file === file);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter(f => f.file !== file);
    });
  }

  function handleSend() {
    const text = input.trim();
    const readyIds = pendingFiles.filter(f => !f.uploading && f.id != null).map(f => f.id!);
    const stillUploading = pendingFiles.some(f => f.uploading);
    if (stillUploading || (!text && readyIds.length === 0) || !channelId) return;

    if (replyingTo) {
      onReply(text, replyingTo.id, readyIds.length > 0 ? readyIds : undefined);
      setReplyingTo(null);
    } else {
      onSend(text, readyIds.length > 0 ? readyIds : undefined);
    }
    pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setPendingFiles([]);
    setInput('');
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    // @mention detection
    const atMatch = textBefore.match(/@([^@]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIdx(0);
    } else {
      setMentionQuery(null);
    }
    // :emoji shortcode detection — only trigger after at least 1 char after colon
    const emojiMatch = textBefore.match(/:([a-z0-9_+\-]{1,30})$/);
    if (emojiMatch) {
      setEmojiQuery(emojiMatch[1]);
      setEmojiIdx(0);
    } else {
      setEmojiQuery(null);
    }
  }

  function completeMention(name: string) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const textBefore = input.slice(0, cursor);
    const atMatch = textBefore.match(/@([^@]*)$/);
    if (!atMatch) return;
    const start = cursor - atMatch[0].length;
    const newInput = input.slice(0, start) + '@' + name + ' ' + input.slice(cursor);
    setInput(newInput);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + name.length + 2;
      el?.setSelectionRange(pos, pos);
    });
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

  function completePackEmoji(entry: PackEmojiEntry) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const textBefore = input.slice(0, cursor);
    const emojiMatch = textBefore.match(/:([a-z0-9_+\-]{1,30})$/);
    const token = `:${entry.shortcode}: `;
    const start = emojiMatch ? cursor - emojiMatch[0].length : cursor;
    const newInput = input.slice(0, start) + token + input.slice(cursor);
    setInput(newInput);
    setEmojiQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + token.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function insertPackEmoji(entry: PackEmojiEntry) {
    const token = `:${entry.shortcode}: `;
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const newInput = input.slice(0, cursor) + token + input.slice(cursor);
    setInput(newInput);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = cursor + token.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(msgId: string | number) {
    await deleteMessage(msgId);
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────

  function startEdit(msg: ApiMessage & { _optimistic?: boolean }) {
    if (msg._optimistic) return;
    setEditingMsgId(msg.id);
    setEditInput(msg.content);
  }

  function cancelEdit() {
    setEditingMsgId(null);
    setEditInput('');
    inputRef.current?.focus();
  }

  async function submitEdit() {
    if (!editingMsgId || !editInput.trim()) { cancelEdit(); return; }
    const ok = await editMessage(editingMsgId, editInput.trim());
    if (ok) cancelEdit();
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { cancelEdit(); return; }
    if (e.key === 'Enter') { e.preventDefault(); submitEdit(); }
  }

  // ── Up arrow hotkey ───────────────────────────────────────────────────────

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (emojiQuery !== null && allEmojiMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setEmojiIdx(i => (i + 1) % allEmojiMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setEmojiIdx(i => (i - 1 + allEmojiMatches.length) % allEmojiMatches.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const match = allEmojiMatches[emojiIdx];
        if (match.kind === 'standard') completeEmojiShortcode(match.entry);
        else completePackEmoji(match.entry);
        return;
      }
      if (e.key === 'Escape') {
        setEmojiQuery(null);
        return;
      }
    }

    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx(i => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx(i => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && mentionMatches.length > 0)) {
        e.preventDefault();
        completeMention(mentionMatches[mentionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null);
      return;
    }

    if (e.key === 'Enter') { handleSend(); return; }
    if (e.key === 'ArrowUp' && !input) {
      const lastOwn = [...messages].reverse().find(
        m => m.beam_identity === myIdentity && !(m as ApiMessage & { _optimistic?: boolean })._optimistic
      );
      if (lastOwn) {
        e.preventDefault();
        startEdit(lastOwn);
      }
    }
  }

  // ── History viewer ────────────────────────────────────────────────────────

  async function handleHistoryToggle(msgId: string | number) {
    const existing = historyMap[msgId];
    if (existing?.open) {
      setHistoryMap(prev => ({ ...prev, [msgId]: { ...existing, open: false } }));
    } else {
      const entries = await fetchMessageHistory(msgId);
      setHistoryMap(prev => ({
        ...prev,
        [msgId]: { entries, viewIdx: entries.length, open: true },
      }));
    }
  }

  function handleHistoryNav(msgId: string | number, dir: -1 | 1) {
    setHistoryMap(prev => {
      const h = prev[msgId];
      if (!h) return prev;
      const newIdx = Math.max(0, Math.min(h.entries.length, h.viewIdx + dir));
      return { ...prev, [msgId]: { ...h, viewIdx: newIdx } };
    });
  }

  const canSend = !!channelId && (input.trim().length > 0 || pendingFiles.some(f => !f.uploading && f.id != null));

  function handleUserClick(e: React.MouseEvent, name: string) {
    setUserPopup({ user: { name }, pos: { x: e.clientX, y: e.clientY } });
  }

  // Build a lookup map for reply_to message references
  const messageById = useMemo(() => {
    const map: Record<string, ApiMessage> = {};
    for (const m of messages) map[String(m.id)] = m;
    return map;
  }, [messages]);

  return (
    <main className={styles.main}>
      <div className={styles.chatHeader}>
        <button className={styles.menuBtn} onClick={onOpenSidebar} aria-label="Open channels">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <svg className={styles.chatHash} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="4" y1="9" x2="20" y2="9"/>
          <line x1="4" y1="15" x2="20" y2="15"/>
          <line x1="10" y1="3" x2="8" y2="21"/>
          <line x1="16" y1="3" x2="14" y2="21"/>
        </svg>
        <div className={styles.chatTitle}>{channelName}</div>
        <div className={styles.headerTools}>
          <button className={styles.iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.messages}>
        {loading && <div className={styles.empty}>Loading messages…</div>}
        {!loading && messages.length === 0 && <div className={styles.empty}>No messages yet in #{channelName}.</div>}
        {!loading && messages.map(msg => (
          <MessageRow
            key={msg.id}
            msg={msg}
            onUserClick={handleUserClick}
            roleMap={roleMap}
            isMyMsg={msg.beam_identity === myIdentity}
            isEditing={editingMsgId !== null && String(editingMsgId) === String(msg.id)}
            editValue={editInput}
            editInputRef={editInputRef}
            onEditChange={setEditInput}
            onEditKeyDown={handleEditKeyDown}
            onStartEdit={() => startEdit(msg)}
            onDelete={() => handleDelete(msg.id)}
            onReply={() => { setReplyingTo(msg); setTimeout(() => inputRef.current?.focus(), 30); }}
            historyState={historyMap[msg.id]}
            onHistoryToggle={() => handleHistoryToggle(msg.id)}
            onHistoryNav={dir => handleHistoryNav(msg.id, dir)}
            replyMsg={msg.reply_to != null ? messageById[String(msg.reply_to)] ?? null : null}
            myIdentity={myIdentity}
            packEmojis={packEmojiEntries}
            packBaseUrl={packBaseUrl}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        {emojiOpen && (
          <div className={styles.emojiPickerWrap}>
            {packEmojiEntries.length > 0 && packBaseUrl && (
              <div className={styles.packEmojiSection}>
                <div className={styles.emojiShortcodeHeader}>{emojiManifest?.pack_name ?? 'Pack'} Emojis</div>
                <div className={styles.packEmojiGrid}>
                  {packEmojiEntries.map(entry => (
                    <button
                      key={entry.shortcode}
                      className={styles.packEmojiGridItem}
                      onClick={() => insertPackEmoji(entry)}
                      title={`:${entry.shortcode}:`}
                    >
                      <img src={packBaseUrl + entry.file} alt={entry.name} loading="eager" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <EmojiPicker onEmojiClick={onEmojiClick} theme={emojiPickerTheme} lazyLoadEmojis height={380} width={320} />
          </div>
        )}
        {gifOpen && (
          <div className={styles.gifPickerWrap} ref={gifPickerRef}>
            <TenorPicker onSelect={handleGifSelect} />
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className={styles.attachPreviews}>
            {pendingFiles.map((f, i) => (
              <div key={i} className={styles.attachPreview}>
                {f.previewUrl
                  ? <img src={f.previewUrl} className={styles.attachThumb} alt={f.file.name} />
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                }
                <span className={styles.attachName}>{f.uploading ? 'Uploading…' : f.file.name}</span>
                <button className={styles.attachRemove} onClick={() => removePending(f.file)}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {emojiQuery !== null && allEmojiMatches.length > 0 && (
          <div className={styles.emojiShortcodeList}>
            {standardEmojiMatches.length > 0 && (
              <>
                <div className={styles.emojiShortcodeHeader}>Emoji matching :{emojiQuery}</div>
                {standardEmojiMatches.map((entry, i) => (
                  <button
                    key={entry.n}
                    className={`${styles.emojiShortcodeItem} ${i === emojiIdx ? styles.emojiShortcodeItemActive : ''}`}
                    onMouseDown={e => { e.preventDefault(); completeEmojiShortcode(entry); }}
                  >
                    <span className={styles.emojiShortcodeGlyph}>{entry.e}</span>
                    <span className={styles.emojiShortcodeName}>:{entry.n}:</span>
                  </button>
                ))}
              </>
            )}
            {packEmojiMatches.length > 0 && (
              <>
                <div className={styles.emojiShortcodeHeader}>{emojiManifest?.pack_name ?? 'Pack'} Emojis</div>
                {packEmojiMatches.map((entry, i) => {
                  const globalIdx = standardEmojiMatches.length + i;
                  return (
                    <button
                      key={entry.shortcode}
                      className={`${styles.emojiShortcodeItem} ${globalIdx === emojiIdx ? styles.emojiShortcodeItemActive : ''}`}
                      onMouseDown={e => { e.preventDefault(); completePackEmoji(entry); }}
                    >
                      <span className={styles.emojiShortcodeGlyph}>
                        {packBaseUrl && <img src={packBaseUrl + entry.file} alt={entry.name} loading="eager" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                      </span>
                      <span className={styles.emojiShortcodeName}>:{entry.shortcode}:</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div className={styles.mentionList}>
            {mentionMatches.map((name, i) => (
              <button
                key={name}
                className={`${styles.mentionItem} ${i === mentionIdx ? styles.mentionItemActive : ''}`}
                onMouseDown={e => { e.preventDefault(); completeMention(name); }}
              >
                <UserAvatar name={name} size={22} radius={6} color={getUserColor(name, roleMap)} />
                <span>{name.split('»')[0]}</span>
              </button>
            ))}
          </div>
        )}

        {replyingTo && (
          <div className={styles.replyBanner}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 17 4 12 9 7"/>
              <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
            <span>Replying to </span>
            <span className={styles.replyBannerName}>{replyingTo.beam_identity.split('»')[0]}</span>
            <button className={styles.replyBannerClose} onClick={() => setReplyingTo(null)} title="Cancel reply">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        <div className={styles.inputCapsule}>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }}
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,application/pdf,text/plain,text/markdown,application/zip,application/x-zip-compressed"
            onChange={handleFileSelect} />
          <button className={styles.actBtn} onClick={() => fileInputRef.current?.click()} disabled={!channelId} title="Attach file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </button>
          <input ref={inputRef} type="text" className={styles.chatInput}
            placeholder={channelId ? `Message #${channelName}` : 'Select a channel'}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={() => setTimeout(() => { setMentionQuery(null); setEmojiQuery(null); }, 150)}
            autoComplete="off" disabled={!channelId} />
          <button ref={emojiBtnRef} className={`${styles.actBtn} ${emojiOpen ? styles.actBtnActive : ''}`}
            onClick={() => { setEmojiOpen(o => !o); setGifOpen(false); }} disabled={!channelId} title="Emoji">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
          <button ref={gifBtnRef} className={`${styles.actBtn} ${gifOpen ? styles.actBtnActive : ''}`}
            onClick={() => { setGifOpen(o => !o); setEmojiOpen(false); }} disabled={!channelId} title="GIF">
            <span className={styles.gifLabel}>GIF</span>
          </button>
          <button className={`${styles.actBtn} ${styles.sendBtn}`} onClick={handleSend} disabled={!canSend}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(45)">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
      </div>

      {userPopup && (
        <UserPopup user={userPopup.user} pos={userPopup.pos} onClose={() => setUserPopup(null)} />
      )}
    </main>
  );
}
