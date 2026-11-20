import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gearAt, targetRpm, engineStep, engineMix, engineLoad, rotorMix, checkSound, RPM_RATE, ROTOR, DRIFT, WIND, stepVoice, WHISTLE } from '../sound.js';

// a copy of VEHICLES.compact.sound in index.html (#14); test_sound.py checks the game's own table passes checkSound
const SOUND = () => ({
  gears: [0, 20, 45, 75, 110, 150, 999],
  engine: { cylinders: 4, idleRpm: 850, shiftRpm: 6200, limitRpm: 6800, topKmh: 330,
    harmonics: [{ mul: 0.5, gain: 0.35, detune: -8 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.5, detune: 6 }, { mul: 3, gain: 0.22, detune: -5 }, { mul: 4, gain: 0.1, detune: 9 }],
    filter: { idle: 450, open: 2600, offLoad: 0.55, q: 1.6 }, gain: { idle: 0.06, rev: 0.06, load: 0.1 },
    shiftTime: 0.15, shiftDip: 0.6, nitroHiss: 0.07 },
  horn: { notes: [415, 523], dur: 0.9, gain: 0.22, band: 1400, wave: 'square' },
});
const IN = (o) => ({ kmh: 0, gas: 0, nitro: 0, air: 0, fly: false, ...o });

test('gearAt: speed bands like the HUD, the last band open-ended', () => {
  const g = SOUND().gears;
  assert.deepEqual([0, 19.9, 20, 20.1, 72, 149, 151, 400].map(k => gearAt(k, g)), [0, 0, 0, 1, 2, 4, 5, 5]);
});

test('targetRpm: tied to road speed in gear, drops after a shift, idle floor, top gear runs to topKmh', () => {
  const { gears, engine } = SOUND();
  assert.equal(targetRpm(IN({ kmh: 0 }), gears, engine), 850);
  assert.equal(targetRpm(IN({ kmh: 20 }), gears, engine), 6200);
  assert.ok(Math.abs(targetRpm(IN({ kmh: 20.1 }), gears, engine) - 6200 * 20.1 / 45) < 1e-9);
  assert.ok(Math.abs(targetRpm(IN({ kmh: 216 }), gears, engine) - 6200 * 216 / 330) < 1e-9);
  assert.equal(targetRpm(IN({ kmh: 500 }), gears, engine), 6800);
});

test('targetRpm: in the air the engine free-revs with gas and falls to idle without', () => {
  const { gears, engine } = SOUND();
  assert.equal(targetRpm(IN({ kmh: 100, air: 1, gas: 1 }), gears, engine), 6800 * 0.92);
  assert.equal(targetRpm(IN({ kmh: 100, air: 1, gas: 0 }), gears, engine), 850);
});

test('engineStep: rpm slews at RPM_RATE, an upshift starts the throttle lift, it runs out', () => {
  const S = SOUND();
  let s = { rpm: 850, gear: 0, shift: 0 };
  s = engineStep(s, IN({ kmh: 19, gas: 1 }), S, 0.1);
  assert.equal(s.rpm, 850 + RPM_RATE.up * 0.1);
  s = { rpm: 6200, gear: 0, shift: 0 };
  s = engineStep(s, IN({ kmh: 21, gas: 1 }), S, 0.05);
  assert.equal(s.gear, 1); assert.equal(s.shift, 0.15);
  assert.equal(s.rpm, 6200 - RPM_RATE.down * 0.05);
  s = engineStep(s, IN({ kmh: 21, gas: 1 }), S, 0.1);
  assert.ok(Math.abs(s.shift - 0.05) < 1e-12);
  s = engineStep(s, IN({ kmh: 21, gas: 1 }), S, 0.1);
  assert.equal(s.shift, 0);
});

test('engineStep: a downshift or an airborne gear change does not dip', () => {
  const S = SOUND();
  assert.equal(engineStep({ rpm: 3000, gear: 2, shift: 0 }, IN({ kmh: 40 }), S, 0.02).shift, 0);
  assert.equal(engineStep({ rpm: 3000, gear: 0, shift: 0 }, IN({ kmh: 40, air: 1 }), S, 0.02).shift, 0);
});

// #1130: the load is a continuous 0..1 made of throttle, forward acceleration and climb rate
test('engineLoad_NoGas_Zero', () => {
  const { engine } = SOUND();
  assert.equal(engineLoad(IN({ kmh: 120, accel: 2, climb: 3 }), engine), 0);
});

test('engineLoad_SteadyFlat_Cruise', () => {
  const { engine } = SOUND();
  assert.equal(engineLoad(IN({ kmh: 200, gas: 1, accel: 0, climb: 0 }), engine), 0.5);
});

