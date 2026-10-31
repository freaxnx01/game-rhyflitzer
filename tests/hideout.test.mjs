// #102 / #201: the secret hideout in the Hübel and its cave system -- pure helpers. node --test tests/hideout.test.mjs
import { test } from 'node:test';
import { LIFT_TIMES } from '../lift.js';
import assert from 'node:assert/strict';
import { HIDEOUT, TUNNEL, CAVE, EIFFEL, TUNNEL_CEIL, hideoutAxis, axisCoords, floorAt, hideoutCuts, portalS, cavernR, inCavern, inHideout, segmentInHideout, ringStations, eiffelParts,
  nodeR, LIFT, onLiftPlatform, inCabin, liftDoor, nearLiftDoor, liftColliders, caveCuts, roomAt, corridorAt, caveRoofed, ringArcs, ceilingAt, linkPts, pointBounds } from '../hideout.js';
import { cutFloorAt, UNDERPASS } from '../world.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
// a hill like the probe: 75 m at the mouth, rising 0.5 m per metre along the axis, flat across it
const A = hideoutAxis();
const hill = (x, z) => { const { s } = axisCoords(x, z); return 75 + 0.5 * Math.max(0, s); };
// #201: a 150 m plateau over the whole system, 75 m at the mouth (the climb is over in the first 10 m)
const plateau = (x, z) => { const { s } = axisCoords(x, z); return 75 + 75 * Math.min(1, Math.max(0, s) / 10); };

test('TUNNEL: the agreed constants', () => {
  assert.deepEqual(TUNNEL, { ...UNDERPASS, grade: 0.05, maxDepth: 80 });
  assert.equal(HIDEOUT.key, 'mm.hideout');
});

test('hideoutAxis_RunsFromTheMouth105mAt95Degrees', () => {
  close(A.centre[0], -712.8, 0.1); close(A.centre[1], 1528.2, 0.1);
  assert.deepEqual(A.pts, [A.mouth, A.centre]);
});

test('axisCoords_SignedDistanceAlongAndOffTheAxis', () => {
  const p = axisCoords(A.mouth[0] + A.ux * 30 - A.uz * 4, A.mouth[1] + A.uz * 30 + A.ux * 4);
  close(p.s, 30); close(p.d, 4);
  close(axisCoords(A.mouth[0] - A.ux * 3, A.mouth[1] - A.uz * 3).s, -3, 1e-6, 'behind the mouth is negative');
});

test('floorAt_DescendsAtTheGradeAndIsLevelFromTheCavernsNearEdgeOn', () => {
  close(floorAt(0, 75), 75); close(floorAt(40, 75), 73);
  const flat = HIDEOUT.length - cavernR();   // 83 m: beyond it the floor is the cavern's, so the two never meet in a step
  close(floorAt(flat, 75), 75 - 0.05 * flat); close(floorAt(105, 75), 75 - 0.05 * flat); close(floorAt(140, 75), 75 - 0.05 * flat);
});

test('hideoutCuts_FloorMeetsTheGroundAtTheMouth', () => {
  const { tunnel, cavern, f0 } = hideoutCuts(hill);
  close(f0, 75 - 0.05 * (105 - cavernR()));
  close(cutFloorAt(tunnel, ...A.mouth, tunnel.u), 75, 1e-6, 'no step at the mouth');
  close(cutFloorAt(tunnel, A.mouth[0] + A.ux * 50, A.mouth[1] + A.uz * 50, tunnel.u), 72.5);
  assert.equal(cutFloorAt(tunnel, A.mouth[0] + A.ux * 50 + A.uz * 9, A.mouth[1] + A.uz * 50 - A.ux * 9, tunnel.u), null, '9 m off the axis is outside hw + margin + wall/2 = 6.5');
  assert.equal(cutFloorAt(tunnel, A.mouth[0] - A.ux * 9, A.mouth[1] - A.uz * 9, tunnel.u), null, 'the road side of the mouth is not cut');
  assert.deepEqual(tunnel.reach, [105, 0]);
  assert.equal(tunnel.u, TUNNEL); assert.equal(cavern.u, TUNNEL);
  assert.ok(tunnel.depth > 50 && cavern.depth > 50, 'deep at the centre');
  close(tunnel.x, A.centre[0]); close(tunnel.z, A.centre[1]);
});

