import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PONTOON_CFG, bankNormal, marchToWater, marchToLand, atRhineBank, crossingLine, pontoonLocal, pontoonSurfaceAt, drivableLength, pontoonHit, stepPontoon, togglePontoon, bayFrames, bayVisible, bayDrop, pontoonHulls, pontoonPrompt } from '../pontoon.js';

// a straight east-west Rhine between z 50 and 150 (water = negative), the car on the south bank (z < 50), a road strip at z 190..196 on the north bank
const river = (x, z) => Math.abs(z - 100) - 50;
const env = (over = {}) => ({ dist: river, nameAt: () => 'Rhein', waterLevel: () => 2, roadAt: (x, z) => z >= 190 && z <= 196, bridgeNear: () => false, ground: () => 2.5, ...over });
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('PONTOON_CFG: the agreed numbers', () => {
  assert.equal(PONTOON_CFG.reach, 30); assert.equal(PONTOON_CFG.maxWidth, 400); assert.equal(PONTOON_CFG.roadReach, 80); assert.equal(PONTOON_CFG.apron, 6);
  assert.equal(PONTOON_CFG.hw, 2.2); assert.equal(PONTOON_CFG.deckAbove, 0.9); assert.equal(PONTOON_CFG.maxGrade, 0.15); assert.equal(PONTOON_CFG.bay, 6);
  assert.equal(PONTOON_CFG.buildSecs, 3); assert.equal(PONTOON_CFG.bridgeClear, 25);
});

test('bankNormal points towards the water and is null on flat ground', () => {
  const n = bankNormal(river, 0, 25); close(n[0], 0, 1e-9); close(n[1], 1, 1e-9);
  const s = bankNormal(river, 0, 175); close(s[1], -1, 1e-9);
  assert.equal(bankNormal(() => 10, 0, 0), null);
});

test('marchToWater / marchToLand find the edges to 0.1 m, null when out of range', () => {
  close(marchToWater(river, 0, 25, [0, 1], 0, 30), 25, 0.1);
  assert.equal(marchToWater(river, 0, 25, [0, 1], 0, 20), null);
  close(marchToLand(river, 0, 25, [0, 1], 26, 400), 125, 0.1);
  assert.equal(marchToLand(river, 0, 25, [0, 1], 26, 100), null);
});

test('atRhineBank: on land within reach of water named Rhein, else false', () => {
  assert.equal(atRhineBank(env(), 0, 25), true);
  assert.equal(atRhineBank(env(), 0, -20), false);                       // 70 m from the water
  assert.equal(atRhineBank(env(), 0, 100), false);                       // in the water
  assert.equal(atRhineBank(env({ nameAt: () => 'Sissle' }), 0, 25), false);
  assert.equal(atRhineBank(env({ dist: () => 10 }), 0, 25), false);      // flat: no bank direction
});

// the real SDF (8 m grid, Int8, interpolated) reads water up to ~2.6 m before the water polygon starts (measured at
// Innermattstrasse); the name probe has to walk inward past that gap, and still take the FIRST name it finds
test('atRhineBank: the name probe survives an SDF edge that runs ahead of the water polygon', () => {
  const lateRhein = env({ nameAt: (x, z) => z > 53 && z < 147 ? 'Rhein' : '' });   // polygon 3 m inside the SDF edge
  assert.equal(atRhineBank(lateRhein, 0, 25), true);
  assert.equal(crossingLine(lateRhein, 0, 25).error, undefined);
  const pondThenRhein = env({ nameAt: (x, z) => z > 70 ? 'Rhein' : z > 53 ? 'Weiher' : '' });   // the first water in front is not the Rhine
  assert.equal(atRhineBank(pondThenRhein, 0, 25), false);
  assert.equal(atRhineBank(env({ nameAt: (x, z) => z > 90 ? 'Rhein' : '' }), 0, 25), false);    // the Rhine starts past nameTo
});

