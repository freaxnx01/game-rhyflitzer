// #412: walkable surfaces above the ground -- slabs, stair ramps, walls with a height range, ceilings. Pure: no three.js, no DOM.
// Every shape is a footprint in the colliders' frame { x, z, hw, hd, c, s } (hw along the heading (c, s), hd across) or, for a slab, a polygon
// `poly: [[x, z], ...]`; a slab may have `holes: [rect, ...]`. A walkway set is { slabs, ramps, walls, ceilings }:
//   slab    { ..footprint, y }            flat floor, top surface at y
//   ramp    { ..footprint, y0, y1 }       sloped floor, rises along the heading from y0 (at -hw) to y1 (at +hw)
//   wall    { ..footprint, y0, y1, off? } blocks only a walker whose body overlaps [y0, y1]; `off: true` = open (a door)
//   ceiling { ..footprint, y }            underside at y (the roof of a housing, a cabin)
// Slabs and ramps are WALKWAY.thick thick, so their undersides are ceilings for whoever walks below them.
import { WALKER } from './foot.js';
import { colliderPush } from './world.js';

export const WALKWAY = { thick: 0.2, head: 1.9, tol: 0.05 };   // m: slab thickness, the walker's body height, tolerance at a wall's ends

export const emptyWalkways = () => ({ slabs: [], ramps: [], walls: [], ceilings: [] });

const inRect = (o, x, z) => {
  const dx = x - o.x, dz = z - o.z;
  return Math.abs(dx * o.c + dz * o.s) <= o.hw && Math.abs(-dx * o.s + dz * o.c) <= o.hd;
};

export function inPoly(poly, x, z) {   // even-odd rule
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const inFootprint = (o, x, z) => (o.poly ? inPoly(o.poly, x, z) : inRect(o, x, z)) && !(o.holes || []).some(h => inRect(h, x, z));

// the ramp's surface height at (x, z), or null off the ramp
export function rampY(r, x, z) {
  if (!inRect(r, x, z)) return null;
  const u = (x - r.x) * r.c + (z - r.z) * r.s;
  return r.y0 + (r.y1 - r.y0) * (u + r.hw) / (2 * r.hw);
}

// the surfaces under (x, z) as heights: slabs and ramps
function surfaces(walk, x, z) {
  const out = [];
  for (const s of walk.slabs) if (inFootprint(s, x, z)) out.push(s.y);
  for (const r of walk.ramps) { const y = rampY(r, x, z); if (y !== null) out.push(y); }
  return out;
}

// the highest walkway surface under (x, z) that is at most stepUp above the feet (y), or null: the second source of footFloor
export function walkwayFloor(walk, x, z, y, cfg = WALKER) {
  let top = null;
  for (const h of surfaces(walk, x, z)) if (h <= y + cfg.stepUp && (top === null || h > top)) top = h;
  return top;
}

// the lowest underside above the walker (at least stepUp over the feet, so the surface being stood on never counts), or null
export function walkwayCeiling(walk, x, z, y, cfg = WALKER) {
  let low = null;
  for (const h of surfaces(walk, x, z)) { const under = h - WALKWAY.thick; if (under >= y + cfg.stepUp && (low === null || under < low)) low = under; }
  for (const c of walk.ceilings) if (c.y >= y + cfg.stepUp && inFootprint(c, x, z) && (low === null || c.y < low)) low = c.y;
  return low;
}

// the head hits a ceiling: the walker is pushed down (never under the floor) and stops rising
export function headBump(s, floor, ceil, head = WALKWAY.head) {
  if (ceil === null || s.y + head <= ceil) return s;
  return { ...s, y: Math.max(floor, ceil - head), vy: Math.min(s.vy, 0) };
}

// a wall blocks a walker whose body [y, y + head] overlaps the wall's height range
export const wallActive = (w, y) => !w.off && y + WALKWAY.head > w.y0 + WALKWAY.tol && y < w.y1 - WALKWAY.tol;

// every wall pushing a walker of radius r at (x, z, y): [{ wx, wz, pen }]
export function walkwayPush(walk, x, z, y, r) {
  const hits = [];
  for (const w of walk.walls) { if (!wallActive(w, y)) continue; const hit = colliderPush(w, x, z, r); if (hit) hits.push(hit); }
  return hits;
}