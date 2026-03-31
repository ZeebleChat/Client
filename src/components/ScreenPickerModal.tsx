import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import s from './ScreenPickerModal.module.css';

interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  source_type: 'screen' | 'window';
}

interface Props {
  onShare: (sourceId: string) => void;
  onClose: () => void;
}

export default function ScreenPickerModal({ onShare, onClose }: Props) {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    invoke<CaptureSource[]>('get_capture_sources')
      .then(setSources)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = sources.filter(s => s.source_type === tab);

  return (
    <div className={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <button className={s.closeBtn} onClick={onClose}>✕</button>

        <div className={s.header}>
          <div className={s.icon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <div>
            <div className={s.title}>Share your screen</div>
            <div className={s.subtitle}>Choose a window or screen to share</div>
          </div>
        </div>

        <div className={s.tabs}>
          <button
            className={`${s.tab} ${tab === 'screen' ? s.tabActive : ''}`}
            onClick={() => { setTab('screen'); setSelected(null); }}
          >
            Screens
          </button>
          <button
            className={`${s.tab} ${tab === 'window' ? s.tabActive : ''}`}
            onClick={() => { setTab('window'); setSelected(null); }}
          >
            Windows
          </button>
        </div>

        {loading ? (
          <div className={s.loading}>
            <div className={s.spinner} />
            Capturing previews…
          </div>
        ) : filtered.length === 0 ? (
          <div className={s.loading}>No {tab === 'screen' ? 'screens' : 'windows'} found</div>
        ) : (
          <div className={s.grid}>
            {filtered.map(src => (
              <div
                key={src.id}
                className={`${s.sourceCard} ${selected === src.id ? s.sourceCardSelected : ''}`}
                onClick={() => setSelected(src.id)}
              >
                <div className={s.thumb}>
                  {src.thumbnail ? (
                    <img src={`data:image/jpeg;base64,${src.thumbnail}`} alt={src.name} />
                  ) : (
                    <svg className={s.thumbPlaceholder} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  )}
                  {selected === src.id && (
                    <div className={s.selectedBadge}>✓</div>
                  )}
                </div>
                <div className={s.cardName}>{src.name}</div>
              </div>
            ))}
          </div>
        )}

        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={s.shareBtn}
            disabled={!selected}
            onClick={() => selected && onShare(selected)}
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
