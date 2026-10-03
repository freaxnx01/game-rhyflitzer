import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELI, heliInput, heliFloor, heliStart, stepHeli } from '../heli.js';

const IDLE = { fwd: 0, yaw: 0, lift: 0 };
const NO_TOUCH = { l: 0, r: 0, g: 0, b: 0, h: 0 };
const run = (s, input, secs, ground = 0, floor = ground + HELI.clearance) => { for (let i = 0; i < secs * 60; i++) s = stepHeli(s, input, 1 / 60, ground, floor); return s; };
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const at = (y, th = 0) => ({ x: 0, z: 0, y, th, v: 0, alt: y });
const box = (o) => ({ x: 0, z: 0, hw: 5, hd: 5, c: 1, s: 0, h: 30, ...o });

test('HELI: the agreed flight constants', () => {
  assert.deepEqual(HELI, { takeoffAgl: 120, clearance: 10, maxAgl: 400, top: 40, back: 10, accel: 12, yawRate: 1.2, climb: 15, follow: 2, rotorMargin: 4, camDist: 35, camH: 22 });
});

test('heliInput: W/S and arrows fly, A/D and arrows yaw, Space climbs, Shift sinks, touch buttons too', () => {
  assert.deepEqual(heliInput({}, NO_TOUCH), IDLE);
  assert.deepEqual(heliInput({ KeyW: true, KeyD: true, Space: true }, NO_TOUCH), { fwd: 1, yaw: 1, lift: 1 });
  assert.deepEqual(heliInput({ ArrowDown: true, ArrowLeft: true, ShiftRight: true }, NO_TOUCH), { fwd: -1, yaw: -1, lift: -1 });
  assert.deepEqual(heliInput({ ArrowUp: true, ArrowRight: true, ShiftLeft: true }, NO_TOUCH), { fwd: 1, yaw: 1, lift: -1 });
  assert.deepEqual(heliInput({ KeyW: true, KeyS: true, KeyA: true, KeyD: true, Space: true, ShiftLeft: true }, NO_TOUCH), IDLE);
  assert.deepEqual(heliInput({ KeyW: false }, { ...NO_TOUCH, g: 1, l: 1 }), { fwd: 1, yaw: -1, lift: 0 });
  assert.deepEqual(heliInput({}, { ...NO_TOUCH, b: 1, r: 1 }), { fwd: -1, yaw: 1, lift: 0 });
});

test('heliStart: where the car is, standing, aiming for takeoffAgl above the ground', () => {
  assert.deepEqual(heliStart(10, -20, 3, 1.5, 3), { x: 10, z: -20, y: 3, th: 1.5, v: 0, alt: 3 + HELI.takeoffAgl });
});

test('stepHeli: from take-off it climbs to the target altitude and hovers in place', () => {
  const s = run(heliStart(0, 0, 0, 0, 0), IDLE, 10);
  close(s.y, HELI.takeoffAgl, 1, 'y');
  assert.equal(s.x, 0); assert.equal(s.z, 0); assert.equal(s.v, 0);
});

test('stepHeli: it returns a new state and leaves the old one alone', () => {
  const s = at(50); const n = stepHeli(s, { fwd: 1, yaw: 1, lift: 1 }, 1 / 60, 0, 10);
  assert.deepEqual(s, at(50)); assert.notEqual(n, s);
});

test('stepHeli: W accelerates to top speed along the heading, never beyond', () => {
  const s = run(at(50, Math.PI / 2), { ...IDLE, fwd: 1 }, 6);
  close(s.v, HELI.top, 1e-9, 'v'); close(s.x, 0, 1e-6, 'x'); assert.ok(s.z > 150, String(s.z));
});

test('stepHeli: releasing W slows to a hover, S flies slowly backwards', () => {
  let s = run(at(50), { ...IDLE, fwd: 1 }, 4);
  s = run(s, IDLE, 4); assert.equal(s.v, 0);
  s = run(s, { ...IDLE, fwd: -1 }, 3); close(s.v, -HELI.back, 1e-9, 'v');
});

test('stepHeli: D yaws right (heading grows) at yawRate, A left', () => {
  close(run(at(50), { ...IDLE, yaw: 1 }, 1).th, HELI.yawRate, 1e-9, 'D');
  close(run(at(50), { ...IDLE, yaw: -1 }, 1).th, -HELI.yawRate, 1e-9, 'A');
});

test('stepHeli: Space raises the target altitude at climb rate, capped at maxAgl above the ground', () => {
  close(run(at(50), { ...IDLE, lift: 1 }, 2).alt, 50 + 2 * HELI.climb, 1e-6, '2 s');
  close(run(at(50), { ...IDLE, lift: 1 }, 60, 5).alt, 5 + HELI.maxAgl, 1e-9, 'cap');
});

test('stepHeli: Shift sinks, but never below the floor', () => {
  const s = run(at(100), { ...IDLE, lift: -1 }, 20, 0, 30);
  assert.equal(s.alt, 30); close(s.y, 30, 1e-6, 'y');
});

test('stepHeli: a floor above the helicopter lifts it at once (a tall building ahead)', () => {
  const s = stepHeli(at(20), IDLE, 1 / 60, 0, 45);
  assert.equal(s.y, 45); assert.equal(s.alt, 45);
});

test('heliFloor: ground plus clearance with nothing around', () => {
  assert.equal(heliFloor(7, [], 0, 0), 7 + HELI.clearance);
});

test('heliFloor: the top of a box under the rotor counts; bridges and boxes further away do not', () => {
  assert.equal(heliFloor(2, [box()], 0, 0), 30 + HELI.clearance);
  assert.equal(heliFloor(2, [box()], 5 + HELI.rotorMargin - 0.1, 0), 30 + HELI.clearance);
  assert.equal(heliFloor(2, [box()], 5 + HELI.rotorMargin + 0.1, 0), 2 + HELI.clearance);
  assert.equal(heliFloor(2, [box({ bridge: true })], 0, 0), 2 + HELI.clearance);
  assert.equal(heliFloor(40, [box()], 0, 0), 40 + HELI.clearance);   // ground above a low box wins
  assert.equal(heliFloor(2, [box(), box({ h: 55 })], 0, 0), 55 + HELI.clearance);   // the highest box wins
});

test('heliFloor: rotated boxes are tested in their own frame', () => {
  const r = box({ hw: 20, hd: 2, c: Math.cos(Math.PI / 2), s: Math.sin(Math.PI / 2) });   // long along z
  assert.equal(heliFloor(0, [r], 0, 15), 30 + HELI.clearance);
  assert.equal(heliFloor(0, [r], 15, 0), HELI.clearance);
});
