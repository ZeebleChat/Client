import { getAuthUrl } from '../config';
import { getToken } from '../auth';
import { authedFetch, safeJson } from './core';

// ── Account info ──────────────────────────────────────────────────────────────

export interface ParentalControls {
  can_join_servers: boolean;
  can_leave_servers: boolean;
  can_dm: boolean;
}

export interface ApiSubAccount {
  id: string;
  beam_identity: string;
  display_name: string;
  account_type: string;
  locked?: boolean;
  bot_token?: string;
  parental_controls?: ParentalControls;
}

export interface ApiAccountInfo {
  beam_identity: string;
  display_name?: string;
  account_type?: string;
  premium?: boolean;
  verified?: boolean;
  age_verified?: boolean;
  ichor_balance?: number;
  avatar_attachment_id?: string | null;
  banner_attachment_id?: string | null;
  auth_methods?: string[];
  children?: ApiSubAccount[];
  alts?: ApiSubAccount[];
  bots?: ApiSubAccount[];
  streamers?: ApiSubAccount[];
  email?: string | null;
  discord_linked?: boolean;
  steam_linked?: boolean;
}

export async function getAccountInfo(): Promise<ApiAccountInfo | null> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/info`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export interface PublicProfile {
  beam_identity: string;
  display_name: string;
  premium: boolean;
  verified: boolean;
  avatar_attachment_id?: string | null;
  banner_attachment_id?: string | null;
}

export async function fetchPublicProfile(beamIdentity: string): Promise<PublicProfile | null> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/users/${encodeURIComponent(beamIdentity)}`);
    if (!res.ok) return null;
    return res.json() as Promise<PublicProfile>;
  } catch { return null; }
}

// ── Display name / email / password ──────────────────────────────────────────

export async function updateDisplayName(name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_display_name: name }),
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function updateEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_email: email }),
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function sendEmailPinReq(token: string, email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/email/send-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email }),
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function verifyEmailPinReq(token: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/email/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pin }),
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function sendPasswordResetPinReq(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/password/reset-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function resetPasswordWithPinReq(email: string, pin: string, new_password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pin, new_password }),
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Avatar / Banner ───────────────────────────────────────────────────────────

export async function uploadAvatar(file: File): Promise<{ ok: boolean; avatar_attachment_id?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${getAuthUrl()}/account/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: (data.error as string) || 'Upload failed' };
    return { ok: true, avatar_attachment_id: data.avatar_attachment_id as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function uploadBanner(file: File): Promise<{ ok: boolean; banner_attachment_id?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${getAuthUrl()}/account/banner`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: (data.error as string) || 'Upload failed' };
    return { ok: true, banner_attachment_id: data.banner_attachment_id as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export function getAuthAttachmentUrl(attachmentId: string): string {
  return `${getAuthUrl()}/attachments/${attachmentId}`;
}

// ── Sub-accounts ──────────────────────────────────────────────────────────────

export async function createSubAccount(
  displayName: string,
  accountType: 'alt' | 'child' | 'bot' | 'streamer',
  password?: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const body: Record<string, unknown> = {
      display_name: displayName,
      account_type: accountType,
    };
    if (password) body.password = password;
    const res = await authedFetch(`${getAuthUrl()}/account/sub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await safeJson<unknown>(res);
    return { ok: res.ok, data };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function deleteSubAccount(subId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/account/sub/${encodeURIComponent(subId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    return { ok: res.ok };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

async function childAction(childId: string, action: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/child/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub_id: childId, action }),
    });
    if (!res.ok) {
      const d = await safeJson(res);
      return { ok: false, error: d.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export const lockSubAccount = (id: string) => childAction(id, { lock: null });
export const unlockSubAccount = (id: string) => childAction(id, { unlock: null });
export const setSubAccountPassword = (id: string, newPassword: string) =>
  childAction(id, { reset_password: { new_password: newPassword } });
export const setChildParentalControls = (id: string, controls: ParentalControls) =>
  childAction(id, { set_parental_controls: { controls } });

export async function regenBotKey(botId: string): Promise<{ ok: boolean; new_token?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/bot/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId }),
    });
    if (!res.ok) {
      const d = await safeJson(res);
      return { ok: false, error: d.error as string };
    }
    const data = await res.json();
    return { ok: true, new_token: data.bot_token ?? data.token };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── 2FA / TOTP ────────────────────────────────────────────────────────────────

export async function setupTotp(): Promise<{ ok: boolean; secret?: string; otpauth_url?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/totp/setup`, { method: 'POST' });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true, secret: data.secret as string, otpauth_url: data.otpauth_url as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function enableTotp(code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/totp/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await safeJson(res);
    return { ok: res.ok, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function disableTotp(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/totp`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await safeJson(res);
    return { ok: res.ok, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function generateRecoveryCodes(password: string): Promise<{ ok: boolean; codes?: string[]; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/recovery-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: data.error as string };
    return { ok: true, codes: data.codes as string[] };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function getRecoveryCodesStatus(): Promise<{ enabled: boolean; remaining: number }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/account/recovery-codes/status`);
    const data = await safeJson(res);
    return { enabled: data.enabled as boolean ?? false, remaining: data.remaining as number ?? 0 };
  } catch { return { enabled: false, remaining: 0 }; }
}

// ── Ichor / shop ──────────────────────────────────────────────────────────────

export async function buyIchorCheckout(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/shop/buy-ichor`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? 'Failed to start checkout' };
    return { ok: true, url: data.url };
  } catch { return { ok: false, error: 'Network error' }; }
}

export async function redeemIchorForPremium(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/shop/premium-with-ichor`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? 'Failed to redeem' };
    return { ok: true };
  } catch { return { ok: false, error: 'Network error' }; }
}
