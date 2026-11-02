// prepare-mixer.mjs — builds assets/mixer.glb from the Sketchfab "Magirus D serie mixer truck" (Randonavt, CC BY 4.0,
// https://sketchfab.com/3d-models/magirus-d-serie-mixer-truck-2816fbf6ca4d489592282b77dbf1c28e). In the game: the Rhy Mixer,
// a 1970s cab-over concrete mixer truck with a turning drum, no badge, no number plates.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-mixer.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-mixer.mjs <original.glb> <out.glb>
// The original is 11 MB, about 127k triangles, the front towards +z, its left side on +x, one material per part with 45
// textures. Only two textures stay: the cab's and the drum's livery (flat orange and cream areas); everything else gets a
// plain role colour. The number plates are dropped. Every part has its own named node, so the roles, the wheels and the drum
// go by node name. Six wheel nodes: the front axle (wheel_FL / FR), the tandem's front axle (wheel_RL / RR, each with its
// twin tyre) and its rear axle (wheel_RL2 / RR2). The drum is its own node on its axis, local +x along it, so the game turns it.
// Simplified to the triangle budget; normals rebuilt, smooth below a crease angle.
//
// Output contract (tools/prepare-hatchback.mjs's, plus the second rear axle and the drum):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin between the front axle and the tandem's centre, no node transform
//   left except the wheels' and the drum's
//   node "mixer"                           the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR" "wheel_RL2" "wheel_RR2"
//                                          left (-z) / right (+z); translation = the axle centre of that wheel (or twin), vertices centred on it
//     node "drum"                          translation = a point on the drum axis, rotation = local +x along the axis (rear end up)
//   materials: one per role in ROLES, all double-sided as in the original; Cab and Drum keep their textures, Glass { extras: { glass: true } },
//   LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, joinPrimitives, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const TYRE_D = 1.07;   // a 12 R 22.5 truck tyre; scales the model (2.5 m wide body, 7.3 m long)
const TARGET_TRIS = { min: 30000, max: 38000, aim: 34000 }, MAX_TRIES = 6;
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
const strip = (name) => name.replace(/_0$/, '');
// the number plates (real lettering)
const DROP = new Set(['front_license_plate_Material.105', 'front_license_plate_Material.104', 'rear_license_plate_Material.105', 'rear_license_plate_Material.104']);
// the wheels by node name: <side>_<axle>_wheel[_<twin>]_<part>
const WHEEL = /^(left|right)_(front|middle|rear)_wheel/;
const WHEEL_NODE = { front: '', middle: '', rear: '2' };
const DRUM = new Set(['mixer_tank_base_colour', 'mixer_tank_shadow', 'mixer_tank_silver.005']);
// by original material name
const MATERIAL_ROLES = {
  'base_colour.002': 'Cab', base_colour: 'Drum',
  'white_metal.001': 'Red', 'white_metal.001_0': 'Black', 'white_metal.001_1': 'Chrome', 'white_metal.001_2': 'Black', 'white_metal.001_3': 'Cream',
  'white_metal.001_4': 'Grey', 'white_metal.001_5': 'Grey', 'white_metal.001_6': 'Grey', 'white_metal.001_7': 'Orange', 'white_metal.001_8': 'Grey',
  dark_plastic: 'Rubber', dark_plastic_0: 'Rubber', 'rubber.001': 'Rubber', 'Material.044': 'Black', shadow: 'Black',
  left_turn_indicator: 'LampHead', left_turn_indicator_0: 'LampTail', left_turn_indicator_1: 'Amber', left_turn_indicator_2: 'Amber',
  left_turn_indicator_13: 'Glass', mirror: 'Chrome', multimedia_2: 'Grey',
};
// the cab interior: dashboard, seats, gauges, pedals, the lunch on the dashboard
const INTERIOR = /^(dark_plastic_[1-5]|base_colour\.001|multimedia(_[01])?|left_turn_indicator_([3-9]|1[0-2])|Material\.00[237](_[0-5])?|Material\.032|emergency_blinkers_indicator|screen)$/;
// colours are linear factors; nothing fully metallic, so the truck still reads where the style has no sky map
const ROLES = {
  Cab: { base: [1, 1, 1, 1], metal: 0.2, rough: 0.45, keepTexture: true },
  Drum: { base: [1, 1, 1, 1], metal: 0.2, rough: 0.45, keepTexture: true },
  Orange: { base: [0.6, 0.16, 0.02, 1], metal: 0.2, rough: 0.5 },
  Red: { base: [0.4, 0.03, 0.03, 1], metal: 0.2, rough: 0.5 },
  Cream: { base: [0.64, 0.6, 0.52, 1], metal: 0.1, rough: 0.5 },
  Black: { base: [0.015, 0.015, 0.015, 1], metal: 0.1, rough: 0.7 },
  Grey: { base: [0.2, 0.2, 0.2, 1], metal: 0.3, rough: 0.6 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Interior: { base: [0.05, 0.045, 0.04, 1], metal: 0, rough: 0.8 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Glass: { base: [0.05, 0.07, 0.09, 0.35], metal: 0, rough: 0.05, alpha: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-mixer.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh (meshes used twice are cloned first); positions only, plus the UVs of the two livery parts
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
const all = [];
const srcTexture = {};
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  const name = strip(n.getName()), src = p.getMaterial()?.getName() ?? '';
  if (DROP.has(name)) continue;
  const role = MATERIAL_ROLES[src] ?? (INTERIOR.test(src) ? 'Interior' : null);
  if (!role) throw new Error(`prepare-mixer: part ${name} (material "${src}") has no role`);
  if (ROLES[role].keepTexture) srcTexture[role] = p.getMaterial().getBaseColorTexture();
  for (const sem of p.listSemantics()) if (sem !== 'POSITION' && !(ROLES[role].keepTexture && sem === 'TEXCOORD_0')) p.setAttribute(sem, null);
  for (const t of p.listTargets()) p.removeTarget(t);
  if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
  const w = name.match(WHEEL);
  all.push({ name, prim: p, role, wheel: w ? `wheel_${w[1] === 'left' ? 'L' : 'R'}${w[2]}` : null, drum: DRUM.has(name) });
}
for (const role of ['Cab', 'Drum']) if (!srcTexture[role]) throw new Error(`prepare-mixer: no ${role} texture`);
for (const name of DRUM) if (!all.some(a => a.name === name)) throw new Error(`prepare-mixer: drum part ${name} is missing`);

// 2. the frame from the tyres: the front axle and the tandem's two axles.
//    The original faces +z with its left side on +x: new = k * (z - cz, y - y0, -(x - cx)), a rotation about y
const tyres = all.filter(a => a.wheel && /_tire$/.test(a.name)), tb = boundsOf(tyres.map(t => t.prim));
const axleZ = (axle) => centreOf(boundsOf(tyres.filter(t => t.wheel.endsWith(axle)).map(t => t.prim)))[2];
const k = TYRE_D / (tb.max[1] - tb.min[1]), y0 = tb.min[1];
const cz = (axleZ('front') + (axleZ('middle') + axleZ('rear')) / 2) / 2, cx = (tb.min[0] + tb.max[0]) / 2;
const toNew = ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)];
for (const { prim } of all) mapAttribute(prim, 'POSITION', toNew);

// 3. materials by role; the cab and the drum keep their livery textures
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough).setDoubleSided(true);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  if (r.keepTexture) m.setBaseColorTexture(srcTexture[name]);
  mats[name] = m;
}
for (const { prim, role } of all) prim.setMaterial(mats[role]);

