/**
 * Voice channel hook using LiveKit for real-time audio/video.
 * Handles microphone access, room connection, participant tracking,
 * mute/deafen, screen sharing, and audio level metering.
 */
import { useState, useRef, useCallback } from 'react';
import { getServerUrl } from '../config';
import { getChatToken } from '../auth';
import type { ApiChannel } from '../api';

const MIC_LEVEL_MULTIPLIER = 400;
const MIC_METER_INTERVAL_MS = 80;
const VOICE_TOKEN_RETRY_DELAY_MS = 800;

// ── LiveKit globals from the UMD bundle loaded in index.html ─────────────────
declare global {
  interface Window {
    LivekitClient: {
      Room: new () => LiveKitRoom;
      RoomEvent: Record<string, string>;
      LocalAudioTrack: new (track: MediaStreamTrack) => unknown;
      LocalVideoTrack: new (track: MediaStreamTrack) => unknown;
      createLocalScreenTracks: (opts?: { audio?: boolean }) => Promise<Array<{ mediaStreamTrack: MediaStreamTrack; stop(): void }>>;
    };
  }
}

interface LiveKitRoom {
  connect(url: string, token: string): Promise<void>;
  startAudio(): Promise<void>;
  disconnect(): void;
  localParticipant: { publishTrack(track: unknown): Promise<void> };
  remoteParticipants: Map<string, LiveKitParticipant>;
  activeSpeakers: LiveKitParticipant[];
  on(event: string, cb: (...args: unknown[]) => void): void;
}