test('crossingLine: perpendicular from 6 m inland to the first road on the far bank', () => {
  const d = crossingLine(env(), 0, 25);
  assert.equal(d.error, undefined);
  close(d.a[0], 0, 0.2); close(d.a[1], 44, 0.2);        // water edge at 50, apron 6 m back
  close(d.b[0], 0, 0.2); close(d.b[1], 190, 0.2);       // first road sample at z 190
  close(d.len, 146, 0.4); close(d.ux, 0, 1e-9); close(d.uz, 1, 1e-9);
  assert.equal(d.hw, 2.2); close(d.deckH, 2.9, 1e-9); assert.equal(d.hNear, 2.5); assert.equal(d.hFar, 2.5);
  assert.equal(d.rampNear, 6); assert.equal(d.rampFar, 6);              // 0.4 m / 0.15 = 2.7 m, floored at minRamp
  assert.equal(d.nBays, 25); assert.equal(d.built, 0); assert.equal(d.dir, 1);
});

test('crossingLine: no road within roadReach ends 6 m onto the far bank', () => {
  const d = crossingLine(env({ roadAt: () => false }), 0, 25);
  close(d.b[1], 156, 0.3); close(d.len, 112, 0.5);
});

test('crossingLine: the sweep finds a far road the perpendicular misses', () => {
  const d = crossingLine(env({ roadAt: (x, z) => x > 40 && z >= 190 && z <= 196 }), 0, 25);
  assert.equal(d.error, undefined);
  assert.ok(d.b[0] > 40 && d.b[0] < 50, `b.x ${d.b[0]}`);             // -15 deg: x = 171 * sin 15 = 44
  assert.ok(d.uz > 0.9);
});

test('crossingLine refusals: noBank, noFarBank, hasBridge', () => {
  assert.equal(crossingLine(env(), 0, -20).error, 'noBank');
  assert.equal(crossingLine(env(), 0, 100).error, 'noBank');
  assert.equal(crossingLine(env({ nameAt: () => '' }), 0, 25).error, 'noBank');
  assert.equal(crossingLine(env({ dist: (x, z) => Math.abs(z - 300) - 250 }), 0, 25).error, 'noFarBank');   // 500 m wide
  assert.equal(crossingLine(env({ bridgeNear: (x, z) => Math.abs(z - 100) < 5 }), 0, 25).error, 'hasBridge');
});

test('pontoonSurfaceAt: ramps at 15 %, flat deck, meets the banks exactly', () => {
  const d = { ...crossingLine(env({ ground: (x, z) => z < 100 ? 8 : 2.5 }), 0, 25) };
  assert.equal(d.hNear, 8); close(d.rampNear, 34, 1e-9); assert.equal(d.rampFar, 6);
  assert.equal(pontoonSurfaceAt(d, 0), 8); close(pontoonSurfaceAt(d, 17), 5.45, 1e-9); close(pontoonSurfaceAt(d, 34), 2.9, 1e-9);
  close(pontoonSurfaceAt(d, 73), 2.9, 1e-9); close(pontoonSurfaceAt(d, d.len), 2.5, 1e-9);
  assert.equal(pontoonSurfaceAt(d, -3), 8); close(pontoonSurfaceAt(d, d.len + 3), 2.5, 1e-9);   // clamped, not extrapolated
  for (let t = 0.5; t < d.len; t += 0.5) assert.ok(Math.abs(pontoonSurfaceAt(d, t) - pontoonSurfaceAt(d, t - 0.5)) <= 0.075 + 1e-9, `grade at ${t}`);
});

test('pontoonSurfaceAt: ramps that do not fit are scaled to meet', () => {
  const d = { a: [0, 0], b: [20, 0], len: 20, ux: 1, uz: 0, hw: 2.2, deckH: 2.9, hNear: 12, hFar: 12, rampNear: 10, rampFar: 10, nBays: 4, built: 1, dir: 1 };
  assert.equal(pontoonSurfaceAt(d, 0), 12); close(pontoonSurfaceAt(d, 10), 2.9, 1e-9); assert.equal(pontoonSurfaceAt(d, 20), 12);
  const c = crossingLine(env({ roadAt: () => false, ground: () => 60 }), 0, 25);            // 57 m / 0.15 = 380 m ramps, len 112
  close(c.rampNear + c.rampFar, c.len, 1e-9); close(c.rampNear, c.len / 2, 1e-9);
});

