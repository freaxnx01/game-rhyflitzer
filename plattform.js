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
  { const s = parapetStraight(frame, P); walk.walls.push(segment(s.a, s.b, deckY, deckY + deck.rail, 'rail')); }   // #855: the straight run of the parapet
  const tri = frame.triangle(deck.side);
  for (let i = 0; i < 3; i++) walk.walls.push(segment(tri[i], tri[(i + 1) % 3], deckY, deckY + deck.parapet, 'parapet', 0.12));
  return walk;
}

// the way down from the deck (#534 tutorial), a point to walk at: round the rail along the deck until the gap in it is in clear view,
// then the gap, and from inside the opening the first step that leaves the deck level
const GAP_VIEW = 60, ROUND_R = 2.4;
export function stairHeadTarget(frame, x, z, P = PLATTFORM) {
  const { core, stair: { sector, upper, austritt } } = P, r = Math.hypot(x - frame.x, z - frame.z);
  if (r < core.r) return frame.polar(upper.from + sector * (upper.n - 0.5), core.tread * 0.7);
  const gap = (austritt.from + austritt.to) / 2, at = Math.atan2(z - frame.z, x - frame.x) / RAD - frame.facing / RAD;
  const off = ((gap - at + 540) % 360 + 360) % 360 - 180;
  return Math.abs(off) <= GAP_VIEW ? frame.polar(gap, core.r) : frame.polar(at + Math.sign(off) * GAP_VIEW, ROUND_R);
}

// outside the door, `th` = the direction you walk in (enterables.js)
export function plattformEntrance(frame, P = PLATTFORM) {
  const [x, z] = frame.polar(0, P.entranceR);
  return { x, z, th: frame.facing + Math.PI, w: 0.8 };
}

// #701: E at the door puts the walker on the deck, E on the deck by the stair opening puts them outside the door
export const HOP = { doorReach: 2.5, stairReach: 3.2, lowest: 1.0, deckSlack: 0.5, landR: 0.9, outside: 0.4 };
const gapAngle = (P) => (P.stair.austritt.from + P.stair.austritt.to) / 2;

export function plattformHop(frame, base, pos, P = PLATTFORM) {
  const up = pos.y - base <= HOP.lowest, deck = pos.y >= base + P.deck.y - HOP.deckSlack;
  if (!up && !deck) return null;
  const [px, pz] = up ? frame.polar(0, P.entranceR) : frame.polar(gapAngle(P), P.core.r);
  const reach = up ? HOP.doorReach : HOP.stairReach;
  if (Math.hypot(pos.x - px, pos.z - pz) > reach) return null;
  return up ? 'up' : 'down';
}

export function plattformHopLanding(frame, base, dir, P = PLATTFORM) {
  if (dir === 'up') {
    const gap = gapAngle(P), [x, z] = frame.polar(gap, P.core.r + HOP.landR);
    return { x, z, th: frame.facing + gap * RAD, y: base + P.deck.y };
  }
  const [x, z] = frame.polar(0, P.entranceR + HOP.outside);
  return { x, z, th: frame.facing, y: base };
}

// #567: the core cylinder as one solid circle -- the batten ring and the central post inside it -- for the car, the helicopter
// floor and the camera. carOnly: footSolids() skips it, so on foot the walkway walls of plattformWalk (open at the door) still rule.
// No door gap: the gap (2 x door.half at core.r, ~0.81 m) is narrower than any car.
export function plattformCoreCollider(frame, base, P = PLATTFORM) {
  const r = P.core.r;
  return { x: frame.x, z: frame.z, hw: r, hd: r, c: 1, s: 0, h: base + P.roof.eaves, circle: r, carOnly: true };
}

// the KSL situation plan's yard: the gravel rectangle and the six parking spaces, as world polygons
export function plattformYard(frame, P = PLATTFORM) {
  const { yard: g, parking: k } = P;
  const rect = (u0, u1, v0, v1) => [frame.toWorld(u1, v0), frame.toWorld(u1, v1), frame.toWorld(u0, v1), frame.toWorld(u0, v0)];
  const parking = Array.from({ length: k.n }, (_, i) => rect(k.u1 - (i + 1) * k.w, k.u1 - i * k.w, k.v0, k.v0 + k.d));
  return { gravel: rect(g.u0, g.u1, g.v0, g.v1), parking };
}

// #855: the core as single spruce slats, one per angle: from the ground (the door lintel inside the door) up to the deck, and
// inside the rail range (the parapet round the stair opening) on up to the underside of the handrail ring
// HANDRAIL (s075-s078, the frames on the deck): a wide flat glulam cap on the slats, from `inner` inside the slat centre line to
// `outer` outside it (a shelf onto the deck), `h` thick; below it a lower rail board round the outside of the slats, its top `low.drop`
// under the cap's top; `straight`: the length of the straight run that closes the opening from the bow's start (see parapetStraight)
export const SLAT = { w: 0.09, d: 0.06 }, HANDRAIL = { h: 0.05, inner: 0.05, outer: 0.19, low: { drop: 0.16, h: 0.08, t: 0.035 }, straight: 1.5 };
const inArc = (phi, from, to) => { const a = ((phi - from) % 360 + 360) % 360; return a < to - from; };
export function coreSlats(P = PLATTFORM, n = 72) {
  const { core, deck } = P, out = [];
  for (let i = 0; i < n; i++) {
    const phi = i * 360 / n, off = ((phi + 180) % 360 + 360) % 360 - 180;
    const y0 = Math.abs(off) <= core.door.half ? core.door.h : 0;
    const y1 = inArc(phi, deck.railFrom, deck.railTo) ? deck.y + deck.rail - HANDRAIL.h : deck.y;
    out.push({ phi, y0, y1 });
  }
  return out;
}

