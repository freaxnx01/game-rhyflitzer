// prepare-bulldog.mjs — builds assets/bulldog.glb from the Sketchfab "Chevrolet Caprice Classic Sedan" (popit228fm, CC BY 4.0,
// https://sketchfab.com/3d-models/chevrolet-caprice-classic-sedan-96200ce146014b858e2b284c123bbe42). In the game: the Rhy Bulldog,
// a demolition-derby sedan with a push bar and its own flame livery, no badge.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-bulldog.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-bulldog.mjs <original.glb> <out.glb>
// The original is 4.7 MB, about 20k triangles in 72 parts, the front towards +z. Its look lives in one texture atlas over a few
// materials, so the roles go by part name. The atlas goes; the body panels get a livery texture drawn here (black, orange and
// yellow flames from the nose, the number 77 on the front doors) with UVs projected from the side and from above. The badges,
// the bonnet ornament and the number plate are dropped. The tail lamps only exist in the atlas, so two lamp blocks are added,
// and so is the push bar. All four wheels come as one part per material: they are split by quadrant. No simplifying.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.946 m, no node transform left except the wheels'
//   node "bulldog"                         the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//   materials: one per role in ROLES; Livery (the flame texture, not paintable), Glass { extras: { glass: true } },
//   LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   extensions: EXT_meshopt_compression only.
import { deflateSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const WHEELBASE_M = 2.946;   // the 1986 Caprice's 116 in
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
const strip = (name) => name.replace(/_Material(\.\d+)?_0$/, '');   // "Plane.007_Material_0" -> "Plane.007"
// the grille script badge, the bowtie, the bonnet ornament, the front number plate
const DROP = new Set(['Plane.001', 'object_0.690', 'object_0.001', 'Plane.006']);
// the painted panels: the shell (with the bumpers), the bonnet, the four doors, the boot lid
const LIVERY = new Set(['Plane.007', 'Plane.011', 'Object_26', 'Object_40', 'Object_52']);
// the three wheel parts, each holding all four wheels; their names start with a garbled word, so they go by the ending
const WHEEL_PARTS = { ' LP': 'Rubber', ' HP.001': 'Chrome', ' HP.002': 'Chrome' };
const wheelPart = (name) => Object.keys(WHEEL_PARTS).find(end => name.endsWith(end));
const NODE_ROLES = {
  'object_0.035': 'LampHead',                                  // the four square head lamps
  'object_0.003': 'Amber',                                     // the corner markers
  'Plane.002': 'Chrome', 'Plane.003': 'Chrome',                // the grille frame
  'Plane.004': 'Black', 'Plane.005': 'Black',                  // the grille mesh
  'Cube.001': 'Black', 'object_0.742': 'Black',                // the underbody, the aerial
};
// whatever else: by original material (the atlas): Material = trim, Material.001 = the cabin, Material.003 = the windows
const MATERIAL_ROLES = { Material: 'Chrome', 'Material.001': 'Interior', 'Material.003': 'Glass' };
// colours are linear factors; nothing fully metallic, so the car still reads where the style has no sky map
const ROLES = {
  Livery: { base: [1, 1, 1, 1], metal: 0.25, rough: 0.35 },
  Black: { base: [0.012, 0.012, 0.012, 1], metal: 0, rough: 0.8 },
  Interior: { base: [0.12, 0.012, 0.012, 1], metal: 0, rough: 0.8 },   // the red cabin
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Glass: { base: [0.05, 0.07, 0.09, 0.35], metal: 0, rough: 0.05, alpha: true, doubleSided: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};
// added parts, output metres: boxes [centre x, y, z, size x, y, z]
const PUSH_BAR = [
  [2.62, 0.44, 0, 0.07, 0.07, 1.6], [2.62, 0.74, 0, 0.07, 0.07, 1.4],                 // the two cross tubes
  ...[-0.7, -0.25, 0.25, 0.7].map(z => [2.62, 0.56, z, 0.07, 0.42, 0.07]),           // four uprights
  ...[-0.45, 0.45].map(z => [2.53, 0.44, z, 0.2, 0.06, 0.06]),                        // the arms back into the bumper
];
const TAIL_LAMPS = [-1, 1].map(s => [-2.865, 0.7, s * 0.66, 0.03, 0.13, 0.36]);
const TEX = { w: 1024, h: 1024, number: '77' };
// the livery texture: three bands (right side, left side, top), its colours, the door number's digits and place
const BAND = 1 / 3;
// sRGB colours of the livery
const C = { black: [18, 18, 20], deep: [176, 26, 10], orange: [255, 122, 26], yellow: [255, 198, 26], ink: [10, 10, 10] };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hash = (i) => { const x = Math.sin(i * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
// seven-segment digits for the door number: segment boxes in a 0..1 cell (x right, y down)
const SEGMENTS = { a: [0, 0, 1, 0.22], b: [0.72, 0, 1, 0.56], c: [0.72, 0.44, 1, 1], d: [0, 0.78, 1, 1], e: [0, 0.44, 0.28, 1], f: [0, 0, 0.28, 0.56], g: [0, 0.39, 1, 0.61] };
const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
// the number on the front door, in the right band's terms: xn 0.5 .. 0.64, v 0.45 .. 0.75 of the band (v down, below the window)
const NUMBER = { x0: 0.5, x1: 0.64, y0: 0.45, y1: 0.75 };

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-bulldog.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh (meshes used twice are cloned first); keep positions only (normals are rebuilt in 6.)
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  if (n.getSkin()) bakeSkin(n); else transformMesh(n.getMesh(), n.getWorldMatrix());   // the doors are skinned: their joints place them
}
const all = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  const name = strip(n.getName()), src = p.getMaterial()?.getName() ?? '';
  if (DROP.has(name)) continue;
  const role = LIVERY.has(name) ? 'Livery' : WHEEL_PARTS[wheelPart(name)] ?? NODE_ROLES[name] ?? MATERIAL_ROLES[src];
  if (!role) throw new Error(`prepare-bulldog: part ${name} (material "${src}") has no role`);
  for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  for (const t of p.listTargets()) p.removeTarget(t);
  if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
  all.push({ name, prim: p, role, wheel: Boolean(wheelPart(name)) });
}
for (const name of [...LIVERY, 'object_0.035']) if (!all.some(a => a.name === name)) throw new Error(`prepare-bulldog: part ${name} is missing`);

// 2. the frame from the tyres: the tyre part holds all four, so its quadrants give the centres;
//    the original faces +z with its right side on -x: new = k * (z - cz, y - y0, -(x - cx)), a rotation about y
const tyrePart = all.find(a => a.name.endsWith(' LP')).prim, tb = boundsOf([tyrePart]);
const r0 = (tb.max[1] - tb.min[1]) / 2, cx = (tb.min[0] + tb.max[0]) / 2;
const zFront = tb.max[2] - r0, zRear = tb.min[2] + r0, cz = (zFront + zRear) / 2;
const k = WHEELBASE_M / (zFront - zRear), y0 = tb.min[1];
for (const { prim } of all) mapAttribute(prim, 'POSITION', ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)]);

