// delorean_asset.test.mjs — the committed Rhy Gullwing model file against its budget and node contract (#831).
// Reads assets/delorean.glb with node:fs only (GLB header + JSON chunk); the counts come from the accessors,
// which stay readable under EXT_meshopt_compression. The file is produced by tools/prepare-delorean.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const FILE = new URL('../assets/delorean.glb', import.meta.url);
const LICENSE = new URL('../assets/delorean.LICENSE.md', import.meta.url);

function readGlb(url) {
  const b = readFileSync(url);
  assert.equal(b.readUInt32LE(0), 0x46546c67, 'glTF magic');
  const len = b.readUInt32LE(12);                      // first chunk = JSON
  assert.equal(b.readUInt32LE(16), 0x4e4f534a, 'JSON chunk first');
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}
const triangles = (j) => j.meshes.flatMap(m => m.primitives).reduce((n, p) => n + ((p.mode ?? 4) === 4 ? j.accessors[p.indices].count / 3 : 0), 0);
const nodeByName = (j, n) => j.nodes.find(x => x.name === n);

test('deloreanGlb_Committed_WithinTheBudget', () => {
  assert.ok(existsSync(FILE), 'run tools/prepare-delorean.mjs and copy the result to assets/delorean.glb');
  const j = readGlb(FILE);
  assert.ok(statSync(FILE).size <= 500 * 1024, `size ${statSync(FILE).size}`);
  assert.ok(triangles(j) >= 7000 && triangles(j) <= 12000, `triangles ${triangles(j)}`);   // 10'026 in the original, less the 2'288 of the nose lettering, the plate and the two stray lamp meshes
  assert.ok(j.materials.length <= 8, `materials ${j.materials.length}`);
  assert.ok(!j.textures?.length && !j.animations?.length, 'no textures, no animations');
  assert.deepEqual(j.extensionsUsed, ['EXT_meshopt_compression']);
});

test('deloreanGlb_Nodes_RootBodyFourWheelsTwoDoors', () => {
  const j = readGlb(FILE);
  for (const n of ['gullwing', 'body', 'wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'door_L', 'door_R']) assert.ok(nodeByName(j, n), n);
  const [l, r] = [nodeByName(j, 'door_L'), nodeByName(j, 'door_R')];
  assert.ok(!l.rotation && !r.rotation && l.translation[1] > 1.0 && Math.abs(l.translation[2]) < 0.3, 'door origin on the roof spine');
  assert.ok(Math.abs(l.translation[2] + r.translation[2]) < 1e-3, 'doors mirrored');
  assert.ok(l.translation[2] < 0 && r.translation[2] > 0, 'door_L on -z, door_R on +z');
});

test('deloreanGlb_Wheels_FrontAndRearOnTheirAxlesWithTheirOriginAtTheWheelCentre', () => {
  const j = readGlb(FILE);
  const at = (n) => nodeByName(j, n).translation;
  const [fl, fr, rl, rr] = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'].map(at);
  assert.ok(Math.abs((fl[0] - rl[0]) - 2.41) < 0.02, `wheelbase ${fl[0] - rl[0]}`);   // the DMC-12's 2.41 m, what the file is scaled by
  for (const [l, r] of [[fl, fr], [rl, rr]]) assert.ok(l[2] < 0 && r[2] > 0 && Math.abs(l[2] + r[2]) < 1e-3, `track ${l[2]} ${r[2]}`);
  for (const w of [fl, fr, rl, rr]) assert.ok(w[1] > 0.28 && w[1] < 0.37, `wheel centre height ${w[1]}`);   // the tyres stand on y = 0
});

test('deloreanGlb_Materials_ByRoleWithLampsGlassAndNoPaint', () => {
  const mats = readGlb(FILE).materials, m = (n) => mats.find(x => x.name === n);
  for (const n of ['Steel', 'Glass', 'LampHead', 'LampTail']) assert.ok(m(n), n);
  assert.deepEqual(m('Glass').extras, { glass: true });
  assert.equal(m('Glass').alphaMode, 'BLEND');
  assert.equal(m('LampHead').extras.lamp, 'head');
  assert.equal(m('LampTail').extras.lamp, 'tail');
  assert.ok(!mats.some(x => x.extras?.paint), 'no paint material');
});

test('deloreanGlb_Names_CarryNoBrand', () => {
  const j = readGlb(FILE), names = [...j.nodes, ...j.meshes, ...j.materials].map(x => x.name ?? '').join(' ');
  assert.ok(!/delorean|dmc|plate|license/i.test(names), names);
  assert.ok(existsSync(LICENSE));
});

test('deloreanLicenseNote_NamesAuthorTitleLinkLicenceAndModifications', () => {
  const t = readFileSync(LICENSE, 'utf8');
  for (const s of ['DeLorean DMC 12 (Animated)', 'JEX-D', 'https://sketchfab.com/JEX-D', 'CC BY 4.0', 'Rhy Gullwing', 'Modifications']) assert.ok(t.includes(s), s);
});
