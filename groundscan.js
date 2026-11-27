// groundscan.js — #1248: heights where a vertical ray from the sky first meets drawn triangles, from a 2D grid index
// (the Raycaster tests every triangle of a merged mesh), and the whole-map road-vs-ground scan built on it.
// Pure: no DOM, no three.js, so node --test can import it. World metres, x east, z south, y up.

export const SCAN = { step: 4, inset: 0.3, tol: 0.01, cell: 16, near: 12 };

const OFFSET = 32768;
const cellKey = (i, j) => (i + OFFSET) * 65536 + (j + OFFSET);
const corner = (idx, t, k) => (idx ? idx[3 * t + k] : 3 * t + k);

// pos: world-space x, y, z per vertex; idx: three vertex numbers per triangle, or null for a non-indexed array.
// The geometry's own arrays are kept by reference; the index only stores triangle numbers per cell.
export function triangleIndex(pos, idx = null, cell = SCAN.cell) {
  const count = (idx ? idx.length : pos.length / 3) / 3, cells = new Map();
  for (let t = 0; t < count; t++) addTriangle(cells, pos, idx, t, cell);
  return { pos, idx, cell, cells };
}

function addTriangle(cells, pos, idx, t, cell) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < 3; k++) {
    const v = corner(idx, t, k), x = pos[3 * v], z = pos[3 * v + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
    for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
      const key = cellKey(i, j), list = cells.get(key);
      if (list) list.push(t); else cells.set(key, [t]);
    }
  }
}

// the highest drawn y at (x, z), or null where no triangle covers the point
export function topAt(index, x, z) {
  const list = index.cells.get(cellKey(Math.floor(x / index.cell), Math.floor(z / index.cell)));
  if (!list) return null;
  let top = null;
  for (const t of list) {
    const y = heightOnTriangle(index, t, x, z);
    if (y !== null && (top === null || y > top)) top = y;
  }
  return top;
}

const EDGE = -1e-9;   // a point on a shared edge belongs to both triangles
function heightOnTriangle({ pos, idx }, t, x, z) {
  const a = corner(idx, t, 0), b = corner(idx, t, 1), c = corner(idx, t, 2);
  const ax = pos[3 * a], az = pos[3 * a + 2], bx = pos[3 * b], bz = pos[3 * b + 2], cx = pos[3 * c], cz = pos[3 * c + 2];
  const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(det) < 1e-12) return null;   // seen edge-on from above: no plan area
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
  if (l1 < EDGE || l2 < EDGE || l3 < EDGE) return null;
  return l1 * pos[3 * a + 1] + l2 * pos[3 * b + 1] + l3 * pos[3 * c + 1];
}
