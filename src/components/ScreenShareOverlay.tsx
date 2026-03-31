/**
 * Overlay for displaying remote screen shares during voice calls.
 * Shows live video feeds from participants sharing their screen.
 * Can be minimized to show only a header with live indicator.
 */
import { useEffect, useRef, useState } from 'react';
import type { RemoteScreen } from '../hooks/useVoice';
import styles from './ScreenShareOverlay.module.css';

function ScreenVideo({ screen }: { screen: RemoteScreen }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = screen.stream;
  }, [screen.stream]);
  return (
    <div className={styles.screenItem}>
      <div className={styles.screenLabel}>{screen.identity} is sharing</div>
      <video ref={ref} autoPlay playsInline className={styles.video} />
    </div>
  );
}

interface Props {
  screens: RemoteScreen[];
}

export default function ScreenShareOverlay({ screens }: Props) {
  const [minimized, setMinimized] = useState(false);

  if (screens.length === 0) return null;

  return (
    <div className={`${styles.overlay} ${minimized ? styles.minimized : ''}`}>
      <div className={styles.header}>
        <span className={styles.liveTag}>LIVE</span>
        <span className={styles.headerText}>
          {screens.length === 1 ? screens[0].identity : `${screens.length} screens`}
        </span>
        <button className={styles.minimizeBtn} onClick={() => setMinimized(m => !m)}>
          {minimized ? '▲' : '▼'}
        </button>
      </div>
      {!minimized && (
        <div className={styles.screenList}>
          {screens.map(s => <ScreenVideo key={s.identity} screen={s} />)}
        </div>
      )}
    </div>
  );
}
