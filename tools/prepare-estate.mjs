// prepare-estate.mjs — builds assets/estate.glb from the Sketchfab "2009 Skoda Octavia Combi" (tonielpro520, CC BY 4.0,
// https://sketchfab.com/3d-models/2009-skoda-octavia-combi-9b9f212d14b34d44bebf9fbb22afa54a). In the game: the Rhy Estate (de: Rhy Kombi),
// a family estate from about 2011, paintable, no badge.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/oprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-estate.mjs <scratch>/oprep/ && cd <scratch>/oprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-estate.mjs <original.glb> <out.glb>
// The original is 17 MB, about 484k triangles in 98 parts, the front towards +z, its left side on +x, in inch-ish units; 18 plain
// materials, the only texture is the badges'. The badges go (grille, tailgate, the four wheel centres). Parts go to roles by their
// material, a few by name (the head lamp covers, the tyres). Simplified to the triangle budget; normals rebuilt, smooth below a
// crease angle.
//
// Output contract (tools/prepare-hatchback.mjs's):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.578 m, no node transform left except the wheels'
//   node "estate"                          the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//   materials: one per role in ROLES, all double-sided as in the original; Paint { extras: { paint: true } } (white, the swatch is
//   the colour), Glass { extras: { glass: true } }, LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, joinPrimitives, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const WHEELBASE_M = 2.578;   // the second-generation Octavia's 2578 mm; gives the estate its real 4.57 m length
const TARGET_TRIS = { min: 24000, max: 30000, aim: 27000 }, MAX_TRIES = 6;
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
// original material name -> role; an unmapped name throws, so a different export cannot slip through
const MATERIAL_ROLES = {
  body: 'Paint', black: 'Black', chrome: 'Chrome', silver: 'Chrome', octavia: 'Chrome', lamp_reflect: 'Chrome',
  d_glass: 'Glass', glass: 'Glass', lamp_glass: 'Glass', lamp_glass_bump: 'Glass',
  dash: 'Interior', door: 'Interior', stwheel: 'Interior', material: 'Black', lamp_plastic: 'Black',
  orange: 'Amber', r_glass: 'LampTail',
};
const DROP_MATERIALS = new Set(['logo']);   // the maker's badges
const NODE_ROLES = { Object_116: 'LampHead', Object_119: 'LampHead' };   // the head lamp covers: a lamp, not glass, so they light up with L
const TYRES = new Set(['Object_170', 'Object_188', 'Object_203', 'Object_224']);   // 'material' as everything dark; these are the tyres
// colours are linear factors; nothing fully metallic, so the car still reads where the style has no sky map
const ROLES = {
  Paint: { base: [1, 1, 1, 1], metal: 0.25, rough: 0.35, extras: { paint: true } },
  Black: { base: [0.012, 0.012, 0.012, 1], metal: 0, rough: 0.8 },
  Interior: { base: [0.03, 0.03, 0.03, 1], metal: 0, rough: 0.85 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Glass: { base: [0.05, 0.07, 0.09, 0.3], metal: 0, rough: 0.05, alpha: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-estate.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh (mirrored ones turned right side out again); positions only
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
  if (determinant(n.getWorldMatrix()) < 0) n.getMesh().listPrimitives().forEach(reverseWinding);
}
const all = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  const name = n.getName(), src = p.getMaterial()?.getName() ?? '';
  if (DROP_MATERIALS.has(src)) continue;
  const role = TYRES.has(name) ? 'Rubber' : NODE_ROLES[name] ?? MATERIAL_ROLES[src];
  if (!role) throw new Error(`prepare-estate: part ${name} (material "${src}") has no role`);
  for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  all.push({ name, prim: p, role });
}

// 2. the frame from the tyres: new = k * (z - cz, y - y0, -(x - cx)), a rotation about y
const tyres = all.filter(a => a.role === 'Rubber');
if (tyres.length !== 4) throw new Error(`prepare-estate: ${tyres.length} tyres, want 4`);
const tyreCentres = tyres.map(t => centreOf(boundsOf([t.prim]))), tb = boundsOf(tyres.map(t => t.prim));
const zs = tyreCentres.map(c => c[2]), front = Math.max(...zs), rear = Math.min(...zs);
const k = WHEELBASE_M / (front - rear), y0 = tb.min[1], cz = (front + rear) / 2, cx = (tb.min[0] + tb.max[0]) / 2;
for (const { prim } of all) mapAttribute(prim, 'POSITION', ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)]);

