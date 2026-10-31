// prepare-hyper.mjs — builds prototype/assets/hyper.glb from the Sketchfab "Free Bugatti Chiron" (ALIEEEN, CC BY 4.0,
// https://sketchfab.com/3d-models/free-bugatti-chiron-374890e62c5a44e9a739ca638b6e0a18). In the game: the Rhy Hyper, no badge.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-hyper.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-hyper.mjs <original.glb> <out.glb>
// The original is 6 MB, about 97k triangles in named parts (body, doors, interior, lamps, four wheels with brakes), 38 materials,
// some textured. The textures go (plain role materials instead), the grille badge and the tail badge are dropped, the two-tone body keeps its dark
// side as a fixed colour (only the bright part takes the paint swatch), and the whole car is simplified to the triangle budget.
// Normals are rebuilt, smooth below a crease angle.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what prototype/index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.711 m, no node transform left except the wheels'
//   node "hyper"                           the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//   materials: one per role in ROLES; Paint { extras: { paint: true } } (white, the swatch is the colour), Glass { extras: { glass: true } },
//   LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, joinPrimitives, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const WHEELBASE_M = 2.711;   // the Chiron's 2711 mm
const TARGET_TRIS = { min: 28000, max: 32000, aim: 30000 }, MAX_TRIES = 6;
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
// the badge in the grille is the one textured logo; it goes with its material
const DROP_MATERIALS = new Set(['Logo']);
// the badge on the tail is geometry in the engine-cover chrome: its faces sit behind x = -1.43 (original units), the cover ahead of it
const TAIL_BADGE = { node: 'Engine_Silver_0', behindX: -1.43 };
// original material name -> role; an unmapped name throws, so a different export cannot slip through
const MATERIAL_ROLES = {
  Body: 'Paint', Darker_Parts: 'DarkBlue', Carbon: 'Carbon', Silver: 'Chrome', Steel: 'Chrome', Mirror: 'Chrome', exhaust: 'Chrome',
  'Vents-texture': 'Black', Plastic: 'Black', 'Headlight-1': 'Black', Caliper: 'Caliper',
  Interior_1: 'InteriorBlue', Interior_1_Darker: 'Interior', Interior_2: 'Interior', Interior_3: 'Interior', Buttons: 'Interior',
  'Interior-light': 'Interior', Speedo: 'Interior', seats: 'Interior',
  Windshield: 'Glass', Glass: 'Glass', Headlight_glass: 'Glass',
  Headlights: 'Chrome', 'Headlights-light': 'LampHead', 'Headlights-Lights': 'LampHead',
  Turning_lights_left: 'Amber', Turning_lights_right: 'Amber', 'Tail-light-glass-turning': 'Amber',
  'Tail-light_holder': 'Chrome', 'Tail-light-insides': 'LampTail', 'Tail-light-glass': 'LampTail', 'Tail-light-LIGHT': 'LampTail',
  'Brake-lights': 'LampTail', 'Reverse-light.001': 'LampTail',
  Tire: 'Rubber', Rims: 'Chrome', Brake_rotor: 'Steel',
};
const WHEEL_MATERIALS = new Set(['Tire', 'Rims', 'Brake_rotor']);
// colours are linear factors; nothing fully metallic, so the car still reads where the style has no sky map
const ROLES = {
  Paint: { base: [1, 1, 1, 1], metal: 0.3, rough: 0.3, extras: { paint: true } },
  DarkBlue: { base: [0.004, 0.012, 0.045, 1], metal: 0.3, rough: 0.3 },   // the dark side of the two-tone body, never repainted
  Carbon: { base: [0.015, 0.015, 0.018, 1], metal: 0.1, rough: 0.4 },
  Black: { base: [0.012, 0.012, 0.012, 1], metal: 0, rough: 0.8 },
  Interior: { base: [0.03, 0.03, 0.03, 1], metal: 0, rough: 0.85 },
  InteriorBlue: { base: [0.03, 0.12, 0.45, 1], metal: 0, rough: 0.7 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Steel: { base: [0.25, 0.25, 0.26, 1], metal: 0.4, rough: 0.5 },
  Caliper: { base: [0.02, 0.06, 0.35, 1], metal: 0.2, rough: 0.4 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Glass: { base: [0.05, 0.07, 0.09, 0.2], metal: 0, rough: 0.05, alpha: true, doubleSided: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-hyper.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptSimplifier.ready;
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
  const src = p.getMaterial()?.getName() ?? '';
  if (DROP_MATERIALS.has(src)) continue;
  const role = MATERIAL_ROLES[src];
  if (!role) throw new Error(`prepare-hyper: material "${src}" (node ${n.getName()}) has no role in MATERIAL_ROLES`);
  for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  all.push({ node: n.getName(), prim: p, role, wheel: WHEEL_MATERIALS.has(src) });
}

const badge = all.find(a => a.node === TAIL_BADGE.node);
cutOut(badge.prim, c => c[0] < TAIL_BADGE.behindX).dispose();

// 2. the frame from the tyres; the original already faces +x with its left side on -z: new = k * (x - cx, y - y0, z - cz)
const tyres = all.filter(a => a.wheel && a.role === 'Rubber').map(a => centreOf(boundsOf([a.prim])));
if (tyres.length !== 4) throw new Error(`prepare-hyper: expected 4 tyres, found ${tyres.length}`);
const tx = tyres.map(c => c[0]), tz = tyres.map(c => c[2]);
const k = WHEELBASE_M / (Math.max(...tx) - Math.min(...tx));
const cx = (Math.max(...tx) + Math.min(...tx)) / 2, cz = (Math.max(...tz) + Math.min(...tz)) / 2, y0 = boundsOf(all.map(a => a.prim)).min[1];
for (const { prim } of all) mapAttribute(prim, 'POSITION', ([x, y, z]) => [k * (x - cx), k * (y - y0), k * (z - cz)]);

// 3. materials by role
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
const scene = doc.createScene('hyper');
const top = doc.createNode('hyper'); scene.addChild(top);
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

// 5. simplify to the triangle budget, then normals: smooth across edges flatter than the crease angle
const out = await simplifyTo(doc);
for (const m of out.getRoot().listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await out.transform(weld(), prune());
for (const e of out.getRoot().listExtensionsUsed()) e.dispose();
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
out.getRoot().getAsset().extras = { title: 'Free Bugatti Chiron (modified)', author: 'ALIEEEN (https://sketchfab.com/ALIEEEN)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/free-bugatti-chiron-374890e62c5a44e9a739ca638b6e0a18' };
await io.write(output, out);
const bodyB = boundsOf(out.getRoot().listMeshes().find(m => m.getName() === 'body').listPrimitives());
console.log('wrote', output, 'triangles', docTris(out), 'materials', out.getRoot().listMaterials().length, 'body bounds', bodyB.min.map(v => +v.toFixed(3)), bodyB.max.map(v => +v.toFixed(3)));

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
  if (!cut.length || !keep.length) throw new Error(`prepare-hyper: the split left ${keep.length / 3} / ${cut.length / 3} faces; expected the badge and the engine cover`);
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
  throw new Error(`prepare-hyper: ${docTris(result)} triangles after ${MAX_TRIES} tries`);
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
