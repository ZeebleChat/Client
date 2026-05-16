import { useEffect, useRef, useState, useCallback } from 'react';
import { getDmUrl } from '../config';
import { getToken } from '../auth';

const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;

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

    const wsUrl = rawUrl.replace(/^http/, 'ws');
    const token = getToken();
    const url = `${wsUrl}/ws?token=${encodeURIComponent(token ?? '')}`;
    const socket = new WebSocket(url);
    wsRef.current = socket;

    socket.onopen = () => {
      reconnectDelay.current = RECONNECT_BASE_MS;
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
    return () => {
      enabledRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [enabled, connect]);

  return ws;
}
