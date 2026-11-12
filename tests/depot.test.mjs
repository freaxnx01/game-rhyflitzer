import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPOT, footprint, depotLayout, nearestSlot, depotWants } from '../depot.js';
import { selectableIds } from '../carselect.js';

const car = (type, r, hl, top = 60, accel = 16) => ({ type, mass: 1, drive: { top, accel, grip: 9 }, collision: hl ? { shape: 'capsule', r, hl } : { shape: 'circle', r } });

test('footprint: a circle is 2r square, a capsule 2(hl + r) long', () => {
  assert.deepEqual(footprint(car('sport', 1.3)), { w: 2.6, l: 2.6 });
  const bus = footprint(car('utility', 1.3, 4.8));
  assert.ok(bus.w === 2.6 && Math.abs(bus.l - 12.2) < 1e-9, bus);
  assert.throws(() => footprint({ collision: { shape: 'box' } }), /collision/);
});

test('depotLayout: short vehicles on the high-z edge from the west, long ones on the low-z edge from the east, noses inwards', () => {
  const defs = { compact: car('everyday', 1.3), hyper: car('sport', 1.3, 0.8, 83.3, 21), bus: car('utility', 1.3, 4.8, 27.8, 4), mini: car('screen', 1.0) };
  const s = Object.fromEntries(depotLayout(Object.keys(defs), defs).map(v => [v.id, v]));
  // types in VEHICLE_TYPES order: everyday (compact), sport (hyper), screen (mini) on the high row; bus alone on the low row
  assert.equal(s.compact.th, -Math.PI / 2); assert.equal(s.bus.th, Math.PI / 2);
  assert.ok(Math.abs(s.compact.x - (767.3 + 3.8 / 2)) < 1e-9, s.compact.x);            // slot = w + gap, from x = 767.3
  assert.ok(Math.abs(s.hyper.x - (767.3 + 3.8 + 3.8 / 2)) < 1e-9, s.hyper.x);
  assert.ok(Math.abs(s.mini.x - (767.3 + 7.6 + 3.2 / 2)) < 1e-9, s.mini.x);
  assert.ok(Math.abs(s.compact.z - (-92.5 - 0.5 - 2.6 / 2)) < 1e-9, s.compact.z);      // rear 0.5 m inside the edge
  assert.ok(Math.abs(s.bus.x - (897.3 - 3.8 / 2)) < 1e-9 && Math.abs(s.bus.z - (-122.5 + 0.5 + 12.2 / 2)) < 1e-9, s.bus);
});

test('depotLayout: fails fast when the rows would meet or a vehicle is longer than the strip is deep', () => {
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`c${i}`, car('everyday', 1.3)]));
  const long = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`b${i}`, car('utility', 1.3, 4.8)]));
  assert.throws(() => depotLayout(Object.keys({ ...many, ...long }), { ...many, ...long }), /rows/);
  assert.throws(() => depotLayout(['x'], { x: car('utility', 1.3, 15) }), /deep/);
});

test('nearestSlot: the closest parked vehicle within reach, never the driven one', () => {
  const slots = [{ id: 'a', x: 0, z: 0, th: 0, w: 2, l: 4 }, { id: 'b', x: 10, z: 0, th: 0, w: 2, l: 4 }];
  assert.deepEqual(nearestSlot(0, 2, slots, null, 2.5), { id: 'a', d: 1 });
  assert.equal(nearestSlot(0, 2, slots, 'a', 2.5), null);
  assert.equal(nearestSlot(5, 5, slots, null, 2.5), null);
});

test('depotLayout over selectable ids leaves the stand-in out (#830)', () => {
  const defs = { compact: car('everyday', 1.3), hatchback: car('everyday', 1.25), mini: car('screen', 1.0) };
  const ids = selectableIds(Object.keys(defs));
  assert.deepEqual(depotLayout(ids, defs).map(s => s.id).sort(), ['hatchback', 'mini']);
});

// #807: only the nearest slots get a real model, the rest a box
const row = (n, x0 = 0, dx = 10) => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, x: x0 + i * dx, z: 0 }));
const cfg = { ...DEPOT, near: 100, nearMax: 3, keep: 130, keepMax: 4 };

test('depotWants: nearest first, within near, capped, never the driven id', () => {
  const w = depotWants(25, 0, row(20), 'v2', cfg);
  assert.deepEqual(w.load, ['v3', 'v1', 'v4']);              // from x 25: v2 driven, v3 5 m, then v1 / v4 15 m in table order (stable sort)
  assert.ok(!w.keep.has('v2'));
  assert.equal(w.keep.size, 4);
});

test('depotWants: nothing beyond near, keep reaches farther than load', () => {
  assert.deepEqual(depotWants(-115, 0, row(3), null, cfg).load, []);       // v0 is 115 m away
  assert.deepEqual([...depotWants(-115, 0, row(3), null, cfg).keep], ['v0', 'v1']);
});
