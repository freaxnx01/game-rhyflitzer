// prepare-coupe.mjs — builds prototype/assets/coupe.glb from the Sketchfab "2012 BMW 1M" (OUTPISTON, CC BY-NC-SA 4.0,
// https://sketchfab.com/3d-models/2012-bmw-1m-b011893b8f8049568610be2abb3ecf8e). In the game: the Rhy Coupé, no badge.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/cprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-coupe.mjs <scratch>/cprep/ && cd <scratch>/cprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-coupe.mjs <original.glb> <out.glb>
// The original is 1.8 MB, 26k triangles in 61 parts, 10 materials (some with small textures). It is light enough to keep as it
// is: no simplifying. The textures go (plain role materials instead), the four badges are dropped, and the one part that holds
// both the head and the tail lamp inserts is split by which end of the car each face is on. Normals are rebuilt, smooth below a
// crease angle.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what prototype/index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.66 m, no node transform left except the wheels'
//   node "coupe"                           the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//   materials: one per role in ROLES; Paint { extras: { paint: true } } (white, the swatch is the colour), Glass { extras: { glass: true } },
//   LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const WHEELBASE_M = 2.66;   // the 1M's 2660 mm
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
const PREFIX = 'Vehicle_Exterior_mm_';
// the badges: the roundel on the bonnet, the model lettering on the boot lid, the wing badge, the one in the front bumper
const DROP = new Set(['Object_37', 'Object_47', 'Object_51', 'Object_71']);
// original material name (without the prefix) -> role; an unmapped name throws, so a different export cannot slip through
const MATERIAL_ROLES = {
  ext: 'Paint', cab: 'Interior', chassis: 'Black', misc: 'Trim', windows: 'Glass',
  tyre: 'Rubber', wheel: 'Chrome', rotor: 'Chrome',
};
const WHEEL_MATERIALS = new Set(['tyre', 'wheel', 'rotor']);
const NODE_ROLES = {
  Object_53: 'Chrome',                                       // the four tailpipes, filed under the body colour
  Object_89: 'LampHead', Object_112: 'LampHead',             // the head lamp covers: a lamp, not glass, so they light up with L
  Object_110: 'LampTail', Object_73: 'LampTail', Object_87: 'LampTail',   // the tail lamps and the third brake light
  Object_39: 'Amber', Object_91: 'Amber',                    // the side repeaters on the wings
  Object_19: 'Trim',                                         // the kidney grille surround
};
// head and tail lamp inserts in one part: the faces ahead of the middle are LampHead, the others LampTail
const MIXED_LAMPS = 'Object_55';
// colours are linear factors; nothing fully metallic, so the car still reads where the style has no sky map
const ROLES = {
  Paint: { base: [1, 1, 1, 1], metal: 0.25, rough: 0.35, extras: { paint: true } },
  Black: { base: [0.012, 0.012, 0.012, 1], metal: 0, rough: 0.8 },
  Trim: { base: [0.03, 0.03, 0.032, 1], metal: 0, rough: 0.6 },
  Interior: { base: [0.03, 0.03, 0.03, 1], metal: 0, rough: 0.85 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Glass: { base: [0.05, 0.07, 0.09, 0.2], metal: 0, rough: 0.05, alpha: true, doubleSided: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-coupe.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh (meshes used twice are cloned first); keep positions only (normals are rebuilt in 5.)
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
const all = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  if (DROP.has(n.getName())) continue;
  const src = (p.getMaterial()?.getName() ?? '').replace(PREFIX, ''), role = NODE_ROLES[n.getName()] ?? MATERIAL_ROLES[src];
  if (!role && n.getName() !== MIXED_LAMPS) throw new Error(`prepare-coupe: material "${src}" (node ${n.getName()}) has no role in MATERIAL_ROLES`);
  for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  all.push({ node: n.getName(), prim: p, role, wheel: WHEEL_MATERIALS.has(src) });
}

// 2. the frame from the tyres; the original faces +z with its right side on -x: new = k * (z - cz, y - y0, -(x - cx)), a rotation about y
const tyres = all.filter(a => a.wheel && a.role === 'Rubber').map(a => centreOf(boundsOf([a.prim])));
if (tyres.length !== 4) throw new Error(`prepare-coupe: expected 4 tyres, found ${tyres.length}`);
const tz = tyres.map(c => c[2]), tx = tyres.map(c => c[0]);
const k = WHEELBASE_M / (Math.max(...tz) - Math.min(...tz));
const cz = (Math.max(...tz) + Math.min(...tz)) / 2, cx = (Math.max(...tx) + Math.min(...tx)) / 2, y0 = boundsOf(all.map(a => a.prim)).min[1];
for (const { prim } of all) mapAttribute(prim, 'POSITION', ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)]);

// 3. the mixed lamp part split by end, then materials by role
const mixed = all.find(a => a.node === MIXED_LAMPS);
mixed.role = 'LampHead';
all.push({ node: MIXED_LAMPS, prim: cutOut(mixed.prim, c => c[0] < 0), role: 'LampTail', wheel: false });
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.doubleSided) m.setDoubleSided(true);
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
for (const { prim, role } of all) prim.setMaterial(mats[role]);

