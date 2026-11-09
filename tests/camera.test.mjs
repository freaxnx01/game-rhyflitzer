import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRONE, droneSway, PULL, clearFraction, aheadHeadings, pullStep } from '../camera.js';

test('DRONE: the agreed camera constants (#93)', () => {
  assert.deepEqual(DRONE, { rate: 2.5, aimRate: 4, aimAhead: 4, aimUp: 1, swaySide: 0.5, swayUp: 0.3, swaySideHz: 0.33, swayUpHz: 0.21 });
});

test('DRONE: lazier than the chase cam (6) and the heli cam (3)', () => {
  assert.ok(DRONE.rate < 3 && DRONE.rate > 0);
  assert.ok(DRONE.aimRate > DRONE.rate);
});

test('droneSway: zero at t = 0, bounded by the amplitudes, not constant', () => {
  assert.deepEqual(droneSway(0), { side: 0, up: 0 });
  let maxSide = 0, maxUp = 0, moved = false, prev = droneSway(0);
  for (let t = 0; t < 20; t += 1 / 60) {
    const s = droneSway(t);
    maxSide = Math.max(maxSide, Math.abs(s.side)); maxUp = Math.max(maxUp, Math.abs(s.up));
    if (Math.abs(s.side - prev.side) > 1e-6) moved = true;
    prev = s;
  }
  assert.ok(maxSide <= DRONE.swaySide + 1e-9 && maxSide > DRONE.swaySide * 0.95, `side ${maxSide}`);
  assert.ok(maxUp <= DRONE.swayUp + 1e-9 && maxUp > DRONE.swayUp * 0.95, `up ${maxUp}`);
  assert.ok(moved);
});

test('droneSway: periodic in each axis', () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  const a = droneSway(1.234), b = droneSway(1.234 + 1 / DRONE.swaySideHz), c = droneSway(1.234 + 1 / DRONE.swayUpHz);
  assert.ok(close(a.side, b.side));
  assert.ok(close(a.up, c.up));
});

test('droneSway: a config overrides the amplitudes', () => {
  const s = droneSway(0.25 / 0.33, { ...DRONE, swaySide: 2, swayUp: 0 });
  assert.ok(Math.abs(s.side - 2) < 1e-6 && s.up === 0);
});

test('PULL: the agreed pull-in constants (#777)', () => {
  assert.deepEqual(PULL, { min: 0.2, inRate: 1.0, outRate: 0.4, hold: 1.5, rise: 2.5, lookAhead: 0.6, samples: 4, maxYawRate: 12, still: 0.05 });
});

test('clearFraction: 1 when the ideal spot is free', () => {
  assert.equal(clearFraction(() => false), 1);
});

test('clearFraction: finds the wall to within 2 cm, approaching from outside', () => {
  const wall = 0.537;   // points farther out than this are inside the solid
  const t = clearFraction((x) => x > wall);
  assert.ok(t <= wall && wall - t < 0.02, `t ${t}`);
});

test('clearFraction: the floor when nothing is free', () => {
  assert.equal(clearFraction(() => true), PULL.min);
});

test('clearFraction: continuous -- a wall moving 1 cm moves the result less than 3 cm', () => {
  for (let w = 0.25; w < 0.99; w += 0.01) {
    const a = clearFraction((x) => x > w), b = clearFraction((x) => x > w + 0.01);
    assert.ok(Math.abs(b - a) < 0.03, `w ${w}: ${a} -> ${b}`);
  }
});

test('aheadHeadings: one heading when the car is not turning', () => {
  assert.deepEqual(aheadHeadings(1.2, 0), [1.2]);
  assert.deepEqual(aheadHeadings(1.2, PULL.still / 2), [1.2]);
});

test('aheadHeadings: spinning, samples from now to lookAhead seconds ahead, yaw rate clamped', () => {
  const h = aheadHeadings(0, 2);
  assert.equal(h.length, PULL.samples + 1);
  assert.equal(h[0], 0);
  assert.ok(Math.abs(h[h.length - 1] - 2 * PULL.lookAhead) < 1e-12);
  const fast = aheadHeadings(0, -100);
  assert.ok(Math.abs(fast[fast.length - 1] + PULL.maxYawRate * PULL.lookAhead) < 1e-12);
});

test('pullStep: pulls in at most inRate per second, and re-arms the hold', () => {
  const s = pullStep({ pull: 1, hold: 0 }, 0.3, 0.05);
  assert.ok(Math.abs(s.pull - (1 - PULL.inRate * 0.05)) < 1e-12);
  assert.equal(s.hold, PULL.hold);
  assert.equal(pullStep({ pull: 0.32, hold: 0 }, 0.3, 0.05).pull, 0.3);   // never past the need
});

test('pullStep: holds while the hold runs, then eases out at outRate, never past the need', () => {
  let s = { pull: 0.4, hold: PULL.hold };
  for (let t = 0; t < PULL.hold - 0.1; t += 0.05) s = pullStep(s, 1, 0.05);
  assert.equal(s.pull, 0.4);
  for (let i = 0; i < 4; i++) s = pullStep(s, 1, 0.05);
  assert.ok(s.pull > 0.4 && s.pull <= 0.4 + PULL.outRate * 0.05 * 3 + 1e-12, `pull ${s.pull}`);   // 2 or 3 steps out, by float rounding of the hold
  for (let i = 0; i < 200; i++) s = pullStep(s, 0.9, 0.05);
  assert.equal(s.pull, 0.9);
});

test('pullStep: per-step change bounded at any dt up to the loop clamp', () => {
  for (const dt of [1 / 60, 1 / 30, 0.05]) {
    let s = { pull: 1, hold: 0 }, prev = 1;
    for (let i = 0; i < 400; i++) { s = pullStep(s, i % 40 < 20 ? 0.2 : 1, dt); assert.ok(Math.abs(s.pull - prev) <= PULL.inRate * dt + 1e-12); prev = s.pull; }
  }
});
