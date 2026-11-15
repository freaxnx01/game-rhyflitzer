/* #987: the WebGPU Sisseln PoC's pure slice filter. Pure: no three.js, no DOM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SLICE,
  MARGIN,
  expandBox,
  inSlice,
  ringTouches,
  clipPolyline,
  clipRing,
  sliceWorld
} from '../poc/webgpu-sisseln/js/sisseln-slice.js';

const WORLD_FILE = new URL('../data/world_hochrhein.json', import.meta.url);

const BOX = { x0: -10, x1: 10, z0: -10, z1: 10 };

test('SLICE_bounds_holdThePlattformTheChimneyAndTheVillage', () => {
  assert.deepEqual(SLICE, { x0: -700, x1: 2300, z0: -1000, z1: 1000 });
  assert.equal(inSlice(304.8, 427.1), true, 'the Plattform Sisslerfeld');
  assert.equal(inSlice(1065.2, 345.1), true, 'the DSM chimney');
  assert.equal(inSlice(1950, -420), true, "Sisseln's village centre");
});

test('expandBox_margin_growsEverySide', () => {
  assert.deepEqual(expandBox(BOX, 5), { x0: -15, x1: 15, z0: -15, z1: 15 });
});

test('inSlice_insideAndOnTheEdge_isTrue', () => {
  assert.equal(inSlice(0, 0, BOX), true);
  assert.equal(inSlice(-10, 10, BOX), true);
});

test('inSlice_outside_isFalse', () => {
  assert.equal(inSlice(11, 0, BOX), false);
  assert.equal(inSlice(0, -11, BOX), false);
});

test('ringTouches_crossingWithNoPointInside_isTrue', () => {
  // a segment straight through the box, both ends outside: its bounding box overlaps
  assert.equal(ringTouches([[-50, 0], [50, 0]], BOX), true);
});

test('ringTouches_farAway_isFalse', () => {
  assert.equal(ringTouches([[100, 100], [120, 130]], BOX), false);
});

test('ringTouches_empty_isFalse', () => {
  assert.equal(ringTouches([], BOX), false);
});

test('clipPolyline_crossingTheEdge_endsOnTheEdge', () => {
  const pieces = clipPolyline([[0, 0], [30, 0]], BOX);
  assert.equal(pieces.length, 1);
  assert.deepEqual(pieces[0], [[0, 0], [10, 0]]);
});

test('clipPolyline_leavingAndReturning_splitsIntoTwoPieces', () => {
  const pieces = clipPolyline([[0, 0], [0, 30], [8, 30], [8, 0]], BOX);
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces[0], [[0, 0], [0, 10]]);
  assert.deepEqual(pieces[1], [[8, 10], [8, 0]]);
});

test('clipPolyline_fullyOutside_isEmpty', () => {
  assert.deepEqual(clipPolyline([[50, 50], [60, 60]], BOX), []);
});

test('clipRing_straddling_staysInsideTheBox', () => {
  const ring = clipRing([[0, 0], [30, 0], [30, 8], [0, 8]], BOX);
  assert.ok(ring.length >= 4);
  for (const [x, z] of ring) assert.equal(inSlice(x, z, BOX), true);
  assert.ok(ring.some(([x]) => Math.abs(x - 10) < 1e-9), 'clipped at x = 10');
});

test('clipRing_fullyInside_isUnchanged', () => {
  const ring = [[0, 0], [5, 0], [5, 5]];
  assert.deepEqual(clipRing(ring, BOX), ring);
});

test('clipRing_fullyOutside_isEmpty', () => {
  assert.deepEqual(clipRing([[50, 50], [60, 50], [60, 60]], BOX), []);
});

function tinyWorld() {
  return {
    roads: [
      { cls: 'residential', w: 5, pts: [[100, 100], [160, 120]] },
      { cls: 'service', w: 3, pts: [[5000, 0], [5100, 0]] },
      { cls: 'primary', w: 8, pts: [[1200, 0], [1500, 0]] }
    ],
    buildings: [
      { h: 9, roof: 'gable', palette: 'village', ring: [[100, 100], [110, 100], [110, 112]] },
      { h: 6, roof: 'flat', palette: 'village', ring: [[5000, 0], [5010, 0], [5010, 10]] }
    ],
    water: [
      { kind: 'water', level: 5.5, rings: [[[-600, -800], [-500, -800], [-500, -700]]] },
      { kind: 'water', level: 9.9, rings: [[[5000, 5000], [5010, 5000], [5010, 5010]]] }
    ],
    anchors: { landmarks: { plattform: { x: 304.8, z: 427.1, h: 11 }, dsmChimney: { x: 1065.2, z: 345.1, h: 140 } } }
  };
}

test('sliceWorld_insideFeatures_areKept', () => {
  const slice = sliceWorld(tinyWorld());
  assert.equal(slice.roads.length, 2);
  assert.equal(slice.buildings.length, 1);
  assert.equal(slice.buildings[0].h, 9);
  assert.equal(slice.water.length, 1);
  assert.equal(slice.water[0].level, 5.5);
});

test('sliceWorld_outsideFeatures_areDropped', () => {
  const slice = sliceWorld(tinyWorld());
  assert.ok(!slice.roads.some((road) => road.pts[0][0] === 5000));
  assert.ok(!slice.buildings.some((building) => building.ring[0][0] === 5000));
  assert.ok(!slice.water.some((water) => water.level === 9.9));
});

test('sliceWorld_roadStraddlingTheEdge_isKeptAndClipped', () => {
  const slice = sliceWorld(tinyWorld());
  const straddling = slice.roads.find((road) => road.cls === 'primary');
  assert.ok(straddling, 'the road from inside to outside is kept');
  const outer = expandBox(SLICE, MARGIN);
  for (const [x, z] of straddling.pts) assert.equal(inSlice(x, z, outer), true);
});

test('sliceWorld_missingArrays_areEmpty', () => {
  const slice = sliceWorld({ anchors: { landmarks: {} } });
  for (const key of ['roads', 'buildings', 'water', 'streams', 'forests', 'fields', 'props']) {
    assert.deepEqual(slice[key], [], key);
  }
  assert.equal(slice.landmarks.plattform, null);
  assert.equal(slice.landmarks.dsmChimney, null);
});

test('sliceWorld_noAnchors_doesNotThrow', () => {
  const slice = sliceWorld({});
  assert.equal(slice.landmarks.plattform, null);
});

test('sliceWorld_realWorld_hasTheRhineAndTheLandmarks', () => {
  const world = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
  const slice = sliceWorld(world);

  const rhine = slice.water.filter((water) => water.level > 5 && water.level < 6
    && water.rings.some((ring) => ring.some(([, z]) => z < -360)));
  assert.ok(rhine.length >= 1, `the Rhine tiles are in the slice, got ${rhine.length}`);

  assert.ok(inSlice(slice.landmarks.plattform.x, slice.landmarks.plattform.z), 'the Plattform is in the slice');
  assert.ok(inSlice(slice.landmarks.dsmChimney.x, slice.landmarks.dsmChimney.z), 'the DSM chimney is in the slice');
  assert.equal(slice.landmarks.dsmChimney.h, 140);

  assert.ok(slice.buildings.length >= 500, `got ${slice.buildings.length} buildings`);
  assert.ok(slice.roads.length >= 300, `got ${slice.roads.length} roads`);
  assert.ok(slice.forests.length >= 10, `got ${slice.forests.length} forests`);
  assert.ok(slice.fields.length >= 100, `got ${slice.fields.length} fields`);
});

test('sliceWorld_realWorld_keepsEveryPieceInsideTheOuterBox', () => {
  const world = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
  const slice = sliceWorld(world);
  const outer = expandBox(SLICE, MARGIN);
  for (const road of slice.roads) for (const [x, z] of road.pts) assert.equal(inSlice(x, z, outer), true);
  for (const stream of slice.streams) for (const [x, z] of stream.pts) assert.equal(inSlice(x, z, outer), true);
  for (const field of slice.fields) for (const [x, z] of field.ring) assert.equal(inSlice(x, z, outer), true);
});
