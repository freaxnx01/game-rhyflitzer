// prepare-delorean.mjs — builds assets/delorean.glb from the Sketchfab "DeLorean DMC 12 (Animated)" (JEX-D, CC BY 4.0,
// https://sketchfab.com/3d-models/delorean-dmc-12-animated-e90955c1dce945dfbcac09886b9f310e). In the game: the Rhy Gullwing,
// a brushed-steel eighties wedge coupé with gull-wing doors, no badge, no lettering, no number plate.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/dprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-delorean.mjs <scratch>/dprep/ && cd <scratch>/dprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-delorean.mjs <original.glb> <out.glb>
//   node prepare-delorean.mjs --list <original.glb>     # the probe: every part with its triangles, materials and world bounds
// The original (assets/src/delorean_dmc_12_animated.glb, 657 KB) is 10'026 triangles in 40 parts, 16 plain materials, no
// textures, 18 animation clips; its own frame is x = across the car, y = backwards, z = up, tyres on z = 0, at 1/200 scale.
//
// Dropped as branding or as junk, and why:
//   - the nodes C, D, M, M.001: four extruded letters (572 triangles each) on the nose, the maker's three-letter name;
//   - the mesh with the license_plate material: the rear number plate;
//   - the nodes lights, lights.001: two 24-triangle lamp meshes parked 33 m under the car (the author left them behind;
//     they would blow up the body box the game measures). The lamps that are on the car stay.
// Every animation clip goes with them: the game owns the door state (delorean.js DOOR / stepDoor) and drives door_L / door_R
// itself, so the author's doorAction would fight it.
//
// Output contract (tools/prepare-hatchback.mjs's, plus the doors):
//   metres, +x forward, +y up, +z right, tyres on y = 0, origin on the axle midpoint, wheelbase WHEELBASE_M, no node transform
//   left except the wheels' and the doors'
//   node "gullwing"                        the scene root
//     node "body"                          everything that neither turns nor swings
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//     node "door_L" "door_R"               translation = the hinge on the roof spine, vertices relative to it, no rotation:
//                                          the game swings them about the node's local x axis (drawDoors)
//   materials: one per role in ROLES, all double-sided; Glass { extras: { glass: true } }, LampHead { extras: { lamp: 'head' } },
//   LampTail { extras: { lamp: 'tail' } }. No paint material: the Rhy Gullwing's steel is not paintable (paint: false), and
//   index.html swaps Steel for the game's shared brushed steel at build (dressGullwing).
//   extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const WHEELBASE_M = 2.41;   // the DMC-12's 94.8 in; gives the coupé its real 4.26 m length (printed at the end, checked 4.22..4.32)
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
const FRONT_PART = 'front';   // the front fascia: which way the car faces in the original, rather than a guess from the wheel sizes
const WHEEL_GROUPS = /wheels\.\d+$/;   // "DeLorean wheels.001" (front) and ".002" (rear) — each holds both sides of its axle
const DOOR_GROUPS = { door: 1, 'door.001': 1 };   // the two gull-wing doors, by the sign of their z in the game frame
const DROP_NODES = new Set(['C', 'D', 'M', 'M.001', 'lights', 'lights.001']);   // see the header: the nose lettering and the two stray lamp meshes
const DROP_MATERIALS = new Set(['license_plate']);
// by original material name; eight roles, the vehicle draw-call budget (#368)
const MATERIAL_ROLES = {
  stainless_steel: 'Steel',
  chasis: 'Dark', 'black.003': 'Dark',
  glass: 'Glass',
  lights: 'LampHead', back_lights: 'LampTail',
  tire: 'Rubber', material: 'Rim',
  fabrick: 'Interior', control: 'Interior', steering_wheel: 'Interior', Material: 'Interior', C__0: 'Interior',
};
// colours are linear factors
const ROLES = {
  Steel: { base: [0.49, 0.51, 0.53, 1], metal: 0.9, rough: 0.42 },   // carMats.steel, which index.html swaps in over it
  Dark: { base: [0.012, 0.013, 0.016, 1], metal: 0, rough: 0.75 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.92 },
  Rim: { base: [0.578, 0.603, 0.633, 1], metal: 1, rough: 0.22 },
  Interior: { base: [0.03, 0.028, 0.026, 1], metal: 0, rough: 0.8 },
  Glass: { base: [0.05, 0.07, 0.09, 0.35], metal: 0, rough: 0.05, alpha: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};

const [, , ...args] = process.argv;
const listOnly = args[0] === '--list';
const [input, output] = listOnly ? [args[1], null] : args;
if (!input || (!listOnly && !output)) { console.error('usage: node prepare-delorean.mjs <original.glb> <out.glb>  |  --list <original.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. every mesh node with the chain of names above it, so a part is dropped by the group it hangs under, not by its own generated name
const parentOf = new Map();
for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
const chainOf = (n) => { const out = []; for (let p = n; p; p = parentOf.get(p)) out.push(p.getName()); return out; };
const meshNodes = root.listNodes().filter(n => n.getMesh());

if (listOnly) {
  for (const n of meshNodes) {
    for (const p of n.getMesh().listPrimitives()) {
      const b = boundsOf([p], n.getWorldMatrix());
      console.log(n.getName().padEnd(34), (p.getMaterial()?.getName() ?? '').padEnd(18), String(primTris(p)).padStart(5),
        'chain', chainOf(n).slice(1).join(' < '), 'min', r5(b.min), 'max', r5(b.max));
    }
  }
  console.log('materials', root.listMaterials().map(m => m.getName()).join(', '));
  console.log('animations', root.listAnimations().map(a => a.getName()).join(', '));
  console.log('textures', root.listTextures().length, 'triangles', docTris(doc));
  process.exit(0);
}

for (const a of root.listAnimations()) a.dispose();

// 2. bake every node transform into its mesh (positions only: the file has no textures, and the normals are rebuilt at the end)
const all = [], dropped = [];
for (const n of meshNodes) {
  const chain = chainOf(n), group = chain.find(name => WHEEL_GROUPS.test(name) || Object.hasOwn(DOOR_GROUPS, name)) ?? null;
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
  for (const p of n.getMesh().listPrimitives()) {
    const src = p.getMaterial()?.getName() ?? '';
    if (chain.some(name => DROP_NODES.has(name)) || DROP_MATERIALS.has(src)) { dropped.push(`${n.getName()} (${src}, ${primTris(p)} triangles)`); continue; }
    const role = MATERIAL_ROLES[src];
    if (!role) throw new Error(`prepare-delorean: part ${n.getName()} (material "${src}") has no role`);
    for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
    if (!p.getIndices()) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i)).setBuffer(root.listBuffers()[0]));
    all.push({ node: n.getName(), group, prim: p, role });
  }
}
console.log('dropped', dropped.length, 'parts:', dropped.join('; '));

