// prepare-enterprise.mjs — builds assets/models/enterprise_d.glb from the Sketchfab "Enterprise D 2 8 Simple Bake Export"
// (HaughtyGrayAlien, CC BY 4.0, https://sketchfab.com/3d-models/enterprise-d-2-8-simple-bake-export-02aeda1aaafd4a3591892ed5a2aeac33). Issue #491.
//
// Usage (from a folder OUTSIDE the repo that has the npm packages; the game is buildless and ships no package.json):
//   npm i --prefix <scratch>/entprep @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   cp tools/prepare-enterprise.mjs <scratch>/entprep/ && cd <scratch>/entprep
//   systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-enterprise.mjs <original.glb> <out.glb>
// The original is a 104 MB glb (an FBX export): 1.2 M triangles in 29 meshes under four section nodes (saucer, drive section,
// nacelles, "aux" = the pylons, bridge, shuttlebays, deflector and the like), 1000 units long with +z the bow, +y up, and four
// metal/rough materials with base colour, metallic-roughness, normal and emissive maps, sixteen 1024 px PNGs (4 MB).
//
// Output contract (what index.html and the Enterprise room rely on):
//   metres, life size: LENGTH_M bow to stern along +x (bow at +x), +y up, +z starboard (right when looking forward); y = 0 is the
//   lowest point of the hull, x = z = 0 the centre of the ship's bounding-box footprint; no node transform left
//   node "enterprise"                      the scene root
//     node "saucer" "drive" "nacelles" "aux"
//                                          one mesh each, one primitive, the section's own material (names as the nodes)
//   materials: metal/rough with all four maps kept; metallicFactor lowered to METALLIC (no environment map in the game: a fully
//   metallic hull only swallows the light); emissiveFactor stays white, every material carries extras: { glow: <section> } so the
//   game can boost the emissive maps per section (window rows, warp grilles, bussard collectors, deflector)
//   textures: WebP (EXT_texture_webp), TEXTURE_PX square; extensions: EXT_meshopt_compression + EXT_texture_webp only.
// Geometry: decimated with meshoptimizer to about RATIO of the triangles (holes stay closed: the border is not locked, but the
// error bound keeps the silhouette), welded, one primitive per section.
// The hull's "U.S.S. ENTERPRISE / NCC-1701-D" lettering in the saucer texture is only about 8 px tall at 1024 px and unreadable in
// the game; the room draws its own lettering (see docs/superpowers/specs/2026-10-29-hideout-enterprise-design.md).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, transformMesh, joinPrimitives, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const LENGTH_M = 642.5;     // the Galaxy class, bow to stern
const RATIO = 0.2;          // 1.2 M -> about 240k triangles
const SIMPLIFY_ERROR = 0.0015;
const METALLIC = 0.25;
const TEXTURE_PX = 1024;
const WEBP_QUALITY = 88;
// original node name (prefix) -> section
const SECTIONS = { 'Ship Body Saucer Section': 'saucer', 'Ship Body Drive Section': 'drive', 'ShipNacelles': 'nacelles', 'Ship Aux': 'aux' };

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: node prepare-enterprise.mjs <original.glb> <out.glb>'); process.exit(1); }

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. bake every node transform into its mesh, tag each primitive with its section
const meshNodes = root.listNodes().filter(n => n.getMesh());
const all = [];
for (const n of meshNodes) {
  if (n.getMesh().listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(n.getMesh().clone());
  transformMesh(n.getMesh(), n.getWorldMatrix());
  const section = Object.entries(SECTIONS).find(([prefix]) => sectionNodeName(n).startsWith(prefix))?.[1];
  if (!section) throw new Error(`prepare-enterprise: node "${n.getName()}" belongs to no section in SECTIONS`);
  for (const p of n.getMesh().listPrimitives()) all.push({ section, prim: p });
}

// 2. the frame: the original's +z (bow) becomes +x, +y stays up, +x becomes -z (a rotation about y, det +1); then metres, with the
// lowest hull point on y = 0 and the footprint's centre on x = z = 0
const b0 = boundsOf(all.map(a => a.prim));
const k = LENGTH_M / (b0.max[2] - b0.min[2]);
const cx = (b0.min[0] + b0.max[0]) / 2, cz = (b0.min[2] + b0.max[2]) / 2, y0 = b0.min[1];
for (const { prim } of all) mapPositions(prim, ([x, y, z]) => [k * (z - cz), k * (y - y0), -k * (x - cx)], ([x, y, z]) => [z, y, -x]);

// 3. materials: one per section, kept as they are except the metallic factor and the glow mark
const matBySection = {};
for (const { section, prim } of all) {
  const m = prim.getMaterial();
  if (matBySection[section] && matBySection[section] !== m) throw new Error(`prepare-enterprise: section ${section} uses two materials`);
  matBySection[section] = m;
}
for (const [section, m] of Object.entries(matBySection)) {
  m.setName(section).setMetallicFactor(METALLIC).setExtras({ glow: section });
  if (!m.getEmissiveTexture()) throw new Error(`prepare-enterprise: section ${section} has no emissive map`);
}

// 4. scene: the root and one node per section, one mesh with all of the section's primitives (joined per material below)
const scene = doc.createScene('enterprise');
const top = doc.createNode('enterprise'); scene.addChild(top);
for (const section of Object.values(SECTIONS)) {
  const mesh = doc.createMesh(section);
  for (const a of all) if (a.section === section) mesh.addPrimitive(a.prim);
  top.addChild(doc.createNode(section).setMesh(mesh));
}
for (const s of root.listScenes()) if (s !== scene) s.dispose();
const keep = new Set([top, ...top.listChildren()]);
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
root.setDefaultScene(scene);

// 5. join per section, weld, decimate, textures to WebP, compress
for (const m of root.listMeshes()) {
  const prims = m.listPrimitives(); if (prims.length < 2) continue;
  const joined = joinPrimitives(prims); prims.forEach(p => { m.removePrimitive(p); p.dispose(); }); m.addPrimitive(joined);
}
const before = triangles();
// the export is unwelded (two vertices per triangle in the aux section, every face its own normal and tangent): the simplifier finds
// no shared edges and collapses nothing. Welding on position + uv alone (the normal of the first vertex kept, the tangents dropped --
// three.js derives them in the shader) connects the faces; uv seams stay seams.
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) weldPositionUv(p);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: SIMPLIFY_ERROR }), dedup(), prune());
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_PX, TEXTURE_PX], quality: WEBP_QUALITY }));
for (const e of root.listExtensionsUsed()) if (e.extensionName !== 'EXT_texture_webp') e.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
root.getAsset().extras = { title: 'Enterprise D 2 8 Simple Bake Export (modified)', author: 'HaughtyGrayAlien (https://sketchfab.com/HaughtyGrayAlien)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/enterprise-d-2-8-simple-bake-export-02aeda1aaafd4a3591892ed5a2aeac33' };
await io.write(output, doc);

