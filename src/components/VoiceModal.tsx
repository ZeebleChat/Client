/**
 * Voice channel modal overlay.
 * Shows voice connection status, mic input level, participants,
 * and controls for screen sharing.
 */
import type { VoiceState } from '../hooks/useVoice';
import styles from './VoiceModal.module.css';

interface Props {
state: VoiceState;
onLeave: () => void;
onClose: () => void;
onToggleScreenShare: () => void;
}

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  </svg>
);

const MonitorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8M12 17v4"/>
  </svg>
);

export default function VoiceModal({ state, onLeave, onClose, onToggleScreenShare }: Props) {
  const { status, channel, participants, micLevel, micSilent, errorMsg, isScreenSharing, remoteScreens } = state;

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <div className={styles.header}>
          <div className={styles.vcIcon}><MicIcon /></div>
          <div>
            <div className={styles.title}>Voice Channel</div>
            {channel && <div className={styles.channelName}>#{channel.name}</div>}
          </div>
        </div>

        {/* Status */}
        <div className={`${styles.status} ${styles[status]}`}>
          {status === 'connecting' && 'Connecting…'}
          {status === 'connected' && 'Connected'}
          {status === 'error' && errorMsg}
          {status === 'idle' && 'Disconnected'}
        </div>

        {/* Mic meter */}
        {status === 'connected' && (
          <div className={styles.meterSection}>
            <div className={styles.meterLabel}>MIC INPUT</div>
            <div className={styles.meterTrack}>
              <div
                className={styles.meterBar}
                style={{
                  width: `${micLevel}%`,
                  background: micLevel > 60 ? 'var(--green)' : micLevel > 30 ? 'var(--gold)' : 'var(--green)',
                }}
              />
            </div>
            {micSilent && (
              <div className={styles.silenceWarning}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                No audio detected — check your microphone
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        {status === 'connected' && (
          <div className={styles.controls}>
            <button
              className={`${styles.screenShareBtn} ${isScreenSharing ? styles.screenShareBtnActive : ''}`}
              onClick={onToggleScreenShare}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              <MonitorIcon />
              {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
            </button>
          </div>
        )}

        {/* Participants */}
        {status === 'connected' && (
          <div className={styles.participants}>
            {participants.length === 0 ? (
              <div className={styles.empty}>No other participants</div>
            ) : (
              participants.map(p => (
                <div
                  key={p.identity}
                  className={`${styles.participant} ${p.isSpeaking ? styles.speaking : ''}`}
                >
                  <div
                    className={styles.pDot}
                    style={{
                      background: p.isSpeaking ? 'var(--green)' : p.isMuted ? 'var(--red)' : 'var(--text-3)',
                    }}
                  />
                  <span className={styles.pName}>{p.name}</span>
                  {p.isMuted && <span className={styles.pTag} style={{ color: 'var(--red)' }}>muted</span>}
                  {p.isSpeaking && <span className={styles.pTag} style={{ color: 'var(--green)' }}>speaking</span>}
                  {remoteScreens.some(s => s.identity === p.identity) && (
                    <span className={styles.pTag} style={{ color: 'var(--accent)' }}>sharing</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Leave button */}
        {(status === 'connected' || status === 'connecting') && (
          <button className={styles.leaveBtn} onClick={onLeave}>
            Leave Voice
          </button>
        )}
      </div>
    </div>
  );
}
