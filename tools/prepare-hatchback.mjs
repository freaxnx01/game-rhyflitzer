// prepare-hatchback.mjs — builds assets/hatchback.glb from the Sketchfab "2020 Mazda 3 Hatchback" (OUTPISTON,
// CC BY-NC-SA 4.0, https://skfb.ly/pAOpM). Issue #236; pipeline notes in docs/ai-notes/2026-10-22-vehicle-style-test.md.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/hbprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   cp tools/prepare-hatchback.mjs <scratch>/hbprep/ && cd <scratch>/hbprep
//   node prepare-hatchback.mjs <original.glb> <out.glb> [--list] [--interior-shell] [--ratio 0.031] [--error 0.03]
//     --list            print the original's materials, meshes and bounds, then exit (to fill MATERIAL_MAP)
//     --interior-shell  replace the original seats and dash by one dark box 4 cm inside the glass bounds
//     --ratio / --error meshopt simplify start values; the ratio is re-tuned until the result has TARGET_TRIS triangles
// Memory-heavy (the original is 17 MB / 473k triangles): run under systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0.
//
// Output contract (what index.html and tests/hatchback_asset.test.mjs rely on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, footprint centred, length 4.46 m, no node transform left except the wheels'
//   node "hatchback"                       the scene root
//     node "body"                          everything that does not turn; one mesh, one primitive per material
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the wheel centre, vertices centred on it
//   materials (exactly these eight roles, no textures):
//     Paint     { extras: { paint: true } }  white base so the paint swatch is the colour; metalness 0.25, roughness 0.35
//     Glass     { extras: { glass: true } }  alpha-blended, low opacity, no KHR_materials_transmission
//     Trim                                   grey plastic where the original has chrome, black chrome, grille, mirrors, lugnuts
//     LampHead  { extras: { lamp: 'head' } } opaque lens, warm white emissive (the game drives emissiveIntensity)
//     LampTail  { extras: { lamp: 'tail' } } opaque lens, red emissive
//     Tyre, Rim, Interior                    plain colours
//   extensions: EXT_meshopt_compression only.
import { readFileSync } from 'node:fs';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, transformPrimitive, joinPrimitives, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const LENGTH_M = 4.46;
const TARGET_TRIS = { min: 20000, max: 24000, aim: 21500 };
const MAX_TRIES = 6;
const GRID_M = 0.0005;                 // positions are snapped to half a millimetre after simplifying: compresses better, invisible
const SHELL_INSET_M = 0.04;
const PREFIX = '2020_Mazda_3_Hatchback_';

// original material name (without the prefix) -> role. An unmapped name throws, so a different export cannot slip through.
const MATERIAL_MAP = {
  Machine_Gray_Metallic: 'Paint',
  Windows: 'Glass',
  ChromeTrims: 'Trim', BlackChrome: 'Trim', WindowsTrims: 'Trim', Mirrors: 'Trim', Grille1: 'Trim', Grille2: 'Trim',
  Lugnuts: 'Trim', Calipers: 'Trim', Default_Material: 'Trim',
  HeadLightsGlass: 'LampHead', HeadLightsBase: 'LampHead', DRLs: 'LampHead',
  BrakeLightsGlass: 'LampTail', RedMain: 'LampTail', DarkRed: 'LampTail', Reflectors: 'LampTail',
  Tires: 'Tyre',
  Rims1: 'Rim', RimBadges: 'Rim', BrakeRotors1: 'Rim', BrakeRotors2: 'Rim',
  Interior: 'Interior', UnderCarrier: 'Interior', Black1: 'Interior',
};
// per-node overrides: the badges (#236 D1) and the one rear light strip the original files under "DRLs"
const NODE_ROLES = {
  Object_118: 'Trim', Object_114: 'Trim', Object_196: 'Trim', Object_224: 'Trim',   // front emblem: a plain dark plate in the grille
  Object_298: 'Paint', Object_260: 'Paint',                                         // rear emblem: body colour, flush
  Object_230: 'LampTail',
};
const LETTERING_NODES = ['Object_248', 'Object_292', 'Object_252'];                 // rear model lettering: deleted
const WHEEL_MATERIALS = ['Tires', 'Rims1', 'RimBadges', 'Lugnuts', 'BrakeRotors1', 'BrakeRotors2', 'Calipers'];
const TYRE_MATERIAL = 'Tires';
const ORIGINAL_INTERIOR = ['Interior'];                                             // what --interior-shell replaces

