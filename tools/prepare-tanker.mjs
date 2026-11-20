// prepare-tanker.mjs — builds assets/tanker.glb from the cab of the Sketchfab "MAN TGX 2010 V8 – High-Detail Semi-Truck"
// (DevPoly3D, CC BY 4.0, https://sketchfab.com/3d-models/man-tgx-2010-v8-high-detail-semi-truck-34ce748d9a4b4de7b035cfe5cb97f5d1).
// In the game: the Rhy Tanker (#1103), a Swiss heating-oil delivery truck -- a three-axle rigid truck with a white tank, pulling a
// two-axle drawbar tank trailer in the same livery. Only the cab and the wheels come from the source; the tractor's short frame,
// fifth wheel, fuel tanks, rear mudguards and rear lamps are cut away and the chassis, the third axle, the tanks with their
// walkways and ladders, the lockers, the hazard signs and the whole trailer are generated here.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-tanker.mjs <scratch>/hprep/ && cd <scratch>/hprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-tanker.mjs <original.glb> <out.glb>
// The original is 7.4 MB, about 38k triangles, an FBX export: the front towards +z, its left side on +x, 1 unit = 15 cm (the
// rear tyre is 7.09 units); 15 flat-colour materials plus textured rims, hubs and tyres. Its parts are unnamed nodes
// ("<uuid>.0NN_<material>_0"), so they go by part index and material. Unbranded: the "MAN" lettering, lion and "V8" badge on
// the grille are one part (.002), the number plate's lettering two primitives of the main part, the rear "MAN" lettering sits
// on the rear mudguard inside the main body primitive (cut away with everything behind the cab wall), and the tyre sidewall
// texture reads "YOKOHAMA 104ZR" -- no texture is kept at all. The blue paint becomes green. Three wheel nodes: Object_3 holds
// both rear wheels (twin tyres, unsteered) and is split by side for the tandem; Object_3.001 / .002 are the front wheels, each
// steered 45 degrees about its node (the rear axle's rotation puts them straight), single tyres, reused for the trailer.
// Simplified to the triangle budget; normals rebuilt, smooth below a crease angle.
//
// Output contract (tools/prepare-mixer.mjs's, plus the trailer):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin between the front axle and the tandem's centre, no node
//   transform left except the wheels' and the trailer's
//   node "tanker"                          the scene root; extras { hitch, trailerLength, length } (metres: the hitch behind
//                                          the origin, hitch -> midpoint of the trailer axles, overall length truck + trailer)
//     node "body"                          the cab, chassis, tank -- everything rigid on the truck
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR" "wheel_RL2" "wheel_RR2"
//                                          left (-z) / right (+z); translation = the axle centre of that wheel (or twin), vertices centred on it
//     node "trailer"                       translation = the hitch point on the truck (-hitch, 0, 0); its local +x forward
//       node "trailer_body"                the drawbar, frame, tank and everything rigid on the trailer
//       node "trailer_wheel_L1" "trailer_wheel_R1" "trailer_wheel_L2" "trailer_wheel_R2"
//                                          translation = the axle centre in the trailer's frame, vertices centred on it
//   materials: one per role in ROLES, all double-sided as in the original, no textures; Glass { extras: { glass: true } },
//   LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } } (the trailer's tail lamps too)
//   extensions: EXT_meshopt_compression only.
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplifyPrimitive, joinPrimitives, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const TYRE_D = 1.07;   // a 12 R 22.5 truck tyre; scales the model (2.54 m wide cab, 3.9 m high)
const TARGET_TRIS = { min: 34000, max: 44000, aim: 40000 }, MAX_TRIES = 6;
const CREASE = Math.cos(40 * Math.PI / 180);   // faces meeting at a sharper angle keep a hard edge
// the layout in metres: the front axle ahead of the origin, the tandem behind it, the hitch at the rear crossmember
const FRONT_AXLE = 3.04, TANDEM = [-2.36, -3.71], HITCH = 5.2, TRAILER_AXLES = [-1.6, -6.1];
const Z_CUT = 3.5;   // source units: everything behind the cab's rear wall (the frame, fuel tanks, mudguards, rear lamps) goes
const UUID = 'd75ac7d3-ea99-4386-8004-2b8b4d77a8ed';
// whole parts dropped: the frame with the fifth wheel, the side rail, the grille lettering/lion/V8 badge, the rear lamp bar
const DROP_PARTS = new Set(['cab.015', 'cab.016', 'cab.002', 'Cube']);
const DROP_PRIMS = new Set(['cab/Metalic', 'cab/Material']);   // the number plate's lettering
const WHEEL_PARTS = { Object_3: 'twin', 'Object_3.001': 'frontL', 'Object_3.002': 'frontR' };
// by original material name; the blue paint ("Grey") becomes the green Cab, the window backing ("Material") stays gloss black
const MATERIAL_ROLES = {
  dark: 'Black', Darker_Most: 'Black', Material: 'Gloss', Grey: 'Cab', Back_Trailor: 'Chrome', White_Light: 'LampHead',
  Yellow_Loght_Black: 'Amber', Glass: 'Glass', Rims: 'Chrome', Hubs: 'Grey', Tyre_sidewalls: 'Rubber', Tyre_tread: 'Rubber',
  [`${UUID}.005__0`]: 'Grey',   // the dashboard
};
// colours are linear factors; nothing fully metallic, so the truck still reads where the style has no sky map
const ROLES = {
  Cab: { base: [0.0137, 0.147, 0.042, 1], metal: 0.2, rough: 0.45 },   // ≈ #1f6b3a, the cab, chassis and trailer frame
  Tank: { base: [0.78, 0.78, 0.76, 1], metal: 0.1, rough: 0.4 },
  Stripe: { base: [0.8, 0.07, 0.012, 1], metal: 0.1, rough: 0.45 },   // orange-red
  Orange: { base: [1, 0.26, 0, 1], metal: 0, rough: 0.6 },   // the blank ADR plates
  Red: { base: [0.55, 0.02, 0.02, 1], metal: 0, rough: 0.6 },   // the flammable-liquid diamond
  Black: { base: [0.015, 0.015, 0.015, 1], metal: 0.1, rough: 0.7 },
  Gloss: { base: [0.01, 0.01, 0.012, 1], metal: 0.2, rough: 0.15 },
  Grey: { base: [0.22, 0.22, 0.22, 1], metal: 0.3, rough: 0.6 },
  Chrome: { base: [0.55, 0.55, 0.56, 1], metal: 0.5, rough: 0.3 },
  Rubber: { base: [0.02, 0.02, 0.02, 1], metal: 0, rough: 0.9 },
  Amber: { base: [0.8, 0.3, 0.02, 1], metal: 0, rough: 0.2 },
  Glass: { base: [0.05, 0.07, 0.09, 0.35], metal: 0, rough: 0.05, alpha: true, extras: { glass: true } },
  // the compact's lamp colours (carMats.lampHead / lampTail) as linear factors, as in prepare-hatchback.mjs
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
};
// the tank section shared by truck and trailer: an ellipse 2.5 m wide and 1.9 m high, its centre 2.25 m up, domed ends
const TANK = { cy: 2.25, a: 1.25, b: 0.95, dome: 0.25 };

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-tanker.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const src = await io.read(input);

