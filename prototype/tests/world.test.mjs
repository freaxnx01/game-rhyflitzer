import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, gridAddSegment, gridQuery, sdfSampler, waterIndex, parkingIndex, polylineLength, nearestOnPolyline, offsetPolyline, layoutFromWorld, roadNameAt, addrLabels, pickLabels, facadeLabels, subdivideTris, lineQuads, VILLAGES, VILLAGES_EHRENDINGEN, VILLAGE_FADE, villageFade, villageHeight, villageLabels, BORDER_DE, VILLAGE_BANK_FADE, nationalBorder, sameBank, bankFade, villageQuiet, villageNames, roofTop, ROW_HOUSE_IDS, isRowHouse, rowUnits, rowHouseTile, ringPush, UNDERPASS, pointAtLength, railRoadCrossings, cutFlat, cutFloorTarget, junctionCap, cutFloor, cutReach, cutFloorAt, cutBounds, mergeIntervals, wallStations, patchCells, triLerp, TREE_TRUNK, treeTrunkR, treeCollider, rng, forestIndex, forestEdges, forestTrees, FOREST_BUDGET, tileKey } from '../world.js';

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

test('row houses (#45): picked by OSM way id, units from the addr range, one unit x one storey per tile', () => {
  assert.equal(ROW_HOUSE_IDS.size, 16);
  assert.equal(isRowHouse({ id: 512632899 }), true);          // 3a–3f
  assert.equal(isRowHouse({ id: 171822799 }), true);          // 16a–16c, the three-unit block
  assert.equal(isRowHouse({ id: 171822634 }), false);         // Bodenackerstrasse 6a–6d: a–d range, but the big block
  assert.equal(isRowHouse({ id: 25049518 }), false);
  assert.equal(rowUnits('3a–3f'), 6);
  assert.equal(rowUnits('16a–16c'), 3);
  assert.equal(rowUnits(undefined), 6);
  assert.equal(rowUnits('6'), 6);
  const t = rowHouseTile({ rect: [0, 0, 36.4, 11.96], h: 6.2, addr: '4a–4f' });   // today's measured 4a–4f: two storeys
  assert.ok(Math.abs(t[0] - 36.4 / 6) < 1e-9 && Math.abs(t[1] - 3.1) < 1e-9, t);
  assert.deepEqual(rowHouseTile({ rect: [0, 0, 36, 12], h: 9, addr: '4a–4f' }), [6, 3]);          // after #34: three storeys
  assert.deepEqual(rowHouseTile({ rect: [0, 0, 11.5, 18], h: 6.9, addr: '16a–16c' }), [6, 3.45]); // long side may be d
});

test('parkingIndex keeps a tree disc off the lot surface but allows the islands', () => {
  const lot = { ring: [[0, 0], [20, 0], [20, 10], [0, 10]], holes: [[[8, 3], [12, 3], [12, 7], [8, 7]]] };
  const p = parkingIndex([lot]);
  assert.equal(p.clear(5, 5, 0), false);      // trunk on the asphalt
  assert.equal(p.clear(5, 5, 3), false);
  assert.equal(p.clear(25, 5, 3), true);      // 5 m off the east edge, 3 m crown
  assert.equal(p.clear(22, 5, 3), false);     // crown reaches 1 m over the edge
  assert.equal(p.clear(10, -2.5, 2), true);   // 2.5 m north of the lot, 2 m crown
  assert.equal(p.clear(10, 5, 1), true);      // small tree in the island, 2 m from its kerb
  assert.equal(p.clear(10, 5, 3), false);     // crown spills over the island onto the bays
  assert.equal(p.clear(500, 500, 5), true);   // far away (bbox prefilter)
});

test('parkingIndex with no lots is always clear', () => {
  const p = parkingIndex([]);
  assert.equal(p.clear(0, 0, 0), true);
  assert.equal(p.clear(0, 0, 100), true);
});

test('parkingIndex accepts closed rings and lots without holes', () => {
  const p = parkingIndex([{ ring: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }]);
  assert.equal(p.clear(5, 5), false);
  assert.equal(p.clear(-0.5, 5, 1), false);   // crown over the closing edge's neighbour (x = 0)
  assert.equal(p.clear(-2, 5, 1), true);
});

