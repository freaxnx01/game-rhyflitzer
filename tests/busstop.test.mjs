// #712: where a Postauto stop's pole, shelter and zigzag go -- pure. node --test tests/busstop.test.mjs
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STOP, rectClearance, roadEdgeDist, stopLayout, zigzagLine, stopKey, stopRows, stopEnds, sheetLines, shelterCollider } from '../busstop.js';
import { buildGraph, cumulative } from '../route.js';
import { BUS } from '../bus.js';
import { busRoute, busPose } from '../postauto.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const road = (pts, w = 6) => ({ n: '', cls: 'primary', w, bridge: false, pts });
// a bus standing east along z = 0, centred at x = 100, 12.2 x 2.55
const POSE = { x: 100, z: 0, th: 0 };
const STAND = { length: BUS.length, width: BUS.width };

test('rectClearance: signed distance to the bus box, negative inside', () => {
  assert.ok(near(rectClearance(100, 0, POSE, STAND), -BUS.width / 2));
  assert.ok(near(rectClearance(100, 2, POSE, STAND), 2 - BUS.width / 2));          // beside the flank
  assert.ok(near(rectClearance(110, 0, POSE, STAND), 10 - BUS.length / 2));        // past the nose
  const south = { x: 0, z: 0, th: Math.PI / 2 };                                    // heading south: the flank is along z
  assert.ok(near(rectClearance(2, 0, south, STAND), 2 - BUS.width / 2));
});

test('roadEdgeDist: distance to the nearest asphalt edge, negative on the road', () => {
  const roads = [road([[0, 0], [200, 0]], 6), road([[50, -50], [50, 50]], 4)];
  assert.ok(near(roadEdgeDist(100, 5, roads), 2));
  assert.ok(near(roadEdgeDist(100, 1, roads), -2));
  assert.ok(near(roadEdgeDist(53, 20, roads), 1));     // the cross road is nearer there
  assert.equal(roadEdgeDist(0, 0, []), Infinity);
});

test('stopLayout: a straight stop stays put, pole 0.6 m beyond the point away from the road, shelter behind it', () => {
  const roads = [road([[0, 0], [200, 0]], 6)];
  const stop = { uic: '1', name: 'S', s: 100, x: 100, z: 3.5, rot: 0 };            // w/2 + 0.5 right of eastward travel
  const pose = { x: 100, z: 3.5 - BUS.width / 2 - 0.3, th: 0 };                     // the bus at the kerb like busOffset
  const lay = stopLayout(stop, [pose], roads);
  assert.equal(lay.shift, 0); assert.equal(lay.pushed, 0); assert.equal(lay.yaw, 0);
  assert.ok(near(lay.pole[0], 100) && near(lay.pole[1], 4.1));
  assert.ok(near(lay.shelter.z, 4.1 + 1.2));
  assert.ok(lay.shelter.corners.every(([x, z]) => z >= 4.1 + 0.3 - 1e-9 && Math.abs(x - 100) <= 2 + 1e-9));
  assert.ok(rectClearance(...lay.pole, pose, STAND) >= STOP.clear);
});

test('stopLayout: a bus standing across the kerb slides the stop along the road, then pushes it out', () => {
  const roads = [road([[0, 0], [200, 0]], 6)];
  const stop = { uic: '1', name: 'S', s: 100, x: 100, z: 3.5, rot: 0 };
  const diagonal = { x: 100, z: 2, th: -1.2 };                                      // nose swung over the kerb line
  const lay = stopLayout(stop, [diagonal], roads);
  assert.notEqual(lay.shift, 0);
  assert.ok(lay.shelter, 'keeps a shelter');
  for (const p of [lay.pole, ...lay.shelter.corners]) assert.ok(rectClearance(...p, diagonal, STAND) >= STOP.clear - 1e-9);
  assert.ok(roadEdgeDist(...lay.pole, roads) >= STOP.poleRoad - 1e-9);
});

