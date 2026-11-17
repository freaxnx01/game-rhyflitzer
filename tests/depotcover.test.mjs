import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVER, coverMesh } from '../depotcover.js';

const verts = (m) => Array.from({ length: m.positions.length / 3 }, (_, i) => ({ x: m.positions[3 * i], y: m.positions[3 * i + 1], z: m.positions[3 * i + 2], c: m.colors.slice(3 * i, 3 * i + 3) }));
const maxY = (vs, pick) => Math.max(-Infinity, ...vs.filter(pick).map(v => v.y));

test('coverMesh: both kinds fit the unit footprint and stand on the ground', () => {
  for (const kind of ['car', 'long']) {
    const m = coverMesh(kind), vs = verts(m);
    assert.ok(vs.length > 0, kind);
    for (const v of vs) assert.ok(v.x >= -0.5 && v.x <= 0.5 && v.z >= -0.5 && v.z <= 0.5 && v.y >= 0 && v.y <= 1 + 1e-9, `${kind} ${JSON.stringify(v)}`);
    assert.equal(Math.min(...vs.map(v => v.y)), 0, kind);
    assert.ok(Math.abs(maxY(vs, () => true) - 1) < 1e-9, kind);
    assert.equal(m.indices.length % 3, 0, kind);
    for (const i of m.indices) assert.ok(Number.isInteger(i) && i >= 0 && i < vs.length, `${kind} index ${i}`);
    assert.equal(m.colors.length, m.positions.length, kind);
    assert.ok(m.indices.length / 3 <= 1500, `${kind}: ${m.indices.length / 3} triangles`);
  }
});

test('coverMesh: the car cover has a cabin hump above a lower bonnet and boot', () => {
  const vs = verts(coverMesh('car'));
  assert.ok(maxY(vs, v => v.x > 0.4) <= 0.65, 'bonnet');
  assert.ok(maxY(vs, v => v.x < -0.4) <= 0.65, 'boot');
  assert.ok(maxY(vs, v => Math.abs(v.x) < 0.1) >= 0.95, 'cabin');
});

test('coverMesh: the long cover has a flat roof', () => {
  const vs = verts(coverMesh('long'));
  const mid = vs.filter(v => Math.abs(v.x) < 0.3 && Math.abs(v.z) < 0.3);
  assert.ok(mid.length > 0);
  for (const v of mid) assert.ok(v.y >= 0.95 || v.y <= 0.2, JSON.stringify(v));
});

test('coverMesh: wheels are dark, the tarp is not', () => {
  for (const kind of ['car', 'long']) {
    const vs = verts(coverMesh(kind));
    const low = vs.filter(v => v.y < 0.1), high = vs.filter(v => v.y > 0.3);
    assert.ok(low.length > 0 && high.length > 0, kind);
    for (const v of low) assert.deepEqual(v.c, COVER.wheel, `${kind} ${JSON.stringify(v)}`);
    for (const v of high) assert.deepEqual(v.c, COVER.tarp, `${kind} ${JSON.stringify(v)}`);
  }
});

test('coverMesh: an unknown kind throws', () => {
  assert.throws(() => coverMesh('boat'), /kind/);
});