// #36: flat OSM buildings collide as their drawn footprint. L-shaped ring: a 20 x 20 square without its top-right 10 x 10
// quarter (its minimum rectangle is the full square, which is what made the car stop in the open)
const L_CCW = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
const L_CW = L_CCW.slice().reverse();

test('ringPush: a circle in the cut-out corner is clear, though the min rect would block it', () => {
  for (const ring of [L_CCW, L_CW]) assert.equal(ringPush(ring, 15, 15, 1.7), null);
});

test('ringPush: a circle that touches a wall from outside is pushed straight out by the overlap', () => {
  for (const ring of [L_CCW, L_CW]) {
    const h = ringPush(ring, 15, 11, 1.7);   // 1 m above the inner wall z = 10
    assert.ok(Math.abs(h.wx) < 1e-9 && Math.abs(h.wz - 1) < 1e-9, JSON.stringify(h));
    assert.ok(Math.abs(h.pen - 0.7) < 1e-9, JSON.stringify(h));
  }
});

test('ringPush: a centre inside the footprint is pushed out through the nearest wall, by depth + radius', () => {
  for (const ring of [L_CCW, L_CW]) {
    const h = ringPush(ring, 2, 5, 1.7);     // 2 m inside the wall x = 0
    assert.ok(Math.abs(h.wx + 1) < 1e-9 && Math.abs(h.wz) < 1e-9, JSON.stringify(h));
    assert.ok(Math.abs(h.pen - 3.7) < 1e-9, JSON.stringify(h));
  }
});

test('ringPush: a centre exactly on a wall is pushed along that wall\'s outward normal', () => {
  for (const ring of [L_CCW, L_CW]) {
    const h = ringPush(ring, 5, 0, 1.7);     // on the bottom wall z = 0: outward is -z
    assert.ok(Math.abs(h.wx) < 1e-9 && Math.abs(h.wz + 1) < 1e-9, JSON.stringify(h));
    assert.equal(h.pen, 1.7);
  }
});

test('ringPush: far away is clear', () => {
  assert.equal(ringPush(L_CCW, 40, 40, 1.7), null);
});

import { bridgeChain, bankTop, pastEnd, deckLine, cutPolyline } from '../world.js';
test('bridgeChain grows a hero piece along same-named generic pieces that share an endpoint (#78)', () => {
  const P = (name, kind, pts) => ({ name, kind, pts });
  const pieces = [P('Fridolinsbrücke', 'stone', [[0, 0], [100, 0]]), P('Fridolinsbrücke', 'generic', [[100, 0], [150, 0]]),
    P('Fridolinsbrücke', 'generic', [[180, 3], [150.3, 0.2]]), P('Fridolinsbrücke', 'generic', [[150.2, 0], [180, -3]]),
    P('Andere', 'generic', [[0, 0], [-50, 0]]), P('Fridolinsbrücke', 'rail', [[100, 0], [100, 40]]), P('Fridolinsbrücke', 'generic', [[300, 0], [400, 0]])];
  assert.deepEqual(bridgeChain(pieces, 0).sort(), [0, 1, 2, 3]);       // other name, rail deck (#76) and a detached piece stay out
  assert.deepEqual(bridgeChain([P('', 'stone', [[0, 0], [1, 0]]), P('', 'generic', [[1, 0], [2, 0]])], 0), [0]);
});
test('bankTop is the first sample where the rise over the next 4 m drops below 8 %', () => {
  assert.equal(bankTop([2.6, 3.5, 4.5, 5.4, 6.6, 7.8, 8.4, 8.5, 8.55, 8.6, 8.6]), 6);   // index 5 rises (8.55 - 7.8) / 4 = 0.19, index 6 (8.6 - 8.4) / 4 = 0.05
  assert.equal(bankTop([0, 0.05, 0.1, 0.15, 0.2, 0.25]), 0);
  assert.equal(bankTop([0, 1, 2, 3, 4, 5]), 5);
  assert.equal(bankTop([5, 4, 3, 2, 1, 0]), 0);                                          // falling ground is not a bank to climb
});
test('pastEnd tells before the start, past the end and on the polyline apart', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.equal(pastEnd(pts, -1, 2), -1);
  assert.equal(pastEnd(pts, 5, 3), 0);
  assert.equal(pastEnd(pts, 11, 12), 1);
  assert.equal(pastEnd(pts, 9, 10), 0);
});
test('deckLine is linear along a -> b and clamped beyond both ends', () => {
  assert.equal(deckLine([0, 0], 7, [100, 0], 15, 50, 30), 11);
  assert.equal(deckLine([0, 0], 7, [100, 0], 15, -20, 0), 7);
  assert.equal(deckLine([0, 0], 7, [100, 0], 15, 130, 0), 15);
});
test('cutPolyline keeps the first s metres', () => {
  assert.deepEqual(cutPolyline([[0, 0], [10, 0], [10, 10]], 15), [[0, 0], [10, 0], [10, 5]]);
  assert.deepEqual(cutPolyline([[0, 0], [10, 0]], 50), [[0, 0], [10, 0]]);
  assert.deepEqual(cutPolyline([[0, 0], [10, 0]], 0), [[0, 0], [0, 0]]);
});
test('bridgeDeckOffset does not fade at ends flagged as joints (#78)', () => {
  const b = { len: 40, h0: 0, h1: 0, fade0: false };
  assert.equal(bridgeDeckOffset(b, 0), 0.3);
  assert.equal(bridgeDeckOffset(b, 40), 0);
  assert.equal(bridgeDeckOffset({ ...b, fade1: false }, 40), 0.3);
  assert.equal(bridgeDeckOffset({ len: 40, h0: 0, h1: 0 }, 0), 0);      // unflagged: today's fade
});

