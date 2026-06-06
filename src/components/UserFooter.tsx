/**
 * UserFooter — the bottom-left user card that appears in every sidebar.
 * Click it to open the profile popup (status picker + copy beam ID).
 * Single source of truth — used by Sidebar and HomeView's DmSidebar.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getBeamIdentity } from '../auth';
import { statusClass } from '../types';
import UserAvatar from './UserAvatar';
import styles from './UserFooter.module.css';

// ── Idle detection ────────────────────────────────────────────────────────────

const IDLE_MS = 10 * 60 * 1000;

function useIdleStatus(): boolean {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIdle(false);
      timerRef.current = setTimeout(() => setIdle(true), IDLE_MS);
    }
    reset();
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const;
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(ev => window.removeEventListener(ev, reset));
    };
  }, []);
  return idle;
}

// ── Types & options ───────────────────────────────────────────────────────────

export type MyStatus = 'online' | 'idle' | 'dnd' | 'streaming' | 'offline';

export const STATUS_OPTIONS: { value: MyStatus; label: string; cls: string; desc: string }[] = [
  { value: 'online',    label: 'Online',          cls: 'on',        desc: 'Available'             },
  { value: 'idle',      label: 'Idle',            cls: 'idle',      desc: 'Away from keyboard'    },
  { value: 'dnd',       label: 'Do Not Disturb',  cls: 'dnd',       desc: 'Silence notifications' },
  { value: 'streaming', label: 'Streaming',        cls: 'streaming', desc: 'Currently live'        },
  { value: 'offline',   label: 'Invisible',        cls: 'offline',   desc: 'Appear offline'        },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserFooter() {
  const identity = getBeamIdentity() ?? '';

  // Display name (may differ from beam identity on some setups)
  const [displayName, setDisplayName] = useState(
    localStorage.getItem('cached_display_name') || identity
  );
  useEffect(() => {
    const handler = () => setDisplayName(localStorage.getItem('cached_display_name') || identity);
    window.addEventListener('zeeble:display-name-changed', handler);
    return () => window.removeEventListener('zeeble:display-name-changed', handler);
  }, [identity]);

  // ── Status ──────────────────────────────────────────────────────────────────
  const [manualStatus, setManualStatus] = useState<MyStatus>(() => {
    const s = localStorage.getItem('zbl_my_status') ?? '';
    return (STATUS_OPTIONS.map(o => o.value) as string[]).includes(s)
      ? (s as MyStatus)
      : 'online';
  });
  const isIdle = useIdleStatus();

  const myStatus: MyStatus =
    manualStatus === 'offline'     ? 'offline'
    : manualStatus === 'dnd'       ? 'dnd'
    : manualStatus === 'streaming' ? 'streaming'
    : manualStatus === 'online' && isIdle ? 'idle'
    : manualStatus;

  function chooseStatus(s: MyStatus) {
    setManualStatus(s);
    localStorage.setItem('zbl_my_status', s);
  }

  // ── Copy beam ID ─────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    if (!identity) return;
    navigator.clipboard.writeText(identity).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [identity]);

  // ── Profile popup ─────────────────────────────────────────────────────────────
  const [profileOpen, setProfileOpen] = useState(false);
  const profileCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileCardRef.current && !profileCardRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  // ── QR popup ─────────────────────────────────────────────────────────────────
  const [qrOpen, setQrOpen] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrap} ref={profileCardRef}>

      {/* ── Profile popup (slides up) ─────────────────────────────────────── */}
      {profileOpen && (
        <div className={styles.popup}>
          {/* Banner */}
          <div className={styles.popupBanner}>
            <div className={styles.popupBannerGradient} />
          </div>

          {/* Avatar row */}
          <div className={styles.popupAvatarRow}>
            <div className={styles.popupAvatarWrap}>
              <UserAvatar name={identity} size={52} radius={14} />
              <div className={`${styles.popupDot} ${styles[statusClass(myStatus)]}`} />
            </div>
          </div>

          {/* Name + beam */}
          <div className={styles.popupInfo}>
            <div className={styles.popupName}>{displayName || identity || 'Me'}</div>
            <div
              className={styles.popupBeam}
              title={copied ? 'Copied!' : 'Click to copy ID'}
              onClick={handleCopy}
            >
              {copied ? '✓ Copied!' : identity}
            </div>
          </div>

          <div className={styles.popupDivider} />

          {/* Status options */}
          <div className={styles.popupStatusSection}>
            <div className={styles.popupStatusTitle}>Set Status</div>
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${styles.popupStatusBtn} ${myStatus === opt.value ? styles.popupStatusBtnActive : ''}`}
                onClick={() => { chooseStatus(opt.value); setProfileOpen(false); }}
              >
                <span className={`${styles.popupDotSmall} ${styles[opt.cls]}`} />
                <div className={styles.popupStatusText}>
                  <span className={styles.popupStatusLabel}>{opt.label}</span>
                  <span className={styles.popupStatusDesc}>{opt.desc}</span>
                </div>
                {myStatus === opt.value && (
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-3)' }}
                  >
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── User card ─────────────────────────────────────────────────────────── */}
      <div
        className={`${styles.card} ${profileOpen ? styles.cardActive : ''}`}
        onClick={() => setProfileOpen(v => !v)}
      >
        {/* Avatar + status dot */}
        <div className={styles.avatarWrap}>
          <UserAvatar name={identity} size={34} radius={10} className={styles.avatar} />
          <div className={`${styles.stat} ${styles[statusClass(myStatus)]}`} />
        </div>

        {/* Name + status label */}
        <div className={styles.info}>
          <div className={styles.name}>{displayName || identity || 'Me'}</div>
          <div className={styles.statusLabel}>
            {STATUS_OPTIONS.find(o => o.value === myStatus)?.label ?? 'Online'}
          </div>
        </div>

        {/* QR button — stopPropagation so it doesn't toggle the popup */}
        <div
          className={styles.qrWrap}
          ref={qrRef}
          onClick={e => e.stopPropagation()}
        >
          <button
            className={styles.qrBtn}
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
              <div className={styles.qrLabel}>Share to add as friend</div>
              <div className={styles.qrCode}>
                <QRCodeSVG value={identity} size={150} bgColor="#ffffff" fgColor="#111111" level="M" />
              </div>
              <div className={styles.qrBeam}>{identity}</div>
              <button
                className={styles.qrCopyBtn}
                onClick={() => navigator.clipboard.writeText(identity)}
              >
                Copy ID
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
