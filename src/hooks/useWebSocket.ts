/**
 * WebSocket hook for real-time chat functionality.
 * Manages connection, authentication, channel joining, message delivery,
 * and automatic reconnection with exponential backoff.
 */
import { useEffect, useRef, useCallback } from 'react';
import { getWsUrl, getServerUrl } from '../config';
import { getToken, getChatToken, getBeamIdentity } from '../auth';
import type { ApiMessage, ApiMemberGroup } from '../api';

const WS_RECONNECT_INITIAL_DELAY_MS = 3000;
const WS_RECONNECT_MAX_DELAY_MS = 30000;
const WS_HEARTBEAT_INTERVAL_MS = 45000;

export type WsEvent =
  | { type: 'message'; msg: ApiMessage }
  | { type: 'message_edited'; id: string | number; channel_id: string | number; content: string; edited_at?: string }
  | { type: 'message_deleted'; id: string | number; channel_id: string | number }
  | { type: 'member'; groups: ApiMemberGroup[] };

interface UseWebSocketOptions {
  serverUrl: string;
  channelId: string | number | null;
  onEvent: (event: WsEvent) => void;
}

export function useWebSocket({ serverUrl, channelId, onEvent }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(3000);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldReconnect = useRef(true);
  // Incremented on each cleanup so stale closures from prior mounts are ignored
  const connGenRef = useRef(0);
  const onEventRef = useRef(onEvent);
  const channelIdRef = useRef(channelId);

  onEventRef.current = onEvent;
  channelIdRef.current = channelId;

  const send = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }, []);

  const joinChannel = useCallback((cid: string | number) => {
    const serverUrl = getServerUrl();
    const token = getChatToken(serverUrl) || getToken();
    send({ type: 'join', token, channel_id: String(cid) });
  }, [send]);

  const connect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    const url = getWsUrl();
    if (!url || !/^wss?:\/\//.test(url)) return;

    const gen = connGenRef.current; // capture generation for stale-closure guard

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // If cleanup has already run (StrictMode double-invoke), discard this socket
      if (connGenRef.current !== gen) { ws.close(); return; }
      const serverUrl = getServerUrl();
      const token = getChatToken(serverUrl) || getToken();

      send({ type: 'auth', token });

      // Activate server
      const stored = serverUrl;
      if (stored) {
        const m = stored.match(/\/servers\/([0-9a-f-]{8,})/i);
        const serverId = m ? m[1] : stored;
        send({ type: 'activate', server_id: serverId, token });
      }

      // Join current channel
      if (channelIdRef.current != null) {
        joinChannel(channelIdRef.current);
      }

      // Heartbeat
      heartbeat.current = setInterval(() => send({ type: 'ping' }), WS_HEARTBEAT_INTERVAL_MS);
      reconnectDelay.current = WS_RECONNECT_INITIAL_DELAY_MS;
    };

    ws.onclose = () => {
      if (heartbeat.current) clearInterval(heartbeat.current);
      if (!shouldReconnect.current) return;
      const delay = reconnectDelay.current;
      reconnectTimer.current = setTimeout(connect, delay);
      reconnectDelay.current = Math.min(delay * 2, WS_RECONNECT_MAX_DELAY_MS);
    };

    ws.onerror = () => { /* ws.onclose will fire */ };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data as string); }
      catch { return; }

      if (msg.type === 'pong' || msg.type === 'activated') return;

      if (msg.kind === 'message' || msg.type === 'message') {
        onEventRef.current({
          type: 'message',
          msg: msg as unknown as ApiMessage,
        });
        return;
      }

      if (msg.type === 'message_edited') {
        onEventRef.current({
          type: 'message_edited',
          id: msg.id as string,
          channel_id: msg.channel_id as string,
          content: msg.content as string,
          edited_at: msg.edited_at as string | undefined,
        });
        return;
      }

      if (msg.type === 'message_deleted') {
        onEventRef.current({
          type: 'message_deleted',
          id: msg.id as string,
          channel_id: msg.channel_id as string,
        });
        return;
      }

      if (msg.type === 'member' && Array.isArray(msg.members)) {
        onEventRef.current({
          type: 'member',
          groups: msg.members as ApiMemberGroup[],
        });
        return;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, joinChannel, serverUrl]);

  // Reconnect & re-join when channelId changes
  useEffect(() => {
    if (channelId != null && wsRef.current?.readyState === WebSocket.OPEN) {
      joinChannel(channelId);
    }
  }, [channelId, joinChannel]);

  // Initial connection
  useEffect(() => {
    shouldReconnect.current = true;
    connect();
    return () => {
      // Invalidate current generation so any in-flight onopen is ignored
      connGenRef.current += 1;
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeat.current) clearInterval(heartbeat.current);
      // Only close if already open — avoids the "closed before established" warning
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { send, joinChannel };
}

// Helper to send a chat message over the WS (used by ChatMain)
export function buildChatMessagePayload(
  channelId: string | number,
  content: string,
  attachmentIds: (string | number)[] = [],
) {
  const serverUrl = getServerUrl();
  const token = getChatToken(serverUrl) || getToken();
  const beamId = getBeamIdentity();
  const isCloud = attachmentIds.length > 0 && typeof attachmentIds[0] === 'string';
  return {
    payload: {
      type: 'message',
      token,
      channel_id: String(channelId),
      content,
      ...(isCloud
        ? { attachment_id: attachmentIds[0] }
        : { attachment_ids: attachmentIds }),
    },
    optimistic: {
      id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      channel_id: channelId,
      beam_identity: beamId,
      content,
      created_at: Math.floor(Date.now() / 1000),
      attachments: [],
    } satisfies ApiMessage,
  };
}
