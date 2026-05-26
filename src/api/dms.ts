import { getDmUrl } from '../config';
import { authedFetch, safeJson } from './core';
import type { ApiAttachment } from './messages';

// ── Direct Messages ───────────────────────────────────────────────────────────

export interface ApiDmMessage {
  id: string | number;
  from: string;
  to: string;
  content: string;
  created_at: number | string;
  attachments?: ApiAttachment[];
}

function normaliseDm(raw: Record<string, unknown>): ApiDmMessage {
  const rawAtts = raw.attachments ?? raw.files ?? [];
  const attachments: ApiAttachment[] = Array.isArray(rawAtts)
    ? (rawAtts as Record<string, unknown>[]).map(a => ({
        id: (a.id ?? a.attachment_id ?? '') as string | number,
        filename: a.filename as string | undefined,
        content_type: (a.content_type ?? a.mime_type) as string | undefined,
        size: a.size as number | undefined,
      }))
    : [];
  return {
    id: (raw.id ?? raw.message_id ?? '') as string,
    from: (raw.from ?? raw.sender_beam ?? '') as string,
    to: (raw.to ?? raw.recipient_beam ?? '') as string,
    content: (raw.content ?? raw.message ?? '') as string,
    created_at: (raw.created_at ?? raw.timestamp ?? 0) as number | string,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

export async function fetchDMs(withBeam: string, limit = 100): Promise<ApiDmMessage[]> {
  try {
    const url = new URL(`${getDmUrl()}/dms`);
    url.searchParams.set('with', withBeam);
    url.searchParams.set('limit', String(limit));
    const res = await authedFetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    const arr: unknown[] = Array.isArray(data) ? data : (data.messages ?? data.dms ?? []);
    return arr
      .map(m => normaliseDm(m as Record<string, unknown>))
      .sort((a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime());
  } catch { return []; }
}

export async function sendDM(toBeam: string, content: string, attachmentIds?: (string | number)[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${getDmUrl()}/dms`, {
      method: 'POST',
      body: JSON.stringify({ to: toBeam, content, attachment_ids: attachmentIds ?? [] }),
    });
    if (!res.ok) {
      const data = await safeJson(res);
      return { ok: false, error: data.error as string };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