test('layoutFromWorld passes railBridges through and defaults to none', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [], waterSdf: {} };
  assert.deepEqual(layoutFromWorld(base).railBridges, []);
  assert.deepEqual(layoutFromWorld({ ...base, railBridges: [{ pts: [[0, 0], [1, 0]], layer: 1 }] }).railBridges, [{ pts: [[0, 0], [1, 0]], layer: 1 }]);
});

test('pointAtLength walks the polyline and clamps at the ends', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(pointAtLength(pts, 15), [10, 5]);
  assert.deepEqual(pointAtLength(pts, -3), [0, 0]);
  assert.deepEqual(pointAtLength(pts, 99), [10, 10]);
});

test('railRoadCrossings: a rail bridge over a lower, non-bridge road only', () => {
  const road = (extra) => ({ n: 'R', w: 9, bridge: false, layer: 0, pts: [[0, -20], [0, 20]], ...extra });
  const rb = [{ pts: [[-10, 5], [10, 5]], layer: 1 }];
  const [c, ...rest] = railRoadCrossings([road()], rb);
  assert.equal(rest.length, 0);
  assert.equal(c.bridge, 0); assert.equal(c.x, 0); assert.equal(c.z, 5);
  assert.equal(c.tRoad, 25); assert.equal(c.tRail, 10); assert.ok(Math.abs(c.sin - 1) < 1e-9);
  assert.deepEqual(railRoadCrossings([road({ bridge: true, layer: 1 })], rb), []);   // road bridge: road over or level with the deck
  assert.deepEqual(railRoadCrossings([road({ layer: 1 })], rb), []);                 // same layer: not under it
  assert.deepEqual(railRoadCrossings([road({ pts: [[20, -20], [20, 20]] })], rb), []);   // misses the bridge
  assert.equal(railRoadCrossings([road({ layer: undefined })], rb).length, 1);      // untagged road is layer 0
});

test('cutFloorTarget keeps 4.5 m plus the road lift under a 1.2 m deck, at most 6 m below the ground', () => {
  assert.ok(Math.abs(cutFloorTarget(20, 15) - (20 - 1.2 - 4.5 - 0.04)) < 1e-9);
  assert.equal(cutFloorTarget(10, 15), 15 - UNDERPASS.maxDepth);
});

