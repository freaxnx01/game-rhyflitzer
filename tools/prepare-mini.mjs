// prepare-mini.mjs — builds assets/mini.glb from the Sketchfab "Mr Bean Car FBX" (Sxi.Sai, CC BY 4.0,
// https://sketchfab.com/3d-models/mr-bean-car-fbx-428dfc665ab4473fa1cdc42e498e64b2). Issue #468.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/miniprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   cp tools/prepare-mini.mjs <scratch>/miniprep/ && cd <scratch>/miniprep
//   node prepare-mini.mjs <original.glb> <out.glb>
// The original is 25 MB (two 4096² PNGs), 9.6k triangles: no simplifying, the size is all texture.
//
// Output contract (the same as tools/prepare-hatchback.mjs, what index.html relies on):
//   metres, +x forward, +y up, +z right, wheels on y = 0, footprint centred, length 3.05 m, no node transform left except the wheels'
//   node "mini"                            the scene root
//     node "body"                          everything that does not turn
//     node "wheel_FL" "wheel_FR" "wheel_RL" "wheel_RR"
//                                          front/rear, left (-z) / right (+z); translation = the wheel centre, vertices centred on it
//   materials: Body (the one textured atlas, recoloured), LampHead { extras: { lamp: 'head' } }, LampTail { extras: { lamp: 'tail' } }
//   (both lamps reuse the atlas as base and emissive map, so the game's emissiveIntensity lights the painted lens)
//   one 1024² JPEG texture; extensions: EXT_meshopt_compression only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, transformMesh, joinPrimitives, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const LENGTH_M = 3.05;
const TEXTURE_PX = 1024;
// the original's mesh nodes (name without "_initialShadingGroup_0") -> role
const WHEEL_MESHES = ['defaultMaterial', 'defaultMaterial.016', 'defaultMaterial.012', 'defaultMaterial.024'];   // tyres + rims, one mesh per axle (both sides)
const LAMP_MESHES = { 'defaultMaterial.014': 'LampHead', 'defaultMaterial.005': 'LampTail' };
// the "I ♥ LONDON" sticker on the boot lid, in 4096² atlas pixels: painted over with the paint just left of it
const STICKER = { x: 955, y: 430, w: 145, h: 100 };
// Citron Green: the original's yellow (hue ≈ 57°) moved a little toward green and calmed down
const PAINT_HUE = { from: 45, to: 72, shift: 7, sat: 0.88 };

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-mini.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();
const base = (n) => n.getName().replace('_initialShadingGroup_0', '');

// 1. bake every node transform into its mesh, then map (x, y, z) of the original (front +z, right -x) to the game's frame
const meshNodes = root.listNodes().filter(n => n.getMesh());
for (const n of meshNodes) { transformMesh(n.getMesh(), n.getWorldMatrix()); }
const all = [];
for (const n of meshNodes) for (const p of n.getMesh().listPrimitives()) all.push({ node: base(n), prim: p });
const bounds = boundsOf(all.map(a => a.prim)), track = boundsOf(all.filter(a => WHEEL_MESHES.includes(a.node)).map(a => a.prim));
const k = LENGTH_M / (bounds.max[2] - bounds.min[2]);
// centred between the tyres, not on the bounds: the one door mirror (left only) would push the car off its track
const cx = (track.min[0] + track.max[0]) / 2, cz = (bounds.min[2] + bounds.max[2]) / 2, y0 = bounds.min[1];
// new = k * (z - cz, y - y0, -(x - cx)): a rotation about y (det +1), so the winding stays right
for (const { prim } of all) mapPositions(prim, ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)], ([x, y, z]) => [z, y, -x]);

// 2. materials: the atlas, recoloured and shrunk; lamp materials share it
const atlas = root.listMaterials()[0];
const tex = atlas.getBaseColorTexture();
tex.setImage(await repaint(tex.getImage())).setMimeType('image/jpeg').setURI('mini.jpg');
for (const t of root.listTextures()) if (t !== tex) t.dispose();   // the unused normal map
atlas.setName('Body').setMetallicFactor(0).setRoughnessFactor(0.6);
const lamp = (name, role, rgb) => atlas.clone().setName(name).setExtras({ lamp: role }).setEmissiveFactor(rgb).setEmissiveTexture(tex);
const mats = { LampHead: lamp('LampHead', 'head', [1, 0.97, 0.85]), LampTail: lamp('LampTail', 'tail', [1, 0.2, 0.15]) };

