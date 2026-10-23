// #451: the giant fries figure's meshes -- built from fries.js's numbers (which are pure and unit-tested; this file is not). One merged
// mesh per colour (the parts are baked into the figure's frame first), the cone with a painted canvas lattice, and the fry bundle as
// one InstancedMesh; about 5000 triangles all told. buildFries returns a group standing on the room floor, turned to face the portal.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FRIES, fryBundle, coneRadiusAt } from './fries.js';

const COLOURS = {
  plinth: 0x2b2e34, skin: 0xe8a878, black: 0x151515, white: 0xf6f6f2, iris: 0x22b4c6, pupil: 0x0c0c0c, tongue: 0xd8485c,
  shoe: 0x5c3b2a, sole: 0xe48ba3, sock: 0xf2c530, cuff: 0xd23028, lace: 0xe9e2d4, fryTop: 0xc89a1c, lid: 0xd9d6cc,
};
const FRY_YELLOW = new THREE.Color(0xf2c42c), UP = new THREE.Vector3(0, 1, 0);

// the cone's paper: white with a blue diamond lattice, and the face's skin-coloured patch on the front (u = 0.25 faces +x on a ConeGeometry)
function coneTexture(cfg) {
  const c = document.createElement('canvas'), w = c.width = 1024, h = c.height = 512, g = c.getContext('2d');
  g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2f80d8'; g.lineWidth = 9; g.lineCap = 'round';
  for (let k = -h; k < w + h; k += 96) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); }
  const span = cfg.cone.top - cfg.cone.tip, vOf = (y) => 1 - (y - cfg.cone.tip) / span;   // canvas v = 0 at the top of the cone
  const fx = w * 0.25, fy = h * (vOf(cfg.face.noseY) - 0.02), ry = h * (vOf(cfg.face.mouthY - 1.1) - vOf(cfg.face.browY + 0.9)) / 2;
  g.fillStyle = '#e8a878'; g.beginPath(); g.ellipse(fx, fy, w * 0.11, ry, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(120,60,30,.35)'; g.lineWidth = 6; g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}

export function buildFries(cfg = FRIES) {
  const group = new THREE.Group(), parts = {};
  const add = (key, g) => (parts[key] ||= []).push(g.toNonIndexed());
  const M = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3();
  const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { g.applyMatrix4(M.compose(T.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz))); return g; };
  const box = (key, w, h, d, x, y, z, rx, ry, rz) => add(key, place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz));
  const ball = (key, r, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0) => add(key, place(new THREE.SphereGeometry(r, 14, 10), x, y, z, 0, ry, rz, sx, sy, sz));
  const tube = (key, r, from, to) => {   // a cylinder between two points
    const d = new THREE.Vector3().subVectors(to, from), len = d.length(), g = new THREE.CylinderGeometry(r, r, len, 12, 1);
    g.applyQuaternion(Q.setFromUnitVectors(UP, d.normalize())); g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2); add(key, g);
  };
  const P = cfg.plinth, H = P.h, SH = cfg.shoe, SK = cfg.sock, C = cfg.cone, F = cfg.face;
  // the plinth (y 0 = the room floor), its top plate a shade lighter
  box('plinth', P.w, H, P.d, 0, H / 2, 0);
  box('lid', P.w - 0.3, 0.04, P.d - 0.3, 0, H + 0.02, 0);
  // the boots: pink sole, brown shoe with a boot collar at the heel and three laces across the instep; splayed outward; sock and red cuff; the leg
  for (const side of [-1, 1]) {
    const zc = side * SH.gap, ry = -side * SH.splay, cs = Math.cos(ry), sn = Math.sin(ry);
    const at = (lx, lz) => [SH.fwd + lx * cs + lz * sn, zc - lx * sn + lz * cs];   // a point of the shoe's own frame (x ahead, z across) in the figure's
    let [x, z] = at(0, 0);
    box('sole', SH.len + 0.2, SH.sole, SH.w + 0.2, x, H + SH.sole / 2, z, 0, ry, 0);
    box('shoe', SH.len, SH.h, SH.w, x, H + SH.sole + SH.h / 2, z, 0, ry, 0);
    [x, z] = at(SH.len / 2 - 0.1, 0); ball('shoe', SH.w / 2, x, H + SH.sole + SH.h * 0.45, z, 1.1, 0.9, 1, ry);   // the rounded toe
    [x, z] = at(-SH.len / 2 + 0.9, 0); box('shoe', 1.8, 1.0, SH.w - 0.3, x, H + SH.sole + SH.h + 0.5, z, 0, ry, 0);   // the boot collar
    for (let i = 0; i < 3; i++) { [x, z] = at(0.9 - i * 0.55, 0); box('lace', 0.1, 0.12, SH.w * 0.7, x, H + SH.sole + SH.h + 0.04, z, 0, ry + (i % 2 ? 0.35 : -0.35), 0); }
    [x, z] = at(-SH.len / 2 + 0.9, 0);
    const sockY = H + SH.sole + SH.h + 1.0;
    add('sock', place(new THREE.CylinderGeometry(SK.r, SK.r, SK.h, 12), x, sockY + SK.h / 2, z));
    add('cuff', place(new THREE.CylinderGeometry(SK.r + 0.08, SK.r + 0.08, SK.cuff, 12), x, sockY + SK.h + SK.cuff / 2, z));
    tube('skin', cfg.leg.r, new THREE.Vector3(x, sockY + SK.h + SK.cuff, z), new THREE.Vector3(0.1, H + cfg.leg.top, zc * 0.9));
  }
  // the cone: open at both ends, lattice paper, a lip round the top and a dark-yellow disc closing it under the fries
  const coneH = C.top - C.tip, cone = new THREE.ConeGeometry(C.r, coneH, 28, 1, true); cone.translate(0, H + C.tip + coneH / 2, 0);
  const coneMesh = new THREE.Mesh(cone, new THREE.MeshLambertMaterial({ map: coneTexture(cfg) })); coneMesh.userData.role = 'fries'; group.add(coneMesh);
  add('white', place(new THREE.TorusGeometry(C.r, C.lip / 2, 8, 36), 0, H + C.top, 0, Math.PI / 2));
  add('fryTop', place(new THREE.CircleGeometry(C.r - 0.1, 28), 0, H + C.top - 0.3, 0, -Math.PI / 2));
  // the face on the front (+x): bushy brows, one open turquoise eye (-z, the viewer's right), one squinting (+z), a big nose, the tongue out
  const front = (y) => coneRadiusAt(y, C);
  for (const side of [-1, 1]) box('black', 1.9, 0.5, 0.45, front(F.browY) + 0.1, H + F.browY + (side < 0 ? 0 : -0.25), side * F.eyeZ, 0, 0, side * 0.3);
  ball('white', 0.75, front(F.eyeY) + 0.2, H + F.eyeY, -F.eyeZ, 0.55, 1, 1);
  ball('iris', 0.4, front(F.eyeY) + 0.55, H + F.eyeY, -F.eyeZ, 0.5, 1, 1);
  ball('pupil', 0.18, front(F.eyeY) + 0.72, H + F.eyeY, -F.eyeZ, 0.5, 1, 1);
  ball('skin', 0.65, front(F.eyeY) + 0.15, H + F.eyeY - 0.1, F.eyeZ, 0.5, 0.7, 1);   // the squinting eye's puffed lid
  add('black', place(new THREE.TorusGeometry(0.55, 0.08, 6, 16, Math.PI), front(F.eyeY) + 0.45, H + F.eyeY - 0.3, F.eyeZ, 0, Math.PI / 2, Math.PI));
  ball('skin', 0.75, front(F.noseY) + 0.75, H + F.noseY, 0, 1.5, 1.0, 1.15);
  box('black', 0.2, 0.12, 1.5, front(F.mouthY) + 0.2, H + F.mouthY + 0.45, 0.3, 0, 0, 0);
  ball('tongue', 0.6, front(F.mouthY) + 0.9, H + F.mouthY - 0.1, 0.9, 1.6, 0.35, 0.9, 0.5, -0.2);
  // the arms: the viewer's-left hand (+z) holds a single fry across in front of the mouth, the other (-z) gives a thumbs up
  const armY = F.mouthY + 0.5, fryHand = new THREE.Vector3(front(armY) + 1.6, H + armY - 0.1, 2.5), thumbHand = new THREE.Vector3(front(armY) + 1.1, H + armY + 0.6, -3.4);
  tube('skin', 0.45, new THREE.Vector3(0.3, H + armY - 0.6, 1.2), fryHand);
  ball('skin', 0.8, fryHand.x, fryHand.y, fryHand.z, 1, 0.9, 1);
  box('fry', cfg.fries.w, cfg.fries.w, 4.6, fryHand.x + 0.3, fryHand.y, fryHand.z - 1.9, 0, 0, 0);
  tube('skin', 0.45, new THREE.Vector3(0.3, H + armY - 0.4, -1.4), thumbHand);
  ball('skin', 0.8, thumbHand.x, thumbHand.y, thumbHand.z, 1, 0.95, 1);
  add('skin', place(new THREE.CylinderGeometry(0.28, 0.3, 1.4, 10), thumbHand.x + 0.1, thumbHand.y + 1.1, thumbHand.z, 0, 0, 0.15));
  ball('skin', 0.3, thumbHand.x + 0.1, thumbHand.y + 1.8, thumbHand.z);
  for (const [key, geos] of Object.entries(parts)) {
    const colour = key === 'fry' ? FRY_YELLOW : COLOURS[key], m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshLambertMaterial({ color: colour }));
    m.userData.role = 'fries'; group.add(m);
  }
  // the bundle: one instanced box, a unit stick standing on its base, scaled to each fry's length and leaned its way
  const bundle = fryBundle(cfg), stick = new THREE.BoxGeometry(cfg.fries.w, 1, cfg.fries.w); stick.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(stick, new THREE.MeshLambertMaterial({ color: 0xffffff }), bundle.length), col = new THREE.Color();
  bundle.forEach((f, i) => {
    Q.setFromUnitVectors(UP, T.set(Math.sin(f.tilt) * Math.cos(f.az), Math.cos(f.tilt), Math.sin(f.tilt) * Math.sin(f.az)));   // the stick leans outward, its way
    inst.setMatrixAt(i, M.compose(T.set(f.x, H + C.top - cfg.fries.sink, f.z), Q, S.set(1, f.len, 1)));
    inst.setColorAt(i, col.copy(FRY_YELLOW).multiplyScalar(f.shade));
  });
  inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true; inst.userData.role = 'fries'; group.add(inst);
  return group;
}

// the figure's triangle count (instances counted once each)
export function friesTriangles(group) {
  let tris = 0;
  group.traverse(o => { if (!o.isMesh) return; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); });
  return tris;
}
