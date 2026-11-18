// prepare-ds9.mjs — builds assets/models/ds9.glb from two Sketchfab originals (issue #620):
//   "Deep Space Nine - Star Trek" by rossrobotics (CC BY 4.0, https://sketchfab.com/3d-models/deep-space-nine-star-trek-3e1743fc00be4d83848c7d890b8a5988)
//   "U.S.S. Defiant" by Feltman_Langer (CC BY 4.0, https://sketchfab.com/3d-models/uss-defiant-8e875133c49240699d3b19de324826cf)
// Both unmodified downloads live in assets/src/ with their LICENSE.md.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/ds9prep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-ds9.mjs <scratch>/ds9prep/ && cd <scratch>/ds9prep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-ds9.mjs <station.glb> <defiant.glb> <out.glb>
// The station original is a 14 MB glb: an STL scan ("ds9_terrok_nor"), 410'493 triangles in 6 meshes, one material, no textures,
// z up in the meshes (the root node carries the z-to-y rotation). The Defiant original is 5 MB: 118'225 triangles in 21 meshes,
// one plain-colour material each, no textures, the bow on its mesh +y, plus a stray 12-triangle default cube (material STRAY).
//
// Output contract (what ds9.js, index.html and tests/ds9_asset.test.mjs rely on):
//   metres, +y up, half scale (the maintainer's 50 %: the station ACROSS_M across instead of 1450 m, the Defiant DEFIANT_M long
//   instead of 170.7 m); y = 0 is the station's lowest point, x = z = 0 its axis; no transform on the root or the station node
//   node "ds9"                  the scene root
//     node "station"            one mesh, one primitive, material "Hull" (STATION_TRIS triangles)
//     node "defiant"            one mesh, one primitive per material (DEFIANT_TRIS triangles), docked at the station's outer
//                               docking ring on +x: turned 180 degrees about y so its bow points back at the axis, its nose
//                               NOSE_GAP_M outside the ring's widest radius, at the ring's mid-plane height
//   extensions: EXT_meshopt_compression only; no textures, no animations.
// Geometry: the meshes are welded on position alone (an STL export shares no vertex, so the simplifier would collapse nothing),
// decimated with meshoptimizer, and given crease normals afterwards (the welded normals are meaningless, and a single smooth
// normal per vertex smears a hard-surface hull's panel edges).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { mergeDocuments, prune, simplifyPrimitive, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const ACROSS_M = 726;          // DS9 at 50 %: its widest diameter (1450 m full size)
const DEFIANT_M = 85.4;        // the Defiant at the same 50 % (170.7 m full size)
const STATION_TRIS = 70000, DEFIANT_TRIS = 20000;
const SIMPLIFY_ERROR = 0.01;   // meshoptimizer's error bound, relative to the mesh extent
const NOSE_GAP_M = 1;          // how far the Defiant's nose tip stops short of the ring's widest radius
const CREASE_DEG = 40;         // a shared vertex keeps one normal per group of faces within this angle of each other
const HULL = { name: 'Hull', colour: [0x9a / 255, 0x9e / 255, 0xa3 / 255, 1], metallic: 0.35, roughness: 0.55 };
const STRAY = 'Material';      // the Defiant file's stray default cube uses this material and nothing else does
// the Defiant's lamps, windows and drive parts: self-lit, so they read against the dark room (their base colour is the plain
// grey the whole model carries -- the original has no colour per role, only the material names)
const EMISSIVE = ['greenlight', 'redlight', 'whitelight', 'window', 'deflector', 'bussard', 'engineblue', 'impred'];

