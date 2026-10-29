// #413: the Plattform Sisslerfeld -- its measurements, the layout frame, the walkway set of the spiral stair and the deck, the entrance.
// Pure: no three.js, no DOM. Numbers: docs/superpowers/specs/2026-10-28-plattform-stair-design.md (from the builder's plans, which are not in the repo).
// Frame: centre = the anchor (the central post), `facing` points to the entrance side (the base edge of every triangle);
// an angle phi (degrees) from the facing direction turns clockwise seen from above: polar(phi, r) = centre + r * (cos(facing + phi), sin(facing + phi)).
import { emptyWalkways } from './walkways.js';

export const PLATTFORM = {
  frame: { side: 6.0, post: 0.24, braceH: 5.42 },
  centrePost: 0.24,
  core: { r: 1.56, tread: 1.43, segment: 10, door: { half: 15, h: 2.2 } },
  stair: {
    sector: 20, rise: 0.16,
    overlap: 0.5,   // A2: each piece runs 0.5 deg past the next one's start (a nosing), so the join is seamless for the walker
    lower: { n: 17, from: 10, y0: 0.075 },
    podest: { from: 350, to: 480, y: 2.795 },
    upper: { n: 17, from: 120, y0: 2.955 },
    exit: { from: 460, to: 480, y: 5.675 },
    austritt: { from: 120, to: 230 },
  },
  deck: { side: 9.84, y: 5.735, thick: 0.3, parapet: 1.24, rail: 1.1, railFrom: 230, railTo: 460, opening: 24 },
  roof: { side: 12.10, eaves: 8.2, pitch: 45 },
  slab: { side: 12.03 },
  entranceR: 2.0,
};
const RAD = Math.PI / 180;

export function plattformFrame(x, z, facing) {
  const c = Math.cos(facing), s = Math.sin(facing);
  const toWorld = (u, v) => [x + u * c - v * s, z + u * s + v * c];   // u toward the entrance side, v to the right
  const polar = (phi, r) => { const t = facing + phi * RAD; return [x + r * Math.cos(t), z + r * Math.sin(t)]; };
  const triangle = (side) => { const ri = side / (2 * Math.sqrt(3)), rc = side / Math.sqrt(3); return [toWorld(ri, -side / 2), toWorld(ri, side / 2), toWorld(-rc, 0)]; };
  return { x, z, facing, toWorld, polar, triangle };
}

// the heading from (x, z) to the nearest point on any of the polylines
export function facingToRoad(x, z, lines) {
  let best = null;
  for (const pts of lines) for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, px = ax + t * dx, pz = az + t * dz;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { d, px, pz };
  }
  if (!best) throw new Error('facingToRoad: no road points');
  return Math.atan2(best.pz - z, best.px - x);
}

// every walkable piece of the stair, bottom to top: { from, to (degrees), y (above the base), tag } -- each `to` runs
// `overlap` past the next piece's start, so the even-odd footprint of two touching sectors never leaves a seam (A2)
export function stairTreads(P = PLATTFORM) {
  const { sector, rise, overlap, lower, podest, upper, exit, austritt } = P.stair, out = [];
  for (let k = 0; k < lower.n; k++) out.push({ from: lower.from + sector * k, to: lower.from + sector * (k + 1) + overlap, y: lower.y0 + rise * k, tag: `lower:${k}` });
  out.push({ ...podest, to: podest.to + overlap, tag: 'podest' });
  for (let k = 0; k < upper.n; k++) out.push({ from: upper.from + sector * k, to: upper.from + sector * (k + 1) + overlap, y: upper.y0 + rise * k, tag: `upper:${k}` });
  out.push({ ...exit, to: exit.to + overlap, tag: 'exit' }, { ...austritt, y: P.deck.y, to: austritt.to + overlap, tag: 'austritt' });
  return out;
}

// a ring sector between radii r0 and r1 as a polygon, one arc point every <= 5 degrees
export function sectorPoly(frame, from, to, r0, r1) {
  const n = Math.max(2, Math.ceil((to - from) / 5)), pts = [];
  for (let i = 0; i <= n; i++) pts.push(frame.polar(from + (to - from) * i / n, r1));
  for (let i = n; i >= 0; i--) pts.push(frame.polar(from + (to - from) * i / n, r0));
  return pts;
}
