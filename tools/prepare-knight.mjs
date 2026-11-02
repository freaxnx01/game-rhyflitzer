// prepare-knight.mjs — builds assets/knight.glb from the Sketchfab "KITT - Knight Rider" (thenerdybirdy, CC BY 4.0,
// https://sketchfab.com/3d-models/kitt-knight-rider-60443abd88ef4cb7ab1df9ac5f622a36). In the game: the Rhy Knight, a black
// early-eighties sports coupé with the red scanner light in the nose, no badge, no number plate.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   cp tools/prepare-knight.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-knight.mjs <original.glb> <out.glb>
// The original is 5.8 MB, about 12.8k triangles (no simplify needed), the front towards +z, its left side on +x, in centimetre-ish
// units; one node per part. The body ("Exterior") is one textured mesh: the texture holds the lamps, so its triangles are split by
// the texture colour under them (white -> LampHead, red at the back -> LampTail). The texture's "KNIGHT" number plate is painted
// over. The interior's photo textures are replaced by plain colours; the hubcaps keep theirs. The model's static scanner strip
// stays as a dark backing, with eight lens segments in front of it, Scan0 .. Scan7 { extras: { scan: i } }, left to right: the
// game lights them in turn (scanner.js).
//
// Output contract (tools/prepare-hatchback.mjs's, plus the scanner segments):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, wheelbase 2.565 m, no node transform left except the wheels'
//   node "knight"                          the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//   materials: one per role in ROLES, all double-sided; Body keeps the (edited) texture, Glass { extras: { glass: true } },
//   LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }, Scan0 .. Scan7 { extras: { scan: i } }
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const WHEELBASE_M = 2.565;   // the 1982 Firebird's 101 in; gives the coupé its real 4.85 m length
const SCAN_SEGMENTS = 8, SCAN_GAP = 0.15;   // the share of each segment's width left dark between the lenses
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
const PLATE = { x0: 893, y0: 82, x1: 962, y1: 240 };   // the rear number plate in the 1024 px body texture (blue "KNIGHT CALIFORNIA")
const PLATE_FILL = [12, 12, 12];   // the black of the plate's surround
// by original material name
const MATERIAL_ROLES = {
  aiExterior: 'Body', aiGlass: 'Glass', aiBlackPaint: 'Black', aiRearViewMirror: 'Black', aiTireRubber: 'Rubber', aiTireHubCap: 'Hub',
  aiInterior: 'Interior', aiDashboard: 'Interior', aiStandardSurface14: 'Interior', aiSteeringWheel: 'Interior',
  aiSeatTopBack: 'Seat', aiSeatTopFront: 'Seat', aiSeatBottom: 'Seat', aiScanner: 'ScanBack',
};
const WHEEL_PART = /^(Tire|.*Hub)/;   // TireFrontDriver, FrontDriverHub, RearPassengerHub1, ...
// colours are linear factors
const ROLES = {
  Body: { base: [1, 1, 1, 1], metal: 0.3, rough: 0.3, keepTexture: true },
  Black: { base: [0.012, 0.012, 0.012, 1], metal: 0.3, rough: 0.3 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Hub: { base: [1, 1, 1, 1], metal: 0.4, rough: 0.4, keepTexture: true },
  Interior: { base: [0.03, 0.028, 0.026, 1], metal: 0, rough: 0.8 },
  Seat: { base: [0.5, 0.36, 0.22, 1], metal: 0, rough: 0.7 },
  Glass: { base: [0.05, 0.07, 0.09, 0.35], metal: 0, rough: 0.05, alpha: true, extras: { glass: true } },
  ScanBack: { base: [0.05, 0.004, 0.003, 1], metal: 0, rough: 0.3 },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
  ...Object.fromEntries(Array.from({ length: SCAN_SEGMENTS }, (_, i) => [`Scan${i}`, { base: [0.12, 0.005, 0.004, 1], metal: 0, rough: 0.2, emissive: [1, 0.03, 0.01], extras: { scan: i } }])),
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-knight.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh; positions only, plus the UVs of the textured parts
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
const all = [], srcTexture = {};
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  const name = n.getName().replace(/_ai\w+_0$/, ''), src = p.getMaterial()?.getName() ?? '', role = MATERIAL_ROLES[src];
  if (!role) throw new Error(`prepare-knight: part ${name} (material "${src}") has no role`);
  if (ROLES[role].keepTexture) srcTexture[role] = p.getMaterial().getBaseColorTexture();
  for (const sem of p.listSemantics()) if (sem !== 'POSITION' && !(ROLES[role].keepTexture && sem === 'TEXCOORD_0')) p.setAttribute(sem, null);
  if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
  all.push({ name, prim: p, role, wheel: WHEEL_PART.test(name) });
}
for (const role of ['Body', 'Hub']) if (!srcTexture[role]) throw new Error(`prepare-knight: no ${role} texture`);

// 2. the frame from the tyres. The original faces +z with its left side on +x: new = k * (z - cz, y - y0, -(x - cx)), a rotation about y
const tyres = all.filter(a => a.wheel && a.role === 'Rubber');
if (tyres.length !== 4) throw new Error(`prepare-knight: ${tyres.length} tyres, want 4`);
const tyreCentres = tyres.map(t => centreOf(boundsOf([t.prim]))), tb = boundsOf(tyres.map(t => t.prim));
const zs = tyreCentres.map(c => c[2]), mid = (Math.max(...zs) + Math.min(...zs)) / 2, axle = (s) => { const a = zs.filter(z => s * (z - mid) > 0); return a.reduce((t, z) => t + z, 0) / a.length; };
const front = axle(1), rear = axle(-1);   // the two front tyres sit 0.5 units apart along z in the original
const k = WHEELBASE_M / (front - rear), y0 = tb.min[1], cz = (front + rear) / 2, cx = (tb.min[0] + tb.max[0]) / 2;
const toNew = ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)];
for (const { prim } of all) mapAttribute(prim, 'POSITION', toNew);