const [, , stationIn, defiantIn, output] = process.argv;
if (!stationIn || !defiantIn || !output) { console.error('usage: node prepare-ds9.mjs <station.glb> <defiant.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(stationIn);
mark(doc, 'station');
const defiantDoc = await io.read(defiantIn);
mark(defiantDoc, 'defiant');
mergeDocuments(doc, defiantDoc);                       // one document, both scenes; the node extras tell the two apart (the names collide)
const root = doc.getRoot();
const buffer = root.listBuffers()[0];        // one buffer: a GLB has a single binary chunk, and the merge brought a second one
for (const a of root.listAccessors()) a.setBuffer(buffer);
for (const b of root.listBuffers()) if (b !== buffer) b.dispose();

// 1. the stray default cube goes, then every node transform is baked into its mesh so each source sits in its own y-up world frame
for (const m of root.listMaterials()) if (m.getName() === STRAY) { for (const p of primitivesOf(m)) p.dispose(); m.dispose(); }
const group = { station: [], defiant: [] };
for (const n of root.listNodes()) {
  const mesh = n.getMesh(); if (!mesh || !mesh.listPrimitives().length) continue;
  transformMesh(mesh, n.getWorldMatrix());
  for (const p of mesh.listPrimitives()) { dropAttributes(p); group[n.getExtras().src].push(p); }
}
const sourceTris = { station: triangles(group.station), defiant: triangles(group.defiant) };

// 2. the scene the game loads: the root, the station's one mesh, the Defiant's one mesh (one primitive per material)
const scene = doc.createScene('ds9');
const top = doc.createNode('ds9'); scene.addChild(top);
const stationMesh = doc.createMesh('station'), defiantMesh = doc.createMesh('defiant');
for (const p of group.station) stationMesh.addPrimitive(p);
for (const p of group.defiant) defiantMesh.addPrimitive(p);
const stationNode = doc.createNode('station').setMesh(stationMesh), defiantNode = doc.createNode('defiant').setMesh(defiantMesh);
top.addChild(stationNode); top.addChild(defiantNode);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
const keep = new Set([top, stationNode, defiantNode]);
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
for (const m of root.listMeshes()) if (m !== stationMesh && m !== defiantMesh) m.dispose();
root.setDefaultScene(scene);
for (const mesh of [stationMesh, defiantMesh]) joinByMaterial(mesh);

// 3. weld on position (the STL export shares no vertex at all), then decimate each mesh to its own triangle budget
for (const [mesh, aim] of [[stationMesh, STATION_TRIS], [defiantMesh, DEFIANT_TRIS]]) {
  for (const p of mesh.listPrimitives()) weldPositions(p);
  const ratio = aim / triangles(mesh.listPrimitives());
  for (const p of mesh.listPrimitives()) {
    const simplified = simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio, error: SIMPLIFY_ERROR });
    if (simplified !== p) { mesh.removePrimitive(p); p.dispose(); mesh.addPrimitive(simplified); }
  }
}

// 4. the station's frame: half scale off its widest radius, its axis on x = z = 0 and its lowest point on y = 0
const sb = boundsOf(stationMesh.listPrimitives());
const axis = [(sb.min[0] + sb.max[0]) / 2, (sb.min[2] + sb.max[2]) / 2];
const scale = ACROSS_M / (2 * maxRadius(stationMesh.listPrimitives(), axis));
const lift = -scale * sb.min[1];
for (const p of stationMesh.listPrimitives()) mapPositions(p, ([x, y, z]) => [scale * (x - axis[0]), scale * y + lift, scale * (z - axis[1])]);
const RING_R = ACROSS_M / 2, RING_Y = lift;   // the widest radius is the docking ring's outer face; its mid-plane is the station's y = 0 plane

// 5. the Defiant's frame: the same half scale (its source units are its own), the bow from the source +z onto the model's +x,
// the ship centred on its node origin -- so the node alone says where it is docked
const db = boundsOf(defiantMesh.listPrimitives());
const dScale = DEFIANT_M / (db.max[2] - db.min[2]);
const dc = [0, 1, 2].map(k => dScale * (db.min[k] + db.max[k]) / 2);
for (const p of defiantMesh.listPrimitives()) mapPositions(p, ([x, y, z]) => [dScale * z - dc[2], dScale * y - dc[1], dc[0] - dScale * x]);
defiantNode.setRotation([0, 1, 0, 0]).setTranslation([RING_R + NOSE_GAP_M + DEFIANT_M / 2, RING_Y, 0]);

