export const ENV_AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://api.zeeble.xyz';
export const ENV_DM_URL = import.meta.env.VITE_DM_URL || 'https://dm.zeeble.xyz';
export const ENV_ZCLOUD_URL = import.meta.env.VITE_ZCLOUD_URL || 'https://cloud.zeeble.xyz';
export const ENV_TENOR_KEY: string = import.meta.env.VITE_TENOR_API_KEY || '';

export const getAuthUrl = (): string =>
  localStorage.getItem('auth_server_url') || ENV_AUTH_URL;

export const getDmUrl = (): string =>
  localStorage.getItem('dm_server_url') || ENV_DM_URL || getAuthUrl();

export const getZcloudUrl = (): string =>
  localStorage.getItem('zcloud_url') || ENV_ZCLOUD_URL;

export const getServerUrl = (): string =>
  localStorage.getItem('active_server_url') || '';

export const getWsUrl = (): string => {
  const base = getServerUrl().replace(/^http/, 'ws');
  return `${base}/v1/ws`;
};

export const isZcloudUrl = (url: string): boolean =>
  /\/servers\/[0-9a-f-]{8,}/i.test(url);
