export const ENV_AUTH_URL    = import.meta.env.VITE_AUTH_URL    || (import.meta.env.DEV ? '/zb-api'    : 'https://api.zeeble.xyz');
export const ENV_MARKET_URL  = import.meta.env.VITE_MARKET_URL  || (import.meta.env.DEV ? '/zb-market' : 'https://market.zeeble.xyz');
export const ENV_DM_URL      = import.meta.env.VITE_DM_URL      || 'https://dm.zeeble.xyz';
export const ENV_ZCLOUD_URL  = import.meta.env.VITE_ZCLOUD_URL  || (import.meta.env.DEV ? '/zb-cloud'  : 'https://cloud.zeeble.xyz');

/**
 * Accepts a URL only if it is a well-formed http(s) address.
 * Returns `fallback` when the stored value is absent, unparseable, or uses
 * any scheme other than http / https  (blocks javascript:, data:, ftp: …).
 *
 * Deliberately does NOT restrict which origin is allowed — self-hosted
 * deployments need freedom to point at any domain.  The guarantee is only
 * that we never fire a request at a non-HTTP target, no matter what ends up
 * in localStorage (XSS, dev-console paste, corrupt storage).
 *
 * Trailing slashes are stripped so callers can safely append paths with "/".
 */
export function sanitizeServerUrl(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  try {
    const { protocol } = new URL(raw);
    if (protocol !== 'https:' && protocol !== 'http:') return fallback;
    return raw.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

export const getAuthUrl = (): string =>
  sanitizeServerUrl(localStorage.getItem('auth_server_url'), ENV_AUTH_URL);

export const getDmUrl = (): string =>
  sanitizeServerUrl(localStorage.getItem('dm_server_url'), ENV_DM_URL || getAuthUrl());

export const getZcloudUrl = (): string =>
  sanitizeServerUrl(localStorage.getItem('zcloud_url'), ENV_ZCLOUD_URL);

export const getMarketUrl = (): string =>
  sanitizeServerUrl(localStorage.getItem('market_server_url'), ENV_MARKET_URL);

export const getServerUrl = (): string =>
  sanitizeServerUrl(localStorage.getItem('active_server_url'), '');

export const getWsUrl = (): string => {
  const base = getServerUrl().replace(/^http/, 'ws');
  return `${base}/v1/ws`;
};

export const isZcloudUrl = (url: string): boolean =>
  /\/servers\/[0-9a-f-]{8,}/i.test(url);
