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
  const t = ac().currentTime;
  tone(659.25, t,        0.18, 0.2); // E5
  tone(783.99, t + 0.18, 0.25, 0.2); // G5
}


export function playJoin() {
  const t = ac().currentTime;
  tone(523.25, t,        0.14, 0.25); // C5
  tone(659.25, t + 0.14, 0.18, 0.25); // E5
}


export function playLeave() {
  const t = ac().currentTime;
  tone(659.25, t,        0.14, 0.25); // E5
  tone(523.25, t + 0.14, 0.18, 0.25); // C5
}


export function playMute() {
  tone(220, ac().currentTime, 0.08, 0.25);
}


export function playUnmute() {
  tone(440, ac().currentTime, 0.08, 0.25);
}


export function playDeafen() {
  sweep(600, 200, ac().currentTime, 0.15, 0.2);
}


export function playUndeafen() {
  sweep(200, 600, ac().currentTime, 0.15, 0.2);
}


export function playLive() {
  const t = ac().currentTime;
  tone(523.25, t,        0.10, 0.22); // C5
  tone(659.25, t + 0.10, 0.10, 0.22); // E5
  tone(783.99, t + 0.20, 0.14, 0.22); // G5
}


export function playUnlive() {
  const t = ac().currentTime;
  tone(783.99, t,        0.10, 0.22); // G5
  tone(659.25, t + 0.10, 0.10, 0.22); // E5
  tone(523.25, t + 0.20, 0.14, 0.22); // C5
}


export function playUserJoin() {
  tone(880, ac().currentTime, 0.2, 0.18);
}


export function playUserLeave() {
  tone(660, ac().currentTime, 0.2, 0.18);
}