test('stopLayout: no clear spot within reach -> sign only, on the best-clearance pole, shelter null', () => {
  // asphalt on both sides: a 6 m road and a parallel 30 m apron right behind the kerb
  const roads = [road([[0, 0], [200, 0]], 6), road([[0, 19], [200, 19]], 30)];
  const stop = { uic: '1', name: 'S', s: 100, x: 100, z: 3.5, rot: 0 };
  const lay = stopLayout(stop, [POSE], roads);
  assert.equal(lay.shelter, null);
  assert.ok(Array.isArray(lay.pole));
  // every candidate sits on the apron's asphalt, so the score falls with every push out: the best-clearance
  // candidate is the nearest one (shift 0, push 0), not the last shift+push the generator produced
  assert.equal(lay.shift, 0);
  assert.equal(lay.pushed, 0);
  assert.ok(near(lay.pole[0], 100) && near(lay.pole[1], 4.1));
  const score = (p) => Math.min(rectClearance(...p, POSE, STAND), roadEdgeDist(...p, roads));
  assert.ok(score(lay.pole) >= score([100 + STOP.shift * STOP.maxShift, 3.5 + STOP.poleOut + STOP.maxPush]));
});

test('stopLayout: westward travel mirrors the side', () => {
  const roads = [road([[0, 0], [200, 0]], 6)];
  const stop = { uic: '1', name: 'S', s: 100, x: 100, z: -3.5, rot: Math.PI };     // right of westward travel is north (-z)
  const lay = stopLayout(stop, [{ x: 100, z: -2, th: Math.PI }], roads);
  assert.ok(lay.pole[1] < -3.5 && lay.shelter.z < lay.pole[1]);
});

test('zigzagLine: 16 m along the kerb, inside the asphalt edge, clamped to the route', () => {
  const pts = [[0, 0], [200, 0]], cum = cumulative(pts), route = { pts, cum, len: 200 };
  const line = zigzagLine(route, 100, 6);
  assert.ok(near(line[0][0], 92) && near(line.at(-1)[0], 108));
  assert.ok(line.every(([, z]) => near(z, 3 - STOP.zigzag.w / 2)));
  assert.ok(line.length >= 5);
  assert.ok(near(zigzagLine(route, 3, 6)[0][0], 0));
});

test('stopKey: one key per distinct point', () => {
  assert.equal(stopKey({ uic: '8582522', x: 1965.8, z: 834.1 }), '8582522:1965.8:834.1');
});

test('stopRows: one row per line and direction, none for a route that ends here', () => {
  const rows = stopRows([{ line: '133', dest: 'Stein-Säckingen, Bahnhof', last: false }, { line: '133', dest: 'Frick, Bahnhof', last: true }]);
  assert.deepEqual(rows, [{ line: '133', dest: 'Stein-Säckingen, Bahnhof' }]);
  const both = stopRows([{ line: '133', dest: 'Stein-Säckingen, Bahnhof', last: false }, { line: '133', dest: 'Frick, Bahnhof', last: false }, { line: '133', dest: 'Frick, Bahnhof', last: false }]);
  assert.deepEqual(both, [{ line: '133', dest: 'Frick, Bahnhof' }, { line: '133', dest: 'Stein-Säckingen, Bahnhof' }]);   // deduped, sorted
  assert.ok(rows.every((r) => !/postauto/i.test(r.dest)), 'no brand text on the sign');
});

test('stopEnds_LastStopOfARouteThatEndsInTheMap_EndsThere', () => {
  assert.equal(stopEnds(10, 11, [false, false]), true);
  assert.equal(stopEnds(9, 11, [false, false]), false);
  assert.equal(stopEnds(8, 9, undefined), true);            // no cut flags: ends at its last stop
});
test('stopEnds_LastInMapStopOfARouteThatLeavesTheMap_DoesNotEnd', () => {
  assert.equal(stopEnds(8, 9, [false, true]), false);       // 143 at Breitenacher drives on to Kaisten
  assert.equal(stopEnds(8, 9, [true, false]), true);
});
test('sheetLines_RowsOfTwoLines_EachLineOnceSorted', () => {
  assert.equal(sheetLines([{ line: '143', dest: 'A' }, { line: '133', dest: 'B' }, { line: '143', dest: 'C' }]), '133 143');
  assert.equal(sheetLines([{ line: '133', dest: 'B' }]), '133');
  assert.equal(sheetLines([]), '');
});

