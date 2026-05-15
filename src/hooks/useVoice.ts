import { useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getChatToken } from '../auth';
import { getServerUrl } from '../config';
import { getBeamIdentity } from '../auth';
import type { ApiChannel } from '../api';

const MIC_LEVEL_MULTIPLIER = 400;
const MIC_METER_INTERVAL_MS = 80;

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface Participant {
  identity: string;
  name: string;
  isMuted: boolean;
  isSpeaking: boolean;
}

export interface VoiceState {
  status: VoiceStatus;
  channel: ApiChannel | null;
  participants: Participant[];
  micLevel: number;
  micSilent: boolean;
  errorMsg: string;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  showScreenPicker: boolean;
}

const INITIAL: VoiceState = {
  status: 'idle',
  channel: null,
  participants: [],
  micLevel: 0,
  micSilent: false,
  errorMsg: '',
  isMuted: false,
  isDeafened: false,
  isScreenSharing: false,
  showScreenPicker: false,
};

interface ParticipantDecoder {
  decoder: AudioDecoder;
  nextPlayTime: number;
}

// Safe base64 encode for binary data of any length.
function toBase64(bytes: Uint8Array): string {
  let str = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(str);
}

export function useVoice() {
  const [state, setState] = useState<VoiceState>(INITIAL);
  const stateRef = useRef<VoiceState>(INITIAL);

  const sendRef = useRef<((msg: Record<string, unknown>) => void) | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const encoderRef = useRef<AudioEncoder | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const decodersRef = useRef<Map<string, ParticipantDecoder>>(new Map());
  const isDeafenedRef = useRef(false);
  const connGenRef = useRef(0);

  function set(patch: Partial<VoiceState>) {
    setState(prev => {
      const next = { ...prev, ...patch };
      stateRef.current = next;
      return next;
    });
  }

  function stopMicMeter() {
    if (micIntervalRef.current) {
      clearInterval(micIntervalRef.current);
      micIntervalRef.current = null;
    }
    set({ micLevel: 0, micSilent: false });
  }

  function startMicMeter(stream: MediaStream) {
    stopMicMeter();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let silentTicks = 0;
      const SILENCE_THRESHOLD = Math.ceil(5000 / MIC_METER_INTERVAL_MS);
      micIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const level = Math.min(100, Math.round(Math.sqrt(sum / data.length) * MIC_LEVEL_MULTIPLIER));
        set({ micLevel: level });
        if (level === 0) {
          silentTicks++;
          if (silentTicks >= SILENCE_THRESHOLD) set({ micSilent: true });
        } else {
          silentTicks = 0;
          set({ micSilent: false });
        }
      }, MIC_METER_INTERVAL_MS);
    } catch { /* non-fatal */ }
  }

  function cleanupDecoders() {
    for (const { decoder } of decodersRef.current.values()) {
      try { decoder.close(); } catch { /* ignore */ }
    }
    decodersRef.current.clear();
  }

  function getOrCreateDecoder(identity: string): ParticipantDecoder {
    const existing = decodersRef.current.get(identity);
    if (existing) return existing;

    const ctx = audioCtxRef.current!;
    const decoder = new AudioDecoder({
      output: (audioData: AudioData) => {
        if (isDeafenedRef.current) { audioData.close(); return; }
        try {
          const buffer = ctx.createBuffer(
            audioData.numberOfChannels,
            audioData.numberOfFrames,
            audioData.sampleRate,
          );
          for (let i = 0; i < audioData.numberOfChannels; i++) {
            audioData.copyTo(buffer.getChannelData(i), { planeIndex: i });
          }
          audioData.close();

          const entry = decodersRef.current.get(identity);
          if (!entry) return;
          const now = ctx.currentTime;
          // Reset play cursor if we've fallen behind (gap or first frame).
          if (entry.nextPlayTime < now) entry.nextPlayTime = now + 0.05;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(entry.nextPlayTime);
          entry.nextPlayTime += buffer.duration;
        } catch { /* ignore */ }
      },
      error: () => { /* drop silently */ },
    });

    decoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 });
    const entry: ParticipantDecoder = { decoder, nextPlayTime: 0 };
    decodersRef.current.set(identity, entry);
    return entry;
  }

  // Called from useWebSocket whenever a voice_audio frame arrives.
  // Bypasses React state — must stay fast and allocation-light.
  const handleVoiceAudio = useCallback((from: string, _channelId: string, base64data: string) => {
    if (!audioCtxRef.current || stateRef.current.status !== 'connected') return;
    if (from === getBeamIdentity()) return; // skip own echo
    try {
      const binary = atob(base64data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const { decoder } = getOrCreateDecoder(from);
      decoder.decode(new EncodedAudioChunk({
        type: 'key',
        timestamp: performance.now() * 1000,
        data: bytes,
      }));
    } catch { /* drop bad frame */ }
  // stable — reads only refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stores the latest JPEG frame per identity — updated directly to avoid
  // triggering voiceState re-renders on every 15fps frame.
  const remoteFramesRef = useRef<Map<string, string>>(new Map());
  const [remoteFrames, setRemoteFrames] = useState<Map<string, string>>(new Map());

  // Called from useWebSocket for every incoming stream_frame — bypasses voiceState.
  const handleScreenFrame = useCallback((from: string, channelId: string, data: string) => {
    const currentChannel = stateRef.current.channel;
    if (!currentChannel || String(currentChannel.id) !== String(channelId)) return;
    if (from === getBeamIdentity()) return;
    const next = new Map(remoteFramesRef.current);
    next.set(from, data);
    remoteFramesRef.current = next;
    setRemoteFrames(next);
  // stable — reads only refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called from App.tsx when a voice_state WS event arrives.
  const handleVoiceState = useCallback((event: {
    channel_id: string;
    identity: string;
    action: 'join' | 'leave';
  }) => {
    const currentChannel = stateRef.current.channel;
    if (!currentChannel || String(currentChannel.id) !== String(event.channel_id)) return;
    if (event.identity === getBeamIdentity()) return; // don't list ourselves

    setState(prev => {
      const next = { ...prev };
      if (event.action === 'join') {
        if (prev.participants.some(p => p.identity === event.identity)) return prev;
        next.participants = [
          ...prev.participants,
          { identity: event.identity, name: event.identity, isMuted: false, isSpeaking: false },
        ];
      } else {
        try { decodersRef.current.get(event.identity)?.decoder.close(); } catch { /* ignore */ }
        decodersRef.current.delete(event.identity);
        next.participants = prev.participants.filter(p => p.identity !== event.identity);
      }
      stateRef.current = next;
      return next;
    });
  // stable — reads only refs and decodersRef
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = useCallback(async () => {
    const ch = stateRef.current.channel;
    if (ch && sendRef.current) {
      sendRef.current({ type: 'voice_leave', channel_id: String(ch.id) });
    }
    // Stop screen capture if active
    if (stateRef.current.isScreenSharing) {
      invoke('stop_screen_capture').catch(() => {});
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
    stopMicMeter();
    cleanupDecoders();

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    if (encoderRef.current) {
      try { encoderRef.current.close(); } catch { /* ignore */ }
      encoderRef.current = null;
    }

    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;

    if (audioCtxRef.current) {
      await audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    sendRef.current = null;
    remoteFramesRef.current = new Map();
    setRemoteFrames(new Map());
    setState(INITIAL);
    stateRef.current = INITIAL;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = useCallback(async (
    channel: ApiChannel,
    sendFn: (msg: Record<string, unknown>) => void,
  ) => {
    if (stateRef.current.status === 'connected' && stateRef.current.channel?.id === channel.id) return;
    if (stateRef.current.status === 'connecting') return;
    if (stateRef.current.status !== 'idle') await leave();

    sendRef.current = sendFn;
    const gen = ++connGenRef.current;
    set({ status: 'connecting', channel, errorMsg: '', participants: [] });

    const serverUrl = getServerUrl();
    const token = getChatToken(serverUrl);
    if (!token) {
      set({ status: 'error', errorMsg: 'Not authenticated to this server' });
      return;
    }

    // Request mic with preferred settings for voice chat.
    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (connGenRef.current !== gen) { micStream.getTracks().forEach(t => t.stop()); return; }
      micStreamRef.current = micStream;
    } catch {
      if (connGenRef.current !== gen) return;
      set({ status: 'error', errorMsg: 'Microphone permission denied' });
      return;
    }

    const ctx = new AudioContext({ sampleRate: 48000 });
    audioCtxRef.current = ctx;

    try {
      await ctx.audioWorklet.addModule('/mic-processor.js');
    } catch (e) {
      if (connGenRef.current !== gen) return;
      set({ status: 'error', errorMsg: `AudioWorklet failed: ${(e as Error).message}` });
      return;
    }

    const encoder = new AudioEncoder({
      output: (chunk: EncodedAudioChunk) => {
        if (stateRef.current.isMuted) return;
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        sendRef.current?.({
          type: 'voice_audio',
          channel_id: String(channel.id),
          data: toBase64(data),
        });
      },
      error: (e: Error) => console.error('AudioEncoder:', e),
    });
    encoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 });
    encoderRef.current = encoder;

    const source = ctx.createMediaStreamSource(micStream);
    const workletNode = new AudioWorkletNode(ctx, 'mic-processor');
    workletNodeRef.current = workletNode;

    let frameTimestamp = 0;
    workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (stateRef.current.isMuted) return;
      const enc = encoderRef.current;
      if (!enc || enc.state === 'closed') return;
      const pcm = e.data;
      enc.encode(new AudioData({
        format: 'f32',
        sampleRate: 48000,
        numberOfFrames: pcm.length,
        numberOfChannels: 1,
        timestamp: frameTimestamp,
        data: pcm as unknown as Float32Array<ArrayBuffer>,
      }));
      frameTimestamp += pcm.length * (1_000_000 / 48000);
    };

    source.connect(workletNode);

    // Notify server.
    sendFn({ type: 'voice_join', channel_id: String(channel.id) });

    if (connGenRef.current !== gen) { await leave(); return; }
    set({ status: 'connected', channel, participants: [] });
    startMicMeter(micStream);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leave]);

  const toggleMute = useCallback(() => {
    set({ isMuted: !stateRef.current.isMuted });
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !stateRef.current.isDeafened;
    isDeafenedRef.current = next;
    set({ isDeafened: next });
  }, []);

  const toggleScreenShare = useCallback(() => {
    if (stateRef.current.isScreenSharing) {
      invoke('stop_screen_capture').catch(() => {});
      unlistenRef.current?.();
      unlistenRef.current = null;
      set({ isScreenSharing: false });
    } else {
      set({ showScreenPicker: true });
    }
  }, []);

  const startScreenCapture = useCallback(async (sourceId: string) => {
    if (!sourceId) {
      set({ showScreenPicker: false });
      return;
    }
    const channel = stateRef.current.channel;
    if (!channel) return;

    set({ showScreenPicker: false, isScreenSharing: true });

    try {
      await invoke('start_screen_capture', { sourceId });
      const unlisten = await listen<string>('screen-frame', (event) => {
        sendRef.current?.({
          type: 'stream_frame',
          channel_id: String(channel.id),
          data: event.payload,
        });
      });
      unlistenRef.current = unlisten;
    } catch (e) {
      console.error('Screen capture failed:', e);
      set({ isScreenSharing: false });
    }
  }, []);

  return {
    voiceState: state,
    remoteFrames,
    joinVoice: join,
    leaveVoice: leave,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    startScreenCapture,
    handleVoiceAudio,
    handleVoiceState,
    handleScreenFrame,
  };
}
