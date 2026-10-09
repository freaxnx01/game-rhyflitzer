// #104: the crash sound, scaled by one impact strength that the damage model (#105) shares.
// Pure except playCrash, which only touches the AudioContext it is given. Unit-tested with `node --test prototype/tests/*.test.mjs`.
export const CRASH_MIN = 3, CRASH_FULL = 25, CRASH_COOLDOWN = 0.35, CRASH_OVERRIDE = 0.25;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// speed: closing speed in m/s along the contact normal (-vn on a wall, -vy on a landing)
export function impactStrength(speed) {
  return speed <= CRASH_MIN ? 0 : clamp01((speed - CRASH_MIN) / (CRASH_FULL - CRASH_MIN));
}

// s: impact strength 0..1, p: the vehicle's sound.crash preset → the two layers to schedule, or null for a hit too soft to hear
export function crashVoice(s, p) {
  if (!(s > 0)) return null;
  const level = p.gain * (0.12 + 0.88 * s);
  return {
    noise: { gain: 0.6 * level, freq: p.noise * (0.5 + 0.5 * s), dur: (0.10 + 0.30 * s) * p.weight },
    thump: { gain: 0.9 * level, f0: 1.6 * p.thump, f1: p.thump, dur: (0.12 + 0.28 * s) * p.weight },
  };
}

// collide runs every physics step, so a car pressed against a wall would retrigger each frame: one crash per
// CRASH_COOLDOWN, unless the new hit is clearly harder than the last one (a real second impact). Mutates state.
export function crashGate(state, now, s) {
  if (!(s > 0)) return false;
  if (now - state.t < CRASH_COOLDOWN && s < state.s + CRASH_OVERRIDE) return false;
  state.t = now; state.s = s;
  return true;
}

export function checkCrash(c) {
  if (!c || typeof c !== 'object') throw new Error('sound.crash is missing (expected { weight, thump, noise, gain })');
  for (const k of ['weight', 'thump', 'noise', 'gain']) {
    if (!Number.isFinite(c[k]) || c[k] <= 0) throw new Error(`sound.crash.${k} must be a positive number, got ${c[k]}`);
  }
}

const END_GAIN = 0.001;   // exponentialRampToValueAtTime cannot reach 0

function noiseBuffer(ctx, dur) {
  const len = Math.max(1, Math.ceil(ctx.sampleRate * dur)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function decayGain(ctx, dest, peak, t, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(END_GAIN, t + dur);
  g.connect(dest);
  return g;
}

// the only impure function here: schedules the voice on any BaseAudioContext (the game's AudioContext, or an
// OfflineAudioContext in the tests). Noise burst = the impact itself, sine thump = the body it happens to.
export function playCrash(ctx, dest, voice, when = 0) {
  const t = ctx.currentTime + when, { noise: n, thump: h } = voice;
  const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
  src.buffer = noiseBuffer(ctx, n.dur); lp.type = 'lowpass'; lp.frequency.value = n.freq;
  src.connect(lp); lp.connect(decayGain(ctx, dest, n.gain, t, n.dur)); src.start(t);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(h.f0, t); osc.frequency.exponentialRampToValueAtTime(h.f1, t + h.dur * 0.5);
  osc.connect(decayGain(ctx, dest, h.gain, t, h.dur)); osc.start(t); osc.stop(t + h.dur + 0.05);
}
