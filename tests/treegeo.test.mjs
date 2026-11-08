import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirHash, lumpyBall, tieredCone, crownFor, CROWN_BUDGET, SPRUCE_TIERS } from '../treegeo.js';
import { SPECIES } from '../trees.js';

const TIERS = ['fine', 'coarse'];
const vec = (a, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
const faces = (c) => Array.from({ length: c.tris }, (_, f) => [0, 1, 2].map(k => vec(c.position, f * 3 + k)));
const minMax = (c, axis) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < c.position.length / 3; i++) { const v = c.position[i * 3 + axis]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi]; };
const maxRadius = (c) => { let r = 0; for (let i = 0; i < c.position.length / 3; i++) r = Math.max(r, Math.hypot(c.position[i * 3], c.position[i * 3 + 2])); return r; };

test('dirHash is deterministic, in [0, 1), and differs by seed and direction', () => {
  assert.equal(dirHash([0, 1, 0], 1), dirHash([0, 1, 0], 1));
  assert.equal(dirHash([0.3, 0.4, 0.5], 2), dirHash([0.3 + 1e-7, 0.4, 0.5], 2), 'float noise never changes a lump');
  assert.notEqual(dirHash([0, 1, 0], 1), dirHash([0, 1, 0], 2));
  assert.notEqual(dirHash([0, 1, 0], 1), dirHash([1, 0, 0], 1));
  for (let i = 0; i < 50; i++) { const u = dirHash([Math.sin(i), Math.cos(i * 1.3), Math.sin(i * 0.7)], i); assert.ok(u >= 0 && u < 1); }
});

test('a crown is non-indexed flat-shaded arrays: 9 floats per triangle, unit face normals', () => {
  for (const c of [lumpyBall(0, 0, 0), lumpyBall(1, 0.2, 3), tieredCone(SPRUCE_TIERS.fine.tiers, 7)]) {
    assert.equal(c.position.length, c.tris * 9); assert.equal(c.normal.length, c.tris * 9); assert.equal(c.color.length, c.tris * 9);
    for (let f = 0; f < c.tris; f++) {
      const n = vec(c.normal, f * 3); assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5, `face ${f} normal length`);
      for (let k = 1; k < 3; k++) assert.deepEqual(vec(c.normal, f * 3 + k), n, 'one normal per face');
    }
  }
});

test('lumpyBall: 20 or 80 triangles, base 0, top 1, widest radius 1, deterministic', () => {
  assert.equal(lumpyBall(0, 0, 0).tris, 20); assert.equal(lumpyBall(1, 0, 0).tris, 80);
  for (const c of [lumpyBall(0, 0, 0), lumpyBall(1, 0.24, 2), lumpyBall(1, 0.1, 3)]) {
    const [y0, y1] = minMax(c, 1); assert.ok(Math.abs(y0) < 1e-6 && Math.abs(y1 - 1) < 1e-6, `y ${y0}..${y1}`);
    assert.ok(Math.abs(maxRadius(c) - 1) < 1e-6);
  }
  assert.deepEqual(lumpyBall(1, 0.18, 1).position, lumpyBall(1, 0.18, 1).position);
  assert.notDeepEqual(lumpyBall(1, 0.18, 1).position, lumpyBall(1, 0.18, 2).position, 'another seed lumps elsewhere');
});

test('lumpyBall: the bump moves the vertices off the sphere, no bump is the squashed icosphere', () => {
  const smooth = lumpyBall(1, 0, 0), lumpy = lumpyBall(1, 0.2, 0);
  const radii = (c) => Array.from({ length: c.position.length / 3 }, (_, i) => { const [x, y, z] = vec(c.position, i); return Math.hypot(x, (y - 0.5) * 2, z); });
  const spread = (rs) => Math.max(...rs) - Math.min(...rs);
  assert.ok(spread(radii(smooth)) < 1e-5, 'no bump: every vertex on the unit sphere (after unsquashing y)');
  assert.ok(spread(radii(lumpy)) > 0.2, 'bump 0.2: radii spread over at least 0.2');
});

test('normals face outward: nearly every face normal points away from the crown axis', () => {
  for (const s of SPECIES) for (const t of TIERS) {
    const c = crownFor(s, t); let out = 0;
    for (let f = 0; f < c.tris; f++) {
      const [a, b, d] = [0, 1, 2].map(k => vec(c.position, f * 3 + k)), n = vec(c.normal, f * 3);
      const dot = n[0] * (a[0] + b[0] + d[0]) / 3 + n[2] * (a[2] + b[2] + d[2]) / 3;   // radial only: a tall cone's lower faces point up more than out
      assert.ok(dot > -1e-6, `${s}/${t} face ${f} points inward`); if (dot > 0.01) out++;
    }
    assert.ok(out >= c.tris * 0.9, `${s}/${t}: ${out}/${c.tris} clearly outward`);
  }
});

test('tieredCone: tiers x segments triangles, apex of the last tier at 1, base radius 1', () => {
  const fine = tieredCone(SPRUCE_TIERS.fine.tiers, 7), coarse = tieredCone(SPRUCE_TIERS.coarse.tiers, 6);
  assert.equal(fine.tris, 21); assert.equal(coarse.tris, 6);
  for (const c of [fine, coarse]) { const [y0, y1] = minMax(c, 1); assert.ok(Math.abs(y0) < 1e-6 && Math.abs(y1 - 1) < 1e-6); assert.ok(Math.abs(maxRadius(c) - 1) < 1e-6); }
  assert.ok(SPRUCE_TIERS.fine.tiers.length === 3 && SPRUCE_TIERS.fine.tiers[1][1] < SPRUCE_TIERS.fine.tiers[0][1] + SPRUCE_TIERS.fine.tiers[0][2], 'tiers overlap');
});

test('vertex colours: brighter at the top than at the bottom, within 0.6..1.1', () => {
  for (const s of SPECIES) for (const t of TIERS) {
    const c = crownFor(s, t); let lo = [Infinity, 0], hi = [-Infinity, 0];
    for (let i = 0; i < c.position.length / 3; i++) { const y = c.position[i * 3 + 1], br = c.color[i * 3]; assert.ok(br > 0.6 && br < 1.1, `${s}/${t} ${br}`); assert.equal(c.color[i * 3 + 1], br); if (y < lo[0]) lo = [y, br]; if (y > hi[0]) hi = [y, br]; }
    assert.ok(hi[1] > lo[1] + 0.15, `${s}/${t}: top ${hi[1]} vs bottom ${lo[1]}`);
  }
});

test('crownFor: every species and tier within the budget, the cone for the spruce, lumpy balls otherwise', () => {
  assert.deepEqual(CROWN_BUDGET, { fine: 80, coarse: 20 });
  for (const s of SPECIES) for (const t of TIERS) {
    const c = crownFor(s, t); assert.ok(c.tris <= CROWN_BUDGET[t], `${s}/${t}: ${c.tris}`);
    assert.equal(c.tris, s === 'spruce' ? (t === 'fine' ? 21 : 6) : (t === 'fine' ? 80 : 20));
  }
  assert.notDeepEqual(crownFor('deciduous', 'fine').position, crownFor('birch', 'fine').position, 'each species lumps its own way');
  assert.throws(() => crownFor('hedge', 'fine'), /species/); assert.throws(() => crownFor('birch', 'medium'), /tier/);
});
