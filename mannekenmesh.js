// #585: the Manneken Pis's fountain corner -- built from manneken.js's numbers (which are pure and unit-tested; this file is not).
// One merged mesh per colour (the fries pattern), about 4000 triangles: the two cream house walls with their chamfered corner, the
// arched bluestone niche, the half-round basin with its water, the pedestal and the wrought-iron railing. The bronze boy himself is
// the loaded model (loadMannekenFigure); the jet is a thin tube along jetArc with a scrolling stripe texture (stepJet).
//
// buildManneken returns a group in the corner's frame (+x out of the niche, y up from the room floor, z across), to be stood on the
// floor and turned to face the portal.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MANNEKEN, jetArc } from './manneken.js';

const COLOURS = { plaster: 0xe6dcc4, stone: 0x6f7378, iron: 0x1e1e1e };
const WATER = { colour: 0x9fd3e8, surface: 0xbfe4f2 };
const JET_SCROLL = 1.6;   // how fast the stripe texture runs down the tube, in texture widths per second

// the jet's water: soft pale stripes across the tube, so the scrolling offset reads as a falling stream
function jetTexture() {
  const c = document.createElement('canvas'), w = c.width = 32, h = c.height = 128, g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i <= 8; i++) grd.addColorStop(i / 8, i % 2 ? 'rgba(255,255,255,0.95)' : 'rgba(175,220,240,0.45)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 3); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildManneken(cfg = MANNEKEN) {
  const group = new THREE.Group(), parts = {};
  const add = (key, g) => (parts[key] ||= []).push(g.toNonIndexed());
  const M = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3();
  const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(M.compose(T.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(1, 1, 1)));
  const box = (key, w, h, d, x, y, z, ry = 0) => add(key, place(new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry, 0));
  const W = cfg.walls, CH = cfg.chamfer, N = cfg.niche, B = cfg.basin, PD = cfg.pedestal, RA = cfg.railing;

  // 1. the chamfered front, on the plane x = CH.x: a pier each side of the niche opening and the plaster over its arch
  const pier = CH.hw - N.w / 2;
  for (const side of [-1, 1]) box('plaster', W.t, W.h, pier, CH.x - W.t / 2, W.h / 2, side * (N.w / 2 + pier / 2));
  box('plaster', W.t, W.h - N.h, N.w, CH.x - W.t / 2, N.h + (W.h - N.h) / 2, 0);
  // 2. the two walls, splaying back at a right angle from the chamfer's edges (so the chamfer's corner points at the viewer)
  for (const side of [-1, 1]) {
    const ry = side * Math.PI / 4, run = (W.len + W.t) / 2;   // the slab's centre, measured back along its own axis from the chamfer edge
    box('plaster', W.len + W.t, W.h, W.t, CH.x - Math.SQRT1_2 * run, W.h / 2, side * (CH.hw + Math.SQRT1_2 * run), ry);
  }
  // 3. the bluestone plinth band at the feet and the cornice at the top, each a slab standing a little proud of the plaster
  for (const [y, h] of [[cfg.band.h / 2, cfg.band.h], [W.h - 0.15, 0.3]]) {
    box('stone', W.t + 0.16, h, 2 * CH.hw + 0.16, CH.x - W.t / 2, y, 0);
    for (const side of [-1, 1]) {
      const ry = side * Math.PI / 4, run = (W.len + W.t) / 2;
      box('stone', W.len + W.t, h, W.t + 0.16, CH.x - Math.SQRT1_2 * run, y, side * (CH.hw + Math.SQRT1_2 * run), ry);
    }
  }
  // 4. the niche: its back panel at the depth of the recess, a jamb each side, and the arched bluestone frame standing on the front face
  const springer = N.h - N.w / 2;   // where the arch springs from the jambs
  box('stone', 0.12, N.h, N.w, CH.x - N.depth, N.h / 2, 0);
  for (const side of [-1, 1]) box('stone', N.depth, N.h, 0.1, CH.x - N.depth / 2, N.h / 2, side * (N.w / 2 - 0.05));
  for (const side of [-1, 1]) box('stone', 0.14, springer, 0.18, CH.x + 0.07, springer / 2, side * (N.w / 2 + 0.09));
  add('stone', place(new THREE.TorusGeometry(N.w / 2 + 0.09, 0.07, 6, 20, Math.PI), CH.x + 0.07, springer, 0, 0, Math.PI / 2));
  // the little shell over the arch: a half dome, squashed flat against the wall
  const shell = new THREE.SphereGeometry(0.42, 14, 7, 0, Math.PI); shell.scale(1, 1, 0.45);
  add('stone', place(shell, CH.x + 0.04, N.h + 0.16, 0, 0, Math.PI / 2));
  // 5. the basin: a half-round shell on the +x side of the axis, closed flat against the wall, with its rim and the water in it
  const halfShell = (r, h) => new THREE.CylinderGeometry(r, r, h, 18, 1, true, 0, Math.PI);
  add('stone', place(halfShell(B.r, B.rim), 0, B.rim / 2, 0));
  add('stone', place(halfShell(B.r - B.wall, B.rim), 0, B.rim / 2, 0));
  add('stone', place(new THREE.RingGeometry(B.r - B.wall, B.r, 18, 1, -Math.PI / 2, Math.PI), 0, B.rim, 0, -Math.PI / 2));
  box('stone', B.wall, B.rim, 2 * B.r, -B.wall / 2, B.rim / 2, 0);                       // the flat back against the niche
  add('stone', place(new THREE.CircleGeometry(B.r - B.wall, 18, -Math.PI / 2, Math.PI), 0, 0.04, 0, -Math.PI / 2));   // the basin's floor
  // 6. the pedestal the boy stands on, with a moulded cap
  add('stone', place(new THREE.CylinderGeometry(PD.r, PD.r, PD.top, 14), 0, PD.top / 2, 0));
  add('stone', place(new THREE.CylinderGeometry(PD.r + 0.05, PD.r + 0.05, 0.08, 14), 0, PD.top - 0.04, 0));
  // 7. the wrought-iron railing: a half circle of bars with spear tips between a top and a bottom rail
  const bars = Math.round(Math.PI * RA.r / RA.step);
  for (let i = 0; i <= bars; i++) {
    const a = -Math.PI / 2 + Math.PI * (i / bars), x = Math.cos(a) * RA.r, z = Math.sin(a) * RA.r;   // the half circle round the front
    add('iron', place(new THREE.CylinderGeometry(0.014, 0.014, RA.h, 6, 1, true), x, RA.h / 2, z));
    add('iron', place(new THREE.ConeGeometry(0.03, 0.14, 6, 1, true), x, RA.h + 0.07, z));
  }
  for (const y of [RA.h - 0.1, 0.14]) {   // the two rails: the torus's half arc stood up (x) and then turned onto the front half (y)
    const rail = new THREE.TorusGeometry(RA.r, 0.022, 5, Math.max(16, bars), Math.PI);
    rail.rotateX(Math.PI / 2); rail.rotateY(Math.PI / 2); rail.translate(0, y, 0);
    add('iron', rail);
  }
  for (const side of [-1, 1]) add('iron', place(new THREE.CylinderGeometry(0.035, 0.035, RA.h + 0.2, 8), 0, (RA.h + 0.2) / 2, side * RA.r));

  for (const [key, geos] of Object.entries(parts)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshLambertMaterial({ color: COLOURS[key], side: THREE.DoubleSide }));
    mesh.userData.role = 'manneken'; group.add(mesh);
  }
  // 8. the water surface in the basin, and the jet arcing into it from the boy
  const surface = new THREE.Mesh(new THREE.CircleGeometry(B.r - B.wall, 18, -Math.PI / 2, Math.PI),
    new THREE.MeshPhongMaterial({ color: WATER.surface, shininess: 140, specular: 0xd8e8ff }));
  surface.rotation.x = -Math.PI / 2; surface.position.y = B.water; surface.userData.role = 'manneken'; group.add(surface);

  const curve = new THREE.CatmullRomCurve3(jetArc(cfg).map(p => new THREE.Vector3(p.x, p.y, p.z)));
  const tex = jetTexture();
  const jet = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, cfg.jet.r, 6, false),
    new THREE.MeshLambertMaterial({ map: tex, color: WATER.colour, transparent: true, opacity: 0.7, depthWrite: false }));
  jet.userData.role = 'manneken'; group.add(jet);
  group.userData.role = 'manneken'; group.userData.jet = tex;
  return group;
}

// the bronze boy, fetched the first time the Atomium room is built: the prepared file stands him 0.61 m tall with his feet on y = 0
// and his face on +z, so he only has to be set on the pedestal and turned a quarter turn into the corner's forward (+x). Resolves
// with what was loaded; offline or blocked, the corner stays as it is and the caller logs the failure.
export async function loadMannekenFigure(group, cfg = MANNEKEN) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const boy = (await loader.loadAsync(cfg.url)).scene;
  let tris = 0;
  boy.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false; o.userData.role = 'manneken';
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  const height = new THREE.Box3().setFromObject(boy).getSize(new THREE.Vector3()).y;
  boy.position.set(0, cfg.pedestal.top, 0); boy.rotation.y = Math.PI / 2;
  group.add(boy);
  return { tris, height };
}

// the stream: the stripe texture runs along the tube every frame, which is what makes the still geometry read as flowing water
export function stepJet(group, dt) {
  if (!group || !group.userData.jet) return;
  group.userData.jet.offset.y = (group.userData.jet.offset.y - dt * JET_SCROLL) % 1;
}