// 4. scene: body + four wheels (wheel parts sorted to their wheel by quadrant, vertices centred on the tyre's centre)
const scene = doc.createScene('coupe');
const top = doc.createNode('coupe'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
const wheels = { wheel_FL: [], wheel_FR: [], wheel_RL: [], wheel_RR: [] };
for (const { prim, wheel } of all) {
  if (!wheel) { bodyMesh.addPrimitive(prim); continue; }
  const c = centreOf(boundsOf([prim]));
  wheels[`wheel_${c[0] > 0 ? 'F' : 'R'}${c[2] < 0 ? 'L' : 'R'}`].push(prim);
}
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const [name, prims] of Object.entries(wheels)) {
  const tyre = prims.find(p => p.getMaterial() === mats.Rubber), b = boundsOf([tyre]), c = centreOf(b);
  for (const p of prims) mapAttribute(p, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(name); prims.forEach(p => mesh.addPrimitive(p));
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3));
}
const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());

// 5. normals: smooth across edges flatter than the crease angle
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await doc.transform(weld(), prune());
for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: '2012 BMW 1M (modified)', author: 'OUTPISTON (https://sketchfab.com/outpiston)', license: 'CC-BY-NC-SA-4.0', source: 'https://sketchfab.com/3d-models/2012-bmw-1m-b011893b8f8049568610be2abb3ecf8e' };
await io.write(output, doc);
const bodyB = boundsOf(root.listMeshes().find(m => m.getName() === 'body').listPrimitives());
console.log('wrote', output, 'triangles', docTris(doc), 'materials', root.listMaterials().length, 'body bounds', bodyB.min.map(v => +v.toFixed(3)), bodyB.max.map(v => +v.toFixed(3)));

// ---------- helpers ----------
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function primTris(p) { return (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
function docTris(d) { return d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + primTris(p), 0); }

// indexed vertices only: parts of the original share one vertex buffer
function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    const a = p.getAttribute('POSITION'), idx = p.getIndices()?.getArray() ?? Array.from({ length: a.getCount() }, (_, i) => i), v = [];
    for (const i of idx) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } }
  }
  return { min, max };
}

// moves the faces whose centre passes the test out of the primitive, into a new one that it returns
function cutOut(prim, test) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), keep = [], cut = [], v = [];
  for (let t = 0; t < idx.length; t += 3) {
    const c = [0, 0, 0];
    for (let j = 0; j < 3; j++) { pos.getElement(idx[t + j], v); for (let a = 0; a < 3; a++) c[a] += v[a] / 3; }
    (test(c) ? cut : keep).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (!cut.length || !keep.length) throw new Error(`prepare-coupe: the split left ${keep.length / 3} / ${cut.length / 3} faces; expected both lamps`);
  const piece = prim.clone();
  prim.setIndices(prim.getIndices().clone().setArray(new Uint32Array(keep)));
  piece.setIndices(piece.getIndices().clone().setArray(new Uint32Array(cut)));
  return piece;
}

// the accessor is detached first so a shared one is mapped once
function mapAttribute(prim, sem, fn) {
  const a = prim.getAttribute(sem); if (!a) return;
  const c = a.clone(); prim.setAttribute(sem, c);
  const v = []; for (let i = 0; i < c.getCount(); i++) c.setElement(i, fn(c.getElement(i, v)));
}

function joinByMaterial(d) {
  for (const m of d.getRoot().listMeshes()) {
    const groups = new Map();
    for (const p of m.listPrimitives()) groups.set(p.getMaterial(), [...(groups.get(p.getMaterial()) ?? []), p]);
    for (const prims of groups.values()) {
      if (prims.length < 2) continue;
      const joined = joinPrimitives(prims);
      for (const p of prims) { m.removePrimitive(p); p.dispose(); }
      m.addPrimitive(joined);
    }
  }
}

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
function unit(n) { const l = Math.hypot(...n) || 1; return n.map(v => v / l); }

// unwelds the primitive (three vertices per face) and gives each corner the area-weighted normal of the faces around its position
// that meet this face flatter than the crease angle; weld() later merges the corners that ended up equal
function creaseNormals(prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), p = [[], [], []];
  const faces = [], byVertex = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let j = 0; j < 3; j++) pos.getElement(idx[t + j], p[j]);
    const n = faceNormal(p[0], p[1], p[2]);
    faces.push({ n, u: unit(n), corners: p.map(v => [...v]) });
    for (let j = 0; j < 3; j++) { const key = p[j].map(v => v.toFixed(5)).join(','); byVertex.set(key, [...(byVertex.get(key) ?? []), faces.length - 1]); }
  }
  const outPos = new Float32Array(faces.length * 9), outNrm = new Float32Array(faces.length * 9);
  faces.forEach((f, i) => f.corners.forEach((c, j) => {
    const sum = [0, 0, 0];
    for (const o of byVertex.get(c.map(v => v.toFixed(5)).join(','))) {
      const g = faces[o];
      if (g.u[0] * f.u[0] + g.u[1] * f.u[1] + g.u[2] * f.u[2] >= CREASE) for (let a = 0; a < 3; a++) sum[a] += g.n[a];
    }
    outPos.set(c, i * 9 + j * 3); outNrm.set(unit(sum), i * 9 + j * 3);
  }));
  const d = prim.getAttribute('POSITION');
  prim.setAttribute('POSITION', d.clone().setArray(outPos));
  prim.setAttribute('NORMAL', d.clone().setArray(outNrm));
  prim.setIndices(prim.getIndices().clone().setArray(new Uint32Array(faces.length * 3).map((_, i) => i)));
}
