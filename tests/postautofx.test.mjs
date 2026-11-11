// #709: which Postautos are heard, and how loud. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX, engineGain, pickVoices, ledCurrent, groundStale, GROUND_EPS } from '../postautofx.js';

test('ledCurrent: only an unchanged line, destination and thank-you skip the repaint', () => {
  const trip = { line: 133, to: 'Stein AG' };
  assert.equal(ledCurrent(undefined, trip, null), false);
  assert.equal(ledCurrent({ line: '133', dest: 'Stein AG', thanks: null }, trip, null), true);
  assert.equal(ledCurrent({ line: '133', dest: 'Stein AG', thanks: null }, trip, 'Danke'), false);
  assert.equal(ledCurrent({ line: '133', dest: 'Laufenburg', thanks: null }, trip, null), false);
  assert.equal(ledCurrent({ line: '134', dest: 'Stein AG', thanks: null }, trip, null), false);
});

test('groundStale: first sample and real movement resample, a crawl does not', () => {
  assert.equal(groundStale(undefined, 10), true);
  assert.equal(groundStale(10, 10), false);
  assert.equal(groundStale(10, 10 + GROUND_EPS / 2), false);
  assert.equal(groundStale(10, 10 + GROUND_EPS), true);
  assert.equal(groundStale(10, 5), true);
  assert.equal(groundStale(10, NaN), true);
});

const bus = (key, x, extra = {}) => ({ key, phase: 'drive', v: 10, x, z: 0, ...extra });

test('engineGain: full level near, silent far, falling in between', () => {
  assert.equal(engineGain(0), 1);
  assert.equal(engineGain(FX.ref), 1);
  assert.equal(engineGain(FX.max), 0);
  assert.equal(engineGain(500), 0);
  const a = engineGain(20), b = engineGain(40), c = engineGain(70);
  assert.ok(1 > a && a > b && b > c && c > 0, `${a} ${b} ${c}`);
});
test('engineGain: a bad distance is silent', () => {
  assert.equal(engineGain(NaN), 0);
  assert.equal(engineGain(undefined), 0);
  assert.equal(engineGain(-1), 0);
});
test('pickVoices: the nearest buses win, at most FX.voices', () => {
  const buses = [bus('d', 60), bus('a', 5), bus('c', 30), bus('b', 12), bus('e', 70)];
  const v = pickVoices(buses, { x: 0, z: 0 });
  assert.deepEqual(v.map((q) => q.key), ['a', 'b', 'c']);
  assert.equal(v.length, FX.voices);
  assert.ok(v[0].gain >= v[1].gain && v[1].gain >= v[2].gain);
});
test('pickVoices: out of range, done and too quiet buses are left out', () => {
  assert.deepEqual(pickVoices([bus('far', 200), bus('gone', 3, { phase: 'done' })], { x: 0, z: 0 }), []);
});
test('pickVoices: km/h from m/s, a standing bus idles at 0', () => {
  const [moving] = pickVoices([bus('m', 0, { v: 10 })], { x: 0, z: 0 });
  assert.equal(moving.kmh, 36);
  const [idle] = pickVoices([bus('s', 0, { phase: 'stand', v: 0 })], { x: 0, z: 0 });
  assert.equal(idle.kmh, 0);
});
test('pickVoices: the listener position matters, not the origin', () => {
  const v = pickVoices([bus('a', 100)], { x: 95, z: 0 });
  assert.equal(v.length, 1);
  assert.equal(v[0].gain, 1);
});