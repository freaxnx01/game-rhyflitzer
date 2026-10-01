import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, gridAddSegment, gridQuery, sdfSampler, waterIndex, polylineLength, nearestOnPolyline, offsetPolyline, layoutFromWorld } from '../world.js';

test('grid finds segments near a point only', () => {
  const g = makeGrid(32);
  gridAddSegment(g, 0, 0, 100, 0, 5, 'a');
  gridAddSegment(g, 0, 500, 100, 500, 5, 'b');
  assert.deepEqual([...gridQuery(g, 50, 3, 4)], ['a']);
  assert.deepEqual([...gridQuery(g, 50, 250, 4)], []);
});

test('sdf sampler decodes, interpolates and is +127 outside', () => {
  const bytes = new Int8Array([-10, 10, -10, 10]);
  const data = Buffer.from(bytes.buffer).toString('base64');
  const s = sdfSampler({ x0: 0, z0: 0, step: 8, w: 2, h: 2, data });
  assert.equal(s(0, 0), -10);
  assert.equal(s(4, 0), 0);
  assert.equal(s(-100, 0), 127);
});

test('water level lookup by polygon', () => {
  const wi = waterIndex([{ level: 2.5, rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }]);
  assert.equal(wi.levelAt(5, 5), 2.5);
  assert.equal(wi.levelAt(15, 5), null);
});

test('polyline helpers', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.equal(polylineLength(pts), 20);
  const n = nearestOnPolyline(pts, 12, 5);
  assert.equal(n.d, 2); assert.equal(n.t, 15);
  const off = offsetPolyline([[0, 0], [10, 0]], 2);
  assert.deepEqual(off, [[0, 2], [10, 2]]);            // +d = right of travel (z south = +)
});

test('layoutFromWorld maps tex and keeps anchors', () => {
  const L = layoutFromWorld({ roads: [{ id: 1, n: 'A1', cls: 'motorway', w: 14, mark: 'motorway', bridge: false, pts: [[0, 0], [1, 0]] },
                                      { id: 2, n: 'B', cls: 'tertiary', w: 7, mark: 'cycle', bridge: true, pts: [[0, 0], [0, 5]] }],
                             junctions: [], water: [], buildings: [], rail: [], bbox: [7.9, 47.5, 8.0, 47.6],
                             waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' },
                             anchors: { landmarks: {}, cps: [], labels: [], areas: {} } });
  assert.equal(L.roads[0].tex, 'motorway'); assert.equal(L.roads[1].tex, 'road');
  assert.equal(L.bridges.length, 1);
});

import { bridgeDeckAt } from '../world.js';
test('bridge deck is linear between the end heights and continuous at the ends', () => {
  const b = { len: 40, h0: 12.8, h1: 11.0 };
  assert.equal(bridgeDeckAt(b, 0), 12.8);
  assert.equal(bridgeDeckAt(b, 40), 11.0);
  assert.ok(Math.abs(bridgeDeckAt(b, 20) - 11.9) < 1e-9);
  assert.equal(bridgeDeckAt(b, -5), 12.8);     // clamped: approach sits on the end height
});

import { bridgeDeckOffset, bridgeSurfaceAt } from '../world.js';
test('bridge surface offset fades in over the first and last 5 m', () => {
  const b = { len: 40, h0: 12.8, h1: 11.0 };
  assert.equal(bridgeDeckOffset(b, 0), 0);
  assert.equal(bridgeDeckOffset(b, 40), 0);
  assert.ok(Math.abs(bridgeDeckOffset(b, 2.5) - 0.15) < 1e-9);
  assert.ok(Math.abs(bridgeDeckOffset(b, 37.5) - 0.15) < 1e-9);
  assert.equal(bridgeDeckOffset(b, 5), 0.3);
  assert.equal(bridgeDeckOffset(b, 20), 0.3);
  assert.equal(bridgeDeckOffset(b, -3), 0);
  assert.equal(bridgeDeckOffset(b, 50), 0);
  let prev = bridgeDeckOffset(b, 0);
  for (let t = 0.1; t <= 40; t += 0.1) { const v = bridgeDeckOffset(b, t); assert.ok(Math.abs(v - prev) < 0.3 / 5 * 0.1 + 1e-9); prev = v; }
});
test('bridge surface meets the end heights exactly and sits 0.3 above the deck mid-span', () => {
  const b = { len: 40, h0: 12.8, h1: 11.0 };
  assert.equal(bridgeSurfaceAt(b, 0), 12.8);
  assert.equal(bridgeSurfaceAt(b, 40), 11.0);
  assert.ok(Math.abs(bridgeSurfaceAt(b, 20) - 12.2) < 1e-9);
});
import { MARK, markLines } from '../world.js';
test('markLines per mark type', () => {
  const r = (mark) => ({ w: 7, mark, pts: [[0, 0], [100, 0]] });
  assert.equal(markLines(r('none')).length, 0);
  assert.equal(markLines(r('motorway')).length, 0);
  assert.equal(markLines(r('centre')).length, 1);
  assert.equal(markLines(r('centre'))[0].spec, MARK.centre);
  assert.equal(markLines(r('centre-solid'))[0].spec, MARK['centre-solid']);
  const cyc = markLines(r('cycle'));
  assert.equal(cyc.length, 2);
  assert.ok(Math.abs(Math.abs(cyc[0].pts[0][1]) - (3.5 - MARK.cycle.inset)) < 1e-6);
  assert.ok(cyc[0].pts[0][1] < 0 && cyc[1].pts[0][1] > 0);               // left line first, right line second
  const right = markLines(r('cycle-right'));
  assert.equal(right.length, 2);                                          // yellow right + white centre
  assert.equal(right[0].spec, MARK.cycle); assert.ok(right[0].pts[0][1] > 0);
  assert.equal(right[1].spec, MARK.centre); assert.deepEqual(right[1].pts, r('cycle-right').pts);
  assert.equal(markLines(r('cycle-left')).length, 2);
});
