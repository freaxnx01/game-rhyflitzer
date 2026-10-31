// #169: the editor's pure geometry — LV95 <-> WGS84 (swisstopo approximate formulas), 250 m snapping, 1–4 km clamping,
// move/resize, ?bbox=, rectangle inside the Switzerland outline. Pure module, node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID, MIN_SIDE, MAX_SIDE, DEFAULT_RECT, wgsToLv95, lv95ToWgs, snapRect, clampRect, moveRect, resizeRect, sizeKm, centre, corners, parseBbox, formatBbox, rectInside, fixedCornerAfterResize } from '../editor/geo.js';

const EHR = [2667000, 1259750, 2669000, 1261750];   // 2 x 2 km around Ehrendingen, LV95 (the #166 test frame)
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);
// a square "country" 2600000..2700000 / 1200000..1300000 with a 3 x 4 km hole (a Büsingen) at 2650000..2653000 / 1250000..1254000
const OUTLINE = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [
  [[2600000, 1200000], [2700000, 1200000], [2700000, 1300000], [2600000, 1300000], [2600000, 1200000]],
  [[2650000, 1250000], [2653000, 1250000], [2653000, 1254000], [2650000, 1254000], [2650000, 1250000]]] } };

test('constants: 250 m grid, 1-4 km sides, default frame is the Ehrendingen square', () => {
  assert.equal(GRID, 250); assert.equal(MIN_SIDE, 1000); assert.equal(MAX_SIDE, 4000); assert.deepEqual(DEFAULT_RECT, EHR);
});

test('LV95 <-> WGS84: Bern origin and Ehrendingen within 1.5 m, round trip within 0.5 m', () => {
  const [lat, lon] = lv95ToWgs(2600000, 1200000);
  near(lat, 46.951081, 2e-5, 'bern lat'); near(lon, 7.438637, 2e-5, 'bern lon');
  const [E, N] = wgsToLv95(46.951081, 7.438637); near(E, 2600000, 1.5, 'bern E'); near(N, 1200000, 1.5, 'bern N');
  const [e2, n2] = wgsToLv95(47.4948, 8.3419); near(e2, 2668065, 2, 'ehr E'); near(n2, 1260841, 2, 'ehr N');   // the place node Ehrendingen (geo.EHRENDINGEN_ORIGIN)
  const [E3, N3] = wgsToLv95(...lv95ToWgs(2668000, 1260750)); near(E3, 2668000, 0.5, 'rt E'); near(N3, 1260750, 0.5, 'rt N');
});

test('snapRect: each edge to the nearest 250 m, corners ordered', () => {
  assert.deepEqual(snapRect([2667010, 1259760, 2668990, 1261740]), EHR);
  assert.deepEqual(snapRect([2669000, 1261750, 2667000, 1259750]), EHR);
  assert.deepEqual(snapRect([2667124, 1259874, 2668876, 1261625]), [2667000, 1259750, 2669000, 1261750]);   // 1261625 is exactly half a cell: rounds up
});

test('clampRect: sides forced into 1-4 km, the fixed corner stays', () => {
  assert.deepEqual(clampRect([2667000, 1259750, 2667500, 1260000], 'sw'), [2667000, 1259750, 2668000, 1260750]);       // too small grows away from sw
  assert.deepEqual(clampRect([2667000, 1259750, 2672000, 1265000], 'sw'), [2667000, 1259750, 2671000, 1263750]);       // too big shrinks towards sw
  assert.deepEqual(clampRect([2667000, 1259750, 2672000, 1265000], 'ne'), [2668000, 1261000, 2672000, 1265000]);       // ne fixed: sw moves
  assert.deepEqual(clampRect(EHR, 'nw'), EHR);
});