test('hideoutCuts_HallIsAFlatDiscOfRadius25', () => {
  const { cavern, f0 } = hideoutCuts(hill), [cx, cz] = A.centre;
  for (const [dx, dz] of [[0, 0], [24, 0], [0, -24], [17, 17]]) close(cutFloorAt(cavern, cx + dx, cz + dz, cavern.u), f0, 1e-6, `${dx},${dz}`);
  assert.equal(cutFloorAt(cavern, cx + 26, cz, cavern.u), null);
  assert.equal(cavernR(), 25);
});

test('hideoutCuts_NoStepWhereTheTunnelOpensIntoTheCavern', () => {
  const { tunnel, cavern } = hideoutCuts(hill), low = (s) => {
    const x = A.mouth[0] + A.ux * s, z = A.mouth[1] + A.uz * s;
    return Math.min(...[tunnel, cavern].map(c => cutFloorAt(c, x, z, c.u) ?? Infinity));
  };
  for (let s = 0; s < HIDEOUT.length; s += 0.5) assert.ok(low(s) - low(s + 0.5) <= 0.05 * 0.5 + 1e-9, `step at s = ${s}: ${low(s)} -> ${low(s + 0.5)}`);
  close(low(HIDEOUT.length), cavern.f0);
});

test('CAVE_IsTheGateTunnelAndTheLiftHallOnly', () => {
  assert.deepEqual(Object.keys(CAVE.nodes), ['hall']); assert.deepEqual(CAVE.links, []); assert.deepEqual(CAVE.stubs, []);
  close(CAVE.nodes.hall.c[0], A.centre[0], 0.1); close(CAVE.nodes.hall.c[1], A.centre[1], 0.1);
  assert.equal(nodeR(CAVE.nodes.hall), 25); assert.equal(nodeR(CAVE.nodes.hall), cavernR()); assert.equal(CAVE.nodes.hall.ceiling, 'lid');
  assert.equal(EIFFEL.h, 330); assert.equal(EIFFEL.feet.length, 4);
});

test('caveCuts_T1AndTheHallOnOneFloor', () => {
  const { cuts, f0 } = caveCuts(plateau);
  assert.deepEqual(cuts.map(c => c.id), ['t1', 'hall']);
  close(cuts[1].f0, f0); assert.ok(cuts[1].depth > 70, `hall depth ${cuts[1].depth}`);
});

test('roomAt_corridorAt_caveRoofed_TheHall', () => {
  const [hx, hz] = CAVE.nodes.hall.c;
  assert.equal(roomAt(hx, hz), 'hall'); assert.equal(roomAt(hx + 24, hz), 'hall'); assert.equal(roomAt(hx + 30, hz), null);
  assert.equal(corridorAt(hx, hz), null, 'no corridors any more');
  assert.ok(caveRoofed(hx, hz, 10)); assert.ok(!caveRoofed(hx + 300, hz, 10));
  assert.ok(caveRoofed(A.mouth[0] + A.ux * 50, A.mouth[1] + A.uz * 50, 10)); assert.ok(!caveRoofed(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, 10), 'the open trench');
});

test('inHideout_IsTheOpenTrenchAndT1Only', () => {
  const [cx, cz] = A.centre;
  assert.ok(inHideout(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5), 'trees stay out of the trench');
  assert.ok(!inHideout(A.mouth[0] - A.ux * 6, A.mouth[1] - A.uz * 6), 'the road before the mouth');
  assert.ok(!inHideout(cx, cz), 'forest stands on the lid over R0');
  assert.ok(inCavern(cx + 24, cz)); assert.ok(!inCavern(cx + 26, cz)); assert.ok(inCavern(cx + 26, cz, 2));
});