test('cutFlat covers the deck footprint on the road plus the apron, skew-limited', () => {
  assert.equal(cutFlat(2.75, 1), 5.75);
  assert.ok(Math.abs(cutFlat(2.75, 0.1) - (2.75 / 0.3 + 3)) < 1e-9);
});

test('junctionCap raises the floor so the ramp meets each junction at its own ground', () => {
  assert.deepEqual(junctionCap(10, 6, []), { f0: 10, capped: null });
  assert.deepEqual(junctionCap(10, 6, [{ s: 50, ground: 12 }]), { f0: 10, capped: null });   // 12 - 0.08 * 44 = 8.48: the ramp is already up
  const one = junctionCap(10, 6, [{ s: 20, ground: 13 }]);                                    // 13 - 0.08 * 14 = 11.88
  assert.ok(Math.abs(one.f0 - 11.88) < 1e-9); assert.equal(one.capped.s, 20);
  const two = junctionCap(10, 6, [{ s: 20, ground: 13 }, { s: -10, ground: 12 }]);           // the second: 12 - 0.32 = 11.68
  assert.ok(Math.abs(two.f0 - 11.88) < 1e-9); assert.equal(two.capped.s, 20);
  const inBand = junctionCap(10, 6, [{ s: -4, ground: 12.5, end: true }]);                    // a piece end under the deck: no cut there at all
  assert.equal(inBand.f0, 12.5); assert.equal(inBand.capped.end, true);
});

const CUT = { pts: [[0, -100], [0, 100]], t: 100, hw: 4.5, flat: 6, f0: 10, reach: [30, 40] };   // crossing at z = 0
test('cutFloor is level under the deck band and ramps out at 8 %', () => {
  assert.equal(cutFloor(CUT, 0), 10);
  assert.equal(cutFloor(CUT, -6), 10);
  assert.ok(Math.abs(cutFloor(CUT, 16) - 10.8) < 1e-9);
  assert.ok(Math.abs(cutFloor(CUT, -16) - 10.8) < 1e-9);
});

test('cutReach ends each side where the floor meets the ground, at most flat + maxDepth / grade', () => {
  const c = { ...CUT, reach: undefined };
  assert.deepEqual(cutReach(c, (s) => (s >= 0 ? 12.4 : 10.4)), [11, 36]);   // behind: 6 + 0.4 / 0.08, ahead: 6 + 2.4 / 0.08
  assert.deepEqual(cutReach(c, () => 100), [81, 81]);
  assert.deepEqual(cutReach(c, () => 9), [0, 0]);                        // the deck is high enough: no cut
});

test('cutFloorAt: the floor inside the corridor (to the middle of the wall) and the reach, else null', () => {
  assert.equal(cutFloorAt(CUT, 0, 0), 10);
  assert.equal(cutFloorAt(CUT, 6.5, 0), 10);                             // hw 4.5 + margin 1 + wall / 2
  assert.equal(cutFloorAt(CUT, 6.6, 0), null);
  assert.ok(Math.abs(cutFloorAt(CUT, 0, 31) - 12) < 1e-9);
  assert.equal(cutFloorAt(CUT, 0, -31), null);
  assert.ok(Math.abs(cutFloorAt(CUT, 0, 40) - 12.72) < 1e-9);
  assert.equal(cutFloorAt(CUT, 0, 40.5), null);
});

test('cutBounds holds every point with a floor, padded by the wall and one cell', () => {
  const [x0, z0, x1, z1] = cutBounds(CUT);
  [-8.5, -38.5, 8.5, 48.5].forEach((want, k) => assert.ok(Math.abs([x0, z0, x1, z1][k] - want) < 1e-9, `${k}: ${[x0, z0, x1, z1][k]}`));   // reach plus hw 4.5 + margin 1 + wall 2 + 1
  for (let x = -20; x <= 20; x += 0.5) for (let z = -60; z <= 60; z += 0.5) if (cutFloorAt(CUT, x, z) !== null) assert.ok(x > x0 && x < x1 && z > z0 && z < z1, `${x},${z}`);
});

