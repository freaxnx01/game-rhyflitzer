// prepare-manneken.mjs — builds assets/models/manneken_pis.glb from the Sketchfab "177_ Manneken Pis In Brussels, Belgium"
// (RascalFR, CC BY 4.0, https://sketchfab.com/3d-models/177--manneken-pis-in-brussels-belgium-fd4be588ea3d4a0fa349ae393a4f3b9f).
// In the game (#585): the life-size bronze boy in his fountain niche beside the Atomium, 0.61 m tall, unbranded.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/mprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-manneken.mjs <scratch>/mprep/ && cd <scratch>/mprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-manneken.mjs <original.glb> <out.glb>
//   node prepare-manneken.mjs --list <original.glb>     # the probe: every part, the bounds, and which way the boy looks
// The original (assets/src/manneken_pis.glb, 19.7 MB) is a 3D-print scan: 694'026 triangles in 8 meshes (Object_0 … Object_7),
// one material, no textures, no animations, Z up (the root node carries the Z-up to Y-up matrix), about 58 x 45 x 130 units
// including a small square base under the feet.
//
// Output contract (tests/manneken_asset.test.mjs):
//   metres, +y up, the base's bottom on y = 0, the bounds centred on x = z = 0, HEIGHT_M tall, the face towards +z
//   one mesh "manneken" under one node, no node transform left
//   one material "Bronze" (dark patinated bronze), no textures, no animations
//   extensions: EXT_meshopt_compression only
// It prints MANNEKEN.jet.from for manneken.js: the frontmost vertex near the centre line at JET_BAND of the height — where
// the water leaves the boy — both in his own frame and ready to paste in the corner's frame.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const HEIGHT_M = 0.61;        // the bronze's real height, base included
const TARGET_TRIS = 18000;    // the middle of the 14k..22k budget
const SIMPLIFY_ERROR = 0.02;  // generous: the scan is 694k triangles, so the ratio alone would stop the simplifier far too early
// Which way he looks. The original's root matrix puts him Y up, and Sketchfab's default camera — the thumbnail — then looks
// down -z at his face, so the face is already on +z. --list prints the check that says so (see faceSign below).
const FACE_SIGN = 1;
const JET_BAND = [0.36, 0.46];   // the jet leaves him between these fractions of his height
const JET_CENTRE = 0.04;         // ... within this many metres of the centre line
const BRONZE = { base: [0.098, 0.074, 0.030, 1], metal: 0.6, rough: 0.45 };   // #5b4a2e as a linear factor

const [, , ...args] = process.argv;
const listOnly = args[0] === '--list';
const [input, output] = listOnly ? [args[1], null] : args;
if (!input || (!listOnly && !output)) { console.error('usage: node prepare-manneken.mjs <original.glb> <out.glb>  |  --list <original.glb>'); process.exit(1); }

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();
const meshNodes = root.listNodes().filter(n => n.getMesh());

if (listOnly) {
  for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
    const b = boundsOf([p], n.getWorldMatrix());
    console.log(n.getName().padEnd(14), (p.getMaterial()?.getName() ?? '').padEnd(16), String(primTris(p)).padStart(7), 'min', r3(b.min), 'max', r3(b.max));
  }
  console.log('materials', root.listMaterials().map(m => m.getName()).join(', '), '| textures', root.listTextures().length,
    '| animations', root.listAnimations().length, '| triangles', docTris(doc));
  const whole = boundsOf(meshNodes.flatMap(n => n.getMesh().listPrimitives()), meshNodes[0].getWorldMatrix());   // every node hangs under the one root matrix
  console.log('world bounds (root matrix baked)', r3(whole.min), r3(whole.max));
  console.log('face check:', JSON.stringify(faceProbe(meshNodes, whole)));   // the two candidates for the jet start, +z and -z
  process.exit(0);
}

for (const a of root.listAnimations()) a.dispose();

// 1. bake every node transform (the root's Z up -> Y up among them) into its mesh; positions only, the normals are rebuilt at the end
const prims = [];
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
  for (const p of n.getMesh().listPrimitives()) {
    for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
    if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR')
      .setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
    prims.push(p);
  }
}
console.log('baked', prims.length, 'primitives,', docTris(doc), 'triangles');

// 2. the scene: one node, one mesh, one material, the 8 scan parts joined into a single primitive
const bronze = doc.createMaterial('Bronze').setBaseColorFactor(BRONZE.base).setMetallicFactor(BRONZE.metal).setRoughnessFactor(BRONZE.rough);
for (const p of prims) p.setMaterial(bronze);
const mesh = doc.createMesh('manneken');
for (const p of prims) mesh.addPrimitive(p);
const scene = doc.createScene('manneken');
const node = doc.createNode('manneken').setMesh(mesh); scene.addChild(node);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (n !== node) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinAll(mesh);

// 3. weld the scan (an STL has no shared vertices), then simplify down to the budget
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_TRIS / docTris(doc), error: SIMPLIFY_ERROR }), dedup(), prune());
joinAll(mesh);
console.log('simplified to', docTris(doc), 'triangles');

// 4. metres and the game's frame: scale by the height, stand the base's bottom on y = 0, centre the bounds on x = z = 0,
//    and turn him 180 degrees about y if his face came out on -z
const src = boundsOf(mesh.listPrimitives());
const k = HEIGHT_M / (src.max[1] - src.min[1]);
const [cx, cz] = [0, 2].map(i => (src.min[i] + src.max[i]) / 2);
for (const p of mesh.listPrimitives()) mapAttribute(p, 'POSITION', ([x, y, z]) => [FACE_SIGN * k * (x - cx), k * (y - src.min[1]), FACE_SIGN * k * (z - cz)]);
const game = boundsOf(mesh.listPrimitives());
console.log('frame: scale', k.toExponential(3), 'face', FACE_SIGN > 0 ? '+z' : '-z', 'bounds', r3(game.min), r3(game.max),
  'h', +(game.max[1] - game.min[1]).toFixed(4), 'w', +(game.max[0] - game.min[0]).toFixed(4), 'd', +(game.max[2] - game.min[2]).toFixed(4));

