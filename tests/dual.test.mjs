import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUAL, dualPartners, dualEnds, dualProfileH, dualClip, fitRoad, roadFitAt, surfTriAt } from '../world.js';

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
// #1231: the A3 near Stein -- two one-way carriageways 11.4 m apart, each drawn 14 m wide, on profiles 0.6 m apart
const road = (id, pts, y, extra = {}) => ({ id, pts, w: 14, oneway: true, zp: Array(26).fill(y), zpLen: 100, zpFrom: 0, ...extra });
const east = () => road(1, [[0, 0], [100, 0]], 10);
const west = (z = 11.4, extra = {}) => road(2, [[100, z], [0, z]], 10.6, extra);

test('DUAL constants', () => { assert.deepEqual(DUAL, { cos: 0.9, fade: 2, grade: 0.06, taper: 24 }); });

test('dualPartners_pairsOverlappingOneWayCarriageways', () => {
  const a = east(), b = west(), m = dualPartners([a, b]);
  assert.deepEqual(m.get(a), [b]); assert.deepEqual(m.get(b), [a]);
});
test('dualPartners_leavesTwoWayRoadsBridgesCrossersAndFarRoadsAlone', () => {
  for (const b of [west(11.4, { oneway: false }), west(11.4, { bridge: true }), west(11.4, { zp: null }), west(20),
    road(2, [[50, -40], [50, 40]], 10.6), road(2, [[0, 11.4], [100, 11.4]], 10.6)]) assert.equal(dualPartners([east(), b]).size, 0);   // last: a slip lane, same direction
});

test('dualProfileH_isTheOwnProfileOnTheAxis', () => { close(dualProfileH(east(), [west()], 50, 0, 50, 0), 10); });
test('dualProfileH_isOnePlaneAcrossTheStrip_soARibbonQuadCarriesIt', () => {   // a ribbon has vertices only at its edges
  const a = east(), b = west(), h = (z) => dualProfileH(a, [b], 50, z, 50, Math.abs(z));
  close(h(-3), 10 - 0.6 * 3 / 11.4); close((h(-7) + h(7)) / 2, h(0));
});
test('dualProfileH_crossfallsLinearlyToThePartnersAxis', () => {
  const a = east(), b = west(), p = [b];
  close(dualProfileH(a, p, 50, 5.7, 50, 5.7), 10.3); close(dualProfileH(a, p, 50, 11.4, 50, 11.4), 10.6);
});
test('dualProfileH_bothCarriagewaysAgreeBetweenTheirAxes', () => {
  const a = east(), b = west();
  for (const z of [1, 4, 5.7, 9]) close(dualProfileH(a, [b], 30, z, 30, z), dualProfileH(b, [a], 30, z, 70, 11.4 - z));
});
test('dualProfileH_fadesOutOverDUALfadeOnceTheStripsNoLongerTouch', () => {
  const a = east();
  close(dualProfileH(a, [west(15)], 50, 7.5, 50, 7.5), 10 + 0.5 * 0.6 * 0.5);   // 1 m past touching (14 m): half the crossfall
  close(dualProfileH(a, [west(16)], 50, 8, 50, 8), 10);
});
test('dualProfileH_ignoresAPartnerPastItsEnd', () => {
  const a = east(), b = road(2, [[40, 11.4], [0, 11.4]], 10.6);
  close(dualProfileH(a, [b], 70, 5.7, 70, 5.7), 10);
});

test('dualClip_limitsTheSideFacingThePartnerToItsShareOfTheGap', () => {
  const a = east(), c = dualClip(a, [west()], 50, 0, 0, 1);   // n = +z, the right edge (p + n * hw) faces the partner
  close(c.r, 5.7); assert.equal(c.l, Infinity);
  const d = dualClip(a, [west()], 50, 0, 0, -1); close(d.l, 5.7); assert.equal(d.r, Infinity);
});
test('dualClip_leavesStripsThatDoNotOverlapWhole', () => {
  assert.deepEqual(dualClip(east(), [west(14.5)], 50, 0, 0, 1), { l: Infinity, r: Infinity });
});

test('roadFitAt_fitsTheBandToTheSharedCrossfall', () => {
  const a = east(), b = west(), f = fitRoad(a, () => 10.3, 1.6);
  f.at = (t, x, z, d) => dualProfileH(a, [b], x, z, t, d);
  close(roadFitAt([{ f, i: 0 }], 50, 4, 10.3, 1.6), dualProfileH(a, [b], 50, 4, 50, 4) - 10.3);
});

test('surfTriAt_endsAtAClippedStripsDrawnEdge', () => {   // the right side drawn only 5.7 m out of 7
  const sf = { pts: [[0, 0], [100, 0]], hw: 7, hl: [10, 10], hr: [11, 11], lim: { l: [7, 7], r: [5.7, 5.7] } };
  close(surfTriAt(sf, 50, 5.7), 10 + 12.7 / 14); assert.equal(surfTriAt(sf, 50, 6.5), null); close(surfTriAt(sf, 50, -6.9), 10 + 0.1 / 14);
});

test('dualProfileH_capsTheCrossfallAtDUALgradeWhereTheAxesConverge', () => {   // a merge: axes 2 m apart, profiles 0.6 m apart
  const a = east(), h = dualProfileH(a, [west(2)], 50, 7, 50, 7);
  close(h, 10 + 0.06 * 7);
});

// the crossfall tapers in over DUAL.taper metres from an open end: one where the pairing stops, not a joint between two
// paired ways -- else the tilt jumps within one 4 m ribbon step and the lift (#290) heaves the strip
const slopeAt = (a, mates, x, ends) => (dualProfileH(a, mates, x, 7, x - a.pts[0][0], 7, ends) - 10) / 7;
test('dualEnds_marksTheEndsThatJoinNoOtherPairedWay', () => {
  const a = east(), b1 = road(2, [[100, 11.4], [50, 11.4]], 10.6), b2 = road(3, [[50, 11.4], [0, 11.4]], 10.6), ends = dualEnds(dualPartners([a, b1, b2]));
  assert.deepEqual(ends.get(a), [true, true]); assert.deepEqual(ends.get(b1), [true, false]); assert.deepEqual(ends.get(b2), [false, true]);
});
test('dualProfileH_tapersTowardsThePartnersOpenEnd', () => {
  const a = road(1, [[-100, 0], [200, 0]], 10), b = road(2, [[100, 11.4], [30, 11.4]], 10.6), ends = dualEnds(dualPartners([a, b]));
  close(slopeAt(a, [b], 40, ends) / slopeAt(a, [b], 70, ends), 10 / 24); close(slopeAt(a, [b], 70, ends), 0.6 / 11.4);
});
test('dualProfileH_keepsTheFullCrossfallAcrossAJointOfPairedWays', () => {
  const a = road(1, [[-100, 0], [200, 0]], 10), b1 = road(2, [[100, 11.4], [50, 11.4]], 10.6), b2 = road(3, [[50, 11.4], [0, 11.4]], 10.6), ends = dualEnds(dualPartners([a, b1, b2]));
  close(slopeAt(a, [b1, b2], 50, ends), 0.6 / 11.4); close(slopeAt(a, [b1, b2], 52, ends), 0.6 / 11.4);
});
test('dualProfileH_tapersTowardsItsOwnOpenEnd', () => {
  const a = east(), b = road(2, [[150, 11.4], [-50, 11.4]], 10.6), ends = dualEnds(dualPartners([a, b]));
  close(slopeAt(a, [b], 6, ends), 0.6 / 11.4 * 6 / 24);
});