test('patch cells cover the whole footprint (clamped to the grid)', () => {
  const G = { x0: 0, z0: 0, dx: 16, dz: 16, nx: 10, nz: 10 };
  assert.deepEqual(patchCells([20, 20, 40, 33], G), [[1, 1], [2, 1], [1, 2], [2, 2]]);
  assert.deepEqual(patchCells([-11.5, -43.5, 11.5, 43.5], G), [[0, 0], [0, 1], [0, 2]]);
});

test('triLerp matches the corners and splits along u + v = 1', () => {
  assert.equal(triLerp(1, 2, 3, 4, 0, 0), 1);
  assert.equal(triLerp(1, 2, 3, 4, 0, 1), 2);
  assert.equal(triLerp(1, 2, 3, 4, 1, 1), 3);
  assert.equal(triLerp(1, 2, 3, 4, 1, 0), 4);
  assert.equal(triLerp(1, 2, 3, 4, 0.25, 0.25), 1 + 3 * 0.25 + 1 * 0.25);
});

test('mergeIntervals joins overlapping spans and sorts them', () => {
  assert.deepEqual(mergeIntervals([[30, 40], [0, 10], [5, 20]]), [[0, 20], [30, 40]]);
  assert.deepEqual(mergeIntervals([]), []);
});

test('wallStations: pieces of about `step` m on both sides at `offset`, normals pointing away from the road', () => {
  const pts = [[0, -100], [0, 100]], ws = wallStations(pts, [[90, 110], [100, 105]], 6.5, 2);   // the second span lies inside the first
  assert.equal(ws.length, 20);
  const first = ws.filter((w) => Math.abs(w.t - 91) < 1e-9);
  assert.equal(first.length, 2);
  for (const w of first) {
    assert.ok(Math.abs(Math.abs(w.x) - 6.5) < 1e-9 && Math.abs(w.z + 9) < 1e-9, `${w.x},${w.z}`);
    assert.ok(Math.abs(w.nx - Math.sign(w.x)) < 1e-9 && Math.abs(w.nz) < 1e-9);
    assert.ok(Math.abs(w.len - 2) < 1e-9 && Math.abs(w.rot - Math.PI / 2) < 1e-9);
  }
});

test('treeTrunkR_TreeHeight_ScalesWithTheTrunkNotTheCrown', () => {
  assert.equal(TREE_TRUNK, 0.06);
  assert.ok(Math.abs(treeTrunkR(6) - 0.36) < 1e-9);
  assert.ok(Math.abs(treeTrunkR(12) - 0.72) < 1e-9);
  assert.ok(treeTrunkR(12) < 0.45 * 12 / 4, 'far inside the crown (0.45 h)');
});

test('treeCollider_TreeOnTerrain_IsACircleAtTheTrunkUpToTheCrownTop', () => {
  const o = treeCollider(100, -50, 10, 4);
  const r = treeTrunkR(10);
  assert.deepEqual(o, { x: 100, z: -50, hw: r, hd: r, c: 1, s: 0, h: 14, circle: r, low: true });   // low: a car above the crown top passes over
});

test('layoutFromWorld draws trail roads as gravel (#127)', () => {
  const w = { roads: [{ cls: 'track', trail: true, pts: [[0, 0], [10, 0]], w: 3 }, { cls: 'residential', pts: [[0, 0], [10, 0]], w: 5.5 }],
              junctions: [], water: [], buildings: [], rail: [], anchors: {}, bbox: [], waterSdf: null };
  assert.deepEqual(layoutFromWorld(w).roads.map(r => r.tex), ['gravel', 'road']);
});

test('Ehrendingen has its own village names (#127)', () => {
  assert.deepEqual(VILLAGES_EHRENDINGEN.map(v => v.t), ['UNTEREHRENDINGEN', 'OBEREHRENDINGEN']);
});

test('nationalBorder: a German line without a named Swiss neighbour is not the border (#73)', () => {
  const B = [{ names: ['Murg', 'Sisseln'], pts: [[0, 0], [10, 0]] }, { names: ['Murg'], pts: [[10, 0], [10, 50]] }];
  assert.deepEqual(nationalBorder(B), [[0, 0], [10, 0]]);
});

