import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALKER, stepFoot } from '../foot.js';
import { WALKWAY, emptyWalkways, inPoly, rampY, walkwayFloor, walkwayCeiling, headBump, wallActive, walkwayPush } from '../walkways.js';

const rect = (o) => ({ x: 0, z: 0, hw: 2, hd: 2, c: 1, s: 0, ...o });
const set = (o) => ({ ...emptyWalkways(), ...o });
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('inPoly_PointsInsideAndOutsideAnLShape_FollowTheEvenOddRule', () => {
  const L = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
  assert.equal(inPoly(L, 1, 1), true);
  assert.equal(inPoly(L, 1, 3), true);
  assert.equal(inPoly(L, 3, 3), false);
  assert.equal(inPoly(L, -1, 1), false);
});

test('rampY_AlongTheHeading_RisesLinearlyFromY0ToY1', () => {
  const r = rect({ hw: 2, y0: 10, y1: 12 });
  close(rampY(r, -2, 0), 10); close(rampY(r, 0, 0), 11); close(rampY(r, 2, 0), 12);
  assert.equal(rampY(r, 2.1, 0), null);
  assert.equal(rampY(r, 0, 2.1), null);
});

test('rampY_RotatedRamp_UsesItsOwnHeading', () => {
  const r = { x: 5, z: 5, hw: 2, hd: 1, c: 0, s: 1, y0: 0, y1: 4 };   // heads +z
  close(rampY(r, 5, 5), 2); close(rampY(r, 5, 7), 4); close(rampY(r, 5, 3), 0);
});

test('walkwayFloor_SlabWithinStepUp_IsTheFloorAndOneTooHighIsNot', () => {
  const walk = set({ slabs: [rect({ y: 3 })] });
  assert.equal(walkwayFloor(walk, 0, 0, 3), 3);
  assert.equal(walkwayFloor(walk, 0, 0, 3 - WALKER.stepUp), 3);
  assert.equal(walkwayFloor(walk, 0, 0, 3 - WALKER.stepUp - 0.01), null, 'the storey above is out of reach');
  assert.equal(walkwayFloor(walk, 5, 5, 3), null, 'outside the footprint');
});

test('walkwayFloor_TwoStoreysStacked_PicksTheOneUnderTheFeet', () => {
  const walk = set({ slabs: [rect({ y: 0 }), rect({ y: 2.53 }), rect({ y: 5.06 })] });
  assert.equal(walkwayFloor(walk, 0, 0, 2.53), 2.53);
  assert.equal(walkwayFloor(walk, 0, 0, 2.6), 2.53);
  assert.equal(walkwayFloor(walk, 0, 0, 10), 5.06);
});

test('walkwayFloor_SlabHole_IsNotFloor', () => {
  const walk = set({ slabs: [rect({ y: 3, holes: [rect({ x: 1, hw: 0.5, hd: 0.5 })] })] });
  assert.equal(walkwayFloor(walk, 1, 0, 3), null);
  assert.equal(walkwayFloor(walk, -1, 0, 3), 3);
});

test('walkwayFloor_PolygonSlab_UsesThePolygon', () => {
  const walk = set({ slabs: [{ poly: [[0, 0], [4, 0], [4, 2], [0, 2]], y: 7 }] });
  assert.equal(walkwayFloor(walk, 1, 1, 7), 7);
  assert.equal(walkwayFloor(walk, 1, 3, 7), null);
});

test('stepFoot_WalkingUpARamp_FollowsItsSurface', () => {
  const walk = set({ ramps: [rect({ x: 5, hw: 5, hd: 1, y0: 0, y1: 2.5 })] });
  const floorAt = (x, z, y) => walkwayFloor(walk, x, z, y) ?? 0;
  let s = { x: 0.5, z: 0, y: 0, th: 0, vy: 0, hover: false };
  for (let i = 0; i < 90; i++) s = stepFoot(s, { fwd: 1, side: 0, turn: 0, lift: 0, nitro: 0 }, 1 / 60, floorAt);
  assert.ok(s.x > 6.5, `walked ${s.x}`);
  close(s.y, rampY(walk.ramps[0], s.x, s.z), 1e-6);
  assert.equal(s.vy, 0, 'grounded on the slope');
});

