// PoC Sisseln (#987): the OSM building footprints of the slice, extruded to their height, with a gable roof where
// the data says so. Village houses get plaster walls and tile roofs, the Sisslerfeld works grey wall and sheet.
import * as THREE from 'three/webgpu';
import { heightAt } from './sisseln-geom.js';
import { capGeometry, mergeGeometries, outwardRing, setBaseY } from './sisseln-mesh.js';
import {
  createPlasterFacadeMaterial,
  createIndustrialWallMaterial,
  createRoofMaterial
} from './sisseln-materials.js';

// A Swiss gable is steep; the ridge is capped so a long hall does not grow an absurd roof.
const GABLE_PITCH = Math.tan((38 * Math.PI) / 180);
const MAX_RIDGE_RISE = 4.2;
const MIN_HEIGHT = 2.4;

function ringCentre(ring) {
  let x = 0;
  let z = 0;
  for (const point of ring) {
    x += point[0];
    z += point[1];
  }
  return [x / ring.length, z / ring.length];
}

/** The walls of one footprint, from `base` up to `top`, facing outwards. */
function wallGeometry(ring, base, top) {
  const positions = new Float32Array(ring.length * 4 * 3);
  const indices = new Uint32Array(ring.length * 6);
  for (let i = 0; i < ring.length; i++) {
    const from = ring[i];
    const to = ring[(i + 1) % ring.length];
    const v = i * 12;
    positions.set([from[0], base, from[1], to[0], base, to[1], to[0], top, to[1], from[0], top, from[1]], v);
    const a = i * 4;
    indices.set([a, a + 1, a + 2, a, a + 2, a + 3], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A gable roof over the fitted rectangle `rect` = [cx, cz, length, width, angle]: a ridge along the long axis with
 * a slope down to each eave. The footprint ring and its fitted rectangle differ a little, so the eaves overhang
 * slightly -- which is what a Swiss roof does anyway.
 */
function gableGeometry(rect, eaves) {
  const [cx, cz, long, short, angle] = rect;
  const rise = Math.min((short / 2) * GABLE_PITCH, MAX_RIDGE_RISE);
  const halfLong = long / 2 + 0.35;
  const halfShort = short / 2 + 0.35;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // u runs along the ridge, v across it
  const toWorld = (u, v) => [cx + u * cos - v * sin, cz + u * sin + v * cos];

  const corners = [toWorld(-halfLong, -halfShort), toWorld(halfLong, -halfShort), toWorld(halfLong, halfShort), toWorld(-halfLong, halfShort)];
  const ridge = [toWorld(-halfLong, 0), toWorld(halfLong, 0)];

  const positions = new Float32Array([
    corners[0][0], eaves, corners[0][1],
    corners[1][0], eaves, corners[1][1],
    corners[2][0], eaves, corners[2][1],
    corners[3][0], eaves, corners[3][1],
    ridge[0][0], eaves + rise, ridge[0][1],
    ridge[1][0], eaves + rise, ridge[1][1]
  ]);
  // two slopes and the two gable ends
  const indices = new Uint32Array([0, 1, 5, 0, 5, 4, 2, 3, 4, 2, 4, 5, 1, 2, 5, 3, 0, 4]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function roofGeometry(building, eaves) {
  if (building.roof === 'gable' && Array.isArray(building.rect) && building.rect.length >= 5) {
    return gableGeometry(building.rect, eaves);
  }
  return capGeometry(outwardRing(building.ring), eaves);
}

/**
 * Every building in the slice, merged into four meshes (village wall / roof, industrial wall / roof). The facade
 * materials read a `baseY` attribute so each building's storeys start at its own ground level.
 */
export function buildBuildings(scene, slice, terrain) {
  const batches = {
    villageWall: [],
    villageRoof: [],
    industrialWall: [],
    industrialRoof: []
  };

  for (const building of slice.buildings) {
    const ring = outwardRing(building.ring);
    if (ring.length < 3) continue;
    const [cx, cz] = ringCentre(ring);
    const base = heightAt(terrain, cx, cz);
    const height = Math.max(building.h || MIN_HEIGHT, MIN_HEIGHT);
    const eaves = base + height;
    const industrial = building.palette === 'industrial';

    // The footprint is buried a little so a wall never floats where the terrain falls away under it
    batches[industrial ? 'industrialWall' : 'villageWall'].push(setBaseY(wallGeometry(ring, base - 1.5, eaves), base));
    batches[industrial ? 'industrialRoof' : 'villageRoof'].push(roofGeometry(building, eaves));
  }

  const materials = {
    villageWall: createPlasterFacadeMaterial(),
    villageRoof: createRoofMaterial(false),
    industrialWall: createIndustrialWallMaterial(),
    industrialRoof: createRoofMaterial(true)
  };

  const group = new THREE.Group();
  group.name = 'buildings';
  for (const [name, geometries] of Object.entries(batches)) {
    if (geometries.length === 0) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geometries), materials[name]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
  }
  scene.add(group);
  return { group, count: slice.buildings.length };
}
