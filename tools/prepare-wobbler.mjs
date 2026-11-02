// prepare-wobbler.mjs — builds assets/wobbler.glb from the Sketchfab "Reliant-regal-supervan" (3DDomino, CC BY 4.0,
// https://sketchfab.com/3d-models/reliant-regal-supervan-6c868a7d53d04f04a6319ec016a05c10). In the game: the Rhy Wobbler,
// a British three-wheeler van, paintable, no badge.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-wobbler.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-wobbler.mjs <original.glb> <out.glb>
// The original is 8.6 MB, about 230k triangles (most of them in the three wheels and the door handles), 6 m long, the front
// towards -x, untextured: the roles go by material. The nose badge is dropped. The one front wheel is cut in two halves at its
// centre plane, wheel_FL and wheel_FR, both turning about the same centre: the game's wheel contract has four wheel nodes, and two
// halves on one pivot steer and spin as one wheel. Simplified to the triangle budget; normals rebuilt, smooth below a crease angle.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.17 m, no node transform left except the wheels'
//   node "wobbler"                         the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//                                          (FL and FR: the two halves of the one front wheel, both at its centre)
//   materials: one per role in ROLES, all double-sided; Paint { extras: { paint: true } } (white, the swatch is the colour), Glass { extras: { glass: true } },
//   LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, joinPrimitives, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const WHEELBASE_M = 2.17;   // the Robin's 85 in; gives the van its real 3.3 m length
const TARGET_TRIS = { min: 22000, max: 28000, aim: 25000 }, MAX_TRIES = 6;
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
const MATERIAL_ROLES = {
  'Paint_-_gloss_cadmium_yellow_1': 'Paint',
  Steel_1: 'Chrome', Rubber_1: 'Rubber',
  'Hard_shiny_plastic_-_tangerine__1': 'Amber',                    // the front indicators
  material1772424: 'LampTail', material19310245: 'LampTail',        // the tail lamp's red parts
  material25523834: 'Amber', material229229229: 'Lens',            // its indicator and the reversing lens
  Glass_Basic_Black: 'Glass', Glass_Ridges_Grey: 'LampHead',        // the windows, the head lamp lenses
};
const isWheelPart = (name) => name.startsWith('guma realinat');
// the badge on the nose: a thin painted disc in the middle of the front panel, above the bumper (original metres); a seam strip
// down the panel's centre line is about as thin, but runs from the bumper up
const isBadge = (b) => b.max[0] < -2.75 && b.max[0] - b.min[0] < 0.05 && Math.abs((b.min[2] + b.max[2]) / 2) < 0.1 && b.max[2] - b.min[2] < 0.25 && b.min[1] > 0.9;
// colours are linear factors; nothing fully metallic, so the car still reads where the style has no sky map
const ROLES = {
  Paint: { base: [1, 1, 1, 1], metal: 0.3, rough: 0.35, extras: { paint: true } },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Lens: { base: [0.8, 0.8, 0.8, 1], metal: 0, rough: 0.2 },
  // the windows stay dark: there is no cabin behind them
  Glass: { base: [0.03, 0.04, 0.05, 0.8], metal: 0, rough: 0.05, alpha: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-wobbler.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh (meshes used twice are cloned first); keep positions only (normals are rebuilt in 6.)
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
const all = [];
let badges = 0;
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  const name = n.getName(), src = p.getMaterial()?.getName() ?? '', role = MATERIAL_ROLES[src];
  if (!role) throw new Error(`prepare-wobbler: part ${name} (material "${src}") has no role`);
  for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  for (const t of p.listTargets()) p.removeTarget(t);
  if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
  if (role === 'Paint' && isBadge(boundsOf([p]))) { badges++; continue; }
  all.push({ name, prim: p, role, wheel: isWheelPart(name) });
}
if (badges !== 1) throw new Error(`prepare-wobbler: expected one nose badge, found ${badges}`);

// 2. the frame from the tyres: the three biggest rubber parts are the tread rings; the front one sits alone near x min.
//    The original faces -x: new = k * (-(x - cx), y - y0, -(z - cz)), a half turn about y
const treads = all.filter(a => a.wheel && a.role === 'Rubber').map(a => ({ a, b: boundsOf([a.prim]) })).filter(t => primTris(t.a.prim) > 20000);
if (treads.length !== 3) throw new Error(`prepare-wobbler: expected 3 tread rings, found ${treads.length}`);
const centres = treads.map(t => centreOf(t.b)).sort((p, q) => p[0] - q[0]);
const [frontC, ...rearC] = centres, rearX = (rearC[0][0] + rearC[1][0]) / 2;
const y0 = Math.min(...treads.map(t => t.b.min[1])), cx = (frontC[0] + rearX) / 2, cz = frontC[2];
const k = WHEELBASE_M / (rearX - frontC[0]);
for (const { prim } of all) mapAttribute(prim, 'POSITION', ([x, y, z]) => [-k * (x - cx), k * (y - y0), -k * (z - cz)]);
const toNew = ([x, y, z]) => [-k * (x - cx), k * (y - y0), -k * (z - cz)];
const wheelCentre = { F: toNew(frontC), RL: null, RR: null };
for (const c of rearC.map(toNew)) wheelCentre[c[2] < 0 ? 'RL' : 'RR'] = c;

// 3. the wheel parts: each goes to the nearest tyre; the front wheel's parts are cut at its centre plane into a left and a right half
const pieces = [];
for (const a of all.filter(a => a.wheel)) {
  const b = boundsOf([a.prim]), c = centreOf(b), plane = wheelCentre.F[2];
  if (c[0] > 0 && b.max[2] <= plane) pieces.push({ ...a, quad: 'FL', centre: wheelCentre.F });        // a sidewall: one side only
  else if (c[0] > 0 && b.min[2] >= plane) pieces.push({ ...a, quad: 'FR', centre: wheelCentre.F });
  else if (c[0] > 0) {
    const right = cutOut(a.prim, f => f[2] > plane);
    pieces.push({ ...a, quad: 'FL', centre: wheelCentre.F }, { ...a, prim: right, quad: 'FR', centre: wheelCentre.F });
  } else {
    const quad = c[2] < 0 ? 'RL' : 'RR';
    pieces.push({ ...a, quad, centre: wheelCentre[quad] });
  }
}
const parts = [...all.filter(a => !a.wheel), ...pieces];

// 4. materials by role
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough);
  if (r.alpha) m.setAlphaMode('BLEND');
  m.setDoubleSided(true);   // as in the original: some panels (the front wings) face inwards
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
for (const { prim, role } of parts) prim.setMaterial(mats[role]);