const ROLES = {
  Paint: { base: [1, 1, 1, 1], metal: 0.25, rough: 0.35, extras: { paint: true } },
  Glass: { base: [0.05, 0.07, 0.09, 0.28], metal: 0, rough: 0.05, alpha: 'BLEND', extras: { glass: true } },
  Trim: { base: [0.2, 0.2, 0.21, 1], metal: 0, rough: 0.65 },
  // the compact's lamp colours (carMats.lampHead / lampTail: 0xe8e8e8 + 0xfff6d0, 0xa01810 + 0xe0322d) as linear factors
  LampHead: { base: [0.807, 0.807, 0.807, 1], metal: 0, rough: 0.12, emissive: [1, 0.922, 0.631], extras: { lamp: 'head' } },
  LampTail: { base: [0.352, 0.009, 0.005, 1], metal: 0, rough: 0.15, emissive: [0.745, 0.032, 0.026], extras: { lamp: 'tail' } },
  Tyre: { base: [0.09, 0.09, 0.095, 1], metal: 0, rough: 0.9 },
  Rim: { base: [0.62, 0.62, 0.63, 1], metal: 0.6, rough: 0.5 },
  Interior: { base: [0.06, 0.06, 0.065, 1], metal: 0, rough: 0.85 },
};
const WHEEL_NAMES = { 'F-L': 'wheel_FL', 'F-R': 'wheel_FR', 'R-L': 'wheel_RL', 'R-R': 'wheel_RR' };

function parseArgs(argv) {
  const positional = [], flags = { list: false, interiorShell: false, ratio: 0.031, error: 0.03 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') flags.list = true;
    else if (a === '--interior-shell') flags.interiorShell = true;
    else if (a === '--ratio') flags.ratio = +argv[++i];
    else if (a === '--error') flags.error = +argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else positional.push(a);
  }
  if (positional.length < 1 || (!flags.list && positional.length < 2)) throw new Error('usage: prepare-hatchback.mjs <original.glb> <out.glb> [--list] [--interior-shell] [--ratio r] [--error e]');
  return { inFile: positional[0], outFile: positional[1], ...flags };
}

const shortName = (material) => (material?.getName() ?? '').replace(PREFIX, '');
const primTris = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
const meshTris = (m) => m.listPrimitives().reduce((n, p) => n + primTris(p), 0);
const docTris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + meshTris(m), 0);
const centreOf = (b) => b.min.map((v, i) => (v + b.max[i]) / 2);
const sizeOf = (b) => b.min.map((v, i) => b.max[i] - v);
const fmt = (v) => +v.toFixed(3);

function meshNodes(scene) {
  const nodes = [];
  scene.traverse(n => { if (n.getMesh()) nodes.push(n); });
  return nodes;
}

function listOriginal(doc, scene) {
  const b = getBounds(scene);
  console.log('bounds', b.min.map(fmt), b.max.map(fmt), 'size', sizeOf(b).map(fmt), 'triangles', docTris(doc));
  const byMaterial = new Map();
  for (const n of meshNodes(scene)) for (const p of n.getMesh().listPrimitives()) {
    const k = shortName(p.getMaterial()), e = byMaterial.get(k) ?? { prims: 0, tris: 0, nodes: [] };
    e.prims++; e.tris += primTris(p); e.nodes.push(n.getName()); byMaterial.set(k, e);
  }
  for (const [k, e] of [...byMaterial].sort()) console.log(k.padEnd(24), String(e.prims).padStart(3), 'prims', String(e.tris).padStart(7), 'tris', e.nodes.join(' '));
  console.log('textures', doc.getRoot().listTextures().length, 'materials', doc.getRoot().listMaterials().length, 'meshes', doc.getRoot().listMeshes().length);
}

function createRoleMaterials(doc) {
  const out = {};
  for (const [name, r] of Object.entries(ROLES)) {
    const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(r.metal).setRoughnessFactor(r.rough);
    if (r.alpha) m.setAlphaMode(r.alpha);
    if (r.emissive) m.setEmissiveFactor(r.emissive);
    if (r.extras) m.setExtras(r.extras);
    out[name] = m;
  }
  return out;
}

function roleOf(node, prim) {
  const name = shortName(prim.getMaterial());
  const role = NODE_ROLES[node.getName()] ?? MATERIAL_MAP[name];
  if (!role) throw new Error(`prepare-hatchback: material "${name}" (node ${node.getName()}) has no role in MATERIAL_MAP`);
  return role;
}

function deleteLettering(doc) {
  for (const n of doc.getRoot().listNodes()) {
    if (!LETTERING_NODES.includes(n.getName())) continue;
    n.getMesh()?.dispose(); n.dispose();
  }
}

// every primitive is tagged with its role and its source material before the materials are swapped (the wheel split needs the source)
function tagPrimitives(scene, roles) {
  const tags = new Map();
  for (const n of meshNodes(scene)) for (const p of n.getMesh().listPrimitives()) {
    tags.set(p, { role: roleOf(n, p), source: shortName(p.getMaterial()) });
    p.setMaterial(roles[tags.get(p).role]);
  }
  return tags;
}