// 3. the wheel parts split by quadrant: front / rear by x, left / right by z
const pieces = [];
for (const a of all.filter(a => a.wheel)) {
  const rear = a.prim, front = cutOut(rear, c => c[0] > 0);
  for (const [half, f] of [[front, 'F'], [rear, 'R']]) {
    const right = cutOut(half, c => c[2] > 0);
    pieces.push({ ...a, prim: half, quad: `${f}L` }, { ...a, prim: right, quad: `${f}R` });
  }
}
const parts = [...all.filter(a => !a.wheel), ...pieces];

// 4. the added parts: push bar and tail lamps
for (const b of PUSH_BAR) parts.push({ name: 'push bar', prim: boxPrim(b), role: 'Chrome' });
for (const b of TAIL_LAMPS) parts.push({ name: 'tail lamp', prim: boxPrim(b), role: 'LampTail' });

// 5. materials by role; the livery gets its texture
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.doubleSided) m.setDoubleSided(true);
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
for (const t of root.listTextures()) t.dispose();
mats.Livery.setBaseColorTexture(doc.createTexture('livery').setMimeType('image/png').setImage(liveryPng()));
for (const { prim, role } of parts) prim.setMaterial(mats[role]);

// 6. scene: body + four wheels (vertices centred on the tyre's centre)
const scene = doc.createScene('bulldog');
const top = doc.createNode('bulldog'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
for (const { prim, quad } of parts) if (!quad) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const quad of ['FL', 'FR', 'RL', 'RR']) {
  const prims = pieces.filter(p => p.quad === quad).map(p => p.prim);
  const tyre = prims.find(p => p.getMaterial() === mats.Rubber), b = boundsOf([tyre]), c = centreOf(b);
  for (const p of prims) mapAttribute(p, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(`wheel_${quad}`); prims.forEach(p => mesh.addPrimitive(p));
  top.addChild(doc.createNode(`wheel_${quad}`).setTranslation(c).setMesh(mesh));
  console.log(`wheel_${quad}`, 'centre', c.map(v => +v.toFixed(3)), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3));
}
const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());

