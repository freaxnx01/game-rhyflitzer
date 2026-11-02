// prepare-fizz.mjs — builds assets/fizz.glb from the Sketchfab "XYZ School - NY marathon - Coca-Cola truck" (leslava, CC BY 4.0,
// https://sketchfab.com/3d-models/xyz-school-ny-marathon-coca-cola-truck-ec3b1538e99848a39153c8533a5658ff). In the game: the Rhy Fizz,
// a stylised red drinks truck (tractor and box trailer) with fairy lights, no brand: the model itself carries no logo or lettering.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-fizz.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-fizz.mjs <original.glb> <out.glb>
// The original is a 16 MB diorama, about 554k triangles: the truck (about 16k) on a tilted snowy road between spiral trees, the
// trailer drawn bent as if in a curve. The scenery goes (by material). The truck is levelled by its tractor's wheel centres, and the
// trailer is straightened: its box is unbent section by section (it is a strip of cross-sections, each turned a little further), its wheels move as
// rigid parts. Ten wheels on five axles, front to back: wheel_FL/FR, the tractor's two drive axles wheel_RL/RR and wheel_RL2/RR2,
// the trailer's wheel_RL3/RR3 and wheel_RL4/RR4. Added: fairy lights along the trailer's edges and round its tail (a lamp
// material, so they light up with L like the head lamps) and two tail lamps. Colours as in the original; no simplifying.
//
// Output contract (tools/prepare-hatchback.mjs's, plus the further rear axles):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin at the middle of the truck's length, no node transform left except the wheels'
//   node "fizz"                            the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR" "wheel_RL2" ... "wheel_RR4"
//                                          left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//   materials: one per role in ROLES; Glass { extras: { glass: true } }, LampHead and Fairy { extras: { lamp: 'head' } },
//   LampTail { extras: { lamp: 'tail' } }; extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const K = 0.05;   // model units to metres: an 11 m truck, 3 m wide over the stylised trailer, 0.92 m tyres
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
// the diorama: trees, snow, the road and its kerb stones
const SCENERY = new Set(['Blue1', 'Blue3', 'Blue5', 'Blue6', 'Snow', 'Road_D', 'Road_0', 'Road_1']);
const MATERIAL_ROLES = {
  material_5: 'Red', material_4: 'RedShade', material_10: 'RedDark', material: 'RedDeep', White: 'Trim',
  Dark2: 'Hub', Dark3: 'Rim', Dark4: 'Rubber', Road: 'Chrome',   // the wheels; "Road" is the exhaust stacks
  material_8: 'LampHead', material_9: 'Amber',
};
const WHEEL_PART = /^(Cylinder(_\d+)?_Dark[23]|Tube_1(_\d+)?_Dark4)_0$/;   // the first hub is plain "Cylinder_Dark2_0"
const TRAILER_BOX = /^Cube_6_/;
// colours are linear factors (the original's, which are already linear); nothing fully metallic
const ROLES = {
  Red: { base: [0.73, 0.09, 0.05, 1], metal: 0.15, rough: 0.4 },
  RedShade: { base: [0.46, 0.04, 0.02, 1], metal: 0.15, rough: 0.45 },
  RedDark: { base: [0.34, 0.03, 0.02, 1], metal: 0.1, rough: 0.5 },
  RedDeep: { base: [0.16, 0.02, 0.01, 1], metal: 0.1, rough: 0.6 },
  Trim: { base: [0.87, 0.85, 0.76, 1], metal: 0.2, rough: 0.35 },
  Hub: { base: [0.23, 0.14, 0.13, 1], metal: 0.3, rough: 0.5 },
  Rim: { base: [0.3, 0.28, 0.28, 1], metal: 0.4, rough: 0.4 },
  Rubber: { base: [0.03, 0.03, 0.03, 1], metal: 0, rough: 0.9 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
  // warm white bulbs: they glow with the head lamps
  Fairy: { base: [0.9, 0.75, 0.4, 1], metal: 0, rough: 0.3, emissive: [1, 0.7, 0.3], extras: { lamp: 'head' } },
};
const FAIRY = { step: 0.45, size: 0.09, inset: 0.04 };   // metres: bulb spacing, bulb cube edge, how far inside the box's edge

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-fizz.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh; positions only (normals are rebuilt at the end); the scenery goes
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
}
const parts = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) {
  const name = n.getName(), src = p.getMaterial()?.getName() ?? '';
  if (SCENERY.has(src) || name.startsWith('Base_')) continue;
  const role = MATERIAL_ROLES[src];
  if (!role) throw new Error(`prepare-fizz: part ${name} (material "${src}") has no role`);
  for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
  parts.push({ name, prim: p, role, wheel: WHEEL_PART.test(name), box: TRAILER_BOX.test(name) });
}

