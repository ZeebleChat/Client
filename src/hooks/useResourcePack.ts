import { useState, useEffect, useCallback } from 'react';
import jsYaml from 'js-yaml';
import {
  type PackMeta,
  type PackColors,
  type EmojiManifest,
  type LoadedPack,
  applyPackColors,
  clearPackColors,
} from '../resourcePack';
import { setPackSounds, clearPackSounds } from '../sounds';

const STORAGE_KEY = 'zeeble-active-pack';
const CSS_OVERRIDE_ID = 'pack-css-overrides';

// ─── Loaders ──────────────────────────────────────────────────────────────────

async function fetchYaml<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const text = await res.text();
  return jsYaml.load(text) as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

async function loadPackFromBase(baseUrl: string): Promise<LoadedPack> {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

  const meta = await fetchYaml<PackMeta>(`${base}pack.yaml`);
  const colors = await fetchYaml<PackColors>(`${base}${meta.assets.colors}`);

  let emojiManifest: EmojiManifest | undefined;
  if (meta.assets.emojis?.manifest) {
    try {
      emojiManifest = await fetchJson<EmojiManifest>(`${base}${meta.assets.emojis.manifest}`);
    } catch {
      // emojis are optional
    }
  }

  return { meta, colors, baseUrl: base, emojiManifest };
}

function injectPackCss(css: string): void {
  removePackCss();
  const el = document.createElement('style');
  el.id = CSS_OVERRIDE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

function removePackCss(): void {
  document.getElementById(CSS_OVERRIDE_ID)?.remove();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseResourcePackReturn {
  activePack: LoadedPack | null;
  loading: boolean;
  error: string | null;
  loadPack: (baseUrl: string) => Promise<void>;
  unloadPack: () => void;
  /** Resolves a relative pack asset path to a full URL. */
  assetUrl: (relativePath: string) => string;
  /** Returns the URL for a named sound slot, or null if unavailable. */
  soundUrl: (key: keyof NonNullable<PackMeta['assets']['sounds']>) => string | null;
}

export function useResourcePack(): UseResourcePackReturn {
  const [activePack, setActivePack] = useState<LoadedPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPack = useCallback((pack: LoadedPack) => {
    applyPackColors(pack.colors);

    if (pack.meta.features?.custom_sounds && pack.meta.assets.sounds) {
      const soundMap: Record<string, string> = {};
      for (const [key, path] of Object.entries(pack.meta.assets.sounds)) {
        if (path) soundMap[key] = pack.baseUrl + path;
      }
      setPackSounds(soundMap);
    }

    if (pack.meta.assets.css) {
      fetch(pack.baseUrl + pack.meta.assets.css)
        .then(r => r.text())
        .then(injectPackCss)
        .catch(() => { /* css is optional */ });
    } else {
      removePackCss();
    }

    setActivePack(pack);
  }, []);

  // Restore saved pack on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    setLoading(true);
    loadPackFromBase(saved)
      .then(applyPack)
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPack = useCallback(async (baseUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      const pack = await loadPackFromBase(baseUrl);
      applyPack(pack);
      localStorage.setItem(STORAGE_KEY, baseUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pack');
    } finally {
      setLoading(false);
    }
  }, [applyPack]);

  const unloadPack = useCallback(() => {
    clearPackColors();
    clearPackSounds();
    removePackCss();
    setActivePack(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const assetUrl = useCallback((relativePath: string): string => {
    return activePack ? activePack.baseUrl + relativePath : '';
  }, [activePack]);

  const soundUrl = useCallback((
    key: keyof NonNullable<PackMeta['assets']['sounds']>
  ): string | null => {
    const path = activePack?.meta.assets.sounds?.[key];
    return path ? activePack!.baseUrl + path : null;
  }, [activePack]);

  return { activePack, loading, error, loadPack, unloadPack, assetUrl, soundUrl };
}