// 3. the frame. The original lies on its side: x across the car, y along it, z up. new = k * (fw * (y - cy), z - z0, fw * (x - cx)),
//    a rotation about y (fw = -1 here: the "front" fascia sits on the low y, so forward is -y, and that puts the steering wheel on -z)
const groupPrims = (test) => all.filter(a => test(a.node, a.group)).map(a => a.prim);
const whole = boundsOf(all.map(a => a.prim));
const fw = centreOf(boundsOf(groupPrims((node) => node.startsWith(FRONT_PART))))[1] < centreOf(whole)[1] ? -1 : 1;
const axles = [...new Set(all.map(a => a.group).filter(g => g && WHEEL_GROUPS.test(g)))];
if (axles.length !== 2) throw new Error(`prepare-delorean: ${axles.length} wheel groups, want 2`);
const tyres = (group) => groupPrims((node, g) => g === group && node.includes('tire'));
const axleY = Object.fromEntries(axles.map(g => [g, centreOf(boundsOf(tyres(g)))[1]]));
const [frontAxle, rearAxle] = [...axles].sort((a, b) => fw * axleY[b] - fw * axleY[a]);   // the front axle is the one that ends up on +x
const k = WHEELBASE_M / Math.abs(axleY[frontAxle] - axleY[rearAxle]);
const cy = (axleY[frontAxle] + axleY[rearAxle]) / 2, cx = (whole.min[0] + whole.max[0]) / 2, z0 = boundsOf(axles.flatMap(tyres)).min[2];
const toNew = ([x, y, z]) => [fw * k * (y - cy), k * (z - z0), fw * k * (x - cx)];
for (const { prim } of all) mapAttribute(prim, 'POSITION', toNew);
const game = boundsOf(all.map(a => a.prim));
console.log('frame: forward', fw > 0 ? '+y' : '-y', 'scale', +k.toFixed(2), 'body box', r3(game.min), r3(game.max),
  'l', +(game.max[0] - game.min[0]).toFixed(3), 'w', +(game.max[2] - game.min[2]).toFixed(3), 'h', +(game.max[1] - game.min[1]).toFixed(3));
