/**
 * Custom title bar for Tauri's decoration-less window.
 * Matches Zeeble's neumorphic design language (Rail colours, accent gradient,
 * Plus Jakarta Sans font). Hidden automatically when running in a browser.
 */
import { useState, useEffect, useRef } from 'react';
import styles from './TitleBar.module.css';
import { subscribe, markRead, getUnreadCount, type NotifItem, type NotifType } from '../notificationStore';

const isTauri = () => '__TAURI_INTERNALS__' in window;

async function getWin() {
  if (!isTauri()) return null;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

type NotifTab = 'pings' | 'messages' | 'friend-requests' | 'broadcasts';

const NOTIF_TABS: { id: NotifTab; label: string }[] = [
  { id: 'pings',           label: 'Pings' },
  { id: 'messages',        label: 'Messages' },
  { id: 'friend-requests', label: 'Friends' },
  { id: 'broadcasts',      label: 'Broadcasts' },
];

const TAB_TYPE: Record<NotifTab, NotifType> = {
  'pings':           'ping',
  'messages':        'dm',
  'friend-requests': 'friend-request',
  'broadcasts':      'broadcast',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<NotifTab>('pings');
  const [items, setItems] = useState<NotifItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => subscribe(setItems), []);

  // Mark the active tab's type as read whenever the tab changes or panel opens
  useEffect(() => {
    markRead(TAB_TYPE[tab]);
  }, [tab]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const tabItems = items.filter(i => i.type === TAB_TYPE[tab]);

  return (
    <div className={styles.notifPanel} ref={ref}>
      <div className={styles.notifHeader}>
        <span className={styles.notifTitle}>Notifications</span>
      </div>
      <div className={styles.notifTabs}>
        {NOTIF_TABS.map(t => {
          const unread = items.filter(i => i.type === TAB_TYPE[t.id] && !i.read).length;
          return (
            <button
              key={t.id}
              className={`${styles.notifTab} ${tab === t.id ? styles.notifTabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {unread > 0 && <span className={styles.tabBadge}>{unread}</span>}
            </button>
          );
        })}
      </div>
      <div className={styles.notifBody}>
        {tabItems.length === 0 ? (
          <div className={styles.notifEmpty}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.notifEmptyIcon}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span>All caught up</span>
          </div>
        ) : (
          tabItems.map(item => (
            <div key={item.id} className={`${styles.notifItem} ${!item.read ? styles.notifItemUnread : ''}`}>
              <div className={styles.notifItemHeader}>
                <span className={styles.notifItemTitle}>{item.title}</span>
                <span className={styles.notifItemTime}>{timeAgo(item.timestamp)}</span>
              </div>
              <div className={styles.notifItemBody}>{item.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function TitleBar() {
  if (!isTauri()) return null;

  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    return subscribe(() => setUnread(getUnreadCount()));
  }, []);

  // When panel opens, mark active tab (pings) as read immediately
  useEffect(() => {
    if (notifOpen) markRead('ping');
  }, [notifOpen]);

  const minimize = async () => (await getWin())?.minimize();
  const maximize = async () => (await getWin())?.toggleMaximize();
  const close    = async () => (await getWin())?.close();

  const startDrag = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    (await getWin())?.startDragging();
  };

  return (
    <div className={styles.bar}>

      {/* Brand */}
      <div className={styles.brand}>
        <div className={styles.logo}>Z</div>
        <span className={styles.appName}>Zeeble</span>
      </div>

      {/* Notifications bell */}
      <div className={styles.notifWrap}>
        <button
          className={`${styles.btn} ${notifOpen ? styles.btnActive : ''}`}
          onClick={() => setNotifOpen(v => !v)}
          title="Notifications"
          aria-label="Notifications"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
        </button>
        {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
      </div>

      {/* Drag region */}
      <div className={styles.drag} onMouseDown={startDrag} />

      {/* Window controls */}
      <div className={styles.controls}>

        <button className={`${styles.btn} ${styles.btnMin}`} onClick={minimize} title="Minimize">
          <svg width="10" height="2" viewBox="0 0 10 2" aria-hidden fill="none">
            <rect x="0" y="0.5" width="10" height="1" rx="0.5" fill="currentColor" />
          </svg>
        </button>

        <button className={`${styles.btn} ${styles.btnMax}`} onClick={maximize} title="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden fill="none">
            <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>

        <button className={`${styles.btn} ${styles.btnClose}`} onClick={close} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden fill="none">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

      </div>
    </div>
  );
}
