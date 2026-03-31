/**
 * Renders a Zeeble-styled permission prompt inline (inside whatever panel is
 * already open) instead of letting the raw WebView2 / browser banner appear.
 *
 * Usage:
 *   <PermissionGate kind="microphone" onGranted={loadDevices}>
 *     {/* real content shown after grant *\/}
 *   </PermissionGate>
 */
import { useState } from 'react';
import { usePermissionGate } from '../hooks/usePermissionGate';
import styles from './PermissionGate.module.css';

// SVG icons
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8"  y1="22" x2="16" y2="22"/>
  </svg>
);

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 7 16 12 23 17z"/>
    <rect x="1" y="5" width="15" height="14" rx="2"/>
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);

interface Props {
  kind: 'microphone' | 'camera';
  onGranted?: () => void;
  children: React.ReactNode;
}

export default function PermissionGate({ kind, onGranted, children }: Props) {
  const { state, request } = usePermissionGate(kind);
  const [loading, setLoading] = useState(false);

  // Already granted — render children normally
  if (state === 'granted') return <>{children}</>;

  // Still checking
  if (state === 'unknown') return <div className={styles.checking} />;

  // Denied — show persistent error
  if (state === 'denied') {
    return (
      <div className={styles.gate}>
        <div className={styles.iconWrap} data-denied>
          {kind === 'microphone' ? <MicIcon /> : <CameraIcon />}
        </div>
        <h3 className={styles.title}>Access blocked</h3>
        <p className={styles.body}>
          {kind === 'microphone' ? 'Microphone' : 'Camera'} access was denied.
          Open your system settings and allow Zeeble to use your {kind}.
        </p>
      </div>
    );
  }

  // Needs prompt
  const handleAllow = async () => {
    setLoading(true);
    const ok = await request();
    setLoading(false);
    if (ok) onGranted?.();
  };

  const label = kind === 'microphone' ? 'Microphone' : 'Camera';

  return (
    <div className={styles.gate}>
      <div className={styles.iconWrap}>
        {kind === 'microphone' ? <MicIcon /> : <CameraIcon />}
      </div>

      <h3 className={styles.title}>{label} access needed</h3>

      <p className={styles.body}>
        Zeeble needs access to your {kind.toLowerCase()} for voice
        {kind === 'camera' ? ' and video' : ''} calls.
        Your {kind.toLowerCase()} is only active while you're in a call.
      </p>

      <div className={styles.trust}>
        <ShieldIcon />
        <span>Only used for calls — never recorded or shared</span>
      </div>

      <button
        className={styles.allowBtn}
        onClick={handleAllow}
        disabled={loading}
      >
        {loading ? 'Requesting…' : `Allow ${label} Access`}
      </button>
    </div>
  );
}
