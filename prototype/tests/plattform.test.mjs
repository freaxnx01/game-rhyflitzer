// #413: the Plattform Sisslerfeld -- frame, walkways, entrance. Run: node --test prototype/tests/plattform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATTFORM, plattformFrame, facingToRoad, sectorPoly, stairTreads, plattformWalk, plattformEntrance, plattformYard, plattformCoreCollider } from '../plattform.js';
import { walkwayFloor, walkwayCeiling, walkwayPush } from '../walkways.js';
import { colliderPush } from '../world.js';
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

const BASE = 100, F = plattformFrame(0, 0, 0.3), W = plattformWalk(F, BASE);

// walk the stair's centre line (r = 0.8), unrolled angle psi from the door to the end of the Austritt
function climb(walk, frame, base) {
  const ys = [];
  let y = base;
  for (let psi = 0; psi <= 950; psi += 2) {
    const [x, z] = frame.polar(psi % 360, 0.8), fl = walkwayFloor(walk, x, z, y);
    const next = fl === null ? base : fl;
    ys.push({ psi, y: next, prev: y, ceil: walkwayCeiling(walk, x, z, next) });
    y = next;
  }
  return ys;
}

test('plattformWalk_StairCentreLine_ClimbsFromTheDoorOntoTheDeck', () => {
  const path = climb(W, F, BASE);
  for (const p of path) {
    assert.ok(p.y - p.prev <= WALKER.stepUp + 1e-9, `step too high at psi ${p.psi}: ${p.prev} -> ${p.y}`);
    assert.ok(p.y >= p.prev - 1e-9, `drop at psi ${p.psi}: ${p.prev} -> ${p.y}`);
  }
  assert.ok(near(path.at(-1).y, BASE + PLATTFORM.deck.y), `ends at ${path.at(-1).y}`);
});

test('plattformWalk_StairCentreLine_HeadroomAtLeast1p7', () => {
  for (const p of climb(W, F, BASE)) if (p.ceil !== null) assert.ok(p.ceil - p.y >= 1.7 - 1e-9, `headroom ${(p.ceil - p.y).toFixed(2)} at psi ${p.psi}`);
});

test('plattformWalk_Deck_WalkableOutsideTheOpeningNotInIt', () => {
  const deckY = BASE + PLATTFORM.deck.y, [ox, oz] = F.toWorld(2.2, 0), [hx, hz] = F.polar(300, 1.0);
  assert.equal(walkwayFloor(W, ox, oz, deckY), deckY, 'deck at the base side');
  assert.notEqual(walkwayFloor(W, hx, hz, deckY), deckY, 'the opening over the lower flight is no deck');
});

test('plattformWalk_Parapet_PushesBackAtEveryEdgeMidpoint', () => {
  const deckY = BASE + PLATTFORM.deck.y, tri = F.triangle(PLATTFORM.deck.side);
  for (let i = 0; i < 3; i++) {
    const a = tri[i], b = tri[(i + 1) % 3], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    assert.ok(walkwayPush(W, mx, mz, deckY, WALKER.radius).length > 0, `edge ${i}`);
  }
});

test('plattformWalk_CoreRing_BlocksExceptAtTheDoor', () => {
  const [dx, dz] = F.polar(0, PLATTFORM.core.r), [wx, wz] = F.polar(180, PLATTFORM.core.r);
  assert.equal(walkwayPush(W, dx, dz, BASE, WALKER.radius).filter(h => h).length, 0, 'the door is open at ground level');
  assert.ok(walkwayPush(W, wx, wz, BASE, WALKER.radius).length > 0, 'the battens block');
});

test('plattformEntrance_OutsideTheDoorFacingIn', () => {
  const e = plattformEntrance(F), [dx, dz] = F.polar(0, PLATTFORM.entranceR);
  assert.ok(near(e.x, dx) && near(e.z, dz));
  assert.ok(near(Math.cos(e.th), -Math.cos(0.3)) && near(Math.sin(e.th), -Math.sin(0.3)), 'th points inward');
});

// #567: the core cylinder is one solid circle for the car; the walker skips it (carOnly) and keeps the walkway walls
test('plattformCoreCollider_Shape_CircleOverTheCoreUpToTheEaves', () => {
  const o = plattformCoreCollider(F, BASE);
  assert.ok(near(o.x, F.x) && near(o.z, F.z), 'centred on the central post');
  assert.equal(o.circle, PLATTFORM.core.r);
  assert.equal(o.hw, PLATTFORM.core.r);
  assert.equal(o.hd, PLATTFORM.core.r);
  assert.equal(o.h, BASE + PLATTFORM.roof.eaves);
  assert.equal(o.carOnly, true);
});

test('plattformCoreCollider_CarCircleAtTheDoor_PushedOutward', () => {
  const o = plattformCoreCollider(F, BASE), [x, z] = F.polar(0, PLATTFORM.core.r + 0.5), hit = colliderPush(o, x, z, 0.9);
  assert.ok(hit, 'the door gap does not let a car in');
  assert.ok(near(hit.pen, 0.4, 1e-9), `pen ${hit.pen}`);
  assert.ok(near(hit.wx, Math.cos(F.facing), 1e-9) && near(hit.wz, Math.sin(F.facing), 1e-9), 'pushed away from the centre');
});

test('plattformCoreCollider_CarCircleNearTheCentre_PushedPastTheRing', () => {
  const o = plattformCoreCollider(F, BASE), [x, z] = F.polar(120, 0.4), hit = colliderPush(o, x, z, 0.9);
  assert.ok(near(hit.pen, PLATTFORM.core.r + 0.9 - 0.4, 1e-9), `pen ${hit.pen}`);
});

test('plattformCoreCollider_CarCircleClearOfTheRing_NoHit', () => {
  const o = plattformCoreCollider(F, BASE), [x, z] = F.polar(240, PLATTFORM.core.r + 0.9 + 0.01);
  assert.equal(colliderPush(o, x, z, 0.9), null);
});

test('plattformYard_KslPlan_GravelRectAndSixParkingSpaces', () => {
  const y = plattformYard(plattformFrame(0, 0, 0));
  assert.equal(y.gravel.length, 4);
  const us = y.gravel.map(p => p[0]), vs = y.gravel.map(p => p[1]);   // facing 0: u = x, v = z
  assert.ok(near(Math.max(...us), PLATTFORM.yard.u1) && near(Math.min(...us), PLATTFORM.yard.u0));
  assert.ok(near(Math.max(...vs) - Math.min(...vs), 26), 'the yard is 26 m wide');
  assert.equal(y.parking.length, 6);
  for (const s of y.parking) assert.equal(s.length, 4);
});
