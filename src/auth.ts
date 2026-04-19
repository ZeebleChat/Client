export const getToken = (): string => localStorage.getItem('token') ?? '';
export const getBeamIdentity = (): string => localStorage.getItem('beam_identity') ?? '';
export const getRefreshToken = (): string | null => localStorage.getItem('refresh_token');
export const getUid = (): string | null => localStorage.getItem('uid');

export const getChatToken = (serverUrl: string): string | null =>
  localStorage.getItem(`chat_token:${serverUrl}`);

export const setChatToken = (serverUrl: string, token: string): void =>
  void localStorage.setItem(`chat_token:${serverUrl}`, token);

export const isAuthenticated = (): boolean =>
  !!(localStorage.getItem('token') && localStorage.getItem('beam_identity'));

export const forceLogout = (): void => {
  const preserve = new Set(
    Object.keys(localStorage).filter(k =>
      !k.startsWith('token') &&
      !k.startsWith('beam_identity') &&
      !k.startsWith('refresh_token') &&
      !k.startsWith('uid') &&
      !k.startsWith('chat_token:')
    )
  );
  Object.keys(localStorage).forEach(k => { if (!preserve.has(k)) localStorage.removeItem(k); });
  window.dispatchEvent(new CustomEvent('zeeble-logout'));
};

export interface SessionData {
  token: string;
  beam_identity: string;
  uid?: string;
  refresh_token?: string;
}

export const saveSession = (data: SessionData): void => {
  localStorage.setItem('token', data.token);
  localStorage.setItem('beam_identity', data.beam_identity);
  if (data.uid) localStorage.setItem('uid', data.uid);
  if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
};