// 2. the wheels: each Tube (tyre) with the cylinders (rim, hub) whose centre lies inside it; the axles by x, front to back
const tubes = parts.filter(p => p.wheel && p.role === 'Rubber').map(p => ({ part: p, c: centreOf(boundsOf([p.prim])), parts: [p] }));
for (const p of parts.filter(p => p.wheel && p.role !== 'Rubber')) {
  const c = centreOf(boundsOf([p.prim])), t = tubes.reduce((a, b) => dist(a.c, c) < dist(b.c, c) ? a : b);
  t.parts.push(p);
}
if (tubes.length !== 10) throw new Error(`prepare-fizz: expected 10 tyres, found ${tubes.length}`);
const axles = clusterBy(tubes, t => t.c[0], 10).sort((a, b) => b.x - a.x);   // [{ x, items }] front first; the bent trailer's wheels sit 7 units apart in x
if (axles.length !== 5 || axles.some(a => a.items.length !== 2)) throw new Error(`prepare-fizz: expected 5 axles of 2, got ${axles.map(a => a.items.length)}`);
const tractor = axles.slice(0, 3).flatMap(a => a.items), trailerAxles = axles.slice(3);

// 3. level it: the line through the tractor's wheel centres (x -> y) becomes horizontal (a turn about z through the first centre)
const fit = lineFit(tractor.map(t => [t.c[0], t.c[1]])), pitch = Math.atan(fit.slope), [px, py] = [tractor[0].c[0], tractor[0].c[1]];
const level = ([x, y, z]) => { const dx = x - px, dy = y - py, c = Math.cos(-pitch), s = Math.sin(-pitch); return [px + dx * c - dy * s, py + dx * s + dy * c, z]; };
for (const { prim } of parts) mapAttribute(prim, 'POSITION', level);
for (const t of tubes) t.c = centreOf(boundsOf(t.parts.map(p => p.prim)));
const zT = tractor.reduce((s, t) => s + t.c[2], 0) / tractor.length;   // the tractor's centre line

// 4. straighten the trailer: its box is a strip of cross-sections (left and right outer edge), each turned a little further than the
//    one before. A point is placed by where it lies between two sections (u along, s across, the inverse of the bilinear quad
//    between them) and set down on the straight box: the sections in a row, as far apart as their centres were, at the tractor's
//    centre line. The wheels move rigidly with their centre and turn by the heading of the strip there.
const boxPrims = parts.filter(p => p.box).map(p => p.prim), sections = boxSections(parts.filter(p => p.box && p.role === 'Trim').map(p => p.prim));
const along = [sections[0].m[0]];
for (let i = 1; i < sections.length; i++) along.push(along[i - 1] - Math.hypot(sections[i].m[0] - sections[i - 1].m[0], sections[i].m[1] - sections[i - 1].m[1]));
const straight = ([x, y, z]) => {
  const { i, u, s } = locate(sections, x, z), a = sections[i], b = sections[i + 1], w = (1 - u) * a.w + u * b.w;
  return [along[i] + u * (along[i + 1] - along[i]), y, zT + (s - 0.5) * w];
};
for (const prim of boxPrims) mapAttribute(prim, 'POSITION', straight);
for (const t of trailerAxles.flatMap(a => a.items)) {
  const c = t.c, { i, u } = locate(sections, c[0], c[2]), phi = (1 - u) * sections[i].yaw + u * sections[i + 1].yaw, to = straight(c), cs = Math.cos(phi), sn = Math.sin(phi);
  for (const { prim } of t.parts) mapAttribute(prim, 'POSITION', ([x, y, z]) => { const dx = x - c[0], dz = z - c[2]; return [to[0] + dx * cs + dz * sn, y, to[2] - dx * sn + dz * cs]; });
  t.c = to;
}
// the original placed the trailer's wheels by hand, a little apart: each axle's two get their mean x and a mirrored track
for (const a of trailerAxles) {
  const x = a.items.reduce((s, t) => s + t.c[0], 0) / 2, half = a.items.reduce((s, t) => s + Math.abs(t.c[2] - zT), 0) / 2;
  for (const t of a.items) {
    const to = [x, t.c[1], zT + Math.sign(t.c[2] - zT) * half], d = [0, 1, 2].map(k => to[k] - t.c[k]);
    for (const { prim } of t.parts) mapAttribute(prim, 'POSITION', (v) => v.map((q, k) => q + d[k]));
    t.c = to;
  }
}
console.log('pitch deg', +(pitch * 180 / Math.PI).toFixed(2), 'trailer sections', sections.length, 'heading deg', sections.map(q => +(q.yaw * 180 / Math.PI).toFixed(1)));

