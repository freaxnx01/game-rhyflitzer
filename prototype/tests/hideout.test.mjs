// #102 / #201: the secret hideout in the Hübel and its cave system -- pure helpers. node --test prototype/tests/hideout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIDEOUT, TUNNEL, CAVE, EIFFEL, TUNNEL_CEIL, hideoutAxis, axisCoords, floorAt, hideoutCuts, portalS, cavernR, inCavern, inHideout, segmentInHideout, ringStations, eiffelParts,
  nodeR, caveCuts, roomAt, corridorAt, caveRoofed, ringArcs, ceilingAt, sightBlocked, linkPts, stubPts } from '../hideout.js';
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

test('hideoutCuts_CavernIsAFlatDiscOfRadius22', () => {
  const { cavern, f0 } = hideoutCuts(hill), [cx, cz] = A.centre;
  for (const [dx, dz] of [[0, 0], [21, 0], [0, -21], [15, 15]]) close(cavern.f0, f0), close(cutFloorAt(cavern, cx + dx, cz + dz, cavern.u), f0, 1e-6, `${dx},${dz}`);
  assert.equal(cutFloorAt(cavern, cx + 23, cz, cavern.u), null);
  assert.equal(cavernR(), 22);
});

test('hideoutCuts_NoStepWhereTheTunnelOpensIntoTheCavern', () => {
  const { tunnel, cavern } = hideoutCuts(hill), low = (s) => {
    const x = A.mouth[0] + A.ux * s, z = A.mouth[1] + A.uz * s;
    return Math.min(...[tunnel, cavern].map(c => cutFloorAt(c, x, z, c.u) ?? Infinity));
  };
  for (let s = 0; s < HIDEOUT.length; s += 0.5) assert.ok(low(s) - low(s + 0.5) <= 0.05 * 0.5 + 1e-9, `step at s = ${s}: ${low(s)} -> ${low(s + 0.5)}`);
  close(low(HIDEOUT.length), cavern.f0);
});

test('CAVE_LayoutIsTheSpecsSketch', () => {
  close(CAVE.nodes.r0.c[0], A.centre[0], 0.1); close(CAVE.nodes.r0.c[1], A.centre[1], 0.1);
  close(CAVE.nodes.n1.c[0], -802.5, 0.1); close(CAVE.nodes.n1.c[1], 1520.4, 0.1);
  assert.deepEqual(CAVE.nodes.hall.c, [-790, 1855]); assert.equal(nodeR(CAVE.nodes.hall), 170); assert.equal(nodeR(CAVE.nodes.r0), 22);
  assert.equal(nodeR(CAVE.nodes.r0), cavernR(), 'R0 is the #102 cavern');
  assert.equal(CAVE.nodes.hall.ceiling, 380); assert.equal(TUNNEL_CEIL, 12);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [a, b] of [['r0', 'n1'], ['r0', 'hall'], ['n1', 'hall']]) assert.ok(d(CAVE.nodes[a].c, CAVE.nodes[b].c) > nodeR(CAVE.nodes[a]) + nodeR(CAVE.nodes[b]) + 10, `${a}/${b} overlap`);
  assert.ok(CAVE.nodes.hall.c[1] + nodeR(CAVE.nodes.hall) + TUNNEL.wall < 2042, 'inside the ground grid');
  close(d(...linkPts(CAVE.links[0])), 90, 1e-6, 'T2a is 90 m');
  assert.ok(Math.abs(Math.atan2(linkPts(CAVE.links[1])[1][1] - linkPts(CAVE.links[1])[0][1], linkPts(CAVE.links[1])[1][0] - linkPts(CAVE.links[1])[0][0]) - 88 * Math.PI / 180) < 0.02, 'T2b heads south');
  assert.equal(EIFFEL.h, 330); assert.equal(EIFFEL.feet.length, 4);
});

test('caveCuts_EightLevelCutsOnOneFloor', () => {
  const { cuts, f0 } = caveCuts(plateau);
  close(f0, 75 - 0.05 * (105 - cavernR()), 1e-6, 'the floor is T1\'s');
  assert.deepEqual(cuts.map(c => c.id), ['t1', 'r0', 'n1', 't2a', 't2b', 'hall', 'stubE', 'stubW']);
  for (const c of cuts.slice(1)) { assert.equal(c.f0, f0, c.id); assert.equal(c.u, TUNNEL, c.id); assert.ok(c.depth > 70, `${c.id} depth ${c.depth}`); assert.ok(c.roundEnds, c.id); }
  const [hx, hz] = CAVE.nodes.hall.c, hall = cuts.find(c => c.id === 'hall');
  for (const r of [0, 100, 169]) close(cutFloorAt(hall, hx + r, hz, TUNNEL), f0, 1e-6, `hall r ${r}`);
  assert.equal(cutFloorAt(hall, hx + 171, hz, TUNNEL), null);
  const t2b = cuts.find(c => c.id === 't2b'), [px, pz] = linkPts(CAVE.links[1])[0];
  close(cutFloorAt(t2b, px, pz, TUNNEL), f0, 1e-6, 'T2b starts level'); close(cutFloorAt(t2b, (px + hx) / 2, (pz + hz) / 2, TUNNEL), f0, 1e-6, 'level along T2b');
  assert.equal(cutFloorAt(t2b, (px + hx) / 2 + 12, (pz + hz) / 2, TUNNEL), null, '12 m off T2b is rock');
  const stub = cuts.find(c => c.id === 'stubE'), [sx, sz] = stubPts(CAVE.stubs[0])[1];
  close(cutFloorAt(stub, sx, sz, TUNNEL), f0, 1e-6, 'the stub ends level');
});

