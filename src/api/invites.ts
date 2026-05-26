import { authedFetch, safeJson } from './core';

// ── Invites ───────────────────────────────────────────────────────────────────

export interface ServerInvite {
  code: string;
  created_by: string;
  use_count: number;
  max_uses: number | null;
  expires_at: number | string | null;
  created_at: number | string;
}

export async function listInvites(serverUrl: string): Promise<{ invites: ServerInvite[]; forbidden: boolean }> {
  try {
    const res = await authedFetch(`${serverUrl}/v1/invites`);
    if (res.status === 403) return { invites: [], forbidden: true };
    const data = await safeJson(res);
    const invites: ServerInvite[] = Array.isArray(data) ? data as ServerInvite[] : (data.invites as ServerInvite[] ?? []);
    return { invites, forbidden: false };
  } catch { return { invites: [], forbidden: false }; }
}

export async function createServerInvite(serverUrl: string, opts?: { max_uses?: number; expires_in_secs?: number }): Promise<{ ok: boolean; code?: string; url?: string; error?: string }> {
  try {
    const res = await authedFetch(`${serverUrl}/v1/invites`, {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    });
    const data = await safeJson(res);
    const url = (data.web_url ?? data.url) as string | undefined;
    return { ok: res.ok, url, code: data.code as string | undefined, error: data.error as string | undefined };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function deleteServerInvite(serverUrl: string, code: string): Promise<boolean> {
  try {
    const res = await authedFetch(`${serverUrl}/v1/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
    return res.ok || res.status === 204;
  } catch { return false; }
}

export async function validateInvite(serverUrl: string, code: string): Promise<{ ok: boolean; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(`${serverUrl}/v1/invites/${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await safeJson(res);
    return { ok: res.ok, data };
  } catch { return { ok: false }; }
}

export async function redeemInvite(serverUrl: string, code: string, chatToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${serverUrl}/v1/invites/${encodeURIComponent(code)}/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chatToken}` },
      signal: AbortSignal.timeout(5000),
    });
    const data = await safeJson(res);
    return { ok: res.ok, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
