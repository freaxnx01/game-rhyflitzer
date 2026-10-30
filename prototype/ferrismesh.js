// #513: the Ferris wheel as meshes -- built from ferris.js's numbers (which are pure and unit-tested; this
// file is not): the rim, the spokes and the hub drum and the LED instances rotate about the axle; the two A-frames, their concrete
// feet and the axle stand still; each gondola hangs from a pivot on the rim, and setWheelAngle counter-rotates
// every pivot, so the gondolas stay upright while the wheel carries them round. One merged mesh per colour for
// the static parts and the wheel, one small mesh per gondola cabin and roof, userData.role = 'ferris' on every
// mesh, no textures, no text, no flags, no logos. Verified by the browser test (#513).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FERRIS, gondolaAngles, legSegments, ledLayout, ledColour, burstsLive, particle } from './ferris.js';

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
// spokes, hub drum and the 48 gondola pivots), `gondolas` those pivots -- what setWheelAngle counter-rotates.
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
  const axle = new THREE.CylinderGeometry(1.8, 1.8, cfg.hub.len, 16);
  axle.rotateZ(Math.PI / 2); axle.translate(0, cfg.hub.y, 0);
  steel.push(axle);
  group.add(merged(steel, C.steel), merged(feet, C.foot));
  // the rotating part: two rim rings at x = +-3, 32 spoke pairs (one spoke to each ring per direction) and
  // the hub drum
  const wheel = new THREE.Group();
  wheel.position.set(0, cfg.hub.y, 0);
  const white = [], drumSteel = [];
  const X = cfg.led.ringX;
  for (const sx of [-1, 1]) {
    const ring = new THREE.TorusGeometry(cfg.rim, 1.5, 8, 128);
    ring.rotateY(Math.PI / 2); ring.translate(sx * X, 0, 0);
    white.push(ring);
  }
  for (let i = 0; i < cfg.led.spokes; i++) {
    const t = i / cfg.led.spokes * 2 * Math.PI, y = cfg.rim * Math.sin(t), z = cfg.rim * Math.cos(t);
    for (const sx of [-1, 1]) white.push(tube([0, cfg.hub.r * Math.sin(t), cfg.hub.r * Math.cos(t)], [sx * X, y, z], 0.4, 6));
  }
  const drum = new THREE.CylinderGeometry(cfg.hub.r, cfg.hub.r, cfg.hub.len, 24);
  drum.rotateZ(Math.PI / 2);
  drumSteel.push(drum);
  wheel.add(merged(white, C.rim), merged(drumSteel, C.steel));
  // the 48 gondolas: a pivot on the rim, the cabin hanging `drop` m below it and a flat dark roof on the
  // cabin -- setWheelAngle counter-rotates the pivot, so the cabin hangs upright at every point of the turn
  const gondolas = [], G = cfg.gondola, mats = C.gondolas.map(c => new THREE.MeshLambertMaterial({ color: c, emissive: 0x332211 }));   // #588: faint warm glow, lit cabins
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
  const leds = buildLeds(cfg); wheel.add(leds.mesh);
  group.add(wheel);
  return { group, wheel, gondolas, leds: leds.mesh, ledList: leds.list };
}

// #588: the LEDs as one InstancedMesh (small unlit octahedra, per-instance colour) in the rotating wheel's frame
function buildLeds(cfg) {
  const list = ledLayout(cfg), mat = new THREE.MeshBasicMaterial({ toneMapped: false }), mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.9), mat, list.length), m = new THREE.Matrix4(), c = new THREE.Color(0, 0, 0);
  for (const l of list) { mesh.setMatrixAt(l.i, m.makeTranslation(l.pos[0], l.pos[1], l.pos[2])); mesh.setColorAt(l.i, c); }
  mesh.frustumCulled = false; mesh.userData.role = 'ferris';
  return { mesh, list };
}

const RGB = [0, 0, 0];
// the light show at t seconds: every LED's colour from ledColour (one reused array, no allocation)
export function setWheelLights(handle, t) {
  const col = handle.leds.instanceColor.array;
  for (const l of handle.ledList) { ledColour(l, t, RGB); col[l.i * 3] = RGB[0]; col[l.i * 3 + 1] = RGB[1]; col[l.i * 3 + 2] = RGB[2]; }
  handle.leds.instanceColor.needsUpdate = true;
}

// #588: the fireworks -- one Points with a fixed pool (5 bursts x 2 salvos x particles), additive vertex colours, in the wheel's frame
const FW_SLOTS = 10, parsed = new Map();
export function buildFireworks(cfg = FERRIS) {
  const n = FW_SLOTS * cfg.fireworks.particles, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const points = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.5, sizeAttenuation: true, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  points.frustumCulled = false; points.userData.role = 'ferris';
  return { points, live: 0 };
}
const PART = [0, 0, 0, 0];
// fills the slots from burstsLive(t); unused slots park at the origin with fade 0 (black adds nothing). Returns the live particle count.
export function setFireworks(fw, t, cfg = FERRIS) {
  const P = cfg.fireworks.particles, pos = fw.points.geometry.attributes.position, col = fw.points.geometry.attributes.color, bursts = burstsLive(t, cfg);
  let live = 0;
  for (let s = 0; s < FW_SLOTS; s++) {
    const b = bursts[s]; let rgb = null;
    if (b) { rgb = parsed.get(b.colour); if (!rgb) { const c = new THREE.Color(b.colour); rgb = [c.r, c.g, c.b]; parsed.set(b.colour, rgb); } }
    for (let j = 0; j < P; j++) {
      const k = (s * P + j) * 3;
      if (!b) { pos.array[k] = pos.array[k + 1] = pos.array[k + 2] = col.array[k] = col.array[k + 1] = col.array[k + 2] = 0; continue; }
      particle(b, j, t - b.t0, PART, cfg);
      pos.array[k] = PART[0]; pos.array[k + 1] = PART[1]; pos.array[k + 2] = PART[2]; col.array[k] = rgb[0] * PART[3]; col.array[k + 1] = rgb[1] * PART[3]; col.array[k + 2] = rgb[2] * PART[3];
    }
    if (b) live += P;
  }
  pos.needsUpdate = true; col.needsUpdate = true; fw.live = live;
  return live;
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