test('roomAt_corridorAt_caveRoofed', () => {
  const [hx, hz] = CAVE.nodes.hall.c, [rx, rz] = CAVE.nodes.r0.c;
  assert.equal(roomAt(hx, hz), 'hall'); assert.equal(roomAt(hx + 169, hz), 'hall'); assert.equal(roomAt(hx + 175, hz), null); assert.equal(roomAt(hx + 175, hz, 6), 'hall');
  assert.equal(roomAt(rx, rz), 'r0'); assert.equal(roomAt(...CAVE.nodes.n1.c), 'n1');
  const [p, q] = linkPts(CAVE.links[0]), mid = (p[0] + q[0]) / 2, midz = (p[1] + q[1]) / 2;
  assert.equal(corridorAt(mid, midz).id, 't2a'); close(corridorAt(mid, midz).s, 45, 0.01); assert.equal(corridorAt(mid, midz + 12), null, '12 m off T2a is rock');
  assert.equal(corridorAt(...stubPts(CAVE.stubs[0])[1]).id, 'stubE');
  assert.equal(corridorAt(...stubPts(CAVE.stubs[1])[1]).id, 'stubW');
  assert.ok(caveRoofed(hx, hz, 10)); assert.ok(caveRoofed(mid, midz, 10)); assert.ok(!caveRoofed(hx + 300, hz, 10));
  assert.ok(caveRoofed(hx + 171, hz, 10), 'the hall\'s cut edge is under the lid'); assert.ok(caveRoofed(hx + 173.9, hz, 10, TUNNEL.wall), 'padded'); assert.ok(!caveRoofed(hx + 173, hz, 10));
  assert.ok(caveRoofed(A.mouth[0] + A.ux * 50, A.mouth[1] + A.uz * 50, 10)); assert.ok(!caveRoofed(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, 10), 'the open trench');
  assert.ok(!caveRoofed(A.mouth[0] + A.ux * 50 + A.uz * 8, A.mouth[1] + A.uz * 50 - A.ux * 8, 10), '8 m off T1\'s axis is hillside');
});