test('nationalBorder: joins the CH/DE lines in any order and direction, skips inner ones', () => {
  const B = [
    { names: ['Murg', 'Sisseln'], pts: [[100, 0], [200, 10]] },
    { names: ['Bad Säckingen', 'Murg'], pts: [[0, -50], [0, -500]] },          // German–German: not the border
    { names: ['Bad Säckingen', 'Stein'], pts: [[100, 0], [0, 5], [-100, 0]] }, // joins at the start, reversed
    { names: ['Sisseln', 'Stein'], pts: [[0, 5], [0, 400]] },                  // Swiss–Swiss: not the border
  ];
  assert.deepEqual(nationalBorder(B), [[-100, 0], [0, 5], [100, 0], [200, 10]]);
  assert.equal(nationalBorder([{ names: ['Murg', 'Sisseln'], pts: [[0, 0], [1, 0]] }, { names: ['Bad Säckingen', 'Stein'], pts: [[500, 0], [600, 0]] }]), null);
  assert.equal(nationalBorder([]), null);
  assert.deepEqual(BORDER_DE, ['Bad Säckingen', 'Murg']);
});

test('sameBank: even number of border crossings, null border means same bank', () => {
  const border = [[-1000, 0], [0, 10], [1000, 0]];
  assert.equal(sameBank(border, 200, 100, 200, -100), false);
  assert.equal(sameBank(border, 0, 100, 500, 300), true);
  assert.equal(sameBank(border, -500, -100, 500, -100), true);
  assert.equal(sameBank(null, 200, 100, 200, -100), true);
});

test('bankFade: 1 on the border, 0 from VILLAGE_BANK_FADE on, 1 without a border', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const border = [[-1000, 0], [1000, 0]];
  assert.equal(VILLAGE_BANK_FADE, 150);
  assert.equal(bankFade(border, 0, 0), 1);
  assert.ok(near(bankFade(border, 0, 75), 0.5));
  assert.equal(bankFade(border, 0, 150), 0);
  assert.equal(bankFade(border, 0, -400), 0);
  assert.equal(bankFade(null, 0, 9999), 1);
});

test('villageQuiet: 0 inside any village, ramps over VILLAGE_FADE.in, 1 in the open', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const V = [{ t: 'A', x: 0, z: 0, r: 400 }, { t: 'B', x: 2000, z: 0, r: 400 }];
  assert.equal(villageQuiet(V, 0, 0), 0);
  assert.ok(near(villageQuiet(V, 500, 0), 0.5));
  assert.equal(villageQuiet(V, 1000, 0), 1);
  assert.equal(villageQuiet([], 0, 0), 1);
});

test('villageNames: nothing inside a village, other bank only near the border', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const V = [{ t: 'HOME', x: 0, z: 1000, r: 400 }, { t: 'NEAR', x: 1500, z: 1000, r: 400 }, { t: 'ACROSS', x: 0, z: -1000, r: 400 }];
  const river = [[-5000, 0], [5000, 0]];
  assert.deepEqual(villageNames(V, 0, 1000, river), []);                                         // inside HOME
  assert.deepEqual(villageNames(V, 700, 1000, river).map(l => l.t), ['HOME', 'NEAR']);           // open country, ACROSS is over the river
  assert.deepEqual(villageNames(V, 700, 1000, null).map(l => l.t), ['HOME', 'NEAR', 'ACROSS']);  // no border: as in #16
  const atBank = villageNames(V, 0, 75, river);                                                  // 75 m from the border
  assert.deepEqual(atBank.map(l => l.t), ['HOME', 'ACROSS', 'NEAR']);
  assert.ok(near(atBank[1].opacity, 0.5));
  assert.deepEqual(villageNames(V, 0, 500, river).map(l => [l.t, l.opacity]), [['HOME', 0.5], ['NEAR', 0.5]]); // 100 m outside HOME
  assert.deepEqual(Object.keys(atBank[0]), ['t', 'x', 'z', 'd', 'opacity', 'h']);
});

const SQUARE = { ring: [[0, 0], [100, 0], [100, 100], [0, 100]] };
const WITH_HOLE = { ring: [[0, 0], [200, 0], [200, 200], [0, 200]], holes: [[[80, 80], [120, 80], [120, 120], [80, 120]]] };