test('engineLoad_Uphill_Full', () => {
  const { engine } = SOUND();
  assert.equal(engineLoad(IN({ kmh: 80, gas: 1, accel: 0, climb: 3 }), engine), 1);
});

test('engineLoad_Accelerating_AboveCruise', () => {
  const { engine } = SOUND();
  const pulling = engineLoad(IN({ kmh: 60, gas: 1, accel: 1.2, climb: 0 }), engine);
  assert.ok(pulling > 0.5 && pulling < 1, pulling);
  assert.equal(engineLoad(IN({ kmh: 60, gas: 1, accel: -3, climb: -2 }), engine), 0.5);   // braking downhill is no less than cruising
});

test('engineLoad_InTheAir_FullWithGas', () => {
  const { engine } = SOUND();
  assert.equal(engineLoad(IN({ kmh: 60, gas: 1, air: 1 }), engine), 1);
  assert.equal(engineLoad(IN({ kmh: 60, air: 1 }), engine), 0);
});

test('engineStep_Load_SmoothsTowardsTarget', () => {
  const S = SOUND(), driving = IN({ kmh: 100, gas: 1, accel: 0, climb: 0 });
  let s = { rpm: 850, gear: 0, shift: 0, load: 0, drift: 0 };
  s = engineStep(s, driving, S, 1 / 60);
  assert.ok(s.load > 0 && s.load < 0.1, s.load);
  for (let i = 0; i < 120; i++) s = engineStep(s, driving, S, 1 / 60);
  assert.ok(Math.abs(s.load - 0.5) < 0.01, s.load);
  for (let i = 0; i < 120; i++) s = engineStep(s, IN({ kmh: 100 }), S, 1 / 60);
  assert.ok(s.load < 0.01, s.load);
});

// #1130: a slow random walk on the rpm, so a steady cruise is never one frozen tone. Seeded, so it is testable
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const runDrift = (input, rng) => {
  const S = SOUND(), seen = [];
  let s = { rpm: 6200, gear: 5, shift: 0, load: 0.5, drift: 0 };
  for (let i = 0; i < 600; i++) { s = engineStep(s, input, S, 1 / 60, rng); seen.push(s.drift); }
  return seen;
};
const std = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

test('engineStep_Drift_WandersWithinBoundWhileDriving', () => {
  const seen = runDrift(IN({ kmh: 220, gas: 1 }), lcg(12345));
  assert.ok(seen.every((d) => Math.abs(d) <= DRIFT.max + 1e-12), Math.max(...seen.map(Math.abs)));
  assert.ok(std(seen) > 0.002, std(seen));
});

test('engineStep_Drift_ZeroAtStandstillAndInTheAir', () => {
  assert.ok(runDrift(IN({ kmh: 0, gas: 1 }), lcg(7)).every((d) => d === 0));
  assert.ok(runDrift(IN({ kmh: 220, gas: 1, air: 1 }), lcg(7)).every((d) => d === 0));
});

test('engineMix_Drift_MovesTheFiringFrequencyAndTheLevel', () => {
  const { engine } = SOUND(), s = { rpm: 6200, gear: 5, shift: 0, load: 0.5 };
  const still = engineMix({ ...s, drift: 0 }, IN({ kmh: 220, gas: 1 }), engine);
  const up = engineMix({ ...s, drift: DRIFT.max }, IN({ kmh: 220, gas: 1 }), engine);
  assert.ok(Math.abs(up.f0 / still.f0 - (1 + DRIFT.max)) < 1e-12, up.f0 / still.f0);
  assert.ok(up.gain > still.gain && up.gain / still.gain < 1.1, up.gain / still.gain);
  assert.ok(up.road > still.road, [up.road, still.road]);
});

// #1130: the wind rushing past, and the combustion rasp
test('engineMix_Wind_SilentBelow40_RisesWithSpeed', () => {
  const { engine } = SOUND(), s = { rpm: 6200, gear: 5, shift: 0, load: 0.5, drift: 0 };
  const at = (kmh, o) => engineMix(s, IN({ kmh, gas: 1, ...o }), engine).wind;
  assert.deepEqual([at(0), at(20), at(WIND.from)], [0, 0, 0]);
  assert.ok(at(50) > 0, at(50));
  assert.ok(at(200) > 4 * at(50), [at(200), at(50)]);
  assert.ok(at(100) > 0.1 * WIND.gain, at(100));   // and it is already audible at the speeds people drive at
  assert.ok(Math.abs(at(WIND.full) - WIND.gain) < 1e-12, at(WIND.full));
  assert.equal(at(500), at(WIND.full));   // it does not keep growing once it is at full
  assert.ok(at(220, { air: 1 }) > 0, 'airborne: the wind still rushes past');
});

