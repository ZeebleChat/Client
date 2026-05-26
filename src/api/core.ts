import { getAuthUrl, getServerUrl, isZcloudUrl } from '../config';
import {
  getToken, getUid, getRefreshToken, getChatToken, setChatToken,
  forceLogout, saveSession, loadPersistedSession, persistSession,
} from '../auth';

// ── Internal helpers ──────────────────────────────────────────────────────────

export async function safeJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  return res.json().catch(() => ({})) as Promise<T>;
}

export function unwrapArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, unknown>)[key] as T[];
  }
  return [];
}

// ── Token refresh ─────────────────────────────────────────────────────────────

type RefreshResult = 'refreshed' | 'auth_error' | 'network_error';

let refreshInProgress = false;
let refreshPromise: Promise<RefreshResult> | null = null;

export async function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshInProgress && refreshPromise) return refreshPromise;
  let refreshToken = getRefreshToken();
  let uid = getUid();
  if (!refreshToken || !uid) {
    const restored = await loadPersistedSession();
    if (!restored) return 'auth_error';
    refreshToken = getRefreshToken();
    uid = getUid();
    if (!refreshToken || !uid) return 'auth_error';
  }

  refreshInProgress = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getAuthUrl()}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken, uid }),
      });
      if (res.status === 401 || res.status === 403) return 'auth_error';
      if (!res.ok) return 'network_error';
      const data = await res.json();
      if (data.token) { saveSession(data); return 'refreshed'; }
      return 'auth_error';
    } catch {
      return 'network_error';
    } finally {
      refreshInProgress = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function tryAutoLogin(): Promise<boolean> {
  if (!(await loadPersistedSession())) return false;
  const result = await refreshAccessToken();
  if (result === 'refreshed') { await persistSession(); return true; }
  return false;
}

// ── Proactive refresh timer ───────────────────────────────────────────────────

const PROACTIVE_REFRESH_INTERVAL_MS = 12 * 60 * 1000;
let _refreshTimer: ReturnType<typeof setInterval> | null = null;

export function startTokenRefreshTimer(): void {
  if (_refreshTimer !== null) return;
  _refreshTimer = setInterval(async () => {
    const result = await refreshAccessToken();
    if (result === 'auth_error') { stopTokenRefreshTimer(); forceLogout(); }
  }, PROACTIVE_REFRESH_INTERVAL_MS);
}

export function stopTokenRefreshTimer(): void {
  if (_refreshTimer !== null) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

// ── Core fetch ────────────────────────────────────────────────────────────────

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
    if (!res.ok) { const data = await safeJson(res); return { ok: false, error: data.error as string }; }
    const data = await res.json();
    if (data.token) { setChatToken(connectionUrl, data.token); return { ok: true, token: data.token }; }
    return { ok: false, error: 'No token in response' };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

async function resolveAudience(connectionUrl: string): Promise<string> {
  if (isZcloudUrl(connectionUrl)) return connectionUrl;
  try {
    const res = await fetch(`${connectionUrl}/v1/server/info`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const info = await res.json();
      if (info?.public_url) return info.public_url.replace(/\/$/, '');
    }
  } catch { /* fall through */ }
  return connectionUrl;
}

export async function authedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const chatBase = getServerUrl();
  const chatBasePrefix = chatBase.endsWith('/') ? chatBase : chatBase + '/';

  let token = getToken();
  const extraHeaders: Record<string, string> = {};

  if (url.startsWith(chatBasePrefix)) {
    const chatToken = getChatToken(chatBase);
    if (chatToken) token = chatToken;
    if (!isZcloudUrl(chatBase)) extraHeaders['X-Active-Server'] = chatBase;
  }

  const headers: Record<string, string> = {
    ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
    ...(opts.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    const refreshResult = await refreshAccessToken();
    if (refreshResult === 'refreshed') {
      let retryToken = getToken();
      if (url.startsWith(chatBasePrefix)) {
        await exchangeToken(chatBase);
        const chatToken = getChatToken(chatBase);
        if (chatToken) retryToken = chatToken;
      }
      return fetch(url, { ...opts, headers: { ...headers, Authorization: `Bearer ${retryToken}` } });
    }
    if (refreshResult === 'auth_error') forceLogout();
  }

  return res;
}