// 1. the source's parts as plain triangle soups in world units: { part, role, pos: [[x,y,z]...], tris: [[a,b,c]...] }
const byName = (n) => src.getRoot().listNodes().find(x => x.getName() === n);
for (const n of ['Object_3.001', 'Object_3.002']) byName(n).setRotation(byName('Object_3').getRotation());   // straight ahead
const parts = [];
for (const n of src.getRoot().listNodes()) {
  if (!n.getMesh()) continue;
  const part = n.getParentNode().getName().replace(UUID, 'cab'), m = n.getWorldMatrix();
  if (DROP_PARTS.has(part)) continue;
  for (const p of n.getMesh().listPrimitives()) {
    const material = p.getMaterial()?.getName() ?? '';
    if (DROP_PRIMS.has(`${part}/${material}`)) continue;
    const role = MATERIAL_ROLES[material];
    if (!role) throw new Error(`prepare-tanker: part ${part} (material "${material}") has no role`);
    const a = p.getAttribute('POSITION'), pos = [], v = [];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); pos.push([0, 1, 2].map(r => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r])); }
    const idx = p.getIndices() ? p.getIndices().getArray() : Uint32Array.from({ length: a.getCount() }, (_, i) => i), tris = [];
    for (let i = 0; i < idx.length; i += 3) tris.push([idx[i], idx[i + 1], idx[i + 2]]);
    const soup = { part, role, pos, tris, wheel: WHEEL_PARTS[part] ?? null };
    if (!soup.wheel) soup.tris = tris.filter(t => centroid(pos, t)[2] >= Z_CUT);
    parts.push(soup);
  }
}
for (const w of Object.keys(WHEEL_PARTS)) if (!parts.some(p => p.part === w)) throw new Error(`prepare-tanker: wheel part ${w} is missing`);