// 5. to metres: origin at the middle of the length and on the centre line, wheels on y = 0
const all = boundsOf(parts.map(p => p.prim)), y0 = Math.min(...tubes.map(t => boundsOf([t.part.prim]).min[1]));
const ox = (all.min[0] + all.max[0]) / 2, toM = ([x, y, z]) => [K * (x - ox), K * (y - y0), K * (z - zT)];
for (const { prim } of parts) mapAttribute(prim, 'POSITION', toM);
for (const t of tubes) t.c = toM(t.c);

// 6. added parts, in metres: fairy lights round the trailer box, tail lamps under its tail
const box = boundsOf(boxPrims), added = [];
const { step, size, inset } = FAIRY;
const [x0, x1] = [box.min[0] + inset, box.max[0] - inset], [yb, yt] = [box.min[1] + inset, box.max[1] - inset], [zl, zr] = [box.min[2] - size / 2, box.max[2] + size / 2];
for (let x = x1; x >= x0; x -= step) for (const z of [zl, zr]) for (const y of [yb, yt]) added.push({ role: 'Fairy', box: [x, y, z, size, size, size] });
for (let y = yb + step; y < yt; y += step) for (const z of [zl, zr]) added.push({ role: 'Fairy', box: [box.min[0] - size / 2, y, z, size, size, size] });
for (let z = box.min[2] + step; z < box.max[2]; z += step) for (const y of [yb, yt]) added.push({ role: 'Fairy', box: [box.min[0] - size / 2, y, z, size, size, size] });
for (const s of [-1, 1]) added.push({ role: 'LampTail', box: [box.min[0] - 0.03, Math.max(0.55, box.min[1] - 0.2), s * (box.max[2] - box.min[2]) * 0.38, 0.06, 0.16, 0.4] });
for (const a of added) parts.push({ name: a.role, prim: boxPrim(a.box), role: a.role });
console.log('fairy bulbs', added.filter(a => a.role === 'Fairy').length);

// 7. materials by role
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough).setDoubleSided(true);
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
for (const { prim, role } of parts) prim.setMaterial(mats[role]);

// 8. scene: body + ten wheel nodes (vertices centred on the tyre centre)
const scene = doc.createScene('fizz');
const top = doc.createNode('fizz'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
for (const { prim, wheel } of parts) if (!wheel) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
const AXLE_NODE = ['F', 'R', 'R2', 'R3', 'R4'];
axles.forEach((a, i) => a.items.forEach(t => {
  const side = t.c[2] < 0 ? 'L' : 'R', name = `wheel_${AXLE_NODE[i][0]}${side}${AXLE_NODE[i].slice(1)}`, c = t.c;
  for (const { prim } of t.parts) mapAttribute(prim, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(name); t.parts.forEach(p => mesh.addPrimitive(p.prim));
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((boundsOf([t.part.prim]).max[1] - boundsOf([t.part.prim]).min[1]) / 2).toFixed(3));
}));
const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await doc.transform(weld(), prune());
for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'XYZ School - NY marathon - Coca-Cola truck (modified)', author: 'leslava (https://sketchfab.com/leslava)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/xyz-school-ny-marathon-coca-cola-truck-ec3b1538e99848a39153c8533a5658ff' };
await io.write(output, doc);
const r3 = (v) => v.map(x => +x.toFixed(3)), bodyB = boundsOf(bodyMesh.listPrimitives());
console.log('wrote', output, 'triangles', docTris(doc), 'materials', root.listMaterials().length, 'body bounds', r3(bodyB.min), r3(bodyB.max));
const amber = boundsOf(bodyMesh.listPrimitives().filter(p => p.getMaterial() === mats.Amber)), head = boundsOf(bodyMesh.listPrimitives().filter(p => p.getMaterial() === mats.LampHead));
console.log('amber bounds', r3(amber.min), r3(amber.max), 'head lamp bounds', r3(head.min), r3(head.max));