// 4. scene: body, six wheel nodes (vertices centred on the axle centre of the wheel or twin), the drum on its axis
const scene = doc.createScene('mixer');
const top = doc.createNode('mixer'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
for (const { prim, wheel, drum } of all) if (!wheel && !drum) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const [side, axle] of [['L', 'front'], ['R', 'front'], ['L', 'middle'], ['R', 'middle'], ['L', 'rear'], ['R', 'rear']]) {
  const mine = all.filter(a => a.wheel === `wheel_${side}${axle}`), name = `wheel_${axle === 'front' ? 'F' : 'R'}${side}${WHEEL_NODE[axle]}`;
  const tyreB = boundsOf(mine.filter(a => /_tire$/.test(a.name)).map(a => a.prim)), c = centreOf(tyreB);
  for (const { prim } of mine) mapAttribute(prim, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(name); mine.forEach(a => mesh.addPrimitive(a.prim));
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((tyreB.max[1] - tyreB.min[1]) / 2).toFixed(3));
}
const drumParts = all.filter(a => a.drum), axis = drumAxis(drumParts.filter(a => a.name === 'mixer_tank_base_colour').map(a => a.prim));
const toLocal = frameOf(axis.dir);   // world -> drum local: rows are the local axes
for (const { prim } of drumParts) mapAttribute(prim, 'POSITION', (p) => { const d = [0, 1, 2].map(i => p[i] - axis.at[i]); return toLocal.map(r => r[0] * d[0] + r[1] * d[1] + r[2] * d[2]); });
const drumMesh = doc.createMesh('drum'); drumParts.forEach(a => drumMesh.addPrimitive(a.prim));
top.addChild(doc.createNode('drum').setTranslation(axis.at).setRotation(quatFromRows(toLocal)).setMesh(drumMesh));
console.log('drum at', axis.at.map(v => +v.toFixed(3)), 'axis', axis.dir.map(v => +v.toFixed(3)), 'tilt deg', +(Math.asin(axis.dir[1]) * 180 / Math.PI).toFixed(1));

const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());