// 3. which parts turn: everything that sits inside a tyre's reach (rim, brake disc, the hub parts), by the nearest tyre
const wheelR = (tb.max[1] - tb.min[1]) * k / 2, centres = tyres.map(t => centreOf(boundsOf([t.prim])));
for (const a of all) {
  const b = boundsOf([a.prim]), c = centreOf(b), near = nearest(centres, c);
  a.wheel = a.role === 'Rubber' || (b.max[1] < 2 * wheelR + 0.02 && Math.hypot(c[0] - near[0], c[1] - near[1]) < wheelR && Math.abs(c[2] - near[2]) < 0.2) ? near : null;   // decided before any wheel is moved
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
for (const { prim, role } of all) prim.setMaterial(mats[role]);

// 5. scene: body and four wheels, symmetric (the axle's mean x, the mean half track)
const scene = doc.createScene('estate');
const top = doc.createNode('estate'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
for (const { prim, wheel } of all) if (!wheel) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
const halfTrack = centres.reduce((t, c) => t + Math.abs(c[2]), 0) / 4, axleX = (s) => centres.filter(c => s * c[0] > 0).reduce((t, c) => t + c[0], 0) / 2;
for (const c of centres) {
  const at = [axleX(Math.sign(c[0])), c[1], Math.sign(c[2]) * halfTrack], name = `wheel_${c[0] > 0 ? 'F' : 'R'}${c[2] < 0 ? 'L' : 'R'}`;
  const mine = all.filter(a => a.wheel === c);
  for (const { prim } of mine) mapAttribute(prim, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(name); mine.forEach(a => mesh.addPrimitive(a.prim));
  top.addChild(doc.createNode(name).setTranslation(at).setMesh(mesh));
  console.log(name, 'centre', r3(at), 'r', +wheelR.toFixed(3), 'parts', mine.map(a => a.name).join(' '));
}
const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());

// 6. simplify to the triangle budget, then normals: smooth across edges flatter than the crease angle
const out = await simplifyTo(doc);
for (const m of out.getRoot().listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await out.transform(weld(), prune());
for (const e of out.getRoot().listExtensionsUsed()) e.dispose();
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
out.getRoot().getAsset().extras = { title: '2009 Skoda Octavia Combi (modified)', author: 'tonielpro520 (https://sketchfab.com/tonielpro520)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/2009-skoda-octavia-combi-9b9f212d14b34d44bebf9fbb22afa54a' };
await io.write(output, out);
const body = out.getRoot().listMeshes().find(m => m.getName() === 'body').listPrimitives(), byMat = (n) => boundsOf(body.filter(p => p.getMaterial().getName() === n));
console.log('wrote', output, 'triangles', docTris(out), 'materials', out.getRoot().listMaterials().length, 'body bounds', r3(boundsOf(body).min), r3(boundsOf(body).max));
for (const n of ['LampHead', 'LampTail', 'Amber']) console.log(n, 'bounds', r3(byMat(n).min), r3(byMat(n).max));

// ---------- helpers ----------
function r3(v) { return v.map(x => +x.toFixed(3)); }
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function nearest(list, p) { return list.reduce((a, b) => Math.hypot(...a.map((v, i) => v - p[i])) <= Math.hypot(...b.map((v, i) => v - p[i])) ? a : b); }
function primTris(p) { return (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
function docTris(d) { return d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + primTris(p), 0); }
function determinant(m) { return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]); }

// swaps two corners of every face (on a copy of the indices, which parts may share), so the front side faces out again
function reverseWinding(prim) {
  const idx = Array.from(prim.getIndices().getArray());
  for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  prim.setIndices(prim.getIndices().clone().setArray(new Uint32Array(idx)));
}

// indexed vertices only: parts of the original may share one vertex buffer
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
  throw new Error(`prepare-estate: ${docTris(result)} triangles after ${MAX_TRIES} tries`);
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