// ---------- fitting ----------
function lineFit(pts) {
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0), sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  return { slope: sxy / sxx, at: my - (sxy / sxx) * mx };
}
// the box's cross-sections from its outer trim: per side, the vertices grouped by x (within 1.5 units), the outermost of each group;
// the n-th group of the left side pairs with the n-th of the right, front first. { l, r: [x, z], m: centre, w: width, yaw: heading }
function boxSections(prims) {
  const pts = verticesOf(prims), zMid = (Math.min(...pts.map(p => p[2])) + Math.max(...pts.map(p => p[2]))) / 2, edge = (side) => {
    const mine = pts.filter(p => (p[2] - zMid) * side > 0);
    return clusterBy(mine, p => p[0], 1.5).map(g => g.items.reduce((o, p) => (p[2] - o[2]) * side > 0 ? p : o)).sort((p, q) => q[0] - p[0]);
  };
  const left = edge(-1), right = edge(1);
  if (left.length !== right.length || left.length < 3) throw new Error(`prepare-fizz: trailer sections do not pair: ${left.length} left, ${right.length} right`);
  return left.map((L, i) => {
    const R = right[i], l = [L[0], L[2]], r = [R[0], R[2]];
    return { l, r, m: [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2], w: Math.hypot(r[0] - l[0], r[1] - l[1]), yaw: Math.atan2(l[0] - r[0], r[1] - l[1]) };
  });
}
// which pair of sections a point (x, z) lies between: the inverse of the bilinear quad l_i r_i r_i+1 l_i+1 by Newton's method;
// u 0..1 from section i to i+1, s 0..1 from the left edge to the right. Outside the strip, the nearest end pair, extrapolated.
function locate(secs, x, z) {
  let best = null;
  for (let i = 0; i + 1 < secs.length; i++) {
    const A = secs[i], B = secs[i + 1], P = (u, s) => [0, 1].map(k => (1 - u) * ((1 - s) * A.l[k] + s * A.r[k]) + u * ((1 - s) * B.l[k] + s * B.r[k]));
    let u = 0.5, s = 0.5;
    for (let it = 0; it < 20; it++) {
      const p = P(u, s), fx = p[0] - x, fz = p[1] - z, h = 1e-4;
      const pu = P(u + h, s), ps = P(u, s + h), j = [[(pu[0] - p[0]) / h, (ps[0] - p[0]) / h], [(pu[1] - p[1]) / h, (ps[1] - p[1]) / h]];
      const det = j[0][0] * j[1][1] - j[0][1] * j[1][0]; if (Math.abs(det) < 1e-12) break;
      u -= (j[1][1] * fx - j[0][1] * fz) / det; s -= (-j[1][0] * fx + j[0][0] * fz) / det;
    }
    const out = Math.max(0, -u, u - 1);
    if (!best || out < best.out) best = { i, u, s, out };
  }
  return best;
}
// groups items whose key lies within gap of the group's first, as [{ x: mean key, items }]
function clusterBy(items, key, gap) {
  const groups = [];
  for (const it of [...items].sort((a, b) => key(a) - key(b))) {
    const g = groups.find(g => Math.abs(key(g.items[0]) - key(it)) < gap);
    if (g) g.items.push(it); else groups.push({ items: [it] });
  }
  return groups.map(g => ({ ...g, x: g.items.reduce((s, it) => s + key(it), 0) / g.items.length }));
}

// ---------- helpers ----------
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function primTris(p) { return (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
function docTris(d) { return d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + primTris(p), 0); }
function verticesOf(prims) {
  const out = [], v = [];
  for (const p of prims) { const a = p.getAttribute('POSITION'); for (const i of new Set(p.getIndices().getArray())) out.push([...a.getElement(i, v)]); }
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
