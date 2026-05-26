import { getServerUrl } from '../config';
import { authedFetch } from './core';

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
    const res = await authedFetch(`${getServerUrl()}/v1/channels/${encodeURIComponent(channelId)}/permissions`);
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
      `${getServerUrl()}/v1/channels/${encodeURIComponent(channelId)}/permissions/${encodeURIComponent(roleName)}`,
      { method: 'PUT', body: JSON.stringify(perms) },
    );
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function deleteChannelPermission(channelId: string, roleName: string): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/v1/channels/${encodeURIComponent(channelId)}/permissions/${encodeURIComponent(roleName)}`,
      { method: 'DELETE' },
    );
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function fetchCategoryPermissions(categoryId: number): Promise<CategoryPerm[]> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/categories/${categoryId}/permissions`);
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
      `${getServerUrl()}/v1/categories/${categoryId}/permissions/${encodeURIComponent(roleName)}`,
      { method: 'PUT', body: JSON.stringify(perms) },
    );
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function deleteCategoryPermission(categoryId: number, roleName: string): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/v1/categories/${categoryId}/permissions/${encodeURIComponent(roleName)}`,
      { method: 'DELETE' },
    );
    return { ok: res.ok };
  } catch { return { ok: false }; }
}
