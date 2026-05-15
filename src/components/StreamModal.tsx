import type { StreamState } from '../hooks/useStream';
import styles from './VoiceModal.module.css';

interface Props {
  state: StreamState;
  onStop: () => void;
  onToggleMute?: () => void;
  onClose: () => void;
}

const LiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
  </svg>
);

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  </svg>
);

export default function StreamModal({ state, onStop, onToggleMute, onClose }: Props) {
  const { status, channel, broadcaster, micLevel, isMuted, errorMsg } = state;
  const isBroadcasting = status === 'broadcasting';
  const isViewing = status === 'viewing';

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <div className={styles.header}>
          <div className={styles.vcIcon} style={{ color: 'var(--red)' }}><LiveIcon /></div>
          <div>
            <div className={styles.title}>
              {isBroadcasting ? 'Live Stream' : 'Watching Stream'}
            </div>
            {channel && <div className={styles.channelName}>#{channel.name}</div>}
          </div>
        </div>

        <div className={`${styles.status} ${status === 'error' ? styles.error : styles.connected}`}>
          {isBroadcasting && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--red)' }}>●</span> You are Live
              {isMuted && <span style={{ color: 'var(--text-3)', fontSize: 11 }}>(muted)</span>}
            </span>
          )}
          {isViewing && broadcaster && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--red)' }}>●</span> Live from {broadcaster}
            </span>
          )}
          {status === 'error' && errorMsg}
        </div>

        {/* Mic meter — only for broadcaster */}
        {isBroadcasting && (
          <div className={styles.meterSection}>
            <div className={styles.meterLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MicIcon /> MIC INPUT {isMuted && '(muted)'}
            </div>
            <div className={styles.meterTrack}>
              <div
                className={styles.meterBar}
                style={{
                  width: `${micLevel}%`,
                  background: micLevel > 60 ? 'var(--green)' : 'var(--green)',
                  opacity: isMuted ? 0.3 : 1,
                }}
              />
            </div>
          </div>
        )}

        {isViewing && (
          <div className={styles.participants}>
            <div className={styles.empty} style={{ color: 'var(--text-3)', fontSize: 13 }}>
              Audio is playing from the broadcaster
            </div>
          </div>
        )}

        {(isBroadcasting || isViewing) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {isBroadcasting && onToggleMute && (
              <button
                className={styles.leaveBtn}
                onClick={onToggleMute}
                style={{ background: isMuted ? 'var(--red)' : 'var(--text-3)', flex: 1 }}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            )}
            <button
              className={styles.leaveBtn}
              onClick={onStop}
              style={{ background: 'var(--red)', flex: isBroadcasting ? 1 : undefined }}
            >
              {isBroadcasting ? 'End Stream' : 'Leave Stream'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
