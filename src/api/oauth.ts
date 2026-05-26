import { getAuthUrl } from '../config';
import { authedFetch } from './core';

// ── OAuth ─────────────────────────────────────────────────────────────────────

export type OAuthProvider = 'discord' | 'steam';

export interface OAuthStartResult {
  state: string;
  url: string;
}

export interface OAuthPollResult {
  ready: boolean;
  linked?: boolean;
  token?: string;
  refresh_token?: string;
  uid?: string;
  beam_identity?: string;
  error?: string;
}

export async function oauthStart(provider: OAuthProvider): Promise<OAuthStartResult | null> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/oauth/${provider}/start`, { method: 'POST' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function oauthPoll(state: string): Promise<OAuthPollResult> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/oauth/poll?state=${encodeURIComponent(state)}`);
    if (!res.ok) return { ready: false };
    return res.json();
  } catch { return { ready: false }; }
}

export async function oauthUnlink(provider: OAuthProvider): Promise<boolean> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/oauth/${provider}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}
