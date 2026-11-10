// #811: the Space Shuttle Enterprise on Launch Pad 39A as meshes -- built from shuttle.js's numbers (which are pure and
// unit-tested; this file is not): the tank and boosters as cylinders and cones, the orbiter from an elliptic fuselage,
// extruded wings and fin, two pods and three engine bells; the hardstand, the platform, the lattice tower, the arms, the
// service structure and the water tower from boxes, beams, cylinders and a sphere. One merged mesh per colour
// (userData.role = 'shuttle'), no textures, no text, no flags, no insignia. In the pad's frame: y = 0 on the floor, +x
// along the boosters' line, +z towards the orbiter. Verified by the browser test (#811).
import * as THREE from 'three';
import { partsGroup } from './artemismesh.js';
import { SHUTTLE, stackParts, stackBase, padLayout } from './shuttle.js';

const BELLY_ARC = [0.62 * Math.PI, 0.76 * Math.PI];   // three's cylinder angle runs from +z (the fin side); the belly faces -z

// an elliptic tube (or cone) along y from y0 to y1 at (0, z), radii rx across the span and rz belly-to-top, split into the
// white upper part and the black belly; `droop` lowers the top end towards the belly (the nose)
function ellipticPiece(r0, r1, y0, y1, rx, rz, z, droop = 0) {
  const piece = (start, len) => {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 32, 4, false, start, len), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + (y1 - y0) / 2) / (y1 - y0);
      pos.setXYZ(i, pos.getX(i) * rx, pos.getY(i) + (y0 + y1) / 2, pos.getZ(i) * rz + z - droop * t);
    }
    g.computeVertexNormals(); return g;
  };
  const [a, b] = BELLY_ARC;
  return { belly: piece(a, b), white: piece(a + b, 2 * Math.PI - b) };
}

// a flat outline (pairs) extruded `depth` along +z from z0
function slab(points, depth, z0) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }); g.translate(0, 0, z0); return g;
}

// the orbiter in the stack frame: x = span, y = up its length, z = belly (z0) to fin
function orbiterGeometries(cfg) {
  const O = cfg.orbiter, B = O.body, y = (u) => O.y0 + u, z0 = O.off - B.d / 2, top = O.off + B.d / 2, out = { white: [], belly: [], dark: [] };
  const tube = ellipticPiece(1, 1, y(B.u0), y(B.u1), B.w / 2, B.d / 2, O.off);
  const nose = ellipticPiece(1, 0.12, y(B.u1), y(O.length), B.w / 2, B.d / 2, O.off, 0.9);
  out.white.push(tube.white, nose.white); out.belly.push(tube.belly, nose.belly);
  const wing = O.wing.concat(O.wing.map(([u, w]) => [u, -w]).reverse()).map(([u, w]) => [w, y(u)]);
  out.belly.push(slab(wing, O.wingT * 0.4, z0)); out.white.push(slab(wing, O.wingT * 0.6, z0 + O.wingT * 0.4));
  const fin = slab(O.tail.map(([u, h]) => [-h, y(u)]), O.tailT, -O.tailT / 2); fin.rotateY(Math.PI / 2); fin.translate(0, 0, top - 0.3); out.white.push(fin);
  for (const s of [-1, 1]) {   // the OMS pods either side of the fin, rounded at the front
    const pod = new THREE.CylinderGeometry(O.oms.r, O.oms.r, O.oms.u1 - O.oms.u0, 20); pod.translate(s * O.oms.w, y((O.oms.u0 + O.oms.u1) / 2), O.off + O.oms.n);
    const cap = new THREE.CylinderGeometry(0.2, O.oms.r, 2.2, 20); cap.translate(s * O.oms.w, y(O.oms.u1) + 1.1, O.off + O.oms.n);
    out.white.push(pod, cap);
  }
  const W = O.windows, win = new THREE.BoxGeometry(W.w, W.u1 - W.u0, 0.6); win.translate(0, y((W.u0 + W.u1) / 2), O.off + W.n); out.belly.push(win);
  return out;
}

const enginePart = (cfg, [w, n]) => {
  const O = cfg.orbiter, E = O.engines;
  return { kind: 'cone', r0: E.exit, r1: E.throat, y0: O.y0, y1: O.y0 + E.len, x: w, z: O.off + n, colour: cfg.colours.nozzle };
};

// a box between x0..x1, y0..y1, z0..z1
function block(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g;
}
// a box whose top face is the `top` ranges and whose foot is the `foot` ranges (the hardstand's leaning sides)
function frustum(foot, top, h) {
  const g = new THREE.BoxGeometry(1, 1, 1), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const r = pos.getY(i) > 0 ? top : foot, pick = (range, v) => (v > 0 ? range[1] : range[0]);
    pos.setXYZ(i, pick(r.x, pos.getX(i)), pos.getY(i) > 0 ? h : 0, pick(r.z, pos.getZ(i)));
  }
  g.computeVertexNormals(); return g;
}
// a square beam of thickness t from p to q
function beam(p, q, t) {
  const a = new THREE.Vector3(...p), b = new THREE.Vector3(...q), d = b.clone().sub(a), g = new THREE.BoxGeometry(t, t, d.length());
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g;
}

