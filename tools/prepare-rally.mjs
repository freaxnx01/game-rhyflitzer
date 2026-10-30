// prepare-rally.mjs — builds prototype/assets/rally.glb from the 3D Warehouse "2013 Hyundai - i20 WRC" by D3NK
// (https://3dwarehouse.sketchup.com/model/4082138f-6179-4762-ba76-d2910a315f27, 3D Warehouse General Model License). Issue #199 / see the PR.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/rallyprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   cp tools/prepare-rally.mjs <scratch>/rallyprep/ && cd <scratch>/rallyprep
//   node prepare-rally.mjs <original.glb> <out.glb> [--livery <png>]   (--livery also writes the livery texture for a look)
// The original is 6.3 MB, 55k triangles, plain SketchUp colours (white body) and five grille textures.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what prototype/index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.57 m, no node transform left except the wheels'
//   node "rally"                           the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the wheel centre, vertices centred on it
//   materials: one per role in ROLES; Livery carries the one texture (our own rally livery, projected per face onto the body panels);
//   Glass { extras: { glass: true } }, LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
// Removed: the two Hyundai emblems (the only primitives without a material); the grille textures (plain black instead).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, joinPrimitives, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const WHEELBASE_M = 2.57;   // the i20 WRC's; the model then comes out 4.0 m long and 1.88 m wide without the mirrors, as the real car
const TARGET_TRIS = { min: 24000, max: 28500, aim: 26000 };
const MAX_TRIES = 6;
// original material name -> role; an unmapped name throws, so a different export cannot slip through
const MATERIAL_ROLES = {
  body: 'Livery', black1: 'Black', '[Color B06]1': 'Cage', '[Color B05]': 'LampTail', '[Color B02]': 'LampTail', '[Color B02]1': 'LampTail',
  '[Color B01]': 'Amber', '[Color B07]1': 'Amber', '[Color B06]2': 'Chrome', '[Color B07]': 'Chrome', mirror: 'Chrome', window1: 'Glass', 'f light0': 'Glass',
  'f light1': 'LampHead', wheel: 'Rim', '[Color B07]3': 'Hub', tires: 'Tyre', '[Color C04]': 'Brake', '[Color C04]1': 'Black', '[Color B07]2': 'Trim', '*1': 'Black',
};
// colours are linear factors; nothing fully metallic, so the car still reads where the style has no sky map
const ROLES = {
  Livery: { base: [1, 1, 1, 1], metal: 0.1, rough: 0.35 },
  Black: { base: [0.012, 0.012, 0.013, 1], metal: 0, rough: 0.7 },
  Trim: { base: [0.03, 0.03, 0.032, 1], metal: 0, rough: 0.55 },
  Cage: { base: [0.4, 0.4, 0.4, 1], metal: 0.3, rough: 0.5 },
  Chrome: { base: [0.6, 0.6, 0.62, 1], metal: 0.5, rough: 0.25 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Glass: { base: [0.02, 0.025, 0.03, 0.55], metal: 0, rough: 0.05, alpha: true, doubleSided: true, extras: { glass: true } },
  Rim: { base: [0.75, 0.76, 0.77, 1], metal: 0.3, rough: 0.4 },
  Hub: { base: [0.06, 0.06, 0.06, 1], metal: 0.2, rough: 0.5 },
  Tyre: { base: [0.02, 0.02, 0.021, 1], metal: 0, rough: 0.9 },
  Brake: { base: [0.08, 0.08, 0.08, 1], metal: 0.4, rough: 0.5 },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};
const WHEEL_ROLES = ['Rim', 'Hub', 'Tyre', 'Brake'];
const WHEEL_PATH = /#89(_1)?\/[^/]*#87(_1)?\//;   // the four wheel assemblies (rim, tyre, disc, calliper); wheel parts elsewhere do not exist

// ---------- the livery: our own design in the Hyundai motorsport colours, no marks; start number 8 (it reads the same mirrored) ----------
const LIVERY = { light: '#a9c8e6', navy: '#0b2a5c', red: '#d6202a', white: '#f4f6f8', px: 2048, mPerPx: 4.3 / 2048 };
// atlas regions (pixels) and the car-frame axes each one projects: side (x, y), top (x, z), front and back (z, y), bottom (base colour)
const REGIONS = {
  side: { x: 0, y: 0, w: 2048, h: 768, u: 0, v: 1, uMin: -2.15, vMin: 0 },
  top: { x: 0, y: 768, w: 2048, h: 960, u: 0, v: 2, uMin: -2.15, vMin: -1.0 },
  front: { x: 0, y: 1728, w: 1000, h: 320, u: 2, v: 1, uMin: -1.05, vMin: 0 },
  back: { x: 1024, y: 1728, w: 1000, h: 320, u: 2, v: 1, uMin: -1.05, vMin: 0 },
};

const args = process.argv.slice(2), liveryOut = args.includes('--livery') ? args[args.indexOf('--livery') + 1] : null;
const [input, output] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--livery');
if (!input || !output) { console.error('usage: node prepare-rally.mjs <original.glb> <out.glb> [--livery <png>]'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh, tag every primitive with its role and whether it is a wheel part; drop the emblems
const meshNodes = root.listNodes().filter(n => n.getMesh());
const all = [];
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
  const path = nodePath(n);
  for (const p of n.getMesh().listPrimitives()) {
    const src = p.getMaterial()?.getName();
    if (src === undefined) { n.getMesh().removePrimitive(p); p.dispose(); continue; }   // an emblem
    const role = MATERIAL_ROLES[src];
    if (!role) throw new Error(`prepare-rally: material "${src}" (${path}) has no role in MATERIAL_ROLES`);
    const wheel = WHEEL_PATH.test(path + '/');
    if (wheel !== WHEEL_ROLES.includes(role) && role !== 'Brake') throw new Error(`prepare-rally: ${role} part at ${path} is ${wheel ? '' : 'not '}in a wheel assembly`);
    all.push({ prim: p, role, wheel });
  }
}

// 2. frame: the original's front is +z, its right -x; scale to the wheelbase, origin on the axle midpoint, wheels on y = 0
const tyres = all.filter(a => a.role === 'Tyre').map(a => centreOf(boundsOf([a.prim])));
if (tyres.length !== 4) throw new Error(`prepare-rally: expected 4 tyres, found ${tyres.length}`);
const tz = tyres.map(c => c[2]), tx = tyres.map(c => c[0]);
const k = WHEELBASE_M / (Math.max(...tz) - Math.min(...tz));
const cz = (Math.max(...tz) + Math.min(...tz)) / 2, cx = (Math.max(...tx) + Math.min(...tx)) / 2, y0 = boundsOf(all.map(a => a.prim)).min[1];
for (const { prim } of all) mapAttribute(prim, 'POSITION', ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)]);

