/**
 * Configuration module for Zeeble client.
 * Provides functions to get various server URLs (auth, DM, ZCloud, active server).
 * URLs can come from environment variables or localStorage (user overrides).
 */

export const ENV_AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://api.zeeble.xyz';
export const ENV_DM_URL = import.meta.env.VITE_AUTH_URL || 'https://api.zeeble.xyz';
export const ENV_ZCLOUD_URL = import.meta.env.VITE_ZCLOUD_URL || 'https://cloud.zeeble.xyz';

/** Tenor API key from environment variable */
export const ENV_TENOR_KEY: string = import.meta.env.VITE_TENOR_API_KEY || '';

/**
 * Gets the auth server URL, prioritizing localStorage override.
 * @returns The auth server base URL
 */
export const getAuthUrl = (): string =>
localStorage.getItem('auth_server_url') || ENV_AUTH_URL;

/**
 * Gets the DM server URL, falling back to auth URL if not set.
 * @returns The DM server base URL
 */
export const getDmUrl = (): string =>
localStorage.getItem('dm_server_url') || ENV_DM_URL || getAuthUrl();

/**
 * Gets the ZCloud server URL for creating hosted servers.
 * @returns The ZCloud server base URL
 */
export const getZcloudUrl = (): string =>
localStorage.getItem('zcloud_url') || ENV_ZCLOUD_URL;

/**
 * Gets the currently active server URL.
 * This is the server the user is currently viewing/chatting in.
 * @returns The active server URL
 */
export const getServerUrl = (): string =>
localStorage.getItem('active_server_url') || '';

/**
 * Constructs the WebSocket URL for the active server.
 * @returns WebSocket URL (ws:// or wss://)
 */
export const getWsUrl = (): string => {
const base = getServerUrl().replace(/^http/, 'ws');
return `${base}/ws`;
};

/**
 * Checks if a URL is a ZCloud server (hosted server) based on URL pattern.
 * ZCloud servers have URLs like /servers/uuid
 * @param url - URL to check
 * @returns true if URL matches ZCloud pattern
 */
export const isZcloudUrl = (url: string): boolean =>
/\/servers\/[0-9a-f-]{8,}/i.test(url);
