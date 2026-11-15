// #836 part a: car-to-car contact in a shared drive. Pure netbump.js, node --test only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carShape, carContact, bumpShare, bumpImpulse, bumpGate, RESTITUTION, BUMP_COOLDOWN, BUMP_DY } from '../netbump.js';
const CIRCLE = { shape: 'circle', r: 1.3 }, BUS = { shape: 'capsule', r: 1.3, hl: 4.8 };

test('carContact_apart_null', () => {
  assert.equal(carContact(carShape(0, 0, 0, CIRCLE, 1), carShape(3, 0, 0, CIRCLE, 1)), null);
});
test('carContact_overlap_normalFromOtherToOwn', () => {
  const hit = carContact(carShape(0, 0, 0, CIRCLE, 1), carShape(2, 0, 0, CIRCLE, 1));
  assert.ok(Math.abs(hit.nx + 1) < 1e-9 && Math.abs(hit.nz) < 1e-9); assert.ok(Math.abs(hit.pen - 0.6) < 1e-9);
  const h = carContact(carShape(0, 0, 0, CIRCLE, 1), carShape(0, 0, 0, CIRCLE, 1)); assert.deepEqual([h.nx, h.nz], [1, 0]);
});
test('carContact_busAlongItsLength_hits', () => {
  assert.ok(carContact(carShape(4, 2, 0, CIRCLE, 1), carShape(0, 0, 0, BUS, 1)));
});
test('bumpImpulse_headOn_swappedRolesMirror', () => {
  const a = { vx: 10, vz: 0, m: 1 }, b = { vx: -10, vz: 0, m: 1 };
  const ia = bumpImpulse(a, b, { nx: -1, nz: 0 }), ib = bumpImpulse(b, a, { nx: 1, nz: 0 });
  assert.equal(RESTITUTION, 0.3);
  assert.ok(Math.abs(ia.dvx + 13) < 1e-9 && Math.abs(ib.dvx - 13) < 1e-9);
  assert.equal(ia.closing, 20);
});
test('bumpImpulse_heavierCar_movesLess', () => {
  const light = { vx: 10, vz: 0, m: 1 }, heavy = { vx: -10, vz: 0, m: 4 };
  const il = bumpImpulse(light, heavy, { nx: -1, nz: 0 }), ih = bumpImpulse(heavy, light, { nx: 1, nz: 0 });
  assert.ok(Math.abs(ih.dvx) < Math.abs(il.dvx));
  assert.ok(Math.abs(light.m * il.dvx + heavy.m * ih.dvx) < 1e-9);         // momentum conserved
  assert.ok(bumpShare(4, 1) < bumpShare(1, 4));
});
test('bumpImpulse_separating_none', () => {
  const r = bumpImpulse({ vx: -5, vz: 0, m: 1 }, { vx: 5, vz: 0, m: 1 }, { nx: -1, nz: 0 });
  assert.deepEqual([r.dvx, r.dvz, r.closing], [0, 0, 0]);
});
test('bumpGate_cooldownPerPlayer', () => {
  const g = new Map(); assert.equal(BUMP_COOLDOWN, 0.3); assert.equal(BUMP_DY, 2.5);
  assert.equal(bumpGate(g, 1, 10), true); assert.equal(bumpGate(g, 1, 10.2), false);
  assert.equal(bumpGate(g, 2, 10.2), true); assert.equal(bumpGate(g, 1, 10.31), true);
});