// 7. normals: smooth across edges flatter than the crease angle; the livery's UVs per face while the faces are apart
const liveryBox = boundsOf(bodyMesh.listPrimitives().filter(p => p.getMaterial() === mats.Livery));
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  creaseNormals(p);
  if (p.getMaterial() === mats.Livery) projectLivery(p, liveryBox);
}
await doc.transform(weld(), prune());
for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'Chevrolet Caprice Classic Sedan (modified)', author: 'popit228fm (https://sketchfab.com/popit228fm)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/chevrolet-caprice-classic-sedan-96200ce146014b858e2b284c123bbe42' };
await io.write(output, doc);
const bodyB = boundsOf(bodyMesh.listPrimitives());
console.log('wrote', output, 'triangles', docTris(doc), 'materials', root.listMaterials().length, 'body bounds', bodyB.min.map(v => +v.toFixed(3)), bodyB.max.map(v => +v.toFixed(3)));

// ---------- the livery ----------
// texture in three bands: the right side, the left side (mirrored, so the number reads and the flames point back on both),
// and the top. In each band xn runs 0 (tail) .. 1 (nose), s across (up the side, or from left to right over the top).
function projectLivery(prim, box) {
  const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL'), n = pos.getCount(), uv = new Float32Array(n * 2), p = [], q = [];
  const size = [0, 1, 2].map(i => box.max[i] - box.min[i]);
  for (let f = 0; f < n; f += 3) {
    const fn = [0, 0, 0];
    for (let j = 0; j < 3; j++) { nrm.getElement(f + j, q); for (let a = 0; a < 3; a++) fn[a] += q[a]; }
    for (let j = 0; j < 3; j++) {
      pos.getElement(f + j, p);
      const xn = (p[0] - box.min[0]) / size[0], yn = (p[1] - box.min[1]) / size[1], zn = (p[2] - box.min[2]) / size[2];
      const [u, v] = Math.abs(fn[1]) > 0.6 * Math.hypot(...fn) ? [xn, 2 * BAND + zn * BAND]
        : fn[2] >= 0 ? [xn, (1 - yn) * BAND] : [1 - xn, BAND + (1 - yn) * BAND];
      uv.set([u, v], (f + j) * 2);
    }
  }
  prim.setAttribute('TEXCOORD_0', pos.clone().setType('VEC2').setArray(uv));
}


// flames from the nose: tongues across s, their tips reaching back to xn 0.3 .. 0.45, an outline in deep red
function flame(xn, s, count) {
  const t = s * count + 0.25 * Math.sin(xn * 9), i = Math.floor(t), d = Math.abs(t - i - 0.5) * 2;
  const tip = 0.3 + 0.15 * hash(i), edge = tip + (0.8 - tip) * Math.pow(d, 0.55);
  if (xn < edge) return null;
  const g = Math.min(1, (xn - edge) / 0.22);
  return xn - edge < 0.012 ? C.deep : g < 0.35 ? mix(C.deep, C.orange, g / 0.35) : mix(C.orange, C.yellow, (g - 0.35) / 0.65);
}