test('segmentInHideout_AForestEdgeAcrossTheTrench', () => {
  const mx = A.mouth[0] + A.ux * 5, mz = A.mouth[1] + A.uz * 5;
  // a 6 m wall straight across the trench, its ends 3 m either side of the axis
  assert.ok(segmentInHideout(mx - A.uz * 3, mz + A.ux * 3, mx + A.uz * 3, mz - A.ux * 3));
  // a 20 m wall whose ends are both outside the trench, but whose middle crosses it
  assert.ok(segmentInHideout(mx - A.uz * 12, mz + A.ux * 12, mx + A.uz * 12, mz - A.ux * 12), 'the middle counts, not only the ends');
  assert.ok(!segmentInHideout(A.centre[0] + 40, A.centre[1], A.centre[0] + 50, A.centre[1]), 'well off the hill');
  assert.ok(!segmentInHideout(A.mouth[0] - A.ux * 20 - 5, A.mouth[1] - A.uz * 20, A.mouth[0] - A.ux * 20 + 5, A.mouth[1] - A.uz * 20), 'across the road, 20 m before the mouth');
});

test('ringArcs_TheHallOpensOnlyTowardsT1', () => {
  const arcs = ringArcs('hall'), R = nodeR(CAVE.nodes.hall) - TUNNEL.wall / 2;
  assert.equal(arcs.length, 1);
  const gap = 2 * Math.PI - (arcs[0].a1 - arcs[0].a0); close(gap, 2 * Math.asin((HIDEOUT.hw + TUNNEL.margin + TUNNEL.wall) / R), 1e-9);
  const mid = (arcs[0].a1 + arcs[0].a0) / 2 + Math.PI;   // the middle of the opening
  close(Math.cos(mid), Math.cos(HIDEOUT.heading + Math.PI), 1e-9); close(Math.sin(mid), Math.sin(HIDEOUT.heading + Math.PI), 1e-9);
});

test('portalS_FirstWholeMetreWhereTheTrenchIsRoofDepthDeep', () => {
  assert.equal(portalS(hill), 10, '0.55 m of depth per metre: 5.5 m at s = 10');
  assert.equal(portalS(() => 0), HIDEOUT.length, 'a flat hill never roofs: the portal sits at the end');
});

test('ceilingAt_T1CappedHallIsTheHill', () => {
  const [hx, hz] = CAVE.nodes.hall.c;
  close(ceilingAt(hx, hz, plateau, 10), 150 - 0.6, 1e-6, 'the hall keeps the hill');
  close(ceilingAt(A.mouth[0] + A.ux * 60, A.mouth[1] + A.uz * 60, plateau, 10), Math.min(150 - 0.6, floorAt(60, 75) + TUNNEL_CEIL), 1e-6, 'T1 capped');
  assert.equal(ceilingAt(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, plateau, 10), null, 'the open trench');
  assert.equal(ceilingAt(hx + 400, hz, plateau, 10), null);
});

test('ringStations_24TangentPiecesAroundTheCircle', () => {
  const r = ringStations(0, 0, 23, 24);
  assert.equal(r.length, 24);
  for (const s of r) { close(Math.hypot(s.x, s.z), 23); close(s.len, 2 * Math.PI * 23 / 24 + 0.05); close(Math.abs(Math.cos(s.rot) * s.x + Math.sin(s.rot) * s.z), 0, 1e-6, 'the long axis is tangent'); }
});

