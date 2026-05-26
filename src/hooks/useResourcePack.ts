import { useState, useEffect, useCallback } from 'react';
import jsYaml from 'js-yaml';
import { invoke } from '@tauri-apps/api/core';
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

// ─── packs:// compatibility layer ─────────────────────────────────────────────
// fetch() is blocked by CSP for custom URI schemes. For packs://localhost/<name>/<path>
// we route through the read_pack_asset Tauri command instead, which uses IPC (CSP-exempt).

// Extracts the path portion after packs://localhost/ — e.g.
// "packs://localhost/local/debug/colors.yaml" → "local/debug/colors.yaml"
function parsePacks(url: string): string | null {
  const m = url.match(/^packs:\/\/localhost\/(.+)$/);
  return m ? m[1] : null;
}

async function readText(url: string): Promise<string> {
  const relPath = parsePacks(url);
  if (relPath) return invoke<string>('read_pack_asset', { relPath });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  return res.text();
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

async function fetchYaml<T>(url: string): Promise<T> {
  return jsYaml.load(await readText(url)) as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const relPath = parsePacks(url);
  if (relPath) {
    const text = await invoke<string>('read_pack_asset', { relPath });
    return JSON.parse(text) as T;
  }
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
      // Strip any emoji entries whose file path isn't a safe relative image path.
      // This prevents a malicious market pack from injecting URLs or attribute
      // payloads via entry.file when it's interpolated into HTML in ChatMain.
      if (emojiManifest) {
        emojiManifest.emojis = emojiManifest.emojis.filter(e =>
          typeof e.file === 'string' &&
          !e.file.includes('..') &&
          !/^[a-z][a-z0-9+\-.]*:/i.test(e.file) &&    // no protocol (http:, data:, …)
          !/[?#"'<>]/.test(e.file) &&                   // no query/fragment/attr-break chars
          /\.(?:png|gif|webp|svg|apng)$/i.test(e.file) // must end with an image extension
        );
      }
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
      readText(pack.baseUrl + pack.meta.assets.css)
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
