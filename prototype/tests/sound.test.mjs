import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gearAt, targetRpm, engineStep, engineMix, rotorMix, checkSound, RPM_RATE, ROTOR } from '../sound.js';

// a copy of VEHICLES.compact.sound in prototype/index.html (#14); test_sound.py checks the game's own table passes checkSound
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

test('engineMix: firing frequency of a four-stroke, filter opens with rpm and load, nitro opens it further', () => {
  const { engine } = SOUND();
  const idle = engineMix({ rpm: 850, gear: 0, shift: 0 }, IN({}), engine);
  assert.ok(Math.abs(idle.f0 - 850 / 60 * 2) < 1e-9);
  assert.ok(Math.abs(idle.cutoff - 450 * 0.55) < 1e-9);
  const high = engineMix({ rpm: 6800, gear: 3, shift: 0 }, IN({ kmh: 100, gas: 1 }), engine);
  assert.equal(high.cutoff, 2600); assert.equal(high.q, 1.6);
  assert.ok(Math.abs(high.gain - 0.22) < 1e-12);
  const nitro = engineMix({ rpm: 6800, gear: 3, shift: 0 }, IN({ kmh: 100, gas: 1, nitro: 1 }), engine);
  assert.equal(nitro.cutoff, 2600 * 1.25); assert.equal(nitro.hiss, 0.07);
  assert.equal(high.hiss, 0);
});

test('engineMix: louder under load, dips during a shift, road noise grows with speed and stops in the air', () => {
  const { engine } = SOUND(), s = { rpm: 4000, gear: 2, shift: 0 };
  assert.ok(engineMix(s, IN({ kmh: 60, gas: 1 }), engine).gain > engineMix(s, IN({ kmh: 60 }), engine).gain);
  assert.ok(Math.abs(engineMix({ ...s, shift: 0.1 }, IN({ kmh: 60, gas: 1 }), engine).gain - engineMix(s, IN({ kmh: 60, gas: 1 }), engine).gain * 0.4) < 1e-12);
  assert.equal(engineMix(s, IN({ kmh: 60 }), engine).road, 0.15);
  assert.equal(engineMix(s, IN({ kmh: 200 }), engine).road, 0.25);
  assert.equal(engineMix(s, IN({ kmh: 60, air: 1 }), engine).road, 0);
});

test('engineMix + rotorMix: flying mutes the engine, road and hiss and brings in the rotor', () => {
  const { engine } = SOUND(), m = engineMix({ rpm: 4000, gear: 2, shift: 0 }, IN({ kmh: 100, gas: 1, nitro: 1, fly: true }), engine);
  assert.deepEqual([m.gain, m.road, m.hiss], [0, 0, 0]);
  assert.equal(rotorMix(IN({ kmh: 0 })).gain, 0);
  const r = rotorMix(IN({ kmh: 100, fly: true }));
  assert.equal(r.gain, ROTOR.gain); assert.ok(Math.abs(r.rate - (ROTOR.rate + ROTOR.ratePerKmh * 100)) < 1e-12);
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
