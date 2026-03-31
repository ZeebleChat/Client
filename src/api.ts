/**
 * Central API module for Zeeble client.
 * Provides functions for authentication, server management, messaging,
 * channels, categories, members, file uploads, friends, DM, and account operations.
 * Includes token refresh logic and automatic retry on 401 responses.
 */
import { getAuthUrl, getServerUrl, getDmUrl, isZcloudUrl } from './config';
import {
  getToken,
  getUid,
  getRefreshToken,
  getChatToken,
  setChatToken,
  forceLogout,
  saveSession,
  getBeamIdentity,
} from './auth';

// ── Refresh coordination ──────────────────────────────────────────────────────

let refreshInProgress = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInProgress && refreshPromise) return refreshPromise;
  const refreshToken = getRefreshToken();
  const uid = getUid();
  if (!refreshToken || !uid) return false;

  refreshInProgress = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getAuthUrl()}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken, uid }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.token) {
        saveSession(data);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshInProgress = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

export async function authedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const chatBase = getServerUrl();
  const chatBasePrefix = chatBase.endsWith('/') ? chatBase : chatBase + '/';

  let token = getToken();
  const extraHeaders: Record<string, string> = {};

  if (url.startsWith(chatBasePrefix)) {
    const chatToken = getChatToken(chatBase);
    if (chatToken) token = chatToken;
    if (!isZcloudUrl(chatBase)) {
      extraHeaders['X-Active-Server'] = chatBase;
    }
  }

  const headers: Record<string, string> = {
    ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
    ...(opts.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      let retryToken = getToken();
      if (url.startsWith(chatBasePrefix)) {
        // Re-exchange to get a fresh chat token — don't retry with the stale one
        await exchangeToken(chatBase);
        const chatToken = getChatToken(chatBase);
        if (chatToken) retryToken = chatToken;
      }
      return fetch(url, { ...opts, headers: { ...headers, Authorization: `Bearer ${retryToken}` } });
    }
    forceLogout();
  }

  return res;
}

function unwrapArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, unknown>)[key] as T[];
  }
  return [];
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Response from login/register endpoints */
export interface LoginResult {
ok: boolean;
status?: number;
data?: { token: string; beam_identity: string; uid?: string; refresh_token?: string };
error?: string;
}

/**
 * Authenticates a user with beam_identity and password.
 * @param beam_identity - The user's unique identifier (e.g., "user#1234")
 * @param password - User's password
 * @returns LoginResult with token and user info on success
 */
export async function loginReq(beam_identity: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${getAuthUrl()}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ beam_identity, password }),
  });
  const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
  return { ok: res.ok, status: res.status, data };
}

export interface RegisterResult {
ok: boolean;
status?: number;
data?: { token: string; beam_identity: string; uid?: string; refresh_token?: string };
error?: string;
}

/**
 * Registers a new user account.
 * @param beam_identity - Desired unique identifier
 * @param password - Password (minimum 8 characters recommended)
 * @param display_name - Optional display name shown to other users
 * @returns RegisterResult with token and user info on success
 */