// 6. report: what the game can rely on (the spec's measured facts)
const r3 = (v) => +v.toFixed(2);
console.log('wrote', output, 'triangles', before, '->', triangles(), 'textures', root.listTextures().length, root.listTextures().map(t => t.getMimeType() + ' ' + t.getSize().join('x')).join(', '));
for (const m of root.listMeshes()) { const b = boundsOf(m.listPrimitives()); console.log('section', m.getName(), 'tris', triangles(m), 'min', b.min.map(r3), 'max', b.max.map(r3)); }
const bAll = boundsOf(root.listMeshes().flatMap(m => m.listPrimitives()));
console.log('ship length', r3(bAll.max[0] - bAll.min[0]), 'beam', r3(bAll.max[2] - bAll.min[2]), 'height', r3(bAll.max[1] - bAll.min[1]), 'bounds', bAll.min.map(r3), bAll.max.map(r3));
// the underside profile along the ship: per 25 m slice of x, the lowest and highest point and the half beam -- the room's hover
// height and the lettering's drape read from it
console.log('profile (x from, x to, minY, maxY, minZ, maxZ) per 25 m:');
for (let x = Math.floor(bAll.min[0] / 25) * 25; x < bAll.max[0]; x += 25) {
  const s = sliceBounds(root.listMeshes().flatMap(m => m.listPrimitives()), 0, x, x + 25);
  if (s) console.log(' ', x, x + 25, s.min[1].toFixed(1), s.max[1].toFixed(1), s.min[2].toFixed(1), s.max[2].toFixed(1));
}

function sectionNodeName(node) { let n = node; while (n && !Object.keys(SECTIONS).some(p => n.getName().startsWith(p))) n = n.listParents().find(p => p.propertyType === 'Node'); return n ? n.getName() : node.getName(); }
function triangles(mesh) { const meshes = mesh ? [mesh] : root.listMeshes(); return meshes.flatMap(m => m.listPrimitives()).reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0); }
function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return { min, max };
}
function sliceBounds(prims, axis, from, to) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; let n = 0;
  for (const p of prims) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); if (v[axis] < from || v[axis] >= to) continue; n++; for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } } }
  return n ? { min, max } : null;
}
// one vertex per (position to 1 mm, uv to 1/8192): the index buffer is remapped, POSITION / TEXCOORD_0 / NORMAL take the first
// vertex of each group, TANGENT goes
function weldPositionUv(prim) {
  const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), nrm = prim.getAttribute('NORMAL'), idx = prim.getIndices();
  const n = pos.getCount(), src = idx ? idx.getArray() : Uint32Array.from({ length: n }, (_, i) => i);
  const P = pos.getArray(), U = uv ? uv.getArray() : null, N = nrm ? nrm.getArray() : null, map = new Map(), remap = new Uint32Array(n);
  const outP = [], outU = [], outN = [];
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(P[3 * i] * 1000)},${Math.round(P[3 * i + 1] * 1000)},${Math.round(P[3 * i + 2] * 1000)}` + (U ? `|${Math.round(U[2 * i] * 8192)},${Math.round(U[2 * i + 1] * 8192)}` : '');
    let j = map.get(key);
    if (j === undefined) { j = outP.length / 3; map.set(key, j); outP.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); if (U) outU.push(U[2 * i], U[2 * i + 1]); if (N) outN.push(N[3 * i], N[3 * i + 1], N[3 * i + 2]); }
    remap[i] = j;
  }
  const buf = root.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  prim.setAttribute('POSITION', acc('VEC3', new Float32Array(outP)));
  if (U) prim.setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(outU)));
  if (N) prim.setAttribute('NORMAL', acc('VEC3', new Float32Array(outN)));
  if (prim.getAttribute('TANGENT')) prim.setAttribute('TANGENT', null);
  prim.setIndices(acc('SCALAR', Uint32Array.from(src, i => remap[i])));
}
// positions through f, normals through the rotation-only g; every accessor is detached first so shared ones are not mapped twice
function mapPositions(prim, f, g) {
  for (const [sem, fn] of [['POSITION', f], ['NORMAL', g], ['TANGENT', g]]) {
    const a = prim.getAttribute(sem); if (!a) continue;
    const c = a.clone(); prim.setAttribute(sem, c);
    const v = []; for (let i = 0; i < c.getCount(); i++) { c.getElement(i, v); const w = v[3]; const r = fn(v); if (w !== undefined) r[3] = w; c.setElement(i, r); }
  }
}