// the real world: every stop keeps its shelter, nothing of it within 0.5 m of a standing bus or on asphalt
const WORLD = new URL('../data/world_hochrhein.json', import.meta.url);
test('world_hochrhein: every stop point lays out clear of every standing bus and every road', { skip: !fs.existsSync(WORLD) }, () => {
  const L = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
  const G = buildGraph(L.roads), byKey = new Map();
  for (const br of L.busRoutes) { const R = busRoute(br, L.roads, G); for (const st of R.stops) { const k = stopKey(st); if (!byKey.has(k)) byKey.set(k, { st, poses: [] }); byKey.get(k).poses.push(busPose(R, st.s)); } }
  assert.equal(byKey.size, L.busRoutes.some((r) => r.line === '143') ? 24 : 20);
  for (const { st, poses } of byKey.values()) {
    const lay = stopLayout(st, poses, L.roads);
    assert.ok(lay.shelter, `${st.name}: no shelter`);
    for (const p of [lay.pole, ...lay.shelter.corners]) for (const pose of poses) assert.ok(rectClearance(...p, pose, STAND) >= STOP.clear - 1e-9, `${st.name}: ${rectClearance(...p, pose, STAND)}`);
    for (const p of lay.shelter.corners) assert.ok(roadEdgeDist(...p, L.roads) >= -1e-9, `${st.name}: shelter on asphalt`);
    assert.ok(Math.abs(lay.shift) <= 6 && lay.pushed <= 2, `${st.name}: shift ${lay.shift} push ${lay.pushed}`);
  }
});

// rows per stop (uic): Frick Bahnhof has two points 5 m apart, and the 11533941 one is a pure terminus --
// per-point calls would leave it without a single row (AC: every stop has at least one)
test('world_hochrhein: every stop has at least one row; Frick Bahnhof shows only the way to Stein-Säckingen', { skip: !fs.existsSync(WORLD) }, () => {
  const L = JSON.parse(fs.readFileSync(WORLD, 'utf8')), calls = new Map();
  for (const br of L.busRoutes) for (const [i, st] of br.stops.entries()) { if (!calls.has(st.uic)) calls.set(st.uic, { st, calls: [] }); calls.get(st.uic).calls.push({ line: br.line, dest: br.to, last: stopEnds(i, br.stops.length, br.cut) }); }
  for (const { st, calls: c } of calls.values()) assert.ok(stopRows(c).length >= 1, `${st.name}: no row`);
  const frick = [...calls.values()].filter(({ st }) => st.uic === '8500583');
  assert.ok(frick.length >= 1);
  for (const { calls: c } of frick) assert.deepEqual(stopRows(c), [{ line: '133', dest: 'Stein-Säckingen, Bahnhof' }]);
  if (L.busRoutes.some((r) => r.line === '143')) {   // #767: after the data rebuild
    for (const { st, calls: c } of calls.values()) if (st.uic === '8572416') assert.deepEqual(stopRows(c), [{ line: '143', dest: 'Laufenburg, Bahnhof' }, { line: '143', dest: 'Stein-Säckingen, Bahnhof' }]);
    for (const { st, calls: c } of calls.values()) if (st.uic === '8572748') assert.deepEqual(stopRows(c), [{ line: '133', dest: 'Frick, Bahnhof' }, { line: '143', dest: 'Laufenburg, Bahnhof' }]);
  }
});

// #760: the shelter as one car-only solid box -- solid for the car, the heli floor and the camera; on foot you step in under the roof
test('shelterCollider: one car-only box over the shelter, hw along the kerb, top at the roof', () => {
  const lay = { yaw: Math.PI / 6, pole: [0, 0], shelter: { x: 3, z: 4, corners: [] } };
  const o = shelterCollider(lay, 10);
  assert.equal(o.x, 3); assert.equal(o.z, 4);
  assert.ok(near(o.hw, STOP.shelter.w / 2)); assert.ok(near(o.hd, STOP.shelter.d / 2));
  assert.ok(near(o.c, Math.cos(Math.PI / 6))); assert.ok(near(o.s, Math.sin(Math.PI / 6)));
  assert.ok(near(o.h, 10 + STOP.shelter.h + 0.25));
  assert.equal(o.carOnly, true);
});

test('shelterCollider: a sign-only stop has no collider', () => {
  assert.equal(shelterCollider({ yaw: 0, pole: [0, 0], shelter: null }, 0), null);
});

test('shelterCollider: the box covers exactly the shelter corners stopLayout computes', () => {
  const R = road([[0, 0], [200, 0]]);
  const lay = stopLayout({ x: 100, z: 3.5, rot: 0 }, [], [R]);
  const o = shelterCollider(lay, 0);
  for (const [x, z] of lay.shelter.corners) {
    const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
    assert.ok(near(Math.abs(lx), o.hw) && near(Math.abs(lz), o.hd), [x, z, lx, lz]);
  }
});