import { getServerUrl } from '../config';
import { authedFetch, unwrapArray } from './core';

// ── Messages ──────────────────────────────────────────────────────────────────

export interface ApiAttachment {
  id: string | number;
  filename?: string;
  content_type?: string;
  size?: number;
}

export interface ApiMessage {
  id: string | number;
  channel_id: string | number;
  beam_identity: string;
  content: string;
  title?: string | null;
  reply_to?: string | number | null;
  created_at: number | string;
  attachments?: ApiAttachment[];
  edited_at?: string | null;
  mentions?: string[];
}

export interface MessagePage {
  messages: ApiMessage[];
  has_more: boolean;
}

export async function fetchMessages(
  channelId: string | number,
  opts: { before?: string; limit?: number } = {},
): Promise<MessagePage> {
  try {
    const params = new URLSearchParams();
    if (opts.before) params.set('before', opts.before);
    if (opts.limit != null) params.set('limit', String(opts.limit));
    const query = params.toString() ? `?${params}` : '';
    const res = await authedFetch(
      `${getServerUrl()}/v1/channels/${encodeURIComponent(String(channelId))}/messages${query}`
    );
    if (!res.ok) return { messages: [], has_more: false };
    const data = await res.json();
    return {
      messages: unwrapArray<ApiMessage>(data, 'messages'),
      has_more: data?.has_more === true,
    };
  } catch { return { messages: [], has_more: false }; }
}

export interface PostPage {
  posts: ApiMessage[];
  has_more: boolean;
  offset: number;
}

export async function fetchBoardPosts(
  channelId: string | number,
  opts: { limit?: number; offset?: number } = {},
): Promise<PostPage> {
  try {
    const params = new URLSearchParams();
    if (opts.limit != null) params.set('limit', String(opts.limit));
    if (opts.offset != null) params.set('offset', String(opts.offset));
    const query = params.toString() ? `?${params}` : '';
    const res = await authedFetch(
      `${getServerUrl()}/v1/channels/${encodeURIComponent(String(channelId))}/posts${query}`
    );
    if (!res.ok) return { posts: [], has_more: false, offset: opts.offset ?? 0 };
    const data = await res.json();
    return {
      posts: unwrapArray<ApiMessage>(data, 'posts'),
      has_more: data?.has_more === true,
      offset: data?.offset ?? opts.offset ?? 0,
    };
  } catch { return { posts: [], has_more: false, offset: opts.offset ?? 0 }; }
}

export interface ReplyPage {
  replies: ApiMessage[];
  has_more: boolean;
  offset: number;
}

export async function fetchPostReplies(
  channelId: string | number,
  postId: string | number,
  opts: { limit?: number; offset?: number } = {},
): Promise<ReplyPage> {
  try {
    const params = new URLSearchParams();
    if (opts.limit != null) params.set('limit', String(opts.limit));
    if (opts.offset != null) params.set('offset', String(opts.offset));
    const query = params.toString() ? `?${params}` : '';
    const res = await authedFetch(
      `${getServerUrl()}/v1/channels/${encodeURIComponent(String(channelId))}/posts/${encodeURIComponent(String(postId))}/replies${query}`
    );
    if (!res.ok) return { replies: [], has_more: false, offset: opts.offset ?? 0 };
    const data = await res.json();
    return {
      replies: unwrapArray<ApiMessage>(data, 'replies'),
      has_more: data?.has_more === true,
      offset: data?.offset ?? opts.offset ?? 0,
    };
  } catch { return { replies: [], has_more: false, offset: opts.offset ?? 0 }; }
}

// ── Message editing ───────────────────────────────────────────────────────────

export interface ApiEditHistoryEntry {
  content: string;
  edited_by: string;
  edited_at: number;
}

export async function editMessage(messageId: string | number, content: string): Promise<boolean> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/v1/messages/${encodeURIComponent(String(messageId))}`,
      { method: 'PATCH', body: JSON.stringify({ content }) }
    );
    return res.ok;
  } catch { return false; }
}

export async function deleteMessage(messageId: string | number): Promise<boolean> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/v1/messages/${encodeURIComponent(String(messageId))}`,
      { method: 'DELETE' }
    );
    return res.ok;
  } catch { return false; }
}

export async function fetchMessageHistory(messageId: string | number): Promise<ApiEditHistoryEntry[]> {
  try {
    const res = await authedFetch(
      `${getServerUrl()}/v1/messages/${encodeURIComponent(String(messageId))}/history`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return unwrapArray<ApiEditHistoryEntry>(data, 'history');
  } catch { return []; }
}
