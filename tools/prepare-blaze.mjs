// prepare-blaze.mjs — builds assets/blaze.glb from the Sketchfab "Low Poly Fire Truck" (jg-3d, CC BY 4.0,
// https://sketchfab.com/3d-models/low-poly-fire-truck-688b7c17a0e54a05b0b2d51a8aee061b). In the game: the Rhy Blaze, a red
// European tanker fire engine (cab-over, two axles) with blue lights and a siren, no crest, no lettering, no number plate.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-blaze.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-blaze.mjs <original.glb> <out.glb>
// The original is 0.7 MB, about 14k triangles (no simplify needed), already in metres, the front towards -x, untextured; one mesh
// with one primitive per material, so the roles go by material. The tyres and rims of all four wheels share their primitives: their
// faces go to the wheel whose quarter (front/rear by the axle gap, left/right by z) holds the face centre. The blank front plate is
// dropped. The blue roof lights are split by side into two groups, Beacon0 (left) and Beacon1 (right) { extras: { beacon: i } }:
// the game flashes them in turn while the siren is on (siren.js).
//
// Output contract (tools/prepare-hatchback.mjs's, plus the beacons):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, no node transform left except the wheels'
//   node "blaze"                           the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//   materials: one per role in ROLES, all double-sided; Glass { extras: { glass: true } }, LampHead { extras: { lamp: 'head' } },
//   LampTail { extras: { lamp: 'tail' } }, Beacon0 / Beacon1 { extras: { beacon: 0 | 1 } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
// by original material name, as the file has them: Swedish with the å, ä, ö dropped (däck tyre, fälg rim, fönster window, lykta lamp,
// strålkastare spotlight, ljus bak tail light, vägmarkering road marking)
const MATERIAL_ROLES = {
  'FireTruck.001': 'Red', FireTruck: 'Stripe', 'SvartMatt2.001': 'Black', 'SVart.001': 'Black', 'SVart.002': 'Black', 'DckSedan.001': 'Rubber',
  'Flg2.001': 'Rim', 'Flg.004': 'Hub', 'Flg.003': 'Grey', 'Material.004': 'Grey', 'Cylinder.001': 'Grey',
  'FnsterBil.001': 'Glass', 'LycktaFramSedan.001': 'LampHead', 'CarTructStrlkastare': 'LampHead', 'GlasStrlkastareBrandbil.001': 'Clear',
  'CarBlinker.001': 'Amber', 'LyseBak.001': 'LampTail', 'LyseBak2.001': 'Clear', 'Siren.003': 'Beacon',
  Vgmarkering: null,   // the blank front number plate: dropped
};
const WHEEL_ROLES = new Set(['Rubber', 'Rim', 'Hub']);
// colours are linear factors
const ROLES = {
  Red: { base: [0.6, 0.015, 0.012, 1], metal: 0.2, rough: 0.4 },
  Stripe: { base: [0.8, 0.62, 0.02, 1], metal: 0.1, rough: 0.35 },   // the reflective yellow band
  Black: { base: [0.015, 0.015, 0.015, 1], metal: 0.1, rough: 0.7 },
  Grey: { base: [0.22, 0.22, 0.23, 1], metal: 0.5, rough: 0.45 },   // the equipment lockers' shutters, steps, mirror arms
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Rim: { base: [0.45, 0.45, 0.46, 1], metal: 0.5, rough: 0.35 },
  Hub: { base: [0.1, 0.1, 0.1, 1], metal: 0.4, rough: 0.5 },
  Clear: { base: [0.75, 0.75, 0.75, 1], metal: 0, rough: 0.15 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Glass: { base: [0.05, 0.07, 0.09, 0.35], metal: 0, rough: 0.05, alpha: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
  Beacon0: { base: [0.01, 0.03, 0.3, 1], metal: 0, rough: 0.15, emissive: [0.05, 0.25, 1], extras: { beacon: 0 } },
  Beacon1: { base: [0.01, 0.03, 0.3, 1], metal: 0, rough: 0.15, emissive: [0.05, 0.25, 1], extras: { beacon: 1 } },
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-blaze.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh; positions only
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
const all = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  const src = p.getMaterial()?.getName() ?? '';
  if (!(src in MATERIAL_ROLES)) throw new Error(`prepare-blaze: material "${src}" has no role`);
  const role = MATERIAL_ROLES[src]; if (!role) continue;
  for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
  all.push({ prim: p, role, wheel: null });
}

// 2. the frame from the tyres. The original faces -x with its right side on -z: new = (-(x - cx), y - y0, -z), a half turn about y
const tyres = all.filter(a => a.role === 'Rubber'), tb = boundsOf(tyres.map(t => t.prim));
const gapX = largestGap(faceCentres(tyres[0].prim).map(c => c[0]));   // the axle gap: between the front and the rear tyres
const axleXs = [tb.min[0], tb.max[0]].map(edge => faceCentres(tyres[0].prim).filter(c => Math.sign(c[0] - gapX) === Math.sign(edge - gapX)));
const cx = axleXs.map(cs => (Math.min(...cs.map(c => c[0])) + Math.max(...cs.map(c => c[0]))) / 2).reduce((a, b) => a + b) / 2, y0 = tb.min[1];
const toNew = ([x, y, z]) => [-(x - cx), y - y0, -z];
for (const { prim } of all) mapAttribute(prim, 'POSITION', toNew);

// 3. the wheel parts split into the four quarters; the beacons split by side
const pieces = [];
for (const a of all) {
  if (WHEEL_ROLES.has(a.role)) for (const piece of splitByFace(a.prim, (c) => `wheel_${c[0] > 0 ? 'F' : 'R'}${c[2] < 0 ? 'L' : 'R'}`)) pieces.push({ prim: piece.prim, role: a.role, wheel: piece.key });
  else if (a.role === 'Beacon') for (const piece of splitByFace(a.prim, (c) => `Beacon${c[2] < 0 ? 0 : 1}`)) pieces.push({ prim: piece.prim, role: piece.key, wheel: null });
  else pieces.push(a);
}

// 4. materials by role
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough).setDoubleSided(true);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
for (const { prim, role } of pieces) prim.setMaterial(mats[role]);

// 5. scene: body and four wheels, each centred on its tyre (set symmetric per axle: its mean x and mean half track; the rear track is narrower)
const scene = doc.createScene('blaze');
const top = doc.createNode('blaze'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
for (const { prim, wheel } of pieces) if (!wheel) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
const NAMES = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];
const tyreC = Object.fromEntries(NAMES.map(n => [n, centreOf(boundsOf(pieces.filter(p => p.wheel === n && p.role === 'Rubber').map(p => p.prim)))]));
const r = NAMES.reduce((t, n) => t + tyreC[n][1], 0) / 4;
const axleX = (f) => (tyreC[`wheel_${f}L`][0] + tyreC[`wheel_${f}R`][0]) / 2, halfTrack = (f) => (tyreC[`wheel_${f}R`][2] - tyreC[`wheel_${f}L`][2]) / 2;
for (const name of NAMES) {
  const c = tyreC[name], at = [axleX(name[6]), r, (name[7] === 'L' ? -1 : 1) * halfTrack(name[6])];
  const mine = pieces.filter(p => p.wheel === name);
  for (const { prim } of mine) mapAttribute(prim, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(name); mine.forEach(a => mesh.addPrimitive(a.prim));
  top.addChild(doc.createNode(name).setTranslation(at).setMesh(mesh));
  console.log(name, 'centre', r3(at), 'tyre centre', r3(c), 'parts', mine.length);
}
console.log('wheel r', +r.toFixed(3));

const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());

// 6. normals: smooth across edges flatter than the crease angle
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await doc.transform(weld(), prune());
for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'Low Poly Fire Truck (modified)', author: 'jg-3d (https://sketchfab.com/jg-3d)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/low-poly-fire-truck-688b7c17a0e54a05b0b2d51a8aee061b' };
await io.write(output, doc);
const body = root.listMeshes().find(m => m.getName() === 'body').listPrimitives(), byMat = (n) => boundsOf(body.filter(p => p.getMaterial().getName() === n));
console.log('wrote', output, 'triangles', docTris(doc), 'materials', root.listMaterials().length, 'body bounds', r3(boundsOf(body).min), r3(boundsOf(body).max));
for (const n of ['LampHead', 'LampTail', 'Amber', 'Beacon0', 'Beacon1']) console.log(n, 'bounds', r3(byMat(n).min), r3(byMat(n).max));