// 6. materials: one hull for the station, the Defiant's kept per role with the lamps and drive parts lit from within
for (const p of stationMesh.listPrimitives()) p.getMaterial().setName(HULL.name).setBaseColorFactor(HULL.colour).setMetallicFactor(HULL.metallic).setRoughnessFactor(HULL.roughness);
for (const p of defiantMesh.listPrimitives()) { const m = p.getMaterial(); if (EMISSIVE.includes(m.getName())) m.setEmissiveFactor(m.getBaseColorFactor().slice(0, 3)); }

// 7. normals the hull's panels read by, then compress
for (const mesh of [stationMesh, defiantMesh]) for (const p of mesh.listPrimitives()) creaseNormals(p, CREASE_DEG);
await doc.transform(prune());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = {
  title: 'Deep Space Nine with the U.S.S. Defiant (modified, half scale)',
  author: 'rossrobotics (https://sketchfab.com/rossrobotics), Feltman_Langer (https://sketchfab.com/Feltman_Langer)',
  license: 'CC-BY-4.0',
  source: 'https://sketchfab.com/3d-models/deep-space-nine-star-trek-3e1743fc00be4d83848c7d890b8a5988, https://sketchfab.com/3d-models/uss-defiant-8e875133c49240699d3b19de324826cf',
};
await io.write(output, doc);

// 8. report: the numbers ds9.js and the asset test are written against
const r2 = (v) => +v.toFixed(2);
const station = boundsOf(stationMesh.listPrimitives()), defiant = boundsOf(defiantMesh.listPrimitives());
console.log('wrote', output, 'triangles', sourceTris.station, '->', triangles(stationMesh.listPrimitives()), '(station)', sourceTris.defiant, '->', triangles(defiantMesh.listPrimitives()), '(defiant)');
console.log('station', r2(station.max[0] - station.min[0]), 'x', r2(station.max[2] - station.min[2]), 'm across,', r2(station.max[1] - station.min[1]), 'm tall, lowest point', r2(station.min[1]));
console.log('docking ring: radius', r2(RING_R), 'm, mid-plane', r2(RING_Y), 'm over the lowest point');
console.log('defiant', r2(defiant.max[0] - defiant.min[0]), 'm long,', r2(defiant.max[2] - defiant.min[2]), 'm across, node at', defiantNode.getTranslation().map(r2), '-> nose at x', r2(defiantNode.getTranslation()[0] - (defiant.max[0] - defiant.min[0]) / 2));
console.log('materials', root.listMaterials().map(m => m.getName()).join(', '));

