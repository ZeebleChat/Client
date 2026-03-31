/**
 * Tenor GIF picker component.
 * Provides searchable GIF selection from Tenor API.
 * Shows trending GIFs by default, with search functionality.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './TenorPicker.module.css';
import { ENV_TENOR_KEY } from '../config';

/** Fallback Tenor API key if none configured */
const DEFAULT_KEY = ENV_TENOR_KEY || 'LIVDSRZULELA';

function getTenorKey(): string {
  return localStorage.getItem('tenor_api_key') || DEFAULT_KEY;
}

interface TenorResult {
  id: string;
  title: string;
  gifUrl: string;
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
}

function parseTenorResults(results: unknown[]): TenorResult[] {
  return results.map((r: unknown) => {
    const result = r as Record<string, unknown>;
    const mediaArr = result.media as Record<string, unknown>[];
    const media = mediaArr?.[0] ?? {};
    const gif = media.gif as Record<string, unknown> | undefined;
    const tinygif = media.tinygif as Record<string, unknown> | undefined;
    const dims = (tinygif?.dims as number[]) ?? [100, 100];
    return {
      id: result.id as string,
      title: result.title as string,
      gifUrl: gif?.url as string,
      previewUrl: (tinygif?.url ?? gif?.url) as string,
      previewWidth: dims[0],
      previewHeight: dims[1],
    };
  }).filter(r => r.gifUrl && r.previewUrl);
}

async function fetchTenor(endpoint: string, params: Record<string, string>): Promise<TenorResult[]> {
  const key = getTenorKey();
  const qs = new URLSearchParams({ key, limit: '24', media_filter: 'minimal', ...params });
  const res = await fetch(`https://api.tenor.com/v1/${endpoint}?${qs}`);
  if (!res.ok) return [];
  const data = await res.json() as { results?: unknown[] };
  return parseTenorResults(data.results ?? []);
}

interface Props {
  onSelect: (gifUrl: string) => void;
}

export default function TenorPicker({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenorResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const data = q.trim()
      ? await fetchTenor('search', { q: q.trim() })
      : await fetchTenor('trending', {});
    setResults(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

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
        <span className={styles.powered}>via Tenor</span>
      </div>

      <div className={styles.grid}>
        {loading && results.length === 0 && (
          <div className={styles.empty}>Loading…</div>
        )}
        {!loading && results.length === 0 && (
          <div className={styles.empty}>No results.</div>
        )}
        {results.map(r => (
          <button
            key={r.id}
            className={styles.gifBtn}
            onClick={() => onSelect(r.gifUrl)}
            title={r.title}
            style={{ aspectRatio: `${r.previewWidth} / ${r.previewHeight}` }}
          >
            <img
              src={r.previewUrl}
              alt={r.title}
              loading="lazy"
              className={styles.gifImg}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