function inDigit(ch, x, y, grow = 0) {
  return [...DIGITS[ch]].some(k => { const [x0, y0, x1, y1] = SEGMENTS[k]; return x >= x0 - grow && x <= x1 + grow && y >= y0 - grow && y <= y1 + grow; });
}
function numberAt(u, v, number) {
  const { x0, x1, y0, y1 } = NUMBER;
  if (u < x0 - 0.01 || u > x1 + 0.01 || v < y0 - 0.02 || v > y1 + 0.02) return null;
  const cell = (x1 - x0) / number.length, i = Math.floor((u - x0) / cell);
  if (i < 0 || i >= number.length) return null;
  const x = ((u - x0) - i * cell) / cell * 1.25 - 0.1, y = (v - y0) / (y1 - y0);
  if (inDigit(number[i], x, y)) return C.yellow;
  return inDigit(number[i], x, y, 0.08) ? C.ink : null;
}

// u, v over the whole texture -> sRGB. On the left band u = 1 - xn: the door sits at u = 1 - x1 .. 1 - x0 there, and the number,
// read by someone standing at that side, still runs with u
function liveryPixel(u, v) {
  const band = Math.min(2, Math.floor(v / BAND)), vb = v / BAND - band;
  if (band === 2) return flame(u, vb, 6) ?? C.black;
  const xn = band === 0 ? u : 1 - u, numberU = band === 0 ? u : u + NUMBER.x0 + NUMBER.x1 - 1;
  return numberAt(numberU, vb, TEX.number) ?? flame(xn, 1 - vb, 4) ?? C.black;
}

function liveryPng() {
  const { w, h } = TEX, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) raw.set(liveryPixel((x + 0.5) / w, (y + 0.5) / h), y * (w * 3 + 1) + 1 + x * 3);
  }
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

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
  if (!cut.length || !keep.length) throw new Error(`prepare-bulldog: the split left ${keep.length / 3} / ${cut.length / 3} faces; expected wheels on both sides`);
  const piece = prim.clone();
  prim.setIndices(prim.getIndices().clone().setArray(new Uint32Array(keep)));
  piece.setIndices(piece.getIndices().clone().setArray(new Uint32Array(cut)));
  return piece;
}

// an axis-aligned box [cx, cy, cz, sx, sy, sz] as an indexed primitive, positions only
function boxPrim([x, y, z, sx, sy, sz]) {
  const pos = [], idx = [];
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const [a, b] = [0, 1, 2].filter(i => i !== axis), base = pos.length / 3;
    for (const [da, db] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0]; p[axis] = sign / 2; p[a] = da / 2; p[b] = db / 2;
      pos.push(x + p[0] * sx, y + p[1] * sy, z + p[2] * sz);
    }
    const flip = (axis === 1) === (sign > 0);   // keep every face wound outwards
    idx.push(...(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]).map(i => base + i));
  }
  const buf = root.listBuffers()[0];
  return doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf));
}

// a skinned part is placed by its joints, not by its node (as three.js draws it): each vertex goes through the weighted blend
// of jointWorld x inverseBind; the skin is dropped afterwards
function bakeSkin(node) {
  const skin = node.getSkin(), joints = skin.listJoints().map(j => j.getWorldMatrix()), ibm = skin.getInverseBindMatrices(), m = [];
  const bind = joints.map((jw, i) => mul4(jw, ibm.getElement(i, m)));
  for (const prim of node.getMesh().listPrimitives()) {
    const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'), j = [], w = [];
    mapAttribute(prim, 'POSITION', (p, i) => {
      J.getElement(i, j); W.getElement(i, w);
      const out = [0, 0, 0];
      for (let k = 0; k < 4; k++) if (w[k]) { const t = apply4(bind[j[k]], p); for (let a = 0; a < 3; a++) out[a] += w[k] * t[a]; }
      return out;
    });
  }
  node.setSkin(null);
}
function mul4(a, b) {   // column-major 4x4: a x b
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function apply4(m, [x, y, z]) { return [0, 1, 2].map(r => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]); }

// the accessor is detached first so a shared one is mapped once
function mapAttribute(prim, sem, fn) {
  const a = prim.getAttribute(sem); if (!a) return;
  const c = a.clone(); prim.setAttribute(sem, c);
  const v = []; for (let i = 0; i < c.getCount(); i++) c.setElement(i, fn(c.getElement(i, v), i));
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
