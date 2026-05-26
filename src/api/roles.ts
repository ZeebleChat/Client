import { getServerUrl } from '../config';
import { authedFetch, safeJson } from './core';

// ── Role map ──────────────────────────────────────────────────────────────────

export const ROLE_MAP: Record<string, { color: string; cls: string; label: string }> = {
  Owner: { color: 'var(--green)', cls: 'b-owner', label: 'Owner' },
  Admin: { color: 'var(--red)', cls: 'b-admin', label: 'Admin' },
  Mod: { color: 'var(--gold)', cls: 'b-mod', label: 'Mod' },
  Moderator: { color: 'var(--gold)', cls: 'b-mod', label: 'Moderator' },
  VIP: { color: 'var(--accent)', cls: 'b-vip', label: 'VIP' },
};

// ── Custom roles ──────────────────────────────────────────────────────────────

export interface ApiCustomRole {
  name: string;
  color: string;
  position: number;
  hoist: boolean;
  permissions: Record<string, boolean>;
}

const _roleColorCache = new Map<string, string>();

export function getRoleColor(role: string | null | undefined): string {
  if (!role) return 'var(--text-1)';
  if (role === 'Owner') return 'var(--green)';
  const cached = _roleColorCache.get(role);
  if (cached) return cached;
  return ROLE_MAP[role]?.color ?? 'var(--text-1)';
}

export async function fetchCustomRoles(): Promise<ApiCustomRole[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/custom_roles`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    _roleColorCache.clear();
    for (const r of data) _roleColorCache.set(r.name, r.color);
    return data;
  } catch { return []; }
}

export async function createCustomRole(name: string, color: string, hoist?: boolean, permissions?: Record<string, boolean>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/custom_roles`, {
      method: 'POST',
      body: JSON.stringify({ name, color, hoist: hoist ?? false, permissions: permissions ?? {} }),
    });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function updateCustomRole(oldName: string, updates: { name?: string; color?: string; hoist?: boolean; permissions?: Record<string, boolean> }): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/custom_roles/${encodeURIComponent(oldName)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function reorderCustomRoles(order: string[]): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/custom_roles`, {
      method: 'PATCH',
      body: JSON.stringify({ order }),
    });
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function deleteCustomRole(name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/custom_roles/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