test('eiffelParts_33mTallFourLeggedAndSymmetric', () => {
  const parts = eiffelParts(33), legs = parts.filter(p => p.kind === 'leg' && p.r0 > 0.2);
  assert.equal(legs.length, 12, '4 legs x 3 segments');
  assert.equal(parts.filter(p => p.kind === 'leg' && p.r0 <= 0.2).length, 16, 'X braces: 2 per face on 2 storeys');
  assert.equal(parts.filter(p => p.kind === 'box').length, 3);
  assert.equal(parts.filter(p => p.kind === 'arch').length, 4);
  const spire = parts.find(p => p.kind === 'spire'); close(spire.y1, 33); close(spire.y0, 27.6);
  const feet = legs.filter(p => p.from[1] === 0).map(p => p.from); assert.equal(feet.length, 4);
  for (const f of feet) { close(Math.abs(f[0]), 6.25); close(Math.abs(f[2]), 6.25); }
  for (const p of parts) if (p.kind === 'leg') assert.ok(Math.max(Math.abs(p.from[0]), Math.abs(p.to[0]), Math.abs(p.from[2]), Math.abs(p.to[2])) <= 6.25 + 1e-9, 'inside the base square');
  const half = eiffelParts(16.5); close(half.find(p => p.kind === 'spire').y1, 16.5, 1e-6, 'scales with h');
});

test('eiffelParts_ScalesTo330AndStandsOnTheFeet', () => {
  const parts = eiffelParts(330, 50), spire = parts.find(p => p.kind === 'spire'); close(spire.y1, 330);
  const feet = parts.filter(p => p.kind === 'leg' && p.r0 > 2 && p.from[1] === 0).map(p => p.from); assert.equal(feet.length, 4);
  for (const f of feet) { close(Math.abs(f[0]), 50); close(Math.abs(f[2]), 50); }
  const first = parts.filter(p => p.kind === 'leg' && p.r0 > 2 && p.to[1] === 57); assert.equal(first.length, 4, 'the 1st floor is at 57 m');
});

test('caveRoofed_WithAPad_ReachesOverTheTroughWallsAndTheCutEdge', () => {
  const portal = 12, [cx, cz] = A.centre, at = (s, d) => [A.mouth[0] + A.ux * s - A.uz * d, A.mouth[1] + A.uz * s + A.ux * d];
  // the trough wall stands 5.5..7.5 m off the axis; the lid has to reach past its outer face and the cut's edge
  assert.ok(!caveRoofed(...at(50, 7), portal), 'unpadded: the outer half of the wall is not under the lid');
  for (const d of [7, 7.5, 8.4, -8.4]) assert.ok(caveRoofed(...at(50, d), portal, TUNNEL.wall), `padded, ${d} m off`);
  assert.ok(!caveRoofed(...at(50, 9), portal, TUNNEL.wall), 'the pad is 2 m, not more');
  assert.ok(!caveRoofed(...at(portal - 1, 0), portal, TUNNEL.wall), 'the open trench stays open');
  assert.ok(caveRoofed(cx + cavernR() + 3.9, cz, portal, TUNNEL.wall), 'and round the cavern');
  assert.ok(!caveRoofed(cx + cavernR() + 4.1, cz, portal, TUNNEL.wall));
});

test('pointBounds_HugeSyntheticArray_DoesNotOverflowTheStack', () => {
  const pts = Array.from({ length: 1_000_000 }, (_, i) => [i - 500000, (i % 1000) - 3]);
  assert.deepEqual(pointBounds(pts), { x0: -500000, x1: 499999, z0: -3, z1: 996, n: 1_000_000 });
});

test('pointBounds_SmallArray_ReturnsTheExtent', () => {
  assert.deepEqual(pointBounds([[1, 5], [-2, 7], [3, -4]]), { x0: -2, x1: 3, z0: -4, z1: 7, n: 3 });
});