// 3. materials by role; positions only from here (Sketchfab-style split normals and the grille UVs would stop the simplifier)
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.doubleSided) m.setDoubleSided(true);
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
for (const { prim, role } of all) {
  prim.setMaterial(mats[role]);
  for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.setAttribute(sem, null);
}

// 4. scene: body + four wheels (wheel parts sorted to their wheel by quadrant, vertices centred on the tyre's centre)
const scene = doc.createScene('rally');
const top = doc.createNode('rally'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
const wheels = { wheel_FL: [], wheel_FR: [], wheel_RL: [], wheel_RR: [] };
for (const { prim, wheel } of all) {
  if (!wheel) { bodyMesh.addPrimitive(prim); continue; }
  const c = centreOf(boundsOf([prim]));
  wheels[`wheel_${c[0] > 0 ? 'F' : 'R'}${c[2] < 0 ? 'L' : 'R'}`].push(prim);
}
top.addChild(doc.createNode('body').setMesh(bodyMesh));
const centres = {};
for (const [name, prims] of Object.entries(wheels)) {
  const tyre = prims.find(p => p.getMaterial() === mats.Tyre), b = boundsOf([tyre]), c = centreOf(b);
  for (const p of prims) mapAttribute(p, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(name); prims.forEach(p => mesh.addPrimitive(p));
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  centres[name] = c; console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3));
}
const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
for (const t of root.listTextures()) t.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());

