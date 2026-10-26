// #473: the regional bus's pure data — size, livery, capsule collision, wall yaw. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUS, BUS_HORN, capsuleOffsets, capsuleCircles, wallYaw, noteClass, centsOff } from '../bus.js';
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('size: 12.2 m long, 2.55 m wide, wheelbase 6.08 m with a 2.7 m front overhang', () => {
  close(BUS.length, 12.2, 0.05); close(BUS.width, 2.55, 0.01); close(BUS.wheelbase, 6.08, 0.01);
  close(BUS.length / 2 - BUS.frontOverhang - BUS.wheelbase, -2.68, 0.01);
});
test('capsuleOffsets: a circle is one centre, a capsule spans -hl..+hl with spacing <= r, symmetric', () => {
  assert.deepEqual(capsuleOffsets({ shape: 'circle', r: 1.3 }), [0]);
  const o = capsuleOffsets({ shape: 'capsule', r: 1.3, hl: 4.8 });
  close(o[0], -4.8, 1e-9); close(o.at(-1), 4.8, 1e-9);
  for (let i = 1; i < o.length; i++) assert.ok(o[i] - o[i - 1] <= 1.3 + 1e-9);
  for (let i = 0; i < o.length; i++) close(o[i], -o[o.length - 1 - i], 1e-9);
});
test('capsuleCircles: offsets run along the heading', () => {
  const [[x0, z0], [x1, z1]] = capsuleCircles(10, 20, Math.PI / 2, [-2, 2]);
  close(x0, 10, 1e-9); close(z0, 18, 1e-9); close(x1, 10, 1e-9); close(z1, 22, 1e-9);
});
test('wallYaw: zero at the centre and head-on, opposite for nose and tail, clamped', () => {
  assert.equal(wallYaw(0, 0, 0, 1, 0.5, 1, 0.05), 0);
  close(wallYaw(4.8, 0, -1, 0, 0.5, 1, 0.05), 0, 1e-12);                 // push along the axis
  const nose = wallYaw(4.8, 0, 0, 1, 0.01, 1, 0.05), tail = wallYaw(-4.8, 0, 0, 1, 0.01, 1, 0.05);
  assert.ok(nose !== 0 && Math.sign(nose) === -Math.sign(tail), `${nose} ${tail}`);
  assert.equal(Math.abs(wallYaw(4.8, 0, 0, 1, 10, 1, 0.05)), 0.05);
});
test('horn: a chord without the C#-E-A notes of the three-tone horn', () => {
  assert.ok(BUS_HORN.notes.length >= 2);
  for (const f of BUS_HORN.notes) assert.ok(![1, 4, 9].includes(noteClass(f)) || Math.abs(centsOff(f)) > 30, f);
});
