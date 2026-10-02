import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, gridAddSegment, gridQuery, sdfSampler, waterIndex, polylineLength, nearestOnPolyline, offsetPolyline, layoutFromWorld, roadNameAt, addrLabels, pickLabels, facadeLabels, subdivideTris, lineQuads, VILLAGES, VILLAGE_FADE, villageFade, villageHeight, villageLabels, roofTop } from '../world.js';

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
import { bridgeAccepts, waterSurface } from '../world.js';
test('an OSM bridge deck only counts as ground for queries at or above it (minus 1.5 m)', () => {
  assert.equal(bridgeAccepts(12, undefined), true);     // placement code passes no height: current behaviour
  assert.equal(bridgeAccepts(12, 12), true);            // car on the deck
  assert.equal(bridgeAccepts(12, 10.5), true);          // boundary: deck - 1.5
  assert.equal(bridgeAccepts(12, 10.4), false);         // just below: a car driving underneath
  assert.equal(bridgeAccepts(12, 5), false);            // road level under an overpass
  assert.equal(bridgeAccepts(12, 20), true);            // airborne above the deck lands on it
});
test('water surface is relative to the chunk level, null on land', () => {
  assert.equal(waterSurface(-5, 5.53), 5.53);           // Rhine above the Saeckingen weir
  assert.equal(waterSurface(-5, -1.5), -1.5);           // downstream
  assert.equal(waterSurface(-5, null), 0);              // no level known -> 0 (hand path, or no .mmh)
  assert.equal(waterSurface(-5, undefined), 0);
  assert.equal(waterSurface(0, 5.53), null);            // the bank
  assert.equal(waterSurface(36.2, 5.53), null);
});

test('layoutFromWorld passes props and defaults to an empty list', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.deepEqual(layoutFromWorld(base).props, []);
  const p = [{ kind: 'lamp', x: 1, z: 2, rot: 0 }];
  assert.deepEqual(layoutFromWorld({ ...base, props: p }).props, p);
});

test('layoutFromWorld passes streams and defaults to an empty list', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.deepEqual(layoutFromWorld(base).streams, []);
  const st = [{ name: 'Sissle', w: 12, pts: [[0, 0], [10, 0]] }];
  assert.deepEqual(layoutFromWorld({ ...base, streams: st }).streams, st);
});

test('roadNameAt: on a named road, off it, unnamed, nearest of two', () => {
  const a = { n: 'Hauptstrasse', w: 8, pts: [[0, 0], [100, 0]] }, b = { n: 'Bachweg', w: 4, pts: [[50, -50], [50, 50]] }, u = { n: '', w: 20, pts: [[0, 10], [100, 10]] };
  const c = [{ r: a, i: 0 }, { r: b, i: 0 }, { r: u, i: 0 }];
  assert.equal(roadNameAt(c, 20, 4.9), 'Hauptstrasse');     // w/2 + 1 = 5
  assert.equal(roadNameAt(c, 20, 5.1), '');                 // past the margin; only the unnamed road is under the car
  assert.equal(roadNameAt(c, 51, 2), 'Bachweg', 'roadNameAt picks the nearer of two named roads');
  assert.equal(roadNameAt([], 0, 0), '');
});

test('addrLabels: only numbered buildings, roof-top heights, landmarks', () => {
  const B = [{ addr: '6a–6d', h: 20, rh: 1.5, roof: 'flat', rect: [10, 20, 60, 22, 0] }, { addr: '5', h: 6, roof: 'gable', rect: [1, 2, 12, 8, 0] },
    { addr: '7', h: 2, roof: 'flat', rect: [3, 4, 10, 10, 0] }, { h: 6, roof: 'flat', rect: [0, 0, 10, 10, 0] }];
  assert.deepEqual(addrLabels(B, { hallenbad: { x: 5, z: 6, addr: '2' }, chimney: { x: 0, z: 0 } }), [
    { t: '6a–6d', x: 10, z: 20, top: 21.5 }, { t: '5', x: 1, z: 2, top: 6 + 0.4 * 8 }, { t: '7', x: 3, z: 4, top: 3 }, { t: '2', x: 5, z: 6, top: 9 }]);
  assert.deepEqual(addrLabels([]), []);
});

