// Sensitive auth tokens are kept only in memory — never written to Web Storage —
// so XSS cannot exfiltrate them via localStorage/sessionStorage APIs.
// Consequence: tokens do not survive a page/app reload; the user must re-authenticate.
let _token = '';
let _beamIdentity = '';
let _refreshToken: string | null = null;
const _chatTokens = new Map<string, string>();

// uid is a non-secret identifier; sessionStorage clears when the window closes.
export const getUid = (): string | null => sessionStorage.getItem('uid');

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
