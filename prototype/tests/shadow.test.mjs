import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHADOW, shadowSize, shadowAlpha, groundTilt, sunShift, shadowOpacity, shadowShown } from '../shadow.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const COMPACT = { l: 4.66, w: 2.18, h: 1.55 };   // test_vehicles.py::test_compact_car_is_true_to_size
const SUN = { x: -300, y: 400, z: -200 };          // index.html sun.position

test('SHADOW: the agreed constants', () => {
  assert.deepEqual(SHADOW, { margin: 0.5, core: 0.92, lift: 0.04, hideAbove: 6, minFade: 0.2, bodyMid: 0.4, roll: 1.0, step: 0.5, maxTilt: 0.5 });
});

test('shadowSize: core from the measured box, quad adds the soft margin on every side', () => {
  const s = shadowSize(COMPACT);
  close(s.cl, 4.66 * 0.92, 1e-9); close(s.cw, 2.18 * 0.92, 1e-9);
  close(s.l, s.cl + 1.0, 1e-9); close(s.w, s.cw + 1.0, 1e-9);
  assert.ok(s.cl < COMPACT.l && s.l < 5.4, 'shorter core than the car, quad shorter than the old 5.2 m disc plus its edge');
});

test('shadowAlpha: 1 in the core, 0 at the edge, monotone and symmetric in between', () => {
  const fu = 0.5 / (5.29 / 2), fv = 0.5 / (3.0 / 2);
  assert.equal(shadowAlpha(0, 0, fu, fv), 1);
  assert.equal(shadowAlpha(1 - fu, 0, fu, fv), 1);
  assert.equal(shadowAlpha(0, 1 - fv, fu, fv), 1);
  assert.equal(shadowAlpha(1, 0, fu, fv), 0);
  assert.equal(shadowAlpha(0, 1, fu, fv), 0);
  assert.equal(shadowAlpha(1, 1, fu, fv), 0);
  let prev = 1;
  for (let u = 1 - fu; u <= 1 + 1e-9; u += fu / 10) { const a = shadowAlpha(u, 0, fu, fv); assert.ok(a <= prev + 1e-12, `monotone at u=${u}`); prev = a; }
  close(shadowAlpha(0.95, 0.2, fu, fv), shadowAlpha(-0.95, -0.2, fu, fv), 1e-12, 'symmetric');
  const mid = shadowAlpha(1 - fu / 2, 0, fu, fv); assert.ok(mid > 0.3 && mid < 0.7, `soft in the middle of the edge: ${mid}`);
});

test('groundTilt: flat is zero; nose up and right side up are positive', () => {
  assert.deepEqual(groundTilt(5, 5, 5, 5, 5, 2, 1), { pitch: 0, roll: 0 });
  const t = groundTilt(5.2, 5.4, 5.0, 5.0, 5.2, 2, 1);
  close(t.pitch, Math.atan(0.4 / 4), 1e-12, 'pitch'); close(t.roll, Math.atan(0.2 / 2), 1e-12, 'roll');
  assert.ok(groundTilt(5.2, 5.0, 5.4, 5, 5, 2, 1).pitch < 0 && groundTilt(5.1, 5, 5, 5.2, 5.0, 2, 1).roll < 0);
});

test('groundTilt: a sample that steps more than SHADOW.step from the centre is a kerb or an edge, not a slope: that axis stays flat', () => {
  // the jump ramp's side edge: the car 0.5 m inside it, the right sample 1 m out on the terrain 1.7 m below (atan(1.7 / 2) = 40 deg raw)
  const edge = groundTilt(6.7, 6.97, 6.43, 6.7, 5.0, 2, 1);
  assert.equal(edge.roll, 0, 'roll rejected');
  close(edge.pitch, Math.atan(0.54 / 4), 1e-12, 'the pitch along the ramp is kept');
  assert.equal(groundTilt(5, 5, 5, 5.51, 5, 2, 1).roll, 0, 'just over the step on the left');
  assert.equal(groundTilt(5, 5.51, 5, 5, 5, 2, 1).pitch, 0, 'just over the step ahead');
  assert.equal(groundTilt(5, 5, 4.49, 5, 5, 2, 1).pitch, 0, 'just over the step behind');
  close(groundTilt(5, 5, 5, 5, 5.5, 2, 1).roll, Math.atan(0.5 / 2), 1e-12, 'exactly the step is still a slope');
});

test('groundTilt: never steeper than SHADOW.maxTilt either way', () => {
  const steep = groundTilt(5, 5.4, 4.6, 4.6, 5.4, 0.2, 0.2);
  assert.equal(steep.pitch, 0.5); assert.equal(steep.roll, 0.5);
  const back = groundTilt(5, 4.6, 5.4, 5.4, 4.6, 0.2, 0.2);
  assert.equal(back.pitch, -0.5); assert.equal(back.roll, -0.5);
});

test('sunShift: straight up is no shift; the scene sun shifts a hand\'s width to +x +z; below the horizon nothing', () => {
  assert.deepEqual(sunShift({ x: 0, y: 1, z: 0 }, 0.62), { x: 0, z: 0 });
  const s = sunShift(SUN, 0.4 * COMPACT.h);
  close(s.x, 0.465, 0.001, 'x'); close(s.z, 0.31, 0.001, 'z');
  assert.deepEqual(sunShift({ x: 1, y: 0, z: 0 }, 1), { x: 0, z: 0 });
  assert.deepEqual(sunShift({ x: 1, y: -1, z: 0 }, 1), { x: 0, z: 0 });
});

test('shadowOpacity: full on the ground, fades with the air height, never below the floor', () => {
  assert.equal(shadowOpacity(0.55, 0), 0.55);
  close(shadowOpacity(0.55, 3), 0.275, 1e-12);
  close(shadowOpacity(0.55, 5.9), 0.55 * 0.2, 1e-12);
  assert.equal(shadowOpacity(0.3, 0), 0.3);
});

test('shadowShown: each reason alone hides it', () => {
  const ok = { fly: false, wet: false, air: 0, eye: false, hidden: false };
  assert.equal(shadowShown(ok), true);
  assert.equal(shadowShown({ ...ok, fly: true }), false);
  assert.equal(shadowShown({ ...ok, wet: true }), false);
  assert.equal(shadowShown({ ...ok, air: 6 }), false);
  assert.equal(shadowShown({ ...ok, air: 5.9 }), true);
  assert.equal(shadowShown({ ...ok, eye: true }), false);
  assert.equal(shadowShown({ ...ok, hidden: true }), false);
});