// 3. the body texture: the number plate painted over; then the body's triangles split by the colour under them
const bodyTex = srcTexture.Body, img = await sharp(Buffer.from(bodyTex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = img.info, px = img.data;
for (let y = PLATE.y0; y <= PLATE.y1; y++) for (let x = PLATE.x0; x <= PLATE.x1; x++) px.set([...PLATE_FILL, 255], (y * W + x) * 4);
bodyTex.setImage(new Uint8Array(await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()));
const texel = ([u, v]) => { const x = Math.min(W - 1, Math.max(0, Math.floor((u - Math.floor(u)) * W))), y = Math.min(H - 1, Math.max(0, Math.floor((v - Math.floor(v)) * H))); return px.subarray((y * W + x) * 4, (y * W + x) * 4 + 3); };
const isHead = (rgb) => Math.min(...rgb) > 200, isTail = (rgb) => rgb[0] > 20 && rgb[0] > 3 * Math.max(rgb[1], rgb[2]);   // the full-width tail band is a dark red
const lampOf = (pos, uvs) => { const share = (test) => uvs.filter(uv => test(texel(uv))).length / uvs.length; return pos[0] > 0 && share(isHead) > 0.5 ? 'LampHead' : pos[0] < -2.0 && share(isTail) > 0.5 ? 'LampTail' : null; };
for (const body of all.filter(a => a.role === 'Body')) for (const piece of splitByFace(body.prim, lampOf)) all.push({ ...body, prim: piece.prim, role: piece.role });

// 4. the scanner: eight lens segments just in front of the model's strip, which stays as the dark backing
const back = all.find(a => a.role === 'ScanBack'), sb = boundsOf([back.prim]);
const scanBox = (i) => { const w = (sb.max[2] - sb.min[2]) / SCAN_SEGMENTS, z0 = sb.min[2] + w * (i + SCAN_GAP / 2), z1 = sb.min[2] + w * (i + 1 - SCAN_GAP / 2); return boxPrim([sb.max[0] - 0.004, sb.min[1] + 0.006, z0], [sb.max[0] + 0.012, sb.max[1] - 0.006, z1]); };
for (let i = 0; i < SCAN_SEGMENTS; i++) all.push({ name: `scan${i}`, prim: scanBox(i), role: `Scan${i}`, wheel: false });
console.log('scanner', r3(sb.min), r3(sb.max));

// 5. materials by role
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

// 6. scene: body and four wheels (tyre + hub by the nearest tyre centre)
const scene = doc.createScene('knight');
const top = doc.createNode('knight'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
for (const { prim, wheel } of all) if (!wheel && prim.getIndices().getCount() > 0) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
// the wheel nodes symmetric: the axle's mean x, the mean half track (the original's front tyres are 2 cm out of line)
const centres = tyres.map(t => centreOf(boundsOf([t.prim]))), halfTrack = centres.reduce((t, c) => t + Math.abs(c[2]), 0) / 4;
const axleX = (s) => centres.filter(c => s * c[0] > 0).reduce((t, c) => t + c[0], 0) / 2;
for (const c of centres) {
  const at = [axleX(Math.sign(c[0])), c[1], Math.sign(c[2]) * halfTrack];
  const name = `wheel_${c[0] > 0 ? 'F' : 'R'}${c[2] < 0 ? 'L' : 'R'}`;
  const mine = all.filter(a => a.wheel && nearest(centres, centreOf(boundsOf([a.prim]))) === c);
  for (const { prim } of mine) mapAttribute(prim, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(name); mine.forEach(a => mesh.addPrimitive(a.prim));
  top.addChild(doc.createNode(name).setTranslation(at).setMesh(mesh));
  console.log(name, 'centre', r3(at), 'r', +((tb.max[1] - tb.min[1]) * k / 2).toFixed(3), 'parts', mine.length);
}

const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());

// 7. normals: smooth across edges flatter than the crease angle
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await doc.transform(weld(), prune());
for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'KITT - Knight Rider (modified)', author: 'thenerdybirdy (https://sketchfab.com/thenerdybirdy)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/kitt-knight-rider-60443abd88ef4cb7ab1df9ac5f622a36' };
await io.write(output, doc);
const body = root.listMeshes().find(m => m.getName() === 'body').listPrimitives(), byMat = (n) => boundsOf(body.filter(p => p.getMaterial().getName() === n));
console.log('wrote', output, 'triangles', docTris(doc), 'materials', root.listMaterials().length, 'body bounds', r3(boundsOf(body).min), r3(boundsOf(body).max));
for (const n of ['LampHead', 'LampTail']) console.log(n, 'bounds', r3(byMat(n).min), r3(byMat(n).max));

// ---------- helpers ----------
function r3(v) { return v.map(x => +x.toFixed(3)); }
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function nearest(list, p) { return list.reduce((a, b) => Math.hypot(...a.map((v, i) => v - p[i])) <= Math.hypot(...b.map((v, i) => v - p[i])) ? a : b); }
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

// moves the faces whose roleOf(centroid, uv samples: the uv centroid and halfway to each corner) is a role into new primitives (same vertex accessors), one per role
function splitByFace(prim, roleOf) {
  const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices().getArray(), keep = [], moved = new Map(), a = [], t = [];
  for (let f = 0; f < idx.length; f += 3) {
    const c = [0, 0, 0], u = [0, 0], corners = [];
    for (let j = 0; j < 3; j++) { pos.getElement(idx[f + j], a); uv.getElement(idx[f + j], t); corners.push([...t]); for (let i = 0; i < 3; i++) c[i] += a[i] / 3; u[0] += t[0] / 3; u[1] += t[1] / 3; }
    const role = roleOf(c, [u, ...corners.map(q => [(u[0] + q[0]) / 2, (u[1] + q[1]) / 2])]), list = role ? (moved.get(role) ?? moved.set(role, []).get(role)) : keep;
    list.push(idx[f], idx[f + 1], idx[f + 2]);
  }
  prim.setIndices(prim.getIndices().clone().setArray(Uint32Array.from(keep)));
  return [...moved].map(([role, list]) => { const p = prim.clone(); p.setIndices(prim.getIndices().clone().setArray(Uint32Array.from(list))); console.log('body split', role, list.length / 3, 'triangles'); return { role, prim: p }; });
}

// an axis-aligned box as one primitive, positions only
function boxPrim(min, max) {
  const c = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(b => b.map((s, i) => s ? max[i] : min[i]));
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];
  const buf = root.listBuffers()[0];
  return doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(c.flat())).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(quads.flatMap(([p, q, r, s]) => [p, q, r, p, r, s]))).setBuffer(buf));
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