test('pickLabels: within 60 m, nearest first, at most 40', () => {
  const items = Array.from({ length: 100 }, (_, k) => ({ t: String(k), x: k, z: 0 }));
  const got = pickLabels(items, 0, 0);
  assert.equal(got.length, 40);
  assert.deepEqual(got.slice(0, 3).map(l => [l.t, l.d]), [['0', 0], ['1', 1], ['2', 2]]);
  assert.equal(pickLabels(items, 0, 0, 60, 100).length, 61);  // 0..60 inclusive
  assert.deepEqual(pickLabels(items, 500, 500), []);
});

test('facadeLabels: one outward label per façade, sized to it', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const same = (got, want) => assert.ok(['x', 'z', 'rotY', 'w', 'h'].every(k => near(got[k], want[k])), `${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  const t = facadeLabels(100, 200, 0, 28, 26);   // traced hall, default size
  assert.equal(t.length, 4);
  same(t[0], { x: 100, z: 213.1, rotY: 0, w: 16.8, h: 16.8 * 2.2 / 16 });             // today's façade
  same(t[1], { x: 114.1, z: 200, rotY: Math.PI / 2, w: 15.6, h: 15.6 * 2.2 / 16 });
  same(t[2], { x: 100, z: 186.9, rotY: Math.PI, w: 16.8, h: 16.8 * 2.2 / 16 });
  same(t[3], { x: 85.9, z: 200, rotY: 3 * Math.PI / 2, w: 15.6, h: 15.6 * 2.2 / 16 });
  const o = facadeLabels(0, 0, Math.PI / 2, 42.7, 47.1);  // OSM size, rotated a quarter turn
  same(o[0], { x: -23.65, z: 0, rotY: -Math.PI / 2, w: 20, h: 2.75 });             // clamped to 20 m
  same(o[1], { x: 0, z: 21.45, rotY: 0, w: 20, h: 2.75 });
});

test('layoutFromWorld passes parking and defaults to an empty list', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.deepEqual(layoutFromWorld(base).parking, []);
  const p = [{ id: 1, ring: [[0, 0], [5, 0], [5, 5]], bays: 0, lines: [] }];
  assert.deepEqual(layoutFromWorld({ ...base, parking: p }).parking, p);
});

test('subdivideTris splits until every edge is short and keeps the area and winding', () => {
  const pts = [[0, 0], [40, 0], [40, 20]], { pts: out, tris } = subdivideTris(pts, [[0, 1, 2]], 5);
  const area = ([a, b, c]) => ((out[b][0] - out[a][0]) * (out[c][1] - out[a][1]) - (out[b][1] - out[a][1]) * (out[c][0] - out[a][0])) / 2;
  assert.ok(tris.length > 16);
  for (const t of tris) for (const [i, j] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) assert.ok(Math.hypot(out[i][0] - out[j][0], out[i][1] - out[j][1]) <= 5 + 1e-9);
  assert.ok(tris.every(t => area(t) > 0));
  assert.ok(Math.abs(tris.reduce((s, t) => s + area(t), 0) - 400) < 1e-6);
});

test('subdivideTris leaves small triangles and shares midpoints between neighbours', () => {
  assert.deepEqual(subdivideTris([[0, 0], [1, 0], [0, 1]], [[0, 1, 2]], 5).tris, [[0, 1, 2]]);
  const { pts } = subdivideTris([[0, 0], [8, 0], [8, 8], [0, 8]], [[0, 1, 2], [0, 2, 3]], 5);
  const keys = pts.map(([x, z]) => `${x},${z}`);
  assert.equal(keys.length, new Set(keys).size);
});

test('lineQuads gives a quad of the given width around each line and skips empty ones', () => {
  assert.deepEqual(lineQuads([[0, 0, 10, 0], [3, 3, 3, 3]], 0.2), [[[0, 0.1], [10, 0.1], [10, -0.1], [0, -0.1]]]);
});

test('villageFade: hidden inside, ramps in, full, ramps out, gone', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.equal(villageFade(0, 450), 0);
  assert.equal(villageFade(450, 450), 0);
  assert.ok(near(villageFade(550, 450), 0.5));
  assert.equal(villageFade(650, 450), 1);
  assert.equal(villageFade(2000, 450), 1);
  assert.equal(villageFade(2600, 450), 1);
  assert.ok(near(villageFade(3000, 450), 0.5));
  assert.equal(villageFade(3400, 450), 0);
  assert.equal(villageFade(9000, 450), 0);
  assert.deepEqual(VILLAGE_FADE, { in: 200, full: 2600, out: 3400 });
});

test('villageHeight: 0.06 x distance, clamped to 30..180 m', () => {
  assert.equal(villageHeight(100), 30);
  assert.equal(villageHeight(1000), 60);
  assert.equal(villageHeight(1500), 90);
  assert.equal(villageHeight(5000), 180);
});

test('villageLabels: only visible names, nearest first', () => {
  const V = [{ t: 'FAR', x: 3000, z: 0, r: 400 }, { t: 'HERE', x: 100, z: 0, r: 400 }, { t: 'MID', x: 0, z: 1500, r: 400 }, { t: 'GONE', x: 0, z: -5000, r: 400 }];
  const got = villageLabels(V, 0, 0);
  assert.deepEqual(got.map(l => l.t), ['MID', 'FAR']);
  assert.deepEqual(got[0], { t: 'MID', x: 0, z: 1500, d: 1500, opacity: 1, h: 90 });
  assert.ok(Math.abs(got[1].opacity - 0.5) < 1e-9);
  assert.deepEqual(villageLabels([], 0, 0), []);
});

test('VILLAGES: eight uppercase names inside the world, the issue\'s four included', () => {
  assert.equal(VILLAGES.length, 8);
  assert.equal(new Set(VILLAGES.map(v => v.t)).size, 8);
  for (const v of VILLAGES) {
    assert.equal(v.t, v.t.toUpperCase());
    assert.ok(v.r >= 300 && v.r <= 1000, v.t);
    assert.ok(v.x > -4689 && v.x < 4750 && v.z > -2350 && v.z < 2034, v.t);   // the world's road extent
  }
  for (const t of ['BAD SÄCKINGEN', 'STEIN', 'SISSELN', 'SISSLERFELD', 'MÜNCHWILEN']) assert.ok(VILLAGES.some(v => v.t === t), t);
});

test('roofTop: measured ridge, gable guess, flat roofs at least 3 m', () => {
  assert.equal(roofTop({ h: 20, rh: 1.5, roof: 'flat', rect: [0, 0, 60, 22, 0] }), 21.5);
  assert.equal(roofTop({ h: 6, roof: 'gable', rect: [0, 0, 12, 8, 0] }), 6 + 0.4 * 8);
  assert.equal(roofTop({ h: 2, roof: 'flat', rect: [0, 0, 10, 10, 0] }), 3);
});

test('layoutFromWorld passes origin and defaults to null', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.equal(layoutFromWorld(base).origin, null);
  const origin = { lat: 47.5506, lon: 7.9671, E: 2639781.3, N: 1266787.1, crs: 'EPSG:2056' };
  assert.deepEqual(layoutFromWorld({ ...base, origin }).origin, origin);
});

test('layoutFromWorld passes boundaries and defaults to an empty list (#48)', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.deepEqual(layoutFromWorld(base).boundaries, []);
  const b = [{ id: 123001743, names: ['Eiken', 'Sisseln'], pts: [[0, 0], [10, 0]] }];
  assert.deepEqual(layoutFromWorld({ ...base, boundaries: b }).boundaries, b);
});
