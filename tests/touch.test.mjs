// #535 phase 2: the phone joystick's maths -- a finger offset from the base's centre becomes an analog vector
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STICK, stickVector, TOUCH_FADE, touchFaded } from '../touch.js';

test('stickVector_InsideDeadZone_IsZero', () => {
  assert.deepEqual(stickVector(STICK.radius * 0.1, 0), { x: 0, y: 0 });
});

test('stickVector_AtTheRim_IsUnit_UpIsForward', () => {
  const r = stickVector(STICK.radius, 0); assert.ok(Math.abs(r.x - 1) < 1e-9 && Math.abs(r.y) < 1e-9);
  const u = stickVector(0, -STICK.radius); assert.ok(Math.abs(u.y - 1) < 1e-9 && Math.abs(u.x) < 1e-9);
});

test('stickVector_BeyondTheRim_IsClamped', () => {
  const v = stickVector(STICK.radius * 3, STICK.radius * 3);
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9 && v.x > 0 && v.y < 0);
});

test('stickVector_Half_IsAnalog', () => {
  assert.ok(Math.abs(stickVector(STICK.radius / 2, 0).x - 0.5) < 1e-9);
});

test('touchFaded_BeforeIdleMs_IsFalse_AtAndAfter_IsTrue (#1181)', () => {
  assert.equal(touchFaded(1000, 1000 + TOUCH_FADE.idleMs - 1), false);
  assert.equal(touchFaded(1000, 1000 + TOUCH_FADE.idleMs), true);
  assert.equal(touchFaded(1000, 1000 + TOUCH_FADE.idleMs + 5000), true);
});

test('touchFaded_RightAfterANewTouch_IsFalse (#1181)', () => {
  assert.equal(touchFaded(0, 10000), true);
  assert.equal(touchFaded(10000, 10001), false);
});

test('TOUCH_FADE_IsFourSecondsToThirtyPercent (#1181)', () => {
  assert.deepEqual(TOUCH_FADE, { idleMs: 4000, opacity: 0.3 });
});
