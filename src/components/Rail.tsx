/**
 * Server rail (left sidebar) component.
 * Shows server icons in a vertical strip for quick switching.
 * Includes brand logo and add server button.
 */
import type { Server } from '../types';
import styles from './Rail.module.css';

interface Props {
servers: Server[];
activeServerId: string;
onSelectServer: (id: string) => void;
}

const LayersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
);

const SmileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
);

const TrophyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="7"/>
    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const SERVER_ICONS = [LayersIcon, SmileIcon, TrophyIcon];

export default function Rail({ servers, activeServerId, onSelectServer }: Props) {
  return (
    <nav className={styles.rail}>
      <div className={styles.brand}>Z</div>
      <div className={styles.sep} />

      {servers.map((server, i) => {
        const Icon = SERVER_ICONS[i % SERVER_ICONS.length];
        const isActive = server.id === activeServerId;
        return (
          <button
            key={server.id}
            className={`${styles.node} ${isActive ? styles.active : ''}`}
            title={server.name}
            onClick={() => onSelectServer(server.id)}
          >
            <Icon />
            {server.unread ? (
              <span className={styles.badge}>{server.unread}</span>
            ) : null}
          </button>
        );
      })}

      <div className={`${styles.sep} ${styles.sepBottom}`} />
      <button className={styles.node} title="Add Server">
        <PlusIcon />
      </button>
    </nav>
  );
}
