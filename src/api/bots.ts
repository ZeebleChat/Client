import { getServerUrl } from '../config';
import { authedFetch, safeJson } from './core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiBot {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
}

export interface ApiWebhook {
  id: string;
  name: string;
  url: string;
  channel_id: string | null;
  events: string;
  created_by: string;
  created_at: number;
}

// ── Bot management ─────────────────────────────────────────────────────────────

export async function listBots(): Promise<ApiBot[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/bots`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.bots ?? [];
  } catch { return []; }
}

export async function createBot(name: string): Promise<{ ok: boolean; id?: string; name?: string; token?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/bots`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true, ...data as { id: string; name: string; token: string } };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function deleteBot(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/bots/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) { const data = await safeJson(res); return { ok: false, error: data.error as string }; }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Webhook management ─────────────────────────────────────────────────────────

export async function listWebhooks(): Promise<ApiWebhook[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/webhooks`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.webhooks ?? [];
  } catch { return []; }
}

export async function createWebhook(payload: {
  name: string;
  url: string;
  events: string;
  channel_id?: string;
}): Promise<{ ok: boolean; id?: string; secret?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/webhooks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true, ...data as { id: string; secret: string } };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function deleteWebhook(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) { const data = await safeJson(res); return { ok: false, error: data.error as string }; }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
