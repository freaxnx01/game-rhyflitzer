// PoC Sisseln (#987): the handful of geometry chores every builder here needs -- ring winding, a flat cap over a
// polygon, and merging many small geometries into one draw call.
import * as THREE from 'three/webgpu';

/** Twice the signed area of a ring in the xz plane; its sign is the winding. */
export function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

/**
 * The ring wound so that walls raised along it face outwards and a cap over it faces up.
 * Returns the ring itself when it is already wound that way.
 */
export function outwardRing(ring) {
  return signedArea(ring) > 0 ? [...ring].reverse() : ring;
}

/**
 * A flat, upward-facing cap over a polygon at height `y`. three's Shape triangulates concave rings for us; the
 * shape is laid out as (x, -z) so that rotating it up around x maps it back onto the world's xz plane.
 */
export function capGeometry(ring, y) {
  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], -ring[0][1]);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], -ring[i][1]);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/**
 * Merges plain indexed geometries into one. three's BufferGeometryUtils would do this too, but it is another addon
 * to fetch for a job this small, and the PoC's geometries all carry the same handful of attributes.
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
    positions.set(geometry.attributes.position.array, vertex * 3);
    normals.set(geometry.attributes.normal.array, vertex * 3);
    if (uvs) uvs.set(geometry.attributes.uv.array, vertex * 2);
    if (bases) bases.set(geometry.attributes.baseY.array, vertex);
    for (let i = 0; i < geometry.index.count; i++) indices[index + i] = geometry.index.array[i] + vertex;
    vertex += geometry.attributes.position.count;
    index += geometry.index.count;
  }

  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (uvs) merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (bases) merged.setAttribute('baseY', new THREE.BufferAttribute(bases, 1));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/** Fills a `baseY` attribute with one value, so a merged facade knows where each building's ground is. */
export function setBaseY(geometry, baseY) {
  const count = geometry.attributes.position.count;
  geometry.setAttribute('baseY', new THREE.BufferAttribute(new Float32Array(count).fill(baseY), 1));
  return geometry;
}
