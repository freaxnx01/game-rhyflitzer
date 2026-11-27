// #1248: vertical rays over drawn triangles and the road-vs-ground scan. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCAN, triangleIndex, topAt } from '../groundscan.js';

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