// 3. scene: body + four wheels
const scene = doc.createScene('mini');
const top = doc.createNode('mini'); scene.addChild(top);
const bodyMesh = doc.createMesh('body');
const wheels = { wheel_FL: [], wheel_FR: [], wheel_RL: [], wheel_RR: [] };
for (const { node, prim } of all) {
  if (WHEEL_MESHES.includes(node)) { splitWheel(prim, wheels); continue; }
  if (LAMP_MESHES[node]) prim.setMaterial(mats[LAMP_MESHES[node]]);
  bodyMesh.addPrimitive(prim);
}
top.addChild(doc.createNode('body').setMesh(bodyMesh));
for (const [name, prims] of Object.entries(wheels)) {
  const b = boundsOf(prims), c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  for (const p of prims) mapPositions(p, ([x, y, z]) => [x - c[0], y - c[1], z - c[2]], (v) => v);
  const mesh = doc.createMesh(name); prims.forEach(p => mesh.addPrimitive(p));
  top.addChild(doc.createNode(name).setTranslation(c).setMesh(mesh));
  console.log(name, 'centre', c.map(v => +v.toFixed(3)), 'r', +((b.max[1] - b.min[1]) / 2).toFixed(3));
}
for (const s of root.listScenes()) if (s !== scene) s.dispose();
for (const n of meshNodes) n.dispose();
root.setDefaultScene(scene);

// 4. merge per material, weld, compress
for (const m of root.listMeshes()) {
  const byMat = new Map();
  for (const p of m.listPrimitives()) { const key = p.getMaterial(); byMat.set(key, [...(byMat.get(key) || []), p]); }
  for (const prims of byMat.values()) if (prims.length > 1) { const joined = joinPrimitives(prims); prims.forEach(p => { m.removePrimitive(p); p.dispose(); }); m.addPrimitive(joined); }
}
await doc.transform(weld(), dedup(), prune());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'Mr Bean Car FBX (modified)', author: 'Sxi.Sai (https://sketchfab.com/Sxi.Sai)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/mr-bean-car-fbx-428dfc665ab4473fa1cdc42e498e64b2' };
await io.write(output, doc);
const out = boundsOf(root.listMeshes().flatMap(m => m.listPrimitives()));
console.log('wrote', output, 'body bounds', out.min.map(v => +v.toFixed(3)), out.max.map(v => +v.toFixed(3)));

function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return { min, max };
}

// positions through f, normals through the rotation-only g; every accessor is detached first so shared ones are not mapped twice
function mapPositions(prim, f, g) {
  for (const [sem, fn] of [['POSITION', f], ['NORMAL', g]]) {
    const a = prim.getAttribute(sem); if (!a) continue;
    const c = a.clone(); prim.setAttribute(sem, c);
    const v = []; for (let i = 0; i < c.getCount(); i++) c.setElement(i, fn(c.getElement(i, v)));
  }
}

// one axle's tyre or rim primitive -> a left (-z) and a right (+z) primitive; front/rear by the sign of x
function splitWheel(prim, out) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), v = [];
  const front = boundsOf([prim]).max[0] > 0;
  for (const side of [-1, 1]) {
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      let z = 0; for (let j = 0; j < 3; j++) z += pos.getElement(idx[t + j], v)[2];
      if (Math.sign(z) === side) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const p = prim.clone(); p.setIndices(prim.getIndices().clone().setArray(new Uint32Array(keep))); compactPrimitive(p);
    out[`wheel_${front ? 'F' : 'R'}${side < 0 ? 'L' : 'R'}`].push(p);
  }
  prim.dispose();
}

async function repaint(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, C = info.channels;
  // the sticker: copy the strip of paint just left of it over it
  for (let y = STICKER.y; y < STICKER.y + STICKER.h; y++) for (let x = STICKER.x; x < STICKER.x + STICKER.w; x++) {
    const src = (y * W + (x - STICKER.w - 10)) * C, dst = (y * W + x) * C; for (let c = 0; c < C; c++) data[dst + c] = data[src + c];
  }
  for (let i = 0; i < data.length; i += C) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (h < PAINT_HUE.from || h > PAINT_HUE.to || s < 0.35) continue;
    const [r, g, b] = hslToRgb(h + PAINT_HUE.shift, s * PAINT_HUE.sat, l); data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
  return sharp(data, { raw: info }).resize(TEXTURE_PX, TEXTURE_PX).jpeg({ quality: 85 }).toBuffer();
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map(v => Math.round((v + m) * 255));
}