// ---------- helpers ----------
function r3(v) { return v.map(x => +x.toFixed(3)); }
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function primTris(p) { return (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
function docTris(d) { return d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + primTris(p), 0); }
// the middle of the widest empty stretch between sorted values
function largestGap(values) {
  const s = [...values].sort((a, b) => a - b); let best = 0, at = s[0];
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > best) { best = s[i] - s[i - 1]; at = (s[i] + s[i - 1]) / 2; }
  return at;
}
function faceCentres(prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), out = [], a = [];
  for (let f = 0; f < idx.length; f += 3) { const c = [0, 0, 0]; for (let j = 0; j < 3; j++) { pos.getElement(idx[f + j], a); for (let i = 0; i < 3; i++) c[i] += a[i] / 3; } out.push(c); }
  return out;
}

// indexed vertices only: parts of the original share one vertex buffer
function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    const a = p.getAttribute('POSITION'), idx = p.getIndices()?.getArray() ?? Array.from({ length: a.getCount() }, (_, i) => i), v = [];
    for (const i of idx) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } }
  }
  return { min, max };
}

// the accessor is detached first so a shared one is mapped once
function mapAttribute(prim, sem, fn) {
  const a = prim.getAttribute(sem); if (!a) return;
  const c = a.clone(); prim.setAttribute(sem, c);
  const v = []; for (let i = 0; i < c.getCount(); i++) c.setElement(i, fn(c.getElement(i, v)));
}

// one primitive per keyOf(face centre), sharing the vertex accessor (each later gets its own when its vertices are mapped)
function splitByFace(prim, keyOf) {
  const idx = prim.getIndices().getArray(), groups = new Map();
  faceCentres(prim).forEach((c, f) => { const k = keyOf(c); (groups.get(k) ?? groups.set(k, []).get(k)).push(idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]); });
  return [...groups].map(([key, list]) => { const p = prim.clone(); p.setIndices(prim.getIndices().clone().setArray(Uint32Array.from(list))); return { key, prim: p }; });
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
  for (let f = 0; f < idx.length; f += 3) {
    for (let j = 0; j < 3; j++) pos.getElement(idx[f + j], p[j]);
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
