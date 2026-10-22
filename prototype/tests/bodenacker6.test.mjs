import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BODENACKER6, isBodenacker6, bodenackerFrame, simplifyRing } from '../bodenacker6.js';

const RECT = [2039.57, -366.12, 60.9, 22.08, -1.7023];   // data/world_hochrhein.json, OSM w171822634 (© OpenStreetMap contributors, ODbL)
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('BODENACKER6_Constants_TenStoreysFourHousesAndTheOsmId', () => {
  assert.equal(BODENACKER6.id, 171822634);
  assert.equal(BODENACKER6.storeys, 10);
  assert.deepEqual(BODENACKER6.houses, ['6a', '6b', '6c', '6d']);
});

test('isBodenacker6_ByOsmId_TrueOnlyForTheBlock', () => {
  assert.equal(isBodenacker6({ id: 171822634, addr: '6a–6d' }), true);
  assert.equal(isBodenacker6({ id: 171822635, addr: '1a–1d' }), false);   // the twin block keeps the generic model
});

test('bodenackerFrame_RoundTrip_LocalToWorldAndBack', () => {
  const f = bodenackerFrame(RECT);
  const [x, z] = f.toWorld(19.1, 11.0), [u, v] = f.toLocal(x, z);
  assert.ok(near(u, 19.1, 1e-9) && near(v, 11.0, 1e-9));
  assert.deepEqual(f.toWorld(0, 0).map(n => +n.toFixed(2)), [2039.57, -366.12]);
});

test('bodenackerFrame_PlusVHeading_PointsEastTowardsTheStreet', () => {
  const f = bodenackerFrame(RECT);
  assert.ok(Math.cos(f.outTh) > 0.95, 'out of the house = east');
  assert.ok(near(Math.cos(f.inTh), -Math.cos(f.outTh), 1e-9) && near(Math.sin(f.inTh), -Math.sin(f.outTh), 1e-9));
});

test('simplifyRing_CollinearSplit_DropsTheMiddleVertex', () => {
  assert.deepEqual(simplifyRing([[0, 0], [5, 0], [10, 0], [10, 4], [0, 4]]), [[0, 0], [10, 0], [10, 4], [0, 4]]);
});

test('simplifyRing_RealCorner_Kept', () => {
  assert.deepEqual(simplifyRing([[0, 0], [10, 0], [10, 4], [0, 4]]), [[0, 0], [10, 0], [10, 4], [0, 4]]);
});

import { bodenackerPorches, bodenackerBody } from '../bodenacker6.js';

// a 40 x 12 block with two 2.4 x 3 bumps on the +v side; the second bump's top is split by a collinear vertex like OSM does
const TWO_BUMPS = [[-20, -6], [20, -6], [20, 6], [12, 6], [12, 9], [9.6, 9], [9.6, 6], [-8, 6], [-8, 9], [-9, 9], [-10.4, 9], [-10.4, 6], [-20, 6]];
const IDENTITY = { toLocal: (x, z) => [x, z], toWorld: (u, v) => [u, v], inTh: Math.PI, outTh: 0 };

test('bodenackerPorches_SyntheticTwoBumps_FindsBothWithSizesAndEntrance', () => {
  const cfg = { ...BODENACKER6, houses: ['x', 'y'] };
  const p = bodenackerPorches(TWO_BUMPS, IDENTITY, cfg);
  assert.deepEqual(p.map(({ u, v0, v1, w, d, h }) => ({ u, v0, v1, w, d, h })),
    [{ u: -9.2, v0: 6, v1: 9, w: 2.4, d: 3, h: 3 }, { u: 10.8, v0: 6, v1: 9, w: 2.4, d: 3, h: 3 }]);
  assert.deepEqual(p[1].entrance, { x: 10.8, z: 9, th: Math.PI, w: 1.0 });       // on the street face (+v), walking in = -v
  assert.deepEqual(p.map(x => x.house), ['y', 'x']);                              // north (largest u) is the first house
});

test('bodenackerPorches_WrongCount_Throws', () => {
  assert.throws(() => bodenackerPorches(TWO_BUMPS, IDENTITY), /expected 4 porches, found 2/);
});

test('bodenackerBody_SyntheticTwoBumps_RingWithoutTheBumps', () => {
  const cfg = { ...BODENACKER6, houses: ['x', 'y'] };
  const porches = bodenackerPorches(TWO_BUMPS, IDENTITY, cfg);
  assert.deepEqual(bodenackerBody(TWO_BUMPS, IDENTITY, porches), [[-20, -6], [20, -6], [20, 6], [-20, 6]]);
});

const WORLD = new URL('../../data/world_hochrhein.json', import.meta.url);
const block = () => existsSync(WORLD) ? JSON.parse(readFileSync(WORLD, 'utf8')).buildings.find(b => b.id === BODENACKER6.id) : null;

test('bodenackerPorches_RealRing_FourPorchesNorthToSouth', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const b = block(), f = bodenackerFrame(b.rect), p = bodenackerPorches(b.ring, f);
  assert.deepEqual(p.map(x => x.house), ['6d', '6c', '6b', '6a']);            // sorted by u ascending; 6a at the north end (largest u)
  const us = p.map(x => x.u);
  [-23.2, -10.6, 4.3, 19.1].forEach((u, i) => assert.ok(Math.abs(us[i] - u) < 0.3, `porch ${i} at u ${us[i]}`));
  for (const x of p) { assert.ok(x.w > 2 && x.w < 3, `width ${x.w}`); assert.ok(x.d > 2.4 && x.d < 3.5, `depth ${x.d}`); }
  for (const x of p) { const [, v] = f.toLocal(x.entrance.x, x.entrance.z); assert.ok(near(v, x.v1, 1e-6), 'entrance on the tip face'); assert.ok(near(x.entrance.th, f.inTh)); }
});

test('bodenackerBody_RealRing_NoVertexBeyondTheFacadeLineAndFewerVertices', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const b = block(), f = bodenackerFrame(b.rect), p = bodenackerPorches(b.ring, f), body = bodenackerBody(b.ring, f, p);
  const simple = simplifyRing(b.ring.map(([x, z]) => f.toLocal(x, z))), facadeMax = Math.max(...p.map(x => x.v0));
  assert.ok(body.length < simple.length, `body ${body.length} vs ${simple.length}`);
  assert.ok(body.every(([, v]) => v <= facadeMax + 0.5), 'no porch bump left in the body ring');
});