// 2. the frame from the rear tyre: metres, +x forward (old +z), +y up, +z right (old -x); the front axle lands on FRONT_AXLE
const tyre = (wheel) => parts.filter(p => p.wheel === wheel && p.role === 'Rubber');
const tb = boundsOf(tyre('twin')), fb = boundsOf(tyre('frontL'));
const k = TYRE_D / (tb.max[1] - tb.min[1]), y0 = tb.min[1], cx = (tb.min[0] + tb.max[0]) / 2, cz = (fb.min[2] + fb.max[2]) / 2 - FRONT_AXLE / k;
for (const p of parts) p.pos = p.pos.map(([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)]);
console.log('scale', +k.toFixed(5), 'front tyre d', +((fb.max[1] - fb.min[1]) * k).toFixed(3), 'rear tyre d', +((tb.max[1] - tb.min[1]) * k).toFixed(3));

// 3. wheels: the twin is split by side, every wheel's vertices centred on its tyre's centre; the node carries the axle centre
const halves = (soups, side) => soups.map(s => ({ ...s, tris: s.tris.filter(t => Math.sign(centroid(s.pos, t)[2]) === side) }));
const wheelMesh = (soups) => { const b = boundsOf(soups.filter(s => s.role === 'Rubber')), c = centreOf(b); return { soups: soups.map(s => ({ ...s, pos: s.pos.map(p => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]) })), r: (b.max[1] - b.min[1]) / 2, track: Math.abs(c[2]) }; };
const twinL = wheelMesh(halves(parts.filter(p => p.wheel === 'twin'), -1)), twinR = wheelMesh(halves(parts.filter(p => p.wheel === 'twin'), 1));
const singleL = wheelMesh(parts.filter(p => p.wheel === 'frontL')), singleR = wheelMesh(parts.filter(p => p.wheel === 'frontR'));
if (centreOf(boundsOf(tyre('frontL')))[2] >= 0) throw new Error('prepare-tanker: Object_3.001 is not the left front wheel');
const truckWheels = [
  ['wheel_FL', singleL, [FRONT_AXLE, singleL.r, -singleL.track]], ['wheel_FR', singleR, [FRONT_AXLE, singleR.r, singleR.track]],
  ['wheel_RL', twinL, [TANDEM[0], twinL.r, -twinL.track]], ['wheel_RR', twinR, [TANDEM[0], twinR.r, twinR.track]],
  ['wheel_RL2', twinL, [TANDEM[1], twinL.r, -twinL.track]], ['wheel_RR2', twinR, [TANDEM[1], twinR.r, twinR.track]],
];
const trailerWheels = [
  ['trailer_wheel_L1', singleL, [TRAILER_AXLES[0], singleL.r, -singleL.track]], ['trailer_wheel_R1', singleR, [TRAILER_AXLES[0], singleR.r, singleR.track]],
  ['trailer_wheel_L2', singleL, [TRAILER_AXLES[1], singleL.r, -singleL.track]], ['trailer_wheel_R2', singleR, [TRAILER_AXLES[1], singleR.r, singleR.track]],
];

