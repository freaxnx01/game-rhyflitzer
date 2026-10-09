// #14: engine, rotor and horn sound. The pure part (gear, rpm, mix, preset check) is unit-tested with `node --test`;
// the graph builders take any BaseAudioContext (AudioContext in the game, OfflineAudioContext in tests) and touch no DOM.

export const RPM_RATE = { up: 12000, down: 20000 };   // rpm per second the heard rpm may move: revs up fast, drops faster on a shift
export const ROTOR = { rate: 5.5, ratePerKmh: 0.012, gain: 1.2, cutoff: 260 };   // #10 helicopter: blade thump (Hz), lowpassed noise

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// gear index (0 = 1st) from the speed bands; the last band is open-ended
export function gearAt(kmh, gears) { let gi = 0; while (gi < gears.length - 2 && kmh > gears[gi + 1]) gi++; return gi; }

// the rpm the engine heads for: tied to road speed in the current gear (the top gear runs up to engine.topKmh), free-revving in the air
export function targetRpm(input, gears, engine) {
  if (input.air) return input.gas ? engine.limitRpm * 0.92 : engine.idleRpm;
  const gi = gearAt(input.kmh, gears), hi = gi === gears.length - 2 ? engine.topKmh : gears[gi + 1];
  return clamp(engine.shiftRpm * input.kmh / hi, engine.idleRpm, engine.limitRpm);
}

// one audio tick: smoothed rpm, current gear, and the remaining throttle-lift time after an upshift
export function engineStep(s, input, sound, dt) {
  const gear = gearAt(input.kmh, sound.gears), up = gear > s.gear && !input.air;
  const target = targetRpm(input, sound.gears, sound.engine), rate = target > s.rpm ? RPM_RATE.up : RPM_RATE.down;
  return { rpm: s.rpm + clamp(target - s.rpm, -rate * dt, rate * dt), gear, shift: up ? sound.engine.shiftTime : Math.max(0, s.shift - dt) };
}

// what the synth plays for an engine state: firing frequency, load-dependent lowpass, level, road noise and nitro hiss
export function engineMix(s, input, engine) {
  const n = clamp((s.rpm - engine.idleRpm) / (engine.limitRpm - engine.idleRpm), 0, 1), load = input.gas ? 1 : 0, F = engine.filter, G = engine.gain;
  const cutoff = (F.idle + (F.open - F.idle) * n) * (load ? 1 : F.offLoad) * (input.nitro ? 1.25 : 1);
  const level = (G.idle + G.rev * n + G.load * load) * (s.shift > 0 ? 1 - engine.shiftDip : 1);
  return { f0: s.rpm / 60 * engine.cylinders / 2, cutoff, q: F.q * (load ? 1 : 0.6), gain: input.fly ? 0 : level,
    road: input.fly || input.air ? 0 : Math.min(0.25, input.kmh / 400), hiss: input.nitro && !input.fly ? engine.nitroHiss : 0 };
}

export function rotorMix(input) { return input.fly ? { rate: ROTOR.rate + ROTOR.ratePerKmh * input.kmh, gain: ROTOR.gain, cutoff: ROTOR.cutoff } : { rate: ROTOR.rate, gain: 0, cutoff: ROTOR.cutoff }; }

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
// throws an Error naming the first bad field of a vehicle's sound preset
export function checkSound(sound) {
  const bad = (what) => { throw new Error(`Vehicle sound preset: ${what}`); };
  if (!sound) bad('missing');
  const g = sound.gears;
  if (!Array.isArray(g) || g.length < 2 || g[0] !== 0 || g.some((v, i) => !num(v, 0, 1e4) || (i && v <= g[i - 1]))) bad('gears must start at 0 and rise strictly');
  const e = sound.engine;
  if (!e) bad('engine missing');
  if (!Number.isInteger(e.cylinders) || e.cylinders < 1 || e.cylinders > 16) bad('engine.cylinders must be 1-16');
  if (!num(e.idleRpm, 200, 3000) || !num(e.shiftRpm, e.idleRpm + 1, 2e4) || !num(e.limitRpm, e.shiftRpm, 2e4)) bad('engine rpm must be idleRpm < shiftRpm <= limitRpm');
  if (!num(e.topKmh, 1, 1000)) bad('engine.topKmh (shiftRpm speed in the top gear) must be 1-1000');
  if (!Array.isArray(e.harmonics) || !e.harmonics.length || e.harmonics.some(h => !num(h.mul, 0.1, 16) || !num(h.gain, 0, 2) || !num(h.detune, -100, 100))) bad('engine.harmonics needs { mul, gain, detune } entries');
  if (!e.filter || !num(e.filter.idle, 50, 2e4) || !num(e.filter.open, e.filter.idle, 2e4) || !num(e.filter.offLoad, 0.1, 1) || !num(e.filter.q, 0.1, 20)) bad('engine.filter needs idle <= open Hz, offLoad 0.1-1, q');
  if (!e.gain || !num(e.gain.idle, 0, 1) || !num(e.gain.rev, 0, 1) || !num(e.gain.load, 0, 1)) bad('engine.gain needs idle, rev, load in 0-1');
  if (!num(e.shiftTime, 0, 1) || !num(e.shiftDip, 0, 1) || !num(e.nitroHiss, 0, 1)) bad('engine.shiftTime, shiftDip, nitroHiss must be 0-1');
  const h = sound.horn;
  if (!h || !Array.isArray(h.notes) || h.notes.length < 1 || h.notes.length > 4 || h.notes.some(f => !num(f, 100, 2000))) bad('horn.notes needs 1-4 frequencies in 100-2000 Hz');
  if (!num(h.dur, 0.2, 3) || !num(h.gain, 0.01, 0.6) || !num(h.band, 200, 8000) || !['square', 'sawtooth', 'triangle'].includes(h.wave)) bad('horn needs dur 0.2-3 s, gain 0.01-0.6, band 200-8000 Hz, wave square|sawtooth|triangle');
}
