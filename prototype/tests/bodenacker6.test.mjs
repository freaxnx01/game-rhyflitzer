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