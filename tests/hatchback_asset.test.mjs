// hatchback_asset.test.mjs — the committed Hatchback model file against its budget and node contract (#236).
// Reads assets/hatchback.glb with node:fs only (GLB header + JSON chunk); the counts come from the accessors,
// which stay readable under EXT_meshopt_compression. The file is produced by tools/prepare-hatchback.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { HATCHBACK } from '../hatchback.js';

const FILE = new URL('../assets/hatchback.glb', import.meta.url);
const LICENSE = new URL('../assets/hatchback.LICENSE.md', import.meta.url);

function readGlb(url) {
  const b = readFileSync(url);
  assert.equal(b.readUInt32LE(0), 0x46546c67, 'glTF magic');
  const len = b.readUInt32LE(12);                      // first chunk = JSON
  assert.equal(b.readUInt32LE(16), 0x4e4f534a, 'JSON chunk first');
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}
const triangles = (j) => j.meshes.flatMap(m => m.primitives).reduce((n, p) => n + ((p.mode ?? 4) === 4 ? j.accessors[p.indices].count / 3 : 0), 0);
const nodeByName = (j, n) => j.nodes.find(x => x.name === n);

test('hatchbackGlb_Committed_WithinTheSizeTriangleAndMaterialBudget', () => {
  assert.ok(existsSync(FILE), 'run tools/prepare-hatchback.mjs and copy the result to assets/hatchback.glb');
  const j = readGlb(FILE);
  assert.ok(statSync(FILE).size <= 500 * 1024, `size ${statSync(FILE).size}`);
  assert.ok(triangles(j) <= 25000 && triangles(j) >= 15000, `triangles ${triangles(j)}`);
  assert.ok(j.materials.length <= 8, `materials ${j.materials.length}`);
  assert.ok(!j.textures?.length, 'no textures');
});

test('hatchbackGlb_Extensions_MeshoptOnlyNoTransmission', () => {
  const j = readGlb(FILE);
  assert.ok(j.extensionsUsed.includes('EXT_meshopt_compression'));
  assert.ok(!JSON.stringify(j).includes('KHR_materials_transmission'));
  assert.deepEqual(j.extensionsUsed.filter(e => e !== 'EXT_meshopt_compression'), []);
});

test('hatchbackGlb_Names_CarryNoBrand', () => {
  const j = readGlb(FILE);
  const names = [...j.nodes, ...j.meshes, ...j.materials].map(x => x.name ?? '').join(' ');
  assert.doesNotMatch(names, /mazda|outpiston|badge|logo|lettering/i);
});

test('hatchbackGlb_Nodes_BodyAndFourWheelsWithTheirOriginAtTheWheelCentre', () => {
  const j = readGlb(FILE);
  assert.ok(nodeByName(j, 'hatchback') && nodeByName(j, 'body'));
  for (const [i, [x, z]] of [[1.36, -0.77], [1.36, 0.77], [-1.36, -0.77], [-1.36, 0.77]].entries()) {
    const n = nodeByName(j, ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'][i]);
    assert.ok(n && n.mesh !== undefined, 'wheel node with a mesh');
    const [tx, ty, tz] = n.translation;
    assert.ok(Math.abs(tx - x) < 0.03 && Math.abs(tz - z) < 0.03 && Math.abs(ty - HATCHBACK.wheelR) < 0.03, `${n.name} at ${n.translation}`);
  }
});

test('hatchbackGlb_Extras_PaintGlassAndLampsAreTagged', () => {
  const j = readGlb(FILE), ex = j.materials.map(m => m.extras ?? {});
  assert.ok(ex.some(e => e.paint === true) && ex.some(e => e.glass === true));
  assert.ok(ex.some(e => e.lamp === 'head') && ex.some(e => e.lamp === 'tail'));
  const glass = j.materials.find(m => m.extras?.glass);
  assert.equal(glass.alphaMode, 'BLEND');
  assert.ok(glass.pbrMetallicRoughness.baseColorFactor[3] < 0.5, 'low opacity glass');
});

test('hatchbackGlb_Length_IsFourPointFourSixMetres', () => {
  const j = readGlb(FILE), pos = j.meshes.flatMap(m => m.primitives).map(p => j.accessors[p.attributes.POSITION]);
  const xs = pos.flatMap(a => [a.min[0], a.max[0]]);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 4.46) < 0.03);   // the body alone; wheels sit inside the length
});

test('hatchbackLicenseNote_NamesAuthorTitleLinkLicenceAndModifications', () => {
  const t = readFileSync(LICENSE, 'utf8');
  for (const s of ['2020 Mazda 3 Hatchback', 'OUTPISTON', 'https://skfb.ly/pAOpM', 'CC BY-NC-SA 4.0', 'non-commercial', 'Modifications']) assert.ok(t.includes(s), s);
});