export async function registerReq(
  beam_identity: string,
  password: string,
  display_name?: string,
  email?: string
): Promise<RegisterResult> {
  const res = await fetch(`${getAuthUrl()}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ beam_identity, password, display_name, email }),
  });
  const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
  return { ok: res.ok, status: res.status, data };
}

/**
 * Redeems a promo code for the given authenticated user.
 * Must be called after registration/login with the user's token.
 */
export async function redeemPromoReq(
  token: string,
  code: string
): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`${getAuthUrl()}/promo/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// ── Token exchange ────────────────────────────────────────────────────────────

async function resolveAudience(connectionUrl: string): Promise<string> {
  if (isZcloudUrl(connectionUrl)) return connectionUrl;
  try {
    const res = await fetch(`${connectionUrl}/server/info`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const info = await res.json();
      if (info?.public_url) return info.public_url.replace(/\/$/, '');
    }
  } catch { /* fall through */ }
  return connectionUrl;
}

export async function exchangeToken(connectionUrl: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const audience = await resolveAudience(connectionUrl);
  const doExchange = (tok: string) =>
    fetch(`${getAuthUrl()}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ server_url: audience }),
    });

  try {
    let res = await doExchange(getToken());
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) res = await doExchange(getToken());
    }
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: data.error };
    }
    const data = await res.json();
    if (data.token) {
      setChatToken(connectionUrl, data.token);
      return { ok: true, token: data.token };
    }
    return { ok: false, error: 'No token in response' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Servers ───────────────────────────────────────────────────────────────────

/** Server object from the API */
export interface ApiServer {
server_url: string;
server_name: string;
joined_at?: string;
}

/**
 * Fetches the list of servers the authenticated user has joined.
 * @returns Array of ApiServer objects
 */
export async function fetchServers(): Promise<ApiServer[]> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/servers`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.servers ?? []);
  } catch {
    return [];
  }
}

// ── Server info ───────────────────────────────────────────────────────────────

/** Server metadata from /server/info endpoint */
export interface ServerInfo {
server_name?: string;
name?: string;
version?: string;
owner?: string;
owner_beam_identity?: string;
public_url?: string;
about?: string;
logo_attachment_id?: number | null;
}

/** Build a URL to an attachment hosted on a specific chat server */
export function getServerAttachmentUrl(serverUrl: string, attachmentId: number | string): string {
  const token = getChatToken(serverUrl) ?? getToken();
  return `${serverUrl}/attachments/${encodeURIComponent(String(attachmentId))}?token=${encodeURIComponent(token ?? '')}`;
}

/**
 * Fetches public server information (used for server settings to determine ownership).
 * @param serverUrl - The server's base URL
 * @returns ServerInfo or null if fetch fails
 */
export async function fetchServerInfo(serverUrl: string): Promise<ServerInfo | null> {
  try {
    const res = await fetch(`${serverUrl}/server/info`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Channels ──────────────────────────────────────────────────────────────────

/** Channel object from the API */
export interface ApiChannel {
id: string | number;
name: string;
type: 'text' | 'voice' | 'category';
category_id?: string | number | null;
position?: number;
topic?: string;
}

/**
 * Fetches all channels (text and voice) for the current server.
 * @returns Array of ApiChannel objects
 */
export async function fetchChannels(): Promise<ApiChannel[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/channels`);
    if (!res.ok) return [];
    return unwrapArray<ApiChannel>(await res.json(), 'channels');
  } catch {
    return [];
  }
}

// ── Categories ────────────────────────────────────────────────────────────────

/** Category for grouping channels */
export interface ApiCategory {
id: string | number;
name: string;
position?: number;
}

/**
 * Fetches all channel categories for the current server.
 * @returns Array of ApiCategory objects
 */
export async function fetchCategories(): Promise<ApiCategory[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/categories`);
    if (!res.ok) return [];
    const data = await res.json();
    return unwrapArray<ApiCategory>(data, 'categories');
  } catch {
    return [];
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

/** File attachment on a message */
export interface ApiAttachment {
id: string | number;
filename?: string;
content_type?: string;
size?: number;
}

/** Chat message from the API */
export interface ApiMessage {
id: string | number;
channel_id: string | number;
beam_identity: string;
content: string;
created_at: number | string;
attachments?: ApiAttachment[];
edited_at?: string | null;
}

/**
 * Fetches message history for a channel.
 * @param channelId - The channel's ID
 * @returns Array of ApiMessage objects
 */
export async function fetchMessages(channelId: string | number): Promise<ApiMessage[]> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/channels/${encodeURIComponent(String(channelId))}/messages`
    );
    if (!res.ok) return [];
    return unwrapArray<ApiMessage>(await res.json(), 'messages');
  } catch {
    return [];
  }
}

/**
 * Sends a message via HTTP (alternative to WebSocket).
 * @param channelId - Target channel ID
 * @param content - Message text
 * @param attachmentIds - Optional array of attachment IDs
 * @returns Result with created message or error
 */
export async function sendMessageHttp(
channelId: string | number,
content: string,
attachmentIds: (string | number)[] = []
): Promise<{ ok: boolean; data?: ApiMessage; error?: string }> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/channels/${encodeURIComponent(String(channelId))}/messages`,
      { method: 'POST', body: JSON.stringify({ content, attachment_ids: attachmentIds }) }
    );
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true, data } : { ok: false, error: data.error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Members ───────────────────────────────────────────────────────────────────

/** Individual member in a group */
export interface ApiMemberUser {
name: string;
role?: string | null;
status?: string;
avatar?: string | null;
is_owner?: boolean;
}

/** Grouped members (e.g., "Online", "Offline", or role-based) */
export interface ApiMemberGroup {
category: string;
users: ApiMemberUser[];
}

/**
 * Fetches server members, grouped by status or role.
 * @returns Array of ApiMemberGroup objects
 */
export async function fetchMembers(): Promise<ApiMemberGroup[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/members`);
    if (!res.ok) return [];
    const raw = unwrapArray<unknown>(await res.json(), 'members');
    return normalizeFlatMembers(raw);
  } catch {
    return [];
  }
}

function normalizeFlatMembers(members: unknown[]): ApiMemberGroup[] {
  if (!members.length) return [];
  const first = members[0] as Record<string, unknown>;
  // Already in group format
  if ('category' in first) return members as ApiMemberGroup[];
  // Flat zcloud format
  if ('beam_identity' in first) {
    const flat = members as { beam_identity: string; role?: string; status?: string }[];
    const online = flat.filter(m => m.status === 'online');
    const offline = flat.filter(m => m.status !== 'online');
    const toUser = (m: typeof flat[0]): ApiMemberUser => ({
      name: m.beam_identity, role: m.role ?? null, status: m.status,
    });
    const result: ApiMemberGroup[] = [];
    if (online.length) result.push({ category: 'Online', users: online.map(toUser) });
    if (offline.length) result.push({ category: 'Offline', users: offline.map(toUser) });
    return result;
  }
  return [];
}

// ── Server management ─────────────────────────────────────────────────────────

export async function addServer(serverUrl: string, serverName: string | null = null): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/servers`, {
      method: 'POST',
      body: JSON.stringify({ server_url: serverUrl, server_name: serverName }),
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Invites ───────────────────────────────────────────────────────────────────

export interface ServerInvite {
  code: string;
  created_by: string;
  use_count: number;
  max_uses: number | null;
  /** Unix seconds or ISO string depending on server type */
  expires_at: number | string | null;
  created_at: number | string;
}

export async function listInvites(serverUrl: string): Promise<{ invites: ServerInvite[]; forbidden: boolean }> {
  try {
    const res = await authedFetch(`${serverUrl}/invites`);
    if (res.status === 403) return { invites: [], forbidden: true };
    const data = await res.json().catch(() => null);
    // Phaselink returns a plain array; zcloud returns { invites: [...] }
    const invites: ServerInvite[] = Array.isArray(data) ? data : (data?.invites ?? []);
    return { invites, forbidden: false };
  } catch {
    return { invites: [], forbidden: false };
  }
}

export async function createServerInvite(serverUrl: string, opts?: { max_uses?: number; expires_in_secs?: number }): Promise<{ ok: boolean; code?: string; url?: string; error?: string }> {
  try {
    const res = await authedFetch(`${serverUrl}/invites`, {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    // Phaselink returns web_url; zcloud returns url
    const url = (data.web_url ?? data.url) as string | undefined;
    return { ok: res.ok, url, code: data.code as string | undefined, error: data.error as string | undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteServerInvite(serverUrl: string, code: string): Promise<boolean> {
  try {
    const res = await authedFetch(`${serverUrl}/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function validateInvite(serverUrl: string, code: string): Promise<{ ok: boolean; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(`${serverUrl}/invites/${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false };
  }
}

export async function redeemInvite(serverUrl: string, code: string, chatToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${serverUrl}/invites/${encodeURIComponent(code)}/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chatToken}` },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return { ok: res.ok, error: (data as Record<string, string>).error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Cloud server (ZCloud) ─────────────────────────────────────────────────────

import { getZcloudUrl } from './config';

export async function createCloudServer(name: string, about = ''): Promise<{ ok: boolean; data?: { server_url: string; name: string; id: string }; error?: string }> {
  try {
    const body: Record<string, string> = { name };
    if (about.trim()) body.about = about.trim();
    const res = await authedFetch(`${getZcloudUrl()}/servers`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function leaveCloudServer(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
  const identity = getBeamIdentity();
  if (!identity) return { ok: false, error: 'Not logged in' };
  try {
    const res = await authedFetch(`${serverUrl}/members/${encodeURIComponent(identity)}`, { method: 'DELETE' });
    return { ok: res.ok || res.status === 204 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteCloudServer(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(serverUrl, { method: 'DELETE' });
    return { ok: res.ok || res.status === 204 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Server settings ───────────────────────────────────────────────────────────

export async function patchServerSettings(settings: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/server/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true } : { ok: false, error: (data as Record<string, string>).error };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Category management ───────────────────────────────────────────────────────

export async function createCategory(name: string, position = 0): Promise<{ ok: boolean; data?: ApiCategory; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name, position }),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true, data } : { ok: false, error: (data as Record<string, string>).error };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function updateCategory(id: string | number, patch: { name?: string; position?: number }): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/categories/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true } : { ok: false, error: (data as Record<string, string>).error };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function deleteCategory(id: string | number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/categories/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true } : { ok: false, error: (data as Record<string, string>).error };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── File upload ───────────────────────────────────────────────────────────────

export function getAttachmentUrl(attachmentId: string | number): string {
  const base = getServerUrl();
  const token = getChatToken(base) ?? getToken();
  return `${base}/attachments/${encodeURIComponent(String(attachmentId))}?token=${encodeURIComponent(token ?? '')}`;
}

export async function uploadFile(file: File): Promise<{ ok: boolean; id?: string | number; error?: string }> {
  try {
    const form = new FormData();
    form.append('file0', file);
    const base = getServerUrl();
    const token = getChatToken(base) ?? getToken() ?? '';
    // Use bare fetch (not authedFetch) to avoid extra headers that may interfere with
    // multipart parsing — mirrors exactly what the old client's files.js does.
    const res = await fetch(`${base}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    if (!res.ok) return { ok: false, error: (data as Record<string, string>).error ?? 'Upload failed' };
    // Phaselink/Zpulse: { ok, attachments: [{ attachment_id, filename, mime_type, file_size }] }
    // ZCloud:           { id, filename, content_type, size_bytes }
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.attachments)) {
      const first = (d.attachments as Record<string, unknown>[])[0];
      return { ok: true, id: first?.attachment_id as string | number };
    }
    if (d.id != null) return { ok: true, id: d.id as string | number };
    return { ok: false, error: (data as Record<string, string>).error ?? 'Unexpected upload response' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Channel management ────────────────────────────────────────────────────────

export async function createChannel(
  name: string,
  type: 'text' | 'voice' = 'text',
  categoryId: string | number | null = null,
  position = 0
): Promise<{ ok: boolean; data?: ApiChannel; error?: string }> {
  try {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const res = await authedFetch(`${getServerUrl()}/channels`, {
      method: 'POST',
      body: JSON.stringify({ id, name, type, category_id: categoryId, position, topic: '' }),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true, data } : { ok: false, error: (data as Record<string, string>).error };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function renameChannel(channelId: string | number, name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/channels/${encodeURIComponent(String(channelId))}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true } : { ok: false, error: (data as Record<string, string>).error };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function updateChannelPosition(channelId: string | number, position: number, categoryId?: string | number | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const body: Record<string, unknown> = { position };
    if (categoryId !== undefined) body.category_id = categoryId;
    const res = await authedFetch(`${getServerUrl()}/channels/${encodeURIComponent(String(channelId))}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return res.ok ? { ok: true } : { ok: false };
  } catch { return { ok: false }; }
}

export async function deleteChannel(channelId: string | number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/channels/${encodeURIComponent(String(channelId))}`, { method: 'DELETE' });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true } : { ok: false, error: (data as Record<string, string>).error };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Role management ───────────────────────────────────────────────────────────

export async function setMemberRole(userId: string, role: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/roles/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return res.ok ? { ok: true } : { ok: false, error: (data as Record<string, string>).error };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Custom role definitions ────────────────────────────────────────────────────

export interface ApiCustomRole {
  name: string;
  color: string;
  position: number;
  hoist: boolean;
  permissions: Record<string, boolean>;
}

// Module-level cache populated by fetchCustomRoles — lets any component call getRoleColor without props
const _customRoleCache = new Map<string, string>();

export function getRoleColor(role: string | null | undefined): string {
  if (!role) return 'var(--text-1)';
  if (role === 'Owner') return 'var(--green)';
  const cached = _customRoleCache.get(role);
  if (cached) return cached;
  // Fallback to ROLE_MAP for legacy hardcoded roles
  return ROLE_MAP[role]?.color ?? 'var(--text-1)';
}

export async function fetchCustomRoles(): Promise<ApiCustomRole[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/custom_roles`);
    if (!res.ok) return [];
    const data: ApiCustomRole[] = await res.json().catch(() => []);
    // Populate cache
    _customRoleCache.clear();
    for (const r of data) _customRoleCache.set(r.name, r.color);
    return data;
  } catch { return []; }
}

export async function createCustomRole(name: string, color: string, hoist?: boolean, permissions?: Record<string, boolean>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/custom_roles`, {
      method: 'POST',
      body: JSON.stringify({ name, color, hoist: hoist ?? false, permissions: permissions ?? {} }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function updateCustomRole(oldName: string, updates: { name?: string; color?: string; hoist?: boolean; permissions?: Record<string, boolean> }): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/custom_roles/${encodeURIComponent(oldName)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function reorderCustomRoles(order: string[]): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/custom_roles`, {
      method: 'PATCH',
      body: JSON.stringify({ order }),
    });
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function deleteCustomRole(name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/custom_roles/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Channel & Category Permissions ───────────────────────────────────────────

export interface ChannelPerm {
  role_name: string;
  allow: Record<string, boolean>;
  deny: Record<string, boolean>;
}

export interface CategoryPerm {
  role_name: string;
  allow: Record<string, boolean>;
  deny: Record<string, boolean>;
}

export async function fetchChannelPermissions(channelId: string): Promise<ChannelPerm[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/channels/${encodeURIComponent(channelId)}/permissions`);
    if (!res.ok) return [];
    return res.json().catch(() => []);
  } catch { return []; }
}

export async function setChannelPermission(
  channelId: string,
  roleName: string,
  perms: { allow?: Record<string, boolean>; deny?: Record<string, boolean> },
): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/channels/${encodeURIComponent(channelId)}/permissions/${encodeURIComponent(roleName)}`,
      { method: 'PUT', body: JSON.stringify(perms) },
    );
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function deleteChannelPermission(channelId: string, roleName: string): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/channels/${encodeURIComponent(channelId)}/permissions/${encodeURIComponent(roleName)}`,
      { method: 'DELETE' },
    );
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function fetchCategoryPermissions(categoryId: number): Promise<CategoryPerm[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/categories/${categoryId}/permissions`);
    if (!res.ok) return [];
    return res.json().catch(() => []);
  } catch { return []; }
}

export async function setCategoryPermission(
  categoryId: number,
  roleName: string,
  perms: { allow?: Record<string, boolean>; deny?: Record<string, boolean> },
): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/categories/${categoryId}/permissions/${encodeURIComponent(roleName)}`,
      { method: 'PUT', body: JSON.stringify(perms) },
    );
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function deleteCategoryPermission(categoryId: number, roleName: string): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/categories/${categoryId}/permissions/${encodeURIComponent(roleName)}`,
      { method: 'DELETE' },
    );
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

/**
 * Maps role names to CSS classes and colors for UI display.
 * Used throughout the app to render role badges with appropriate styling.
 */
export const ROLE_MAP: Record<string, { color: string; cls: string; label: string }> = {
  Owner: { color: 'var(--green)', cls: 'b-owner', label: 'Owner' },
  Admin: { color: 'var(--red)', cls: 'b-admin', label: 'Admin' },
  Mod: { color: 'var(--gold)', cls: 'b-mod', label: 'Mod' },
  Moderator: { color: 'var(--gold)', cls: 'b-mod', label: 'Moderator' },
  VIP: { color: 'var(--accent)', cls: 'b-vip', label: 'VIP' },
};

// ── Server removal ─────────────────────────────────────────────────────────────

export async function removeServer(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/servers/${encodeURIComponent(serverUrl)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Friends ────────────────────────────────────────────────────────────────────

export interface ApiFriend {
  id: string | number;
  beam_identity: string;
  display_name?: string;
  status?: string;
  created_at?: string;
  avatar_attachment_id?: string | number | null;
}

export interface ApiFriendRequest {
  id: string | number;
  from_beam?: string;
  to_beam?: string;
  beam_identity?: string;
  display_name?: string;
  created_at?: string;
  direction?: 'incoming' | 'outgoing';
}

export async function fetchFriends(): Promise<ApiFriend[]> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friends`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.friends ?? []);
  } catch {
    return [];
  }
}

export async function sendFriendRequest(beamIdentity: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friends`, {
      method: 'POST',
      body: JSON.stringify({ friend_beam_identity: beamIdentity }),
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function acceptFriendRequest(id: string | number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friends/${encodeURIComponent(String(id))}/accept`, {
      method: 'PUT',
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeFriend(id: string | number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friends/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function fetchFriendRequests(): Promise<ApiFriendRequest[]> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friend-requests`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.requests ?? []);
  } catch {
    return [];
  }
}

// ── Direct Messages ────────────────────────────────────────────────────────────

export interface ApiDmMessage {
  id: string | number;
  from: string;        // normalised from sender_beam
  to: string;          // normalised from recipient_beam
  content: string;
  created_at: number | string;
}

function normaliseDm(raw: Record<string, unknown>): ApiDmMessage {
  return {
    id: (raw.id ?? raw.message_id ?? '') as string,
    from: (raw.from ?? raw.sender_beam ?? '') as string,
    to: (raw.to ?? raw.recipient_beam ?? '') as string,
    content: (raw.content ?? raw.message ?? '') as string,
    created_at: (raw.created_at ?? raw.timestamp ?? 0) as number | string,
  };
}

export async function fetchDMs(withBeam: string, limit = 100): Promise<ApiDmMessage[]> {
  try {
    const url = new URL(`${getDmUrl()}/dms`);
    url.searchParams.set('with', withBeam);
    url.searchParams.set('limit', String(limit));
    const res = await authedFetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    const arr: unknown[] = Array.isArray(data) ? data : (data.messages ?? data.dms ?? []);
    return arr.map(m => normaliseDm(m as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function sendDM(toBeam: string, content: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getDmUrl()}/dms`, {
      method: 'POST',
      body: JSON.stringify({ to: toBeam, content, attachment_ids: [] }),
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Account info ───────────────────────────────────────────────────────────────

export interface ApiSubAccount {
  id: string;
  beam_identity: string;
  display_name: string;
  account_type: string;
  locked?: boolean;
  bot_token?: string;
}

export interface ApiAccountInfo {
  beam_identity: string;
  display_name?: string;
  account_type?: string;
  verified?: boolean;
  avatar_attachment_id?: string | null;
  auth_methods?: string[];
  children?: ApiSubAccount[];
  alts?: ApiSubAccount[];
  bots?: ApiSubAccount[];
  email?: string | null;
}

export async function getAccountInfo(): Promise<ApiAccountInfo | null> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/info`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function updateDisplayName(name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), new_display_name: name }),
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), new_email: email }),
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function sendEmailPinReq(token: string, email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/email/send-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as Record<string, string>).error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function verifyEmailPinReq(token: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/email/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as Record<string, string>).error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updatePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), current_password: currentPassword, new_password: newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (data as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

/** POST /account/avatar — uploads a profile picture, returns attachment_id */
export async function uploadAvatar(file: File): Promise<{ ok: boolean; avatar_attachment_id?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${getAuthUrl()}/account/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; }) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: (data.error as string) || 'Upload failed' };
    return { ok: true, avatar_attachment_id: data.avatar_attachment_id as string };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Build URL to fetch an auth-server attachment (avatars live on auth server) */
export function getAuthAttachmentUrl(attachmentId: string): string {
  return `${getAuthUrl()}/attachments/${attachmentId}?token=${encodeURIComponent(getToken())}`;
}

/** POST /account/banner — uploads a profile banner (premium only), returns attachment_id */
export async function uploadBanner(file: File): Promise<{ ok: boolean; banner_attachment_id?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${getAuthUrl()}/account/banner`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: (data.error as string) || 'Upload failed' };
    return { ok: true, banner_attachment_id: data.banner_attachment_id as string };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface PublicProfile {
  beam_identity: string;
  display_name: string;
  premium: boolean;
  verified: boolean;
  avatar_attachment_id?: string | null;
  banner_attachment_id?: string | null;
}

/** GET /users/:beamIdentity — fetch a user's public profile (premium, banner, avatar) */
export async function fetchPublicProfile(beamIdentity: string): Promise<PublicProfile | null> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/users/${encodeURIComponent(beamIdentity)}`);
    if (!res.ok) return null;
    return await res.json() as PublicProfile;
  } catch {
    return null;
  }
}

// ── Sub-accounts ───────────────────────────────────────────────────────────────

export async function createSubAccount(
  displayName: string,
  accountType: 'alt' | 'child' | 'bot',
  password?: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const body: Record<string, unknown> = {
      parent_token: getToken(),
      display_name: displayName,
      account_type: accountType,
    };
    if (password) body.password = password;
    const res = await fetch(`${getAuthUrl()}/account/sub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteSubAccount(subId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/sub/${encodeURIComponent(subId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function childAction(childId: string, action: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/child/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ parent_token: getToken(), child_id: childId, action }),
    });
    if (!res.ok) {
      const d = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (d as Record<string, string>).error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const lockSubAccount   = (id: string) => childAction(id, { lock: null });
export const unlockSubAccount = (id: string) => childAction(id, { unlock: null });
export const setSubAccountPassword = (id: string, newPassword: string) =>
  childAction(id, { reset_password: { new_password: newPassword } });

export async function regenBotKey(botId: string): Promise<{ ok: boolean; new_token?: string; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/bot/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ parent_token: getToken(), bot_id: botId }),
    });
    if (!res.ok) {
      const d = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; });
      return { ok: false, error: (d as Record<string, string>).error };
    }
    const data = await res.json().catch((e) => { console.error(`JSON parse error (${res.status}):`, e); return {}; }) as Record<string, string>;
    return { ok: true, new_token: data.bot_token ?? data.token };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── 2FA / TOTP ────────────────────────────────────────────────────────────────

export async function setupTotp(): Promise<{ ok: boolean; secret?: string; otpauth_url?: string; error?: string }> {
  const token = getToken();
  try {
    const res = await fetch(`${getAuthUrl()}/account/totp/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    if (!res.ok) return { ok: false, error: data.error };
    return { ok: true, secret: data.secret, otpauth_url: data.otpauth_url };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function enableTotp(code: string): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  try {
    const res = await fetch(`${getAuthUrl()}/account/totp/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, code }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { ok: res.ok, error: data.error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function disableTotp(password: string): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  try {
    const res = await fetch(`${getAuthUrl()}/account/totp`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { ok: res.ok, error: data.error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function generateRecoveryCodes(password: string): Promise<{ ok: boolean; codes?: string[]; error?: string }> {
  const token = getToken();
  try {
    const res = await fetch(`${getAuthUrl()}/account/recovery-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true, codes: data.codes as string[] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getRecoveryCodesStatus(): Promise<{ enabled: boolean; remaining: number }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/recovery-codes/status`);
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { enabled: (data.enabled as boolean) ?? false, remaining: (data.remaining as number) ?? 0 };
  } catch {
    return { enabled: false, remaining: 0 };
  }
}

// Creates a Stripe Checkout Session and returns the hosted URL.
// The user completes payment in their browser — no card details handled in-app.
export async function createCheckoutSession(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/stripe/checkout`, { method: 'POST' });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const err = data.error;
      return { ok: false, error: typeof err === 'string' ? err : 'Failed to create checkout session' };
    }
    return { ok: true, url: data.url as string };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

// Creates a Stripe subscription + SetupIntent for in-app card collection.
// Returns { client_secret, invoice_id, subscription_id } to be used with Stripe.js.
export async function createSubscription(): Promise<{
  ok: boolean;
  clientSecret?: string;
  invoiceId?: string;
  subscriptionId?: string;
  error?: string;
}> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/stripe/subscribe`, { method: 'POST' });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const err = data.error;
      return { ok: false, error: typeof err === 'string' ? err : 'Failed to create subscription' };
    }
    return {
      ok: true,
      clientSecret: data.client_secret as string,
      invoiceId: data.invoice_id as string,
      subscriptionId: data.subscription_id as string,
    };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

// Pays the subscription's first invoice using the payment method collected in-app.
export async function confirmSubscriptionPayment(
  invoiceId: string,
  paymentMethodId: string,
): Promise<{ ok: boolean; requiresAction?: boolean; clientSecret?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/stripe/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoiceId, payment_method_id: paymentMethodId }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const err = data.error;
      return { ok: false, error: typeof err === 'string' ? err : 'Payment failed' };
    }
    if (data.requires_action) {
      return { ok: true, requiresAction: true, clientSecret: data.client_secret as string };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

// ── Health / validation helpers ───────────────────────────────────────────────

export async function checkAuthHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getAuthUrl()}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch { return false; }
}

export async function validateToken(): Promise<'valid' | 'invalid' | 'network_error'> {
  try {
    const token = getToken();
    if (!token) return 'invalid';
    const res = await fetch(`${getAuthUrl()}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'invalid';
    const data = await res.json().catch(() => ({}));
    return data.valid === true ? 'valid' : 'invalid';
  } catch (e) {
    if (e instanceof DOMException || e instanceof TypeError) return 'network_error';
    return 'invalid';
  }
}

export async function checkServerHealth(serverUrl: string): Promise<boolean> {
  if (!serverUrl) return true;
  try {
    const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch { return false; }
}
