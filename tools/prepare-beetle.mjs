// prepare-beetle.mjs — builds prototype/assets/beetle.glb from the Sketchfab "VW Beetle Florida v2" (Libau Media / robinmikart,
// CC BY 4.0, https://sketchfab.com/3d-models/vw-beetle-florida-v2-aa3c40db85234d1c9b261c5734ea99a9). Issue #199.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/beetleprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-beetle.mjs <scratch>/beetleprep/ && cd <scratch>/beetleprep
//   node prepare-beetle.mjs <original.glb> <out.glb>
// The original is 1.9 MB, 38k triangles, plain materials and one photo texture (a real licence plate and a drag-strip timeslip):
// the texture and the timeslip sticker go, the plate stays blank; the steered front wheels are turned straight, the open left door
// is replaced by a mirror image of the closed right one. No simplifying.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what prototype/index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.40 m, no node transform left except the wheels'
//   node "beetle"                          the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the wheel centre, vertices centred on it
//   materials: one per role in ROLES; Glass { extras: { glass: true } }, LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const WHEELBASE_M = 2.40;   // the Beetle's 2400 mm
// original material name -> role; an unmapped name throws, so a different export cannot slip through
const MATERIAL_ROLES = {
  material: 'Body', material_3: 'Body', material_1: 'Black', material_2: 'Trim', seat: 'Black', 'Material.002': 'Seat', GLASS: 'Glass',
  'Material.001': 'LampHead', tail_light: 'LampTail', taillight_glass: 'LampTail', MIRROR: 'Chrome', brushed_metal: 'Chrome', aluminium: 'Chrome',
  engine: 'Black', exhaust: 'Black', tyre: 'Rubber', nos_bottle: 'Bottle', plate_and_sticker: 'Plate',
};
// colours are linear factors; nothing fully metallic, so the car still reads where the style has no sky map
const ROLES = {
  Body: { base: [0.62, 0.012, 0.006, 1], metal: 0, rough: 0.22 },
  Black: { base: [0.012, 0.012, 0.012, 1], metal: 0, rough: 0.8 },
  Trim: { base: [0.03, 0.03, 0.032, 1], metal: 0, rough: 0.6 },
  Seat: { base: [0.6, 0.44, 0.2, 1], metal: 0, rough: 0.85 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Bottle: { base: [0.15, 0.09, 0.8, 1], metal: 0.2, rough: 0.35 },
  Plate: { base: [0.85, 0.85, 0.82, 1], metal: 0, rough: 0.7 },
  Glass: { base: [0.05, 0.07, 0.09, 0.2], metal: 0, rough: 0.05, alpha: true, doubleSided: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};
const DROP = /^Plane\.006_/;               // the timeslip sticker on the dashboard
const OPEN_DOOR = /^Door_R\.002_/, SHUT_DOOR = /^Door_R\.001_/;
const isWheel = (node) => /^Cylinder(\.00[1-3])?_/.test(node);
const wheelGroup = (node) => node.replace(/_.*$/, '');

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-beetle.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh (meshes used twice are cloned first)
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
let all = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) all.push({ node: n.getName(), prim: p });
all = all.filter(a => !DROP.test(a.node));

// 2. straighten the steered wheels: the tyre's axle is the flattest direction of its vertices in the ground plane
const groups = {};
for (const a of all.filter(a => isWheel(a.node))) (groups[wheelGroup(a.node)] ??= []).push(a.prim);
if (Object.keys(groups).length !== 4) throw new Error(`prepare-beetle: expected 4 wheel groups, found ${Object.keys(groups).join(', ')}`);
for (const [g, prims] of Object.entries(groups)) {
  const c = centreOf(prims), angle = axleAngle(prims, c);   // angle of the axle from the original x axis, about y
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rot = ([x, y, z]) => [x * cos + z * sin, y, -x * sin + z * cos];
  for (const p of prims) mapPositions(p, (v) => { const r = rot([v[0] - c[0], v[1], v[2] - c[2]]); return [r[0] + c[0], r[1], r[2] + c[2]]; }, rot);
  console.log('wheel', g, 'straightened by', +(angle * 180 / Math.PI).toFixed(1), 'deg');
}

// 3. the frame from the straightened wheels; the original faces -z with its right side on -x... measured: front -z, left -x
const cs = Object.values(groups).map(centreOf), zs = cs.map(c => c[2]), xs = cs.map(c => c[0]);
const k = WHEELBASE_M / (Math.max(...zs) - Math.min(...zs));
const cz = (Math.max(...zs) + Math.min(...zs)) / 2, cx = (Math.max(...xs) + Math.min(...xs)) / 2, y0 = boundsOf(all.map(a => a.prim)).min[1];

// 4. close the left door: drop the open one, mirror the shut right one across the centre plane x = cx (a mirror flips the winding)
const shut = all.filter(a => SHUT_DOOR.test(a.node));
all = all.filter(a => !OPEN_DOOR.test(a.node));
for (const a of shut) {
  const p = a.prim.clone();
  mapPositions(p, ([x, y, z]) => [2 * cx - x, y, z], ([x, y, z]) => [-x, y, z]);
  flipWinding(p);
  all.push({ node: a.node.replace('Door_R.001', 'Door_L'), prim: p });
}

// new = k * (-(z - cz), y - y0, x - cx): a rotation about y (det +1), so the winding stays right
for (const { prim } of all) mapPositions(prim, ([x, y, z]) => [-k * (z - cz), k * (y - y0), k * (x - cx)], ([x, y, z]) => [-z, y, x]);

// 5. materials by role
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
  if (!role) throw new Error(`prepare-beetle: material "${src}" (node ${node}) has no role in MATERIAL_ROLES`);
  prim.setMaterial(mats[role]);
  for (const sem of prim.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL') prim.setAttribute(sem, null);   // no texture left to need UVs
}

// 6. scene: body and four wheels
const scene = doc.createScene('beetle');
const top = doc.createNode('beetle'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
const wheels = { wheel_FL: [], wheel_FR: [], wheel_RL: [], wheel_RR: [] };
for (const { node, prim } of all) {
  if (!isWheel(node)) { bodyMesh.addPrimitive(prim); continue; }
  const b = boundsOf([prim]), c = [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2);
  wheels[`wheel_${c[0] > 0 ? 'F' : 'R'}${c[2] < 0 ? 'L' : 'R'}`].push(prim);
}
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const [name, prims] of Object.entries(wheels)) {
  const b = boundsOf(prims), c = [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2);
  for (const p of prims) mapPositions(p, ([x, y, z]) => [x - c[0], y - c[1], z - c[2]], (v) => v);
  const mesh = doc.createMesh(name); prims.forEach(p => mesh.addPrimitive(p));
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3), 'width', +(b.max[2] - b.min[2]).toFixed(3));
}
for (const s of root.listScenes()) if (s !== scene) s.dispose();
const keep = new Set([top, ...top.listChildren()]);
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
for (const t of root.listTextures()) t.dispose();
root.setDefaultScene(scene);

