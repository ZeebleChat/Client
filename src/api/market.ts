import { getMarketUrl } from '../config';
import { authedFetch, safeJson } from './core';

// ── Community Marketplace (zmarket) ──────────────────────────────────────────

export interface MarketPackListing {
  id: string;
  name: string;
  category: string;
  preview_emoji: string;
  price_ichor: number;
  description: string | null;
  pack_url: string | null;
  author_beam_identity: string;
  author_display_name: string;
  status: string;
  sales: number;
  created_at: string;
}

export async function fetchMarketListings(
  category?: string,
  sort?: string,
): Promise<MarketPackListing[]> {
  try {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (sort) params.set('sort', sort);
    const query = params.toString() ? `?${params}` : '';
    const res = await fetch(`${getMarketUrl()}/packs${query}`);
    if (!res.ok) return [];
    const data = await safeJson<{ packs: MarketPackListing[] }>(res);
    return data.packs ?? [];
  } catch { return []; }
}

export async function uploadPack(
  formData: FormData,
): Promise<{ ok: boolean; id?: string; pack_url?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getMarketUrl()}/packs/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const data = await safeJson<{ error: string }>(res);
      return { ok: false, error: data.error || 'Upload failed' };
    }
    const data = await safeJson<{ ok: boolean; id: string; pack_url: string }>(res);
    return { ok: true, id: data.id, pack_url: data.pack_url };
  } catch { return { ok: false, error: 'Network error' }; }
}

export async function fetchMyMarketPacks(): Promise<MarketPackListing[]> {
  try {
    const res = await authedFetch(`${getMarketUrl()}/packs/mine`);
    if (!res.ok) return [];
    const data = await safeJson<{ packs: MarketPackListing[] }>(res);
    return data.packs ?? [];
  } catch { return []; }
}

export async function deleteMarketPack(id: string): Promise<boolean> {
  try {
    const res = await authedFetch(`${getMarketUrl()}/packs/${id}`, { method: 'DELETE' });
    return res.status === 204;
  } catch { return false; }
}
