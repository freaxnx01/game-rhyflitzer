// speichermesh.js -- #666: the Speicherstadt's warehouses as meshes -- built from speicher.js's numbers (which are
// pure and unit-tested; this file is not): every part is a box or a gable prism, one merged mesh per colour (each
// with userData.role = 'speicher'), no textures, no text, no flags, no insignia. buildWarehouses stands on the
// floor (y = 0), +x along the room's forward axis, +z across. Verified by the browser test (#666).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPEICHER, warehouseParts } from './speicher.js';

export function buildWarehouses(cfg = SPEICHER) {
  const group = new THREE.Group(), byColour = {};
  for (const p of warehouseParts(cfg)) {
    let g;
    if (p.kind === 'box') {
      g = new THREE.BoxGeometry(p.w, p.y1 - p.y0, p.d);
      g.translate(p.x, (p.y0 + p.y1) / 2, p.z);
    } else {
      // a gable prism with its ridge along x: a triangular cylinder stood upright, laid along x, scaled to depth and rise
      const h = p.y1 - p.y0;
      g = new THREE.CylinderGeometry(1, 1, p.w, 3);
      g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);   // lie it along x, one edge of the triangle pointing up
      g.scale(1, 2 * h / 3, p.d / Math.sqrt(3));         // the unit triangle (base y -0.5..1, half depth sqrt(3)/2) -> depth d, rise h
      g.translate(p.x, p.y0 + h / 3, p.z);               // base on y0, ridge line at y1
    }
    (byColour[p.colour] ||= []).push(g.toNonIndexed());
  }
  for (const [colour, geos] of Object.entries(byColour)) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshLambertMaterial({ color: Number(colour) }));
    m.userData.role = 'speicher'; group.add(m);
  }
  return group;
}

// the group's triangle count (like artemisTriangles)
export function speicherTriangles(group) {
  let tris = 0;
  group.traverse(o => { if (!o.isMesh) return; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); });
  return tris;
}
