import { getAuthUrl } from '../config';
import { getToken } from '../auth';
import { safeJson } from './core';

// ── Admin / Staff Portal API ──────────────────────────────────────────────────
// All calls send the JWT in the Authorization header.
// The backend verifies the signature and checks identity from the token claims —
// never from anything passed in the request body.

function adminHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

export interface AdminMe {
  identity: string;
  uid: string;
  role: 'owner' | 'staff';
  is_owner: boolean;
}

export async function adminGetMe(): Promise<AdminMe | null> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/me`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return safeJson<AdminMe>(res);
  } catch { return null; }
}

export interface AdminStats {
  total_users: number;
  premium_users: number;
  total_servers: number;
  active_bans: number;
  staff_count: number;
}

export async function adminGetStats(): Promise<AdminStats | null> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/stats`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return safeJson<AdminStats>(res);
  } catch { return null; }
}

export interface AdminUser {
  id: string;
  beam_identity: string;
  display_name: string;
  beam_tag: string;
  premium: boolean;
  verified: boolean;
  locked: boolean;
  is_staff: boolean;
  staff_role: string | null;
  created_at: string;
}

export async function adminListUsers(page = 0, search?: string): Promise<AdminUser[]> {
  try {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    const res = await fetch(`${getAuthUrl()}/admin/users?${params}`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await safeJson<{ users: AdminUser[] }>(res);
    return data.users ?? [];
  } catch { return []; }
}

export async function adminLockUser(uid: string, reason: string, expiresAt?: number): Promise<boolean> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/users/${uid}/lock`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ reason, expires_at: expiresAt ?? null }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminUnlockUser(uid: string): Promise<boolean> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/users/${uid}/unlock`, {
      method: 'POST',
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminSuspendUser(uid: string, reason: string, days: number): Promise<boolean> {
  const expiresAt = Math.floor(Date.now() / 1000) + days * 86400;
  return adminLockUser(uid, reason, expiresAt);
}

export interface StaffMember {
  id: string;
  beam_identity: string;
  display_name: string;
  staff_role: string;
  staff_note: string | null;
  staff_added_at: string | null;
  avatar_attachment_id: string | null;
}

export async function adminListStaff(): Promise<StaffMember[]> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/staff`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await safeJson<{ staff: StaffMember[] }>(res);
    return data.staff ?? [];
  } catch { return []; }
}

export async function adminAddStaff(uid: string, staffRole: string, staffNote?: string): Promise<boolean> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/staff`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ uid, staff_role: staffRole, staff_note: staffNote }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

export async function adminRemoveStaff(uid: string): Promise<boolean> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/staff/${uid}`, {
      method: 'DELETE',
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

export interface AdminPromo {
  code: string;
  uses_max: number | null;
  uses_count: number;
  expires_at: number | null;
  grants_premium: boolean;
  created_by: string | null;
}

export async function adminListPromos(): Promise<AdminPromo[]> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/promos`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await safeJson<{ promos: AdminPromo[] }>(res);
    return data.promos ?? [];
  } catch { return []; }
}

export async function adminCreatePromo(
  code: string, usesMax: number | null, expiresAt: number | null, grantsPremium: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/promos`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ code, uses_max: usesMax, expires_at: expiresAt, grants_premium: grantsPremium }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await safeJson<{ ok?: boolean; error?: string }>(res);
    return { ok: res.ok, error: data.error };
  } catch { return { ok: false, error: 'Network error' }; }
}

export async function adminDeletePromo(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/promos/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

export interface AdminBan {
  id: number;
  user_id: string;
  beam_identity: string;
  reason: string;
  banned_by: string;
  expires_at: number | null;
  created_at: string;
}

export async function adminListBans(): Promise<AdminBan[]> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/bans`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await safeJson<{ bans: AdminBan[] }>(res);
    return data.bans ?? [];
  } catch { return []; }
}

export interface AdminBroadcast {
  id: number;
  message: string;
  sent_by: string;
  sent_at: string;
  target: string;
}

export async function adminListBroadcasts(): Promise<AdminBroadcast[]> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/broadcasts`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await safeJson<{ broadcasts: AdminBroadcast[] }>(res);
    return data.broadcasts ?? [];
  } catch { return []; }
}

export async function adminSendBroadcast(message: string, target = 'all'): Promise<boolean> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/broadcasts`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ message, target }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

export interface AdminServer {
  server_url: string;
  owner: string;
  member_count: number;
}

export async function adminListServers(): Promise<AdminServer[]> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/servers`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await safeJson<{ servers: AdminServer[] }>(res);
    return data.servers ?? [];
  } catch { return []; }
}

export async function adminDeleteServer(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${getAuthUrl()}/admin/servers`, {
      method: 'DELETE',
      headers: adminHeaders(),
      body: JSON.stringify({ server_url: serverUrl }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch { return false; }
}
