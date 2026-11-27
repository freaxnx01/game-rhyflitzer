// #1248: vertical rays over drawn triangles and the road-vs-ground scan. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCAN, triangleIndex, topAt, roadProbes } from '../groundscan.js';

// a flat 20 x 20 m square at height h from two triangles, as a non-indexed position array (x, y, z per vertex)
const square = (h, x0 = 0, z0 = 0, s = 20) => [x0, h, z0, x0 + s, h, z0, x0, h, z0 + s, x0 + s, h, z0, x0 + s, h, z0 + s, x0, h, z0 + s];

test('SCAN_constants_matchTheSpec', () => {
  assert.deepEqual(SCAN, { step: 4, inset: 0.3, tol: 0.01, cell: 16, near: 12 });
});

test('topAt_pointInsideFlatSquare_returnsItsHeight', () => {
  const index = triangleIndex(new Float32Array(square(5)));
  assert.equal(topAt(index, 3, 7), 5);
  assert.equal(topAt(index, 19.5, 0.5), 5);
});

test('topAt_pointOutsideEveryTriangle_returnsNull', () => {
  const index = triangleIndex(new Float32Array(square(5)));
  assert.equal(topAt(index, 25, 5), null);
  assert.equal(topAt(index, -40, -40), null);
});

test('topAt_slopedTriangle_interpolatesBarycentrically', () => {
  const pos = new Float32Array([0, 0, 0, 10, 10, 0, 0, 20, 10]);   // y = x + 2z
  const index = triangleIndex(pos);
  assert.ok(Math.abs(topAt(index, 2, 3) - 8) < 1e-5);
});

test('topAt_twoStackedSurfaces_returnsTheHigherOne', () => {
  const index = triangleIndex(new Float32Array([...square(1), ...square(3)]));
  assert.equal(topAt(index, 10, 10), 3);
});

test('triangleIndex_indexedGeometry_readsCornersThroughTheIndex', () => {
  const pos = new Float32Array([0, 2, 0, 20, 2, 0, 0, 2, 20, 20, 2, 20]);
  const idx = new Uint32Array([0, 1, 2, 1, 3, 2]);
  assert.equal(topAt(triangleIndex(pos, idx), 15, 15), 2);
});

test('triangleIndex_triangleSpanningManyCells_isFoundInEachCell', () => {
  const index = triangleIndex(new Float32Array(square(4, -50, -50, 100)), null, 16);
  for (const [x, z] of [[-45, -45], [0, 0], [30, -20], [-20, 30]]) assert.equal(topAt(index, x, z), 4);
});

test('topAt_degenerateTriangle_isIgnored', () => {
  const index = triangleIndex(new Float32Array([0, 9, 0, 10, 9, 0, 20, 9, 0, ...square(1)]));
  assert.equal(topAt(index, 5, 0), 1);
});

const road = (pts, extra = {}) => ({ n: 'Hauptstrasse', cls: 'secondary', w: 6, bridge: false, pts, ...extra });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('roadProbes_straightRoad_probesEveryStepAtCentreAndBothEdges', () => {
  const probes = roadProbes([road([[0, 0], [10, 0]])], 4);
  assert.equal(probes.length, 9);   // stations 0, 4, 8
  const at4 = probes.filter((p) => near(p.x, 4));
  assert.deepEqual(at4.map((p) => p.side), ['centre', 'left', 'right']);
  assert.ok(near(at4[0].z, 0) && near(at4[1].z, -2.7) && near(at4[2].z, 2.7));   // w/2 - inset = 2.7
  assert.deepEqual({ n: at4[0].n, cls: at4[0].cls }, { n: 'Hauptstrasse', cls: 'secondary' });
});

test('roadProbes_stationsRunOnAcrossVertices', () => {
  const centres = roadProbes([road([[0, 0], [6, 0], [6, 6]])], 4).filter((p) => p.side === 'centre');
  assert.deepEqual(centres.map((p) => [p.x, p.z]), [[0, 0], [4, 0], [6, 2], [6, 6]]);
});

test('roadProbes_bridge_isSkipped', () => {
  assert.equal(roadProbes([road([[0, 0], [10, 0]], { bridge: true })]).length, 0);
});

test('roadProbes_zeroLengthSegment_isSkipped', () => {
  const centres = roadProbes([road([[0, 0], [0, 0], [8, 0]])], 4).filter((p) => p.side === 'centre');
  assert.deepEqual(centres.map((p) => p.x), [0, 4, 8]);
});

test('roadProbes_narrowerThanTwiceTheInset_keepsEdgesOnTheCentre', () => {
  const edges = roadProbes([road([[0, 0], [1, 0]], { w: 0.4 })]).filter((p) => p.side !== 'centre');
  assert.ok(edges.every((p) => near(p.z, 0)));
});