test('rng is deterministic and in [0, 1)', () => {
  const a = rng(13), b = rng(13), xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b()));
  assert.ok(xs.every(v => v >= 0 && v < 1) && new Set(xs).size === 5);
});

test('forestIndex: inside, outside, hole, island in a hole, empty', () => {
  const fi = forestIndex([WITH_HOLE, { ring: [[90, 90], [110, 90], [110, 110], [90, 110]] }]);
  assert.equal(fi.step, 8);
  assert.equal(fi.inside(40, 40), true);
  assert.equal(fi.inside(-20, 40), false);
  assert.equal(fi.inside(300, 300), false);
  assert.equal(fi.inside(84, 84), false);      // clearing
  assert.equal(fi.inside(100, 100), true);     // island wood inside the clearing
  assert.equal(forestIndex([]).inside(0, 0), false);
});

test('forestEdges: inward normals point to the centre, long edges are split, slivers get no normal', () => {
  const fi = forestIndex([SQUARE]);
  const e = forestEdges([SQUARE], fi);
  assert.equal(e.length, 4 * 3);                                       // 100 m sides split into 3 x 33.3 m
  for (const s of e) {
    assert.ok(Math.abs(s.len - 100 / 3) < 1e-9);
    const px = s.mx + s.nx * 10, pz = s.mz + s.nz * 10;              // 10 m along the normal lands inside
    assert.ok(px > 0 && px < 100 && pz > 0 && pz < 100, JSON.stringify(s));
    assert.ok(Math.abs(Math.hypot(s.nx, s.nz) - 1) < 1e-9);
  }
  const sliver = { ring: [[0, 0], [100, 0], [100, 3], [0, 3]] };       // 3 m wide: no mask cell inside on either side
  const se = forestEdges([sliver], forestIndex([sliver]));
  assert.ok(se.some(s => s.nx === 0 && s.nz === 0));
  assert.deepEqual(forestEdges([], forestIndex([])), []);
});

test('forestTrees: seeded, edge every 6 m, fill one per 600 m2, cap thins the fill only', () => {
  const fi = forestIndex([SQUARE]), edges = forestEdges([SQUARE], fi);
  const a = forestTrees([SQUARE], fi, edges, rng(13)), b = forestTrees([SQUARE], fi, edges, rng(13));
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.edge.length - 400 / 6) <= 8, a.edge.length);       // 12 segments x round(33.3 / 6) = 72
  assert.ok(Math.abs(a.fill.length - 10000 / 600) <= 10, a.fill.length);   // the 8 m mask rounds the square out to ~104 m
  assert.equal(a.thinned, 0);
  for (const [x, z, h] of a.edge) { assert.ok(x > -0.01 && x < 100.01 && z > -0.01 && z < 100.01); assert.ok(h >= 7 && h < 12); }
  for (const [, , h] of a.fill) assert.ok(h >= 8 && h < 14);
  const capped = forestTrees([SQUARE], fi, edges, rng(13), { ...FOREST_BUDGET, cap: a.edge.length + 5 });
  assert.equal(capped.edge.length, a.edge.length);
  assert.equal(capped.fill.length, 5);
  assert.equal(capped.thinned, a.fill.length - 5);
  const tight = forestTrees([SQUARE], fi, edges, rng(13), { ...FOREST_BUDGET, cap: 10 });
  assert.equal(tight.edge.length, a.edge.length);                        // the edge row is never thinned
  assert.equal(tight.fill.length, 0);
});

test('tileKey groups by 512 m cells', () => {
  assert.equal(tileKey(10, 10, 512), '0,0');
  assert.equal(tileKey(-1, 600, 512), '-1,1');
  assert.equal(tileKey(1023.9, -0.1, 512), '1,-1');
});

test('layoutFromWorld passes forests and defaults to an empty list (#13)', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.deepEqual(layoutFromWorld(base).forests, []);
  assert.deepEqual(layoutFromWorld({ ...base, forests: [SQUARE] }).forests, [SQUARE]);
});