// 5. scene: body + four wheel nodes (vertices centred on the tyre's centre)
const scene = doc.createScene('wobbler');
const top = doc.createNode('wobbler'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
for (const { prim, quad } of parts) if (!quad) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const quad of ['FL', 'FR', 'RL', 'RR']) {
  const mine = pieces.filter(p => p.quad === quad), c = mine[0].centre;
  for (const { prim } of mine) mapAttribute(prim, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(`wheel_${quad}`); mine.forEach(p => mesh.addPrimitive(p.prim));
  top.addChild(doc.createNode(`wheel_${quad}`).setTranslation(c).setMesh(mesh));
  console.log(`wheel_${quad}`, 'centre', c.map(v => +v.toFixed(3)));
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
out.getRoot().getAsset().extras = { title: 'Reliant-regal-supervan (modified)', author: '3DDomino (https://sketchfab.com/3DDomino)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/reliant-regal-supervan-6c868a7d53d04f04a6319ec016a05c10' };
await io.write(output, out);
const outRoot = out.getRoot(), bodyB = boundsOf(outRoot.listMeshes().find(m => m.getName() === 'body').listPrimitives());
const lamp = (role) => { const p = outRoot.listMeshes().find(m => m.getName() === 'body').listPrimitives().filter(q => q.getMaterial().getName() === role); return boundsOf(p); };
const r = (v) => v.map(x => +x.toFixed(3));
console.log('wrote', output, 'triangles', docTris(out), 'materials', outRoot.listMaterials().length, 'body bounds', r(bodyB.min), r(bodyB.max));
console.log('amber bounds', r(lamp('Amber').min), r(lamp('Amber').max), 'tyre r', +(k * (treads[0].b.max[1] - treads[0].b.min[1]) / 2).toFixed(3));

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
  if (!cut.length || !keep.length) throw new Error(`prepare-wobbler: the split left ${keep.length / 3} / ${cut.length / 3} faces; expected the front wheel on both sides`);
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
  throw new Error(`prepare-wobbler: ${docTris(result)} triangles after ${MAX_TRIES} tries`);
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
