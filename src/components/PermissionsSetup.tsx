import { useState, useEffect } from 'react';
import styles from './PermissionsSetup.module.css';

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const ScreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

type PermStatus = 'unknown' | 'granted' | 'needed';

interface Props {
  onDone: () => void;
}

export default function PermissionsSetup({ onDone }: Props) {
  const [micStatus, setMicStatus] = useState<PermStatus>('unknown');
  const [notifStatus, setNotifStatus] = useState<PermStatus>('unknown');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check mic
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then(s => setMicStatus(s.state === 'granted' ? 'granted' : 'needed'))
      .catch(() => setMicStatus('needed'));

    // Check notifications
    if ('Notification' in window) {
      setNotifStatus(Notification.permission === 'granted' ? 'granted' : 'needed');
    } else {
      setNotifStatus('granted'); // not supported, treat as fine
    }
  }, []);

  const allGranted = micStatus === 'granted' && notifStatus === 'granted';

  const handleAllowAll = async () => {
    setLoading(true);

    if (micStatus !== 'granted') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        setMicStatus('granted');
      } catch {
        // user denied — still continue
      }
    }

    if (notifStatus !== 'granted' && 'Notification' in window) {
      const result = await Notification.requestPermission();
      setNotifStatus(result === 'granted' ? 'granted' : 'needed');
    }

    setLoading(false);
    onDone();
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>Z</div>

        <h1 className={styles.title}>Allow permissions</h1>
        <p className={styles.subtitle}>
          Zeeble needs a couple of things to work properly. Click Allow All and you're good to go.
        </p>

        <div className={styles.permList}>
          <div className={styles.permItem}>
            <div className={styles.permIcon}><MicIcon /></div>
            <div className={styles.permInfo}>
              <p className={styles.permName}>Microphone</p>
              <p className={styles.permDesc}>Required for voice calls and channels</p>
            </div>
            <span className={styles.permStatus} data-state={micStatus === 'granted' ? 'granted' : micStatus === 'unknown' ? 'system' : 'needed'}>
              {micStatus === 'granted' ? 'Allowed' : micStatus === 'unknown' ? 'Checking…' : 'Needed'}
            </span>
          </div>

          <div className={styles.permItem}>
            <div className={styles.permIcon}><BellIcon /></div>
            <div className={styles.permInfo}>
              <p className={styles.permName}>Notifications</p>
              <p className={styles.permDesc}>Get alerted for messages and mentions</p>
            </div>
            <span className={styles.permStatus} data-state={notifStatus === 'granted' ? 'granted' : notifStatus === 'unknown' ? 'system' : 'needed'}>
              {notifStatus === 'granted' ? 'Allowed' : notifStatus === 'unknown' ? 'Checking…' : 'Needed'}
            </span>
          </div>

          <div className={styles.permItem}>
            <div className={styles.permIcon}><ScreenIcon /></div>
            <div className={styles.permInfo}>
              <p className={styles.permName}>Screen Sharing</p>
              <p className={styles.permDesc}>Share your screen in voice channels</p>
            </div>
            <span className={styles.permStatus} data-state="system">Managed by system</span>
          </div>
        </div>

        <button
          className={styles.allowBtn}
          onClick={handleAllowAll}
          disabled={loading}
        >
          {loading ? 'Requesting…' : allGranted ? 'Continue' : 'Allow All'}
        </button>

        <button className={styles.skipBtn} onClick={onDone}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