// 5. simplify to the triangle budget, then the livery: smooth normals on the welded body, unwelded per face, UVs by the face's main axis
const out = await simplifyTo(doc);
const livery = out.getRoot().listMeshes().find(m => m.getName() === 'body').listPrimitives().find(p => p.getMaterial().getName() === 'Livery');
smoothNormals(livery); unweld(livery); projectUVs(livery);
const png = await renderLivery();
if (liveryOut) writeFileSync(liveryOut, png);
const tex = out.createTexture('livery').setImage(await sharp(png).jpeg({ quality: 88 }).toBuffer()).setMimeType('image/jpeg').setURI('rally.jpg');
livery.getMaterial().setBaseColorTexture(tex);
await out.transform(prune());
for (const e of out.getRoot().listExtensionsUsed()) e.dispose();
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
out.getRoot().getAsset().extras = { title: '2013 Hyundai - i20 WRC (modified)', author: 'D3NK (3D Warehouse)', license: '3D Warehouse General Model License', source: 'https://3dwarehouse.sketchup.com/model/4082138f-6179-4762-ba76-d2910a315f27' };
await io.write(output, out);
const bodyB = boundsOf(out.getRoot().listMeshes().find(m => m.getName() === 'body').listPrimitives());
console.log('wrote', output, 'triangles', docTris(out), 'materials', out.getRoot().listMaterials().length, 'body bounds', bodyB.min.map(v => +v.toFixed(3)), bodyB.max.map(v => +v.toFixed(3)));

// ---------- helpers ----------
function nodePath(n) { const a = []; for (let p = n; p && p.propertyType === 'Node'; p = p.listParents().find(x => x.propertyType === 'Node')) a.unshift(p.getName()); return a.join('/'); }
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function primTris(p) { return (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
function docTris(d) { return d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + primTris(p), 0); }

function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return { min, max };
}

// a rotation about y plus scale and shift (det > 0), so the winding stays right; the accessor is detached first so a shared one is mapped once
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
  throw new Error(`prepare-rally: ${docTris(result)} triangles after ${MAX_TRIES} tries`);
}

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

// area-weighted vertex normals over the welded mesh, so the unwelded panels still shade smoothly
function smoothNormals(prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), n = new Float32Array(pos.getCount() * 3), p = [[], [], []];
  for (let t = 0; t < idx.length; t += 3) {
    for (let j = 0; j < 3; j++) pos.getElement(idx[t + j], p[j]);
    const f = faceNormal(...p);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) n[idx[t + j] * 3 + i] += f[i];
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  prim.setAttribute('NORMAL', doc_accessor(prim, n, 'VEC3'));
}

// every triangle gets its own three vertices (same positions and normals), so each can carry the UVs of its own projection
function unweld(prim) {
  const idx = prim.getIndices().getArray(), out = {};
  for (const sem of ['POSITION', 'NORMAL']) {
    const a = prim.getAttribute(sem), arr = new Float32Array(idx.length * 3), v = [];
    for (let i = 0; i < idx.length; i++) { a.getElement(idx[i], v); arr.set(v, i * 3); }
    out[sem] = arr;
  }
  for (const sem of ['POSITION', 'NORMAL']) prim.setAttribute(sem, doc_accessor(prim, out[sem], 'VEC3'));
  prim.setIndices(doc_accessor(prim, Uint32Array.from({ length: idx.length }, (_, i) => i), 'SCALAR'));
}

// the face's main axis picks the region: |nz| side, +ny top, -ny bottom (base colour), +nx front, -nx back
function projectUVs(prim) {
  const pos = prim.getAttribute('POSITION'), count = pos.getCount(), uv = new Float32Array(count * 2), p = [[], [], []];
  for (let t = 0; t < count; t += 3) {
    for (let j = 0; j < 3; j++) pos.getElement(t + j, p[j]);
    const f = faceNormal(...p), a = f.map(Math.abs);
    const region = a[2] >= a[0] && a[2] >= a[1] ? REGIONS.side : a[1] >= a[0] ? (f[1] > 0 ? REGIONS.top : null) : (f[0] > 0 ? REGIONS.front : REGIONS.back);
    for (let j = 0; j < 3; j++) {
      const [u, v] = region ? regionUV(region, p[j]) : [0.002, 0.002];   // bottom faces: the atlas corner, plain navy
      uv[(t + j) * 2] = u; uv[(t + j) * 2 + 1] = v;
    }
  }
  prim.setAttribute('TEXCOORD_0', doc_accessor(prim, uv, 'VEC2'));
}

