import { getAuthUrl } from '../config';
import { authedFetch, safeJson } from './core';

// ── Friends ───────────────────────────────────────────────────────────────────

export interface ApiFriend {
  id: string | number;
  beam_identity: string;
  display_name?: string;
  status?: string;
  created_at?: string;
  avatar_attachment_id?: string | null;
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
  } catch { return []; }
}

export async function sendFriendRequest(beamIdentity: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friends`, {
      method: 'POST',
      body: JSON.stringify({ friend_beam_identity: beamIdentity }),
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function acceptFriendRequest(id: string | number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friends/${encodeURIComponent(String(id))}/accept`, {
      method: 'PUT',
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function removeFriend(id: string | number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friends/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function fetchFriendRequests(): Promise<ApiFriendRequest[]> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/friend-requests`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.requests ?? []);
  } catch { return []; }
}
