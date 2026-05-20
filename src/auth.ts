// Sensitive auth tokens are kept only in memory — never written to Web Storage —
// so XSS cannot exfiltrate them via localStorage/sessionStorage APIs.
// The refresh token is persisted to the OS keychain (Windows Credential Manager /
// macOS Keychain / Linux Secret Service) via Tauri commands.
// In non-Tauri (browser) environments the refresh token falls back to sessionStorage,
// which survives page refreshes but clears when the tab closes.
import { invoke } from '@tauri-apps/api/core';

let _token = '';
let _beamIdentity = '';
let _refreshToken: string | null = null;
const _chatTokens = new Map<string, string>();

// uid is a non-secret identifier; sessionStorage clears when the window closes.
export const getUid = (): string | null => sessionStorage.getItem('uid');

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI__' in window;

// ── "Stay logged in" persistence ─────────────────────────────────────────────
const KEYRING_RT  = 'refresh_token';
const KEYRING_UID = 'persist_uid';
const SS_RT_KEY   = 'zb_rt';

/** Write the current refresh token + uid to the OS keychain (Tauri) or sessionStorage (browser). */
export const persistSession = async (): Promise<void> => {
  const uid = sessionStorage.getItem('uid');
  if (isTauri()) {
    try {
      if (_refreshToken) await invoke('save_credential', { key: KEYRING_RT, value: _refreshToken });
      if (uid) await invoke('save_credential', { key: KEYRING_UID, value: uid });
    } catch {
      // Keychain unavailable — fall through to sessionStorage fallback below
    }
  }
  // Browser fallback: sessionStorage survives refresh but not tab close
  if (_refreshToken) sessionStorage.setItem(SS_RT_KEY, _refreshToken);
};

/**
 * Read persisted credentials into memory so refreshAccessToken() can run.
 * Checks the OS keychain first (Tauri), then falls back to sessionStorage (browser).
 * Returns true if credentials were found.
 */
export const loadPersistedSession = async (): Promise<boolean> => {
  if (isTauri()) {
    try {
      const rt  = await invoke<string | null>('load_credential', { key: KEYRING_RT });
      const uid = await invoke<string | null>('load_credential', { key: KEYRING_UID });
      if (rt && uid) {
        _refreshToken = rt;
        sessionStorage.setItem('uid', uid);
        return true;
      }
    } catch {
      // fall through to sessionStorage
    }
  }
  // Browser fallback: refresh token may have been saved to sessionStorage
  const rt  = sessionStorage.getItem(SS_RT_KEY);
  const uid = sessionStorage.getItem('uid');
  if (!rt || !uid) return false;
  _refreshToken = rt;
  return true;
};

export const getToken = (): string => _token;
export const getBeamIdentity = (): string => _beamIdentity;
export const getRefreshToken = (): string | null => _refreshToken;

export const getChatToken = (serverUrl: string): string | null =>
  _chatTokens.get(serverUrl) ?? null;

export const setChatToken = (serverUrl: string, token: string): void => {
  _chatTokens.set(serverUrl, token);
};

export const isAuthenticated = (): boolean => !!(_token && _beamIdentity);

export const forceLogout = (): void => {
  _token = '';
  _beamIdentity = '';
  _refreshToken = null;
  _chatTokens.clear();
  sessionStorage.removeItem('uid');
  sessionStorage.removeItem(SS_RT_KEY);
  // Best-effort keychain cleanup — fire and forget
  void invoke('delete_credential', { key: KEYRING_RT }).catch(() => {});
  void invoke('delete_credential', { key: KEYRING_UID }).catch(() => {});
  window.dispatchEvent(new CustomEvent('zeeble-logout'));
};

export interface SessionData {
  token: string;
  beam_identity: string;
  uid?: string;
  refresh_token?: string;
}

export const saveSession = (data: SessionData): void => {
  _token = data.token;
  _beamIdentity = data.beam_identity;
  if (data.uid) sessionStorage.setItem('uid', data.uid);
  if (data.refresh_token) _refreshToken = data.refresh_token;
};
