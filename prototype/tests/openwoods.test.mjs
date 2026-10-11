// #214: clearWoods drops the wood a pinned point lies in. Pure: no DOM, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearWoods } from '../world.js';
import { REGIONS } from '../regions.js';

const SQUARE = { ring: [[0, 0], [10, 0], [10, 10], [0, 10]] };
const OTHER = { ring: [[100, 100], [110, 100], [110, 110], [100, 110]] };

test('clearWoods_PointInsideOnePolygon_DropsOnlyThatPolygon', () => {
  assert.deepEqual(clearWoods([SQUARE, OTHER], [[5, 5]]), [OTHER]);
});

test('clearWoods_SeveralPoints_DropsEachWoodTheyLieInAndNothingElse', () => {
  const THIRD = { ring: [[200, 200], [210, 200], [210, 210], [200, 210]] };
  assert.deepEqual(clearWoods([SQUARE, OTHER, THIRD], [[5, 5], [105, 105]]), [THIRD]);
});

test('clearWoods_PointInsideTwoOverlappingPolygons_DropsBoth', () => {   // by design: a pin clears every wood it lies in
  const OVERLAP = { ring: [[5, 5], [15, 5], [15, 15], [5, 15]] };
  assert.deepEqual(clearWoods([SQUARE, OVERLAP, OTHER], [[7, 7]]), [OTHER]);
});

test('clearWoods_PointOutsideEverything_KeepsAll', () => {
  assert.deepEqual(clearWoods([SQUARE, OTHER], [[50, 50]]), [SQUARE, OTHER]);
});

test('clearWoods_NoPoints_ReturnsTheSameList', () => {
  const list = [SQUARE];
  assert.equal(clearWoods(list, []), list);
  assert.equal(clearWoods(list, undefined), list);
});

test('Hochrhein_OpenWoods_DropsExactlyTheFridolinsinselWood', () => {
  const w = JSON.parse(readFileSync(new URL('../../data/world_hochrhein.json', import.meta.url), 'utf8'));
  const kept = clearWoods(w.forests, REGIONS.hochrhein.openWoods);
  assert.equal(kept.length, w.forests.length - 1);
  const gone = w.forests.filter(f => !kept.includes(f));
  const xs = gone[0].ring.map(p => p[0]), zs = gone[0].ring.map(p => p[1]);
  assert.ok(Math.min(...xs) > -1250 && Math.max(...xs) < -1195 && Math.min(...zs) > 100 && Math.max(...zs) < 210, 'it is the island polygon');
});

test('Ehrendingen_OpenWoods_IsEmpty', () => {
  assert.deepEqual(REGIONS.ehrendingen.openWoods, []);
});
