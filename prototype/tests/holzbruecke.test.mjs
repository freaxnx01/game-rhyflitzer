import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLZ, orientEastWest, joinPolylines, frameStations, pierStations, chapelOpenings, wallCover, inOpening, chapelPlan, BORDER, borderCrossing } from '../holzbruecke.js';

// the bridge line of data/world_hochrhein.json (OSM w85692214), Stein -> Säckingen
const LINE = [[-1079.9, -75.0], [-1111.5, -79.5], [-1135.8, -81.8], [-1161.9, -81.5], [-1220.4, -86.8], [-1284.7, -94.2]];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('HOLZ carries the measured roof and the six pier stations from the Stein end', () => {
  assert.equal(HOLZ.eave, 4.2);
  assert.equal(HOLZ.ridge, 6.4);
  assert.deepEqual(HOLZ.pierFractions, [0.1452, 0.2738, 0.3928, 0.5384, 0.6820, 0.8497]);
});

test('HOLZ.chapels: two polygonal ones on the second pier from Säckingen, a pent one on the fourth', () => {
  assert.deepEqual(HOLZ.chapels, [
    { pier: 4, side: 1, kind: 'polygon', depth: 3.0, length: 4.0 },
    { pier: 4, side: -1, kind: 'polygon', depth: 1.7, length: 4.0 },
    { pier: 2, side: 1, kind: 'pent', depth: 1.0, length: 2.0 },
  ]);
});

test('orientEastWest puts the eastern (Stein) end first', () => {
  assert.deepEqual(orientEastWest(LINE), LINE);
  assert.deepEqual(orientEastWest(LINE.slice().reverse()), LINE);
});

test('joinPolylines returns a single piece unchanged', () => {
  assert.deepEqual(joinPolylines([LINE]), LINE);
});

test('joinPolylines chains pieces that share an endpoint, whatever their direction', () => {
  const a = LINE.slice(0, 3), b = LINE.slice(2, 5).reverse(), c = LINE.slice(4);
  const joined = joinPolylines([b, c, a]);
  assert.deepEqual(orientEastWest(joined), LINE);
});

test('joinPolylines leaves out a piece that touches nothing', () => {
  const stray = [[500, 500], [510, 500]];
  assert.deepEqual(joinPolylines([LINE, stray]), LINE);
});

test('frameStations puts a frame on every vertex and keeps every gap within the bay', () => {
  const f = frameStations(LINE, HOLZ.bay);
  for (const [x, z] of LINE) assert.ok(f.some(s => near(s.x, x) && near(s.z, z)), `no frame at ${x}, ${z}`);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].t - f[i - 1].t <= HOLZ.bay + 1e-9 && f[i].t > f[i - 1].t);
  assert.ok(f.length >= 40);
  const last = f[f.length - 1], end = LINE[LINE.length - 1];
  assert.ok(near(last.x, end[0]) && near(last.z, end[1]));
});

test('a frame on a vertex points along the segment that starts there; the last frame along the last segment', () => {
  const f = frameStations([[0, 0], [-10, 0], [-10, 10]], 5);
  assert.deepEqual(f.map(s => [s.x, s.z, s.ux, s.uz]), [[0, 0, -1, 0], [-5, 0, -1, 0], [-10, 0, 0, 1], [-10, 5, 0, 1], [-10, 10, 0, 1]]);
});

test('frameStations ignores a repeated point instead of producing NaN directions', () => {
  const f = frameStations([[0, 0], [0, 0], [-10, 0], [-10, 0]], 5);
  assert.deepEqual(f.map(s => [s.x, s.z, s.ux, s.uz]), [[0, 0, -1, 0], [-5, 0, -1, 0], [-10, 0, -1, 0]]);
});

test('frameStations refuses a line without two distinct points', () => {
  assert.throws(() => frameStations([[1, 1], [1, 1]], 5), /at least two/);
});

test('pierStations: six piers at the documented fractions, in order, with unit directions', () => {
  const p = pierStations(LINE, HOLZ.pierFractions), len = 205.9;
  assert.equal(p.length, 6);
  p.forEach((s, i) => {
    assert.ok(Math.abs(s.t - HOLZ.pierFractions[i] * len) < 0.1, `pier ${i} at ${s.t}`);
    assert.ok(near(Math.hypot(s.ux, s.uz), 1, 1e-9));
    assert.ok(i === 0 || s.t > p[i - 1].t);
  });
});

