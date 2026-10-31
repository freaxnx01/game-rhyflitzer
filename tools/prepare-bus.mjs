// prepare-bus.mjs — builds assets/bus.glb from the Sketchfab "Mercedes+CITARO+II+RATP" (moussasy.sy715, CC BY 4.0,
// https://sketchfab.com/3d-models/mercedescitaroiiratp-93010eea7663482e8f1ca17168af6d8a). Issue #478.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/busprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   cp tools/prepare-bus.mjs <scratch>/busprep/ && cd <scratch>/busprep
//   node prepare-bus.mjs <original.glb> <out.glb>
// The original is a SketchUp export: inches under a 0.0254 node scale, 41 mirrored nodes, 53 fully metallic materials,
// edge lines as extra primitives, both axles of a side in one node, 50k of its 74k triangles in the wheels.
//
// Output contract (the same as tools/prepare-mini.mjs, what index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, centred on the body (not the mirrors), no node transform left except the wheels'
//   node "bus"                             the scene root
//     node "body"                          everything that does not turn; one primitive per material
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the wheel centre, vertices centred on it
//   materials: Body (Postauto yellow), Roof (white), Band (black), Stripe (red), Glass { extras: { glass: true } },
//   LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }, Display and Plate (one small texture each,
//   drawn here; Display { extras: { overGlass: true } }), and plain colours for the rest; all non-metallic. Extensions: EXT_meshopt_compression only.
// Look, not brand (#473): the RATP livery, logos, the "Entrée" sticker, the maker's star and "CITARO" / "Mercedes-Benz"
// lettering are deleted; the destination display reads "811 Sisseln", the plate "AG · 4332".
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives, compactPrimitive, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// the original's frame (after the node transforms): front at small x, door side at small z, metres
const SIDE_Z = [11.254, 13.804];                  // the two flat side walls
const BODY_X = [0.30, 12.26];                      // nose to tail, without the mirrors
const AXLE_SPLIT_X = 6.0;                          // front axle below, rear axle above
const STRIPE = { y: [1.13, 1.19], x: [0.45, 12.1], out: 0.005, doors: [[0.55, 2.13], [6.34, 7.93]] };   // under the windows; the doors are on the small-z side
const WHEEL_RATIO = 0.12, WHEEL_ERROR = 0.03;      // the wheels keep about 12 % of their triangles (error: relative to the wheel size)

// parent node -> dropped (a stray far beside the bus, the maker's lettering and stars, the side RATP logos)
const DROP_NODES = ['_43', '_2', '_3', '_4', '_5', '_9', '_27', '_30'];
const DROP_MATERIALS = ['logo20RATP', 'ratp-logo', 'Color_I11'];
const DROP_IN = { _25: ['Lime', 'Color_0081', 'Color_F19'] };   // the "Entrée" sticker on the front door
const WHEEL_NODES = ['_0', '_1'];
const LAMP_IN = { _11: { Translucent_Glass_Gray2: 'LampHead' }, _12: { Translucent_Glass_Gray2: 'LampHead' },
  _19: { Color_A06: 'LampTail', Color_A05: 'LampTail' }, _24: { Color_A06: 'LampTail', Color_A05: 'LampTail' },
  _20: { Color_A06: 'LampTail' }, _22: { Color_A06: 'LampTail' } };
