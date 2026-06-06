import { getServerUrl } from '../config';
import { authedFetch, unwrapArray, safeJson } from './core';

// ── Members ───────────────────────────────────────────────────────────────────

export interface ApiMemberUser {
  name: string;           // always the full beam identity (e.g. "creeper7»l0na6")
  displayName?: string;   // server-side display name override, if set
  role?: string | null;
  status?: string;
  avatar?: string | number | null;
  is_owner?: boolean;
}

export interface ApiMemberGroup {
  category: string;
  users: ApiMemberUser[];
}

export async function fetchMembers(
  opts: { limit?: number; offset?: number } = {},
): Promise<ApiMemberGroup[]> {
  try {
    const params = new URLSearchParams();
    if (opts.limit != null) params.set('limit', String(opts.limit));
    if (opts.offset != null) params.set('offset', String(opts.offset));
    const query = params.toString() ? `?${params}` : '';
    const res = await authedFetch(`${getServerUrl()}/v1/members${query}`);
    if (!res.ok) return [];
    const raw = unwrapArray<unknown>(await res.json(), 'members');
    return normalizeFlatMembers(raw);
  } catch { return []; }
}

function normalizeFlatMembers(members: unknown[]): ApiMemberGroup[] {
  if (!members.length) return [];
  const first = members[0] as Record<string, unknown>;
  if ('category' in first) return members as ApiMemberGroup[];
  if ('beam_identity' in first) {
    const flat = members as { beam_identity: string; display_name?: string | null; role?: string; status?: string; avatar?: number | string | null; is_owner?: boolean }[];
    const online = flat.filter(m => m.status === 'online');
    const offline = flat.filter(m => m.status !== 'online');
    const toUser = (m: typeof flat[0]): ApiMemberUser => ({
      name: m.beam_identity,
      displayName: m.display_name?.trim() || undefined,
      role: m.role ?? null,
      status: m.status,
      avatar: m.avatar != null ? String(m.avatar) : null,
      is_owner: m.is_owner ?? m.role === 'owner',
    });
    const result: ApiMemberGroup[] = [];
    if (online.length) result.push({ category: 'Online', users: online.map(toUser) });
    if (offline.length) result.push({ category: 'Offline', users: offline.map(toUser) });
    return result;
  }
  return [];
}

// ── Role assignment ───────────────────────────────────────────────────────────

export async function setMemberRole(userId: string, role: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getServerUrl()}/v1/roles/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
    const data = await safeJson(res);
    return res.ok ? { ok: true } : { ok: false, error: data.error as string };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
