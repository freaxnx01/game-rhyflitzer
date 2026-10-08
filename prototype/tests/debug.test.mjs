import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debugFromQuery, gameToLv95, lv95ToWgs84, debugPosition, heightText, heightLabels, positionLines, buildingLines, copyText, DEBUG_LABEL_NDC_MAX, labelNdcY, clampLabelY, sizeLine, mapLines } from '../debug.js';

const ORIGIN = { lat: 47.5506, lon: 7.9671, E: 2639781.3458206826, N: 1266787.080520644, crs: 'EPSG:2056' };   // data/world_hochrhein.json

test('debugFromQuery: ?debug and ?debug=1 switch on, 0/false/off/no and no flag leave it off', () => {
  for (const q of ['?debug', '?debug=1', '?debug=on', '?x=1&debug', '?debug=TRUE']) assert.equal(debugFromQuery(q), true, q);
  for (const q of ['', '?', '?debug=0', '?debug=false', '?debug=Off', '?debug=no', '?debugx=1']) assert.equal(debugFromQuery(q), false, q);
});

test('gameToLv95: exact shift by the origin, z points south; null without an origin', () => {
  assert.deepEqual(gameToLv95({ E: 2600000, N: 1200000 }, 10.5, -20), { E: 2600010.5, N: 1200020 });
  assert.equal(gameToLv95(null, 1, 2), null);
  assert.equal(gameToLv95({ lat: 47, lon: 8 }, 1, 2), null);
});

test('lv95ToWgs84: the world origin comes back within 1e-5 degrees', () => {
  const { lat, lon } = lv95ToWgs84(ORIGIN.E, ORIGIN.N);
  assert.ok(Math.abs(lat - ORIGIN.lat) < 1e-5, String(lat));
  assert.ok(Math.abs(lon - ORIGIN.lon) < 1e-5, String(lon));
});

test('debugPosition: game, LV95 and WGS84 together; nulls without an origin', () => {
  const p = debugPosition(ORIGIN, 0, 0);
  assert.equal(p.E, ORIGIN.E); assert.equal(p.N, ORIGIN.N);
  assert.ok(Math.abs(p.lat - ORIGIN.lat) < 1e-5 && Math.abs(p.lon - ORIGIN.lon) < 1e-5);
  assert.deepEqual(debugPosition(null, 3, 4), { x: 3, z: 4, E: null, N: null, lat: null, lon: null });
});

test('heightText: eaves, measured ridge, source; osm when unmeasured', () => {
  assert.equal(heightText({ h: 22.8, rh: 1.2, hsrc: 'dsm' }), '22.8 m +1.2 dsm');
  assert.equal(heightText({ h: 5, rh: 0, hsrc: 'dsm' }), '5.0 m +0.0 dsm');
  assert.equal(heightText({ h: 12 }), '12.0 m osm');
});

test('heightLabels: one per building at the rect centre, roof-top height, id kept', () => {
  const B = [{ id: 7, h: 20, rh: 1.5, hsrc: 'dsm', roof: 'flat', rect: [10, 20, 60, 22, 0] }, { id: 8, h: 6, roof: 'gable', rect: [1, 2, 12, 8, 0] }];
  assert.deepEqual(heightLabels(B), [{ t: '20.0 m +1.5 dsm', x: 10, z: 20, top: 21.5, id: 7 }, { t: '6.0 m osm', x: 1, z: 2, top: 6 + 0.4 * 8, id: 8 }]);
  assert.deepEqual(heightLabels([]), []);
});

test('positionLines: game x/z/y and heading, then LV95 and WGS84; LV95 — without an origin', () => {
  const p = { x: 1234.54, z: -253.26, E: 2641015.9, N: 1267040.3, lat: 47.552843, lon: 7.983451 };
  assert.deepEqual(positionLines(p, 312.44, 86.6), ['x 1234.5  z -253.3  y 312.4  87°', 'LV95 2641016 / 1267040', 'WGS84 47.552843, 7.983451']);
  assert.deepEqual(positionLines({ x: 1, z: 2, E: null, N: null, lat: null, lon: null }, 0, 0), ['x 1.0  z 2.0  y 0.0  0°', 'LV95 —']);
});

test('buildingLines and copyText', () => {
  assert.deepEqual(buildingLines({ id: 171822634, t: '22.8 m +1.2 dsm' }), ['bldg 171822634 · 22.8 m +1.2 dsm']);
  assert.deepEqual(buildingLines(undefined), ['bldg —']);
  assert.equal(copyText(['a', 'b c']), 'a | b c');
});

test('sizeLine: length x width x height in metres, two decimals', () => {
  assert.equal(sizeLine({ l: 4.66, w: 2.18, h: 1.55 }), 'size 4.66 × 2.18 × 1.55 m');
  assert.equal(sizeLine({ l: 4.6612, w: 2.1849, h: 1.5 }), 'size 4.66 × 2.18 × 1.50 m');
});

test('mapLines: extent in km and the area in km2 from the metre values', () => {
  assert.deepEqual(mapLines(9440, 4392), ['map 9.44 × 4.39 km · 41.5 km²']);
  assert.deepEqual(mapLines(6400, 3800), ['map 6.40 × 3.80 km · 24.3 km²']);
});

// #70: camera view matrices as camera.matrixWorldInverse.elements (column-major); FOV 62° like the game camera
const TAN = Math.tan(31 * Math.PI / 180);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const pitched = (a, ty, tz) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, ty, tz, 1]; };

test('labelNdcY: projects like a three.js PerspectiveCamera; NaN behind the camera', () => {
  assert.ok(Math.abs(labelNdcY(IDENTITY, TAN, 0, 10 * TAN, -10) - 1) < 1e-12);
  assert.equal(labelNdcY(IDENTITY, TAN, 5, 0, -10), 0);
  assert.ok(Number.isNaN(labelNdcY(IDENTITY, TAN, 0, 1, 5)));
});

test('clampLabelY: a label above the limit comes down to exactly ndcMax', () => {
  const y = clampLabelY(IDENTITY, TAN, 0, 10, -10, 0.8, -1e9);
  assert.ok(Math.abs(y - 8 * TAN) < 1e-9, String(y));
  const view = pitched(0.3, -2, -1), y2 = clampLabelY(view, TAN, 3, 30, -20, 0.8, -1e9);
  assert.ok(y2 < 30, String(y2));
  assert.ok(Math.abs(labelNdcY(view, TAN, 3, y2, -20) - 0.8) < 1e-9);
});

test('clampLabelY: a camera moved up by 5 m clamps 5 m higher', () => {
  const lifted = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -5, 0, 1];
  assert.ok(Math.abs(clampLabelY(lifted, TAN, 0, 30, -10, 0.8, -1e9) - (5 + 8 * TAN)) < 1e-9);
});

test('clampLabelY: labels that fit, labels behind the camera and the floor', () => {
  assert.equal(clampLabelY(IDENTITY, TAN, 0, 1, -10, 0.8, -1e9), 1);          // fits: unchanged, never raised
  assert.equal(clampLabelY(IDENTITY, TAN, 0, 10, 5, 0.8, -1e9), 10);          // behind the camera: unchanged
  assert.equal(clampLabelY(IDENTITY, TAN, 0, 10, -10, 0.8, 6), 6);            // never below the floor
});

test('DEBUG_LABEL_NDC_MAX: 0.8 leaves a tenth of the screen above the label centre', () => {
  assert.equal(DEBUG_LABEL_NDC_MAX, 0.8);
});
