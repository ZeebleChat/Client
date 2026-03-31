/**
 * Sidebar component displaying server channels.
 * Shows text and voice channels organized by category with:
 * - Channel selection
 * - Voice channel joining
 * - Drag-and-drop reordering
 * - User identity footer with QR code for adding friends
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { SidebarCategory } from '../types';
import type { ApiChannel } from '../api';
import type { Participant } from '../hooks/useVoice';
import { createChannel, updateCategory, deleteCategory, updateChannelPosition, renameChannel, deleteChannel, loginReq } from '../api';
import { getBeamIdentity } from '../auth';
import UserAvatar from './UserAvatar';
import styles from './Sidebar.module.css';

interface Props {
  serverName: string;
  categories: SidebarCategory[];
  activeChannelId: string | number | null;
  activeVoiceChannelId?: string | number | null;
  activeVoiceChannelName?: string | null;
  voiceParticipants?: Participant[];
  onSelectChannel: (channel: ApiChannel) => void;
  onJoinVoice: (channel: ApiChannel) => void;
  onLeaveVoice?: () => void;
  voiceMuted?: boolean;
  voiceDeafened?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  onOpenServerSettings?: () => void;
  onOpenInvites?: () => void;
  onRefresh?: () => void;
  onToggleScreenShare?: () => void;
  isScreenSharing?: boolean;
  isOwner?: boolean;
  isCloudServer?: boolean;
  onLeaveServer?: () => void;
  onDeleteServer?: (password: string) => Promise<{ ok: boolean; error?: string }>;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const HashIcon = () => (
  <svg className={styles.chIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="9" x2="20" y2="9"/>
    <line x1="4" y1="15" x2="20" y2="15"/>
    <line x1="10" y1="3" x2="8" y2="21"/>
    <line x1="16" y1="3" x2="14" y2="21"/>
  </svg>
);

const MicIcon = () => (
  <svg className={styles.chIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  </svg>
);

const GripIcon = () => (
  <svg className={styles.gripIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/>
  </svg>
);

// ── Add-channel mini popover ──────────────────────────────────────────────────

function AddChannelPopover({
  categoryId,
  onDone,
  onCancel,
}: {
  categoryId: string | number | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    await createChannel(name.trim(), type, categoryId);
    setBusy(false);
    onDone();
  }

  return (
    <div className={styles.addPopover} ref={ref}>
      <div className={styles.addPopoverTitle}>New Channel</div>
      <div className={styles.addPopoverTypeRow}>
        <button
          className={`${styles.typeBtn} ${type === 'text' ? styles.typeBtnActive : ''}`}
          onClick={() => setType('text')}
        ># Text</button>
        <button
          className={`${styles.typeBtn} ${type === 'voice' ? styles.typeBtnActive : ''}`}
          onClick={() => setType('voice')}
        >🔊 Voice</button>
      </div>
      <input
        className={styles.addPopoverInput}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="channel-name"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
      />
      <div className={styles.addPopoverActions}>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button className={styles.addBtn} onClick={submit} disabled={busy || !name.trim()}>
          {busy ? '…' : 'Add'}
        </button>
      </div>
    </div>
  );
}

const GearIcon = () => (
  <svg className={styles.gearIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// ── Category settings popover ─────────────────────────────────────────────────

function CategorySettingsPopover({
  catId,
  catName,
  onDone,
  onCancel,
}: {
  catId: string | number;
  catName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(catName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await updateCategory(catId, { name: name.trim() });
    setBusy(false);
    if (r.ok) onDone();
    else setErr(r.error ?? 'Failed');
  }

  async function handleDelete() {
    if (!confirm(`Delete category "${catName}"? Channels inside will become uncategorized.`)) return;
    setBusy(true);
    const r = await deleteCategory(catId);
    setBusy(false);
    if (r.ok) onDone();
    else setErr(r.error ?? 'Failed');
  }

  return (
    <div className={styles.settingsPopover} ref={ref}>
      <div className={styles.settingsPopoverTitle}>Category Settings</div>
      <input
        className={styles.addPopoverInput}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Category name"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
      />
      {err && <div className={styles.settingsErr}>{err}</div>}
      <div className={styles.settingsPopoverActions}>
        <button className={styles.settingsDeleteBtn} onClick={handleDelete} disabled={busy}>Delete</button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.addBtn} onClick={handleSave} disabled={busy || !name.trim()}>
            {busy ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Channel settings popover ──────────────────────────────────────────────────

function ChannelSettingsPopover({
  chId,
  chName,
  onDone,
  onCancel,
}: {
  chId: string | number;
  chName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(chName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await renameChannel(chId, name.trim());
    setBusy(false);
    if (r.ok) onDone();
    else setErr(r.error ?? 'Failed');
  }

  async function handleDelete() {
    if (!confirm(`Delete channel "${chName}"? This cannot be undone.`)) return;
    setBusy(true);
    const r = await deleteChannel(chId);
    setBusy(false);
    if (r.ok) onDone();
    else setErr(r.error ?? 'Failed');
  }

  return (
    <div className={styles.settingsPopover} ref={ref}>
      <div className={styles.settingsPopoverTitle}>Channel Settings</div>
      <input
        className={styles.addPopoverInput}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Channel name"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
      />
      {err && <div className={styles.settingsErr}>{err}</div>}
      <div className={styles.settingsPopoverActions}>
        <button className={styles.settingsDeleteBtn} onClick={handleDelete} disabled={busy}>Delete</button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.addBtn} onClick={handleSave} disabled={busy || !name.trim()}>
            {busy ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Drag-and-drop types ────────────────────────────────────────────────────────

type DragItem =
  | { kind: 'cat'; catId: string | number }
  | { kind: 'ch'; chId: string | number; catId: string | number; chType: 'text' | 'voice' };

// ── Footer bar ────────────────────────────────────────────────────────────────

function FooterBar({ identity }: { identity: string }) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(() => {
    if (!identity) return;
    navigator.clipboard.writeText(identity).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [identity]);

  // Close QR popup on outside click
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

  return (
    <div className={styles.footer}>
      <div className={styles.ufAvatarWrap}>
        <UserAvatar name={identity} size={34} radius={10} className={styles.ufAvatar} />
        <div className={styles.ufStat} />
      </div>

      <div className={styles.ufInfo}>
        <div
          className={styles.ufName}
          title={copied ? 'Copied!' : 'Click to copy'}
          onClick={handleCopy}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          {copied ? (
            <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700 }}>Copied!</span>
          ) : (identity || 'Me')}
        </div>
        <div className={styles.ufId}>Online</div>
      </div>

      {/* QR button */}
      <div style={{ position: 'relative' }} ref={qrRef}>
        <button
          className={styles.iconBtn}
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
          <div className={styles.qrPopup}>
            <div className={styles.qrPopupLabel}>Share to add as friend</div>
            <div className={styles.qrPopupCode}>
              <QRCodeSVG value={identity} size={150} bgColor="#ffffff" fgColor="#111111" level="M" />
            </div>
            <div className={styles.qrPopupBeam}>{identity}</div>
            <button
              className={styles.qrCopyBtn}
              onClick={() => { navigator.clipboard.writeText(identity); }}
            >
              Copy ID
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({
  serverName, categories, activeChannelId, activeVoiceChannelId, activeVoiceChannelName,
  voiceParticipants,
  onSelectChannel, onJoinVoice, onLeaveVoice,
  voiceMuted, voiceDeafened, onToggleMute, onToggleDeafen,
  onOpenServerSettings, onOpenInvites, onRefresh,
  onToggleScreenShare, isScreenSharing,
  isOwner, isCloudServer, onLeaveServer, onDeleteServer,
}: Props) {
  const identity = getBeamIdentity();

  // ── Leave / delete modal ──────────────────────────────────────────────────
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leavePassword, setLeavePassword] = useState('');
  const [leaveError, setLeaveError] = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);

  const handleLeaveOrDelete = async () => {
    setLeaveLoading(true);
    setLeaveError('');
    if (isOwner && onDeleteServer) {
      const loginResult = await loginReq(identity ?? '', leavePassword);
      if (!loginResult.ok) {
        setLeaveError('Incorrect password');
        setLeaveLoading(false);
        return;
      }
      const result = await onDeleteServer(leavePassword);
      if (!result.ok) setLeaveError(result.error ?? 'Failed to delete server');
      else setLeaveModalOpen(false);
    } else if (onLeaveServer) {
      onLeaveServer();
      setLeaveModalOpen(false);
    }
    setLeaveLoading(false);
  };

  // ── Local ordered state (for drag-and-drop) ──────────────────────────────
  const [orderedCats, setOrderedCats] = useState(categories);
  useEffect(() => { setOrderedCats(categories); }, [categories]);

  // ── Collapsed state per category ────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ── Add-channel popover ─────────────────────────────────────────────────
  const [addingTo, setAddingTo] = useState<string | number | null | 'none'>('none'); // catId or null = uncategorized, 'none' = closed

  // ── Settings popovers ───────────────────────────────────────────────────
  const [catSettings, setCatSettings] = useState<string | number | null>(null);
  const [chSettings,  setChSettings]  = useState<string | number | null>(null);

  // ── Drag state ──────────────────────────────────────────────────────────
  const dragItem = useRef<DragItem | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | number | null>(null);
  const [dragOverChId, setDragOverChId] = useState<string | number | null>(null);

  // ── Category drag handlers ───────────────────────────────────────────────

  function onCatDragStart(e: React.DragEvent, catId: string | number) {
    dragItem.current = { kind: 'cat', catId };
    e.dataTransfer.effectAllowed = 'move';
  }

  function onCatDragOver(e: React.DragEvent, catId: string | number) {
    e.preventDefault();
    if (dragItem.current?.kind === 'cat' || dragItem.current?.kind === 'ch') setDragOverCatId(catId);
  }

  function onCatDrop(e: React.DragEvent, targetCatId: string | number) {
    e.preventDefault();
    if (dragItem.current?.kind === 'ch') {
      onChDropOnCat(e, targetCatId);
      return;
    }
    if (dragItem.current?.kind !== 'cat') return;
    const fromId = dragItem.current.catId;
    if (String(fromId) === String(targetCatId)) return;

    setOrderedCats(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(c => String(c.id) === String(fromId));
      const toIdx = next.findIndex(c => String(c.id) === String(targetCatId));
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      // Persist new positions
      next.forEach((cat, i) => {
        if (cat.id !== '__uncategorized__') updateCategory(cat.id, { position: i });
      });
      return next;
    });
    setDragOverCatId(null);
    dragItem.current = null;
  }

  // ── Channel drag handlers ────────────────────────────────────────────────

  function onChDragStart(e: React.DragEvent, chId: string | number, catId: string | number, chType: 'text' | 'voice') {
    dragItem.current = { kind: 'ch', chId, catId, chType };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function onChDragOver(e: React.DragEvent, chId: string | number) {
    e.preventDefault();
    e.stopPropagation();
    if (dragItem.current?.kind === 'ch') setDragOverChId(chId);
  }

  function onChDrop(e: React.DragEvent, targetChId: string | number, targetCatId: string | number, targetType: 'text' | 'voice') {
    e.preventDefault();
    e.stopPropagation();
    if (dragItem.current?.kind !== 'ch') return;
    const { chId: fromChId, catId: fromCatId, chType } = dragItem.current;
    if (String(fromChId) === String(targetChId) || chType !== targetType) return;

    const crossCategory = String(fromCatId) !== String(targetCatId);

    setOrderedCats(prev => {
      // Find the dragged channel object
      let draggedCh: (typeof prev[0]['textChannels'][0]) | undefined;
      for (const cat of prev) {
        const chans = chType === 'text' ? cat.textChannels : cat.voiceChannels;
        const found = chans.find(c => String(c.id) === String(fromChId));
        if (found) { draggedCh = found; break; }
      }
      if (!draggedCh) return prev;
      const ch = draggedCh;

      const next = prev.map(cat => {
        const textChs = [...cat.textChannels];
        const voiceChs = [...cat.voiceChannels];
        const chans = chType === 'text' ? textChs : voiceChs;

        // Remove from source
        const fromIdx = chans.findIndex(c => String(c.id) === String(fromChId));
        if (fromIdx >= 0) chans.splice(fromIdx, 1);

        // Insert at target position if this is the target category
        if (String(cat.id) === String(targetCatId)) {
          const toIdx = chans.findIndex(c => String(c.id) === String(targetChId));
          chans.splice(toIdx >= 0 ? toIdx : chans.length, 0, ch);
        }

        // Persist positions for this category's channels
        const newCatId = cat.id === '__uncategorized__' ? null : cat.id;
        chans.forEach((c, i) => updateChannelPosition(c.id, i, crossCategory ? newCatId : undefined));

        return chType === 'text'
          ? { ...cat, textChannels: textChs, voiceChannels: voiceChs }
          : { ...cat, textChannels: textChs, voiceChannels: voiceChs };
      });
      return next;
    });
    setDragOverChId(null);
    dragItem.current = null;
  }

  // Drop a channel onto a category header (moves it to that category)
  function onChDropOnCat(e: React.DragEvent, targetCatId: string | number) {
    e.preventDefault();
    e.stopPropagation();
    if (dragItem.current?.kind !== 'ch') return;
    const { chId: fromChId, catId: fromCatId, chType } = dragItem.current;
    if (String(fromCatId) === String(targetCatId)) return;

    setOrderedCats(prev => {
      let draggedCh: (typeof prev[0]['textChannels'][0]) | undefined;
      for (const cat of prev) {
        const chans = chType === 'text' ? cat.textChannels : cat.voiceChannels;
        const found = chans.find(c => String(c.id) === String(fromChId));
        if (found) { draggedCh = found; break; }
      }
      if (!draggedCh) return prev;
      const ch = draggedCh;

      const next = prev.map(cat => {
        const textChs = [...cat.textChannels];
        const voiceChs = [...cat.voiceChannels];
        const chans = chType === 'text' ? textChs : voiceChs;

        // Remove from source
        const fromIdx = chans.findIndex(c => String(c.id) === String(fromChId));
        if (fromIdx >= 0) chans.splice(fromIdx, 1);

        // Append to target category
        if (String(cat.id) === String(targetCatId)) {
          chans.push(ch);
          const newCatId = cat.id === '__uncategorized__' ? null : cat.id;
          chans.forEach((c, i) => updateChannelPosition(c.id, i, newCatId));
        }

        return chType === 'text'
          ? { ...cat, textChannels: textChs, voiceChannels: voiceChs }
          : { ...cat, textChannels: textChs, voiceChannels: voiceChs };
      });
      return next;
    });
    setDragOverCatId(null);
    dragItem.current = null;
  }

  function onDragEnd() {
    setDragOverCatId(null);
    setDragOverChId(null);
    dragItem.current = null;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <aside className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.serverTitle}>{serverName}</span>
        <button
          className={styles.iconBtn}
          title="Invites"
          onClick={onOpenInvites}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </button>
        {isCloudServer && (
          <button
            className={styles.iconBtn}
            title={isOwner ? 'Delete Server' : 'Leave Server'}
            onClick={() => { setLeaveModalOpen(true); setLeavePassword(''); setLeaveError(''); }}
            style={{ color: 'var(--red, #e94560)' }}
          >
            {isOwner ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            )}
          </button>
        )}
        <button
          className={styles.iconBtn}
          title="Server Settings"
          onClick={onOpenServerSettings}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* Channel list */}
      <div className={styles.scroll}>
        {orderedCats.length === 0 && (
          <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '24px 12px', textAlign: 'center' }}>
            No channels yet
          </div>
        )}

        {orderedCats.map(cat => {
          const isCollapsed = !!collapsed[String(cat.id)];
          const isDragTarget = String(dragOverCatId) === String(cat.id);

          return (
            <div
              key={cat.id}
              className={`${styles.catSection} ${isDragTarget ? styles.catDragOver : ''}`}
              draggable
              onDragStart={e => onCatDragStart(e, cat.id)}
              onDragOver={e => onCatDragOver(e, cat.id)}
              onDrop={e => onCatDrop(e, cat.id)}
              onDragEnd={onDragEnd}
            >
              {/* Category header */}
              <div className={styles.catHeader}>
                <GripIcon />
                <button
                  className={styles.catCollapseBtn}
                  onClick={() => setCollapsed(c => ({ ...c, [String(cat.id)]: !c[String(cat.id)] }))}
                >
                  <svg
                    style={{ width: 9, height: 9, transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0 }}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  <span className={styles.catName}>{cat.name}</span>
                </button>
                <button
                  className={styles.catAddBtn}
                  title="Add channel"
                  onClick={e => { e.stopPropagation(); setAddingTo(cat.id); }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                {cat.id !== '__uncategorized__' && (
                  <button
                    className={styles.catAddBtn}
                    title="Category settings"
                    onClick={e => { e.stopPropagation(); setCatSettings(cat.id); setChSettings(null); }}
                  >
                    <GearIcon />
                  </button>
                )}
              </div>

              {/* Add-channel popover */}
              {addingTo === cat.id && (
                <AddChannelPopover
                  categoryId={cat.id === '__uncategorized__' ? null : cat.id}
                  onDone={() => { setAddingTo('none'); onRefresh?.(); }}
                  onCancel={() => setAddingTo('none')}
                />
              )}

              {/* Category settings popover */}
              {catSettings === cat.id && cat.id !== '__uncategorized__' && (
                <CategorySettingsPopover
                  catId={cat.id}
                  catName={cat.name}
                  onDone={() => { setCatSettings(null); onRefresh?.(); }}
                  onCancel={() => setCatSettings(null)}
                />
              )}

              {/* Channels */}
              <div className={`${styles.chGroup} ${isCollapsed ? styles.collapsed : ''}`}>
                {cat.textChannels.map(ch => {
                  const isActive = String(ch.id) === String(activeChannelId);
                  const isDragChTarget = String(dragOverChId) === String(ch.id);
                  const settingsOpen = String(chSettings) === String(ch.id);
                  return (
                    <div key={ch.id} className={styles.chItemWrap}>
                      <div
                        role="button"
                        tabIndex={0}
                        draggable
                        className={`${styles.chItem} ${isActive ? styles.active : ''} ${isDragChTarget ? styles.chDragOver : ''}`}
                        onClick={() => onSelectChannel(ch)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectChannel(ch); } }}
                        onDragStart={e => onChDragStart(e, ch.id, cat.id, 'text')}
                        onDragOver={e => onChDragOver(e, ch.id)}
                        onDrop={e => onChDrop(e, ch.id, cat.id, 'text')}
                        onDragEnd={onDragEnd}
                      >
                        <GripIcon />
                        <HashIcon />
                        <span className={styles.chName}>{ch.name}</span>
                        <button
                          className={styles.chGearBtn}
                          title="Channel settings"
                          onClick={e => { e.stopPropagation(); setChSettings(settingsOpen ? null : ch.id); setCatSettings(null); }}
                        >
                          <GearIcon />
                        </button>
                      </div>
                      {settingsOpen && (
                        <ChannelSettingsPopover
                          chId={ch.id}
                          chName={ch.name}
                          onDone={() => { setChSettings(null); onRefresh?.(); }}
                          onCancel={() => setChSettings(null)}
                        />
                      )}
                    </div>
                  );
                })}
                {cat.voiceChannels.map(ch => {
                  const isActiveVoice = String(ch.id) === String(activeVoiceChannelId);
                  const isDragChTarget = String(dragOverChId) === String(ch.id);
                  const settingsOpen = String(chSettings) === String(ch.id);
                  return (
                    <div key={ch.id} className={styles.chItemWrap}>
                    <div
                      draggable
                      className={`${styles.voiceCard} ${isActiveVoice ? styles.vcActive : ''} ${isDragChTarget ? styles.chDragOver : ''}`}
                      onClick={() => onJoinVoice(ch)}
                      onDragStart={e => onChDragStart(e, ch.id, cat.id, 'voice')}
                      onDragOver={e => onChDragOver(e, ch.id)}
                      onDrop={e => onChDrop(e, ch.id, cat.id, 'voice')}
                      onDragEnd={onDragEnd}
                    >
                      <div className={styles.vcHeader}>
                        <GripIcon />
                        <MicIcon />
                        <span style={{ flex: 1 }}>{ch.name}</span>
                        {isActiveVoice && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>LIVE</span>}
                        <button
                          className={styles.chGearBtn}
                          title="Channel settings"
                          onClick={e => { e.stopPropagation(); setChSettings(settingsOpen ? null : ch.id); setCatSettings(null); }}
                        >
                          <GearIcon />
                        </button>
                      </div>
                      {isActiveVoice && (
                        <div className={styles.vcUsers}>
                          {/* Local user always first */}
                          <div className={styles.vcUser}>
                            <UserAvatar name={getBeamIdentity() ?? 'Me'} size={20} radius={6} className={styles.vcAvatar} />
                            <span>{getBeamIdentity() || 'Me'}</span>
                          </div>
                          {(voiceParticipants ?? []).map(p => (
                            <div key={p.identity} className={styles.vcUser}>
                              <UserAvatar name={p.name} size={20} radius={6} className={styles.vcAvatar} />
                              <span style={{ flex: 1 }}>{p.name}</span>
                              {p.isMuted && (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round">
                                  <line x1="1" y1="1" x2="23" y2="23"/>
                                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                                  <path d="M17 16.95A7 7 0 0 1 5 12v-2"/>
                                </svg>
                              )}
                              {p.isSpeaking && !p.isMuted && (
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                      {settingsOpen && (
                        <ChannelSettingsPopover
                          chId={ch.id}
                          chName={ch.name}
                          onDone={() => { setChSettings(null); onRefresh?.(); }}
                          onCancel={() => setChSettings(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Voice bar */}
      {activeVoiceChannelId && (
        <div className={styles.voiceBar}>
          <div className={styles.voiceBarTop}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--green)" stroke="var(--green)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none"/>
            </svg>
            <span className={styles.voiceBarChannel}>#{activeVoiceChannelName ?? 'voice'}</span>
          </div>
          <div className={styles.voiceBarControls}>
          {onToggleMute && (
            <button
              className={`${styles.iconBtn} ${voiceMuted ? styles.voiceIconActive : ''}`}
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
              className={`${styles.iconBtn} ${voiceDeafened ? styles.voiceIconActive : ''}`}
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
          {onToggleScreenShare && (
            <button
              className={`${styles.goLiveBtn} ${isScreenSharing ? styles.goLiveBtnActive : ''}`}
              title={isScreenSharing ? 'Stop sharing' : 'Go Live'}
              onClick={onToggleScreenShare}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
              {isScreenSharing ? 'Live' : 'Live'}
            </button>
          )}
          {onLeaveVoice && (
            <button className={styles.voiceLeaveBtn} onClick={onLeaveVoice}>Leave</button>
          )}
          </div>
        </div>
      )}

      {/* Footer */}
      <FooterBar identity={identity} />

      {leaveModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setLeaveModalOpen(false)}>
          <div style={{
            background: 'var(--bg-panel, #1e2028)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: '28px 28px 24px',
            width: 320,
            display: 'flex', flexDirection: 'column', gap: 16,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: 17, color: 'var(--text-1)' }}>
              {isOwner ? `Delete "${serverName}"?` : `Leave "${serverName}"?`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
              {isOwner
                ? 'This will permanently delete the server and all its data. Enter your password to confirm.'
                : 'You will need a new invite to rejoin.'}
            </div>
            {isOwner && (
              <input
                type="password"
                placeholder="Your password"
                value={leavePassword}
                onChange={e => setLeavePassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLeaveOrDelete()}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '10px 12px',
                  color: 'var(--text-1)', fontSize: 14, outline: 'none',
                }}
                autoFocus
              />
            )}
            {leaveError && <div style={{ fontSize: 12, color: 'var(--red, #e94560)' }}>{leaveError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setLeaveModalOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: '8px 16px', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={handleLeaveOrDelete}
                disabled={leaveLoading || (isOwner ? !leavePassword : false)}
                style={{
                  background: 'var(--red, #e94560)', border: 'none', borderRadius: 8,
                  padding: '8px 16px', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', opacity: leaveLoading ? 0.6 : 1,
                }}
              >
                {leaveLoading ? '…' : isOwner ? 'Delete Server' : 'Leave Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