test('pontoonHit: within width and built length, respects the 1.5 m height rule, no plateau past the ends', () => {
  const d = { ...crossingLine(env(), 0, 25), built: 1 };
  const h = pontoonHit(d, 0.5, 100); assert.ok(h); assert.equal(h.pontoon, true); assert.equal(h.b, d); close(h.t, 56, 0.3);
  { const [t, s] = pontoonLocal(d, 0.5, 100); close(t, 56, 0.3); close(s, -0.5, 1e-9); }
  assert.equal(pontoonHit(d, 3, 100), null);                       // 3 m off the axis, hw 2.2
  assert.equal(pontoonHit(d, 0, 40), null);                        // 4 m before the near end
  assert.equal(pontoonHit(d, 0, 195), null);                       // past the far end
  assert.equal(pontoonHit(d, 0, 100, d.deckH - 2), null);          // car 2 m under the deck
  assert.ok(pontoonHit(d, 0, 100, d.deckH - 1));
  assert.ok(pontoonHit(d, 0, 100, undefined));
  assert.equal(pontoonHit(null, 0, 100), null);
  const half = { ...d, built: 0.5 };                               // 12.5 bays -> 12 whole bays = 72 m
  assert.equal(drivableLength(half), 72);
  assert.ok(pontoonHit(half, 0, 44 + 70)); assert.equal(pontoonHit(half, 0, 44 + 74), null);
  assert.equal(drivableLength(d), d.len);
});

test('stepPontoon builds in 3 s, togglePontoon reverses, a removal ends with null', () => {
  let d = crossingLine(env(), 0, 25);
  for (let i = 0; i < 90; i++) d = stepPontoon(d, 1 / 60);
  close(d.built, 0.5, 1e-6);
  for (let i = 0; i < 90; i++) d = stepPontoon(d, 1 / 60);
  close(d.built, 1, 1e-6);                                         // 180 float steps may stop a hair short of 1
  d = stepPontoon(d, 1); assert.equal(d.built, 1);                 // clamped, stays complete
  d = togglePontoon(d); assert.equal(d.dir, -1);
  for (let i = 0; i < 179; i++) d = stepPontoon(d, 1 / 60);
  assert.ok(d && d.built > 0);
  d = stepPontoon(d, 1); assert.equal(d, null);                    // the last step clamps to 0 and the deck is gone
  assert.equal(stepPontoon(null, 1), null);
});

test('bayFrames, bayVisible, bayDrop: 25 bays, ramps on legs, floating in between, the newest bay drops in', () => {
  const d = { ...crossingLine(env(), 0, 25), built: 0.5 };
  const f = bayFrames(d); assert.equal(f.length, 25);
  assert.equal(f[0].floating, false); assert.equal(f[24].floating, false); assert.equal(f[12].floating, true);
  close(f[0].t0, 0, 1e-9); close(f[0].t1, 6, 1e-9); close(f[12].x, 0, 0.2); close(f[12].z, 44 + 75, 0.3);
  assert.equal(bayVisible(d, 12), true); assert.equal(bayVisible(d, 13), false);   // 12.5 bays: bay 12 is dropping in
  close(bayDrop(d, 12), 1.5 * (1 - 0.5 * 3 / 25 / 0.4), 1e-9);                      // laid 0.06 s ago
  assert.equal(bayDrop(d, 0), 0); assert.equal(bayDrop(d, 13), 1.5);
  assert.equal(bayDrop({ ...d, dir: -1 }, 12), 0);                                   // nothing drops while removing
  assert.equal(bayVisible({ ...d, built: 1 }, 24), true);
});

test('pontoonHulls: one box per laid floating bay, along x across, water-relative heights (#101)', () => {
  const d = { ...crossingLine(env(), 0, 25), built: 1 };
  const hulls = pontoonHulls(d); assert.equal(hulls.length, 22);   // bays 1..22: bay 0 starts on the near ramp, bays 23 and 24 end on the far one (len 146, ramps 6 m)
  const h = hulls[0]; assert.equal(h.hw, 0.9); assert.equal(h.hd, 4.0); close(h.c, 0, 1e-9); close(h.s, 1, 1e-9); close(h.y0, 1.4, 1e-9); close(h.y1, 2.5, 1e-9);
  assert.equal(pontoonHulls({ ...d, built: 0.5 }).length, 11);                      // 12 bays laid, bay 0 is a ramp
});

test('pontoonPrompt', () => {
  assert.equal(pontoonPrompt(null, false), null); assert.equal(pontoonPrompt(null, true), 'build'); assert.equal(pontoonPrompt({}, true), 'remove'); assert.equal(pontoonPrompt({}, false), 'remove');
});
