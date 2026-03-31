import { useState, useEffect } from 'react';
import type { HealthStatus } from '../hooks/useHealthCheck';
import styles from './StatusBanner.module.css';

const CONFIG: Record<HealthStatus, { text: string; variant: string }> = {
  ok:              { text: '',                                                  variant: 'ok' },
  api_down:        { text: 'API unreachable \u2014 trying to reconnect\u2026', variant: 'error' },
  server_down:     { text: 'Chat server unreachable \u2014 trying to reconnect\u2026', variant: 'warning' },
  session_expired: { text: 'Session expired \u2014 signing out\u2026',          variant: 'error' },
  reconnected:     { text: 'Connected',                                         variant: 'success' },
};

export default function StatusBanner({ status }: { status: HealthStatus }) {
  const [visible, setVisible] = useState(false);
  const [displayed, setDisplayed] = useState(false);

  useEffect(() => {
    if (status !== 'ok') {
      setDisplayed(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setDisplayed(false), 300);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!displayed) return null;
  const { text, variant } = CONFIG[status];

  return (
    <div
      className={`${styles.banner} ${styles[variant]} ${visible ? styles.visible : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.dot} />
      <span>{text}</span>
    </div>
  );
}