// metres in the region's axes -> atlas UV (glTF: v down from the top of the image); the image's up is +y on side/front/back, -z on top
function regionUV(r, p) {
  const px = r.x + (p[r.u] - r.uMin) / LIVERY.mPerPx;
  const py = r.v === 1 ? r.y + r.h - (p[1] - r.vMin) / LIVERY.mPerPx : r.y + (p[2] - r.vMin) / LIVERY.mPerPx;
  return [px / LIVERY.px, py / LIVERY.px];
}

function doc_accessor(prim, array, type) {
  const d = prim.getAttribute('POSITION');
  const buffer = d.getBuffer();
  return out.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

// ---------- the livery picture (SVG -> PNG); car metres -> region pixels ----------
function renderLivery() {
  const { light, navy, red, white } = LIVERY, s = 1 / LIVERY.mPerPx;
  const side = REGIONS.side, topR = REGIONS.top, fr = REGIONS.front, bk = REGIONS.back;
  const sx = (x) => side.x + (x - side.uMin) * s, sy = (y) => side.y + side.h - (y - side.vMin) * s;
  const tx = (x) => topR.x + (x - topR.uMin) * s, tz = (z) => topR.y + (z - topR.vMin) * s;
  // the side: navy below a line rising from the nose (0.40 m) to the tail (0.62 m), a red band on it, a white number panel on the front door
  const lineY = (x) => 0.40 + (0.62 - 0.40) * (2.1 - x) / 4.2;
  const band = (y0, dy, fill) => `<polygon fill="${fill}" points="${sx(-2.15)},${sy(lineY(-2.15) + y0)} ${sx(2.15)},${sy(lineY(2.15) + y0)} ${sx(2.15)},${sy(lineY(2.15) + y0 + dy)} ${sx(-2.15)},${sy(lineY(-2.15) + y0 + dy)}"/>`;
  const number = (cxp, cyp, h, fill, rotate = 0) => `<text x="0" y="0" transform="translate(${cxp},${cyp}) rotate(${rotate})" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${h}" fill="${fill}" text-anchor="middle" dominant-baseline="central">8</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LIVERY.px}" height="${LIVERY.px}">
  <rect width="100%" height="100%" fill="${navy}"/>
  <rect x="${side.x}" y="${side.y}" width="${side.w}" height="${side.h}" fill="${light}"/>
  ${band(-1, 1, navy)}${band(0, 0.06, red)}${band(0.09, 0.025, white)}
  <rect x="${sx(0.12)}" y="${sy(0.9)}" width="${0.5 * s}" height="${0.34 * s}" rx="${0.04 * s}" fill="${white}"/>
  ${number(sx(0.37), sy(0.73), 0.3 * s, navy)}
  <rect x="${topR.x}" y="${topR.y}" width="${topR.w}" height="${topR.h}" fill="${light}"/>
  <rect x="${tx(-2.15)}" y="${tz(-0.32)}" width="${4.3 * s}" height="${0.08 * s}" fill="${red}"/>
  <rect x="${tx(-2.15)}" y="${tz(0.24)}" width="${4.3 * s}" height="${0.08 * s}" fill="${red}"/>
  <rect x="${tx(-2.15)}" y="${tz(-0.24)}" width="${4.3 * s}" height="${0.48 * s}" fill="${navy}"/>
  <rect x="${tx(-0.75)}" y="${tz(-0.3)}" width="${0.6 * s}" height="${0.6 * s}" rx="${0.05 * s}" fill="${white}"/>
  ${number(tx(-0.45), tz(0), 0.5 * s, navy, 90)}
  <rect x="${fr.x}" y="${fr.y}" width="${fr.w}" height="${fr.h}" fill="${light}"/>
  <rect x="${fr.x}" y="${fr.y + fr.h - 0.42 * s}" width="${fr.w}" height="${0.42 * s}" fill="${navy}"/>
  <rect x="${fr.x}" y="${fr.y + fr.h - 0.48 * s}" width="${fr.w}" height="${0.06 * s}" fill="${red}"/>
  <rect x="${bk.x}" y="${bk.y}" width="${bk.w}" height="${bk.h}" fill="${light}"/>
  <rect x="${bk.x}" y="${bk.y + bk.h - 0.62 * s}" width="${bk.w}" height="${0.62 * s}" fill="${navy}"/>
  <rect x="${bk.x}" y="${bk.y + bk.h - 0.68 * s}" width="${bk.w}" height="${0.06 * s}" fill="${red}"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
