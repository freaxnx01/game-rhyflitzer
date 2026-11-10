import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPLACES, landmarkOffset, chLandmarksFor, roofOrWall, plateBuildings } from '../chlandmarks.js';

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

const INDEX3 = { origin: LM, landmarks: { ...INDEX.landmarks,
  'kirche-bruder-klaus-stein': { file: 'kirche-bruder-klaus-stein.glb', bounds: { min: [-1441.34, 14.68, 883.74], max: [-1399.91, 36.46, 929.24] } },
  'reformierte-kirche-stein': { file: 'reformierte-kirche-stein.glb', bounds: { min: [-1410.64, 15.63, 990.39], max: [-1376.15, 35.46, 1022.79] } } } };

test('REPLACES_ChurchesOfStein_BruderKlausReplacesItsBox_ReformedHasItsOwnRect', () => {
  assert.deepEqual(REPLACES['kirche-bruder-klaus-stein'], { osm: 407386050, region: 'hochrhein' });
  assert.deepEqual(REPLACES['reformierte-kirche-stein'], { osm: null, region: 'hochrhein', rect: [-1177.97, 795.86, 34.75, 26.71, -2.7343] });
});

test('chLandmarksFor_hochrhein_placesAllThree_andPassesTheRectThrough', () => {
  const placed = chLandmarksFor(INDEX3, 'hochrhein', WORLD, 284);
  assert.deepEqual(placed.map(c => c.id), ['fridolinskapelle-sisseln', 'kirche-bruder-klaus-stein', 'reformierte-kirche-stein']);
  const ref = placed.find(c => c.id === 'reformierte-kirche-stein');
  assert.equal(ref.osm, null);
  assert.deepEqual(ref.rect, [-1177.97, 795.86, 34.75, 26.71, -2.7343]);
  assert.ok(Math.abs(ref.top - (35.46 - 4)) < 1e-9, ref.top);
  assert.equal('rect' in placed.find(c => c.id === 'kirche-bruder-klaus-stein'), false);
});

test('roofOrWall_byNormal_roofFacesUpWallsStand', () => {
  assert.equal(roofOrWall(0.9), 'roof');
  assert.equal(roofOrWall(0.4), 'roof');
  assert.equal(roofOrWall(0.1), 'wall');
  assert.equal(roofOrWall(-1), 'wall');
});

test('plateBuildings_replacedBuilding_isDropped', () => {
  const B = [{ id: 1, addr: '1' }, { id: 171822707, addr: '6.1' }, { id: 3, addr: '3' }];
  const replaced = new Map([[171822707, { id: 'fridolinskapelle-sisseln' }]]);
  assert.deepEqual(plateBuildings(B, replaced).map(b => b.id), [1, 3]);
});

test('plateBuildings_nothingReplaced_keepsEveryBuildingInOrder', () => {
  const B = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(plateBuildings(B, new Map()), B);
  assert.deepEqual(plateBuildings(B, undefined), B);
});

test('plateBuildings_realHochrhein_dropsOnlyThePlacedLandmarks', async () => {
  const fs = await import('node:fs');
  const world = JSON.parse(fs.readFileSync(new URL('../data/world_hochrhein.json', import.meta.url)));
  const index = JSON.parse(fs.readFileSync(new URL('../assets/landmarks/index.json', import.meta.url)));
  const placed = chLandmarksFor(index, 'hochrhein', world.origin, 284);
  const byOsm = new Map(placed.filter(c => c.osm != null).map(c => [c.osm, c]));
  const kept = plateBuildings(world.buildings, byOsm);
  assert.ok(!kept.some(b => b.id === 171822707), 'Fridolinskapelle has no plate');
  assert.ok(!kept.some(b => b.id === 407386050), 'Kirche Bruder Klaus has no plate');
  assert.equal(kept.length, world.buildings.length - byOsm.size, 'every other building stays');
});