// #361: driving T1 into the lift hall, the lamps' light on the floor swells and fades gently: no hot spot to flare in and
// drop out of within a second (100 km/h is 28 m/s, so 1 m is two frames), and the lamps stay clear of the cabin overhead.
import { caveLamps, lampLight } from '../hideout.js';
test('caveLamps_AlongT1IntoTheHall_NoFlareAndNoJump_AndClearOfTheCabin', () => {
  const lamps = caveLamps(), n = Math.round(Math.hypot(A.centre[0] - A.mouth[0], A.centre[1] - A.mouth[1]) + 20);
  assert.equal(lamps.length, 2); for (const l of lamps) { assert.equal(l.room, 'hall'); assert.ok(!onLiftPlatform(l.x, l.z, 3), 'not over the cabin'); }
  let prev = null, peak = 0, worst = 1;
  for (let s = 0; s < n; s++) {
    const e = lampLight(lamps, A.mouth[0] + A.ux * s, A.mouth[1] + A.uz * s); peak = Math.max(peak, e);
    if (prev !== null && Math.max(prev, e) > 0.05) worst = Math.max(worst, Math.max(e, prev) / Math.max(1e-6, Math.min(e, prev)));
    prev = e;
  }
  assert.ok(peak <= 2.5, `hot spot ${peak}`); assert.ok(worst <= 1.25, `jump x${worst}`);
});

test('LIFT_StandsInTheHallOnT1sAxis_ACabinForAnArticulatedBus', () => {
  assert.deepEqual(LIFT.c, CAVE.nodes.hall.c); close(LIFT.th, HIDEOUT.heading, 1e-12);
  assert.ok(2 * LIFT.hd >= 18 + 2 && 2 * LIFT.hw >= 2.55 + 4, 'an 18 m bus fits with room to spare');
  assert.ok(LIFT.hd + LIFT.wall + 10 <= cavernR(), 'room to drive up to door A inside the hall');
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)];
  assert.ok(onLiftPlatform(LIFT.c[0] + f[0] * 10.9, LIFT.c[1] + f[1] * 10.9)); assert.ok(!onLiftPlatform(LIFT.c[0] + f[0] * 11.2, LIFT.c[1] + f[1] * 11.2));
  assert.ok(inCabin(LIFT.c[0] + f[0] * 1.9, LIFT.c[1] + f[1] * 1.9, 9), 'a bus (half length 9) centred within 2 m is fully inside');
  assert.ok(!inCabin(LIFT.c[0] + f[0] * 2.1, LIFT.c[1] + f[1] * 2.1, 9)); assert.ok(inCabin(LIFT.c[0] - f[1] * 3.9, LIFT.c[1] + f[0] * 3.9, 9), 'the width is not shrunk');
});

test('liftDoor_AFacesTheTunnelAbove_BFacesAwayBelow', () => {
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], a = liftDoor('top'), b = liftDoor('bottom');
  close(a.x, LIFT.c[0] - f[0] * LIFT.hd); close(a.z, LIFT.c[1] - f[1] * LIFT.hd); close(Math.cos(a.th), -f[0]); close(Math.sin(a.th), -f[1]);
  close(b.x, LIFT.c[0] + f[0] * LIFT.hd); close(b.z, LIFT.c[1] + f[1] * LIFT.hd); close(Math.cos(b.th), f[0]); close(Math.sin(b.th), f[1]);
  assert.ok(axisCoords(a.x, a.z).s < axisCoords(b.x, b.z).s, 'A is the end the car reaches first from the gate');
  assert.ok(nearLiftDoor(a.x - f[0] * 14.5, a.z - f[1] * 14.5, 'top')); assert.ok(!nearLiftDoor(a.x - f[0] * 15.5, a.z - f[1] * 15.5, 'top'));
  assert.ok(nearLiftDoor(...LIFT.c, 'top') && nearLiftDoor(...LIFT.c, 'bottom'), 'in the cabin counts as near');
  assert.ok(LIFT.door.hw * 2 >= 6 && LIFT.door.h >= 5);
});