// original material -> role; everything else keeps its own colour as a plain non-metallic material
const ROLES = {
  Color_C01_0: 'Body', LightSeaGreen1: 'Body', Color_0031: 'Body',
  Color_C01: 'Roof',
  Color_C06: 'Band', Color_D01: 'Band',
  Translucent_Glass_Gray1: 'Glass', Translucent_Glass_Gray1_0: 'Glass', Translucent_Glass_Gray2: 'Glass', Translucent_Glass_Gray2_0: 'Glass', Translucent_Glass_Blue: 'Glass',
  Texture_1: 'Display', '1385_02': 'Plate', '1385_02_0': 'Plate',
  Metal_Aluminum_Anodized1: 'Metal', Metal_Aluminum_Anodized1_0: 'Metal',
};
const lin = (hex) => [16, 8, 0].map(s => ((hex >> s) & 255) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const MATS = {   // the Postauto colours of bus.js BUS_COLOURS, as linear factors
  Body: { base: [...lin(0xffcc00), 1], rough: 0.45 },
  Roof: { base: [...lin(0xe6e8e8), 1], rough: 0.6 },
  Band: { base: [...lin(0x111418), 1], rough: 0.5 },
  Stripe: { base: [...lin(0xd6202a), 1], rough: 0.45 },
  Glass: { base: [0.012, 0.014, 0.018, 0.8], rough: 0.05, alpha: true, doubleSided: true, extras: { glass: true } },   // tinted like real bus glass: the empty interior only shows faintly; double-sided, the windscreen faces inward
  LampHead: { base: [0.85, 0.85, 0.82, 1], rough: 0.15, emissive: [1, 0.95, 0.8], extras: { lamp: 'head' } },
  LampTail: { base: [0.45, 0.01, 0.01, 1], rough: 0.2, emissive: [0.8, 0.03, 0.02], extras: { lamp: 'tail' } },
  Display: { base: [1, 1, 1, 1], rough: 0.4, emissive: [1, 1, 1], extras: { overGlass: true } },   // drawn after the tinted glass: the LEDs shine through
  Plate: { base: [1, 1, 1, 1], rough: 0.5 },
  Metal: { base: [0.6, 0.6, 0.62, 1], rough: 0.4 },
};

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-bus.mjs <original.glb> <out.glb>'); process.exit(1); }

await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();
const parentOf = (n) => n.getParentNode()?.getName();

// 1. bake every node transform (mirrored nodes included: transformMesh turns their winding back), drop lines and the deleted parts
const parts = [];
for (const n of root.listNodes().filter(n => n.getMesh())) {
  const par = parentOf(n);
  if (DROP_NODES.includes(par)) continue;
  transformMesh(n.getMesh(), n.getWorldMatrix());
  for (const p of n.getMesh().listPrimitives()) {
    const mat = p.getMaterial()?.getName();
    if (p.getMode() !== 4 || DROP_MATERIALS.includes(mat) || DROP_IN[par]?.includes(mat)) continue;
    parts.push({ par, mat, prim: p });
  }
}

// 2. one material per role; the unmapped originals become plain non-metallic colours, shared by colour
const textures = { Display: await texture(displaySvg(), 'bus-display.png'), Plate: await texture(plateSvg(), 'bus-plate.png') };
const role = {};
for (const [name, r] of Object.entries(MATS)) {
  const m = doc.createMaterial(name).setBaseColorFactor(r.base).setMetallicFactor(0).setRoughnessFactor(r.rough);
  if (r.alpha) m.setAlphaMode('BLEND');
  if (r.doubleSided) m.setDoubleSided(true);
  if (r.emissive) m.setEmissiveFactor(r.emissive);
  if (r.extras) m.setExtras(r.extras);
  if (textures[name]) { m.setBaseColorTexture(textures[name]); if (r.emissive) m.setEmissiveTexture(textures[name]); }
  role[name] = m;
}
const plain = new Map();
const plainFor = (orig) => {
  const c = orig?.getBaseColorFactor() ?? [1, 1, 1, 1], key = c.slice(0, 3).map(v => v.toFixed(2)).join(',');
  if (!plain.has(key)) plain.set(key, doc.createMaterial(`Plain_${plain.size}`).setBaseColorFactor([...c.slice(0, 3), 1]).setMetallicFactor(0).setRoughnessFactor(0.6));
  return plain.get(key);
};
for (const part of [...parts]) {   // a copy: splitRoof appends the roof pieces
  const r = LAMP_IN[part.par]?.[part.mat] ?? ROLES[part.mat];
  part.prim.setMaterial(r ? role[r] : plainFor(part.prim.getMaterial()));
  if (r === 'Body') splitRoof(part);
}
parts.push(...stripes());

// 3. the game's frame: a half turn about y (front to +x, the door side to +z, the right), centred on the body, wheels on y = 0
const cx = (BODY_X[0] + BODY_X[1]) / 2, cz = (SIDE_Z[0] + SIDE_Z[1]) / 2;
const scene = doc.createScene('bus');
const top = doc.createNode('bus'); scene.addChild(top);
const bodyMesh = doc.createMesh('body'), wheels = { wheel_FL: [], wheel_FR: [], wheel_RL: [], wheel_RR: [] };
for (const { par, prim } of parts) {
  if (WHEEL_NODES.includes(par)) for (const [name, p] of splitWheel(prim)) wheels[name].push(p);
  else bodyMesh.addPrimitive(prim);
}
const mapping = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, cx, 0, cz, 1];
transformMesh(bodyMesh, mapping);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const [name, prims] of Object.entries(wheels)) {
  const mesh = doc.createMesh(name); prims.forEach(p => mesh.addPrimitive(p)); transformMesh(mesh, mapping);
  const b = boundsOf(mesh.listPrimitives()), c = [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2);
  transformMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -c[0], -c[1], -c[2], 1]);
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3));
}
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (n !== top && n.getParentNode() !== top) n.dispose();
root.setDefaultScene(scene);

