import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAPER, taperEnds, taperHalfWidth, markLines, offsetPolyline, densify, dualPartners, dualClip } from '../world.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
// #1231: the Zürcherstrasse at Stein -- a 9 m way (two lanes before the junction) meets the 4.5 m way it continues as
const way = (w, pts, extra = {}) => ({ n: 'Zürcherstrasse', cls: 'primary', w, mark: 'cycle', pts, ...extra });

test('TAPER constants', () => { assert.deepEqual(TAPER, { len: 20, step: 1 }); });

test('taperEnds_theWiderWayNarrowsToItsSameNameContinuation', () => {
  const wide = way(9, [[0, 0], [50, 0]]), narrow = way(4.5, [[50, 0], [100, 0]]), ends = taperEnds([wide, narrow]);
  assert.deepEqual(ends.get(wide), [null, 4.5]); assert.equal(ends.get(narrow), undefined);
});
test('taperEnds_atTheStartToo', () => {
  const narrow = way(4.5, [[0, 0], [50, 0]]), wide = way(9, [[50, 0], [100, 0]]);
  assert.deepEqual(taperEnds([narrow, wide]).get(wide), [4.5, null]);
});
test('taperEnds_noneAcrossNamesSmallStepsBridgesOrSeparateEnds', () => {
  const wide = () => way(9, [[0, 0], [50, 0]]);
  for (const other of [way(4.5, [[50, 0], [100, 0]], { n: 'Hauptstrasse' }), way(8.2, [[50, 0], [100, 0]]),
    way(4.5, [[50, 0], [100, 0]], { bridge: true }), way(4.5, [[51, 0], [100, 0]]), way(4.5, [[50, 0], [100, 0]], { n: '' })]) {
    const w = wide(); if (other.n === '') w.n = '';
    assert.equal(taperEnds([w, other]).size, 0, JSON.stringify(other));
  }
});
test('taperEnds_aBridgeItselfDoesNotTaper', () => {
  assert.equal(taperEnds([way(9, [[0, 0], [50, 0]], { bridge: true }), way(4.5, [[50, 0], [100, 0]])]).size, 0);
});

test('taperHalfWidth_linearOverTAPERlenFromTheJoint', () => {
  const wide = way(9, [[0, 0], [50, 0]]), ends = taperEnds([wide, way(4.5, [[50, 0], [100, 0]])]);
  close(taperHalfWidth(wide, ends, 50), 2.25); close(taperHalfWidth(wide, ends, 40), 3.375);
  close(taperHalfWidth(wide, ends, 30), 4.5); close(taperHalfWidth(wide, ends, 0), 4.5);
  close(taperHalfWidth(way(5, [[0, 0], [9, 0]]), ends, 3), 2.5);   // a road without a taper: its half width
});
test('taperHalfWidth_overHalfAShortWay', () => {
  const wide = way(9, [[0, 0], [30, 0]]), ends = taperEnds([wide, way(4.5, [[30, 0], [80, 0]])]);
  close(taperHalfWidth(wide, ends, 22.5), 3.375); close(taperHalfWidth(wide, ends, 15), 4.5);
});

test('offsetPolyline_takesAnOffsetPerArcLength', () => {
  const out = offsetPolyline([[0, 0], [10, 0], [20, 0]], (s) => 1 + s / 10);
  assert.deepEqual(out, [[0, 1], [10, 2], [20, 3]]);
});
test('offsetPolyline_givesTheOffsetFunctionThePointAndItsNormal', () => {
  const seen = []; offsetPolyline([[0, 0], [10, 0]], (s, p, n) => { seen.push([s, p, n]); return 0; });
  assert.deepEqual(seen, [[0, [0, 0], [-0, 1]], [10, [10, 0], [-0, 1]]]);
});
test('densify_keepsTheVerticesAndAddsPointsEveryStep', () => {
  assert.deepEqual(densify([[0, 0], [5, 0], [5, 3]], 2), [[0, 0], [2, 0], [4, 0], [5, 0], [5, 2], [5, 3]]);
});
test('markLines_theCycleLinesFollowTheTaper', () => {
  const wide = way(9, [[0, 0], [40, 0]]), ends = taperEnds([wide, way(4.5, [[40, 0], [90, 0]])]);
  const h = (p, nx, nz, t) => ({ l: taperHalfWidth(wide, ends, t), r: taperHalfWidth(wide, ends, t) });
  const [left, right] = markLines(wide, h).map((m) => m.pts);
  close(left[0][1], -3.2); close(left[left.length - 1][1], -0.95); close(right[right.length - 1][1], 0.95);
  assert.deepEqual(markLines(wide).map((m) => m.pts[1][1]), [-3.2, 3.2]);   // without a clip: as before
});

test('taperEnds_noneWhereTheStreetSplitsIntoTwoCarriageways', () => {
  const wide = way(9, [[0, 0], [50, 0]]), a = way(5.5, [[50, 0], [100, 8]], { oneway: true }), b = way(5.5, [[100, -8], [50, 0]], { oneway: true });
  assert.equal(taperEnds([wide, a, b]).size, 0);
});

// the issue's spot: the westbound 9 m Zürcherstrasse and the eastbound 5.5 m one run 6 m apart, so each one's median-side
// cycle line (3.2 m and 1.45 m off its axis) lay on the other carriageway and the dashes crossed
test('markLines_aPairedCarriagewaysCycleLineStaysOnItsDrawnShare', () => {
  const pz = { zp: [[0, 0], [100, 0]] }, west = way(9, [[100, 0], [0, 0]], { oneway: true, ...pz }), east = way(5.5, [[0, 6], [100, 6]], { oneway: true, mark: 'cycle-right', ...pz });
  const mates = dualPartners([west, east]), clip = (r) => (p, nx, nz) => dualClip(r, mates.get(r), p[0], p[1], nx, nz);
  const [wl, wr] = markLines(west, clip(west)).map((m) => m.pts), [er] = markLines(east, clip(east)).map((m) => m.pts);
  const mid = (pts) => pts[Math.floor(pts.length / 2)][1];
  close(mid(wr), 0 - 3.2); close(mid(wl), 6 * 9 / 14.5 - 1.3, 1e-3);   // west's right side faces away from east (z -), its left one is clipped
  close(mid(er), 6 + 1.45);   // east's cycle line is on its far side, unclipped
  assert.ok(mid(wl) < 6 - 6 * 5.5 / 14.5);   // west's median line stays off east's drawn share
});
