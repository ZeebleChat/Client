/**
 * Overlay for displaying remote screen shares during voice calls.
 * Renders base64 JPEG frames pushed from the server at ~15 fps.
 * Can be minimized to show only a header with live indicator.
 */
import { useState } from 'react';
import styles from './ScreenShareOverlay.module.css';

interface Props {
  frames: Map<string, string>; // identity → latest base64 JPEG
}

export default function ScreenShareOverlay({ frames }: Props) {
  const [minimized, setMinimized] = useState(false);

  if (frames.size === 0) return null;

  const entries = Array.from(frames.entries());

  return (
    <div className={`${styles.overlay} ${minimized ? styles.minimized : ''}`}>
      <div className={styles.header}>
        <span className={styles.liveTag}>LIVE</span>
        <span className={styles.headerText}>
          {entries.length === 1 ? entries[0][0] : `${entries.length} screens`}
        </span>
        <button className={styles.minimizeBtn} onClick={() => setMinimized(m => !m)}>
          {minimized ? '▲' : '▼'}
        </button>
      </div>
      {!minimized && (
        <div className={styles.screenList}>
          {entries.map(([identity, frame]) => (
            <div key={identity} className={styles.screenItem}>
              <div className={styles.screenLabel}>{identity} is sharing</div>
              <img
                src={`data:image/jpeg;base64,${frame}`}
                alt={`${identity}'s screen`}
                className={styles.video}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