// 4. the generated parts: the truck's chassis, tank and fittings on the body; the trailer in its own frame (origin = the hitch)
const body = parts.filter(p => !p.wheel), trailerBody = [];
const cab = boundsOf(body), xFront = cab.max[0];
const bumperX = Math.max(...body.flatMap(s => s.pos.filter(p => p[1] > 0.4 && p[1] < 0.8 && Math.abs(p[2]) < 0.3).map(p => p[0])));
console.log('cab bounds', r3(cab.min), r3(cab.max), 'front bumper x', +bumperX.toFixed(3));
truckParts(body);
trailerParts(trailerBody);
const trailerMin = Math.min(...trailerBody.flatMap(s => s.pos.map(p => p[0])));
const extras = { hitch: HITCH, trailerLength: +(-(TRAILER_AXLES[0] + TRAILER_AXLES[1]) / 2).toFixed(3), length: +(xFront + HITCH - trailerMin).toFixed(3) };
console.log('extras', extras);

// 5. a fresh document: one primitive per role in each mesh, the wheel meshes shared by the nodes that use them
const doc = new Document(), root = doc.getRoot(), buffer = doc.createBuffer();
const mats = {};
for (const [name, r] of Object.entries(ROLES)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough).setDoubleSided(true);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  mats[name] = m;
}
const scene = doc.createScene('Scene'), top = doc.createNode('tanker').setExtras(extras); scene.addChild(top);   // not 'tanker': three.js would rename the node 'tanker_1'
top.addChild(doc.createNode('body').setMesh(meshOf('body', body)));
const wheelMeshes = new Map([[twinL, 'wheel_twin_L'], [twinR, 'wheel_twin_R'], [singleL, 'wheel_single_L'], [singleR, 'wheel_single_R']].map(([w, name]) => [w, meshOf(name, w.soups)]));
const wheelNode = (name, w, at) => doc.createNode(name).setMesh(wheelMeshes.get(w)).setTranslation(at);
for (const [name, w, at] of truckWheels) { top.addChild(wheelNode(name, w, at)); console.log(name, 'at', r3(at), 'r', +w.r.toFixed(3)); }
const trailer = doc.createNode('trailer').setTranslation([-HITCH, 0, 0]); top.addChild(trailer);
trailer.addChild(doc.createNode('trailer_body').setMesh(meshOf('trailer_body', trailerBody)));
for (const [name, w, at] of trailerWheels) { trailer.addChild(wheelNode(name, w, at)); console.log(name, 'at', r3(at), 'r', +w.r.toFixed(3)); }
root.setDefaultScene(scene);
await doc.transform(dedup(), prune(), weld());
console.log('before simplify', docTris(doc), 'triangles');

// 6. simplify the source's primitives to the triangle budget (the generated ones are already minimal, and the simplifier
//    would smear their thin plates), join by material, then normals: smooth across edges flatter than the crease angle
const out = await simplifyTo(doc);
joinByMaterial(out);
for (const m of out.getRoot().listMeshes()) for (const p of m.listPrimitives()) creaseNormals(p);
await out.transform(weld(), prune());
for (const e of out.getRoot().listExtensionsUsed()) e.dispose();
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
out.getRoot().getAsset().extras = { title: 'MAN TGX 2010 V8 – High-Detail Semi-Truck (modified: cab and wheels only, tanker and trailer added)', author: 'DevPoly3D (https://sketchfab.com/DevPoly3D)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/man-tgx-2010-v8-high-detail-semi-truck-34ce748d9a4b4de7b035cfe5cb97f5d1' };
await io.write(output, out);
console.log('wrote', output, 'triangles', docTris(out), 'materials', out.getRoot().listMaterials().length, 'overall length', extras.length);

