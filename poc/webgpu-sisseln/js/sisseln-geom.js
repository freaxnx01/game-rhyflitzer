// PoC Sisseln (#987): geometry data for the Sisseln slice -- terrain sampling, road ribbons, street-lamp placement
// and seeded scatter inside a polygon. Pure: no three.js, no DOM, so node --test can load it.

// Street lamps stand along roads of class residential and above; service roads, tracks and paths stay dark.
const LAMP_CLASSES = new Set([
  'motorway', 'motorway_link',
  'trunk', 'trunk_link',
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
  'unclassified',
  'residential',
  'living_street'
]);

// How far the lamp post stands off the edge of the carriageway.
const LAMP_VERGE = 1.2;

/** Bilinear terrain height from a parsed MMH1 grid (`parseMmh` in worlds.js); clamped at the edges. */
export function heightAt(terrain, x, z) {
  const { hdr, data } = terrain;
  const gx = Math.min(Math.max((x - hdr.x0) / hdr.step, 0), hdr.w - 1);
  const gz = Math.min(Math.max((z - hdr.z0) / hdr.step, 0), hdr.h - 1);
  const i = Math.min(Math.floor(gx), hdr.w - 2);
  const j = Math.min(Math.floor(gz), hdr.h - 2);
  const fx = gx - i;
  const fz = gz - j;
  const h00 = data[j * hdr.w + i];
  const h10 = data[j * hdr.w + i + 1];
  const h01 = data[(j + 1) * hdr.w + i];
  const h11 = data[(j + 1) * hdr.w + i + 1];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

function withoutRepeats(pts) {
  const out = [];
  for (const point of pts) {
    const last = out[out.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    out.push(point);
  }
  return out;
}

// The outward normal at point i: the average of the neighbouring segment normals, so joints do not pinch.
function ribbonNormals(pts) {
  const normals = [];
  for (let i = 0; i < pts.length; i++) {
    const before = pts[Math.max(i - 1, 0)];
    const after = pts[Math.min(i + 1, pts.length - 1)];
    const dx = after[0] - before[0];
    const dz = after[1] - before[1];
    const length = Math.hypot(dx, dz) || 1;
    normals.push([-dz / length, dx / length]);
  }
  return normals;
}

/**
 * A flat ribbon along a polyline: two vertices per point, y left at 0 for the caller to lift onto the terrain.
 * `u` runs 0 -> 1 across the ribbon and `v` in metres along it, which is what the wet-road material expects.
 */
export function roadRibbon(pts, width) {
  const line = withoutRepeats(pts);
  if (line.length < 2) return { positions: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint32Array(0) };

  const normals = ribbonNormals(line);
  const half = width / 2;
  const positions = new Float32Array(line.length * 6);
  const uvs = new Float32Array(line.length * 4);
  const indices = new Uint32Array((line.length - 1) * 6);

  let along = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) along += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    const [nx, nz] = normals[i];
    positions[i * 6] = line[i][0] + nx * half;
    positions[i * 6 + 2] = line[i][1] + nz * half;
    positions[i * 6 + 3] = line[i][0] - nx * half;
    positions[i * 6 + 5] = line[i][1] - nz * half;
    uvs[i * 4] = 0;
    uvs[i * 4 + 1] = along;
    uvs[i * 4 + 2] = 1;
    uvs[i * 4 + 3] = along;
  }
  for (let i = 0; i < line.length - 1; i++) {
    const a = i * 2;
    indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
  }
  return { positions, uvs, indices };
}

/** Lamp posts every `spacing` metres along the lit road classes, standing just off the carriageway. */
export function lampSpots(roads, spacing = 30) {
  const spots = [];
  for (const road of roads) {
    if (!LAMP_CLASSES.has(road.cls)) continue;
    const line = withoutRepeats(road.pts);
    if (line.length < 2) continue;
    const normals = ribbonNormals(line);
    const offset = (road.w || 5) / 2 + LAMP_VERGE;

    let walked = 0;
    let nextLamp = 0;
    for (let i = 0; i < line.length; i++) {
      const segment = i > 0 ? Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]) : 0;
      while (i > 0 && nextLamp <= walked + segment) {
        const t = (nextLamp - walked) / segment;
        const nx = normals[i - 1][0] + (normals[i][0] - normals[i - 1][0]) * t;
        const nz = normals[i - 1][1] + (normals[i][1] - normals[i - 1][1]) * t;
        const length = Math.hypot(nx, nz) || 1;
        spots.push({
          x: line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t + (nx / length) * offset,
          z: line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t + (nz / length) * offset
        });
        nextLamp += spacing;
      }
      if (i === 0) {
        spots.push({ x: line[0][0] + normals[0][0] * offset, z: line[0][1] + normals[0][1] * offset });
        nextLamp = spacing;
      }
      walked += segment;
    }
  }
  return spots;
}

/** The `n` lamp posts nearest (x, z), nearest first: only these get a real point light. */
export function pickLampLights(spots, x, z, n = 16) {
  return [...spots]
    .sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2))
    .slice(0, n);
}

/** Even-odd ray cast; points exactly on an edge may fall either way, which is fine for scattering trees. */
export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// mulberry32: a small, fast PRNG, so the same seed always scatters the same forest.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `density` points per square metre of the ring's bounding box, keeping only those inside the ring. */
export function scatterInRing(ring, density, seed) {
  if (ring.length < 3) return [];
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
  const tries = Math.round((maxX - minX) * (maxZ - minZ) * density);
  const random = seededRandom(seed);
  const points = [];
  for (let i = 0; i < tries; i++) {
    const x = minX + random() * (maxX - minX);
    const z = minZ + random() * (maxZ - minZ);
    if (pointInRing(x, z, ring)) points.push({ x, z });
  }
  return points;
}
