import { getServerUrl, getDmUrl } from '../config';
import { getToken } from '../auth';
import { authedFetch, safeJson, refreshAccessToken } from './core';
import { forceLogout } from '../auth';

// ── Server file upload ────────────────────────────────────────────────────────

export function fetchAttachment(attachmentId: string | number): Promise<Response> {
  return authedFetch(`${getServerUrl()}/v1/attachments/${encodeURIComponent(String(attachmentId))}`);
}

export async function uploadFile(file: File): Promise<{ ok: boolean; id?: string | number; error?: string }> {
  try {
    const form = new FormData();
    form.append('file0', file);
    const base = getServerUrl();
    const res = await authedFetch(`${base}/v1/upload`, { method: 'POST', body: form });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, error: (data.error as string) || 'Upload failed' };
    if (Array.isArray(data.attachments)) {
      const first = (data.attachments as Record<string, unknown>[])[0];
      return { ok: true, id: first?.attachment_id as string | number };
    }
    if (data.id != null) return { ok: true, id: data.id as string | number };
    return { ok: false, error: (data.error as string) || 'Unexpected upload response' };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── DM file upload ────────────────────────────────────────────────────────────

export function fetchDmAttachment(attachmentId: string | number): Promise<Response> {
  const token = getToken();
  return fetch(`${getDmUrl()}/v1/attachments/${encodeURIComponent(String(attachmentId))}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
}

export async function uploadDmFile(file: File): Promise<{ ok: boolean; id?: string | number; error?: string }> {
  try {
    const form = new FormData();
    form.append('file0', file);
    const base = getDmUrl();
    const token = getToken() ?? '';
    const res = await fetch(`${base}/v1/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await safeJson(res);
    if (!res.ok) {
      if (res.status === 401) {
        const refreshResult = await refreshAccessToken();
        if (refreshResult === 'refreshed') {
          const retryToken = getToken() ?? '';
          const retry = await fetch(`${base}/v1/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${retryToken}` },
            body: form,
          });
          const retryData = await safeJson(retry);
          if (!retry.ok) return { ok: false, error: (retryData.error as string) || 'Upload failed' };
          if (Array.isArray(retryData.attachments)) {
            const first = (retryData.attachments as Record<string, unknown>[])[0];
            return { ok: true, id: first?.attachment_id as string | number };
          }
          if (retryData.id != null) return { ok: true, id: retryData.id as string | number };
          return { ok: false, error: 'Unexpected upload response' };
        }
        if (refreshResult === 'auth_error') forceLogout();
      }
      return { ok: false, error: (data.error as string) || 'Upload failed' };
    }
    if (Array.isArray(data.attachments)) {
      const first = (data.attachments as Record<string, unknown>[])[0];
      return { ok: true, id: first?.attachment_id as string | number };
    }
    if (data.id != null) return { ok: true, id: data.id as string | number };
    return { ok: false, error: (data.error as string) || 'Unexpected upload response' };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