// ---------- the truck's generated parts (metres, the truck frame) ----------
function truckParts(list) {
  const add = (role, g) => list.push({ part: 'generated', role, ...g });
  chassis(add, 2.6, -5.0, [2.0, 0.6, -1.0, -2.0, -4.3]);
  tankWithFittings(add, 1.75, -4.65, [0.9, -0.6, -2.1, -3.6], [-0.3, -3.0]);
  lockers(add, 1.5, -1.0);
  for (const s of [1, -1]) add('Black', box(-4.45, -1.6, 1.05, 1.22, s * 0.6, s * 1.3));   // the tandem's mudguards
  rearEnd(add, -5.0);
  add('Black', box(-5.3, -4.9, 0.62, 0.9, -0.12, 0.12));   // the drawbar coupling; the pin at x = -HITCH
  add('Black', box(-5.36, -5.3, 0.55, 0.97, -0.09, 0.09));
  adrPlate(add, bumperX + 0.012, 0.57, 0, 1);
}

// ---------- the trailer's generated parts (metres, the trailer frame: origin at the hitch) ----------
function trailerParts(list) {
  const add = (role, g) => list.push({ part: 'generated', role, ...g });
  add('Black', cylinder('y', [0, 0.76, 0], 0.08, 0.05, 12));   // the drawbar eye
  add('Black', box(-0.6, 0, 0.72, 0.8, -0.06, 0.06));
  for (const s of [1, -1]) add('Cab', beam([-0.5, 0.76, 0], [-1.55, 0.76, s * 0.45], 0.08, 0.1));   // the A-frame
  add('Cab', box(-1.6, -1.5, 0.7, 0.82, -0.5, 0.5));
  add('Black', cylinder('y', [TRAILER_AXLES[0], 0.7, 0], 0.6, 0.08, 24));   // the turntable
  chassis(add, -1.5, -8.4, [-1.6, -3.0, -4.6, -6.1, -7.6, -8.3]);
  tankWithFittings(add, -1.05, -8.15, [-2.2, -3.7, -5.3, -6.8], [-2.8, -6.3]);
  lockers(add, -3.0, -5.2);
  for (const ax of TRAILER_AXLES) for (const s of [1, -1]) add('Black', box(ax - 0.75, ax + 0.75, 1.05, 1.2, s * 0.82, s * 1.32));
  rearEnd(add, -8.35);
}

// two rails with crossmembers, in the chassis green
function chassis(add, x0, x1, crossAt) {
  for (const s of [1, -1]) add('Cab', box(x0, x1, 0.75, 1.0, s * 0.42, s * 0.5));
  for (const x of crossAt) add('Cab', box(x - 0.05, x + 0.05, 0.78, 0.97, -0.42, 0.42));
}

// the white tank from x0 (front apex) to x1 (rear apex) with its stripe, saddles, walkway, rails and manlids
function tankWithFittings(add, x0, x1, saddlesAt, lidsAt) {
  const { cy, a, b, dome } = TANK, s0 = x0 - dome, s1 = x1 + dome;   // the straight section
  add('Tank', tank(s0, s1, cy, a, b, dome, 36, 5));
  add('Stripe', band(s0 - 0.05, s1 + 0.05, cy, a * 1.012, b * 1.012, 0.22, 36));
  for (const x of saddlesAt) add('Black', box(x - 0.15, x + 0.15, 1.0, 1.65, -0.85, 0.85));
  add('Grey', box(s0 - 0.1, s1 + 0.1, 3.17, 3.22, -0.3, 0.3));   // the walkway
  const yRail = cy + b * Math.sqrt(1 - (0.45 / a) ** 2) - 0.03;
  for (let x = s0 - 0.18; x > s1 + 0.1; x -= 1.2) for (const s of [1, -1]) add('Chrome', box(x - 0.02, x + 0.02, yRail, 3.6, s * 0.43, s * 0.47));
  for (const s of [1, -1]) add('Chrome', box(s0 - 0.16, s1 + 0.08, 3.57, 3.61, s * 0.43, s * 0.47));
  for (const x of lidsAt) add('Tank', cylinder('y', [x, 3.27, 0], 0.28, 0.14, 20));
}

