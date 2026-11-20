// #836 part a: car-to-car contact in a shared drive. Pure netbump.js, node --test only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carShape, carContact, bumpShare, bumpImpulse, bumpGate, acceptHit, hitNormal, hitImpulse, RESTITUTION, BUMP_COOLDOWN, BUMP_DY, MAX_CLOSING, HIT_WINDOW, HIT_REACH, LOCAL_SEEN_WINDOW } from '../netbump.js';
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
test('bumpImpulse_implausibleClosing_isClamped', () => {   // #836: a peer reporting an absurd vx must not impose an unbounded Δv on the local car
  const a = { vx: 0, vz: 0, m: 1 }, b = { vx: -1e9, vz: 0, m: 1 };
  const r = bumpImpulse(a, b, { nx: -1, nz: 0 });
  assert.equal(r.closing, MAX_CLOSING);
  assert.ok(Math.abs(r.dvx + MAX_CLOSING * (1 + RESTITUTION) / 2) < 1e-6);
});
test('bumpGate_cooldownPerPlayer', () => {
  const g = new Map(); assert.equal(BUMP_COOLDOWN, 0.3); assert.equal(BUMP_DY, 2.5);
  assert.equal(bumpGate(g, 1, 10), true); assert.equal(bumpGate(g, 1, 10.2), false);
  assert.equal(bumpGate(g, 2, 10.2), true); assert.equal(bumpGate(g, 1, 10.31), true);
});

// #836 part b: accepting a one-sided hit from a remote device that saw the contact.
test('acceptHit_oncePerCounter_andNotDuringCooldown', () => {
  const seen = new Map(), local = new Map(), gate = new Map();
  assert.equal(acceptHit(seen, local, 1, { n: 5 }, gate, 10), true);
  assert.equal(acceptHit(seen, local, 1, { n: 5 }, gate, 10.5), false);      // the same hit, repeated in the next poses
  bumpGate(gate, 2, 20);                                              // the own device already saw this contact
  assert.equal(acceptHit(seen, local, 2, { n: 1 }, gate, 20.1), false);
  assert.equal(acceptHit(seen, local, 2, { n: 1 }, gate, 20.5), false);  // still the same counter
  assert.equal(acceptHit(seen, local, 1, { n: 6 }, gate, 11), true);
});
test('acceptHit_localSeen_suppressesSlowRelay', () => {   // #836 part b: a relay arriving past BUMP_COOLDOWN but within LOCAL_SEEN_WINDOW is still suppressed
  const seen = new Map(), local = new Map(), gate = new Map();
  local.set(1, 10);                                                   // the own device saw this contact at t=10
  assert.equal(LOCAL_SEEN_WINDOW, 1);
  assert.equal(acceptHit(seen, local, 1, { n: 5 }, gate, 10.29), false);  // past BUMP_COOLDOWN (0.3) but within the local window
  assert.equal(acceptHit(seen, local, 1, { n: 6 }, gate, 10.3), false);   // a fresh counter is still suppressed within the window
  assert.equal(acceptHit(seen, local, 1, { n: 7 }, gate, 11.01), true);    // a genuinely later collision is accepted again
});
test('hitNormal_fromSenderToOwn_fallbackVelocity_tooFarNull', () => {
  assert.deepEqual(hitNormal(0, 3, { x: 0, z: 0, vx: 0, vz: 0 }), { nx: 0, nz: 1 });
  assert.deepEqual(hitNormal(0, 0, { x: 0, z: 0, vx: -4, vz: 0 }), { nx: -1, nz: 0 });
  assert.equal(hitNormal(0, 0, { x: 0, z: 0, vx: 0, vz: 0 }), null);
  assert.equal(HIT_REACH, 10); assert.equal(hitNormal(0, 11, { x: 0, z: 0, vx: 0, vz: 0 }), null);
});
test('hitImpulse_scalesWithMassShare', () => {
  const d = hitImpulse(20, { nx: 1, nz: 0 }, 1, 1);
  assert.ok(Math.abs(d.dvx - 13) < 1e-9 && d.dvz === 0);              // 20 · 1.3 · 0.5
  assert.ok(hitImpulse(20, { nx: 1, nz: 0 }, 4, 1).dvx < d.dvx);
});