// model units -> metres, the model's +z (front) -> +x, centred, wheels on y = 0; baked into the vertices
function bakeFrame(doc, scene) {
  const b0 = getBounds(scene), s = LENGTH_M / (b0.max[2] - b0.min[2]);
  const car = doc.createNode('frame').setScale([s, s, s]).setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  for (const c of scene.listChildren()) { scene.removeChild(c); car.addChild(c); }
  scene.addChild(car);
  const b = getBounds(scene);
  car.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  for (const n of meshNodes(scene)) {
    if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
    transformMesh(n.getMesh(), n.getWorldMatrix());
  }
}

const primBounds = (p) => {
  const a = p.getAttribute('POSITION');
  return { min: a.getMin([]), max: a.getMax([]) };
};
const quadrant = (c) => `${c[0] > 0 ? 'F' : 'R'}-${c[2] < 0 ? 'L' : 'R'}`;

// the four wheel centres come from the four tyre primitives, one per quadrant
function wheelCentres(tags) {
  const tyres = [...tags].filter(([, t]) => t.source === TYRE_MATERIAL).map(([p]) => centreOf(primBounds(p)));
  const centres = {};
  for (const c of tyres) {
    const q = quadrant(c);
    if (centres[q]) throw new Error(`prepare-hatchback: two ${TYRE_MATERIAL} primitives in quadrant ${q}; expected exactly four wheels`);
    centres[q] = c;
  }
  if (Object.keys(centres).length !== 4) throw new Error(`prepare-hatchback: found ${tyres.length} ${TYRE_MATERIAL} primitives in ${Object.keys(centres).length} quadrants; expected exactly four wheels`);
  return centres;
}

function nearestWheel(centres, c) {
  let best = null, bestD = Infinity;
  for (const [q, w] of Object.entries(centres)) {
    const d = Math.hypot(c[0] - w[0], c[1] - w[1], c[2] - w[2]);
    if (d < bestD) { best = q; bestD = d; }
  }
  if (bestD > 0.6) throw new Error(`prepare-hatchback: a wheel part sits ${bestD.toFixed(2)} m from the nearest wheel centre`);
  return best;
}

const translation = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

// the origin sits on the axle midpoint, as the compact's does (its wheels are at +-1.38): the game's cameras, collision circle
// and the wheel table are all symmetric about it. The footprint centre is 6 cm ahead of it, the front overhang being the longer one.
function centreOnAxles(tags, centres) {
  const xs = Object.values(centres).map(c => c[0]), xMid = (Math.max(...xs) + Math.min(...xs)) / 2;
  for (const p of tags.keys()) transformPrimitive(p, translation(-xMid, 0, 0));
  for (const c of Object.values(centres)) c[0] -= xMid;
}

// rebuilds the scene as hatchback > { body, wheel_FL, wheel_FR, wheel_RL, wheel_RR }; wheel vertices are re-centred on their hub
function splitNodes(doc, scene, tags) {
  const centres = wheelCentres(tags);
  centreOnAxles(tags, centres);
  const root = doc.createNode('hatchback'), body = doc.createMesh('body');
  root.addChild(doc.createNode('body').setMesh(body));
  const wheels = {};
  for (const [q, name] of Object.entries(WHEEL_NAMES)) {
    wheels[q] = doc.createMesh(name);
    root.addChild(doc.createNode(name).setMesh(wheels[q]).setTranslation(centres[q]));
  }
  for (const [p, t] of tags) {
    if (!WHEEL_MATERIALS.includes(t.source)) { body.addPrimitive(p); continue; }
    const q = nearestWheel(centres, centreOf(primBounds(p))), c = centres[q];
    transformPrimitive(p, translation(-c[0], -c[1], -c[2]));
    wheels[q].addPrimitive(p);
  }
  disposeSubtrees(scene.listChildren());
  scene.addChild(root);
  return centres;
}

function disposeSubtrees(nodes) {
  const all = [];
  for (const n of nodes) n.traverse(x => all.push(x));
  for (const n of all) { const m = n.getMesh(); n.dispose(); m?.dispose(); }
}

// --interior-shell: the original seats and dash go; a dark copy of every window, shrunk 4 cm towards the cabin's centre line
// (sideways and lengthways only, so it still meets the belt line), takes their place as the surface seen through the glass
function interiorShell(doc, tags, roles) {
  const body = doc.getRoot().listMeshes().find(m => m.getName() === 'body');
  const glass = body.listPrimitives().filter(p => tags.get(p).role === 'Glass');
  const b = unionBounds(glass.map(primBounds)), c = centreOf(b), size = sizeOf(b);
  const sx = (size[0] - 2 * SHELL_INSET_M) / size[0], sz = (size[2] - 2 * SHELL_INSET_M) / size[2];
  for (const g of glass) {
    const shell = g.clone().setMaterial(roles.Interior).setAttribute('POSITION', g.getAttribute('POSITION').clone());
    transformPrimitive(shell, [sx, 0, 0, 0, 0, 1, 0, 0, 0, 0, sz, 0, c[0] * (1 - sx), 0, c[2] * (1 - sz), 1]);
    body.addPrimitive(shell); tags.set(shell, { role: 'Interior', source: 'shell' });
  }
  for (const p of body.listPrimitives()) if (ORIGINAL_INTERIOR.includes(tags.get(p).source)) { body.removePrimitive(p); p.dispose(); }
}