// a hose locker under the tank on each side
function lockers(add, x0, x1) { for (const s of [1, -1]) add('Grey', box(x0, x1, 0.45, 1.3, s * 0.55, s * 1.22)); }

// the rear bumper with tail lamps, the hose cabinet with the two hazard diamonds, the ladder on the right, the ADR plate on the left
function rearEnd(add, xBack) {
  add('Black', box(xBack - 0.1, xBack + 0.05, 0.45, 0.7, -1.25, 1.25));
  for (const s of [1, -1]) {
    add('Black', box(xBack - 0.08, xBack + 0.02, 0.55, 0.8, s * 0.38, s * 0.5));   // the brackets to the frame rails
    add('LampTail', plateX(xBack - 0.105, [[0.5, s * 0.82], [0.5, s * 1.05], [0.68, s * 1.05], [0.68, s * 0.82]], -1));
    add('Amber', plateX(xBack - 0.105, [[0.5, s * 0.62], [0.5, s * 0.8], [0.68, s * 0.8], [0.68, s * 0.62]], -1));
  }
  add('Grey', box(xBack, xBack + 0.3, 1.05, 2.3, -1.15, 1.15));
  diamond(add, xBack - 0.005, 1.75, -0.8, 'Red');
  diamond(add, xBack - 0.005, 1.75, -0.42, 'Tank');
  for (const z of [0.74, 1.02]) add('Chrome', box(xBack - 0.07, xBack - 0.03, 1.1, 3.3, z, z + 0.04));
  for (let y = 1.3; y <= 3.15; y += 0.3) add('Chrome', box(xBack - 0.065, xBack - 0.035, y - 0.015, y + 0.015, 0.76, 1.04));
  adrPlate(add, xBack - 0.112, 0.61, -0.55, -1);
}

// a blank orange ADR plate (40 x 30 cm) with a black rim, facing dir (+1 forward, -1 backward)
function adrPlate(add, x, y, z, dir) {
  add('Black', plateX(x - dir * 0.004, [[y - 0.17, z - 0.22], [y - 0.17, z + 0.22], [y + 0.17, z + 0.22], [y + 0.17, z - 0.22]], dir));
  add('Orange', plateX(x, [[y - 0.15, z - 0.2], [y - 0.15, z + 0.2], [y + 0.15, z + 0.2], [y + 0.15, z - 0.2]], dir));
}

// a hazard diamond (25 cm) with a black rim on a rear face
function diamond(add, x, y, z, role) {
  const pts = (s) => [[y + s, z], [y, z + s], [y - s, z], [y, z - s]];
  add('Black', plateX(x + 0.002, pts(0.14), -1));
  add(role, plateX(x, pts(0.125), -1));
}

// ---------- geometry generators: { pos, tris } with outward winding ----------
function box(x0, x1, y0, y1, z0, z1) {
  const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)], [ya, yb] = [Math.min(y0, y1), Math.max(y0, y1)], [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
  const pos = [[xa, ya, za], [xb, ya, za], [xb, yb, za], [xa, yb, za], [xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb]];
  const tris = [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 2, 6], [1, 6, 5]];
  return outward({ pos, tris }, [(xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2]);
}

// a box of cross-section w (horizontal) x h along the segment p0 -> p1
function beam(p0, p1, w, h) {
  const d = unit([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]), side = unit(cross(d, [0, 1, 0])), up = cross(side, d);
  const corner = (p, s, u) => [0, 1, 2].map(i => p[i] + side[i] * s * w / 2 + up[i] * u * h / 2);
  const pos = [corner(p0, -1, -1), corner(p0, 1, -1), corner(p0, 1, 1), corner(p0, -1, 1), corner(p1, -1, -1), corner(p1, 1, -1), corner(p1, 1, 1), corner(p1, -1, 1)];
  const tris = [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 2, 6], [1, 6, 5]];
  return outward({ pos, tris }, [0, 1, 2].map(i => (p0[i] + p1[i]) / 2));
}

