/**
 * Authentication and session management for Zeeble.
 * Handles storing/retrieving tokens, beam_identity, and chat tokens
 * per server in localStorage.
 */

/**
 * Retrieves the main authentication token from localStorage.
 * This token is used for auth server requests.
 */
export const getToken = (): string => localStorage.getItem('token') ?? '';
export const getBeamIdentity = (): string => localStorage.getItem('beam_identity') ?? '';

/** Retrieves the refresh token for token refresh flow */
export const getRefreshToken = (): string | null => localStorage.getItem('refresh_token');

/** Retrieves the user ID from the session */
export const getUid = (): string | null => localStorage.getItem('uid');

/**
 * Gets the chat-specific token for a server.
 * Each server may have its own token after token exchange.
 * @param serverUrl - The server's base URL
 */
export const getChatToken = (serverUrl: string): string | null =>
localStorage.getItem(`chat_token:${serverUrl}`);

/**
 * Stores the chat-specific token for a server.
 * @param serverUrl - The server's base URL
 * @param token - The chat token to store
 */
export const setChatToken = (serverUrl: string, token: string): void =>
void localStorage.setItem(`chat_token:${serverUrl}`, token);

/**
 * Checks if user has valid authentication tokens.
 * @returns true if both token and beam_identity exist
 */
export const isAuthenticated = (): boolean =>
!!(localStorage.getItem('token') && localStorage.getItem('beam_identity'));

/**
 * Forces logout by clearing all localStorage and dispatching a logout event.
 * Components listen for this event to update auth state.
 */
export const forceLogout = (): void => {
localStorage.clear();
window.dispatchEvent(new CustomEvent('zeeble-logout'));
};

/** Session data received from login/register/exchange endpoints */
export interface SessionData {
token: string;
beam_identity: string;
uid?: string;
refresh_token?: string;
}

/**
 * Saves session data to localStorage.
 * Called after successful login, register, or token exchange.
 * @param data - The session data containing tokens and identity
 */
export const saveSession = (data: SessionData): void => {
localStorage.setItem('token', data.token);
localStorage.setItem('beam_identity', data.beam_identity);
if (data.uid) localStorage.setItem('uid', data.uid);
if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
};
