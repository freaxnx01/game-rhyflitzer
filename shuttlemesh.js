// #811: the Space Shuttle Enterprise stack as meshes -- built from shuttle.js's numbers (which are pure and unit-tested;
// this file is not): the tank and boosters as cylinders and cones, the orbiter from an elliptic fuselage, extruded wings
// and fin, two pods and three engine bells. One merged mesh per colour (userData.role = 'shuttle'), no textures, no text,
// no flags, no insignia. Stands on the platform's deck top (y = 0), +x along the room's forward axis, +z across (the
// orbiter's side). Verified by the browser test (#811).
import * as THREE from 'three';
import { partsGroup } from './artemismesh.js';
import { SHUTTLE, stackParts } from './shuttle.js';

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

export function buildShuttle(cfg = SHUTTLE) {
  const C = cfg.colours, g = orbiterGeometries(cfg);
  const parts = [...stackParts(cfg), ...cfg.orbiter.engines.at.map(at => enginePart(cfg, at))];
  return partsGroup(parts, { [C.white]: g.white, [C.belly]: g.belly }, 'shuttle');
}