test('engineMix_Rough_GrowsWithLoad', () => {
  const { engine } = SOUND(), s = { rpm: 5000, gear: 3, shift: 0, drift: 0 };
  const cruise = engineMix({ ...s, load: 0.5 }, IN({ kmh: 150, gas: 1 }), engine).rough;
  const pulling = engineMix({ ...s, load: 1 }, IN({ kmh: 150, gas: 1 }), engine).rough;
  const idle = engineMix({ rpm: 850, gear: 0, shift: 0, load: 0, drift: 0 }, IN({ kmh: 0 }), engine).rough;
  assert.ok(pulling > cruise && cruise > idle && idle > 0, [pulling, cruise, idle]);
  assert.ok(pulling <= 1, pulling);
  assert.ok(engineMix({ ...s, rpm: 6800, load: 1 }, IN({ kmh: 150, gas: 1 }), engine).rough > pulling);   // and with rpm
});

test('engineMix_Off_SilencesWindAndRough', () => {
  const { engine } = SOUND(), s = { rpm: 5000, gear: 3, shift: 0, load: 1, drift: 0 };
  for (const flag of ['off', 'dead', 'fly']) {
    const m = engineMix(s, IN({ kmh: 200, gas: 1, [flag]: true }), engine);
    assert.deepEqual([m.wind, m.rough], [0, 0], flag);
  }
});

test('checkSound_OptionalFieldsOutOfRange_Throw', () => {
  const tuned = SOUND(); Object.assign(tuned.engine, { cruise: 0.4, drift: 0.01, wind: 0.2, rough: 0.5 });
  checkSound(tuned);   // present and in range
  for (const [field, value] of [['cruise', 1.5], ['drift', 0.2], ['wind', 0.8], ['rough', 2]]) {
    const s = SOUND(); s.engine[field] = value;
    assert.throws(() => checkSound(s), (e) => e instanceof Error && e.message.includes(field), field);
  }
});

test('engineMix: firing frequency of a four-stroke, filter opens with rpm and load, nitro opens it further', () => {
  const { engine } = SOUND();
  const idle = engineMix({ rpm: 850, gear: 0, shift: 0 }, IN({}), engine);
  assert.ok(Math.abs(idle.f0 - 850 / 60 * 2) < 1e-9);
  assert.ok(Math.abs(idle.cutoff - 450 * 0.55) < 1e-9);
  const high = engineMix({ rpm: 6800, gear: 3, shift: 0, load: 1 }, IN({ kmh: 100, gas: 1 }), engine);
  assert.equal(high.cutoff, 2600); assert.equal(high.q, 1.6);
  assert.ok(Math.abs(high.gain - 0.22) < 1e-12);
  const nitro = engineMix({ rpm: 6800, gear: 3, shift: 0, load: 1 }, IN({ kmh: 100, gas: 1, nitro: 1 }), engine);
  assert.equal(nitro.cutoff, 2600 * 1.25); assert.equal(nitro.hiss, 0.07);
  assert.equal(high.hiss, 0);
});

test('engineMix: louder under load, dips during a shift, road noise grows with speed and stops in the air', () => {
  const { engine } = SOUND(), s = { rpm: 4000, gear: 2, shift: 0 }, pull = { ...s, load: 1 };
  assert.ok(engineMix(pull, IN({ kmh: 60, gas: 1 }), engine).gain > engineMix(s, IN({ kmh: 60 }), engine).gain);
  assert.ok(Math.abs(engineMix({ ...pull, shift: 0.1 }, IN({ kmh: 60, gas: 1 }), engine).gain - engineMix(pull, IN({ kmh: 60, gas: 1 }), engine).gain * 0.4) < 1e-12);
  assert.equal(engineMix(s, IN({ kmh: 60 }), engine).road, 0.15);
  assert.equal(engineMix(s, IN({ kmh: 200 }), engine).road, 0.25);
  assert.equal(engineMix(s, IN({ kmh: 60, air: 1 }), engine).road, 0);
});

test('engineMix_EngineOff_SilencesEngineRoadAndHiss', () => {
  const { engine } = SOUND(), m = engineMix({ rpm: 850, gear: 0, shift: 0 }, IN({ nitro: 1, off: true }), engine);
  assert.deepEqual([m.gain, m.road, m.hiss], [0, 0, 0]);
});

