import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL, wheelTargetYaw, stepWheelYaw, stepWheelSpin, frontAxleX } from '../steering.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('WHEEL: the agreed constants', () => {
  assert.deepEqual(WHEEL, { maxYaw: Math.PI / 6, speedFade: 30, rate: 10 });
});

test('wheelTargetYaw: full lock standing, right is positive, left negative, none is zero', () => {
  close(wheelTargetYaw(1, 0), Math.PI / 6, 1e-9);
  close(wheelTargetYaw(-1, 0), -Math.PI / 6, 1e-9);
  assert.equal(wheelTargetYaw(0, 10), 0);
});

test('wheelTargetYaw: less lock at speed (half at 30 m/s), like the physics steering fade', () => {
  close(wheelTargetYaw(1, 30), Math.PI / 12, 1e-9);
  assert.ok(wheelTargetYaw(1, 60) < wheelTargetYaw(1, 30));
});

test('wheelTargetYaw: steer is clamped to -1..1 (the autopilot can be fractional, never beyond)', () => {
  close(wheelTargetYaw(2, 0), Math.PI / 6, 1e-9);
  close(wheelTargetYaw(0.5, 0), Math.PI / 12, 1e-9);
});

test('stepWheelYaw: moves toward the target without overshooting, and settles', () => {
  let y = 0, prev = 0;
  for (let i = 0; i < 6; i++) { y = stepWheelYaw(y, 1, 0, 1 / 60); assert.ok(y > prev && y < Math.PI / 6); prev = y; }
  for (let i = 0; i < 120; i++) y = stepWheelYaw(y, 1, 0, 1 / 60);
  close(y, Math.PI / 6, 1e-3);
  for (let i = 0; i < 120; i++) y = stepWheelYaw(y, 0, 0, 1 / 60);
  close(y, 0, 1e-3);
});

test('stepWheelYaw: the same real time gives the same angle at 30 and 60 fps', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 6; i++) a = stepWheelYaw(a, 1, 0, 1 / 30);
  for (let i = 0; i < 12; i++) b = stepWheelYaw(b, 1, 0, 1 / 60);
  close(a, b, 1e-9);
});

test('stepWheelSpin: forward rolls v*dt/r, reverse runs backwards (wrapped), the angle stays in 0..2*pi', () => {
  close(stepWheelSpin(0, 10, 0.34, 0.1), 1 / 0.34, 1e-9);
  close(stepWheelSpin(1, -10, 0.34, 0.1), 1 - 1 / 0.34 + 2 * Math.PI, 1e-9);
  close(stepWheelSpin(2 * Math.PI - 0.1, 1, 1, 0.5), 0.4, 1e-9);
});

test('frontAxleX: the largest x', () => {
  assert.equal(frontAxleX([[1.38, 0.86], [-1.38, 0.86]]), 1.38);
  assert.equal(frontAxleX([[-2, 1], [0.5, 1], [3, 1]]), 3);
  assert.equal(frontAxleX([]), -Infinity);
});
