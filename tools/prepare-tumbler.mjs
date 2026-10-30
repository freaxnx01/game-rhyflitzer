// prepare-tumbler.mjs — builds prototype/assets/tumbler.glb from the Sketchfab "Batmobile-The Dark Knight Tumbler" (Gravity Jack,
// CC BY 4.0, https://sketchfab.com/3d-models/batmobile-the-dark-knight-tumbler-7ae346a9724a40faa467a3107dfb09e9).
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/tprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   cp tools/prepare-tumbler.mjs <scratch>/tprep/ && cd <scratch>/tprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-tumbler.mjs <original scene.gltf> <out.glb>
// The original is a low-poly game model: 10k triangles in 19 parts, one metal/rough material with a 2048 px atlas (base colour,
// metallic-roughness, normal, emissive), one animation. No logo in the atlas. Kept: the geometry as it is (no simplifying) and the
// textures as 1024 px WebP; the animation goes, the windscreen gets a plain glass material, the head lamp faces (found by their glow
// in the emissive map) a plain lamp material so they light up with L. The two rear tyres are one part and are split by side.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what prototype/index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint, length LENGTH_M, no node transform left except the wheels'
//   node "tumbler"                         the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the tyre centre, vertices centred on it
//   materials: Body (the textured atlas), Glass { extras: { glass: true } }, LampHead { extras: { lamp: 'head' } }
//   extensions: EXT_meshopt_compression + EXT_texture_webp only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, transformMesh, joinPrimitives, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const LENGTH_M = 4.57;      // the film car, nose to tail (15 ft)
const METALLIC = 0.25;      // no environment map in most styles: a fully metallic body only swallows the light
const TEXTURE_PX = 1024;
const WEBP_QUALITY = 88;
const FRONT_TYRES = { Frontleftwheel_BatMobile_0: 'L', frontrighttire_BatMobile_0: 'R' };
const REAR_TYRES = 'backtires_BatMobile_0';
const GLASS = 'Window_BatMobile_0';
// a face is a head lamp when the emissive map at its uv centre is bright and warm (the dash lights are red, green and blue)
const isLampGlow = ([r, g, b]) => r > 120 && g > 120 && b < r;

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-tumbler.mjs <original scene.gltf> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'sharp': sharp });
const doc = await io.read(input);
const root = doc.getRoot();
for (const a of root.listAnimations()) a.dispose();

// 1. bake every node transform into its mesh
const meshNodes = root.listNodes().filter(n => n.getMesh());
const all = [];
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
  for (const p of n.getMesh().listPrimitives()) all.push({ node: n.getName(), prim: p, mesh: n.getMesh() });
}
const [atlas] = root.listMaterials();
if (root.listMaterials().length !== 1) throw new Error(`prepare-tumbler: expected one material, found ${root.listMaterials().length}`);

// 2. the frame: the original faces +z with its right side on -x: new = k * (z - cz, y - y0, -(x - cx)), a rotation about y;
//    k from the length, the origin between the axles
const partOf = (name) => all.filter(a => a.node === name).map(a => a.prim);
const front = Object.keys(FRONT_TYRES).map(name => centreOf(boundsOf(partOf(name))));
const rear = centreOf(boundsOf(partOf(REAR_TYRES)));
const whole = boundsOf(all.map(a => a.prim));
const k = LENGTH_M / (whole.max[2] - whole.min[2]);
const cz = (front[0][2] + rear[2]) / 2, cx = (whole.min[0] + whole.max[0]) / 2, y0 = whole.min[1];
const frame = [0, 0, -k, 0, 0, k, 0, 0, k, 0, 0, 0, -k * cz, -k * y0, k * cx, 1];
for (const m of new Set(all.map(a => a.mesh))) transformMesh(m, frame);

// 3. materials: the atlas stays (metalness lowered), glass and head lamps plain
atlas.setName('Body').setMetallicFactor(METALLIC);
const glass = doc.createMaterial('Glass').setBaseColorFactor([0.05, 0.07, 0.09, 0.35]).setMetallicFactor(0).setRoughnessFactor(0.05)
  .setAlphaMode('BLEND').setDoubleSided(true).setExtras({ glass: true });
// the compact's head lamp colour (carMats.lampHead) as a linear factor, as in prepare-hatchback.mjs
const lampHead = doc.createMaterial('LampHead').setBaseColorFactor([0.807, 0.807, 0.807, 1]).setMetallicFactor(0).setRoughnessFactor(0.12)
  .setEmissiveFactor([1, 0.922, 0.631]).setExtras({ lamp: 'head' });