test('walkwayCeiling_StoreyAbove_IsItsUndersideAndOwnFloorNever', () => {
  const walk = set({ slabs: [rect({ y: 0 }), rect({ y: 2.53 })] });
  close(walkwayCeiling(walk, 0, 0, 0), 2.53 - WALKWAY.thick);
  assert.equal(walkwayCeiling(walk, 0, 0, 2.53), null, 'nothing above the top storey');
  assert.equal(walkwayCeiling(walk, 9, 9, 0), null, 'outside the footprint');
});

test('walkwayCeiling_ExplicitCeiling_Counts', () => {
  const walk = set({ ceilings: [rect({ y: 5 })] });
  assert.equal(walkwayCeiling(walk, 0, 0, 3), 5);
  assert.equal(walkwayCeiling(walk, 0, 0, 5), null);
});

test('walkwayCeiling_RampUnderside_IsACeilingBelowIt', () => {
  const walk = set({ ramps: [rect({ hw: 2, y0: 2.53, y1: 5.06 })] });
  close(walkwayCeiling(walk, 0, 0, 0), 3.795 - WALKWAY.thick);
});

test('headBump_JumpUnderACeiling_StopsTheRise', () => {
  const s = headBump({ y: 0.9, vy: 4 }, 0, 2.5);
  close(s.y, 2.5 - WALKWAY.head); assert.equal(s.vy, 0);
  assert.deepEqual(headBump({ y: 0, vy: 4 }, 0, 5), { y: 0, vy: 4 }, 'clear head');
  assert.deepEqual(headBump({ y: 0, vy: 4 }, 0, null), { y: 0, vy: 4 });
  assert.equal(headBump({ y: 0, vy: 0 }, 0, 1.5).y, 0, 'never pushed under the floor');
});

test('stepFoot_JumpUnderALowCeiling_NeverGoesThrough', () => {
  const walk = set({ slabs: [rect({ y: 0 }), rect({ y: 2.53 })] });
  const floorAt = (x, z, y) => walkwayFloor(walk, x, z, y) ?? 0;
  let s = { x: 0, z: 0, y: 0, th: 0, vy: 0, hover: false }, top = 0;
  for (let i = 0; i < 120; i++) {
    s = stepFoot(s, { fwd: 0, side: 0, turn: 0, lift: 1, nitro: 0 }, 1 / 60, floorAt);
    s = headBump(s, floorAt(s.x, s.z, s.y), walkwayCeiling(walk, s.x, s.z, s.y));
    top = Math.max(top, s.y);
  }
  assert.ok(top <= 2.53 - WALKWAY.thick - WALKWAY.head + 1e-9, `reached ${top}`);
});

test('wallActive_OnlyWhileTheBodyOverlapsTheRange', () => {
  const w = rect({ y0: 5, y1: 7.53 });
  assert.equal(wallActive(w, 5), true);
  assert.equal(wallActive(w, 7.53), false, 'standing on the next storey');
  assert.equal(wallActive(w, 5 - WALKWAY.head), false, 'standing a storey below, head just under the wall');
  assert.equal(wallActive({ ...w, off: true }, 5), false, 'an open door');
});

test('walkwayPush_WallOnOtherStorey_DoesNotPush', () => {
  const walk = set({ walls: [rect({ hw: 1, hd: 1, y0: 5, y1: 7.53 })] });
  assert.equal(walkwayPush(walk, 0, 0, 5, 0.35).length, 1);
  assert.equal(walkwayPush(walk, 0, 0, 2.47, 0.35).length, 0);
  assert.equal(walkwayPush(walk, 0, 0, 7.53, 0.35).length, 0);
});

test('walkwayPush_Pushed_AwayFromTheWall', () => {
  const walk = set({ walls: [rect({ x: 5, hw: 0.1, hd: 2, y0: 0, y1: 3 })] });
  const [hit] = walkwayPush(walk, 4.7, 0, 0, 0.35);
  assert.ok(hit.wx < 0 && hit.pen > 0);
});

test('walkwayFloor_SlabWithPolygonHole_NoFloorInTheHole', () => {
  const walk = { ...emptyWalkways(), slabs: [{ poly: [[-5, -5], [5, -5], [5, 5], [-5, 5]], holes: [{ poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }], y: 3 }] };
  assert.equal(walkwayFloor(walk, 0, 0, 3), null, 'inside the polygon hole');
  assert.equal(walkwayFloor(walk, 3, 0, 3), 3, 'on the slab');
});
