import { getAuthUrl } from '../config';
import { safeJson } from './core';

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginResult {
  ok: boolean;
  status?: number;
  data?: { token: string; beam_identity: string; uid?: string; refresh_token?: string };
  error?: string;
}

export async function loginReq(
  credential: string,
  password: string,
  useEmail: boolean,
): Promise<LoginResult> {
  const body = useEmail
    ? { email: credential, password }
    : { beam_identity: credential, password };
  const res = await fetch(`${getAuthUrl()}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res) as LoginResult['data'];
  return { ok: res.ok, status: res.status, data };
}

export interface RegisterResult {
  ok: boolean;
  status?: number;
  data?: { token: string; beam_identity: string; uid?: string; refresh_token?: string };
  error?: string;
}

export async function registerReq(
  display_name: string,
  password: string,
  email?: string
): Promise<RegisterResult> {
  const res = await fetch(`${getAuthUrl()}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name, password, email }),
  });
  const data = await safeJson(res) as RegisterResult['data'];
  return { ok: res.ok, status: res.status, data };
}

export async function redeemPromoReq(
  token: string,
  code: string
): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`${getAuthUrl()}/promo/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  const data = await safeJson<unknown>(res);
  return { ok: res.ok, data };
}
