import { useState, useEffect, useRef, useCallback } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import type { IGif } from '@giphy/js-types';
import giphyBadge from '../assets/Giphy/PoweredBy_200_Horizontal_Light-Backgrounds_With_Logo.gif';
import styles from './GiphyPicker.module.css';

const gf = new GiphyFetch('rvm0CMEavRSoTZuWu7bcoNYyVjZpynLo');
const LIMIT = 24;

type Mode = 'gifs' | 'stickers' | 'translate';

interface GifResult {
  id: string;
  title: string;
  gifUrl: string;
  previewUrl: string;
}

function toResult(gif: IGif): GifResult {
  return {
    id: gif.id as string,
    title: gif.title,
    gifUrl: gif.images.original.url,
    previewUrl: gif.images.fixed_width_downsampled?.url ?? gif.images.original.url,
  };
}

interface Props {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export default function GiphyPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('gifs');
  const [results, setResults] = useState<GifResult[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const queryRef = useRef('');
  const categoryRef = useRef<string | null>(null);
  const modeRef = useRef<Mode>('gifs');
  const hasMoreRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (q: string, cat: string | null, m: Mode) => {
    setLoading(true);
    offsetRef.current = 0;
    loadingMoreRef.current = false;
    hasMoreRef.current = true;
    setHasMore(true);
    try {
      if (m === 'translate' && q.trim()) {
        const key = 'rvm0CMEavRSoTZuWu7bcoNYyVjZpynLo';
        const term = encodeURIComponent(q.trim());
        const fetches = [0, 2, 4, 6, 8, 10].map(w =>
          fetch(`https://api.giphy.com/v1/gifs/translate?api_key=${key}&s=${term}&weirdness=${w}`)
            .then(r => r.json()).then(j => j.data ? toResult(j.data) : null).catch(() => null)
        );
        const raw = await Promise.all(fetches);
        const seen = new Set<string>();
        setResults(raw.filter((r): r is GifResult => {
          if (!r || seen.has(r.id)) return false;
          seen.add(r.id); return true;
        }));
        setHasMore(false);
        hasMoreRef.current = false;
      } else {
        const term = q.trim() || cat || '';
        const type = m === 'translate' ? 'gifs' : m;
        const { data } = term
          ? await gf.search(term, { limit: LIMIT, offset: 0, rating: 'g', type })
          : await gf.trending({ limit: LIMIT, offset: 0, rating: 'g', type });
        setResults(data.map(toResult));
        offsetRef.current = LIMIT;
        const more = data.length === LIMIT;
        setHasMore(more);
        hasMoreRef.current = more;
      }
    } catch {
      setResults([]);
      setHasMore(false);
      hasMoreRef.current = false;
    }
    setLoading(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const q = queryRef.current;
    const cat = categoryRef.current;
    const m = modeRef.current;
    if (m === 'translate') return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const off = offsetRef.current;
      const term = q.trim() || cat || '';
      const { data } = term
        ? await gf.search(term, { limit: LIMIT, offset: off, rating: 'g', type: m })
        : await gf.trending({ limit: LIMIT, offset: off, rating: 'g', type: m });
      setResults(prev => [...prev, ...data.map(toResult)]);
      offsetRef.current = off + LIMIT;
      const more = data.length === LIMIT;
      setHasMore(more);
      hasMoreRef.current = more;
    } catch {}
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, []);

  useEffect(() => { queryRef.current = query; }, [query]);
  useEffect(() => { categoryRef.current = category; }, [category]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    load('', null, 'gifs');
    gf.categories().then(({ data }) => {
      setCategories(data.slice(0, 20).map((c: { name: string }) => c.name));
    }).catch(() => {});
  }, [load]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const grid = gridRef.current;
    if (!sentinel || !grid) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: grid, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  function handleQuery(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    setCategory(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(q, null, mode), 350);
  }

  function switchMode(m: Mode) {
    setMode(m);
    load(query, category, m);
  }

  function selectCategory(cat: string) {
    setQuery('');
    setCategory(cat);
    load('', cat, mode);
  }

  async function handleSurprise() {
    setLoading(true);
    try {
      const type = mode === 'translate' ? 'gifs' : mode;
      const { data } = await gf.random({ type, rating: 'g' });
      setResults([toResult(data)]);
      setHasMore(false);
      hasMoreRef.current = false;
    } catch { setResults([]); }
    setLoading(false);
  }

  return (
    <div className={styles.picker}>
      <div className={styles.tab}>
        <div className={styles.badgeFrame}>
          <img src={giphyBadge} alt="Powered by GIPHY" className={styles.powered} loading="eager" />
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close GIF picker">✕</button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.modeToggle}>
          <button className={`${styles.modeBtn} ${mode === 'gifs' ? styles.modeBtnActive : ''}`} onClick={() => switchMode('gifs')}>GIFs</button>
          <button className={`${styles.modeBtn} ${mode === 'stickers' ? styles.modeBtnActive : ''}`} onClick={() => switchMode('stickers')}>Stickers</button>
          <button className={`${styles.modeBtn} ${mode === 'translate' ? styles.modeBtnActive : ''}`} onClick={() => switchMode('translate')}>Translate</button>
        </div>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={handleSurprise} title="Surprise me — random GIF">🎲</button>
        </div>
      </div>

      <div className={styles.header}>
        <input
          className={styles.search}
          value={query}
          onChange={handleQuery}
          placeholder={mode === 'translate' ? 'Type a word to translate…' : 'Search GIFs…'}
          autoFocus
          autoComplete="off"
        />
      </div>

      {categories.length > 0 && (
        <div className={styles.categories}>
          {categories.map(cat => (
            <button
              key={cat}
              className={`${styles.catChip} ${category === cat ? styles.catChipActive : ''}`}
              onClick={() => selectCategory(cat)}
            >{cat}</button>
          ))}
        </div>
      )}

      <div className={styles.grid} ref={gridRef}>
        {loading && <div className={styles.empty}>Loading…</div>}
        {!loading && results.length === 0 && <div className={styles.empty}>No results.</div>}
        {!loading && (
          <div className={styles.columns}>
            {results.map(r => (
              <button key={r.id} className={styles.gifBtn} onClick={() => onSelect(r.gifUrl)} title={r.title}>
                <img src={r.previewUrl} alt={r.title} className={styles.gifImg} />
              </button>
            ))}
          </div>
        )}
        {loadingMore && <div className={styles.loadingMore}>Loading…</div>}
        <div ref={sentinelRef} className={styles.sentinel} />
      </div>
    </div>
  );
}
