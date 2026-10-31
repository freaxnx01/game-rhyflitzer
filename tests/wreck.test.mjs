import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impactStrength } from '../impact.js';
import { WRECK, impactDamage, landingHurts, isWrecked, wreckTick, detachWheels, stepDebris, smokeAt, smokeEmit } from '../wreck.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('WRECK: the agreed constants', () => {
  assert.equal(WRECK.perHit, 0.3);
  assert.equal(WRECK.delay, 3);
  assert.equal(WRECK.smokeMax, 24);
});

test('impactDamage: no strength, no damage (scraping and bumps under 3 m/s are free)', () => {
  assert.equal(impactDamage(impactStrength(0)), 0);
  assert.equal(impactDamage(impactStrength(2.9)), 0);
  assert.equal(impactDamage(impactStrength(3)), 0);
});

test('impactDamage: rises with the impact strength', () => {
  close(impactDamage(impactStrength(25)), 0.3);
  close(impactDamage(impactStrength(14)), 0.15);
  assert.ok(impactDamage(impactStrength(20)) > impactDamage(impactStrength(15)));
});

test('impactDamage: a hit harder than 25 m/s costs no more than a full one', () => {
  close(impactDamage(impactStrength(60)), 0.3);
});

test('impactDamage: a heavier vehicle takes proportionally less (#6)', () => {
  close(impactDamage(1, 2.5), 0.3 / 2.5);
  close(impactDamage(1, 8), 0.3 / 8);
});

test('impactDamage: seven city-speed hits (15 m/s) wreck the compact, six do not', () => {
  const one = impactDamage(impactStrength(15));
  assert.ok(6 * one < 1);
  assert.ok(7 * one >= 1);
});

test('landingHurts: only a fall faster than 9 m/s', () => {
  assert.equal(landingHurts(-8.9), false);
  assert.equal(landingHurts(-9), false);
  assert.equal(landingHurts(-9.1), true);
  assert.equal(landingHurts(3), false);
});

test('isWrecked: from 100 % on', () => {
  assert.equal(isWrecked(0.999), false);
  assert.equal(isWrecked(1), true);
});

test('wreckTick: the new car comes after 3 s', () => {
  assert.equal(wreckTick(0, 1 / 60).respawn, false);
  assert.equal(wreckTick(2.99, 0.005).respawn, false);
  assert.equal(wreckTick(2.99, 0.02).respawn, true);
  close(wreckTick(1, 0.5).t, 1.5);
});

const WHEELS = [{ lx: 1.38, lz: 0.86, r: 0.34 }, { lx: 1.38, lz: -0.86, r: 0.34 }, { lx: -1.38, lz: 0.86, r: 0.34 }, { lx: -1.38, lz: -0.86, r: 0.34 }];
const CAR = { x: 100, y: 5, z: 50, th: 0, vx: 10, vz: 0, scale: 1.3 };

test('detachWheels: one debris state per wheel at the wheel position, scaled with the car', () => {
  const d = detachWheels(WHEELS, CAR);
  assert.equal(d.length, 4);
  close(d[0].x, 100 + 1.3 * 1.38); close(d[0].z, 50 + 1.3 * 0.86); close(d[0].y, 5 + 1.3 * 0.34);
  close(d[3].x, 100 - 1.3 * 1.38); close(d[3].z, 50 - 1.3 * 0.86);
  close(d[0].r, 1.3 * 0.34);
});

test('detachWheels: heading is respected (th = pi/2 puts forward on +z, right on -x)', () => {
  const d = detachWheels([{ lx: 2, lz: 1, r: 0.3 }], { ...CAR, th: Math.PI / 2, scale: 1 });
  close(d[0].x, 100 - 1, 1e-9); close(d[0].z, 50 + 2, 1e-9);
});

