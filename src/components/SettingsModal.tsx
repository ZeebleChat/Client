/**
 * Legacy settings modal (replaced by AccountModal).
 * Kept for backward compatibility.
 */
import { useState } from 'react';
import { getBeamIdentity } from '../auth';
import { ENV_AUTH_URL, ENV_DM_URL, ENV_ZCLOUD_URL } from '../config';
import styles from './SettingsModal.module.css';

interface Props {
onClose: () => void;
onLogout: () => void;
}

export default function SettingsModal({ onClose, onLogout }: Props) {
  const identity = getBeamIdentity();
  const initials = identity ? identity.slice(0, 2).toUpperCase() : 'ME';

  const [authUrl, setAuthUrl] = useState(
    localStorage.getItem('auth_server_url') || ENV_AUTH_URL
  );
  const [dmUrl, setDmUrl] = useState(
    localStorage.getItem('dm_server_url') || ENV_DM_URL
  );
  const [zcloudUrl, setZcloudUrl] = useState(
    localStorage.getItem('zcloud_url') || ENV_ZCLOUD_URL
  );
  const [saved, setSaved] = useState(false);

  function handleSave() {
    localStorage.setItem('auth_server_url', authUrl);
    localStorage.setItem('dm_server_url', dmUrl);
    localStorage.setItem('zcloud_url', zcloudUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

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
          <div className={styles.sectionLabel}>Server URLs</div>
          <label className={styles.fieldLabel}>Auth Server</label>
          <input
            className={styles.input}
            value={authUrl}
            onChange={e => setAuthUrl(e.target.value)}
            placeholder="http://..."
            spellCheck={false}
          />
          <label className={styles.fieldLabel}>DM Server</label>
          <input
            className={styles.input}
            value={dmUrl}
            onChange={e => setDmUrl(e.target.value)}
            placeholder="http://..."
            spellCheck={false}
          />
          <label className={styles.fieldLabel}>ZCloud URL</label>
          <input
            className={styles.input}
            value={zcloudUrl}
            onChange={e => setZcloudUrl(e.target.value)}
            placeholder="http://..."
            spellCheck={false}
          />
          <button className={`${styles.saveBtn} ${saved ? styles.saveBtnDone : ''}`} onClick={handleSave}>
            {saved ? 'Saved!' : 'Save'}
          </button>
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
