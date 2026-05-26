import { getAuthUrl, getServerUrl, isZcloudUrl } from '../config';
import { getChatToken, getToken, getBeamIdentity } from '../auth';
import { authedFetch, safeJson } from './core';

// ── Server list ───────────────────────────────────────────────────────────────

export interface ApiServer {
  server_url: string;
  server_name: string;
  joined_at?: string;
}

export async function fetchServers(): Promise<ApiServer[]> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/servers`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.servers ?? []);
  } catch { return []; }
}

export async function addServer(serverUrl: string, serverName: string | null = null): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/servers`, {
      method: 'POST',
      body: JSON.stringify({ server_url: serverUrl, server_name: serverName }),
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function removeServer(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/servers/${encodeURIComponent(serverUrl)}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Server info ───────────────────────────────────────────────────────────────

export interface ServerInfo {
  server_name?: string;
  name?: string;
  version?: string;
  owner?: string;
  owner_beam_identity?: string;
  public_url?: string;
  about?: string;
  logo_attachment_id?: string | null;
  banner_attachment_id?: string | null;
}

export async function fetchServerInfo(serverUrl: string): Promise<ServerInfo | null> {
  try {
    const token = getChatToken(serverUrl) ?? getToken();
    const res = await fetch(`${serverUrl}/v1/server/info`, {
      signal: AbortSignal.timeout(5000),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export function fetchServerAttachment(serverUrl: string, attachmentId: string | number): Promise<Response> {
  const token = getChatToken(serverUrl) ?? getToken();
  return fetch(`${serverUrl}/v1/attachments/${encodeURIComponent(String(attachmentId))}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
}

// ── Server settings ───────────────────────────────────────────────────────────

export interface OwnerSettings {
  server_name: string;
  public_url: string;
  owner_beam_identity: string;
  about: string | null;
  max_message_length: number;
  max_upload_size: string;
  invites_anyone_can_create: boolean;
  default_invite_expiry_hours: number;
  default_invite_max_uses: number;
  allow_new_members: boolean;
  logo_attachment_id: number | null;
  banner_attachment_id: number | null;
  require_email_verified: boolean;
  require_phone_verified: boolean;
  require_age_18_plus: boolean;
  age_proof_methods: string[];
  allow_bots: boolean;
  min_account_age_days: number;
  identity_whitelist: string[];
  identity_blacklist: string[];
  allowed_email_domains: string[];
  max_members: number;
}

export async function fetchOwnerSettings(): Promise<OwnerSettings | null> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/server/settings`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function patchServerSettings(settings: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/server/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Cloud server (ZCloud) ─────────────────────────────────────────────────────

export async function createCloudServer(name: string, about = ''): Promise<{ ok: boolean; data?: { server_url: string; name: string; id: string }; error?: string }> {
  try {
    const body: Record<string, string> = { name };
    if (about.trim()) body.about = about.trim();
    const res = await authedFetch(`${getAuthUrl()}/servers/cloud`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function leaveCloudServer(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
  const identity = getBeamIdentity();
  if (!identity) return { ok: false, error: 'Not logged in' };
  try {
    await authedFetch(`${serverUrl}/v1/members/${encodeURIComponent(identity)}`, { method: 'DELETE' }).catch(() => {});
    const res = await authedFetch(`${getAuthUrl()}/servers/${encodeURIComponent(serverUrl)}`, { method: 'DELETE' });
    return { ok: res.ok || res.status === 204 };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function deleteCloudServer(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(serverUrl, { method: 'DELETE' });
    return { ok: res.ok || res.status === 204 };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
