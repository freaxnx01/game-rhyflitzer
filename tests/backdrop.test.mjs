import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { BACKDROP_SCALE, HAZE, hazeAt, curveDrop, backdropVisible, heightAt, backdropMesh, horizon } from '../backdrop.js';
import { parseMmh } from '../worlds.js';

const FILE = new URL('../data/backdrop_hochrhein.mmh', import.meta.url);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// 4 x 4 grid, 100 m steps, one NaN sample in the middle
const tiny = () => {
  const hdr = { w: 4, h: 4, step: 100, x0: 0, z0: 0, hole: [100, 100, 100, 100] };
  const data = new Float32Array(16).map((_, k) => k);
  data[5] = NaN;
  return { hdr, data };
};

test('hazeAt: floor up to 2 km, rises with distance, stays below max', () => {
  assert.equal(hazeAt(0), HAZE.min);
  assert.equal(hazeAt(2000), HAZE.min);
  assert.ok(Math.abs(hazeAt(3000) - 0.5) < 0.02);
  assert.ok(hazeAt(20000) > 0.8 && hazeAt(20000) < HAZE.max);
  assert.ok(hazeAt(9000) > hazeAt(5000));
});

test('curveDrop: about 6.8 m at 10 km (refraction k = 0.13)', () => {
  assert.ok(Math.abs(curveDrop(10000) - 6.83) < 0.05);
});

test('backdropVisible: surface only, never underwater or in the cave', () => {
  assert.equal(backdropVisible({ surface: true, underwater: false, cave: false }), true);
  assert.equal(backdropVisible({ surface: true, underwater: true, cave: false }), false);
  assert.equal(backdropVisible({ surface: true, underwater: false, cave: true }), false);
  assert.equal(backdropVisible({ surface: false, underwater: false, cave: false }), false);
});

test('heightAt: bilinear inside, NaN next to a hole sample and outside', () => {
  const { hdr, data } = tiny();
  assert.equal(heightAt(hdr, data, 250, 250), (10 + 11 + 14 + 15) / 4);
  assert.ok(Number.isNaN(heightAt(hdr, data, 50, 50)));
  assert.ok(Number.isNaN(heightAt(hdr, data, -10, 50)));
});

test('backdropMesh: skips quads touching NaN, faces up, far quads first', () => {
  const { hdr, data } = tiny();
  const m = backdropMesh(hdr, data, hex);
  assert.equal(m.tris, 2 * (9 - 4));
  assert.equal(m.index.length, m.tris * 3);
  for (const k of m.index) assert.notEqual(k, 5);
  const p = (k) => [m.position[k * 3], m.position[k * 3 + 1], m.position[k * 3 + 2]];
  const [a, b, c] = [p(m.index[0]), p(m.index[1]), p(m.index[2])];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  assert.ok(u[2] * v[0] - u[0] * v[2] > 0, 'normal y > 0');
  const r = (t) => { const q = [0, 1, 2].map((n) => p(m.index[t * 3 + n])); return Math.hypot((q[0][0] + q[1][0] + q[2][0]) / 3 - 100, (q[0][2] + q[1][2] + q[2][2]) / 3 - 100); };
  assert.ok(r(0) > r(m.tris - 1), 'triangle centroids: farthest from the hole centre first');
  assert.equal(m.tint.length, m.position.length);
});

test('shipped backdrop: small, Copernicus, under the triangle budget', { skip: !existsSync(FILE) }, () => {
  assert.ok(statSync(FILE).size <= 200_000);
  const { hdr, data } = parseMmh(readFileSync(FILE));
  assert.equal(hdr.kind, 'backdrop');
  assert.ok(hdr.sources.some((s) => s.includes('Copernicus')));
  const m = backdropMesh(hdr, data, hex);
  assert.ok(m.tris > 40_000 && m.tris <= 70_000, String(m.tris));
  // from any corner of the play area to any corner of the grid, scaled, stays inside the 4200 m far plane
  const [hx0, hz0, hx1, hz1] = hdr.hole, gx1 = hdr.x0 + (hdr.w - 1) * hdr.step, gz1 = hdr.z0 + (hdr.h - 1) * hdr.step;
  let far = 0;
  for (const [cx, cz] of [[hx0, hz0], [hx0, hz1], [hx1, hz0], [hx1, hz1]]) for (const [gx, gz] of [[hdr.x0, hdr.z0], [hdr.x0, gz1], [gx1, hdr.z0], [gx1, gz1]]) far = Math.max(far, Math.hypot(gx - cx, gz - cz));
  assert.ok(far * BACKDROP_SCALE < 4000, String(far));
});

test('shipped backdrop: the Hotzenwald ridge stands 3.5-6.5 deg over the deck, 2.8-6 km north', { skip: !existsSync(FILE) }, () => {
  const { hdr, data } = parseMmh(readFileSync(FILE));
  const eye = { x: 304.8, y: 47.6, z: 427.1 };   // Plattform deck eye, metres above base 284
  const best = [-15, -10, -5, 0, 5, 10, 15].map((az) => horizon(hdr, data, eye, az)).reduce((p, q) => (q.elev > p.elev ? q : p));
  assert.ok(best.elev >= 3.5 && best.elev <= 6.5, JSON.stringify(best));
  assert.ok(best.dist >= 2800 && best.dist <= 6000, JSON.stringify(best));
});
