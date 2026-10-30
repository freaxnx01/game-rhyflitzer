// prepare-modelt.mjs — builds prototype/assets/modelt.glb from the Sketchfab "Ford Model T Downloadable" (Libau Media / robinmikart,
// CC BY 4.0, https://sketchfab.com/3d-models/ford-model-t-downloadable-8cb1c1243c394144837a15f4722a2867). Issue #521.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/mtprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-modelt.mjs <scratch>/mtprep/ && cd <scratch>/mtprep
//   node prepare-modelt.mjs <original.glb> <out.glb>
// The original is 1.2 MB, 30k triangles, plain materials and no textures: no simplifying.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what prototype/index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.54 m, no node transform left except the wheels'
//   node "modelt"                          the scene root
//     node "body"                          everything that does not turn (the spare wheel on the tail included)
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the wheel centre, vertices centred on it
//   materials: one per role in ROLES; Glass { extras: { glass: true } }, LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const WHEELBASE_M = 2.54;   // the Model T's 100 in; the model's 30 in wheels then come out at 0.77 m, true to the car
// original material name -> role; an unmapped name throws, so a different export cannot slip through
const MATERIAL_ROLES = { body: 'Body', body_matte: 'Rubber', bronze_trim: 'Brass', Chassis: 'Chassis', chrome: 'Chrome', leather: 'Leather', roof: 'Hood', wood: 'Wood', light: 'LampHead', glass: 'Glass' };
// colours are linear factors; nothing fully metallic, so the car still reads where the style has no sky map
const ROLES = {
  Body: { base: [0.012, 0.012, 0.013, 1], metal: 0, rough: 0.25 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Brass: { base: [0.45, 0.28, 0.06, 1], metal: 0.3, rough: 0.35 },
  Chassis: { base: [0.015, 0.015, 0.015, 1], metal: 0, rough: 0.6 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Leather: { base: [0.03, 0.02, 0.015, 1], metal: 0, rough: 0.55 },
  Hood: { base: [0.085, 0.029, 0.009, 1], metal: 0, rough: 0.8 },
  Wood: { base: [0.102, 0.054, 0.035, 1], metal: 0, rough: 0.72 },
  Glass: { base: [0.05, 0.07, 0.09, 0.2], metal: 0, rough: 0.05, alpha: true, doubleSided: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};
// the model has no tail lamp; the real car carried one small lamp on the left rear: a box, in game metres (centre, size)
const TAIL_LAMP = { at: [-1.62, 0.78, -0.6], size: [0.08, 0.1, 0.1] };
const isWheel = (node) => /^wheel (front|back)/.test(node);
const wheelGroup = (node) => node.replace(/_[^_]+_0$/, '').replace(/_body matte$/, '');

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-modelt.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh (meshes used twice are cloned first), then map the original frame (front +z, right -x)
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
const all = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) all.push({ node: n.getName(), prim: p });
const wheelCentres = groupCentres(all.filter(a => isWheel(a.node)));
if (Object.keys(wheelCentres).length !== 4) throw new Error(`prepare-modelt: expected 4 wheel groups, found ${Object.keys(wheelCentres).join(', ')}`);
const cs = Object.values(wheelCentres), zs = cs.map(c => c[2]), xs = cs.map(c => c[0]);
const k = WHEELBASE_M / (Math.max(...zs) - Math.min(...zs));
const cz = (Math.max(...zs) + Math.min(...zs)) / 2, cx = (Math.max(...xs) + Math.min(...xs)) / 2, y0 = boundsOf(all.map(a => a.prim)).min[1];
// new = k * (z - cz, y - y0, -(x - cx)): a rotation about y (det +1), so the winding stays right
for (const { prim } of all) mapPositions(prim, ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)], ([x, y, z]) => [z, y, -x]);

// 2. materials by role
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.doubleSided) m.setDoubleSided(true);
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
for (const { node, prim } of all) {
  const src = prim.getMaterial()?.getName(), role = MATERIAL_ROLES[src];
  if (!role) throw new Error(`prepare-modelt: material "${src}" (node ${node}) has no role in MATERIAL_ROLES`);
  prim.setMaterial(mats[role]);
}