test('nearLiftDoor_AFastCar_CountsAsNearEarlyEnoughForTheDoorToBeOpenWhenItArrives', () => {
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], a = liftDoor('top'), v = 75 / 3.6;
  const at = (d) => [a.x - f[0] * d, a.z - f[1] * d];
  assert.ok(nearLiftDoor(...at(v * LIFT_TIMES.open + 1), 'top', LIFT, v), 'at 75 km/h the door starts opening at least its opening time before the car reaches it');
  assert.ok(!nearLiftDoor(...at(v * LIFT_TIMES.open + 1), 'top', LIFT, 0), 'standing still that far away does not open it');
  assert.ok(!nearLiftDoor(...at(15.5), 'top'), 'without a speed the reach is unchanged');
});

test('liftColliders_TheWorkingDoorIsTheOnlyGap_TheOtherEndIsShut', () => {
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], v = [-f[1], f[0]], hit = (os, x, z) => os.some(o => { const dx = x - o.x, dz = z - o.z; return Math.abs(dx * o.c + dz * o.s) <= o.hw && Math.abs(-dx * o.s + dz * o.c) <= o.hd; });
  for (const level of ['top', 'bottom']) {
    const os = liftColliders(level, 70), solid = os.filter(o => !o.liftDoor), open = level === 'top' ? -1 : 1, end = LIFT.hd + LIFT.wall / 2;
    assert.ok(os.every(o => o.secret && o.h === 70 + LIFT.height), level);
    assert.equal(os.filter(o => o.liftDoor === level).length, 1, `${level}: one door panel`);
    const at = (a, b) => [LIFT.c[0] + f[0] * a + v[0] * b, LIFT.c[1] + f[1] * a + v[1] * b];
    assert.ok(!hit(solid, ...at(open * end, 0)) && !hit(solid, ...at(open * end, 2.9)), `${level}: the working door's opening is free without its panel`);
    assert.ok(hit(os, ...at(open * end, 0)), `${level}: the shut panel blocks it`);
    assert.ok(hit(solid, ...at(-open * end, 0)) && hit(solid, ...at(-open * end, 3.5)), `${level}: the other end is a wall`);
    assert.ok(hit(solid, ...at(0, LIFT.hw + LIFT.wall / 2)) && hit(solid, ...at(0, -(LIFT.hw + LIFT.wall / 2))), `${level}: side walls`);
    assert.ok(!hit(os, ...LIFT.c), 'the cabin floor is free');
  }
});

// the light fades in over the first CAVE_FADE m of the tunnel instead of switching at the portal
import { caveBlend, caveDepth, blendLook, CAVE_FADE } from '../hideout.js';
test('caveBlend_AlongTheTunnel_ContinuousMonotonicWithTheEndpoints', () => {
  assert.equal(caveBlend(-50), 0); assert.equal(caveBlend(0), 0); assert.equal(caveBlend(CAVE_FADE), 1); assert.equal(caveBlend(500), 1); assert.equal(caveBlend(Infinity), 1);
  let prev = 0;
  for (let d = -5; d <= CAVE_FADE + 5; d += 0.1) { const k = caveBlend(d); assert.ok(k >= prev - 1e-12, `monotonic at ${d}`); assert.ok(k - prev < 0.02, `no jump at ${d}: ${k - prev}`); prev = k; }
});
test('caveDepth_OnTheAxisStripAndInTheRooms_IsMetresPastThePortalOrDeep', () => {
  const a = hideoutAxis(), portal = 20, at = (s, side = 0) => [a.mouth[0] + a.ux * s - a.uz * side, a.mouth[1] + a.uz * s + a.ux * side];
  close(caveDepth(...at(portal + 12), portal), 12, 1e-6); close(caveDepth(...at(portal + 30), portal), 30, 1e-6);
  assert.ok(caveDepth(...CAVE.nodes.hall.c, portal) >= CAVE_FADE, 'the hall is fully dark');
});
test('blendLook_EndpointsAreTheTwoLooks_AndTheMiddleIsBetween', () => {
  const day = { fog: '#e8bd8c', density: 0.00094, hemi: 0.95, hemiSky: '#dfe8ff' }, cave = { fog: '#07080a', density: 0.0009, hemi: 0.55, hemiSky: '#5a6c8c' };
  assert.deepEqual(blendLook(day, cave, 0), day); assert.deepEqual(blendLook(day, cave, 1), cave);
  const m = blendLook(day, cave, 0.5); assert.ok(m.hemi < 0.95 && m.hemi > 0.55); assert.notEqual(m.fog, day.fog); assert.notEqual(m.fog, cave.fog);
});

