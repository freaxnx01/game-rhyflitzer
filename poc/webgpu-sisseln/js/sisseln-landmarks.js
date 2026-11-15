// PoC Sisseln (#987): stand-in meshes for the two landmarks that give the Sisslerfeld its silhouette -- the
// Plattform Sisslerfeld and the DSM chimney. The game's full Plattform is not ported; only its measurements are
// read from plattform.js (a pure module), so the stand-in has the right proportions.
import * as THREE from 'three/webgpu';
import { PLATTFORM } from '../../../plattform.js';
import { heightAt } from './sisseln-geom.js';
import { createStructureMaterial, createRoofMaterial } from './sisseln-materials.js';

// An equilateral triangle of side `side`, centred on the origin, as [x, z] pairs.
function trianglePoints(side) {
  const circumradius = side / Math.sqrt(3);
  return [0, 1, 2].map((corner) => {
    const angle = (corner * 2 * Math.PI) / 3 - Math.PI / 2;
    return [Math.cos(angle) * circumradius, Math.sin(angle) * circumradius];
  });
}

function slab(points, y, thickness, material) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], -points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], -points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The Plattform's triangular timber frame, its deck and its roof, at the measurements of PLATTFORM: a 6.0 m frame
 * carrying a 9.84 m deck at 5.735 m, under a 12.10 m roof with its eaves at 8.2 m.
 */
function buildPlattform(anchor, terrain) {
  const group = new THREE.Group();
  group.name = 'plattform';
  const ground = heightAt(terrain, anchor.x, anchor.z);
  const timber = createStructureMaterial(0x9a7c56, 0.8);

  const frame = trianglePoints(PLATTFORM.frame.side);
  const post = PLATTFORM.frame.post;
  for (const [x, z] of frame) {
    const geometry = new THREE.BoxGeometry(post, PLATTFORM.deck.y, post);
    geometry.translate(x, PLATTFORM.deck.y / 2, z);
    const leg = new THREE.Mesh(geometry, timber);
    leg.castShadow = true;
    group.add(leg);
  }
  const centre = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATTFORM.centrePost / 2, PLATTFORM.centrePost / 2, PLATTFORM.roof.eaves, 8),
    timber
  );
  centre.position.y = PLATTFORM.roof.eaves / 2;
  centre.castShadow = true;
  group.add(centre);

  group.add(slab(trianglePoints(PLATTFORM.deck.side), PLATTFORM.deck.y, PLATTFORM.deck.thick, timber));
  group.add(slab(trianglePoints(PLATTFORM.roof.side), PLATTFORM.roof.eaves, 0.28, createRoofMaterial(false)));

  group.position.set(anchor.x, ground, anchor.z);
  return group;
}

/** The DSM chimney: a plain tapered cylinder at the anchor's own height, with its warning bands left out. */
function buildChimney(anchor, terrain) {
  const height = anchor.h || 140;
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.022, height * 0.042, height, 16, 1, true),
    createStructureMaterial(0xb8b2a6, 0.8)
  );
  chimney.geometry.translate(0, height / 2, 0);
  chimney.position.set(anchor.x, heightAt(terrain, anchor.x, anchor.z), anchor.z);
  chimney.castShadow = true;
  chimney.material.side = THREE.DoubleSide; // an open cylinder, so it still reads solid from above
  chimney.name = 'dsm-chimney';
  return chimney;
}

export function buildLandmarks(scene, slice, terrain) {
  const built = {};
  if (slice.landmarks.plattform) {
    built.plattform = buildPlattform(slice.landmarks.plattform, terrain);
    scene.add(built.plattform);
  }
  if (slice.landmarks.dsmChimney) {
    built.chimney = buildChimney(slice.landmarks.dsmChimney, terrain);
    scene.add(built.chimney);
  }
  return built;
}