test('moveRect and resizeRect: metres, the opposite corner of a resize stays', () => {
  assert.deepEqual(moveRect(EHR, 250, -500), [2667250, 1259250, 2669250, 1261250]);
  assert.deepEqual(resizeRect(EHR, 'ne', 500, 250), [2667000, 1259750, 2669500, 1262000]);
  assert.deepEqual(resizeRect(EHR, 'sw', 500, 250), [2667500, 1260000, 2669000, 1261750]);
  assert.deepEqual(resizeRect(EHR, 'nw', -250, 250), [2666750, 1259750, 2669000, 1262000]);
  assert.deepEqual(resizeRect(EHR, 'se', 250, -250), [2667000, 1259500, 2669250, 1261750]);
});

test('sizeKm, centre, corners', () => {
  assert.deepEqual(sizeKm([2667000, 1259750, 2669500, 1262750]), { w: 2.5, h: 3 });
  assert.deepEqual(centre(EHR), [2668000, 1260750]);
  assert.deepEqual(corners(EHR), [[2667000, 1261750], [2669000, 1261750], [2669000, 1259750], [2667000, 1259750]]);   // nw ne se sw
});

test('parseBbox: snapped LV95 from ?bbox=, null for junk, formatBbox is the inverse', () => {
  assert.deepEqual(parseBbox('?bbox=2667010,1259760,2668990,1261740'), EHR);
  assert.deepEqual(parseBbox('?x=1&bbox=' + formatBbox(EHR)), EHR);
  for (const s of ['', '?bbox=', '?bbox=1,2,3', '?bbox=a,b,c,d', '?bbox=2667000,1259750,2667000,1261750', '?bbox=1,1,2,2']) assert.equal(parseBbox(s), null, s);
  assert.equal(parseBbox('?bbox=2667000,1259750,2672000,1261750'), null);   // 5 km: not clamped silently, refused
  assert.equal(formatBbox(EHR), '2667000,1259750,2669000,1261750');
});

test('rectInside: inside, crossing the border, outside, a corner in the hole, the hole inside the frame', () => {
  assert.equal(rectInside(EHR, OUTLINE), true);
  assert.equal(rectInside([2698000, 1259750, 2702000, 1261750], OUTLINE), false);          // crosses the east border
  assert.equal(rectInside([2710000, 1259750, 2712000, 1261750], OUTLINE), false);          // outside
  assert.equal(rectInside([2652000, 1253000, 2654000, 1255000], OUTLINE), false);          // sw corner in the hole
  assert.equal(rectInside([2649500, 1249500, 2653500, 1253500], OUTLINE), false);          // the hole's corners are inside the frame
  assert.equal(rectInside([2653250, 1250000, 2655250, 1252000], OUTLINE), true);           // beside the hole
  assert.equal(rectInside(EHR, { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [OUTLINE.geometry.coordinates] } }), true);
});

test('fixedCornerAfterResize: the corner opposite the dragged one, also after the rect flipped', () => {
  assert.equal(fixedCornerAfterResize(EHR, 'se', EHR), 'nw');   // no flip: the old OPPOSITE table
  assert.equal(fixedCornerAfterResize(EHR, 'nw', EHR), 'se');
  const flipped = [2660000, 1259750, 2667000, 1261750];   // se dragged 9 km west past the west edge, re-ordered
  assert.equal(fixedCornerAfterResize(EHR, 'se', flipped), 'ne');   // the fixed (old nw) point is now the east edge
  const both = [2669000, 1257750, 2671000, 1259750];      // nw dragged past the south-east corner on both axes, re-ordered
  assert.equal(fixedCornerAfterResize(EHR, 'nw', both), 'nw');   // the fixed (old se) point is now its north-west corner
  assert.equal(fixedCornerAfterResize(EHR, 'ne', [2667000, 1259750, 2667000, 1261750]), 'sw');   // zero width: tie falls back to the old default
});

test('flipped drag over 4 km keeps the fixed corner where it was', () => {
  const flipped = [2660000, 1259750, 2667000, 1261750];
  const fixed = fixedCornerAfterResize(EHR, 'se', flipped);
  assert.deepEqual(clampRect(snapRect(flipped), fixed), [2663000, 1259750, 2667000, 1261750]);   // east edge 2667000 stays; today's 'nw' gives 2660000..2664000
});
