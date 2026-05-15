// ─── Pack Sound Registry ──────────────────────────────────────────────────────

const _packSounds: Map<string, HTMLAudioElement> = new Map();

export function setPackSounds(sounds: Record<string, string>): void {
  _packSounds.clear();
  for (const [key, url] of Object.entries(sounds)) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    _packSounds.set(key, audio);
  }
}

export function clearPackSounds(): void {
  _packSounds.clear();
}

function packOrFallback(key: string, fallback: () => void): void {
  const audio = _packSounds.get(key);
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => fallback());
  } else {
    fallback();
  }
}

// ─── Synthesizer ──────────────────────────────────────────────────────────────

let _ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}


function tone(
  freq: number,
  startTime: number,
  duration: number,
  volume = 0.25,
  type: OscillatorType = 'sine',
) {
  const ctx = ac();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.setValueAtTime(volume, startTime + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}


function sweep(
  freqFrom: number,
  freqTo: number,
  startTime: number,
  duration: number,
  volume = 0.2,
) {
  const ctx = ac();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqFrom, startTime);
  osc.frequency.linearRampToValueAtTime(freqTo, startTime + duration);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.setValueAtTime(volume, startTime + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// ── Public sound functions ────────────────────────────────────────────────────


export function playStartup() {
  packOrFallback('voice_connect', () => {
    const t = ac().currentTime;
    tone(659.25, t,        0.18, 0.2);
    tone(783.99, t + 0.18, 0.25, 0.2);
  });
}

export function playJoin() {
  packOrFallback('voice_connect', () => {
    const t = ac().currentTime;
    tone(523.25, t,        0.14, 0.25);
    tone(659.25, t + 0.14, 0.18, 0.25);
  });
}

export function playLeave() {
  packOrFallback('voice_disconnect', () => {
    const t = ac().currentTime;
    tone(659.25, t,        0.14, 0.25);
    tone(523.25, t + 0.14, 0.18, 0.25);
  });
}

export function playMute() {
  packOrFallback('mute', () => tone(220, ac().currentTime, 0.08, 0.25));
}

export function playUnmute() {
  packOrFallback('unmute', () => tone(440, ac().currentTime, 0.08, 0.25));
}

export function playDeafen() {
  packOrFallback('deafen', () => sweep(600, 200, ac().currentTime, 0.15, 0.2));
}

export function playUndeafen() {
  packOrFallback('deafen', () => sweep(200, 600, ac().currentTime, 0.15, 0.2));
}

export function playLive() {
  packOrFallback('voice_connect', () => {
    const t = ac().currentTime;
    tone(523.25, t,        0.10, 0.22);
    tone(659.25, t + 0.10, 0.10, 0.22);
    tone(783.99, t + 0.20, 0.14, 0.22);
  });
}

export function playUnlive() {
  packOrFallback('voice_disconnect', () => {
    const t = ac().currentTime;
    tone(783.99, t,        0.10, 0.22);
    tone(659.25, t + 0.10, 0.10, 0.22);
    tone(523.25, t + 0.20, 0.14, 0.22);
  });
}

export function playUserJoin() {
  packOrFallback('user_join', () => tone(880, ac().currentTime, 0.2, 0.18));
}

export function playUserLeave() {
  packOrFallback('user_leave', () => tone(660, ac().currentTime, 0.2, 0.18));
}

export function playMessageSend() {
  packOrFallback('message_send', () => tone(880, ac().currentTime, 0.06, 0.12));
}

export function playMessageReceive() {
  packOrFallback('message_receive', () => tone(660, ac().currentTime, 0.08, 0.15));
}

export function playNotification() {
  packOrFallback('notification', () => {
    const t = ac().currentTime;
    tone(880, t,        0.08, 0.2);
    tone(1100, t + 0.1, 0.1,  0.2);
  });
}
