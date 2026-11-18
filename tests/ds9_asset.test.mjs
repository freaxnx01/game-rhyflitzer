// ds9_asset.test.mjs — the committed Deep Space Nine model file against its budget and node contract (#620).
// Reads assets/models/ds9.glb with node:fs only (GLB header + JSON chunk); the counts and the bounds come from the
// accessors, which stay readable under EXT_meshopt_compression. The file is produced by tools/prepare-ds9.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const FILE = new URL('../assets/models/ds9.glb', import.meta.url);
const LICENSE = new URL('../assets/models/ds9.LICENSE.md', import.meta.url);
// the source measurements the asset is built from (docs/superpowers/specs/2026-11-17-ds9-defiant-design.md): the station's
// farthest vertex off its axis is 817.1 units, so half scale (726 m across) is S m per unit; the docking ring's outer face
// sits at that radius, its mid-plane 555.8 units over the station's lowest point
const S = 726 / (2 * 817.1), RING_R = 817.1 * S, RING_Y = 555.8 * S;

function readGlb(url) {
  const b = readFileSync(url);
  assert.equal(b.readUInt32LE(0), 0x46546c67, 'glTF magic');
  const len = b.readUInt32LE(12);                      // first chunk = JSON
  assert.equal(b.readUInt32LE(16), 0x4e4f534a, 'JSON chunk first');
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}
const nodeByName = (j, n) => j.nodes.find(x => x.name === n);
const nodeIndex = (j, n) => j.nodes.findIndex(x => x.name === n);
const primTris = (j, p) => ((p.mode ?? 4) === 4 ? (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3 : 0);
// the node's own TRS as a column-major 4x4 (glTF's order: T * R * S)
function nodeMatrix(n) {
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  const r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
  return { r: [r[0] * sx, r[3] * sy, r[6] * sz, r[1] * sx, r[4] * sy, r[7] * sz, r[2] * sx, r[5] * sy, r[8] * sz], t: [tx, ty, tz] };
}
const apply = (m, [x, y, z]) => [m.r[0] * x + m.r[1] * y + m.r[2] * z + m.t[0], m.r[3] * x + m.r[4] * y + m.r[5] * z + m.t[1], m.r[6] * x + m.r[7] * y + m.r[8] * z + m.t[2]];
const mul = (a, b) => ({
  r: [0, 1, 2].flatMap(i => [0, 1, 2].map(k => a.r[3 * i] * b.r[k] + a.r[3 * i + 1] * b.r[3 + k] + a.r[3 * i + 2] * b.r[6 + k])),
  t: apply(a, b.t),
});
// walk the subtree rooted at the named node, accumulating node transforms; f(prim, matrix) per primitive
function eachPrim(j, name, f) {
  const walk = (i, m) => {
    const n = j.nodes[i], M = mul(m, nodeMatrix(n));
    if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) f(p, M);
    for (const c of n.children || []) walk(c, M);
  };
  walk(nodeIndex(j, name), { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
}
const trisUnder = (j, name) => { let n = 0; eachPrim(j, name, p => { n += primTris(j, p); }); return n; };
// the subtree's world-space bounds, from each POSITION accessor's min/max box corners through the node transforms
function boundsUnder(j, name) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  eachPrim(j, name, (p, M) => {
    const a = j.accessors[p.attributes.POSITION];
    assert.ok(a.min && a.max, `accessor ${p.attributes.POSITION} carries no min/max`);
    for (let c = 0; c < 8; c++) {
      const v = apply(M, [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]]);
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
    }
  });
  return { min, max };
}

test('ds9Glb_Committed_WithinTheBudget', () => {
  assert.ok(existsSync(FILE), 'run tools/prepare-ds9.mjs and copy the result to assets/models/ds9.glb');
  const j = readGlb(FILE);
  assert.ok(statSync(FILE).size <= 2.5 * 1024 * 1024, `size ${statSync(FILE).size}`);
  const st = trisUnder(j, 'station'), df = trisUnder(j, 'defiant');
  assert.ok(st >= 60000 && st <= 80000, `station ${st}`);    // 410'493 in the original
  assert.ok(df >= 15000 && df <= 25000, `defiant ${df}`);    // 118'225 in the original
  assert.ok(!j.textures?.length && !j.animations?.length, 'no textures, no animations');
  assert.deepEqual(j.extensionsUsed, ['EXT_meshopt_compression']);
  assert.deepEqual(nodeByName(j, 'ds9').children.map(i => j.nodes[i].name), ['station', 'defiant']);
});

test('ds9Glb_Station_726mAcross_FeetOnZero', () => {
  const b = boundsUnder(readGlb(FILE), 'station');
  // 726 m is the farthest vertex x 2, and that vertex lies off the axes: the box is a shade narrower
  assert.ok(Math.abs(b.max[0] - b.min[0] - 2 * 812.23 * S) < 3 && Math.abs(b.max[2] - b.min[2] - 2 * 807.76 * S) < 3, `mesh extents ${b.max[0] - b.min[0]} x ${b.max[2] - b.min[2]}`);
  assert.ok(Math.abs(b.min[1]) < 0.05 && Math.abs(b.max[1] - 1111.7 * S) < 2, `height ${b.max[1]}, lowest point ${b.min[1]}`);
  assert.ok(Math.abs(b.min[0] + b.max[0]) < 1 && Math.abs(b.min[2] + b.max[2]) < 1, 'the station axis on x = z = 0');
});

test('ds9Glb_Defiant_DockedAtTheRing_NoseInward', () => {
  const j = readGlb(FILE), d = nodeByName(j, 'defiant'), b = boundsUnder(j, 'defiant');
  assert.ok(Math.abs(b.max[0] - b.min[0] - 85.4) < 1, `length ${b.max[0] - b.min[0]}`);
  assert.ok(Math.abs(b.min[0] - (RING_R + 1)) < 0.5, `nose 1 m off the ring, at x ${b.min[0]} instead of ${RING_R + 1}`);
  assert.ok(Math.abs(d.translation[1] - RING_Y) < 1 && Math.abs(d.translation[2]) < 0.01, `docked level at the ring: ${d.translation}`);
  assert.ok(!j.materials.some(m => m.name === 'Material'), 'the stray cube is gone');
  assert.equal(j.materials.find(m => m.name === 'Hull').pbrMetallicRoughness.metallicFactor, 0.35);
  for (const n of ['window', 'deflector', 'engineblue']) assert.ok(j.materials.find(m => m.name === n).emissiveFactor, n);
});

test('ds9LicenseNote_CreditsBothAuthors', () => {
  assert.match(readFileSync(LICENSE, 'utf8'), /rossrobotics[\s\S]*Feltman_Langer/);
});