// 4. merge per material, weld, thin the wheels, compress
for (const m of root.listMeshes()) {
  const byMat = new Map();
  for (const p of m.listPrimitives()) { const key = p.getMaterial(); byMat.set(key, [...(byMat.get(key) || []), p]); }
  for (const prims of byMat.values()) if (prims.length > 1) { const joined = joinPrimitives(prims); prims.forEach(p => { m.removePrimitive(p); p.dispose(); }); m.addPrimitive(joined); }
}
await doc.transform(weld(), dedup(), prune());
for (const n of top.listChildren()) if (n.getName().startsWith('wheel_')) for (const p of n.getMesh().listPrimitives()) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: WHEEL_RATIO, error: WHEEL_ERROR });
await doc.transform(prune());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'Mercedes+CITARO+II+RATP (modified)', author: 'moussasy.sy715 (https://sketchfab.com/moussasy.sy715)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/mercedescitaroiiratp-93010eea7663482e8f1ca17168af6d8a' };
await io.write(output, doc);
const all = root.listMeshes().flatMap(m => m.listPrimitives()), tris = all.reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
const out = boundsOf(bodyMesh.listPrimitives());
console.log('wrote', output, 'triangles', tris, 'materials', root.listMaterials().length, 'body bounds', out.min.map(v => +v.toFixed(3)), out.max.map(v => +v.toFixed(3)));

function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return { min, max };
}

// triangle list of a primitive (indexed or not)
function triIndices(prim) { const idx = prim.getIndices(); return idx ? Array.from(idx.getArray()) : Array.from({ length: prim.getAttribute('POSITION').getCount() }, (_, i) => i); }
function subset(prim, keep) { const p = prim.clone(); p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep))); compactPrimitive(p); return p; }

// body-coloured triangles that face up on the roof get the white roof material
function splitRoof(part) {
  const P = part.prim.getAttribute('POSITION'), I = triIndices(part.prim), a = [], b = [], c = [], up = [], rest = [];
  for (let t = 0; t < I.length; t += 3) {
    P.getElement(I[t], a); P.getElement(I[t + 1], b); P.getElement(I[t + 2], c);
    const e1 = b.map((v, i) => v - a[i]), e2 = c.map((v, i) => v - a[i]), ny = e1[2] * e2[0] - e1[0] * e2[2], L = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny, e1[0] * e2[1] - e1[1] * e2[0]);
    (L > 0 && ny > 0.7 * L && Math.min(a[1], b[1], c[1]) > 2.5 ? up : rest).push(I[t], I[t + 1], I[t + 2]);
  }
  if (!up.length) return;
  const roof = subset(part.prim, up).setMaterial(role.Roof), body = subset(part.prim, rest);
  parts.push({ par: part.par, mat: part.mat, prim: roof });
  part.prim.dispose(); part.prim = body;
}

// the red stripe under the windows: thin quads 5 mm off both side walls, broken at the doors
function stripes() {
  const pos = [], nrm = [], [y0, y1] = STRIPE.y;
  const spans = (doors) => { const out = []; let x = STRIPE.x[0]; for (const [d0, d1] of doors) { out.push([x, d0]); x = d1; } out.push([x, STRIPE.x[1]]); return out; };
  for (const [z, s, doors] of [[SIDE_Z[0] - STRIPE.out, -1, STRIPE.doors], [SIDE_Z[1] + STRIPE.out, 1, []]]) for (const [x0, x1] of spans(doors)) {
    const q = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], tri = s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of tri) { pos.push(...q[i]); nrm.push(0, 0, s); }
  }
  const prim = doc.createPrimitive().setMaterial(role.Stripe)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)));
  return [{ par: 'stripe', mat: 'Stripe', prim }];
}

// one side's two-axle wheel primitive -> front and rear pieces, named in the game's frame (front = small original x, right = small original z)
function splitWheel(prim) {
  const P = prim.getAttribute('POSITION'), I = triIndices(prim), v = [], front = [], rear = [];
  let zsum = 0;
  for (let t = 0; t < I.length; t += 3) {
    let x = 0; for (let j = 0; j < 3; j++) { P.getElement(I[t + j], v); x += v[0]; zsum += v[2]; }
    (x / 3 < AXLE_SPLIT_X ? front : rear).push(I[t], I[t + 1], I[t + 2]);
  }
  const side = zsum / I.length < (SIDE_Z[0] + SIDE_Z[1]) / 2 ? 'R' : 'L';
  const out = [[`wheel_F${side}`, subset(prim, front)], [`wheel_R${side}`, subset(prim, rear)]];
  prim.dispose(); return out;
}

async function texture(svg, uri) { return doc.createTexture(uri).setImage(await sharp(Buffer.from(svg)).png().toBuffer()).setMimeType('image/png').setURI(uri); }
// 512 x 64 like the original: the line number on the left (the rear display shows only that part), the destination on the right
function displaySvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="64"><rect width="512" height="64" fill="#0a0a0a"/>
    <text x="8" y="50" font-family="Liberation Sans" font-weight="bold" font-size="48" fill="#ff9a1a">811</text>
    <text x="130" y="50" font-family="Liberation Sans" font-weight="bold" font-size="48" fill="#ff9a1a">Sisseln</text></svg>`;
}
function plateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64"><rect width="256" height="64" fill="#ffffff"/>
    <rect x="2" y="2" width="252" height="60" fill="none" stroke="#111111" stroke-width="3"/>
    <text x="128" y="48" text-anchor="middle" font-family="Liberation Sans" font-weight="bold" font-size="42" fill="#111111">AG · 4332</text></svg>`;
}
