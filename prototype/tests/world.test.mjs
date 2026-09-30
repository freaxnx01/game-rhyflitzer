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