// a closed cylinder of radius r and length len about an axis through c
function cylinder(axis, c, r, len, n) {
  const ax = { x: 0, y: 1, z: 2 }[axis], u = (ax + 1) % 3, v = (ax + 2) % 3, pos = [], tris = [];
  for (const end of [-1, 1]) for (let i = 0; i < n; i++) { const p = [...c]; p[ax] += end * len / 2; p[u] += r * Math.cos(i / n * 2 * Math.PI); p[v] += r * Math.sin(i / n * 2 * Math.PI); pos.push(p); }
  for (const end of [-1, 1]) { const p = [...c]; p[ax] += end * len / 2; pos.push(p); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tris.push([i, j, n + j], [i, n + j, n + i], [2 * n, j, i], [2 * n + 1, n + i, n + j]); }
  return outward({ pos, tris }, c);
}

// an elliptic cylinder along x from x0 to x1 (semi-axes a across, b up, centre height cy) with half-ellipsoid domes of depth `dome`
function tank(x0, x1, cy, a, b, dome, n, rings) {
  const pos = [], tris = [], ring = (x, s) => { const base = pos.length; for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI; pos.push([x, cy + b * s * Math.sin(t), a * s * Math.cos(t)]); } return base; };
  const join = (r0, r1) => { for (let i = 0; i < n; i++) { const j = (i + 1) % n; tris.push([r0 + i, r0 + j, r1 + j], [r0 + i, r1 + j, r1 + i]); } };
  const fan = (r0, apex) => { for (let i = 0; i < n; i++) tris.push([r0 + i, r0 + (i + 1) % n, apex]); };
  const rows = [];
  for (let j = rings - 1; j >= 1; j--) { const phi = j / rings * Math.PI / 2; rows.push(ring(x0 + dome * Math.sin(phi), Math.cos(phi))); }
  rows.push(ring(x0, 1), ring(x1, 1));
  for (let j = 1; j < rings; j++) { const phi = j / rings * Math.PI / 2; rows.push(ring(x1 - dome * Math.sin(phi), Math.cos(phi))); }
  for (let i = 0; i + 1 < rows.length; i++) join(rows[i], rows[i + 1]);
  pos.push([x0 + dome, cy, 0]); fan(rows[0], pos.length - 1);
  pos.push([x1 - dome, cy, 0]); fan(rows[rows.length - 1], pos.length - 1);
  return outwardFromAxis({ pos, tris }, cy);
}

// the stripe: a strip of the ellipse's surface on each side, |angle from the horizontal| <= half, from x0 to x1
function band(x0, x1, cy, a, b, half, n) {
  const pos = [], tris = [], m = Math.max(4, Math.round(n * half / Math.PI));
  for (const side of [1, -1]) {
    const base = pos.length;
    for (let i = 0; i <= m; i++) { const t = -half + 2 * half * i / m; pos.push([x0, cy + b * Math.sin(t), side * a * Math.cos(t)], [x1, cy + b * Math.sin(t), side * a * Math.cos(t)]); }
    for (let i = 0; i < m; i++) { const p = base + 2 * i; tris.push([p, p + 1, p + 3], [p, p + 3, p + 2]); }
  }
  return outwardFromAxis({ pos, tris }, cy);
}

// a flat polygon in the plane x = const, points as [y, z], facing dir along x
function plateX(x, pts, dir) {
  const pos = pts.map(([y, z]) => [x, y, z]), tris = [];
  for (let i = 1; i + 1 < pts.length; i++) tris.push([0, i, i + 1]);
  for (const t of tris) if (faceNormal(pos[t[0]], pos[t[1]], pos[t[2]])[0] * dir < 0) t.reverse();
  return { pos, tris };
}

function outward(g, c) { for (const t of g.tris) { const n = faceNormal(g.pos[t[0]], g.pos[t[1]], g.pos[t[2]]), m = centroid(g.pos, t); if (n[0] * (m[0] - c[0]) + n[1] * (m[1] - c[1]) + n[2] * (m[2] - c[2]) < 0) t.reverse(); } return g; }
function outwardFromAxis(g, cy) { for (const t of g.tris) { const n = faceNormal(g.pos[t[0]], g.pos[t[1]], g.pos[t[2]]), m = centroid(g.pos, t); if (n[1] * (m[1] - cy) + n[2] * m[2] < 0) t.reverse(); } return g; }

