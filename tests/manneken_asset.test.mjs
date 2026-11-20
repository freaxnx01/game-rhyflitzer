// manneken_asset.test.mjs — the committed Manneken Pis model file against its budget and node contract (#585).
// Reads assets/models/manneken_pis.glb with node:fs only (GLB header + JSON chunk); the counts come from the
// accessors, which stay readable under EXT_meshopt_compression. The file is produced by tools/prepare-manneken.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const FILE = new URL('../assets/models/manneken_pis.glb', import.meta.url);
const LICENSE = new URL('../assets/models/manneken_pis.LICENSE.md', import.meta.url);

function readGlb(url) {
  const b = readFileSync(url);
  assert.equal(b.readUInt32LE(0), 0x46546c67, 'glTF magic');
  const len = b.readUInt32LE(12);                      // first chunk = JSON
  assert.equal(b.readUInt32LE(16), 0x4e4f534a, 'JSON chunk first');
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}
const triangles = (j) => j.meshes.flatMap(m => m.primitives).reduce((n, p) => n + ((p.mode ?? 4) === 4 ? j.accessors[p.indices].count / 3 : 0), 0);

test('mannekenGlb_Committed_WithinTheBudget', () => {
  assert.ok(existsSync(FILE), 'run tools/prepare-manneken.mjs');
  const j = readGlb(FILE);
  assert.ok(statSync(FILE).size <= 600 * 1024, `size ${statSync(FILE).size}`);
  assert.ok(triangles(j) >= 14000 && triangles(j) <= 22000, `triangles ${triangles(j)}`);
  assert.equal(j.meshes.length, 1); assert.ok(!j.textures?.length && !j.animations?.length);
  assert.deepEqual(j.extensionsUsed, ['EXT_meshopt_compression']);
});

test('mannekenGlb_LifeSize_FeetOnTheOrigin', () => {
  const j = readGlb(FILE), a = j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
  assert.ok(Math.abs(a.min[1]) < 0.002 && Math.abs(a.max[1] - 0.61) < 0.005, `height ${a.max[1] - a.min[1]}`);
  assert.ok(Math.abs(a.min[0] + a.max[0]) < 0.03 && Math.abs(a.min[2] + a.max[2]) < 0.03, 'centred');
});

test('mannekenGlb_OneBronzeMaterial_LicenceCredited', () => {
  const j = readGlb(FILE), m = j.materials;
  assert.equal(m.length, 1); assert.equal(m[0].name, 'Bronze');
  assert.equal(m[0].pbrMetallicRoughness.metallicFactor, 0.6); assert.equal(m[0].pbrMetallicRoughness.roughnessFactor, 0.45);
  assert.match(readFileSync(LICENSE, 'utf8'), /RascalFR[\s\S]*CC BY 4\.0/);
});
