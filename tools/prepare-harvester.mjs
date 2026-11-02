// prepare-harvester.mjs — builds assets/harvester.glb from the Sketchfab "Harvester Near Completion" (webbsketches, CC BY 4.0,
// https://sketchfab.com/3d-models/harvester-near-completion-cc4bf1104f2840ddad4b3aaa68fc3f74). In the game: the Rhy Harvester,
// a combine harvester with a wide grain header and a turning reel, paintable, no badge.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-harvester.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-harvester.mjs <original.glb> <out.glb>
// The original is 17 MB, about 120k triangles, scaled into a 2-unit box, the front towards +z, its right side on -x. Its nodes are
// all called "defaultMaterial" and its ten materials ("1001" .. "1010") carry flat-colour textures, so the parts go by material and
// shape: green is the paint (the textures go, and with them a small emblem on the header), black the tyres and the grain tank's
// lid, the yellow rims turn grey, the cab's flat lamp strips light up. Each wheel part holds both wheels of its axle: cut at the
// centre plane. The reel (the six bars and the core, across the header) is its own node on its axis, local +x across the machine,
// so the game turns it. Simplified to the triangle budget; normals rebuilt, smooth below a crease angle.
//
// Output contract (tools/prepare-hatchback.mjs's, plus the reel):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin between the axles, no node transform left except the wheels' and the reel's
//   node "harvester"                       the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//     node "reel"                          translation = a point on the reel axis, rotation = local +x along it (across, to +z)
//   materials: one per role in ROLES, all double-sided as in the original; Paint { extras: { paint: true } } (white, the swatch is the
//   colour), Glass { extras: { glass: true } }, LampHead { extras: { lamp: 'head' } }; extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, joinPrimitives, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const FRONT_TYRE_D = 1.8;   // a combine's big front tyre; scales the model (11.6 m long with the unloading auger, a 9.8 m header)
const TARGET_TRIS = { min: 30000, max: 38000, aim: 34000 }, MAX_TRIES = 6;
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
// by original material; the shape decides within one (see roleOf)
const GREEN = new Set(['1001', '1002', '1004', '1005', '1007']), TYRE = new Set(['1003', '1008']);
// colours are linear factors; nothing fully metallic, so the machine still reads where the style has no sky map
const ROLES = {
  Paint: { base: [1, 1, 1, 1], metal: 0.2, rough: 0.45, extras: { paint: true } },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Black: { base: [0.015, 0.015, 0.015, 1], metal: 0.1, rough: 0.7 },
  Rim: { base: [0.35, 0.35, 0.35, 1], metal: 0.4, rough: 0.4 },
  Steel: { base: [0.5, 0.5, 0.52, 1], metal: 0.5, rough: 0.35 },
  Reel: { base: [0.03, 0.03, 0.03, 1], metal: 0.2, rough: 0.6 },
  Glass: { base: [0.05, 0.07, 0.09, 0.4], metal: 0, rough: 0.05, alpha: true, extras: { glass: true } },
  // the compact's head lamp colour (carMats.lampHead) as linear factors, as in prepare-hatchback.mjs: the work lamps on the cab
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-harvester.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh; positions only (normals are rebuilt in 6.); every part gets a role by its material and shape
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
const parts = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  const src = p.getMaterial()?.getName() ?? '';
  for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  for (const t of p.listTargets()) p.removeTarget(t);
  if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
  parts.push({ prim: p, src, ...roleOf(src, boundsOf([p])) });
}
// a wheel part: low (below the axles), narrower than the machine and short, of a tyre or rim material; the reel: dark and right across the header
function roleOf(src, b) {
  const size = [0, 1, 2].map(i => b.max[i] - b.min[i]);
  const wheel = (TYRE.has(src) || src === '1010') && b.min[1] < -0.3 && size[0] < 0.6 && size[2] < 0.35;
  if (wheel) return { role: src === '1010' ? 'Rim' : 'Rubber', axle: b.min[2] + size[2] / 2 > 0 ? 'F' : 'R' };
  if (src === '1006') return { role: size[0] > 1.5 ? 'Reel' : 'Black', reel: size[0] > 1.5 };
  if (src === '1009') return { role: size[1] < 0.03 ? 'LampHead' : 'Glass' };
  if (src === '1005' && size[1] < 0.04 && size[0] > 1.5) return { role: 'Steel' };   // the cutter bar's knife
  if (GREEN.has(src)) return { role: 'Paint' };
  if (TYRE.has(src)) return { role: 'Black' };
  if (src === '1010') return { role: 'Rim' };
  throw new Error(`prepare-harvester: material "${src}" has no role`);
}
const count = (f) => parts.filter(f).length;
if (count(p => p.axle === 'F') !== 3 || count(p => p.axle === 'R') !== 3) throw new Error(`prepare-harvester: expected 3 wheel parts per axle, got ${count(p => p.axle === 'F')} / ${count(p => p.axle === 'R')}`);
if (count(p => p.reel) !== 7) throw new Error(`prepare-harvester: expected the reel's 7 parts, got ${count(p => p.reel)}`);