const emissive = await pixels(atlas.getEmissiveTexture());
const plain = (prim, mat) => { for (const sem of prim.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL') prim.setAttribute(sem, null); prim.setMaterial(mat); };
const lamps = [];
for (const a of all) {
  if (a.node === GLASS) { plain(a.prim, glass); continue; }
  const lamp = splitFaces(a.prim, (c) => isLampGlow(emissive.at(c.uv)));
  if (lamp) { plain(lamp, lampHead); lamps.push(lamp); }
}
console.log('head lamp faces', lamps.reduce((n, p) => n + p.getIndices().getCount() / 3, 0));

// 4. scene: body + four wheels (vertices centred on the tyre's centre)
const scene = doc.createScene('tumbler');
const top = doc.createNode('tumbler'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
const wheels = { wheel_FL: [], wheel_FR: [], wheel_RL: [], wheel_RR: [] };
for (const { node, prim } of all) {
  if (FRONT_TYRES[node]) wheels[`wheel_F${FRONT_TYRES[node]}`].push(prim);
  else if (node === REAR_TYRES) { const right = splitFaces(prim, (c) => c.pos[2] > 0); wheels.wheel_RL.push(prim); wheels.wheel_RR.push(right); }
  else bodyMesh.addPrimitive(prim);
}
for (const p of lamps) bodyMesh.addPrimitive(p);
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const [name, prims] of Object.entries(wheels)) {
  const b = boundsOf(prims), c = centreOf(b);
  for (const p of prims) mapAttribute(p, 'POSITION', ([x, y, z]) => [x - c[0], y - c[1], z - c[2]]);
  const mesh = doc.createMesh(name); prims.forEach(p => mesh.addPrimitive(p));
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3), 'width', +(b.max[2] - b.min[2]).toFixed(3));
}
const keep = new Set([top, ...top.listChildren()]);
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);
await doc.transform(dedup(), prune());
joinByMaterial(doc);

// 5. textures to WebP, compress
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_PX, TEXTURE_PX], quality: WEBP_QUALITY }), prune());
for (const e of root.listExtensionsUsed()) if (e.extensionName !== 'EXT_texture_webp') e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'Batmobile-The Dark Knight Tumbler (modified)', author: 'Gravity Jack (https://sketchfab.com/gravityjack)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/batmobile-the-dark-knight-tumbler-7ae346a9724a40faa467a3107dfb09e9' };
await io.write(output, doc);
const bodyB = boundsOf(root.listMeshes().find(m => m.getName() === 'body').listPrimitives());
console.log('wrote', output, 'triangles', docTris(doc), 'materials', root.listMaterials().map(m => m.getName()).join(','), 'textures', root.listTextures().map(t => t.getMimeType() + ' ' + t.getSize().join('x')).join(', '));
console.log('body bounds', bodyB.min.map(v => +v.toFixed(3)), bodyB.max.map(v => +v.toFixed(3)));

// ---------- helpers ----------
function centreOf(b) { return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function docTris(d) { return d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0); }

function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  // only the vertices the faces use: after splitFaces two primitives share one vertex buffer
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (const i of p.getIndices().getArray()) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return { min, max };
}

// moves the faces whose centre (position and uv) passes the test out of the primitive into a new one that it returns; null if none do
function splitFaces(prim, test) {
  const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices().getArray(), keep = [], cut = [], v = [];
  for (let t = 0; t < idx.length; t += 3) {
    const c = { pos: [0, 0, 0], uv: [0, 0] };
    for (let j = 0; j < 3; j++) {
      pos.getElement(idx[t + j], v); for (let a = 0; a < 3; a++) c.pos[a] += v[a] / 3;
      if (uv) { uv.getElement(idx[t + j], v); c.uv[0] += v[0] / 3; c.uv[1] += v[1] / 3; }
    }
    (test(c) ? cut : keep).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (!cut.length) return null;
  const piece = prim.clone();
  prim.setIndices(prim.getIndices().clone().setArray(new Uint32Array(keep)));
  piece.setIndices(piece.getIndices().clone().setArray(new Uint32Array(cut)));
  return piece;
}

// the texture's pixels, read at a uv (repeating, glTF's v down)
async function pixels(texture) {
  const { data, info } = await sharp(Buffer.from(texture.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const wrap = (f) => f - Math.floor(f);
  return { at: ([u, v]) => { const i = (Math.min(info.height - 1, Math.floor(wrap(v) * info.height)) * info.width + Math.min(info.width - 1, Math.floor(wrap(u) * info.width))) * 3; return [data[i], data[i + 1], data[i + 2]]; } };
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