// #855: the parapet round the stair opening is a bow (the rail range of the core circle) plus a straight run: from the bow's start
// along the chord towards the bow's end, stopping HANDRAIL.straight along it, so the gap at the bow's end is the stair arrival.
// a, b: the run's ends; out: the unit normal away from the opening (onto the deck); slats: one per arc slat pitch, centred on the run
export function parapetStraight(frame, P = PLATTFORM) {
  const { core, deck } = P, a = frame.polar(deck.railFrom, core.r), e = frame.polar(deck.railTo, core.r);
  const chord = Math.hypot(e[0] - a[0], e[1] - a[1]), ux = (e[0] - a[0]) / chord, uz = (e[1] - a[1]) / chord, len = HANDRAIL.straight;
  const b = [a[0] + ux * len, a[1] + uz * len];
  let out = [-uz, ux];
  if (((a[0] + b[0]) / 2 - frame.x) * out[0] + ((a[1] + b[1]) / 2 - frame.z) * out[1] < 0) out = [uz, -ux];
  const pitch = 2 * Math.PI * core.r / 72, n = Math.floor(len / pitch), first = (len - (n - 1) * pitch) / 2;
  const slats = Array.from({ length: n }, (_, i) => [a[0] + ux * (first + i * pitch), a[1] + uz * (first + i * pitch)]);
  return { a, b, out, slats };
}

// #855: the rafters under each roof face, perpendicular to the eave: u = offset along the eave from the face centre,
// d = the horizontal run inward from the eave to the hip, rise = how much it climbs on that run (the roof pitch of the plan);
// tail: the rafter heads stick out only just past the fascia, under the roof edge, not beyond the roof's silhouette
export const RAFTER = { pitch: 0.8, t: 0.12, drop: 0.2, tail: 0.05 };
export function roofRafters(P = PLATTFORM, pitch = RAFTER.pitch) {
  const side = P.roof.side, ri = side / (2 * Math.sqrt(3)), m = Math.floor(side / pitch), slope = Math.tan(P.roof.pitch * RAD), out = [];
  for (let face = 0; face < 3; face++) for (let j = 0; j < m; j++) {
    const u = (j - (m - 1) / 2) * pitch, d = ri * (1 - Math.abs(u) / (side / 2));
    out.push({ face, u, d, rise: d * slope });
  }
  return out;
}

// #855: the eave purlins and the post braces (s063, s076, s134): a glulam purlin under the rafters along each eave, `inset` in from the
// roof edge (centre line), its top on the rafters' underside at its outer edge, running hip to hip; each post sends two braces out to
// the purlins of the two eaves it faces, from `braceDrop` below the eaves on the post to the middle of the purlin's underside.
// Heights relative to the base; purlins { a, b (world xz), top }; braces { post, face, foot, head ([x, y, z]) }
export const EAVE = { inset: 0.5, w: 0.16, h: 0.24, braceDrop: 1.8, braceT: 0.14 };
export function eaveFrame(frame, P = PLATTFORM) {
  const { roof } = P, slope = Math.tan(roof.pitch * RAD), ri = roof.side / (2 * Math.sqrt(3));
  const top = roof.eaves - RAFTER.drop + (EAVE.inset - EAVE.w / 2) * slope - RAFTER.t / (2 * Math.cos(roof.pitch * RAD));
  const inner = frame.triangle(2 * Math.sqrt(3) * (ri - EAVE.inset)), rtri = frame.triangle(roof.side), posts = frame.triangle(P.frame.side);
  const purlins = inner.map((a, i) => ({ a, b: inner[(i + 1) % 3], top }));
  const braces = [];
  posts.forEach(([px, pz], post) => rtri.forEach((a, face) => {
    const c = rtri[(face + 1) % 3], dx = c[0] - a[0], dz = c[1] - a[1], t = ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz);
    if (t <= 0 || t >= 1) return;   // only the two eaves this post faces
    const qx = a[0] + t * dx, qz = a[1] + t * dz, d = Math.hypot(qx - px, qz - pz);
    if (d > 2.5) return;
    const k = (d - EAVE.inset) / d;
    braces.push({ post, face, foot: [px, roof.eaves - EAVE.braceDrop, pz], head: [px + (qx - px) * k, top - EAVE.h, pz + (qz - pz) * k] });
  }));
  return { purlins, braces };
}

// the central post's height above the base: under the sheathing (2 cm below the skin) at its corners, so its top does not poke
// through the narrowing roof at the apex; the pyramid falls by at least slope per metre out from the axis in every direction
export function centrePostTop(P = PLATTFORM) {
  const { roof, centrePost } = P, slope = Math.tan(roof.pitch * RAD), apex = roof.eaves + roof.side / (2 * Math.sqrt(3)) * slope;
  return apex - 0.05 - centrePost / Math.SQRT2 * slope;
}