// 7. merge per material, weld, compress
for (const m of root.listMeshes()) {
  const byMat = new Map();
  for (const p of m.listPrimitives()) { const key = p.getMaterial(); byMat.set(key, [...(byMat.get(key) || []), p]); }
  for (const prims of byMat.values()) if (prims.length > 1) { const joined = joinPrimitives(prims); prims.forEach(p => { m.removePrimitive(p); p.dispose(); }); m.addPrimitive(joined); }
}
await doc.transform(weld(), dedup(), prune());
for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'VW Beetle Florida v2 (modified)', author: 'Libau Media / robinmikart (https://sketchfab.com/robinmikart)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/vw-beetle-florida-v2-aa3c40db85234d1c9b261c5734ea99a9' };
await io.write(output, doc);
const out = boundsOf(root.listMeshes().find(m => m.getName() === 'body').listPrimitives());
const tris = root.listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
console.log('wrote', output, 'triangles', tris, 'materials', root.listMaterials().length, 'body bounds', out.min.map(v => +v.toFixed(3)), out.max.map(v => +v.toFixed(3)));

function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return { min, max };
}

function centreOf(prims) { const b = boundsOf(prims); return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }

// the axle's angle from the x axis in the ground plane: the minor axis of the vertices' x/z covariance (a wheel is a flat disc)
function axleAngle(prims, c) {
  let sxx = 0, szz = 0, sxz = 0; const v = [];
  for (const p of prims) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const dx = v[0] - c[0], dz = v[2] - c[2]; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; } }
  const major = 0.5 * Math.atan2(2 * sxz, sxx - szz);   // the disc's direction in the ground plane
  let axle = major + Math.PI / 2;
  while (axle > Math.PI / 2) axle -= Math.PI;
  while (axle < -Math.PI / 2) axle += Math.PI;
  return axle;
}

// positions through f, normals through the rotation-only g; every accessor is detached first so shared ones are not mapped twice
function mapPositions(prim, f, g) {
  for (const [sem, fn] of [['POSITION', f], ['NORMAL', g]]) {
    const a = prim.getAttribute(sem); if (!a) continue;
    const c = a.clone(); prim.setAttribute(sem, c);
    const v = []; for (let i = 0; i < c.getCount(); i++) c.setElement(i, fn(c.getElement(i, v)));
  }
}

function flipWinding(prim) {
  const idx = prim.getIndices().clone(); prim.setIndices(idx);
  const t = []; for (let i = 0; i < idx.getCount(); i += 3) { const a = idx.getScalar(i + 1); idx.setScalar(i + 1, idx.getScalar(i + 2)); idx.setScalar(i + 2, a); }
}
