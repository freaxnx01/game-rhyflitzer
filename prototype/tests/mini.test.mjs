// #463: the Little Classic's pure data — profiles, chair dimensions, cockpit sway. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINI_BODY, MINI_GLASS, profileSize, CHAIR, SWAY, stepSway } from '../mini.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('body profile: 2.95 m long and 1.30 m to the roof (3.05 x 1.35 with the bevel), nothing below the sill', () => {
  const s = profileSize(MINI_BODY);
  close(s.maxX - s.minX, 2.95, 0.05); close(s.maxY, 1.30, 0.05); assert.ok(s.minY >= 0.18, s.minY);
  assert.ok(MINI_BODY.length >= 12);
});

test('glass profile: inside the body in x, under the roof, above the belt line', () => {
  const b = profileSize(MINI_BODY), g = profileSize(MINI_GLASS);
  assert.ok(g.minX > b.minX && g.maxX < b.maxX);
  assert.ok(g.maxY < b.maxY && g.minY > 0.85);
});

test('chair: eye sits above the arms and in front of the back, seat on the roof', () => {
  assert.ok(CHAIR.eye[1] >= 2.4 && CHAIR.eye[1] <= 2.5, CHAIR.eye[1]);
  assert.ok(CHAIR.eye[1] > 1.35 + CHAIR.seatY + CHAIR.arm[1], CHAIR.eye[1]);   // head height above the armrests
  assert.ok(CHAIR.eye[0] > -(CHAIR.seat[0] / 2), CHAIR.eye[0]);               // in front of the backrest's front face (chair centred at x = 0)
  assert.ok(CHAIR.seatY > CHAIR.seat[1], CHAIR.seatY);                          // short legs fit between the roof and the cushion
});

test('stepSway: zero at rest, still zero after 600 steps', () => {
  let s = { roll: 0, pitch: 0 };
  assert.deepEqual(stepSway(s, { steer: 0, speed: 0 }, 1 / 60), { roll: 0, pitch: 0 });
  for (let i = 0; i < 600; i++) s = stepSway(s, { steer: 0, speed: 0 }, 1 / 60);
  assert.deepEqual(s, { roll: 0, pitch: 0 });
});

test('stepSway: bounded and mirror-symmetric', () => {
  let right = { roll: 0, pitch: 0 }, left = { roll: 0, pitch: 0 };
  for (let i = 0; i < 600; i++) {
    right = stepSway(right, { steer: 0.5, speed: 50 }, 1 / 60);
    left = stepSway(left, { steer: -0.5, speed: 50 }, 1 / 60);
  }
  assert.ok(Math.abs(right.roll) <= SWAY.roll && Math.abs(right.pitch) <= SWAY.pitch, right);
  assert.ok(Math.abs(left.roll) <= SWAY.roll && Math.abs(left.pitch) <= SWAY.pitch, left);
  assert.equal(right.roll, -left.roll);          // steer is the only sign-asymmetric input
  assert.equal(right.pitch, left.pitch);
});

test('stepSway: same real time gives the same sway at 30 and 60 fps', () => {
  let a = { roll: 0, pitch: 0 }, b = { roll: 0, pitch: 0 };
  for (let i = 0; i < 60; i++) a = stepSway(a, { steer: 0.3, speed: 40 }, 1 / 60);
  for (let i = 0; i < 30; i++) b = stepSway(b, { steer: 0.3, speed: 40 }, 1 / 30);
  close(a.roll, b.roll, 1e-3); close(a.pitch, b.pitch, 1e-3);
});
