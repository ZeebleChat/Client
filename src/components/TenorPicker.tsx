import { useState, useEffect, useRef, useCallback } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import styles from './TenorPicker.module.css';

const gf = new GiphyFetch('rvm0CMEavRSoTZuWu7bcoNYyVjZpynLo');

interface GifResult {
  id: string;
  title: string;
  gifUrl: string;
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
}

async function fetchGifs(q?: string): Promise<GifResult[]> {
  const { data } = q?.trim()
    ? await gf.search(q.trim(), { limit: 24, rating: 'g' })
    : await gf.trending({ limit: 24, rating: 'g' });

  return data.map(gif => ({
    id: gif.id as string,
    title: gif.title,
    gifUrl: gif.images.original.url,
    previewUrl: gif.images.fixed_width_downsampled?.url ?? gif.images.original.url,
    previewWidth: Number(gif.images.fixed_width_downsampled?.width ?? 200),
    previewHeight: Number(gif.images.fixed_width_downsampled?.height ?? 150),
  }));
}

interface Props {
  onSelect: (gifUrl: string) => void;
}

export default function TenorPicker({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const data = await fetchGifs(q || undefined);
    setResults(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(''); }, [load]);

  function handleQuery(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(q), 350);
  }

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <input
          className={styles.search}
          value={query}
          onChange={handleQuery}
          placeholder="Search GIFs…"
          autoFocus
          autoComplete="off"
        />
        <span className={styles.powered}>via GIPHY</span>
      </div>

      <div className={styles.grid}>
        {loading && results.length === 0 && <div className={styles.empty}>Loading…</div>}
        {!loading && results.length === 0 && <div className={styles.empty}>No results.</div>}
        {results.map(r => (
          <button
            key={r.id}
            className={styles.gifBtn}
            onClick={() => onSelect(r.gifUrl)}
            title={r.title}
            style={{ aspectRatio: `${r.previewWidth} / ${r.previewHeight}` }}
          >
            <img src={r.previewUrl} alt={r.title} loading="lazy" className={styles.gifImg} />
          </button>
        ))}
      </div>
    </div>
  );
}