function unionBounds(list) {
  return { min: [0, 1, 2].map(i => Math.min(...list.map(b => b.min[i]))), max: [0, 1, 2].map(i => Math.max(...list.map(b => b.max[i]))) };
}

// nothing is textured any more: only POSITION stays (Sketchfab's split normals would stop the simplifier; the game recomputes them)
function stripToPositions(doc) {
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
  }
}

// after the simplify only: snapped before the weld, thin parts collapse into non-manifold vertices the simplifier locks (~28k floor)
function snapPositions(doc) {
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION'), arr = a.getArray();
    for (let i = 0; i < arr.length; i++) arr[i] = Math.round(arr[i] / GRID_M) * GRID_M;
    a.setArray(arr);
  }
}

// one primitive per material in every mesh, so the body is a handful of draw calls and the simplifier works across panel seams
function joinByMaterial(doc) {
  for (const m of doc.getRoot().listMeshes()) {
    const groups = new Map();
    for (const p of m.listPrimitives()) { const k = p.getMaterial(); groups.set(k, [...(groups.get(k) ?? []), p]); }
    for (const prims of groups.values()) {
      if (prims.length < 2) continue;
      const joined = joinPrimitives(prims);
      for (const p of prims) { m.removePrimitive(p); p.dispose(); }
      m.addPrimitive(joined);
    }
  }
}

async function simplifyTo(doc, ratio, error) {
  let tries = 0, result = null;
  while (tries++ < MAX_TRIES) {
    const attempt = cloneDocument(doc);
    await attempt.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }));
    const tris = docTris(attempt);
    console.log(`simplify try ${tries}: ratio ${ratio.toFixed(4)} error ${error} -> ${tris} triangles`);
    result = attempt;
    if (tris >= TARGET_TRIS.min && tris <= TARGET_TRIS.max) return result;
    ratio = Math.min(1, ratio * TARGET_TRIS.aim / tris);
  }
  throw new Error(`prepare-hatchback: ${docTris(result)} triangles after ${MAX_TRIES} tries; adjust --ratio / --error`);
}

// the original's extensions (KHR_materials_transmission on the windows, texture extensions) have no user left after the prune,
// but the extension objects would still be written to extensionsUsed; the file declares EXT_meshopt_compression alone
function dropForeignExtensions(doc) {
  for (const e of doc.getRoot().listExtensionsUsed()) e.dispose();
}

function summary(doc, outFile, centres) {
  const root = doc.getRoot(), scene = root.listScenes()[0], b = getBounds(scene);
  const size = readFileSync(outFile).length;
  console.log('out:', outFile, `${(size / 1024).toFixed(0)} KB`);
  console.log('triangles', docTris(doc), 'materials', root.listMaterials().length, root.listMaterials().map(m => m.getName()).join('/'), 'textures', root.listTextures().length);
  console.log('nodes', root.listNodes().map(n => `${n.getName()}${n.getMesh() ? `(${meshTris(n.getMesh())})` : ''}`).join(' '));
  console.log('bbox', b.min.map(fmt), b.max.map(fmt), 'length', fmt(b.max[0] - b.min[0]));
  for (const [q, name] of Object.entries(WHEEL_NAMES)) console.log(name, centres[q].map(fmt));
}

// the steps before the simplify, in the order the header documents; returns the wheel centres for the summary
async function prepare(doc, scene, args) {
  deleteLettering(doc);
  const roles = createRoleMaterials(doc);
  const tags = tagPrimitives(scene, roles);
  bakeFrame(doc, scene);
  const centres = splitNodes(doc, scene, tags);
  if (args.interiorShell) interiorShell(doc, tags, roles);
  stripToPositions(doc);
  await doc.transform(dedup(), prune());
  joinByMaterial(doc);
  await doc.transform(weld());
  return centres;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  await MeshoptEncoder.ready;
  const doc = await io.read(args.inFile), scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (args.list) return listOriginal(doc, scene);
  console.log('in:', docTris(doc), 'triangles');
  const centres = await prepare(doc, scene, args);
  const out = await simplifyTo(doc, args.ratio, args.error);
  snapPositions(out);
  await out.transform(prune());
  dropForeignExtensions(out);
  out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(args.outFile, out);
  summary(out, args.outFile, centres);
}

await main();