if (game.max[0] - game.min[0] < 4.22 || game.max[0] - game.min[0] > 4.32) throw new Error(`prepare-delorean: ${(game.max[0] - game.min[0]).toFixed(3)} m long at the ${WHEELBASE_M} m wheelbase, want 4.22..4.32 — scale by the length instead`);

// 4. the wheels: each axle group holds both sides in one mesh, so its faces are split by the sign of z, and the two nodes of an
//    axle are set symmetric (the original's tyres sit a few millimetres out of line)
const wheels = {};
for (const [group, tag] of [[frontAxle, 'F'], [rearAxle, 'R']]) {
  const mine = all.filter(a => a.group === group), sides = { L: [], R: [] };
  for (const a of mine) {
    const right = splitFaces(a.prim, (c) => c[2] > 0);
    sides.L.push(a.prim); a.group = null;
    if (right) { sides.R.push(right); all.push({ ...a, prim: right }); }   // into `all` as well, or the cut-off half keeps the original material
  }
  if (!sides.R.length) throw new Error(`prepare-delorean: axle ${group} has no right-hand faces`);
  const b = boundsOf([...sides.L, ...sides.R]), zAbs = (Math.abs(centreOf(boundsOf(sides.L))[2]) + Math.abs(centreOf(boundsOf(sides.R))[2])) / 2;
  for (const [side, prims] of Object.entries(sides)) {
    const at = [centreOf(b)[0], centreOf(b)[1], (side === 'L' ? -1 : 1) * zAbs];
    for (const p of prims) mapAttribute(p, 'POSITION', ([x, y, z]) => [x - at[0], y - at[1], z - at[2]]);
    wheels[`wheel_${tag}${side}`] = { at, prims };
    console.log(`wheel_${tag}${side}`, 'centre', r3(at), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3), 'width', +(b.max[2] - b.min[2]).toFixed(3));
  }
}

// 5. the doors: the hinge is the inner top edge of the door (its x centre, its highest y, the z nearest the centre line), set
//    symmetric so both swing the same; the node keeps no rotation, the game writes rotation.x (drawDoors)
const doorGroups = Object.keys(DOOR_GROUPS).map(group => {
  const prims = groupPrims((node, g) => g === group);
  if (!prims.length) throw new Error(`prepare-delorean: door group ${group} missing`);
  const b = boundsOf(prims);
  return { group, prims, b, side: centreOf(b)[2] < 0 ? -1 : 1 };
});
if (doorGroups[0].side === doorGroups[1].side) throw new Error('prepare-delorean: both doors on the same side');
const hingeX = doorGroups.reduce((t, d) => t + centreOf(d.b)[0], 0) / 2;
const hingeY = Math.max(...doorGroups.map(d => d.b.max[1]));
const hingeZ = doorGroups.reduce((t, d) => t + Math.abs(d.side < 0 ? d.b.max[2] : d.b.min[2]), 0) / 2;
const doors = {};
for (const d of doorGroups) {
  const at = [hingeX, hingeY, d.side * hingeZ];
  for (const p of d.prims) mapAttribute(p, 'POSITION', ([x, y, z]) => [x - at[0], y - at[1], z - at[2]]);
  for (const a of all) if (a.group === d.group) a.group = null;
  doors[`door_${d.side < 0 ? 'L' : 'R'}`] = { at, prims: d.prims };
  console.log(`door_${d.side < 0 ? 'L' : 'R'}`, 'hinge', r3(at), 'panel reach', r3([d.b.min[0] - at[0], d.b.min[1] - at[1], (d.side < 0 ? d.b.min[2] : d.b.max[2]) - at[2]]));
}

// 6. materials by role
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough).setDoubleSided(true);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
for (const { prim, role } of all) prim.setMaterial(mats[role]);

