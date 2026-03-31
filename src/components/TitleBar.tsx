/**
 * Custom title bar for Tauri's decoration-less window.
 * Matches Zeeble's neumorphic design language (Rail colours, accent gradient,
 * Plus Jakarta Sans font). Hidden automatically when running in a browser.
 */
import styles from './TitleBar.module.css';

const isTauri = () => '__TAURI_INTERNALS__' in window;

async function getWin() {
  if (!isTauri()) return null;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export default function TitleBar() {
  if (!isTauri()) return null;

  const minimize = async () => (await getWin())?.minimize();
  const maximize = async () => (await getWin())?.toggleMaximize();
  const close    = async () => (await getWin())?.close();

  // startDragging is more reliable than the data-tauri-drag-region attribute
  const startDrag = async (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only
    (await getWin())?.startDragging();
  };

  return (
    <div className={styles.bar}>

      {/* Brand — same gradient Z as the Rail */}
      <div className={styles.brand}>
        <div className={styles.logo}>Z</div>
        <span className={styles.appName}>Zeeble</span>
      </div>

      {/* Drag region fills the middle — mousedown triggers native window drag */}
      <div className={styles.drag} onMouseDown={startDrag} />

      {/* Neumorphic window controls */}
      <div className={styles.controls}>

        {/* Minimize */}
        <button
          className={`${styles.btn} ${styles.btnMin}`}
          onClick={minimize}
          title="Minimize"
        >
          {/* minus bar */}
          <svg width="10" height="2" viewBox="0 0 10 2" aria-hidden fill="none">
            <rect x="0" y="0.5" width="10" height="1" rx="0.5" fill="currentColor" />
          </svg>
        </button>

        {/* Maximize */}
        <button
          className={`${styles.btn} ${styles.btnMax}`}
          onClick={maximize}
          title="Maximize"
        >
          {/* rounded square */}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden fill="none">
            <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>

        {/* Close */}
        <button
          className={`${styles.btn} ${styles.btnClose}`}
          onClick={close}
          title="Close"
        >
          {/* × */}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden fill="none">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

      </div>
    </div>
  );
}