// ---------- document building ----------
// one mesh from a list of soups, one primitive per role -- the generated parts in their own, marked { generated: true } until
// simplification has run (joinByMaterial merges them afterwards); the wheels' meshes are shared by their nodes
function meshOf(name, soups) {
  const mesh = doc.createMesh(name), groups = new Map();
  for (const s of soups) { const key = `${s.role}/${s.part === 'generated'}`; groups.set(key, [...(groups.get(key) ?? []), s]); }
  for (const [key, list] of groups) {
    const [role, generated] = key.split('/'), pos = [], idx = [];
    for (const s of list) { const base = pos.length / 3; for (const p of s.pos) pos.push(...p); for (const t of s.tris) idx.push(base + t[0], base + t[1], base + t[2]); }
    if (!idx.length) continue;
    const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer);
    const indices = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices).setMaterial(mats[role]);
    if (generated === 'true') prim.setExtras({ generated: true });
    mesh.addPrimitive(prim);
  }
  return mesh;
}

function joinByMaterial(d) {
  for (const m of d.getRoot().listMeshes()) {
    const groups = new Map();
    for (const p of m.listPrimitives()) { p.setExtras({}); groups.set(p.getMaterial(), [...(groups.get(p.getMaterial()) ?? []), p]); }
    for (const prims of groups.values()) {
      if (prims.length < 2) continue;
      const joined = joinPrimitives(prims);
      for (const p of prims) { m.removePrimitive(p); p.dispose(); }
      m.addPrimitive(joined);
    }
  }
}

// ---------- helpers ----------
function r3(v) { return v.map(x => +x.toFixed(3)); }
function centroid(pos, t) { return [0, 1, 2].map(i => (pos[t[0]][i] + pos[t[1]][i] + pos[t[2]][i]) / 3); }
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function boundsOf(soups) {   // over the vertices the triangles use (cut parts keep unused vertices)
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const s of soups) for (const t of s.tris) for (const i of t) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], s.pos[i][j]); max[j] = Math.max(max[j], s.pos[i][j]); }
  return { min, max };
}
function primTris(p) { return (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
function docTris(d) { return d.getRoot().listNodes().filter(n => n.getMesh()).reduce((n, node) => n + node.getMesh().listPrimitives().reduce((s, p) => s + primTris(p), 0), 0); }

// the source's primitives only (not extras.generated); the ratio applies to them, the budget counts everything
async function simplifyTo(d) {
  const sourceTris = (x) => x.getRoot().listMeshes().flatMap(m => m.listPrimitives()).filter(p => !p.getExtras().generated).reduce((n, p) => n + primTris(p), 0);
  const fixed = docTris(d) - sourceTris(d);
  let ratio = (TARGET_TRIS.aim - fixed) / sourceTris(d), result = null;
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    const attempt = cloneDocument(d);
    for (const m of attempt.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
      if (p.getExtras().generated) continue;
      const s = simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: false });
      if (s !== p) { m.removePrimitive(p); m.addPrimitive(s); }
    }
    const tris = docTris(attempt);
    console.log(`simplify try ${tries}: ratio ${ratio.toFixed(4)} -> ${tris} triangles`);
    result = attempt;
    if (tris >= TARGET_TRIS.min && tris <= TARGET_TRIS.max) return result;
    ratio = Math.min(1, ratio * (TARGET_TRIS.aim - fixed) / (tris - fixed));
  }
  throw new Error(`prepare-tanker: ${docTris(result)} triangles after ${MAX_TRIES} tries`);
}

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function unit(n) { const l = Math.hypot(...n) || 1; return n.map(v => v / l); }

// unwelds the primitive (three vertices per face) and gives each corner the area-weighted normal of the faces around its position
// that meet this face flatter than the crease angle; weld() later merges the corners that ended up equal.
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