test('engineMix + rotorMix: flying mutes the engine, road and hiss and brings in the rotor', () => {
  const { engine } = SOUND(), m = engineMix({ rpm: 4000, gear: 2, shift: 0, load: 1 }, IN({ kmh: 100, gas: 1, nitro: 1, fly: true }), engine);
  assert.deepEqual([m.gain, m.road, m.hiss], [0, 0, 0]);
  assert.equal(rotorMix(IN({ kmh: 0 })).gain, 0);
  const r = rotorMix(IN({ kmh: 100, fly: true }));
  assert.equal(r.gain, ROTOR.gain); assert.ok(Math.abs(r.rate - (ROTOR.rate + ROTOR.ratePerKmh * 100)) < 1e-12);
});

test('rotorMix: climbing (load above hover) beats faster and louder, sinking slower and softer; no load is the old mix -- #731', () => {
  const hover = rotorMix(IN({ kmh: 0, fly: true })), up = rotorMix(IN({ kmh: 0, fly: true, load: 0.85 })), down = rotorMix(IN({ kmh: 0, fly: true, load: 0.3 }));
  assert.equal(rotorMix(IN({ kmh: 0, fly: true, load: ROTOR.hoverLoad })).gain, hover.gain);
  assert.ok(up.rate > hover.rate && up.gain > hover.gain);
  assert.ok(down.rate < hover.rate && down.gain < hover.gain);
  assert.equal(rotorMix(IN({ kmh: 0, load: 0.9 })).gain, 0);   // not flying: silent whatever the load
});

test('checkSound: the compact preset passes', () => { checkSound(SOUND()); });

test('checkSound: each broken field throws an Error that names it', () => {
  const cases = [
    [s => { s.gears = [0, 20, 20, 999]; }, 'gears'],
    [s => { s.gears = [5, 20, 999]; }, 'gears'],
    [s => { delete s.engine; }, 'engine'],
    [s => { s.engine.cylinders = 0; }, 'cylinders'],
    [s => { s.engine.shiftRpm = 800; }, 'rpm'],
    [s => { s.engine.limitRpm = 6000; }, 'rpm'],
    [s => { s.engine.topKmh = 0; }, 'topKmh'],
    [s => { s.engine.harmonics = []; }, 'harmonics'],
    [s => { s.engine.harmonics[1].mul = NaN; }, 'harmonics'],
    [s => { s.engine.filter.open = 100; }, 'filter'],
    [s => { s.engine.gain.load = 2; }, 'gain'],
    [s => { s.engine.shiftDip = 1.5; }, 'shiftDip'],
    [s => { s.horn.notes = []; }, 'horn.notes'],
    [s => { s.horn.notes = [415, 20000]; }, 'horn.notes'],
    [s => { s.horn.dur = 0.1; }, 'horn'],
    [s => { s.horn.wave = 'sine'; }, 'horn'],
  ];
  for (const [patch, word] of cases) {
    const s = SOUND(); patch(s);
    assert.throws(() => checkSound(s), e => e instanceof Error && e.message.includes(word), word);
  }
  assert.throws(() => checkSound(undefined), /sound preset/);
});

test('engineMix: a dead engine (a wreck, #105) is silent and has no nitro hiss, the tyres still roll', () => {
  const { engine } = SOUND(), s = { rpm: 4000, gear: 2, shift: 0 };
  const dead = engineMix({ ...s, load: 1 }, IN({ kmh: 60, gas: 1, nitro: 1, dead: true }), engine);
  assert.equal(dead.gain, 0);
  assert.equal(dead.hiss, 0);
  assert.equal(dead.road, 0.15);
  assert.ok(engineMix({ ...s, load: 1 }, IN({ kmh: 60, gas: 1 }), engine).gain > 0);
});

test('stepVoice: a soft low thud, the pitch varies with the dice but stays in range', () => {
  const lo = stepVoice(0, 0), hi = stepVoice(0.999, 0.999);
  assert.ok(lo.freq < hi.freq); assert.ok(lo.freq >= 70 && hi.freq <= 110);
  assert.ok(lo.cutoff >= 500 && hi.cutoff <= 900);
  assert.ok(lo.gain > 0 && hi.gain <= 0.2);
});

// #462: the steam loco's whistle, two bright tones through playHorn
test('WHISTLE_TwoTones_AboveTheCarHorn', () => {
  assert.equal(WHISTLE.notes.length, 2);
  for (const f of WHISTLE.notes) assert.ok(f > 500 && f < 1500, f);
  assert.ok(WHISTLE.dur >= 1 && WHISTLE.gain > 0 && WHISTLE.gain <= 0.25);
});