function mark(d, src) { for (const n of d.getRoot().listNodes()) n.setExtras({ ...n.getExtras(), src }); }
function primitivesOf(material) { return doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).filter(p => p.getMaterial() === material); }
// the originals carry normals (meaningless once welded on position) and texture coordinates (neither file has a texture)
function dropAttributes(prim) { for (const sem of ['NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1']) if (prim.getAttribute(sem)) prim.setAttribute(sem, null); }
function triangles(prims) { return prims.reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0); }
function joinByMaterial(mesh) {
  for (const material of new Set(mesh.listPrimitives().map(p => p.getMaterial()))) {
    const prims = mesh.listPrimitives().filter(p => p.getMaterial() === material); if (prims.length < 2) continue;
    const joined = joinPrimitives(prims); prims.forEach(p => { mesh.removePrimitive(p); p.dispose(); }); mesh.addPrimitive(joined);
  }
}
function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return { min, max };
}
function maxRadius(prims, [cx, cz]) {
  let r = 0;
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); r = Math.max(r, Math.hypot(v[0] - cx, v[2] - cz)); } }
  return r;
}
// one vertex per position (to 1 mm): the index buffer is remapped, every other attribute is already gone (dropAttributes)
function weldPositions(prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
  const n = pos.getCount(), src = idx ? idx.getArray() : Uint32Array.from({ length: n }, (_, i) => i);
  const P = pos.getArray(), map = new Map(), remap = new Uint32Array(n), out = [];
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(P[3 * i] * 1000)},${Math.round(P[3 * i + 1] * 1000)},${Math.round(P[3 * i + 2] * 1000)}`;
    let j = map.get(key);
    if (j === undefined) { j = out.length / 3; map.set(key, j); out.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); }
    remap[i] = j;
  }
  prim.setAttribute('POSITION', accessor('VEC3', new Float32Array(out)));
  prim.setIndices(accessor('SCALAR', Uint32Array.from(src, (i) => remap[i])));
}
function accessor(type, array) { return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer); }
// every position through f (the normals come later, from creaseNormals); the accessor is detached first so a shared one is not mapped twice
function mapPositions(prim, f) {
  const a = prim.getAttribute('POSITION'), c = a.clone(); prim.setAttribute('POSITION', c);
  const v = []; for (let i = 0; i < c.getCount(); i++) { c.getElement(i, v); c.setElement(i, f(v)); }
}
// the area-weighted normal of each triangle, three floats per face
function faceNormals(P, I) {
  const out = new Float32Array(I.length);
  for (let f = 0; f < I.length; f += 3) {
    const a = I[f] * 3, b = I[f + 1] * 3, c = I[f + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    out[f] = uy * vz - uz * vy; out[f + 1] = uz * vx - ux * vz; out[f + 2] = ux * vy - uy * vx;
  }
  return out;
}
// the faces round each vertex, as a flat list with a start offset per vertex (CSR)
function vertexFaces(I, vertices) {
  const start = new Uint32Array(vertices + 1);
  for (const v of I) start[v + 1]++;
  for (let v = 0; v < vertices; v++) start[v + 1] += start[v];
  const list = new Uint32Array(I.length), fill = start.slice(0, vertices);
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) list[fill[I[f + k]]++] = f;
  return { start, list };
}
function unit([x, y, z]) { const l = Math.hypot(x, y, z); return l > 0 ? [x / l, y / l, z / l] : [0, 1, 0]; }
// crease normals: the faces round a vertex are grouped by direction, and the vertex is split once per group -- so a panel edge
// steeper than `deg` stays an edge while a curved hull plate keeps one smooth normal
function creaseNormals(prim, deg) {
  const P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray();
  const vertices = prim.getAttribute('POSITION').getCount(), N = faceNormals(P, I), { start, list } = vertexFaces(I, vertices);
  const cos = Math.cos(deg * Math.PI / 180), outP = [], outN = [], index = new Uint32Array(I.length);
  for (let v = 0; v < vertices; v++) {
    const groups = [];
    for (let i = start[v]; i < start[v + 1]; i++) {
      const f = list[i], n = unit([N[f], N[f + 1], N[f + 2]]);
      let g = groups.find((G) => { const [x, y, z] = unit(G.sum); return x * n[0] + y * n[1] + z * n[2] >= cos; });
      if (!g) groups.push(g = { sum: [0, 0, 0], faces: [] });
      for (let k = 0; k < 3; k++) g.sum[k] += N[f + k];
      g.faces.push(f);
    }
    for (const g of groups) {
      const j = outP.length / 3, n = unit(g.sum);
      outP.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); outN.push(n[0], n[1], n[2]);
      for (const f of g.faces) for (let k = 0; k < 3; k++) if (I[f + k] === v) index[f + k] = j;
    }
  }
  prim.setAttribute('POSITION', accessor('VEC3', new Float32Array(outP)));
  prim.setAttribute('NORMAL', accessor('VEC3', new Float32Array(outN)));
  prim.setIndices(accessor('SCALAR', index));
}
