// #413: the Plattform Sisslerfeld -- frame, walkways, entrance. Run: node --test tests/plattform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stairHeadTarget, PLATTFORM, plattformFrame, facingToRoad, sectorPoly, stairTreads, plattformWalk, plattformEntrance, plattformYard, plattformCoreCollider, HOP, plattformHop, plattformHopLanding, coreSlats, roofRafters, SLAT, HANDRAIL } from '../plattform.js';
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

test('stairHeadTarget_FromTheFarSide_LeadsRoundTheRailNotThroughIt', () => {
  const f = plattformFrame(0, 0, 0), { core } = PLATTFORM;
  for (const phi of [300, 350, 0, 30]) {
    const t = phi * Math.PI / 180, at = [2.3 * Math.cos(t), 2.3 * Math.sin(t)], [x, z] = stairHeadTarget(f, ...at);
    assert.ok(Math.hypot(x, z) > core.r + WALKER.radius, `stays outside the rail at ${phi}`);
    const dx = x - at[0], dz = z - at[1], k = -(at[0] * dx + at[1] * dz) / (dx * dx + dz * dz), near = Math.hypot(at[0] + k * dx, at[1] + k * dz);
    assert.ok(k <= 0 || k >= 1 || near > core.r + WALKER.radius, `the line to it clears the rail at ${phi}, nearest ${near}`);
  }
});

test('stairHeadTarget_InViewOfTheGap_PointsAtIt_InTheOpening_AtTheFirstStepDown', () => {
  const f = plattformFrame(0, 0, 0), angle = ([x, z]) => (Math.atan2(z, x) * 180 / Math.PI + 360) % 360;
  const { deck, core, stair } = PLATTFORM;
  const t = 170 * Math.PI / 180, gap = stairHeadTarget(f, 2.3 * Math.cos(t), 2.3 * Math.sin(t));
  assert.ok(angle(gap) > (deck.railTo - 360) && angle(gap) < deck.railFrom, 'in the gap of the rail round the opening');
  assert.ok(Math.abs(Math.hypot(...gap) - core.r) < 1e-9);
  const step = stairHeadTarget(f, -0.5, 0.5), top = stairTreads().find(q => q.tag === `upper:${stair.upper.n - 1}`);
  assert.ok(angle(step) > top.from - 360 && angle(step) < top.to - 360, 'on the top flight piece below the deck level');
  assert.ok(Math.hypot(...step) < core.tread);
});

// #701: E at the door jumps to the deck, E on the deck by the stair opening jumps back down
const gapMid = (PLATTFORM.stair.austritt.from + PLATTFORM.stair.austritt.to) / 2;

test('plattformHop_AtTheDoorOnTheGround_IsUp', () => {
  const [x, z] = F.polar(0, PLATTFORM.entranceR);
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE }), 'up');
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE + 0.6 }), 'up', 'on the lowest steps');
});

test('plattformHop_FarFromTheDoorOrHighOnTheStair_IsNull', () => {
  const [fx, fz] = F.polar(0, PLATTFORM.entranceR + 4);
  assert.equal(plattformHop(F, BASE, { x: fx, z: fz, y: BASE }), null);
  const [x, z] = F.polar(0, PLATTFORM.entranceR);
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE + 3 }), null, 'mid-stair: walk');
});

test('plattformHop_OnTheDeckAtTheStairGap_IsDown', () => {
  const [x, z] = F.polar(gapMid, PLATTFORM.core.r + 1);
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE + PLATTFORM.deck.y }), 'down');
});

test('plattformHop_OnTheDeckFarFromTheGap_IsNull', () => {
  const [x, z] = F.polar(0, 5);   // the door-side corner area of the deck
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE + PLATTFORM.deck.y }), null);
});

test('plattformHopLanding_Up_StandsOnTheDeckBesideTheOpening', () => {
  const l = plattformHopLanding(F, BASE, 'up');
  assert.equal(l.y, BASE + PLATTFORM.deck.y);
  const r = Math.hypot(l.x - F.x, l.z - F.z);
  assert.ok(r > PLATTFORM.core.r + WALKER.radius, `clear of the opening, r=${r}`);
  assert.ok(Math.abs(walkwayFloor(W, l.x, l.z, l.y) - l.y) < 0.05, 'the deck slab is under the landing');
  assert.equal(plattformHop(F, BASE, l), 'down', 'a second E takes the walker straight back');
});

test('plattformHopLanding_Up_IsInsideTheTutorialViewpoint', () => {   // viewpoints.js: r 6, aboveGround 5
  const l = plattformHopLanding(F, BASE, 'up');
  assert.ok(Math.hypot(l.x - F.x, l.z - F.z) <= 6 && l.y >= BASE + 5);
});

// #855: the core as single spruce slats -- one per angle, door slats starting at the lintel, the rail range continuing as the parapet
test('coreSlats_72At5Deg_DoorSlatsStartAtLintel', () => {
  const s = coreSlats();
  assert.equal(s.length, 72);
  assert.ok(s.every((q, i) => near(q.phi, i * 5)));
  const door = s.filter(q => q.y0 > 0);
  assert.equal(door.length, 7);   // 345..360 and 0..15 deg, inclusive edges
  assert.ok(door.every(q => near(q.y0, 2.2)));
});

test('coreSlats_RailRange_ContinuesToUnderTheHandrail', () => {
  const s = coreSlats(), top = 5.735 + 1.1 - HANDRAIL.h;
  const parapet = s.filter(q => near(q.y1, top));
  assert.equal(parapet.length, 46);   // 230..355 and 0..95
  assert.ok(s.filter(q => near(q.y1, 5.735)).length === 26);
  assert.ok(s.find(q => near(q.phi, 100)).y1 === 5.735 && near(s.find(q => near(q.phi, 95)).y1, top));
});

// #855: the rafters under each roof face -- 15 per face, the middle one running to the apex line, the outer ones stopping short at the hip
test('roofRafters_15PerFace_RunFromEaveToHip', () => {
  const r = roofRafters(), ri = 12.10 / (2 * Math.sqrt(3));
  assert.equal(r.length, 45);
  for (const f of [0, 1, 2]) {
    const face = r.filter(q => q.face === f);
    assert.equal(face.length, 15);
    assert.ok(near(face[7].u, 0) && near(face[7].d, ri));          // the middle rafter reaches the apex line
    assert.ok(near(face[0].u, -5.6) && face[0].d > 0 && face[0].d < ri);
    assert.ok(face.every(q => Math.abs(q.u) <= 12.10 / 2));
  }
});

test('plattformHopLanding_Down_StandsOutsideTheDoorOnTheGround', () => {
  const l = plattformHopLanding(F, BASE, 'down');
  assert.equal(l.y, BASE);
  assert.equal(plattformHop(F, BASE, l), 'up', 'a second E takes the walker straight back up');
  assert.ok(Math.hypot(l.x - F.x, l.z - F.z) > PLATTFORM.core.r + WALKER.radius);
});
