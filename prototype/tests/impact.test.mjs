// #104: impact strength, the crash voice and the retrigger gate. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impactStrength, crashVoice, crashGate, checkCrash, CRASH_MIN, CRASH_FULL } from '../impact.js';

const COMPACT = { weight: 1, thump: 70, noise: 1800, gain: 1 };
const BUS = { weight: 1.6, thump: 45, noise: 1200, gain: 1.1 };

test('impactStrength: zero at and below the threshold, one at full speed and above, linear between', () => {
  assert.equal(impactStrength(0), 0);
  assert.equal(impactStrength(CRASH_MIN), 0);
  assert.equal(impactStrength(-5), 0);
  assert.equal(impactStrength(CRASH_FULL), 1);
  assert.equal(impactStrength(60), 1);
  assert.ok(Math.abs(impactStrength(14) - 0.5) < 1e-9);
});

test('crashVoice: nothing for strength 0, louder, longer and brighter as strength rises', () => {
  assert.equal(crashVoice(0, COMPACT), null);
  const soft = crashVoice(0.1, COMPACT), hard = crashVoice(1, COMPACT);
  for (const k of ['noise', 'thump']) { assert.ok(hard[k].gain > soft[k].gain); assert.ok(hard[k].dur > soft[k].dur); }
  assert.ok(hard.noise.freq > soft.noise.freq);
  assert.ok(hard.thump.f0 > hard.thump.f1);
});

test('crashVoice: the bus preset is deeper and longer than the compact at the same strength', () => {
  const c = crashVoice(0.6, COMPACT), b = crashVoice(0.6, BUS);
  assert.ok(b.thump.f1 < c.thump.f1);
  assert.ok(b.thump.dur > c.thump.dur);
  assert.ok(b.noise.freq < c.noise.freq);
});

test('crashGate: one crash per 0.35 s unless a clearly harder hit follows', () => {
  const st = { t: -Infinity, s: 0 };
  assert.equal(crashGate(st, 10, 0.3), true);
  assert.equal(crashGate(st, 10.1, 0.3), false);
  assert.equal(crashGate(st, 10.1, 0.4), false);
  assert.equal(crashGate(st, 10.1, 0.6), true);
  assert.equal(crashGate(st, 10.2, 0.6), false);
  assert.equal(crashGate(st, 10.6, 0.3), true);
});

test('crashGate: strength 0 never plays and does not start the cooldown', () => {
  const st = { t: -Infinity, s: 0 };
  assert.equal(crashGate(st, 5, 0), false);
  assert.equal(crashGate(st, 5.01, 0.2), true);
});

test('checkCrash: accepts a good preset, names the bad field otherwise', () => {
  assert.doesNotThrow(() => checkCrash(COMPACT));
  assert.throws(() => checkCrash(undefined), /sound\.crash/);
  for (const k of Object.keys(COMPACT)) assert.throws(() => checkCrash({ ...COMPACT, [k]: 0 }), new RegExp(`sound\\.crash\\.${k}`));
  assert.throws(() => checkCrash({ ...COMPACT, thump: NaN }), /sound\.crash\.thump/);
});
