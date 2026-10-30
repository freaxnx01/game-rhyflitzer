// #462: the steam loco's meshes, built from loco.js's numbers (pure and unit-tested; this file is not). One group facing +x, standing on
// the rail top; the caller sets position and rotation.y = -th like the car. userData.drivers / small spin, userData.rods follow the crank.
import * as THREE from 'three';
import { LOCO } from './loco.js';
import { TURNTABLE } from './train.js';

const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
function box(g, m, x0, x1, y0, y1, w) { const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, w), m); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); b.castShadow = true; g.add(b); return b; }
function cylX(g, m, x0, x1, r, y) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - x0, 20), m); c.rotation.z = Math.PI / 2; c.position.set((x0 + x1) / 2, y, 0); c.castShadow = true; g.add(c); return c; }
function cylY(g, m, x, y0, y1, r0, r1) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 16), m); c.position.set(x, (y0 + y1) / 2, 0); c.castShadow = true; g.add(c); return c; }
// a spoked wheel pair at x (left and right), turning about z
function wheels(g, m, x, r, list) {
  for (const side of [-1, 1]) {
    const w = new THREE.Group(), rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.1, 6, 20), m);
    w.add(rim);
    for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, r * 1.8, 0.06), m); sp.rotation.z = (k * Math.PI) / 8; w.add(sp); }
    w.position.set(x, r, side * (LOCO.width / 2 - 0.35)); g.add(w); list.push(w);
  }
}

export function buildLoco() {
  const L = LOCO, C = L.colours, g = new THREE.Group(), body = mat(C.body), red = mat(C.wheel), frame = mat(C.frame);
  const drivers = [], small = [], rods = [];
  box(g, frame, L.tenderFront + 0.3, L.front, 0.9, 1.4, L.width - 0.6);                         // running frame
  box(g, mat(C.beam), L.front - 0.25, L.front, 0.7, 1.5, L.width);                              // red buffer beam
  cylX(g, body, L.boiler.x0, L.boiler.x1, L.boiler.r, L.boiler.y);                              // boiler
  cylX(g, body, L.smokebox.x0, L.smokebox.x1, L.smokebox.r, L.boiler.y);                        // smokebox
  cylY(g, body, L.chimney[0], L.boiler.y + 0.6, L.chimney[1], 0.26, 0.32);                      // chimney, flared at the top
  cylY(g, mat(C.brass), L.dome[0], L.boiler.y + 0.6, L.dome[1], 0.38, 0.3);                     // dome
  box(g, body, L.cabBox.x0, L.cabBox.x1, L.cabBox.y0, L.cabBox.y1 - 0.15, L.width);             // cab
  box(g, mat(C.roof), L.cabBox.x0 - 0.1, L.cabBox.x1 + 0.1, L.cabBox.y1 - 0.15, L.cabBox.y1, L.width + 0.1);
  box(g, body, L.tenderBox.x0, L.tenderBox.x1, L.tenderBox.y0, L.tenderBox.y1, L.width - 0.1);  // tender
  box(g, mat(C.coal), L.tenderBox.x0 + 0.6, L.tenderBox.x1 - 0.4, L.tenderBox.y1, L.tenderBox.y1 + 0.35, L.width - 0.5);
  for (const x of L.drivers) wheels(g, red, x, L.driverR, drivers);
  for (const x of L.bogie) wheels(g, red, x, L.bogieR, small);
  for (const x of L.tenderWheels) wheels(g, red, x, L.tenderR, small);
  for (const side of [-1, 1]) {   // the coupling rod over the three drivers; locomesh moves it on the crank circle
    const r = new THREE.Mesh(new THREE.BoxGeometry(L.drivers[0] - L.drivers[2], 0.12, 0.08), mat(0x8a8d90));
    r.position.set((L.drivers[0] + L.drivers[2]) / 2, L.rodY, side * (L.width / 2 - 0.2)); r.userData.home = r.position.clone(); g.add(r); rods.push(r);
  }
  g.userData = { drivers, small, rods, chimney: L.chimney, cab: L.cab };
  return g;
}

// #496: the turntable -- a dark pit flush with the rail top, a ring rail on its rim and a turning bridge (userData.bridge) carrying the
// track. The bridge is symmetric end to end, so it lines up with the track after any half turn.
export function buildTurntable() {
  const R = TURNTABLE.radius, g = new THREE.Group(), steel = mat(0x8a8d90), dark = mat(0x2a2724);
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.3, 48), mat(0x3b3631));
  pit.position.y = -0.17; pit.receiveShadow = true; g.add(pit);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 0.4, 0.07, 6, 64), steel);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.02; g.add(ring);
  const bridge = new THREE.Group();
  for (const side of [-1, 1]) {
    const girder = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.6, 0.3), dark);
    girder.position.set(0, -0.33, side * 1.1); girder.castShadow = true; bridge.add(girder);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.08, 0.08), steel);
    rail.position.set(0, -0.02, side * 0.72); bridge.add(rail);
  }
  g.add(bridge);
  g.userData = { bridge };
  return g;
}
