import { useState, useRef, useCallback } from 'react';
import type { ApiChannel } from '../api';

export type StreamStatus = 'idle' | 'broadcasting' | 'viewing' | 'error';

export interface StreamState {
  status: StreamStatus;
  channel: ApiChannel | null;
  broadcaster: string | null;
  micLevel: number;
  isMuted: boolean;
  errorMsg: string;
}

const INITIAL: StreamState = {
  status: 'idle',
  channel: null,
  broadcaster: null,
  micLevel: 0,
  isMuted: false,
  errorMsg: '',
};

const MIC_LEVEL_MULTIPLIER = 400;
const MIC_METER_INTERVAL_MS = 80;

function toBase64(bytes: Uint8Array): string {
  let str = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(str);
}

interface DecoderEntry {
  decoder: AudioDecoder;
  nextPlayTime: number;
}

export function useStream() {
  const [state, setState] = useState<StreamState>(INITIAL);
  const stateRef = useRef<StreamState>(INITIAL);

  const sendRef = useRef<((msg: Record<string, unknown>) => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const encoderRef = useRef<AudioEncoder | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const decoderRef = useRef<DecoderEntry | null>(null);
  const connGenRef = useRef(0);

  function set(patch: Partial<StreamState>) {
    setState(prev => {
      const next = { ...prev, ...patch };
      stateRef.current = next;
      return next;
    });
  }

  function stopMicMeter() {
    if (micIntervalRef.current) { clearInterval(micIntervalRef.current); micIntervalRef.current = null; }
    set({ micLevel: 0 });
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
      micIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const level = Math.min(100, Math.round(Math.sqrt(sum / data.length) * MIC_LEVEL_MULTIPLIER));
        set({ micLevel: level });
      }, MIC_METER_INTERVAL_MS);
    } catch { /* non-fatal */ }
  }

  function cleanupAudio() {
    stopMicMeter();
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    if (encoderRef.current) { try { encoderRef.current.close(); } catch { /* ignore */ } encoderRef.current = null; }
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    if (decoderRef.current) { try { decoderRef.current.decoder.close(); } catch { /* ignore */ } decoderRef.current = null; }
  }

  const stop = useCallback(async () => {
    const { channel, status } = stateRef.current;
    if (sendRef.current && channel) {
      if (status === 'broadcasting') sendRef.current({ type: 'stream_stop', channel_id: String(channel.id) });
      else if (status === 'viewing') sendRef.current({ type: 'stream_leave', channel_id: String(channel.id) });
    }
    cleanupAudio();
    if (audioCtxRef.current) { await audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    sendRef.current = null;
    setState(INITIAL);
    stateRef.current = INITIAL;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startBroadcast = useCallback(async (
    channel: ApiChannel,
    sendFn: (msg: Record<string, unknown>) => void,
  ) => {
    if (stateRef.current.status !== 'idle') await stop();
    sendRef.current = sendFn;
    const gen = ++connGenRef.current;
    set({ status: 'broadcasting', channel, errorMsg: '', broadcaster: null });

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
        sendRef.current?.({ type: 'stream_audio', channel_id: String(channel.id), data: toBase64(data) });
      },
      error: (e: Error) => console.error('stream encoder:', e),
    });
    encoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 });
    encoderRef.current = encoder;

    const source = ctx.createMediaStreamSource(micStream);
    const workletNode = new AudioWorkletNode(ctx, 'mic-processor');
    workletNodeRef.current = workletNode;
    let frameTimestamp = 0;
    workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (stateRef.current.isMuted) return;
      const pcm = e.data;
      encoder.encode(new AudioData({
        format: 'f32', sampleRate: 48000, numberOfFrames: pcm.length,
        numberOfChannels: 1, timestamp: frameTimestamp, data: pcm as unknown as Float32Array<ArrayBuffer>,
      }));
      frameTimestamp += pcm.length * (1_000_000 / 48000);
    };
    source.connect(workletNode);

    sendFn({ type: 'stream_start', channel_id: String(channel.id) });
    if (connGenRef.current !== gen) { await stop(); return; }
    startMicMeter(micStream);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  const joinAsViewer = useCallback(async (
    channel: ApiChannel,
    broadcaster: string,
    sendFn: (msg: Record<string, unknown>) => void,
  ) => {
    if (stateRef.current.status !== 'idle') await stop();
    sendRef.current = sendFn;
    set({ status: 'viewing', channel, broadcaster, errorMsg: '' });

    const ctx = new AudioContext({ sampleRate: 48000 });
    audioCtxRef.current = ctx;

    const decoder = new AudioDecoder({
      output: (audioData: AudioData) => {
        const ctx = audioCtxRef.current;
        if (!ctx) { audioData.close(); return; }
        try {
          const buffer = ctx.createBuffer(audioData.numberOfChannels, audioData.numberOfFrames, audioData.sampleRate);
          for (let i = 0; i < audioData.numberOfChannels; i++) {
            audioData.copyTo(buffer.getChannelData(i), { planeIndex: i });
          }
          audioData.close();
          const entry = decoderRef.current;
          if (!entry) return;
          const now = ctx.currentTime;
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
    decoderRef.current = { decoder, nextPlayTime: 0 };

    sendFn({ type: 'stream_join', channel_id: String(channel.id) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  // Bypasses React state — called directly from useWebSocket for every stream_audio frame.
  const handleStreamAudio = useCallback((_channelId: string, base64data: string) => {
    if (!audioCtxRef.current || stateRef.current.status !== 'viewing') return;
    try {
      const binary = atob(base64data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const entry = decoderRef.current;
      if (!entry) return;
      entry.decoder.decode(new EncodedAudioChunk({
        type: 'key',
        timestamp: performance.now() * 1000,
        data: bytes,
      }));
    } catch { /* drop bad frame */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    set({ isMuted: !stateRef.current.isMuted });
  }, []);

  // Called when a stream_end event arrives for the channel we're viewing.
  const handleStreamEnded = useCallback(() => {
    if (stateRef.current.status !== 'viewing') return;
    cleanupAudio();
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    sendRef.current = null;
    setState(INITIAL);
    stateRef.current = INITIAL;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    streamState: state,
    startBroadcast,
    joinAsViewer,
    stopStream: stop,
    handleStreamAudio,
    handleStreamEnded,
    toggleStreamMute: toggleMute,
  };
}
