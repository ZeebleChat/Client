/**
 * VC sound effects synthesized via Web Audio API.
 * No external files required — all sounds are generated programmatically.
 * AudioContext is created lazily on first call (browser autoplay policy).
 */

let _ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

/** Play a single oscillator tone with a quick fade in/out. */
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

/** Play a frequency sweep (for deafen/undeafen). */
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

/** Ascending two-tone chime on app load. */
export function playStartup() {
  const t = ac().currentTime;
  tone(659.25, t,        0.18, 0.2); // E5
  tone(783.99, t + 0.18, 0.25, 0.2); // G5
}

/** Ascending two-note chime when joining a voice channel. */
export function playJoin() {
  const t = ac().currentTime;
  tone(523.25, t,        0.14, 0.25); // C5
  tone(659.25, t + 0.14, 0.18, 0.25); // E5
}

/** Descending two-note chime when leaving a voice channel. */
export function playLeave() {
  const t = ac().currentTime;
  tone(659.25, t,        0.14, 0.25); // E5
  tone(523.25, t + 0.14, 0.18, 0.25); // C5
}

/** Short low blip when muting. */
export function playMute() {
  tone(220, ac().currentTime, 0.08, 0.25);
}

/** Short higher blip when unmuting. */
export function playUnmute() {
  tone(440, ac().currentTime, 0.08, 0.25);
}

/** Descending sweep when deafening. */
export function playDeafen() {
  sweep(600, 200, ac().currentTime, 0.15, 0.2);
}

/** Ascending sweep when undeafening. */
export function playUndeafen() {
  sweep(200, 600, ac().currentTime, 0.15, 0.2);
}

/** Three ascending tones when starting screen share (going live). */
export function playLive() {
  const t = ac().currentTime;
  tone(523.25, t,        0.10, 0.22); // C5
  tone(659.25, t + 0.10, 0.10, 0.22); // E5
  tone(783.99, t + 0.20, 0.14, 0.22); // G5
}

/** Three descending tones when stopping screen share. */
export function playUnlive() {
  const t = ac().currentTime;
  tone(783.99, t,        0.10, 0.22); // G5
  tone(659.25, t + 0.10, 0.10, 0.22); // E5
  tone(523.25, t + 0.20, 0.14, 0.22); // C5
}

/** Soft high ding when another user joins the voice channel. */
export function playUserJoin() {
  tone(880, ac().currentTime, 0.2, 0.18);
}

/** Soft lower ding when another user leaves the voice channel. */
export function playUserLeave() {
  tone(660, ac().currentTime, 0.2, 0.18);
}
