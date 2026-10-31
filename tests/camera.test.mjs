import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRONE, droneSway } from '../camera.js';

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
