// #421: the Vasa model — the generator's numbers match the ship (Vasa Museum / Wikipedia) and the shipped glb stays in budget
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VASA, halfBreadth, railY, topY, sternX, stemX, gunports, sparredLength, bowspritTip } from '../scripts/vasa/vasa-spec.mjs';

const GLB = new URL('../assets/models/vasa.glb', import.meta.url);

test('vasa: 47.5 m between the perpendiculars, 69 m sparred length', () => {
  assert.equal(VASA.FP - VASA.AP, 47.5);
  assert.ok(Math.abs(sparredLength() - 69) < 0.5, `sparred length ${sparredLength()}`);
  assert.ok(Math.abs(stemX(VASA.draught) - VASA.FP) < 1e-9, 'the stem meets the forward perpendicular at the waterline');
  assert.ok(Math.abs(sternX(VASA.wingTransomY) - VASA.AP) < 1e-9, 'the sternpost meets the aft perpendicular at the wing transom');
  assert.ok(sternX(VASA.sternTop) < VASA.AP - 3, 'the stern overhangs the sternpost');
});

test('vasa: 11.7 m beam, 52.5 m main truck, 19.3 m stern, three masts', () => {
  let widest = 0;
  for (let s = 0; s <= 1; s += 0.005) for (let y = 0; y <= 13; y += 0.1) widest = Math.max(widest, halfBreadth(s, y));
  assert.ok(Math.abs(2 * (widest + 0.14) - VASA.beam) < 0.05, `beam incl. wales ${2 * (widest + 0.14)}`);
  assert.equal(VASA.masts.main.truck, VASA.mastTop);
  assert.equal(VASA.mastTop, 52.5);
  assert.ok(VASA.masts.fore.truck < VASA.masts.main.truck && VASA.masts.mizzen.truck < VASA.masts.fore.truck);
  assert.ok(VASA.masts.fore.x > VASA.masts.main.x && VASA.masts.main.x > VASA.masts.mizzen.x);
  assert.ok(Math.abs(topY(0) - VASA.sternTop) < 1e-9, 'the taffrail is 19.3 m above the keel');
  assert.ok(topY(0) > topY(0.5) + 5, 'the stern castle towers over the waist');
  assert.ok(bowspritTip()[1] > railY(1) + 5, 'the bowsprit climbs well above the forecastle');
});

test('vasa: the sheer, and 64 gunports in two staggered tiers plus the castles', () => {
  assert.ok(railY(0) > railY(0.5) && railY(1) > railY(0.5), 'the rail is lowest amidships');
  const ports = gunports(), lower = ports.filter((p) => p[2] === 'lower'), upper = ports.filter((p) => p[2] === 'upper');
  assert.equal(lower.length, 12); assert.equal(upper.length, 12);
  assert.equal(2 * ports.length + 2, 64, 'two sides plus the two stern chase ports');
  for (const [s, y] of lower) assert.ok(y > VASA.draught + 1 && y < 8, `lower tier above the waterline at s=${s}: ${y}`);
  for (const [s, y] of upper) assert.ok(y > 8 && y < railY(s), `upper tier below the rail at s=${s}: ${y}`);
  for (const [s] of [...lower, ...upper]) assert.ok(halfBreadth(s, 7) > 2, 'every port sits on the planked side, not on a post');
});

function glbJson(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'glb magic');
  const length = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
}

test('vasa.glb: life size, named stern node, within the triangle and size budget', () => {
  const buffer = readFileSync(GLB), json = glbJson(buffer);
  assert.ok(buffer.length <= 4 * 1024 * 1024, `glb is ${buffer.length} bytes`);
  const tris = json.meshes.flatMap((m) => m.primitives).reduce((n, p) => n + (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3, 0);
  assert.ok(tris <= 150000, `${tris} triangles`);
  assert.ok(tris >= 30000, `${tris} triangles: the model lost detail`);
  const names = json.nodes.map((n) => n.name);
  for (const name of ['hull', 'rigging', 'stern', 'cradle']) assert.ok(names.includes(name), `node ${name}`);
  const extras = json.scenes[0].extras;
  assert.ok(Math.abs(extras.loa - 69) < 0.5, `overall length ${extras.loa}`);
  assert.equal(extras.lbp, 47.5);
  assert.ok(Math.abs(extras.beam - 11.7) < 0.05, `beam ${extras.beam}`);
  assert.ok(Math.abs(extras.mastTop - 52.5) < 0.2, `main truck ${extras.mastTop}`);
  assert.deepEqual(extras.stern.anchor, [VASA.AP, 0, 0]);
  assert.ok(json.extensionsRequired.includes('EXT_meshopt_compression'), 'meshopt-compressed like the Eiffel model');
  for (const m of json.materials) assert.equal(m.pbrMetallicRoughness.baseColorTexture, undefined, 'vertex colours, no textures');
});