// 5. simplify to the triangle budget, then normals: smooth across edges flatter than the crease angle
const out = await simplifyTo(doc);
for (const m of out.getRoot().listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await out.transform(weld(), prune());
for (const e of out.getRoot().listExtensionsUsed()) e.dispose();
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
out.getRoot().getAsset().extras = { title: 'Magirus D serie mixer truck (modified)', author: 'Randonavt (https://sketchfab.com/Randonavt)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/magirus-d-serie-mixer-truck-2816fbf6ca4d489592282b77dbf1c28e' };
await io.write(output, out);
const outRoot = out.getRoot(), body = outRoot.listMeshes().find(m => m.getName() === 'body').listPrimitives();
const r3 = (v) => v.map(x => +x.toFixed(3)), amber = boundsOf(body.filter(p => p.getMaterial().getName() === 'Amber'));
console.log('wrote', output, 'triangles', docTris(out), 'materials', outRoot.listMaterials().length, 'body bounds', r3(boundsOf(body).min), r3(boundsOf(body).max));
console.log('amber bounds', r3(amber.min), r3(amber.max));

// ---------- the drum's axis ----------
// the principal axis of the drum shell's vertices (it is longer than wide), through their mean; pointing backwards and up
function drumAxis(prims) {
  const pts = [], v = [];
  for (const p of prims) { const a = p.getAttribute('POSITION'); for (const i of p.getIndices().getArray()) pts.push([...a.getElement(i, v)]); }
  const at = [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
  const cov = [0, 1, 2].map(i => [0, 1, 2].map(j => pts.reduce((s, p) => s + (p[i] - at[i]) * (p[j] - at[j]), 0)));
  let dir = [1, 0.3, 0.1];
  for (let it = 0; it < 100; it++) dir = unit(cov.map(row => row[0] * dir[0] + row[1] * dir[1] + row[2] * dir[2]));
  if (dir[0] > 0) dir = dir.map(x => -x);
  return { at, dir };
}
// rows: local x along dir, local y the world up made square to it, local z = x cross y
function frameOf(dir) {
  const up = unit([0, 1, 0].map((u, i) => u - dir[1] * dir[i])), z = cross(dir, up);
  return [dir, up, z];
}
// the rotation that takes local axes to world: its matrix has the rows above as columns
function quatFromRows([x, y, z]) {
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; return [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
}
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

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

async function simplifyTo(d) {
  let ratio = TARGET_TRIS.aim / docTris(d), result = null;
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    const attempt = cloneDocument(d);
    await attempt.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: false }));
    const tris = docTris(attempt);
    console.log(`simplify try ${tries}: ratio ${ratio.toFixed(4)} -> ${tris} triangles`);
    result = attempt;
    if (tris >= TARGET_TRIS.min && tris <= TARGET_TRIS.max) return result;
    ratio = Math.min(1, ratio * TARGET_TRIS.aim / tris);
  }
  throw new Error(`prepare-mixer: ${docTris(result)} triangles after ${MAX_TRIES} tries`);
}

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
function unit(n) { const l = Math.hypot(...n) || 1; return n.map(v => v / l); }

// unwelds the primitive (three vertices per face) and gives each corner the area-weighted normal of the faces around its position
// that meet this face flatter than the crease angle; weld() later merges the corners that ended up equal. UVs follow their corner.
function creaseNormals(prim) {
  const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices().getArray(), p = [[], [], []], t = [];
  const faces = [], byVertex = new Map();
  for (let f = 0; f < idx.length; f += 3) {
    for (let j = 0; j < 3; j++) pos.getElement(idx[f + j], p[j]);
    const n = faceNormal(p[0], p[1], p[2]);
    faces.push({ n, u: unit(n), corners: p.map(v => [...v]), uvs: uv ? [0, 1, 2].map(j => [...uv.getElement(idx[f + j], t)]) : null });
    for (let j = 0; j < 3; j++) { const key = p[j].map(v => v.toFixed(5)).join(','); byVertex.set(key, [...(byVertex.get(key) ?? []), faces.length - 1]); }
  }
  const outPos = new Float32Array(faces.length * 9), outNrm = new Float32Array(faces.length * 9), outUv = uv ? new Float32Array(faces.length * 6) : null;
  faces.forEach((f, i) => f.corners.forEach((c, j) => {
    const sum = [0, 0, 0];
    for (const o of byVertex.get(c.map(v => v.toFixed(5)).join(','))) {
      const g = faces[o];
      if (g.u[0] * f.u[0] + g.u[1] * f.u[1] + g.u[2] * f.u[2] >= CREASE) for (let a = 0; a < 3; a++) sum[a] += g.n[a];
    }
    outPos.set(c, i * 9 + j * 3); outNrm.set(unit(sum), i * 9 + j * 3);
    if (uv) outUv.set(f.uvs[j], i * 6 + j * 2);
  }));
  const d = prim.getAttribute('POSITION');
  prim.setAttribute('POSITION', d.clone().setArray(outPos));
  prim.setAttribute('NORMAL', d.clone().setArray(outNrm));
  if (uv) prim.setAttribute('TEXCOORD_0', uv.clone().setType('VEC2').setArray(outUv));
  prim.setIndices(prim.getIndices().clone().setArray(new Uint32Array(faces.length * 3).map((_, i) => i)));
}