// 2. the frame from the front tyres: the original faces +z with its right side on -x: new = k * (z - cz, y - y0, -(x - cx))
const tyres = (axle) => boundsOf(parts.filter(p => p.axle === axle && p.role === 'Rubber').map(p => p.prim));
const front = tyres('F'), rear = tyres('R'), k = FRONT_TYRE_D / (front.max[1] - front.min[1]), y0 = Math.min(front.min[1], rear.min[1]);
const cz = (centreOf(front)[2] + centreOf(rear)[2]) / 2, cx = (front.min[0] + front.max[0]) / 2;
for (const { prim } of parts) mapAttribute(prim, 'POSITION', ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)]);

// 3. each axle's parts cut at the centre plane into its left (-z) and right wheel
const pieces = [];
for (const p of parts.filter(p => p.axle)) {
  const right = cutOut(p.prim, c => c[2] > 0);
  pieces.push({ ...p, quad: `${p.axle}L` }, { ...p, prim: right, quad: `${p.axle}R` });
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
for (const t of root.listTextures()) t.dispose();
for (const { prim, role } of [...parts, ...pieces]) prim.setMaterial(mats[role]);

// 5. scene: body, four wheels (vertices centred on the tyre centre), the reel on its axis
const scene = doc.createScene('harvester');
const top = doc.createNode('harvester'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
for (const { prim, axle, reel } of parts) if (!axle && !reel) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const quad of ['FL', 'FR', 'RL', 'RR']) {
  const mine = pieces.filter(p => p.quad === quad), tb = boundsOf(mine.filter(p => p.role === 'Rubber').map(p => p.prim)), c = centreOf(tb);
  for (const { prim } of mine) mapAttribute(prim, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(`wheel_${quad}`); mine.forEach(p => mesh.addPrimitive(p.prim));
  top.addChild(doc.createNode(`wheel_${quad}`).setTranslation(c).setMesh(mesh));
  console.log(`wheel_${quad}`, 'centre', c.map(v => +v.toFixed(3)), 'r', +((tb.max[1] - tb.min[1]) / 2).toFixed(3));
}
// the reel turns about the line through the middle of its parts, across the machine (+z); local frame: x = +z, y = up, z = -x
const reelParts = parts.filter(p => p.reel), at = centreOf(boundsOf(reelParts.map(p => p.prim))), toLocal = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
for (const { prim } of reelParts) mapAttribute(prim, 'POSITION', (p) => { const d = [0, 1, 2].map(i => p[i] - at[i]); return toLocal.map(r => r[0] * d[0] + r[1] * d[1] + r[2] * d[2]); });
const reelMesh = doc.createMesh('reel'); reelParts.forEach(p => reelMesh.addPrimitive(p.prim));
top.addChild(doc.createNode('reel').setTranslation(at).setRotation(quatFromRows(toLocal)).setMesh(reelMesh));
console.log('reel at', at.map(v => +v.toFixed(3)));

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
out.getRoot().getAsset().extras = { title: 'Harvester Near Completion (modified)', author: 'webbsketches (https://sketchfab.com/webbsketches)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/harvester-near-completion-cc4bf1104f2840ddad4b3aaa68fc3f74' };
await io.write(output, out);
const outRoot = out.getRoot(), body = outRoot.listMeshes().find(m => m.getName() === 'body').listPrimitives(), r3 = (v) => v.map(x => +x.toFixed(3));
const lamps = boundsOf(body.filter(p => p.getMaterial().getName() === 'LampHead'));
console.log('wrote', output, 'triangles', docTris(out), 'materials', outRoot.listMaterials().length, 'body bounds', r3(boundsOf(body).min), r3(boundsOf(body).max));
console.log('lamp bounds', r3(lamps.min), r3(lamps.max));

// ---------- the reel's frame ----------
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

// moves the faces whose centre passes the test out of the primitive, into a new one that it returns
function cutOut(prim, test) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), keep = [], cut = [], v = [];
  for (let t = 0; t < idx.length; t += 3) {
    const c = [0, 0, 0];
    for (let j = 0; j < 3; j++) { pos.getElement(idx[t + j], v); for (let a = 0; a < 3; a++) c[a] += v[a] / 3; }
    (test(c) ? cut : keep).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (!cut.length || !keep.length) throw new Error(`prepare-harvester: the split left ${keep.length / 3} / ${cut.length / 3} faces; expected wheels on both sides`);
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
  throw new Error(`prepare-harvester: ${docTris(result)} triangles after ${MAX_TRIES} tries`);
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
