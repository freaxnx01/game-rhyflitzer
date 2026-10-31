// #488: the Artemis II stack and the Orion capsule as meshes -- built from artemis.js's numbers (which are pure
// and unit-tested; this file is not): every part is a cylinder or a cone, one merged mesh per colour (each with
// userData.role = 'artemis'), no textures, no text, no flags, no insignia. buildRocket stands on the mount's deck top (y = 0), +x along the room's forward
// axis, +z across; buildCapsule stands on the lawn, +x = the hatch side. Verified by the browser test (#488).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARTEMIS, rocketParts, capsuleParts } from './artemis.js';

// one merged mesh per colour: the parts of `parts` in the group's own frame, plus `extra` geometries per colour key
function partsGroup(parts, extra = {}) {
  const group = new THREE.Group(), byColour = {};
  const add = (colour, g) => (byColour[colour] ||= []).push(g.toNonIndexed());
  for (const p of parts) {
    const g = new THREE.CylinderGeometry(p.r1, p.r0, p.y1 - p.y0, 32);   // three's radiusTop first
    g.translate(p.x, (p.y0 + p.y1) / 2, p.z);
    add(p.colour, g);
  }
  for (const [colour, geos] of Object.entries(extra)) for (const g of geos) add(colour, g);
  for (const [colour, geos] of Object.entries(byColour)) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshLambertMaterial({ color: Number(colour) }));
    m.userData.role = 'artemis'; group.add(m);
  }
  return group;
}

export function buildRocket(cfg = ARTEMIS) {
  return partsGroup(rocketParts(cfg));
}

export function buildCapsule(cfg = ARTEMIS) {
  const C = cfg.capsule, mid = C.stand.h + C.h / 2, rMid = C.r + (C.rTop - C.r) / 2;   // the hatch sits on the cone's +x face at mid height
  const hatch = new THREE.BoxGeometry(0.1, 1.2, 0.9); hatch.translate(rMid, mid, 0);
  return partsGroup(capsuleParts(cfg), { [cfg.colours.dark]: [hatch] });
}

// the group's triangle count (like friesTriangles)
export function artemisTriangles(group) {
  let tris = 0;
  group.traverse(o => { if (!o.isMesh) return; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); });
  return tris;
}