// the lattice tower: four corner posts, a ring of girders every level and one diagonal per face and level; the hammerhead
// crane on top and the lightning mast over it
function towerGeometries(cfg, F) {
  const P = cfg.pad.fss, h = F.w / 2, t = P.beam, step = (F.y1 - F.y0) / F.levels, out = [];
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]) => [F.x + a, F.z + b]);
  for (const [x, z] of corners) out.push(block(x - t, x + t, F.y0, F.y1, z - t, z + t));
  for (let i = 0; i <= F.levels; i++) {
    const y = F.y0 + i * step;
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = corners[k], [x1, z1] = corners[(k + 1) % 4];
      out.push(beam([x0, y, z0], [x1, y, z1], t));
      if (i < F.levels) out.push(beam([x0, y, z0], [x1, y + step, z1], t * 0.7));
    }
  }
  const C = P.crane; out.push(block(F.x - C.w / 2, F.x + C.w / 2, F.y1, F.crane, F.z - h, F.z + h));
  out.push(block(F.x - C.len / 2, F.x + C.len / 2, F.crane - 1.6, F.crane, F.z - C.w / 2, F.z + C.w / 2));
  const mast = new THREE.CylinderGeometry(P.mast.r1, P.mast.r0, F.mastTop - F.crane, 10); mast.translate(F.x, (F.crane + F.mastTop) / 2, F.z); out.push(mast);
  return out;
}

// the pad: hardstand halves, the dark trench floor, the mounts, the platform, the tower, the arms with the white room and
// the hood, the swung-back service structure on its legs and the water tower
function padGeometries(cfg) {
  const L = padLayout(cfg), P = cfg.pad, C = cfg.colours, out = { [C.concrete]: [], [C.trench]: [], [C.deck]: [], [C.steel]: [], [C.rss]: [], [C.arm]: [], [C.white]: [], [C.water]: [] };
  for (const H of L.hard) out[C.concrete].push(frustum(H.foot, H.top, H.h));
  out[C.trench].push(block(L.trench.x[0], L.trench.x[1], 0, 0.06, L.trench.z[0], L.trench.z[1]));
  for (const p of L.pedestals) out[C.deck].push(block(p.x - p.s / 2, p.x + p.s / 2, p.y0, p.y1, p.z - p.s / 2, p.z + p.s / 2));
  out[C.deck].push(block(-L.deck.w / 2, L.deck.w / 2, L.deck.y0, L.deck.y1, -L.deck.d / 2, L.deck.d / 2));
  out[C.steel].push(...towerGeometries(cfg, L.fss));
  const A = P.arm, a = L.arm; out[C.arm].push(block(a.x[0], a.x[1] - A.room, a.y - A.h / 2, a.y + A.h / 2, a.z - A.w / 2, a.z + A.w / 2));
  out[C.white].push(block(a.x[1] - A.room, a.x[1], a.y - A.room / 2, a.y + A.room / 2, a.z - A.room / 2, a.z + A.room / 2));
  const V = L.vent; out[C.arm].push(block(V.x[0], V.x[1], V.y - P.vent.w / 2, V.y + P.vent.w / 2, V.z - P.vent.w / 2, V.z + P.vent.w / 2));
  const cap = new THREE.CylinderGeometry(V.cap.r * 0.8, V.cap.r, V.cap.y1 - V.cap.y0, 24); cap.translate(0, (V.cap.y0 + V.cap.y1) / 2, 0); out[C.white].push(cap);
  const R = L.rss; out[C.rss].push(block(R.x - R.w / 2, R.x + R.w / 2, R.y0, R.y1, R.z - R.d / 2, R.z + R.d / 2));
  for (const s of [-1, 1]) out[C.steel].push(block(R.x + s * (R.w / 2 - P.rss.leg), R.x + s * R.w / 2, P.hard.h, R.y0, R.z - P.rss.leg, R.z + P.rss.leg));
  const W = L.water, top = new THREE.SphereGeometry(W.r, 24, 14); top.translate(W.x, W.y1 - W.r, W.z); out[C.water].push(top);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out[C.water].push(beam([W.x + sx * W.spread, 0, W.z + sz * W.spread], [W.x + sx * W.r * 0.45, W.y1 - W.r * 1.6, W.z + sz * W.r * 0.45], P.water.leg * 2));
  return out;
}

export function buildShuttle(cfg = SHUTTLE) {
  const C = cfg.colours, g = orbiterGeometries(cfg), base = stackBase(cfg);
  const parts = [...stackParts(cfg), ...cfg.orbiter.engines.at.map(at => enginePart(cfg, at))].map(p => ({ ...p, y0: p.y0 + base, y1: p.y1 + base }));
  for (const geos of [g.white, g.belly]) for (const geo of geos) geo.translate(0, base, 0);
  const pad = padGeometries(cfg);
  pad[C.white].push(...g.white); pad[C.belly] = g.belly;
  return partsGroup(parts, pad, 'shuttle');
}
