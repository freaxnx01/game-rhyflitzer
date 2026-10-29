// #413: the Plattform Sisslerfeld -- frame, walkways, entrance. Run: node --test prototype/tests/plattform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATTFORM, plattformFrame, facingToRoad, sectorPoly, stairTreads } from '../plattform.js';
import { walkwayFloor, walkwayCeiling, walkwayPush } from '../walkways.js';
import { WALKER } from '../foot.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('facingToRoad_RoadToTheNorth_PointsNorth', () => {
  const th = facingToRoad(0, 0, [[[-50, -20], [50, -20]]]);
  assert.ok(near(th, -Math.PI / 2), `heading ${th}`);
});

test('facingToRoad_NoRoads_Throws', () => {
  assert.throws(() => facingToRoad(0, 0, []), /no road/);
});

test('plattformFrame_Triangle_EquilateralOnTheCentroidBaseTowardFacing', () => {
  const f = plattformFrame(10, 20, 0), tri = f.triangle(6);
  const side = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) assert.ok(near(side(tri[a], tri[b]), 6, 1e-9));
  const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cz = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
  assert.ok(near(cx, 10) && near(cz, 20), 'centroid at the anchor');
  assert.ok(tri[0][0] > 10 && tri[1][0] > 10 && tri[2][0] < 10, 'base edge on the facing (+x) side, apex behind');
});

test('plattformFrame_Polar_ClockwiseFromAbove', () => {
  const f = plattformFrame(0, 0, 0), [x, z] = f.polar(90, 1);
  assert.ok(near(x, 0) && near(z, 1), '90 deg turns from +x to +z');
});

test('stairTreads_Heights_MatchThePlan', () => {
  const t = stairTreads();
  const by = (tag) => t.find(q => q.tag === tag);
  assert.equal(t.filter(q => q.tag.startsWith('lower:')).length, 17);
  assert.equal(t.filter(q => q.tag.startsWith('upper:')).length, 17);
  assert.ok(near(by('lower:0').y, 0.075) && near(by('lower:16').y, 2.635));
  assert.ok(near(by('podest').y, 2.795) && near(by('upper:0').y, 2.955) && near(by('upper:16').y, 5.515));
  assert.ok(near(by('exit').y, 5.675) && near(by('austritt').y, PLATTFORM.deck.y));
});
