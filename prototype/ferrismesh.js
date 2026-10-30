// #513: the Ferris wheel as meshes -- built from ferris.js's numbers (which are pure and unit-tested; this
// file is not): the rim, the spokes and the hub drum rotate about the axle; the two A-frames, their concrete
// feet and the axle stand still; each gondola hangs from a pivot on the rim, and setWheelAngle counter-rotates
// every pivot, so the gondolas stay upright while the wheel carries them round. One merged mesh per colour for
// the static parts and the wheel, one small mesh per gondola cabin and roof, userData.role = 'ferris' on every
// mesh, no textures, no text, no flags, no logos. Verified by the browser test (#513).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FERRIS, gondolaAngles, legSegments } from './ferris.js';

const UP = new THREE.Vector3(0, 1, 0);

// a thin cylinder from a to b (like the Eiffel placeholder's legs)
function tube(a, b, r, seg) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

// `geos` (all one colour) as one merged mesh with its own Lambert material
function merged(geos, colour) {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  const m = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshLambertMaterial({ color: colour }));
  m.userData.role = 'ferris';
  return m;
}

// the wheel and its two A-frames in the wheel's own frame: y = 0 on the floor, +x along the axle (the room's
// f), the wheel's plane the z-y plane. Returns { group, wheel, gondolas }: `wheel` is the rotating group (rim,
// spokes, hub drum and the 32 gondola pivots), `gondolas` those pivots -- what setWheelAngle counter-rotates.
export function buildWheel(cfg = FERRIS) {
  const C = cfg.colours, group = new THREE.Group();
  // the static stands: two A-frames (four legs from the feet up to the axle ends, legSegments), a concrete
  // block under each leg, and the axle between the frames
  const steel = [], feet = [];
  for (const l of legSegments(cfg)) {
    steel.push(tube(l.a, l.b, l.r, 10));
    const f = new THREE.BoxGeometry(2 * cfg.frame.foot.hw, cfg.frame.foot.h, 2 * cfg.frame.foot.hw);
    f.translate(l.a[0], cfg.frame.foot.h / 2, l.a[2]);
    feet.push(f);
  }
  const axle = new THREE.CylinderGeometry(0.8, 0.8, cfg.hub.len, 16);
  axle.rotateZ(Math.PI / 2); axle.translate(0, cfg.hub.y, 0);
  steel.push(axle);
  group.add(merged(steel, C.steel), merged(feet, C.foot));
  // the rotating part: two rim rings at x = +-1.2, 16 spoke pairs (one spoke to each ring per direction) and
  // the hub drum
  const wheel = new THREE.Group();
  wheel.position.set(0, cfg.hub.y, 0);
  const white = [], drumSteel = [];
  for (const sx of [-1, 1]) {
    const ring = new THREE.TorusGeometry(cfg.rim, 0.6, 8, 48);
    ring.rotateY(Math.PI / 2); ring.translate(sx * 1.2, 0, 0);
    white.push(ring);
  }
  for (let i = 0; i < 16; i++) {
    const t = i / 16 * 2 * Math.PI, y = cfg.rim * Math.sin(t), z = cfg.rim * Math.cos(t);
    for (const sx of [-1, 1]) white.push(tube([0, cfg.hub.r * Math.sin(t), cfg.hub.r * Math.cos(t)], [sx * 1.2, y, z], 0.25, 6));
  }
  const drum = new THREE.CylinderGeometry(cfg.hub.r, cfg.hub.r, cfg.hub.len, 24);
  drum.rotateZ(Math.PI / 2);
  drumSteel.push(drum);
  wheel.add(merged(white, C.rim), merged(drumSteel, C.steel));
  // the 32 gondolas: a pivot on the rim, the cabin hanging `drop` m below it and a flat dark roof on the
  // cabin -- setWheelAngle counter-rotates the pivot, so the cabin hangs upright at every point of the turn
  const gondolas = [], G = cfg.gondola, mats = C.gondolas.map(c => new THREE.MeshLambertMaterial({ color: c }));
  const roofMat = new THREE.MeshLambertMaterial({ color: C.steel });
  for (const [i, t] of gondolaAngles(cfg).entries()) {
    const pivot = new THREE.Group();
    pivot.position.set(0, cfg.rim * Math.sin(t), cfg.rim * Math.cos(t));
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(G.d, G.h, G.w), mats[i % mats.length]);
    cabin.position.y = -G.drop; cabin.userData.role = 'ferris';
    const roof = new THREE.Mesh(new THREE.BoxGeometry(G.d + 0.7, 0.3, G.w + 0.7), roofMat);
    roof.position.y = -G.drop + G.h / 2 + 0.15; roof.userData.role = 'ferris';
    pivot.add(cabin, roof);
    wheel.add(pivot); gondolas.push(pivot);
  }
  group.add(wheel);
  return { group, wheel, gondolas };
}

// the turn: the wheel rotates about its axle and every gondola pivot counter-rotates by the same angle
export function setWheelAngle(handle, angle) {
  handle.wheel.rotation.x = angle;
  for (const g of handle.gondolas) g.rotation.x = -angle;
}

// the group's triangle count (like artemisTriangles)
export function ferrisTriangles(group) {
  let tris = 0;
  group.traverse(o => { if (!o.isMesh) return; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); });
  return tris;
}