import { useEffect, useRef, useState, useCallback } from 'react';
import { getDmUrl } from '../config';
import { getToken, forceLogout } from '../auth';
import { refreshAccessToken } from '../api/core';

const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;

function isTokenExpired(token: string): boolean {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(b64)) as { exp?: number };
    return typeof exp === 'number' && exp < Date.now() / 1000 + 60;
  } catch {
    return false;
  }
}

/**
 * Persistent DM WebSocket that lives at App level.
 * Auto-reconnects with exponential backoff whenever the connection drops.
 */
export function useDmWebSocket(enabled: boolean): WebSocket | null {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    const rawUrl = getDmUrl();
    if (!rawUrl) return;
    // Guard against StrictMode double-invoke
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    // Guard: don't open a doomed connection before tryAutoLogin sets the token.
    // Poll every 500 ms until the token lands, then connect immediately.
    const token = getToken();
    if (!token) {
      reconnectTimer.current = setTimeout(connect, 500);
      return;
    }

    const wsUrl = rawUrl.replace(/^http/, 'ws');
    // Do NOT embed the JWT in the URL — it would appear in server access logs
    // and browser history.  Instead we send a { type: "auth", token } message
    // as the very first frame after the connection opens, mirroring the pattern
    // used by the channel WebSocket (useWebSocket.ts).
    const url = `${wsUrl}/ws`;
    const socket = new WebSocket(url);
    wsRef.current = socket;

    socket.onopen = async () => {
      reconnectDelay.current = RECONNECT_BASE_MS;
      let currentToken = getToken();
      if (isTokenExpired(currentToken)) {
        const result = await refreshAccessToken();
        if (result === 'auth_error') { forceLogout(); socket.close(); return; }
        currentToken = getToken();
      }
      if (currentToken) {
        socket.send(JSON.stringify({ type: 'auth', token: currentToken }));
      }
      setWs(socket);
    };

    socket.onerror = () => { /* onclose will handle reconnect */ };

    socket.onclose = () => {
      if (wsRef.current !== socket) return;
      wsRef.current = null;
      setWs(null);
      if (!enabledRef.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
        connect();
      }, reconnectDelay.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    connect();

    // When the window regains focus, throttled reconnect timers resume.
    // Force an immediate reconnect instead of waiting for the backoff.
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const current = wsRef.current;
      if (!current || current.readyState === WebSocket.CLOSED) {
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectDelay.current = RECONNECT_BASE_MS;
        connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      enabledRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [enabled, connect]);

  return ws;
}