// 3. scene: body (+ the tail lamp) and four wheels
const scene = doc.createScene('modelt');
const top = doc.createNode('modelt'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
const wheels = { wheel_FL: [], wheel_FR: [], wheel_RL: [], wheel_RR: [] };
for (const { node, prim } of all) {
  if (!isWheel(node)) { bodyMesh.addPrimitive(prim); continue; }
  const b = boundsOf([prim]), c = [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2);
  wheels[`wheel_${c[0] > 0 ? 'F' : 'R'}${c[2] < 0 ? 'L' : 'R'}`].push(prim);
}
bodyMesh.addPrimitive(box(doc, TAIL_LAMP.at, TAIL_LAMP.size, mats.LampTail));
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const [name, prims] of Object.entries(wheels)) {
  const b = boundsOf(prims), c = [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2);
  for (const p of prims) mapPositions(p, ([x, y, z]) => [x - c[0], y - c[1], z - c[2]], (v) => v);
  const mesh = doc.createMesh(name); prims.forEach(p => mesh.addPrimitive(p));
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3));
}
for (const s of root.listScenes()) if (s !== scene) s.dispose();
const keep = new Set([top, ...top.listChildren()]);
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);

// 4. merge per material, weld, compress
for (const m of root.listMeshes()) {
  const byMat = new Map();
  for (const p of m.listPrimitives()) { const key = p.getMaterial(); byMat.set(key, [...(byMat.get(key) || []), p]); }
  for (const prims of byMat.values()) if (prims.length > 1) { const joined = joinPrimitives(prims); prims.forEach(p => { m.removePrimitive(p); p.dispose(); }); m.addPrimitive(joined); }
}
await doc.transform(weld(), dedup(), prune());
for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'Ford Model T Downloadable (modified)', author: 'Libau Media / robinmikart (https://sketchfab.com/robinmikart)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/ford-model-t-downloadable-8cb1c1243c394144837a15f4722a2867' };
await io.write(output, doc);
const out = boundsOf(root.listMeshes().find(m => m.getName() === 'body').listPrimitives());
const tris = root.listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
console.log('wrote', output, 'triangles', tris, 'materials', root.listMaterials().length, 'body bounds', out.min.map(v => +v.toFixed(3)), out.max.map(v => +v.toFixed(3)));

function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return { min, max };
}

// the centre of each wheel's parts (tyre, spokes, hub are separate nodes of one wheel), in the original frame
function groupCentres(parts) {
  const groups = {};
  for (const { node, prim } of parts) (groups[wheelGroup(node)] ??= []).push(prim);
  return Object.fromEntries(Object.entries(groups).map(([g, prims]) => { const b = boundsOf(prims); return [g, [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2)]; }));
}

// positions through f, normals through the rotation-only g; every accessor is detached first so shared ones are not mapped twice
function mapPositions(prim, f, g) {
  for (const [sem, fn] of [['POSITION', f], ['NORMAL', g]]) {
    const a = prim.getAttribute(sem); if (!a) continue;
    const c = a.clone(); prim.setAttribute(sem, c);
    const v = []; for (let i = 0; i < c.getCount(); i++) c.setElement(i, fn(c.getElement(i, v)));
  }
}

// an axis-aligned box, 24 vertices with flat normals, outward winding
function box(d, at, size, material) {
  const pos = [], nrm = [], idx = [];
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const u = (axis + 1) % 3, w = (axis + 2) % 3, base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0]; p[axis] = sign; p[u] = a; p[w] = b;
      pos.push(...p.map((v, i) => at[i] + v * size[i] / 2)); nrm.push(...[0, 1, 2].map(i => (i === axis ? sign : 0)));
    }
    idx.push(...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(i => base + i));
  }
  const buf = d.getRoot().listBuffers()[0];
  return d.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', d.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('NORMAL', d.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buf))
    .setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf));
}
