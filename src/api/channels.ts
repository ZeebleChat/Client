import { getServerUrl } from '../config';
import { authedFetch, unwrapArray, safeJson } from './core';

// ── Channels ──────────────────────────────────────────────────────────────────

export interface ApiChannel {
  id: string | number;
  name: string;
  type: 'text' | 'voice' | 'category' | 'arena' | 'board';
  category_id?: string | number | null;
  position?: number;
  topic?: string;
}

export async function fetchChannels(): Promise<ApiChannel[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/channels`);
    if (!res.ok) return [];
    return unwrapArray<ApiChannel>(await res.json(), 'channels');
  } catch { return []; }
}

export interface UnreadState {
  unread: string[];
  mentions: Record<string, number>;
}

export async function fetchUnreadState(): Promise<UnreadState> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/channels/unread`);
    if (!res.ok) return { unread: [], mentions: {} };
    const data = await res.json();
    return {
      unread: Array.isArray(data.channel_ids) ? data.channel_ids : [],
      mentions: (data.mentions && typeof data.mentions === 'object') ? data.mentions : {},
    };
  } catch { return { unread: [], mentions: {} }; }
}

export async function markChannelRead(channelId: string | number): Promise<void> {
  try {
    await authedFetch(`${getServerUrl()}/v1/channels/${encodeURIComponent(String(channelId))}/read`, { method: 'POST' });
  } catch { /* fire and forget */ }
}

export async function createChannel(
  name: string,
  type: 'text' | 'voice' | 'arena' | 'board' = 'text',
  categoryId: string | number | null = null,
  position = 0
): Promise<{ ok: boolean; data?: ApiChannel; error?: string }> {
  try {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const res = await authedFetch(`${getServerUrl()}/v1/channels`, {
      method: 'POST',
      body: JSON.stringify({ id, name, type, category_id: categoryId, position, topic: '' }),
    });
    const data = await safeJson(res);
    return res.ok ? { ok: true, data: data as unknown as ApiChannel } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function renameChannel(channelId: string | number, name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/channels/${encodeURIComponent(String(channelId))}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function updateChannelPosition(channelId: string | number, position: number, categoryId?: string | number | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const body: Record<string, unknown> = { position };
    if (categoryId !== undefined) body.category_id = categoryId;
    const res = await authedFetch(`${getServerUrl()}/v1/channels/${encodeURIComponent(String(channelId))}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return res.ok ? { ok: true } : { ok: false };
  } catch { return { ok: false }; }
}

export async function deleteChannel(channelId: string | number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/channels/${encodeURIComponent(String(channelId))}`, { method: 'DELETE' });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Categories ────────────────────────────────────────────────────────────────

export interface ApiCategory {
  id: string | number;
  name: string;
  position?: number;
}

export async function fetchCategories(): Promise<ApiCategory[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/categories`);
    if (!res.ok) return [];
    const data = await res.json();
    return unwrapArray<ApiCategory>(data, 'categories');
  } catch { return []; }
}

export async function createCategory(name: string, position = 0): Promise<{ ok: boolean; data?: ApiCategory; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/categories`, {
      method: 'POST',
      body: JSON.stringify({ name, position }),
    });
    const data = await safeJson(res);
    return res.ok ? { ok: true, data: data as unknown as ApiCategory } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function updateCategory(id: string | number, patch: { name?: string; position?: number }): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/categories/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function deleteCategory(id: string | number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/categories/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
