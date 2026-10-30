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
  yard: { u0: -12.5, u1: 7.47, v0: -16.5, v1: 9.5 },        // KSL: north edge = the road edge (4 m + inradius 3.47 north of the centroid), 20 m deep, 26 m wide
  parking: { n: 6, w: 2.5, d: 5, v0: -16.5, u1: 2.47 },     // KSL: 6 spaces 2.50 x 5.00 along the west edge, below a 5 m strip at the road
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

// a thin wall along the segment a-b
const segment = ([ax, az], [bx, bz], y0, y1, tag, thick = 0.1) => {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  return { x: (ax + bx) / 2, z: (az + bz) / 2, hw: len / 2, hd: thick / 2, c: dx / len, s: dz / len, y0, y1, tag };
};

// the walkway set: treads, landing, exit and Austritt as sector slabs; the deck with its round opening; the batten ring (open at the door
// up to the door's height), the central post, the railing round the opening and the parapet -- every y absolute (base + ...)
export function plattformWalk(frame, base, P = PLATTFORM) {
  const walk = emptyWalkways(), { core, deck } = P, deckY = base + deck.y, half = P.centrePost / 2;
  for (const t of stairTreads(P)) walk.slabs.push({ poly: sectorPoly(frame, t.from, t.to, half, core.tread), y: base + t.y, tag: t.tag });
  const opening = { poly: Array.from({ length: deck.opening }, (_, i) => frame.polar(i * 360 / deck.opening, core.r)) };
  walk.slabs.push({ poly: frame.triangle(deck.side), holes: [opening], y: deckY, tag: 'deck' });
  for (let a = -core.door.half; a < 360 - core.door.half; a += core.segment) {
    const door = a + core.segment <= core.door.half;
    walk.walls.push(segment(frame.polar(a, core.r), frame.polar(a + core.segment, core.r), base + (door ? core.door.h : 0), deckY, door ? 'core:door' : 'core'));
  }
  const [cx, cz] = frame.toWorld(0, 0);
  walk.walls.push({ x: cx, z: cz, hw: half, hd: half, c: Math.cos(frame.facing), s: Math.sin(frame.facing), y0: base, y1: base + P.roof.eaves + 4, tag: 'post' });
  for (let a = deck.railFrom; a < deck.railTo; a += core.segment) walk.walls.push(segment(frame.polar(a, core.r), frame.polar(a + core.segment, core.r), deckY, deckY + deck.rail, 'rail'));
  const tri = frame.triangle(deck.side);
  for (let i = 0; i < 3; i++) walk.walls.push(segment(tri[i], tri[(i + 1) % 3], deckY, deckY + deck.parapet, 'parapet', 0.12));
  return walk;
}

// outside the door, `th` = the direction you walk in (enterables.js)
export function plattformEntrance(frame, P = PLATTFORM) {
  const [x, z] = frame.polar(0, P.entranceR);
  return { x, z, th: frame.facing + Math.PI, w: 0.8 };
}

// the KSL situation plan's yard: the gravel rectangle and the six parking spaces, as world polygons
export function plattformYard(frame, P = PLATTFORM) {
  const { yard: g, parking: k } = P;
  const rect = (u0, u1, v0, v1) => [frame.toWorld(u1, v0), frame.toWorld(u1, v1), frame.toWorld(u0, v1), frame.toWorld(u0, v0)];
  const parking = Array.from({ length: k.n }, (_, i) => rect(k.u1 - (i + 1) * k.w, k.u1 - i * k.w, k.v0, k.v0 + k.d));
  return { gravel: rect(g.u0, g.u1, g.v0, g.v1), parking };
}
