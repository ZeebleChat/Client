/**
 * Full-screen image lightbox overlay.
 * Displays images in a modal with backdrop click to close,
 * keyboard support (Escape), and download button.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Lightbox.module.css';

interface Props {
src: string;
alt?: string;
onClose: () => void;
}

export default function Lightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <button className={styles.close} onClick={onClose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <img
        src={src}
        alt={alt ?? 'image'}
        className={styles.img}
        onClick={e => e.stopPropagation()}
      />
      <a
        href={src}
        download
        className={styles.download}
        onClick={e => e.stopPropagation()}
        title="Download"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </a>
    </div>,
    document.body
  );
}