interface LiveKitParticipant {
  identity: string;
  name?: string;
  audioTrackPublications: Map<string, { isMuted: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface Participant {
  identity: string;
  name: string;
  isMuted: boolean;
  isSpeaking: boolean;
}

export interface RemoteScreen {
  identity: string;
  stream: MediaStream;
}

export interface VoiceState {
  status: VoiceStatus;
  channel: ApiChannel | null;
  participants: Participant[];
  micLevel: number;       // 0-100
  micSilent: boolean;     // true when no audio detected for several seconds
  errorMsg: string;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  showScreenPicker: boolean;
  remoteScreens: RemoteScreen[];
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
  remoteScreens: [],
};

export function useVoice() {
  const [state, setState] = useState<VoiceState>(INITIAL);
  const stateRef = useRef<VoiceState>(INITIAL);
  const roomRef = useRef<LiveKitRoom | null>(null);
  const localTrackRef = useRef<unknown>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const micIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElemsRef = useRef<HTMLAudioElement[]>([]);
  const connGenRef = useRef(0);
  const screenTrackRef = useRef<{ mediaStreamTrack: MediaStreamTrack; stop(): void } | null>(null);
  const screenUnlistenRef = useRef<(() => void) | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Tracks remote screen shares for cleanup; state holds the MediaStream for React rendering
  const remoteScreenTracksRef = useRef<Array<{ identity: string; nativeTrack: MediaStreamTrack; stream: MediaStream }>>([]);

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

  function detachRemoteAudio() {
    audioElemsRef.current.forEach(el => el.remove());
    audioElemsRef.current = [];
  }

  function detachRemoteScreens() {
    remoteScreenTracksRef.current = [];
  }

  function buildParticipants(room: LiveKitRoom): Participant[] {
    const speakers = new Set((room.activeSpeakers ?? []).map(p => p.identity));
    return Array.from(room.remoteParticipants.values()).map(p => {
      const pubs = [...(p.audioTrackPublications?.values() ?? [])];
      const isMuted = pubs.length === 0 || pubs.every(pub => pub.isMuted);
      return {
        identity: p.identity,
        name: p.name || p.identity,
        isMuted,
        isSpeaking: speakers.has(p.identity),
      };
    });
  }

  function startMicMeter(stream: MediaStream) {
    stopMicMeter();
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let silentTicks = 0;
      const SILENCE_THRESHOLD_TICKS = Math.ceil(5000 / MIC_METER_INTERVAL_MS); // 5 s

      micIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const level = Math.min(100, Math.round(rms * MIC_LEVEL_MULTIPLIER));
        set({ micLevel: level });

        if (level === 0) {
          silentTicks++;
          if (silentTicks >= SILENCE_THRESHOLD_TICKS) {
            set({ micSilent: true });
          }
        } else {
          silentTicks = 0;
          set({ micSilent: false });
        }
      }, MIC_METER_INTERVAL_MS);
    } catch {
      // mic meter unavailable — non-fatal
    }
  }

  const join = useCallback(async (channel: ApiChannel) => {
    // Already connected to this exact channel — do nothing
    if (stateRef.current.status === 'connected' && stateRef.current.channel?.id === channel.id) return;
    // Already connecting — ignore extra clicks
    if (stateRef.current.status === 'connecting') return;
    if (roomRef.current) await leave();
    const gen = ++connGenRef.current;

    if (!window.LivekitClient) {
      set({ status: 'error', errorMsg: 'LiveKit SDK not loaded', channel });
      return;
    }

    set({ status: 'connecting', channel, errorMsg: '', participants: [] });

    const serverUrl = getServerUrl();
    const token = getChatToken(serverUrl);
    if (!token) {
      set({ status: 'error', errorMsg: 'Not authenticated to this server' });
      return;
    }

    // 1. Request mic
    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (connGenRef.current !== gen) return; // superseded
      const micTrack = micStream.getAudioTracks()[0];
      micTrackRef.current = micTrack;
      localTrackRef.current = new window.LivekitClient.LocalAudioTrack(micTrack);
    } catch {
      if (connGenRef.current !== gen) return;
      set({ status: 'error', errorMsg: 'Microphone permission denied' });
      return;
    }

    // 2. Fetch voice token (retry once on 409 — server may not have processed the disconnect yet)
    let voiceToken: string;
    let livekitUrl: string;
    try {
      const fetchToken = () => fetch(
        `${serverUrl}/voice/token?channel_id=${encodeURIComponent(String(channel.id))}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      let res = await fetchToken();
      if (res.status === 409) {
        await new Promise(r => setTimeout(r, VOICE_TOKEN_RETRY_DELAY_MS));
        res = await fetchToken();
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      if (connGenRef.current !== gen) return; // superseded
      const data = await res.json();
      voiceToken = data.token;
      livekitUrl = data.livekit_url;
    } catch (e) {
      if (connGenRef.current !== gen) return;
      set({ status: 'error', errorMsg: `Failed to get voice token: ${(e as Error).message}` });
      return;
    }

    // 3. Connect to LiveKit room using the bundled SDK
    const room = new window.LivekitClient.Room();
    roomRef.current = room;

    const RoomEvent = window.LivekitClient.RoomEvent;

    room.on(RoomEvent.TrackSubscribed, (track: unknown, _pub: unknown, participant: unknown) => {
      const t = track as { kind: string; attach(): HTMLMediaElement; mediaStreamTrack: MediaStreamTrack };
      const p = participant as { identity: string };
      if (t.kind === 'audio') {
        const el = t.attach() as HTMLAudioElement;
        el.dataset.livekitParticipant = p.identity;
        document.body.appendChild(el);
        audioElemsRef.current.push(el);
      }
      if (t.kind === 'video') {
        const stream = new MediaStream([t.mediaStreamTrack]);
        remoteScreenTracksRef.current.push({ identity: p.identity, nativeTrack: t.mediaStreamTrack, stream });
        set({ remoteScreens: remoteScreenTracksRef.current.map(s => ({ identity: s.identity, stream: s.stream })) });
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: unknown) => {
      const t = track as { kind: string; detach(): HTMLMediaElement[]; mediaStreamTrack: MediaStreamTrack };
      if (t.kind === 'audio') {
        t.detach().forEach((el: HTMLMediaElement) => {
          el.remove();
          audioElemsRef.current = audioElemsRef.current.filter(e => e !== el);
        });
      }
      if (t.kind === 'video') {
        remoteScreenTracksRef.current = remoteScreenTracksRef.current.filter(s => s.nativeTrack !== t.mediaStreamTrack);
        set({ remoteScreens: remoteScreenTracksRef.current.map(s => ({ identity: s.identity, stream: s.stream })) });
      }
    });

    const refreshParticipants = () =>
      set({ participants: buildParticipants(room) });

    room.on(RoomEvent.ParticipantConnected, refreshParticipants);
    room.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
    room.on(RoomEvent.ActiveSpeakersChanged, refreshParticipants);

    room.on(RoomEvent.Disconnected, () => {
      if (connGenRef.current !== gen) return; // stale — a newer join is in progress
      detachRemoteAudio();
      detachRemoteScreens();
      stopMicMeter();
      set({ status: 'idle', channel: null, participants: [], isScreenSharing: false, remoteScreens: [] });
    });

    try {
      await room.connect(livekitUrl, voiceToken);
      if (connGenRef.current !== gen) { room.disconnect(); return; }
      await room.startAudio();
      if (localTrackRef.current) {
        await room.localParticipant.publishTrack(localTrackRef.current);
      }
      set({ status: 'connected', channel, participants: buildParticipants(room) });
      startMicMeter(micStream);
    } catch (e) {
      if (connGenRef.current !== gen) return;
      set({ status: 'error', errorMsg: `Connection failed: ${(e as Error).message}` });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    const track = micTrackRef.current;
    if (!track) return;
    const nowMuted = track.enabled; // track.enabled=true means currently unmuted → we're muting
    track.enabled = !nowMuted;
    set({ isMuted: nowMuted });
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !stateRef.current.isDeafened;
    audioElemsRef.current.forEach(el => { el.muted = next; });
    set({ isDeafened: next });
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (screenUnlistenRef.current) {
      screenUnlistenRef.current();
      screenUnlistenRef.current = null;
    }
    screenCanvasRef.current = null;
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/core').then(({ invoke }) =>
        invoke('stop_screen_capture').catch(() => {})
      );
    }
    set({ isScreenSharing: false });
  }, []);

  const startScreenCapture = useCallback(async (sourceId: string) => {
    if (!sourceId) { set({ showScreenPicker: false }); return; }
    const room = roomRef.current;
    if (!room) return;
    set({ showScreenPicker: false });

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');

      await invoke('start_screen_capture', { sourceId });

      // Create an off-screen canvas that receives JPEG frames from Rust
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      screenCanvasRef.current = canvas;
      const ctx = canvas.getContext('2d')!;

      const unlisten = await listen<string>('screen-frame', event => {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = `data:image/jpeg;base64,${event.payload}`;
      });
      screenUnlistenRef.current = unlisten;

      // Wrap the canvas stream as a LiveKit track
      const stream = canvas.captureStream(15);
      const videoTrack = stream.getVideoTracks()[0];
      const livekitTrack = new window.LivekitClient.LocalVideoTrack(videoTrack);

      screenTrackRef.current = {
        mediaStreamTrack: videoTrack,
        stop: () => { videoTrack.stop(); stream.getTracks().forEach(t => t.stop()); },
      };

      await room.localParticipant.publishTrack(livekitTrack);
      set({ isScreenSharing: true });

      videoTrack.addEventListener('ended', () => stopScreenShare(), { once: true });
    } catch (e) {
      console.error('Screen capture failed:', e);
      stopScreenShare();
    }
  }, [stopScreenShare]);

  const toggleScreenShare = useCallback(() => {
    if (!roomRef.current || stateRef.current.status !== 'connected') return;

    if (stateRef.current.isScreenSharing) {
      stopScreenShare();
    } else if ('__TAURI_INTERNALS__' in window) {
      // Show Zeeble's custom picker
      set({ showScreenPicker: true });
    } else {
      // Browser fallback — use native getDisplayMedia via LiveKit
      window.LivekitClient.createLocalScreenTracks({ audio: false }).then(tracks => {
        if (!tracks.length) return;
        const screenTrack = tracks[0];
        screenTrackRef.current = screenTrack;
        roomRef.current!.localParticipant.publishTrack(screenTrack).then(() => {
          set({ isScreenSharing: true });
          screenTrack.mediaStreamTrack.addEventListener('ended', () => {
            screenTrackRef.current = null;
            set({ isScreenSharing: false });
          }, { once: true });
        });
      }).catch(() => {});
    }
  }, [stopScreenShare]);

  const leave = useCallback(async () => {
    stopMicMeter();
    detachRemoteAudio();
    detachRemoteScreens();
    stopScreenShare();
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (localTrackRef.current) {
      (localTrackRef.current as { stop(): void }).stop?.();
      localTrackRef.current = null;
    }
    micTrackRef.current = null;
    setState(INITIAL);
  }, [stopScreenShare]);

  return {
    voiceState: state,
    joinVoice: join,
    leaveVoice: leave,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    startScreenCapture,
  };
}
