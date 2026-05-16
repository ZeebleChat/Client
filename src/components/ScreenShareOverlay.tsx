/**
 * Overlay for displaying remote screen shares during voice calls.
 * Renders base64 JPEG frames pushed from the server at ~15 fps.
 * Can be minimized, expanded to fill the screen, or dragged anywhere.
 */
import { useState, useRef, useCallback } from 'react';
import styles from './ScreenShareOverlay.module.css';

interface Props {
  frames: Map<string, string>; // identity → latest base64 JPEG
}

const ExpandIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);

const CollapseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
    <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
  </svg>
);

export default function ScreenShareOverlay({ frames }: Props) {
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // null = use CSS default (bottom-right). Once dragged, holds top-left in px.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag from the header itself, not its buttons.
    if ((e.target as HTMLElement).closest('button')) return;
    if (expanded) return;

    e.preventDefault();
    const rect = overlayRef.current!.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };

    function onMove(ev: PointerEvent) {
      if (!dragOffset.current) return;
      const x = Math.max(0, Math.min(window.innerWidth  - rect.width,  ev.clientX - dragOffset.current.dx));
      const y = Math.max(0, Math.min(window.innerHeight - rect.height, ev.clientY - dragOffset.current.dy));
      setPos({ x, y });
    }

    function onUp() {
      dragOffset.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [expanded]);

  if (frames.size === 0) return null;

  const entries = Array.from(frames.entries());

  const posStyle: React.CSSProperties = expanded
    ? {}
    : pos
      ? { top: pos.y, left: pos.x, bottom: 'auto', right: 'auto' }
      : {};

  return (
    <div
      ref={overlayRef}
      className={`${styles.overlay} ${minimized ? styles.minimized : ''} ${expanded ? styles.expanded : ''}`}
      style={posStyle}
    >
      <div
        className={styles.header}
        onPointerDown={onPointerDown}
        style={{ cursor: expanded ? 'default' : 'grab' }}
      >
        <span className={styles.liveTag}>LIVE</span>
        <span className={styles.headerText}>
          {entries.length === 1 ? entries[0][0] : `${entries.length} screens`}
        </span>
        {!minimized && (
          <button
            className={styles.minimizeBtn}
            title={expanded ? 'Collapse' : 'Expand'}
            onClick={() => { setExpanded(e => !e); setPos(null); }}
          >
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        )}
        <button
          className={styles.minimizeBtn}
          title={minimized ? 'Show' : 'Minimise'}
          onClick={() => { setMinimized(m => !m); if (!minimized) setExpanded(false); }}
        >
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
