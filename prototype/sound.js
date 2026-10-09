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

// ---------- graph builders (WebAudio, no DOM) ----------
export function noiseBuffer(ac, secs) { const b = ac.createBuffer(1, Math.round(ac.sampleRate * secs), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }

export function buildEngine(ac, dest, engine) {
  const out = ac.createGain(); out.gain.value = 0; const filter = ac.createBiquadFilter(); filter.type = 'lowpass'; filter.connect(out); out.connect(dest);
  const oscs = engine.harmonics.map(h => { const o = ac.createOscillator(), g = ac.createGain(); o.type = h.mul === 1 ? 'sawtooth' : 'triangle'; o.detune.value = h.detune; g.gain.value = h.gain; o.connect(g); g.connect(filter); o.start(); return { o, mul: h.mul }; });
  const noise = noiseBuffer(ac, 2), sources = oscs.map(h => h.o), voice = (type, freq, q) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; sources.push(s); const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ac.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(dest); s.start(); return g; };
  return { oscs, filter, out, sources, road: voice('bandpass', 300, 0.6), hiss: voice('bandpass', 2600, 0.9) };
}

// a vehicle swap with another preset: silence and drop the old voices
export function stopEngine(n) { for (const s of n.sources) s.stop(); n.out.disconnect(); n.road.disconnect(); n.hiss.disconnect(); }

export function applyEngine(n, mix, t) {
  for (const { o, mul } of n.oscs) o.frequency.setTargetAtTime(mix.f0 * mul, t, 0.03);
  n.filter.frequency.setTargetAtTime(mix.cutoff, t, 0.06); n.filter.Q.setTargetAtTime(mix.q, t, 0.06);
  n.out.gain.setTargetAtTime(mix.gain, t, 0.05); n.road.gain.setTargetAtTime(mix.road, t, 0.1); n.hiss.gain.setTargetAtTime(mix.hiss, t, 0.08);
}

// #10 rotor: lowpassed noise, its level pulsed by a sine at the blade rate
export function buildRotor(ac, dest) {
  const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac, 2); s.loop = true; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = ROTOR.cutoff;
  const pulse = ac.createGain(); pulse.gain.value = 0.5; const lfo = ac.createOscillator(), depth = ac.createGain(); lfo.frequency.value = ROTOR.rate; depth.gain.value = 0.5; lfo.connect(depth); depth.connect(pulse.gain);
  const out = ac.createGain(); out.gain.value = 0; s.connect(f); f.connect(pulse); pulse.connect(out); out.connect(dest); s.start(); lfo.start();
  return { lfo, f, out };
}

export function applyRotor(n, mix, t) { n.lfo.frequency.setTargetAtTime(mix.rate, t, 0.2); n.f.frequency.setTargetAtTime(mix.cutoff, t, 0.2); n.out.gain.setTargetAtTime(mix.gain, t, 0.3); }

// the horn: each note a detuned pair through one bandpass, held at full level for dur (no decay), short attack and release
export function playHorn(ac, dest, horn, when) {
  const band = ac.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = horn.band; band.Q.value = 0.7;
  const env = ac.createGain(), end = when + horn.dur; env.gain.setValueAtTime(0, when); env.gain.linearRampToValueAtTime(horn.gain, when + 0.015); env.gain.setValueAtTime(horn.gain, end - 0.06); env.gain.linearRampToValueAtTime(0, end);
  band.connect(env); env.connect(dest);
  for (const f of horn.notes) for (const cents of [-6, 6]) { const o = ac.createOscillator(); o.type = horn.wave; o.frequency.value = f; o.detune.value = cents; o.connect(band); o.start(when); o.stop(end + 0.02); }
  return end;
}