test('detachWheels: each wheel flies up, outward on its own side, and keeps the car speed', () => {
  const d = detachWheels(WHEELS, CAR);
  for (const w of d) assert.ok(w.vy > 3);
  assert.ok(d[0].vz > 2, 'right wheel goes right (+z at heading 0)');
  assert.ok(d[1].vz < -2, 'left wheel goes left');
  assert.ok(d[0].vx > CAR.vx - 0.01, 'front wheels pull ahead of the car speed');
  assert.ok(d[2].vx < CAR.vx + 0.01, 'rear wheels fall behind');
});

test('detachWheels: the four wheels do not all fly the same way', () => {
  const d = detachWheels(WHEELS, CAR);
  assert.equal(new Set(d.map((w) => w.vy.toFixed(3))).size > 1, true);
});

const settle = (d, secs, ground = 0) => { for (let i = 0; i < secs * 60 && !d.still; i++) d = stepDebris(d, 1 / 60, ground); return d; };

test('stepDebris: a wheel falls under gravity (22 m/s²)', () => {
  const d = stepDebris({ x: 0, y: 10, z: 0, vx: 0, vy: 0, vz: 0, r: 0.4, spin: 0, still: false }, 0.5, 0);
  close(d.vy, -11); close(d.y, 10 - 11 * 0.5);
});

test('stepDebris: it bounces lower and lower, then lies still on the ground, never below it', () => {
  let d = detachWheels(WHEELS, CAR)[0];
  let peak = 0, minY = Infinity;
  for (let i = 0; i < 600 && !d.still; i++) { d = stepDebris(d, 1 / 60, 0); minY = Math.min(minY, d.y); if (i > 60) peak = Math.max(peak, d.y); }
  assert.equal(d.still, true);
  close(d.y, d.r, 1e-9);
  assert.ok(minY >= d.r - 1e-9);
  assert.ok(peak < 3, `second bounce stays low, got ${peak}`);
});

test('stepDebris: it rolls on for a few metres, spinning, and settles within 8 s', () => {
  const start = detachWheels(WHEELS, CAR)[0];
  const end = settle(start, 8);
  assert.equal(end.still, true);
  assert.ok(Math.hypot(end.x - start.x, end.z - start.z) > 5);
  assert.ok(end.spin > 5);
});

test('stepDebris: a still wheel stays exactly as it is', () => {
  const d = { x: 1, y: 0.4, z: 2, vx: 0, vy: 0, vz: 0, r: 0.4, spin: 3, still: true };
  assert.equal(stepDebris(d, 1 / 60, 0), d);
});

test('stepDebris: it rests on raised ground (a kerb at 0.3 m)', () => {
  const end = settle({ x: 0, y: 2, z: 0, vx: 1, vy: 0, vz: 0, r: 0.4, spin: 0, still: false }, 8, 0.3);
  close(end.y, 0.7);
});

test('smokeAt: fades in, rises, grows and fades out; null after 2.4 s', () => {
  const young = smokeAt(0.1), mid = smokeAt(1.2), old = smokeAt(2.3);
  assert.ok(young.opacity < mid.opacity);
  assert.ok(mid.opacity > old.opacity);
  assert.ok(young.size < mid.size && mid.size < old.size);
  close(mid.rise, 1.6 * 1.2);
  close(smokeAt(0).opacity, 0);
  assert.equal(smokeAt(2.4), null);
  assert.equal(smokeAt(-0.1), null);
});

test('smokeEmit: 10 puffs per second, the remainder carried over', () => {
  let acc = 0, n = 0;
  for (let i = 0; i < 60; i++) { const e = smokeEmit(acc, 1 / 60); acc = e.acc; n += e.n; }
  assert.ok(n === 10 || n === 9, `got ${n}`);
  assert.equal(smokeEmit(0, 0.05).n, 0);
  assert.equal(smokeEmit(0.6, 0.05).n, 1);
});

test('the pool covers the steady state: rate x life <= smokeMax', () => {
  assert.ok(WRECK.smokeRate * WRECK.smokeLife <= WRECK.smokeMax);
});
