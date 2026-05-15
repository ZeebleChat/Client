import { useEffect, useRef, useCallback } from 'react';
import { getWsUrl, getServerUrl } from '../config';
import { getToken, getChatToken, getBeamIdentity } from '../auth';
import type { ApiMessage, ApiMemberGroup, ApiChannel } from '../api';

const WS_RECONNECT_INITIAL_DELAY_MS = 3000;
const WS_RECONNECT_MAX_DELAY_MS = 30000;
const WS_HEARTBEAT_INTERVAL_MS = 45000;

export type WsEvent =
  | { type: 'message'; msg: ApiMessage }
  | { type: 'message_edited'; id: string | number; channel_id: string | number; content: string; edited_at?: string }
  | { type: 'message_deleted'; id: string | number; channel_id: string | number }
  | { type: 'member'; groups: ApiMemberGroup[] }
  | { type: 'channel_created'; channel: ApiChannel }
  | { type: 'channel_deleted'; channel_id: string | number }
  | { type: 'channel_renamed'; channel: ApiChannel }
  | { type: 'voice_state'; channel_id: string; identity: string; action: 'join' | 'leave' }
  | { type: 'voice_joined'; channel_id: string }
  | { type: 'stream_start'; channel_id: string; broadcaster: string }
  | { type: 'stream_end'; channel_id: string }
  | { type: 'stream_started'; channel_id: string }
  | { type: 'stream_joined'; channel_id: string; broadcaster: string };

interface UseWebSocketOptions {
  serverUrl: string;
  channelId: string | number | null;
  onEvent: (event: WsEvent) => void;
  /** Called directly (bypassing React state) for every incoming voice_audio frame. */
  onVoiceAudio?: (from: string, channelId: string, data: string) => void;
  /** Called directly (bypassing React state) for every incoming stream_audio frame. */
  onStreamAudio?: (channelId: string, data: string) => void;
  /** Called directly (bypassing React state) for every incoming stream_frame (screen share JPEG). */
  onScreenFrame?: (from: string, channelId: string, data: string) => void;
}

export function useWebSocket({ serverUrl, channelId, onEvent, onVoiceAudio, onStreamAudio, onScreenFrame }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(3000);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldReconnect = useRef(true);
  const connGenRef = useRef(0);
  const onEventRef = useRef(onEvent);
  const onVoiceAudioRef = useRef(onVoiceAudio);
  const onStreamAudioRef = useRef(onStreamAudio);
  const onScreenFrameRef = useRef(onScreenFrame);
  const channelIdRef = useRef(channelId);

  onEventRef.current = onEvent;
  onVoiceAudioRef.current = onVoiceAudio;
  onStreamAudioRef.current = onStreamAudio;
  onScreenFrameRef.current = onScreenFrame;
  channelIdRef.current = channelId;

  const send = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }, []);

  const joinChannel = useCallback((cid: string | number) => {
    const token = getChatToken(getServerUrl()) || getToken();
    send({ type: 'join', token, channel_id: String(cid) });
  }, [send]);

  const connect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    const url = getWsUrl();
    if (!url || !/^wss?:\/\//.test(url)) return;

    const gen = connGenRef.current;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (connGenRef.current !== gen) { ws.close(); return; }

      const serverUrl = getServerUrl();
      const token = getChatToken(serverUrl) || getToken();
      send({ type: 'auth', token });

      if (serverUrl) {
        const m = serverUrl.match(/\/servers\/([0-9a-f-]{8,})/i);
        const serverId = m ? m[1] : serverUrl;
        send({ type: 'activate', server_id: serverId, token });
      }

      if (channelIdRef.current != null) {
        joinChannel(channelIdRef.current);
      }

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

    ws.onerror = () => { /* onclose fires next */ };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data as string); }
      catch { return; }

      if (msg.type === 'pong' || msg.type === 'activated') return;

      // voice_audio is high-frequency — bypass React state entirely.
      if (msg.type === 'voice_audio') {
        onVoiceAudioRef.current?.(msg.from as string, msg.channel_id as string, msg.data as string);
        return;
      }

      // stream_audio is high-frequency — bypass React state entirely.
      if (msg.type === 'stream_audio') {
        onStreamAudioRef.current?.(msg.channel_id as string, msg.data as string);
        return;
      }

      // stream_frame (screen share JPEG) is high-frequency — bypass React state entirely.
      if (msg.type === 'stream_frame') {
        onScreenFrameRef.current?.(msg.from as string, msg.channel_id as string, msg.data as string);
        return;
      }

      if (msg.type === 'voice_joined') return;

      if (msg.type === 'stream_started') {
        onEventRef.current({ type: 'stream_started', channel_id: msg.channel_id as string });
        return;
      }
      if (msg.type === 'stream_joined') {
        onEventRef.current({ type: 'stream_joined', channel_id: msg.channel_id as string, broadcaster: msg.broadcaster as string });
        return;
      }
      if (msg.type === 'stream_start') {
        onEventRef.current({ type: 'stream_start', channel_id: msg.channel_id as string, broadcaster: msg.broadcaster as string });
        return;
      }
      if (msg.type === 'stream_end') {
        onEventRef.current({ type: 'stream_end', channel_id: msg.channel_id as string });
        return;
      }

      if (msg.type === 'voice_state') {
        onEventRef.current({
          type: 'voice_state',
          channel_id: msg.channel_id as string,
          identity: msg.identity as string,
          action: msg.action as 'join' | 'leave',
        });
        return;
      }

      if (msg.kind === 'message' || msg.type === 'message') {
        onEventRef.current({ type: 'message', msg: msg as unknown as ApiMessage });
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
        onEventRef.current({ type: 'member', groups: msg.members as ApiMemberGroup[] });
      }
      if (msg.type === 'channel_created' && msg.channel) {
        onEventRef.current({ type: 'channel_created', channel: msg.channel as ApiChannel });
      }
      if (msg.type === 'channel_deleted' && msg.channel_id != null) {
        onEventRef.current({ type: 'channel_deleted', channel_id: msg.channel_id as string });
      }
      if (msg.type === 'channel_renamed' && msg.channel) {
        onEventRef.current({ type: 'channel_renamed', channel: msg.channel as ApiChannel });
      }
    };
  // connect uses refs for all dynamic values — deps intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);

  useEffect(() => {
    if (channelId != null && wsRef.current?.readyState === WebSocket.OPEN) {
      joinChannel(channelId);
    }
  }, [channelId, joinChannel]);

  useEffect(() => {
    shouldReconnect.current = true;
    connect();
    return () => {
      connGenRef.current += 1;
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeat.current) clearInterval(heartbeat.current);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { send, joinChannel };
}

export function buildChatMessagePayload(
  channelId: string | number,
  content: string,
  attachmentIds: (string | number)[] = [],
  opts?: { title?: string; replyTo?: string | number },
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
      ...(opts?.title ? { title: opts.title } : {}),
      ...(opts?.replyTo != null ? { reply_to: String(opts.replyTo) } : {}),
      ...(isCloud
        ? { attachment_id: attachmentIds[0] }
        : { attachment_ids: attachmentIds }),
    },
    optimistic: {
      id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      channel_id: channelId,
      beam_identity: beamId,
      content,
      title: opts?.title ?? null,
      reply_to: opts?.replyTo ?? null,
      created_at: Math.floor(Date.now() / 1000),
      attachments: [],
    } satisfies ApiMessage,
  };
}
