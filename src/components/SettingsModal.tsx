/**
 * Legacy settings modal (replaced by AccountModal).
 * Kept for backward compatibility.
 */
import { getBeamIdentity } from '../auth';
import styles from './SettingsModal.module.css';

interface Props {
onClose: () => void;
onLogout: () => void;
}

export default function SettingsModal({ onClose, onLogout }: Props) {
  const identity = getBeamIdentity();
  const initials = identity ? identity.slice(0, 2).toUpperCase() : 'ME';

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Settings</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Account</div>
          <div className={styles.accountRow}>
            <div className={styles.avatar}>{initials}</div>
            <div>
              <div className={styles.accountName}>{identity || 'Unknown'}</div>
              <div className={styles.accountSub}>Beam Identity</div>
            </div>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <button className={styles.logoutBtn} onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