// the hard switches (forest, shadow map, interior, labels) happen deep in the tunnel, with hysteresis, not at the portal
import { caveSwitch, CAVE_SWITCH_IN, CAVE_SWITCH_OUT } from '../hideout.js';
test('caveSwitch_NearThePortal_NeverFlipsEitherWay', () => {
  for (let d = -20; d < CAVE_SWITCH_OUT; d += 0.25) { assert.equal(caveSwitch(d, false), false, `in at ${d}`); assert.equal(caveSwitch(d, true), false, `out at ${d}`); }
  assert.ok(CAVE_SWITCH_OUT >= CAVE_FADE + 5 && CAVE_SWITCH_IN > CAVE_SWITCH_OUT, 'both thresholds lie where caveBlend is already 1');
});
test('caveSwitch_DrivingInAndOut_FlipsOnceEachWayAtTheDeepPoint', () => {
  let on = false, flips = [];
  for (let d = -10; d <= 90; d += 0.1) { const n = caveSwitch(d, on); if (n !== on) flips.push(['in', d]); on = n; }
  for (let d = 90; d >= -10; d -= 0.1) { const n = caveSwitch(d, on); if (n !== on) flips.push(['out', d]); on = n; }
  assert.deepEqual(flips.map(f => f[0]), ['in', 'out']);
  close(flips[0][1], CAVE_SWITCH_IN, 0.2); close(flips[1][1], CAVE_SWITCH_OUT, 0.2);
});
test('caveSwitch_JitterAroundTheThreshold_DoesNotFlicker', () => {
  let on = false, flips = 0;
  for (let i = 0; i < 400; i++) { const d = (CAVE_SWITCH_IN + CAVE_SWITCH_OUT) / 2 + Math.sin(i) * 1.5; const n = caveSwitch(d, on); if (n !== on) flips++; on = n; }
  assert.equal(flips, 0);
});
test('caveSwitch_InTheRoomsAndOutsideTheCave_IsOnOrOff', () => {
  assert.equal(caveSwitch(Infinity, false), true); assert.equal(caveSwitch(-Infinity, true), false);
});

// #379: the cave look (light, fog, sky, the hall's lamps, the portal veil) is one continuous function of the depth -- no boolean
// swap, so hovering anywhere never flickers; it is still day where the opening is near and fully cave before the hard switches
import { caveLookK, CAVE_LOOK_FADE } from '../hideout.js';
test('caveLookK_AlongTheTunnel_ContinuousMonotonicFromDayToCave', () => {
  const [d0, d1] = CAVE_LOOK_FADE;
  assert.equal(caveLookK(-Infinity), 0); assert.equal(caveLookK(-10), 0); assert.equal(caveLookK(d0), 0); assert.equal(caveLookK(d1), 1); assert.equal(caveLookK(Infinity), 1);
  assert.ok(d1 - d0 >= 20, 'a fade over 20+ m, not a step');
  let prev = 0;
  for (let d = -5; d <= 90; d += 0.25) { const k = caveLookK(d); assert.ok(k >= prev - 1e-12, `monotonic at ${d}`); assert.ok(k - prev < 0.03, `no jump at ${d}: ${k - prev}`); prev = k; }
});
test('caveLookK_AtTheOpeningAndAtTheHardSwitches_IsDayAndFullCave', () => {
  assert.equal(caveLookK(10), 0, 'standing 10 m in, the scene is still the day (the opening stays bright)');
  assert.equal(caveLookK(CAVE_SWITCH_OUT), 1); assert.equal(caveLookK(CAVE_SWITCH_IN), 1);   // the forest/shadow switches happen behind a full fade
});