test('inHideout_IsTheOpenTrenchAndT1Only', () => {
  const [cx, cz] = A.centre;
  assert.ok(inHideout(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5), 'trees stay out of the trench');
  assert.ok(!inHideout(A.mouth[0] - A.ux * 6, A.mouth[1] - A.uz * 6), 'the road before the mouth');
  assert.ok(!inHideout(cx, cz), 'forest stands on the lid over R0'); assert.ok(!inHideout(...CAVE.nodes.hall.c)); assert.ok(!inHideout(...CAVE.nodes.n1.c));
  assert.ok(!segmentInHideout(CAVE.nodes.hall.c[0] - 5, CAVE.nodes.hall.c[1], CAVE.nodes.hall.c[0] + 5, CAVE.nodes.hall.c[1]), 'a forest edge over the hall stays');
  assert.ok(inCavern(cx + 21, cz)); assert.ok(!inCavern(cx + 23, cz)); assert.ok(inCavern(cx + 23, cz, 2));
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

test('ringArcs_LeaveEveryExitOpen', () => {
  const r0 = ringArcs('r0'), n1 = ringArcs('n1'), hall = ringArcs('hall');
  assert.equal(r0.length, 3); assert.equal(n1.length, 3); assert.equal(hall.length, 1);
  const total = r0.reduce((s, a) => s + a.a1 - a.a0, 0); assert.ok(total < 2 * Math.PI && total > Math.PI, 'three openings in R0');
  // T1's doorway: the arc ends on R0's ring are off T1's axis by the corridor's outer face
  const R = nodeR(CAVE.nodes.r0) - TUNNEL.wall / 2, ends = r0.flatMap(a => [a.a0, a.a1]).map(a => axisCoords(A.centre[0] + Math.cos(a) * R, A.centre[1] + Math.sin(a) * R));
  assert.ok(ends.some(e => Math.abs(e.d - (HIDEOUT.hw + TUNNEL.margin + TUNNEL.wall)) < 1e-6 && e.s < HIDEOUT.length), 'the ring opens towards T1');
  // nothing in any doorway: no arc point lies within the corridor half-width of an exit's axis
  for (const [id, arcs] of [['r0', r0], ['n1', n1], ['hall', hall]]) for (const a of arcs) for (let k = 0; k <= 20; k++) {
    const ang = a.a0 + (a.a1 - a.a0) * k / 20, n = CAVE.nodes[id], Rr = nodeR(n) - TUNNEL.wall / 2, x = n.c[0] + Math.cos(ang) * Rr, z = n.c[1] + Math.sin(ang) * Rr;
    assert.equal(corridorAt(x, z, -0.01), null, `${id} wall in a doorway at ${ang}`);
    if (id === 'r0') assert.ok(axisCoords(x, z).d > HIDEOUT.hw + TUNNEL.margin + TUNNEL.wall - 1e-6 || axisCoords(x, z).s > HIDEOUT.length, 'R0 wall in T1\'s doorway');
  }
  const st = ringStations(...CAVE.nodes.r0.c, R, 24, r0[0].a0, r0[0].a1);
  assert.equal(st.length, 24); for (const s of st) close(Math.hypot(s.x - CAVE.nodes.r0.c[0], s.z - CAVE.nodes.r0.c[1]), R);
});

test('portalS_FirstWholeMetreWhereTheTrenchIsRoofDepthDeep', () => {
  assert.equal(portalS(hill), 10, '0.55 m of depth per metre: 5.5 m at s = 10');
  assert.equal(portalS(() => 0), HIDEOUT.length, 'a flat hill never roofs: the portal sits at the end');
});

test('ceilingAt_TunnelsCappedRoomsLidHallHigh', () => {
  // 60 m down T2b from N1: in the corridor proper (its midpoint already lies inside the hall's disc)
  const f0 = caveCuts(plateau).f0, [p, q] = linkPts(CAVE.links[1]), len = Math.hypot(q[0] - p[0], q[1] - p[1]), mx = p[0] + (q[0] - p[0]) * 60 / len, mz = p[1] + (q[1] - p[1]) * 60 / len;
  assert.equal(roomAt(mx, mz, TUNNEL.wall), null); assert.equal(corridorAt(mx, mz).id, 't2b');
  close(ceilingAt(mx, mz, plateau, 10), f0 + TUNNEL_CEIL, 1e-6, 'T2b'); close(ceilingAt(...CAVE.nodes.hall.c, plateau, 10), f0 + 380, 1e-6, 'the hall');
  close(ceilingAt(...CAVE.nodes.r0.c, plateau, 10), 150 - 0.6, 1e-6, 'R0 keeps the hill'); close(ceilingAt(...CAVE.nodes.n1.c, plateau, 10), 150 - 0.6, 1e-6, 'N1 too');
  close(ceilingAt(...stubPts(CAVE.stubs[0])[1], plateau, 10), 150 - 0.6, 1e-6, 'a stub too');
  close(ceilingAt(A.mouth[0] + A.ux * 60, A.mouth[1] + A.uz * 60, plateau, 10), Math.min(150 - 0.6, floorAt(60, 75) + TUNNEL_CEIL), 1e-6, 'T1 capped too');
  close(ceilingAt(A.mouth[0] + A.ux * 11, A.mouth[1] + A.uz * 11, hill, 10), hill(A.mouth[0] + A.ux * 11, A.mouth[1] + A.uz * 11) - 0.6, 1e-6, 'a low lid stays the lid');
  assert.equal(ceilingAt(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, plateau, 10), null, 'the open trench');
  assert.equal(ceilingAt(CAVE.nodes.hall.c[0] + 400, CAVE.nodes.hall.c[1], plateau, 10), null);
});

test('sightBlocked_MouthToHall', () => {
  const [hx, hz] = CAVE.nodes.hall.c, R = nodeR(CAVE.nodes.hall), eyes = [], targets = [[hx, hz]];
  for (let d = -4.5; d <= 4.5; d += 1.125) eyes.push([A.mouth[0] - A.uz * d, A.mouth[1] + A.ux * d]);
  for (let k = 0; k < 36; k++) targets.push([hx + Math.cos(k / 36 * 2 * Math.PI) * R, hz + Math.sin(k / 36 * 2 * Math.PI) * R]);
  assert.equal(eyes.length, 9); assert.equal(targets.length, 37);
  for (const e of eyes) for (const t of targets) assert.ok(sightBlocked(e, t), `clear line from ${e} to ${t}`);
  assert.ok(!sightBlocked(A.mouth, CAVE.nodes.r0.c), 'R0 is in plain view from the mouth');
  assert.ok(!sightBlocked(CAVE.nodes.n1.c, [hx, hz]), 'the reveal: N1 looks straight at the tower');
  assert.ok(!sightBlocked(CAVE.nodes.r0.c, CAVE.nodes.n1.c), 'and R0 looks down T2a');
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
