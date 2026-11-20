import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAILER, trailerStep } from '../trailer.js';

const geom = { hitch: 2, length: 5 };
const run = (phi, v, yaw, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) phi = trailerStep(phi, v, yaw, geom, dt); return phi; };

test('straight driving brings the trailer back to 0', () => {
  assert.ok(Math.abs(run(0.5, 10, 0, 200)) < 0.01);
});

test('a steady circle settles at a steady angle on the inside', () => {
  const a = run(0, 8, 0.4, 600), b = trailerStep(a, 8, 0.4, geom, 1 / 60);
  assert.ok(Math.abs(a - b) < 1e-4, `${a} ${b}`);
  assert.equal(Math.sign(a), -Math.sign(0.4));
  assert.ok(Math.abs(a) < TRAILER.maxAngle);
  assert.equal(Math.sign(run(0, 8, -0.4, 600)), 1);
});

test('reversing folds it up to the clamp', () => {
  assert.equal(Math.abs(run(0.05, -3, 0, 2000)), TRAILER.maxAngle);
});

test('standing still changes nothing', () => {
  assert.equal(trailerStep(0.3, 0, 0, geom, 1 / 60), 0.3);
  assert.equal(trailerStep(0.3, 10, 0.5, geom, 0), 0.3);
});

test('a long frame stays finite and clamped', () => {
  const p = trailerStep(0.2, 22, 1, geom, 0.5);
  assert.ok(Number.isFinite(p) && Math.abs(p) <= TRAILER.maxAngle);
});
