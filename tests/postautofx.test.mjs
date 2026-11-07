// #709: which Postautos are heard, and how loud. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX, engineGain, pickVoices } from '../postautofx.js';

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