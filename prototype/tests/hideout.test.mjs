// #102: the secret hideout in the Hübel -- pure helpers. node --test prototype/tests/hideout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIDEOUT, TUNNEL, hideoutAxis, axisCoords, floorAt, hideoutCuts, portalS, cavernR, inCavern, roofed, inHideout, ringStations, ringArc, eiffelParts } from '../hideout.js';
import { cutFloorAt, UNDERPASS } from '../world.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
// a hill like the probe: 75 m at the mouth, rising 0.5 m per metre along the axis, flat across it
const A = hideoutAxis();
const hill = (x, z) => { const { s } = axisCoords(x, z); return 75 + 0.5 * Math.max(0, s); };

test('HIDEOUT and TUNNEL: the agreed constants', () => {
  assert.deepEqual(HIDEOUT, { mouth: [-703.7, 1423.6], heading: 95 * Math.PI / 180, length: 105, hw: 4.5, grade: 0.05, cavernHw: 20, roofDepth: 5.5, towerH: 33, key: 'mm.hideout' });
  assert.deepEqual(TUNNEL, { ...UNDERPASS, grade: 0.05, maxDepth: 80 });
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

test('ringArc_LeavesTheCorridorOpenAndRingStationsFollowTheArc', () => {
  const arc = ringArc(), [cx, cz] = A.centre, d = (p) => axisCoords(p.x, p.z).d;
  close(arc.r, cavernR() - TUNNEL.wall / 2, 1e-9, 'the ring sits inside the cut edge, so its inner face hides the patch skirt');
  for (const end of [arc.a0, arc.a1]) close(Math.abs(axisCoords(cx + Math.cos(end) * arc.r, cz + Math.sin(end) * arc.r).d), HIDEOUT.hw + TUNNEL.margin + TUNNEL.wall, 1e-9, 'the arc ends at the corridor face');
  const r = ringStations(cx, cz, arc.r, 24, arc.a0, arc.a1);
  assert.equal(r.length, 24);
  for (const s of r) close(Math.hypot(s.x - cx, s.z - cz), arc.r);
  const toMouth = r.filter(s => axisCoords(s.x, s.z).s < HIDEOUT.length);   // the half the tunnel comes from
  assert.ok(toMouth.length >= 10 && toMouth.every(s => d(s) > HIDEOUT.hw + TUNNEL.margin + TUNNEL.wall), 'nothing in the doorway');
});

test('portalS_FirstWholeMetreWhereTheTrenchIsRoofDepthDeep', () => {
  assert.equal(portalS(hill), 10, '0.55 m of depth per metre: 5.5 m at s = 10');
  assert.equal(portalS(() => 0), HIDEOUT.length, 'a flat hill never roofs: the portal sits at the end');
});

test('inCavern_roofed_inHideout', () => {
  const [cx, cz] = A.centre, portal = 10;
  assert.ok(inCavern(cx + 21, cz)); assert.ok(!inCavern(cx + 23, cz)); assert.ok(inCavern(cx + 23, cz, 2));
  assert.ok(roofed(cx, cz, portal)); assert.ok(roofed(cx + 23, cz, portal), 'the ring wall is under the lid');
  assert.ok(roofed(A.mouth[0] + A.ux * 50, A.mouth[1] + A.uz * 50, portal));
  assert.ok(!roofed(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, portal), 'the open trench');
  assert.ok(!roofed(A.mouth[0] + A.ux * 50 + A.uz * 8, A.mouth[1] + A.uz * 50 - A.ux * 8, portal), '8 m off the axis is hillside');
  assert.ok(inHideout(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5), 'trees stay out of the trench');
  assert.ok(inHideout(cx + 25, cz)); assert.ok(!inHideout(cx + 27, cz)); assert.ok(!inHideout(A.mouth[0] - A.ux * 6, A.mouth[1] - A.uz * 6));
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
