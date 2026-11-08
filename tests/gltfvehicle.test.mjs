// #709: the bus floor, seen from inside. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorPlan, floorTriangles } from '../gltfvehicle.js';

const def = (floor) => ({ gltf: { id: 'bus', url: './assets/bus.glb', fallback: 'bus', ...(floor ? { floor } : {}) } });

test('floorPlan: none given gives null', () => {
  assert.equal(floorPlan(def(), ['Body', 'Plain_7']), null);
});
test('floorPlan: returns the floor the model has', () => {
  assert.deepEqual(floorPlan(def({ material: 'Plain_7', maxY: 0.4 }), ['Body', 'Plain_7']), { material: 'Plain_7', maxY: 0.4 });
});
test('floorPlan: a floor material the model lacks fails fast', () => {
  assert.throws(() => floorPlan(def({ material: 'Plain_7', maxY: 0.4 }), ['Body']), /Plain_7 missing/);
});

// four triangles: a low one facing down (the floor), the same one facing up, a high one facing down (the ceiling), a wall
const POS = [0, 0.2, 0, 1, 0.2, 0, 0, 0.2, 1,   0, 2.8, 0, 1, 2.8, 0, 0, 2.8, 1,   0, 0, 0, 0, 2, 0, 1, 0, 0];
test('floorTriangles_KeepsOnlyLowFacesThatPointDown', () => {
  const index = [0, 1, 2, 0, 2, 1, 3, 4, 5, 6, 7, 8];   // (0,1,2) winds to face down: (1,0,0) x (0,0,1) = (0,-1,0)
  assert.deepEqual([...floorTriangles(POS, index, 0.4)], [0, 1, 2]);
});
test('floorTriangles_NothingLowFacingDown_GivesNoFaces', () => {
  assert.equal(floorTriangles(POS, [0, 2, 1, 6, 7, 8], 0.4).length, 0);
});
