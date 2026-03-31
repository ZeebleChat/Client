import { useState, useRef, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import TenorPicker from './TenorPicker';
import UserPopup, { type UserPopupInfo, type UserPopupPos } from './UserPopup';
import VideoPlayer from './VideoPlayer';
import Lightbox from './Lightbox';
import type { ApiMessage } from '../api';
import { getRoleColor, uploadFile, getAttachmentUrl } from '../api';
import UserAvatar from './UserAvatar';
import { formatTime } from '../types';
import styles from './ChatMain.module.css';

marked.setOptions({ gfm: true, breaks: true });

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text) as string, { USE_PROFILES: { html: true } });
}

function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return <div className={styles.msgText} dangerouslySetInnerHTML={{ __html: html }} />;
}

function getEmojiPickerTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? Theme.LIGHT : Theme.DARK;
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
  loading?: boolean;
  roleMap?: Record<string, string | null | undefined>;
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

function MessageRow({ msg, onUserClick, roleMap }: { msg: ApiMessage & { _optimistic?: boolean }; onUserClick: (e: React.MouseEvent, name: string) => void; roleMap?: Record<string, string | null | undefined> }) {
  const color = getUserColor(msg.beam_identity, roleMap);
  return (
    <div className={`${styles.msgRow} ${msg._optimistic ? styles.optimistic : ''}`}>
      <button className={styles.msgAvBtn} onClick={e => onUserClick(e, msg.beam_identity)}>
        <UserAvatar name={msg.beam_identity} size={36} radius={12} color={color} className={styles.msgAv} />
      </button>
      <div className={styles.msgContent}>
        <div className={styles.msgMeta}>
          <span className={styles.msgName} style={{ color, cursor: 'pointer' }} onClick={e => onUserClick(e, msg.beam_identity)}>
            {msg.beam_identity.split('»')[0] || msg.beam_identity}
          </span>
          <span className={styles.msgTime}>{formatTime(msg.created_at)}</span>
          {msg.edited_at && <span className={styles.edited}>(edited)</span>}
        </div>
        {msg.content && (
          isGifUrl(msg.content)
            ? <InlineImage src={msg.content} alt="GIF" />
            : <MarkdownContent content={msg.content} />
        )}
        {msg.attachments && msg.attachments.length > 0 && (
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

export default function ChatMain({ channelName, channelId, messages, onSend, loading, roleMap }: Props) {
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPickerTheme, setEmojiPickerTheme] = useState(() => getEmojiPickerTheme());
  const [gifOpen, setGifOpen] = useState(false);
  const [userPopup, setUserPopup] = useState<{ user: UserPopupInfo; pos: UserPopupPos } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const gifBtnRef = useRef<HTMLButtonElement>(null);
  const gifPickerRef = useRef<HTMLDivElement>(null);

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

    onSend(text, readyIds.length > 0 ? readyIds : undefined);
    pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setPendingFiles([]);
    setInput('');
  }

  const canSend = !!channelId && (input.trim().length > 0 || pendingFiles.some(f => !f.uploading && f.id != null));

  function handleUserClick(e: React.MouseEvent, name: string) {
    setUserPopup({ user: { name }, pos: { x: e.clientX, y: e.clientY } });
  }

  return (
    <main className={styles.main}>
      <div className={styles.chatHeader}>
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
          <MessageRow key={msg.id} msg={msg} onUserClick={handleUserClick} roleMap={roleMap} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        {emojiOpen && (
          <div className={styles.emojiPickerWrap}>
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
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
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
