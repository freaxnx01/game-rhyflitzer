import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tlmProfile, bridgeDeckAt, bridgeSurfaceAt, bridgeDeckOffset, DECK_OFFSET, tlmUnderAt, tlmFloorTarget, fineWeight, FINE_BANK, profileY, UNDERPASS, TLM_RAIL_TOP, TLM_CLEAR_MIN, TLM_FINE, TLM_UNDER_REACH } from '../world.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('tlm constants', () => {
  assert.equal(TLM_RAIL_TOP, 0.3); assert.equal(TLM_CLEAR_MIN, 3.0); assert.equal(TLM_UNDER_REACH, 8);
  assert.deepEqual(TLM_FINE, { inner: 16, outer: 28, r: 4 });
});
test('tlmProfile_pinsEnds_andKeepsMiddle', () => {
  const p = tlmProfile([[0, 5], [10, 5], [20, 5], [30, 5], [40, 5]], 40, 3, 4);
  assert.equal(p[0][0], 0); assert.equal(p[0][1], 3); assert.equal(p.at(-1)[0], 40); assert.equal(p.at(-1)[1], 4);
  close(profileY(p, 20), 5); close(profileY(p, 8), 5); close(profileY(p, 32), 5);
});
test('tlmProfile_shortDeck_blendIsQuarter', () => {
  const p = tlmProfile([[0, 5], [4, 5], [8, 5], [12, 5], [16, 5]], 16, 3, 3);
  close(profileY(p, 4), 5); close(profileY(p, 12), 5); close(profileY(p, 2), 4);
});
test('tlmProfile_gapInSamples_interpolates', () => {
  const p = tlmProfile([[30, 6], [0, 2], [10, 4], [40, 8]], 40, 2, 8);
  const y = profileY(p, 20); assert.ok(y > 4 && y < 6, String(y));
  assert.deepEqual(p.map(q => q[0]), [...p.map(q => q[0])].sort((a, b) => a - b));
});
test('bridgeSurfaceAt_withProf_followsProfile', () => {
  const b = { len: 20, prof: [[0, 1], [20, 3]] };
  close(bridgeSurfaceAt(b, 10), 2); close(bridgeDeckAt(b, 10), 2 - DECK_OFFSET);
});
test('bridgeSurfaceAt_withoutProf_unchanged', () => {
  const b = { len: 20, h0: 1, h1: 3 };
  close(bridgeDeckAt(b, 10), 2); close(bridgeSurfaceAt(b, 10), 2 + bridgeDeckOffset(b, 10)); close(bridgeSurfaceAt(b, 10), 2.3);
});
test('tlmUnderAt_twoCandidates_picksNearestRoad', () => {
  assert.equal(tlmUnderAt([[3, 0, 4, 'road'], [6, 0, 9, 'road'], [1, 0, 7, 'rail']], 0, 0), 4);
});
test('tlmUnderAt_beyondReach_null', () => {
  assert.equal(tlmUnderAt([[9, 0, 4, 'road']], 0, 0), null);
  assert.equal(tlmUnderAt([], 0, 0), null);
});
test('tlmFloorTarget_realRoadWins', () => {
  close(tlmFloorTarget(30, 20, 21), 20 - 0.04);
});
test('tlmFloorTarget_lowUnderpass_keepsClearMin', () => {
  close(tlmFloorTarget(24, 21, 10), 24 - 1.2 - 3.0 - 0.04);
});
test('fineWeight_perCentreRadii', () => {
  const c = [{ x: 0, z: 0, inner: 16, outer: 28 }];
  assert.equal(fineWeight(10, 0, c), 1); assert.equal(fineWeight(30, 0, c), 0);
  assert.equal(fineWeight(40, 0, [[0, 0]]), 1); assert.equal(fineWeight(FINE_BANK.outer, 0, [[0, 0]]), 0);
});
test('fineCells_objectCentres_useOwnOuter', async () => {
  const { fineCells } = await import('../world.js');
  const G = { x0: 0, z0: 0, dx: 16, dz: 16, nx: 20, nz: 20 };
  const small = fineCells([{ x: 160, z: 160, inner: 16, outer: 28 }], G);
  const big = fineCells([{ x: 160, z: 160, inner: 48, outer: 72 }], G);
  assert.ok(small.length > 0 && small.length < big.length, `${small.length} vs ${big.length}`);
  assert.deepEqual(fineCells([[160, 160]], G), big);
  const both = fineCells([{ x: 160, z: 160, inner: 16, outer: 28 }, [160, 160]], G, 72);
  const key = (a) => a.map(String).sort();
  assert.deepEqual(key(both), key(big));
});
test('roadwayGround_takesTheHighestPointAcrossTheCarriageway', async () => {
  const { roadwayGround } = await import('../world.js');
  const pts = [[0, 0], [0, 100]];                       // a road along +z; the ground rises 0.5 m per m to +x
  const ground = (x) => 10 + 0.5 * x;
  close(roadwayGround(ground, pts, 40, 3), 11.5);       // the +x edge, 3 m off the centre line
  close(roadwayGround((x, z) => 10 + 0.1 * z, pts, 40, 3), 14);   // flat across: the centre line's own height
});
