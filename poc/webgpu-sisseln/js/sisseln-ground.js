// PoC Sisseln (#987): the ground of the slice -- the terrain mesh with the farmland and forest colours painted into
// its vertices, the Rhine and the village ponds, and the streams.
import * as THREE from 'three/webgpu';
import { makeGrid, gridAdd, gridQuery, FIELD_KINDS } from '../../../world.js';
import { heightAt, roadRibbon, pointInRing } from './sisseln-geom.js';
import { createTerrainMaterial, createWaterMaterial } from './sisseln-materials.js';

// One terrain vertex every 8 m: the step of terrain_hochrhein.mmh, so the mesh resolves everything the data holds.
const TERRAIN_STEP = 8;

const GRASS = new THREE.Color(0x6d8a46);
const FOREST_FLOOR = new THREE.Color(0x3c4b2a);

function ringBounds(ring) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

// A spatial index of coloured rings, so colouring a vertex only tests the parcels that can possibly contain it.
function indexRings(items, colorOf) {
  const grid = makeGrid(64);
  for (const item of items) {
    const bounds = ringBounds(item.ring);
    gridAdd(grid, bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, { ring: item.ring, color: colorOf(item) });
  }
  return grid;
}

function colourAt(grid, x, z, fallback) {
  for (const parcel of gridQuery(grid, x, z, 0)) {
    if (pointInRing(x, z, parcel.ring)) return parcel.color;
  }
  return fallback;
}

const cropColour = (field) => new THREE.Color((FIELD_KINDS[field.kind] || FIELD_KINDS.meadow).color);

/** The terrain over `box`, with the field and forest colours baked into its vertex colours. */
function buildTerrain(slice, terrain, box) {
  const width = box.x1 - box.x0;
  const depth = box.z1 - box.z0;
  const columns = Math.round(width / TERRAIN_STEP);
  const rows = Math.round(depth / TERRAIN_STEP);

  const geometry = new THREE.PlaneGeometry(width, depth, columns, rows);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(box.x0 + width / 2, 0, box.z0 + depth / 2);

  const fields = indexRings(slice.fields, cropColour);
  const forests = indexRings(slice.forests, () => FOREST_FLOOR);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, heightAt(terrain, x, z));
    const shade = colourAt(forests, x, z, null) || colourAt(fields, x, z, GRASS);
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, createTerrainMaterial());
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function ringShape(ring) {
  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], ring[i][1]);
  shape.closePath();
  return shape;
}

/** The water bodies: flat surfaces at their own `level`, which is what makes the Rhine sit in its valley. */
function buildWater(slice, material) {
  const group = new THREE.Group();
  group.name = 'water';
  for (const body of slice.water) {
    for (const ring of body.rings) {
      const geometry = new THREE.ShapeGeometry(ringShape(ring));
      // ShapeGeometry builds in the xy plane; lay it flat and lift it to the water level
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, body.level, 0);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  return group;
}

/** Streams as narrow ribbons following the terrain, drawn with the same water material. */
function buildStreams(slice, terrain, material) {
  const geometries = [];
  for (const stream of slice.streams) {
    const ribbon = roadRibbon(stream.pts, Math.max(stream.w || 2, 1.5));
    if (ribbon.indices.length === 0) continue;
    for (let i = 0; i < ribbon.positions.length; i += 3) {
      ribbon.positions[i + 1] = heightAt(terrain, ribbon.positions[i], ribbon.positions[i + 2]) + 0.03;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(ribbon.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
    geometry.computeVertexNormals();
    geometries.push(geometry);
  }
  if (geometries.length === 0) return null;
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  mesh.name = 'streams';
  return mesh;
}

/**
 * Merges plain position/uv/index geometries. three's BufferGeometryUtils would do this too, but it is one more
 * addon to fetch for a job this small and it insists on identical attribute sets.
 */
export function mergeGeometries(geometries) {
  const merged = new THREE.BufferGeometry();
  const hasUv = geometries.every((geometry) => geometry.attributes.uv);
  const hasBase = geometries.every((geometry) => geometry.attributes.baseY);
  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of geometries) {
    vertexCount += geometry.attributes.position.count;
    indexCount += geometry.index.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = hasUv ? new Float32Array(vertexCount * 2) : null;
  const bases = hasBase ? new Float32Array(vertexCount) : null;
  const indices = new Uint32Array(indexCount);

  let vertex = 0;
  let index = 0;
  for (const geometry of geometries) {
    const count = geometry.attributes.position.count;
    positions.set(geometry.attributes.position.array, vertex * 3);
    normals.set(geometry.attributes.normal.array, vertex * 3);
    if (uvs) uvs.set(geometry.attributes.uv.array, vertex * 2);
    if (bases) bases.set(geometry.attributes.baseY.array, vertex);
    for (let i = 0; i < geometry.index.count; i++) indices[index + i] = geometry.index.array[i] + vertex;
    vertex += count;
    index += geometry.index.count;
  }

  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (uvs) merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (bases) merged.setAttribute('baseY', new THREE.BufferAttribute(bases, 1));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/** Terrain, water and streams, added to the scene. */
export function buildGround(scene, slice, terrain, box) {
  const waterMaterial = createWaterMaterial();
  const terrainMesh = buildTerrain(slice, terrain, box);
  const water = buildWater(slice, waterMaterial);
  const streams = buildStreams(slice, terrain, waterMaterial);

  scene.add(terrainMesh);
  scene.add(water);
  if (streams) scene.add(streams);
  return { terrainMesh, water, streams };
}
