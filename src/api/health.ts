import { getAuthUrl } from '../config';
import { getToken, getChatToken } from '../auth';
import { safeJson } from './core';

// ── Health / validation ───────────────────────────────────────────────────────

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
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) return 'invalid';
    if (!res.ok) return 'network_error';
    const data = await safeJson(res);
    return data.valid === true ? 'valid' : 'invalid';
  } catch {
    return 'network_error';
  }
}

export async function checkServerHealth(serverUrl: string): Promise<boolean> {
  if (!serverUrl) return true;
  try {
    const token = getChatToken(serverUrl) ?? getToken();
    const res = await fetch(`${serverUrl}/health`, {
      signal: AbortSignal.timeout(5000),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.ok;
  } catch { return false; }
}