test('the piers stand close to the bends of the OSM line (the bends are the piers)', () => {
  const p = pierStations(LINE, HOLZ.pierFractions);
  for (const [i, v] of [[0, 1], [1, 2], [2, 3], [4, 4]]) assert.ok(Math.hypot(p[i].x - LINE[v][0], p[i].z - LINE[v][1]) < 3, `pier ${i}`);
});

const PIERS = [10, 20, 30, 40, 50, 60].map(t => ({ t }));

test('chapelOpenings: each chapel is an opening in the wall, its length centred on its pier, on its own side', () => {
  assert.deepEqual(chapelOpenings(PIERS, HOLZ.chapels), [
    { side: 1, t0: 48, t1: 52 }, { side: -1, t0: 48, t1: 52 }, { side: 1, t0: 29, t1: 31 },
  ]);
});

test('wallCover: a bay keeps the stretches outside an opening on its side, as fractions of the bay', () => {
  const o = [{ side: 1, t0: 4, t1: 6 }];
  assert.deepEqual(wallCover(0, 10, 1, o), [[0, 0.4], [0.6, 1]]);
  assert.deepEqual(wallCover(0, 10, -1, o), [[0, 1]]);
  assert.deepEqual(wallCover(0, 10, 1, [{ side: 1, t0: 8, t1: 12 }]), [[0, 0.8]]);
  assert.deepEqual(wallCover(5, 7, 1, [{ side: 1, t0: 4, t1: 8 }]), []);
  assert.deepEqual(wallCover(0, 10, 1, [{ side: 1, t0: 2, t1: 3 }, { side: 1, t0: 7, t1: 8 }]), [[0, 0.2], [0.3, 0.7], [0.8, 1]]);
});

test('inOpening: a station inside a chapel opening on that side', () => {
  const o = [{ side: 1, t0: 4, t1: 6 }];
  assert.equal(inOpening(5, 1, o), true);
  assert.equal(inOpening(5, -1, o), false);
  assert.equal(inOpening(7, 1, o), false);
});

test('chapelPlan: a polygonal chapel is a half-hexagon out from the wall, a pent one a box; the eave stands the overhang further out', () => {
  assert.deepEqual(chapelPlan({ kind: 'polygon', depth: 3, length: 4 }, 0.3), {
    outline: [[-2, 0], [-1, 3], [1, 3], [2, 0]], eave: [[-2.3, 0], [-1.15, 3.3], [1.15, 3.3], [2.3, 0]] });
  assert.deepEqual(chapelPlan({ kind: 'pent', depth: 1, length: 2 }, 0.3), {
    outline: [[-1, 0], [-1, 1], [1, 1], [1, 0]], eave: [[-1.3, 0], [-1.3, 1.3], [1.3, 1.3], [1.3, 0]] });
});

test('BORDER_OldAndNew_AreSteppedEightPointTwoMetresAndPaintedNarrow', () => {
  assert.deepEqual(BORDER, { old: 102, shift: 8.2, width: 0.18 });
});

test('borderCrossing_StraightBridge_PointIsMeasuredFromTheSaeckingenEnd', () => {
  const east = [[200, 0], [0, 0]];   // Stein first, Saeckingen last
  const c = borderCrossing(east, 102, 2.6);
  assert.ok(near(c.x, 102) && near(c.z, 0));
  assert.ok(near(c.ux, -1) && near(c.uz, 0));
  assert.ok(near(c.t, 98));
});

test('borderCrossing_StraightBridge_EndsSpanTheDeckAcrossTheBridge', () => {
  const c = borderCrossing([[200, 0], [0, 0]], 110.2, 2.6);
  assert.ok(near(c.a[0], 110.2) && near(c.b[0], 110.2));
  assert.ok(near(Math.abs(c.a[1] - c.b[1]), 5.2));
});

test('borderCrossing_RealLine_NewBorderLiesTowardsSteinOfTheOldOne', () => {
  const o = borderCrossing(LINE, BORDER.old, 2.6), n = borderCrossing(LINE, BORDER.old + BORDER.shift, 2.6);
  assert.ok(near(o.t - n.t, 8.2, 1e-9));
});

test('borderCrossing_BeyondTheBridge_Throws', () => {
  assert.throws(() => borderCrossing([[200, 0], [0, 0]], 250, 2.6), /bridge/);
});
