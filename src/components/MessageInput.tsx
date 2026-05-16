import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import TenorPicker from './TenorPicker';
import { uploadFile, getRoleColor } from '../api';
import UserAvatar from './UserAvatar';
import { searchEmojis, type EmojiEntry } from './emojiData';
import type { EmojiManifest, EmojiEntry as PackEmojiEntry } from '../resourcePack';
import styles from './MessageInput.module.css';

export interface MessageInputHandle {
  focus: () => void;
}

export interface StagedFile {
  id: string | number;
  filename: string;
  content_type: string;
  previewUrl?: string;
}

export interface MessageInputProps {
  placeholder: string;
  onSend: (text: string, attachmentIds?: (string | number)[], staged?: StagedFile[]) => void;
  disabled?: boolean;
  emojiManifest?: EmojiManifest | null;
  packBaseUrl?: string | null;
  memberNames?: string[];
  roleMap?: Record<string, string | null | undefined>;
  replyingTo?: { name: string } | null;
  onCancelReply?: () => void;
  onUpArrowEmpty?: () => void;
}

interface PendingFile {
  file: File;
  id?: string | number;
  uploading: boolean;
  previewUrl?: string;
}

function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? Theme.LIGHT : Theme.DARK;
}

const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput(
  { placeholder, onSend, disabled, emojiManifest, packBaseUrl, memberNames = [], roleMap, replyingTo, onCancelReply, onUpArrowEmpty },
  ref,
) {
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPickerTheme, setEmojiPickerTheme] = useState(getTheme);
  const [gifOpen, setGifOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiIdx, setEmojiIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const gifBtnRef = useRef<HTMLButtonElement>(null);
  const gifPickerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const packEmojiEntries = emojiManifest?.emojis ?? [];

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return memberNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQuery, memberNames]);

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

  useEffect(() => { if (emojiOpen) setEmojiPickerTheme(getTheme()); }, [emojiOpen]);

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

  async function uploadAndStage(file: File) {
    const previewUrl = file.type.startsWith('image/') || file.type.startsWith('video/')
      ? URL.createObjectURL(file) : undefined;
    const entry: PendingFile = { file, uploading: true, previewUrl };
    setPendingFiles(prev => [...prev, entry]);
    const result = await uploadFile(file);
    if (result.ok && result.id != null) {
      setPendingFiles(prev => prev.map(f => f.file === file ? { ...f, id: result.id, uploading: false } : f));
    } else {
      setPendingFiles(prev => prev.filter(f => f.file !== file));
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    inputRef.current?.focus();
    await uploadAndStage(file);
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const items = Array.from(e.clipboardData.items);
    const mediaItem = items.find(item => item.type.startsWith('image/') || item.type.startsWith('video/'));
    if (!mediaItem) return;
    e.preventDefault();
    const raw = mediaItem.getAsFile();
    if (!raw) return;
    const ext = mediaItem.type.split('/')[1] ?? 'png';
    const file = new File([raw], `paste-${Date.now()}.${ext}`, { type: mediaItem.type });
    await uploadAndStage(file);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    inputRef.current?.focus();
    await uploadAndStage(file);
  }

  function removePending(file: File) {
    setPendingFiles(prev => {
      const entry = prev.find(f => f.file === file);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter(f => f.file !== file);
    });
  }

  function doSend() {
    const text = input.trim();
    const ready = pendingFiles.filter(f => !f.uploading && f.id != null);
    const readyIds = ready.map(f => f.id!);
    if (pendingFiles.some(f => f.uploading) || (!text && readyIds.length === 0) || disabled) return;
    const staged: StagedFile[] = ready.map(f => ({
      id: f.id!,
      filename: f.file.name,
      content_type: f.file.type,
      previewUrl: f.previewUrl,
    }));
    // revoke after snapshot so caller can still use previewUrl
    setTimeout(() => pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); }), 5000);
    setPendingFiles([]);
    setInput('');
    onSend(text, readyIds.length > 0 ? readyIds : undefined, staged.length > 0 ? staged : undefined);
  }

  function handleGifSelect(gifUrl: string) {
    setGifOpen(false);
    if (!disabled) onSend(gifUrl);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([^@]*)$/);
    if (atMatch) { setMentionQuery(atMatch[1]); setMentionIdx(0); } else { setMentionQuery(null); }
    const emojiMatch = before.match(/:([a-z0-9_+\-]{1,30})$/);
    if (emojiMatch) { setEmojiQuery(emojiMatch[1]); setEmojiIdx(0); } else { setEmojiQuery(null); }
  }

  function completeMention(name: string) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const atMatch = before.match(/@([^@]*)$/);
    if (!atMatch) return;
    const start = cursor - atMatch[0].length;
    const next = input.slice(0, start) + '@' + name + ' ' + input.slice(cursor);
    setInput(next);
    setMentionQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + name.length + 2, start + name.length + 2); });
  }

  function completeEmojiShortcode(entry: EmojiEntry) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const m = before.match(/:([a-z0-9_+\-]{1,30})$/);
    if (!m) return;
    const start = cursor - m[0].length;
    const next = input.slice(0, start) + entry.e + ' ' + input.slice(cursor);
    setInput(next);
    setEmojiQuery(null);
    const pos = start + [...entry.e].length + 1;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  }

  function completePackEmoji(entry: PackEmojiEntry) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const m = before.match(/:([a-z0-9_+\-]{1,30})$/);
    const token = `:${entry.shortcode}: `;
    const start = m ? cursor - m[0].length : cursor;
    const next = input.slice(0, start) + token + input.slice(cursor);
    setInput(next);
    setEmojiQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  }

  function insertPackEmoji(entry: PackEmojiEntry) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const token = `:${entry.shortcode}: `;
    setInput(input.slice(0, cursor) + token + input.slice(cursor));
    setEmojiOpen(false);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(cursor + token.length, cursor + token.length); });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (emojiQuery !== null && allEmojiMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setEmojiIdx(i => (i + 1) % allEmojiMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setEmojiIdx(i => (i - 1 + allEmojiMatches.length) % allEmojiMatches.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const m = allEmojiMatches[emojiIdx];
        if (m.kind === 'standard') completeEmojiShortcode(m.entry); else completePackEmoji(m.entry);
        return;
      }
      if (e.key === 'Escape') { setEmojiQuery(null); return; }
    }
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => (i + 1) % mentionMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); completeMention(mentionMatches[mentionIdx]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Escape' && replyingTo) { onCancelReply?.(); return; }
    if (e.key === 'Enter') { doSend(); return; }
    if (e.key === 'ArrowUp' && !input) { onUpArrowEmpty?.(); }
  }

  const canSend = !disabled && (input.trim().length > 0 || pendingFiles.some(f => !f.uploading && f.id != null));

  return (
    <div
      className={`${styles.root} ${dragOver ? styles.dragOver : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {emojiOpen && (
        <div className={styles.emojiPickerWrap}>
          {packEmojiEntries.length > 0 && packBaseUrl && (
            <div className={styles.packEmojiSection}>
              <div className={styles.emojiShortcodeHeader}>{emojiManifest?.pack_name ?? 'Pack'} Emojis</div>
              <div className={styles.packEmojiGrid}>
                {packEmojiEntries.map(entry => (
                  <button key={entry.shortcode} className={styles.packEmojiGridItem} onClick={() => insertPackEmoji(entry)} title={`:${entry.shortcode}:`}>
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
              <UserAvatar name={name} size={22} radius={6} color={getRoleColor(roleMap?.[name])} />
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
          <span className={styles.replyBannerName}>{replyingTo.name}</span>
          <button className={styles.replyBannerClose} onClick={onCancelReply} title="Cancel reply">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
      <div className={styles.capsule}>
        <input type="file" ref={fileInputRef} style={{ display: 'none' }}
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,application/pdf,text/plain,text/markdown,application/zip,application/x-zip-compressed"
          onChange={handleFileSelect} />
        <button className={styles.btn} onClick={() => fileInputRef.current?.click()} disabled={disabled} title="Attach file">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </button>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder={placeholder}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => { setMentionQuery(null); setEmojiQuery(null); }, 150)}
          onPaste={handlePaste}
          autoComplete="off"
          disabled={disabled}
        />
        <button
          ref={emojiBtnRef}
          className={`${styles.btn} ${emojiOpen ? styles.btnActive : ''}`}
          onClick={() => { setEmojiOpen(o => !o); setGifOpen(false); }}
          disabled={disabled}
          title="Emoji"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>
        <button
          ref={gifBtnRef}
          className={`${styles.btn} ${gifOpen ? styles.btnActive : ''}`}
          onClick={() => { setGifOpen(o => !o); setEmojiOpen(false); }}
          disabled={disabled}
          title="GIF"
        >
          <span className={styles.gifLabel}>GIF</span>
        </button>
        <button className={`${styles.btn} ${styles.sendBtn}`} onClick={doSend} disabled={!canSend}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(45)">
            <line x1="12" y1="19" x2="12" y2="5"/>
            <polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </div>
    </div>
  );
});

export default MessageInput;