// 5. smooth normals over the welded mesh (a patinated bronze cast has no hard edges at this size)
for (const p of mesh.listPrimitives()) smoothNormals(doc, p);

// 6. where the water leaves him: the frontmost vertex near the centre line in the band. In his own frame it is [x, y, z];
//    in the corner's frame (+x towards the portal, y up, z across, the origin on the pedestal's top) it is [z, y, x].
const jet = jetStart(mesh.listPrimitives(), game);
console.log('jet start (figure frame)', r4([jet.x, jet.y, jet.z]), '=> MANNEKEN.jet.from =', JSON.stringify(r4([jet.z, jet.y, jet.x])));

for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: '177_ Manneken Pis In Brussels, Belgium (modified)', author: 'RascalFR (https://sketchfab.com/RascalFR)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/177--manneken-pis-in-brussels-belgium-fd4be588ea3d4a0fa349ae393a4f3b9f' };
await io.write(output, doc);
console.log('wrote', output, 'triangles', docTris(doc), 'meshes', root.listMeshes().map(m => m.getName()).join(','),
  'materials', root.listMaterials().map(m => m.getName()).join(','));

// ---------- helpers ----------
function r3(v) { return v.map(x => +x.toFixed(3)); }
function r4(v) { return v.map(x => +x.toFixed(4)); }
function primTris(p) { return (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
function docTris(d) { return d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + primTris(p), 0); }

function boundsOf(list, matrix = null) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], v = [];
  for (const p of list) {
    const a = p.getAttribute('POSITION');
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v);
      const w = matrix ? [0, 1, 2].map(r => matrix[r] * v[0] + matrix[4 + r] * v[1] + matrix[8 + r] * v[2] + matrix[12 + r]) : v;
      for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], w[j]); max[j] = Math.max(max[j], w[j]); }
    }
  }
  return { min, max };
}

// the accessor is detached first so a shared one is mapped once
function mapAttribute(prim, sem, fn) {
  const a = prim.getAttribute(sem); if (!a) return;
  const c = a.clone(); prim.setAttribute(sem, c);
  const v = []; for (let i = 0; i < c.getCount(); i++) c.setElement(i, fn(c.getElement(i, v)));
}

function joinAll(mesh) {
  const prims = mesh.listPrimitives();
  if (prims.length < 2) return;
  const joined = joinPrimitives(prims);
  for (const p of prims) { mesh.removePrimitive(p); p.dispose(); }
  mesh.addPrimitive(joined);
}

// area-weighted vertex normals over the welded index: every face adds its (unnormalised, so area-weighted) normal to its corners
function smoothNormals(doc, prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), n = pos.getCount();
  const out = new Float32Array(n * 3), a = [], b = [], c = [];
  for (let t = 0; t < idx.length; t += 3) {
    pos.getElement(idx[t], a); pos.getElement(idx[t + 1], b); pos.getElement(idx[t + 2], c);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) out[idx[t + j] * 3 + k] += f[k];
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) out[i * 3 + k] /= l;
  }
  prim.setAttribute('NORMAL', pos.clone().setArray(out));
}

// the frontmost vertex within JET_CENTRE of the centre line, in the JET_BAND slice of the height
function jetStart(prims, b) {
  const [lo, hi] = JET_BAND.map(f => b.min[1] + f * (b.max[1] - b.min[1]));
  let best = null, v = [];
  for (const p of prims) {
    const a = p.getAttribute('POSITION');
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v);
      if (v[1] < lo || v[1] > hi || Math.abs(v[0]) > JET_CENTRE) continue;
      if (!best || v[2] > best.z) best = { x: v[0], y: v[1], z: v[2] };
    }
  }
  if (!best) throw new Error('prepare-manneken: no vertex near the centre line in the jet band');
  return best;
}

// --list only: the frontmost near-centre vertex of the jet band on each side. The boy pees forwards, so the side that reaches
// further out from the torso is his front — the printed `reach` tells +z from -z at a glance.
function faceProbe(nodes, whole) {
  const [lo, hi] = JET_BAND.map(f => whole.min[1] + f * (whole.max[1] - whole.min[1]));
  const span = Math.max(whole.max[0] - whole.min[0], whole.max[2] - whole.min[2]);
  const [midX, midZ] = [0, 2].map(i => (whole.min[i] + whole.max[i]) / 2);   // the original sits in the positive octant, not on the origin
  const m = nodes[0].getWorldMatrix(), out = { plusZ: -Infinity, minusZ: Infinity, band: r3([lo, hi]) }, v = [];
  for (const n of nodes) for (const p of n.getMesh().listPrimitives()) {
    const a = p.getAttribute('POSITION');
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v);
      const w = [0, 1, 2].map(r => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);
      if (w[1] < lo || w[1] > hi || Math.abs(w[0] - midX) > span * 0.07) continue;
      out.plusZ = Math.max(out.plusZ, w[2]); out.minusZ = Math.min(out.minusZ, w[2]);
    }
  }
  return { ...out, reachPlusZ: +(out.plusZ - midZ).toFixed(3), reachMinusZ: +(midZ - out.minusZ).toFixed(3) };
}