// 7. the scene: the body, the four wheels and the two doors
const scene = doc.createScene('gullwing');
const top = doc.createNode('gullwing'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
const moved = new Set([...Object.values(wheels), ...Object.values(doors)].flatMap(part => part.prims));
for (const { prim } of all) if (!moved.has(prim) && prim.getIndices().getCount() > 0) bodyMesh.addPrimitive(prim);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const [name, { at, prims }] of [...Object.entries(wheels), ...Object.entries(doors)]) {
  const mesh = doc.createMesh(name);
  for (const p of prims) if (p.getIndices().getCount() > 0) mesh.addPrimitive(p);
  top.addChild(doc.createNode(name).setTranslation(at).setMesh(mesh));
}

const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);
await doc.transform(weld());

// 8. normals: smooth across edges flatter than the crease angle
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await doc.transform(weld(), prune());

// 9. the game swaps its own brushed steel (carMats.steel, index.html) in over the Steel material at build, and that one carries the
//    grain map. Those faces get the uv the procedural car's ExtrudeGeometry has — x and y in car metres, so the brush lines repeat
//    per metre; the node's translation is added back, or the doors' grain would not line up with the body's.
for (const n of top.listChildren()) for (const p of n.getMesh().listPrimitives()) {
  if (p.getMaterial().getName() !== 'Steel') continue;
  const pos = p.getAttribute('POSITION'), [ox, oy] = n.getTranslation(), uv = new Float32Array(pos.getCount() * 2), v = [];
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); uv.set([v[0] + ox, v[1] + oy], i * 2); }
  p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(root.listBuffers()[0]));
}

for (const e of root.listExtensionsUsed()) e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'DeLorean DMC 12 (Animated) (modified)', author: 'JEX-D (https://sketchfab.com/JEX-D)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/delorean-dmc-12-animated-e90955c1dce945dfbcac09886b9f310e' };
await io.write(output, doc);
const bodyB = boundsOf(root.listMeshes().find(m => m.getName() === 'body').listPrimitives());
console.log('wrote', output, 'triangles', docTris(doc), 'materials', root.listMaterials().map(m => m.getName()).join(','), 'meshes', root.listMeshes().map(m => m.getName()).join(','));
console.log('body bounds', r3(bodyB.min), r3(bodyB.max));

// ---------- helpers ----------
function r3(v) { return v.map(x => +x.toFixed(3)); }
function r5(v) { return v.map(x => +x.toFixed(5)); }
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function primTris(p) { return (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
function docTris(d) { return d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + primTris(p), 0); }

// indexed vertices only: after splitFaces two primitives share one vertex buffer. matrix: an optional 4x4 applied to each vertex
function boundsOf(prims, matrix = null) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    const a = p.getAttribute('POSITION'), idx = p.getIndices()?.getArray() ?? Array.from({ length: a.getCount() }, (_, i) => i), v = [];
    for (const i of idx) {
      a.getElement(i, v);
      const w = matrix ? [0, 1, 2].map(r => matrix[r] * v[0] + matrix[4 + r] * v[1] + matrix[8 + r] * v[2] + matrix[12 + r]) : v;
      for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], w[j]); max[j] = Math.max(max[j], w[j]); }
    }
  }
  return { min, max };
}

// the accessor is detached first so a shared one is mapped once
function mapAttribute(prim, sem, fn) {
  const a = prim.getAttribute(sem); if (!a) return;
  const c = a.clone(); prim.setAttribute(sem, c);
  const v = []; for (let i = 0; i < c.getCount(); i++) c.setElement(i, fn(c.getElement(i, v)));
}

// moves the faces whose centre passes the test out of the primitive into a new one that it returns; null if none do
function splitFaces(prim, test) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), keep = [], cut = [], v = [];
  for (let t = 0; t < idx.length; t += 3) {
    const c = [0, 0, 0];
    for (let j = 0; j < 3; j++) { pos.getElement(idx[t + j], v); for (let a = 0; a < 3; a++) c[a] += v[a] / 3; }
    (test(c) ? cut : keep).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (!cut.length) return null;
  const piece = prim.clone();
  prim.setIndices(prim.getIndices().clone().setArray(new Uint32Array(keep)));
  piece.setIndices(piece.getIndices().clone().setArray(new Uint32Array(cut)));
  return piece;
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
