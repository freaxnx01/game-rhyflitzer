// #709: the bus floor, seen from inside. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorPlan, floorTriangles, archTriangles, floorFaces } from '../gltfvehicle.js';

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

// the wheel arches: faces round a wheel that look at the wheel (so away from the cabin) get a copy; the flank lining outside stays alone
const ARCH = { x: 0, y: 0.5, z: 1.12, r: 0.9, zMax: 1.24 };
const tri = (a, b, c) => [...a, ...b, ...c];
test('archTriangles_FacesLookingAtTheWheel_AreKept', () => {
  const top = tri([0, 1.1, 0.8], [0.3, 1.1, 0.8], [0, 1.1, 1.0]);          // normal (0,-1,0): the arch roof, over the wheel
  const wall = tri([0, 0.5, 0.9], [0.3, 0.5, 0.9], [0, 0.8, 0.9]);        // normal (0,0,1): the inboard wall, looking out at the wheel
  assert.deepEqual([...archTriangles([...top, ...wall], [0, 1, 2, 3, 4, 5], [ARCH])], [0, 1, 2, 3, 4, 5]);
});
test('archTriangles_FacesLookingAwayFromTheWheel_AreDropped', () => {
  const wall = tri([0, 0.5, 0.9], [0, 0.8, 0.9], [0.3, 0.5, 0.9]);        // normal (0,0,-1): looks into the cabin, drawn already
  assert.equal(archTriangles(wall, [0, 1, 2], [ARCH]).length, 0);
});
test('archTriangles_FlankLiningBeyondZMax_IsDropped', () => {
  const lining = tri([0, 0.5, 1.3], [0, 0.8, 1.3], [0.3, 0.5, 1.3]);      // normal (0,0,-1) at the flank, 1.3 > zMax: the #723 lining
  assert.equal(archTriangles(lining, [0, 1, 2], [ARCH]).length, 0);
});
test('archTriangles_FarFromTheWheel_IsDropped', () => {
  const far = tri([3, 1.1, 0.8], [3.3, 1.1, 0.8], [3, 1.1, 1.0]);
  assert.equal(archTriangles(far, [0, 1, 2], [ARCH]).length, 0);
});
test('archTriangles_OtherSide_MirrorsTheArch', () => {
  const wall = tri([0, 0.5, -0.9], [0, 0.8, -0.9], [0.3, 0.5, -0.9]);     // normal (0,0,-1): looks out at the wheel on the -z side
  assert.deepEqual([...archTriangles(wall, [0, 1, 2], [ARCH])], [0, 1, 2]);
});
test('floorFaces_FloorAndArchOverlap_NoFaceTwice', () => {
  const low = tri([0, 0.2, 0.8], [0.3, 0.2, 0.8], [0, 0.2, 1.0]);          // down-facing, below maxY: a floor face and, near the wheel, an arch face
  const wall = tri([0, 0.5, 0.9], [0.3, 0.5, 0.9], [0, 0.8, 0.9]);
  assert.deepEqual([...floorFaces([...low, ...wall], [0, 1, 2, 3, 4, 5], { maxY: 0.4, arches: [ARCH] })], [0, 1, 2, 3, 4, 5]);
});
test('floorFaces_NoArches_IsTheFloorAlone', () => {
  assert.deepEqual([...floorFaces(POS, [0, 1, 2, 0, 2, 1, 3, 4, 5, 6, 7, 8], { maxY: 0.4 })], [0, 1, 2]);
});
