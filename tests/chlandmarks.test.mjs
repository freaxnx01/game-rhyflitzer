import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPLACES, landmarkOffset, chLandmarksFor, roofOrWall } from '../chlandmarks.js';

const LM = { crs: 'EPSG:2056', e: 2640000, n: 1267000, h: 280 };
const WORLD = { E: 2639781.3458206826, N: 1266787.080520644, crs: 'EPSG:2056' };
const INDEX = { origin: LM, landmarks: { 'fridolinskapelle-sisseln': { file: 'fridolinskapelle-sisseln.glb',
  bounds: { min: [1513.3, 20.48, -221.29], max: [1537.45, 44.62, -207.21] } } } };

test('landmarkOffset_hochrhein_movesTheLandmarkFrameOntoTheWorldFrame', () => {
  const o = landmarkOffset(LM, WORLD, 284);
  assert.ok(Math.abs(o.x - 218.654) < 0.01, o.x);
  assert.equal(o.y, -4);   // origin.h - base: 280 - 284
  assert.ok(Math.abs(o.z + 212.919) < 0.01, o.z);
});

test('chLandmarksFor_hochrhein_placesTheChapelOverItsOsmFootprint', () => {
  const [c] = chLandmarksFor(INDEX, 'hochrhein', WORLD, 284);
  assert.equal(c.id, 'fridolinskapelle-sisseln');
  assert.equal(c.osm, 171822707);
  const cx = (1513.3 + 1537.45) / 2 + c.offset.x, cz = (-221.29 - 207.21) / 2 + c.offset.z;
  assert.ok(Math.hypot(cx - 1744.18, cz + 424.69) < 3, [cx, cz]);   // OSM rect centre of way 171822707
  assert.ok(Math.abs(c.top - (324.62 - 284)) < 0.05, c.top);          // turret top, world y
});

test('chLandmarksFor_otherRegionOrMissingData_placesNothing', () => {
  assert.deepEqual(chLandmarksFor(INDEX, 'ehrendingen', WORLD, 284), []);
  assert.deepEqual(chLandmarksFor(INDEX, 'hochrhein', null, 284), []);
  assert.deepEqual(chLandmarksFor(INDEX, 'hochrhein', WORLD, null), []);
  assert.deepEqual(chLandmarksFor(null, 'hochrhein', WORLD, 284), []);
});

test('chLandmarksFor_landmarkWithoutReplacesEntry_isSkipped', () => {
  const idx = { ...INDEX, landmarks: { ...INDEX.landmarks, 'unknown-x': INDEX.landmarks['fridolinskapelle-sisseln'] } };
  assert.deepEqual(chLandmarksFor(idx, 'hochrhein', WORLD, 284).map(c => c.id), ['fridolinskapelle-sisseln']);
});

test('REPLACES_Chapel_isWay171822707InHochrhein', () => {
  assert.deepEqual(REPLACES['fridolinskapelle-sisseln'], { osm: 171822707, region: 'hochrhein' });
});

test('roofOrWall_byNormal_roofFacesUpWallsStand', () => {
  assert.equal(roofOrWall(0.9), 'roof');
  assert.equal(roofOrWall(0.4), 'roof');
  assert.equal(roofOrWall(0.1), 'wall');
  assert.equal(roofOrWall(-1), 'wall');
});
