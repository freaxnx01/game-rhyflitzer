// #102 / #201 / #361: the secret hideout in the Hübel -- pure helpers (no three.js, no DOM): the T1 tunnel axis, the lift
// hall at its end (#361 replaced the #201 cave system of rooms and corridors with it), the roofed / tree-free predicates,
// the ring arcs round the hall's one exit, the capped ceilings, the drive-through freight lift (#277 / #361), and the
// placeholder Eiffel Tower as primitive descriptors. Unit-tested with `node --test prototype/tests/hideout.test.mjs`.
import { UNDERPASS, armReach } from './world.js';

// mouth = the hill-side edge of the Hübel (centre line [-703.3, 1419.1] + w/2 + margin), heading = the steepest rise (probe 2026-10-09)
export const HIDEOUT = { mouth: [-703.7, 1423.6], heading: 95 * Math.PI / 180, length: 105, hw: 4.5, grade: 0.05, cavernHw: 23, roofDepth: 5.5, towerH: 33, key: 'mm.hideout' };
export const TUNNEL = { ...UNDERPASS, grade: 0.05, maxDepth: 80 };
// #201: every corridor is a tunnel 12 m high (T1 from the gate on too); rooms with ceiling 'lid' keep the hill's underside
export const TUNNEL_CEIL = 12;
const deg = (d) => d * Math.PI / 180, step = (p, a, l) => [p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l];
const R0 = step(HIDEOUT.mouth, HIDEOUT.heading, HIDEOUT.length);   // T1's end, the lift hall's centre (-712.8, 1528.2)
// #361: T1 ends in the lift hall, radius 25 m (cavernHw 23 + margin + wall/2); the #201 cave system of further rooms and
// corridors is gone -- the hall is the only node, with no links or stubs.
export const CAVE = {
  nodes: { hall: { c: R0, r: HIDEOUT.cavernHw, ceiling: 'lid' } },
  links: [],
  stubs: [],
};
// #201: the life-size tower. feet: the four foot boxes (relative to the room's tower centre, metres), measured 2026-10-11 from the loaded
// model's footprints (__mm.eiffelFootprints): vertices below 20 m span x 36.8..69.7, z 36.8..68.6 per quadrant; the placeholder's legs end on them.
// #201 look: metalness low -- without an environment map a metallic surface only swallows the floodlight, it reflects nothing
export const EIFFEL = { h: 330, feet: [[-53, -53], [53, -53], [53, 53], [-53, 53]], footHw: 17, footH: 60, url: './assets/models/eiffel_tower.glb', colour: 0x6b4a32, roughness: 0.6, metalness: 0.1, loadWithin: 400 };
// #355: the Atomium (Brussels, 102 m), life size at scale 1. anchor: the model's own sphere-frame axis and ground, measured from its
// vertices (axis x -1.5, z 3.0; the ground platform at y 0.99), which the room centre and floor take. feet: [x, z, half width] relative
// to that axis -- the central column and entrance block (solid up to the lowest sphere's first metres), then the three bipod legs, 120 degrees
// apart at about 48 m, each with its stairs and fence; hw per foot fits the vertices below 12 m (the car drives between and under the spheres).
export const ATOMIUM = { key: 'atomium', h: 101.3, scale: 1, anchor: [-1.5, 0.99, 3.0], feet: [[0, 0, 14], [-49, 0, 10], [24.5, -43, 10], [29, 48, 10]], footHw: 10, footH: 30, url: './assets/models/atomium.glb', loadWithin: 400 };
// #422: the RMS Titanic (269 m, 1912), life size: scale 269 m / the model's 10686 length units. anchor: the hull's bottom centre in model units (bbox middle
// x 1580.3, z 346.9, keel at y 0). alongV: the ship lies along the room's own cross axis, broadside to the portal. hull: [along-ship offset from the centre,
// half length, half width] per 22 m section, measured 2026-10-20 from the optimised model's vertices (widths incl. bridge wings, +0.3 m); solid up to hullH.
export const TITANIC = { key: 'titanic', h: 72.9, scale: 0.0251728, anchor: [1580.26, 0, 346.9], alongV: true, flat: true, length: 269, hull: [[-123.3, 11.2, 11.8], [-100.9, 11.2, 13.0], [-78.5, 11.2, 14.3], [-56.0, 11.2, 14.7], [-33.6, 11.2, 14.8], [-11.2, 11.2, 14.8], [11.2, 11.2, 14.8], [33.6, 11.2, 14.8], [56.0, 11.2, 14.8], [78.5, 11.2, 15.3], [100.9, 11.2, 12.5], [123.3, 11.2, 9.6]], hullH: 75, url: './assets/models/titanic.glb', loadWithin: 400 };
// #201: the extent of [x, z] points -- a loop, not Math.min(...spread): the real model's leg has far more vertices than V8's argument limit
export function pointBounds(points) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0, x1, z0, z1, n: points.length };
}

// #276 / #361: the hall's floor lamps as point lights (relative to the floor), two along T1's axis. A lamp low over the
// road makes a hot spot (1/d^2 at 3 m is 100x the value 30 m off) that the car drives into and out of in a second, so
// they hang high: the light under them stays a gentle swell. three r170 physical units (cd), distance = hard cut-off.
export const CAVE_LAMPS = { hall: { off: 16, y: 9, intensity: 180, distance: 60, decay: 2 } };
export function caveLamps(h = HIDEOUT) {
  const a = hideoutAxis(h), [cx, cz] = a.centre, out = [];
  for (const k of [-1, 1]) out.push({ room: 'hall', x: cx + a.ux * CAVE_LAMPS.hall.off * k, z: cz + a.uz * CAVE_LAMPS.hall.off * k, ...CAVE_LAMPS.hall });
  return out;
}
// what the point lamps add on a floor patch at (x, z) facing up: intensity / d^decay x cos, times three's distance window
export function lampLight(lamps, x, z) {
  let sum = 0;
  for (const l of lamps) {
    const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz, l.y); if (d >= l.distance) continue;
    sum += l.intensity / Math.pow(d, l.decay) * (l.y / d) * Math.pow(1 - Math.pow(d / l.distance, 4), 2);
  }
  return sum;
}

// #361: the freight lift in the lift hall, on T1's axis: cabin 8 x 22 m, a door at each end of the one driving axis. Door A (towards
// the tunnel) works on the surface ('top'), door B (away from it) on the ring level below ('bottom'); the other end is a wall there.
export const LIFT = { c: CAVE.nodes.hall.c, th: HIDEOUT.heading, hw: 4, hd: 11, door: { hw: 3, h: 5 }, wall: 0.5, height: 8, near: 15, lead: 1.5 };
// is (x, z) inside the platform's rectangle (pad > 0 grows it)
export function onLiftPlatform(x, z, pad = 0, l = LIFT) {
  const dx = x - l.c[0], dz = z - l.c[1], along = dx * Math.cos(l.th) + dz * Math.sin(l.th), across = -dx * Math.sin(l.th) + dz * Math.cos(l.th);
  return Math.abs(along) <= l.hd + pad && Math.abs(across) <= l.hw + pad;
}
const liftAt = (l, a, b) => [l.c[0] + Math.cos(l.th) * a - Math.sin(l.th) * b, l.c[1] + Math.sin(l.th) * a + Math.cos(l.th) * b];
// is the whole vehicle (half-length halfLen) inside the cabin
export function inCabin(x, z, halfLen = 0, l = LIFT) {
  const dx = x - l.c[0], dz = z - l.c[1];
  return Math.abs(dx * Math.cos(l.th) + dz * Math.sin(l.th)) <= l.hd - halfLen && Math.abs(-dx * Math.sin(l.th) + dz * Math.cos(l.th)) <= l.hw;
}
// the door at a level: 'top' is door A (towards the tunnel, the end the car reaches first), 'bottom' is door B (away from it)
export function liftDoor(level, l = LIFT) {
  const k = level === 'top' ? -1 : 1, [x, z] = liftAt(l, k * l.hd, 0);
  return { x, z, th: level === 'top' ? l.th + Math.PI : l.th };
}
// within l.near of that door -- or, at speed, within l.lead seconds of it, so the 1 s door is open when a fast car arrives --
// or already in the cabin
export function nearLiftDoor(x, z, level, l = LIFT, speed = 0) {
  const d = liftDoor(level, l);
  return Math.hypot(x - d.x, z - d.z) <= Math.max(l.near, speed * l.lead) || onLiftPlatform(x, z, 0, l);
}
// the shaft house's OBBs at a level: side walls, the shut end, the working door's jambs and panel (the panel carries { liftDoor: level })
export function liftColliders(level, y, l = LIFT) {
  const w = l.wall, h = y + l.height, c = Math.cos(l.th), s = Math.sin(l.th), open = level === 'top' ? -1 : 1, end = l.hd + w / 2, jamb = (l.hw - l.door.hw) / 2;
  const box = (a, b, hw, hd, extra = {}) => { const [x, z] = liftAt(l, a, b); return { x, z, hw, hd, c, s, h, secret: true, ...extra }; };
  return [box(0, l.hw + w / 2, l.hd + w, w / 2), box(0, -(l.hw + w / 2), l.hd + w, w / 2),
    box(-open * end, 0, w / 2, l.hw + w),
    box(open * end, l.door.hw + jamb, w / 2, jamb), box(open * end, -(l.door.hw + jamb), w / 2, jamb),
    box(open * end, 0, w / 2, l.door.hw, { liftDoor: level })];
}

export function hideoutAxis(h = HIDEOUT) {
  const ux = Math.cos(h.heading), uz = Math.sin(h.heading), mouth = [h.mouth[0], h.mouth[1]], centre = [mouth[0] + ux * h.length, mouth[1] + uz * h.length];
  return { ux, uz, mouth, centre, pts: [mouth, centre] };
}
// s = metres along the axis from the mouth (negative on the road side), d = metres off it
export function axisCoords(x, z, h = HIDEOUT) {
  const a = hideoutAxis(h), dx = x - a.mouth[0], dz = z - a.mouth[1];
  return { s: dx * a.ux + dz * a.uz, d: Math.abs(-dx * a.uz + dz * a.ux) };
}
// The floor: ground at the mouth (g0), down the grade, level from the cavern's near edge on -- so the tunnel floor and the
// flat cavern disc meet without a step (they would differ by grade * cavernR if the grade ran all the way to the centre).
export function floorAt(s, g0, h = HIDEOUT, u = TUNNEL) { return g0 - h.grade * Math.min(Math.max(0, s), h.length - cavernR(h, u)); }

// Two cuts in the shape makeCut() builds (index.html): the tunnel polyline mouth -> centre with its deepest point (t) at the
// centre, and a 0.1 m polyline through the centre whose hw makes cutFloorAt a flat disc of radius cavernR. roundEnds keeps
// cutFloorAt's level disc past a polyline end (#156 ramps road cuts on past their ends instead).
export function hideoutCuts(groundAt, h = HIDEOUT, u = TUNNEL) {
  const a = hideoutAxis(h), g0 = groundAt(a.mouth[0], a.mouth[1]), f0 = floorAt(h.length, g0, h, u), depth = groundAt(a.centre[0], a.centre[1]) - f0;
  // flat = cavernR: the tunnel's own floor is already level over the disc, so cutFloorMin finds no step where the two cuts meet
  const tunnel = { pts: a.pts, t: h.length, hw: h.hw, flat: cavernR(h, u), f0, u, x: a.centre[0], z: a.centre[1], capped: null, depth, roundEnds: true };
  tunnel.reach = [armReach(tunnel, (s) => groundAt(a.centre[0] + a.ux * s, a.centre[1] + a.uz * s), h.length, u)[0].s, 0];
  const [cx, cz] = a.centre, e = 0.05;
  const cavern = { pts: [[cx - a.ux * e, cz - a.uz * e], [cx + a.ux * e, cz + a.uz * e]], t: e, hw: h.cavernHw, flat: 1, f0, u, x: cx, z: cz, capped: null, depth, reach: [1, 1], roundEnds: true };
  return { tunnel, cavern, f0 };
}
// first whole metre along the axis where the trench is roofDepth deep: the portal stands there, the lid starts behind it
export function portalS(groundAt, h = HIDEOUT) {
  const a = hideoutAxis(h), g0 = groundAt(a.mouth[0], a.mouth[1]);
  for (let s = 0; s <= h.length; s++) if (groundAt(a.mouth[0] + a.ux * s, a.mouth[1] + a.uz * s) - floorAt(s, g0, h) >= h.roofDepth) return s;
  return h.length;
}
export function cavernR(h = HIDEOUT, u = TUNNEL) { return h.cavernHw + u.margin + u.wall / 2; }
export function inCavern(x, z, pad = 0, h = HIDEOUT) { const a = hideoutAxis(h); return Math.hypot(x - a.centre[0], z - a.centre[1]) <= cavernR(h) + pad; }

// ---------- #201: the cave system ----------
// a room's floor radius: the cut's hw plus the margin and half the wall (the ring wall's centre line is wall/2 further in)
export function nodeR(n, u = TUNNEL) { return n.r + u.margin + u.wall / 2; }
export function linkPts(l) { return [CAVE.nodes[l.from].c, CAVE.nodes[l.to].c]; }
// a stub starts on the node's disc edge (a wall thickness inside it, so the cut and the disc overlap) and runs len m out
export function stubPts(s, u = TUNNEL) { const n = CAVE.nodes[s.node], a = step(n.c, s.heading, nodeR(n, u) - u.wall); return [a, step(a, s.heading, s.len)]; }
// a level corridor: t at its start, flat past its end, reach to its end; roundEnds keeps the floor level past both ends
const corridor = (id, pts, hw, f0, depth, u) => { const len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); return { id, pts, t: 0, hw, flat: 1e9, f0, u, x: (pts[0][0] + pts[1][0]) / 2, z: (pts[0][1] + pts[1][1]) / 2, depth, reach: [0, len], roundEnds: true, capped: null }; };
// every cut of the system on T1's floor f0: T1 and the hall as #102 built them, plus any links/stubs (#361: none today)
export function caveCuts(groundAt, h = HIDEOUT, u = TUNNEL) {
  const { tunnel, cavern, f0 } = hideoutCuts(groundAt, h, u), dep = (c) => groundAt(c[0], c[1]) - f0;
  tunnel.id = 't1'; cavern.id = 'hall';
  const cuts = [tunnel, cavern,
    ...CAVE.links.map(l => corridor(l.id, linkPts(l), l.hw, f0, dep(linkPts(l)[1]), u)),
    ...CAVE.stubs.map(s => corridor(s.id, stubPts(s, u), s.hw, f0, dep(stubPts(s, u)[1]), u))];
  return { cuts, f0 };
}
// the room whose disc (+ pad) holds (x, z), else null
export function roomAt(x, z, pad = 0, u = TUNNEL) { for (const id in CAVE.nodes) { const n = CAVE.nodes[id]; if (Math.hypot(x - n.c[0], z - n.c[1]) <= nodeR(n, u) + pad) return id; } return null; }
function alongPts(pts, x, z) { const [ax, az] = pts[0], [bx, bz] = pts[1], ux = bx - ax, uz = bz - az, len = Math.hypot(ux, uz), s = ((x - ax) * ux + (z - az) * uz) / len, d = Math.abs((-(x - ax) * uz + (z - az) * ux) / len); return { s, d, len }; }
function corridors(u = TUNNEL) { return [...CAVE.links.map(l => ({ ...l, pts: linkPts(l) })), ...CAVE.stubs.map(s => ({ ...s, pts: stubPts(s, u) }))]; }
// the link or stub whose corridor (to the wall's centre line, + pad sideways and along) holds (x, z): { id, s, d }, else null
export function corridorAt(x, z, pad = 0, u = TUNNEL) {
  for (const c of corridors(u)) { const { s, d, len } = alongPts(c.pts, x, z); if (d <= c.hw + u.margin + u.wall / 2 + pad && s >= -pad && s <= len + pad) return { id: c.id, s, d }; }
  return null;
}
// under the lid: any room up to the outside of its ring wall, any corridor, or T1 from the portal on; pad widens all of them
// sideways (the drawn lid takes TUNNEL.wall, so it reaches over the trough walls' outer half and the cut's edge)
export function caveRoofed(x, z, portal, pad = 0, h = HIDEOUT, u = TUNNEL) {
  if (roomAt(x, z, u.wall + pad, u) || corridorAt(x, z, pad, u)) return true;
  const { s, d } = axisCoords(x, z, h); return d <= h.hw + u.margin + u.wall / 2 + pad && s >= portal && s <= h.length;
}
// the cave light fades in over the first CAVE_FADE m past the portal (and out again driving back), not at one step: the day look
// at the portal, the cave look from CAVE_FADE m in. caveDepth = metres past the portal along T1 (Infinity in the rooms and corridors).
export const CAVE_FADE = 30;
export function caveBlend(depth, fade = CAVE_FADE) { const t = Math.min(1, Math.max(0, depth / fade)); return t * t * (3 - 2 * t); }
// The global cave look and the hard switches (forest, sun shadow map, interior group, village labels) cannot fade, so they flip where the portal is far behind
// and fully fogged: IN metres past the portal going in, OUT metres coming back (hysteresis, no flicker). Both lie past CAVE_FADE,
// where caveBlend is already 1. depth = caveDepth (Infinity in the rooms), -Infinity outside the cave.
// the tunnel's own darkness (a lining of the walls, floor and roof with a depth-graded black) grows with caveBlend up to TUNNEL_DARK while the
// scene's light stays daylight, so the opening is never dark; 1 - TUNNEL_DARK is about the cave look's share of the day light
export const TUNNEL_DARK = 0.6;
export const CAVE_SWITCH_IN = 42, CAVE_SWITCH_OUT = 36;
export function caveSwitch(depth, wasOn) { return depth >= CAVE_SWITCH_IN || (wasOn && depth > CAVE_SWITCH_OUT); }
// #379: the cave look as one continuous function of the depth (no hysteresis needed, nothing to flicker): the day up to
// CAVE_LOOK_FADE[0] m past the portal (the opening seen from there stays daylight), the full cave look from CAVE_LOOK_FADE[1] m on --
// before CAVE_SWITCH_OUT, so the hard switches happen with the picture already fully faded. Light, fog, sky, the hall's lamps and
// the portal's veil all follow it.
export const CAVE_LOOK_FADE = [12, 36];
export function caveLookK(depth, fade = CAVE_LOOK_FADE) { const t = Math.min(1, Math.max(0, (depth - fade[0]) / (fade[1] - fade[0]))); return t * t * (3 - 2 * t); }
export function caveDepth(x, z, portal, h = HIDEOUT, u = TUNNEL) {
  const { s, d } = axisCoords(x, z, h);
  return d <= h.hw + u.margin + u.wall / 2 && s >= portal && s <= h.length - cavernR(h, u) ? s - portal : Infinity;
}
const hexRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lerpHex = (a, b, k) => '#' + hexRgb(a).map((v, i) => Math.round(v * (1 - k) + hexRgb(b)[i] * k).toString(16).padStart(2, '0')).join('');
// a look is { name: '#rrggbb' | number }: the same keys in both, each mixed on its own; the ends are returned as they are
export function blendLook(a, b, k) {
  if (k <= 0) return { ...a }; if (k >= 1) return { ...b };
  const out = {}; for (const key of Object.keys(a)) out[key] = typeof a[key] === 'string' ? lerpHex(a[key], b[key], k) : a[key] * (1 - k) + b[key] * k;
  return out;
}
// where no tree and no forest-edge wall may stand: the open trench and T1's corridor with 10 m to spare, up to R0 (the forest
// stands on the lid over the rest of the system, #201)
export function inHideout(x, z, h = HIDEOUT) { const { s, d } = axisCoords(x, z, h); return d <= 10 && s >= -4 && s <= h.length - cavernR(h) + 6; }
// a straight piece (a forest edge wall, #13) that touches inHideout anywhere along it, sampled every metre
export function segmentInHideout(x0, z0, x1, z1, h = HIDEOUT) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0)));
  for (let k = 0; k <= n; k++) if (inHideout(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, h)) return true;
  return false;
}
// n wall pieces along an arc (the whole circle by default): centre, tangent heading (rot, as wallStations' rot: the box's
// long axis is (cos rot, sin rot))
export function ringStations(cx, cz, r, n, a0 = 0, a1 = 2 * Math.PI) {
  const out = [], span = a1 - a0;
  for (let k = 0; k < n; k++) { const a = a0 + (k + 0.5) / n * span; out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, rot: a + Math.PI / 2, len: span * r / n + 0.05 }); }
  return out;
}
// A room's ring wall is arcs, not a closed circle: the stretch facing each exit (the links and stubs leaving it, and T1 for
// R0) is left out, so the corridor opens into the room. Each arc ends exactly at the corridor's outer faces (hw + margin +
// wall off its axis). The ring's centre line sits wall/2 inside the cut's edge, so its outer face is on the edge and its
// inner face a whole wall thickness inside it: the skirt the patch grid draws there drops the full height of the hill, and
// anything of that left uncovered reads as a green wall in the cave. Returns [{ a0, a1 }], sorted by angle.
export function ringArcs(id, u = TUNNEL) {
  const n = CAVE.nodes[id], R = nodeR(n, u) - u.wall / 2, exits = [];
  for (const l of CAVE.links) {
    if (l.from === id) exits.push({ a: Math.atan2(CAVE.nodes[l.to].c[1] - n.c[1], CAVE.nodes[l.to].c[0] - n.c[0]), hw: l.hw });
    if (l.to === id) exits.push({ a: Math.atan2(CAVE.nodes[l.from].c[1] - n.c[1], CAVE.nodes[l.from].c[0] - n.c[0]), hw: l.hw });
  }
  for (const s of CAVE.stubs) if (s.node === id) exits.push({ a: s.heading, hw: s.hw });
  if (id === 'hall') exits.push({ a: HIDEOUT.heading + Math.PI, hw: HIDEOUT.hw });
  const half = (e) => Math.asin(Math.min(1, (e.hw + u.margin + u.wall) / R)), out = [];
  const sorted = exits.map(e => ({ a: ((e.a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), half: half(e) })).sort((p, q) => p.a - q.a);
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i], f = sorted[(i + 1) % sorted.length], a0 = e.a + e.half, a1 = (i + 1 < sorted.length ? f.a : f.a + 2 * Math.PI) - f.half;
    if (a1 > a0) out.push({ a0, a1 });
  }
  return out;
}
// the ceiling over (x, z) under the hill, null outside the system: a room with ceiling 'lid' has the hill's underside
// (meshAt - 0.6, the #102 lid), the lobby its 14 m over the floor, a corridor the lower of the lid and f0 + 12, and
// T1 from the portal on the lower of the lid and its own floor + 12
export function ceilingAt(x, z, meshAt, portal, h = HIDEOUT, u = TUNNEL) {
  const lid = meshAt(x, z) - 0.6, a = hideoutAxis(h), g0 = meshAt(a.mouth[0], a.mouth[1]), f0 = floorAt(h.length, g0, h, u), room = roomAt(x, z, u.wall, u);
  if (room) { const n = CAVE.nodes[room]; return n.ceiling === 'lid' ? lid : f0 + n.ceiling; }
  const c = corridorAt(x, z, 0, u);
  if (c) { const def = [...CAVE.links, ...CAVE.stubs].find(k => k.id === c.id); return def.ceiling === 'lid' ? lid : Math.min(lid, f0 + def.ceiling); }
  const { s, d } = axisCoords(x, z, h);
  if (d <= h.hw + u.margin + u.wall / 2 && s >= portal && s <= h.length) return Math.min(lid, floorAt(s, g0, h, u) + TUNNEL_CEIL);
  return null;
}
// The Eiffel Tower at h metres (1:10 at 33), base y = 0, centred on (0, 0), unrotated: four legs of three tapered segments
// (base corners +-6.25 -> 1st floor +-3.5 at 5.7 -> 2nd floor +-2.0 at 11.5 -> top +-0.9 at 27.6), X braces on the two lower
// storeys, three platforms, four arches under the 1st floor, the spire to 33. kinds: leg {from, to, r0, r1}, box {w, h, d, y},
// arch {r, tube, y, rot, offset}, spire {y0, y1, r0, r1}. #201: footHalf (metres at h) puts the base corners on the feet.
export function eiffelParts(h = HIDEOUT.towerH, footHalf = 6.25 * h / 33) {
  const k = h / 33, P = (x, y, z) => [x * k, y * k, z * k], out = [];
  const corners = (half) => [[-half, -half], [half, -half], [half, half], [-half, half]];
  const levels = [[footHalf / k, 0, 0.9], [3.5, 5.7, 0.6], [2.0, 11.5, 0.4], [0.9, 27.6, 0.25]];
  for (let i = 0; i < 3; i++) {
    const [h0, y0, r0] = levels[i], [h1, y1, r1] = levels[i + 1], c0 = corners(h0), c1 = corners(h1);
    for (let c = 0; c < 4; c++) out.push({ kind: 'leg', from: P(c0[c][0], y0, c0[c][1]), to: P(c1[c][0], y1, c1[c][1]), r0: r0 * k, r1: r1 * k });
    if (i < 2) for (let c = 0; c < 4; c++) {
      const n = (c + 1) % 4;
      out.push({ kind: 'leg', from: P(c0[c][0], y0, c0[c][1]), to: P(c1[n][0], y1, c1[n][1]), r0: 0.12 * k, r1: 0.12 * k });
      out.push({ kind: 'leg', from: P(c0[n][0], y0, c0[n][1]), to: P(c1[c][0], y1, c1[c][1]), r0: 0.12 * k, r1: 0.12 * k });
    }
  }
  for (const [w, y, t] of [[7.6, 5.7, 0.6], [4.4, 11.5, 0.5], [2.2, 27.6, 0.4]]) out.push({ kind: 'box', w: w * k, h: t * k, d: w * k, y: (y - t) * k });
  for (let side = 0; side < 4; side++) out.push({ kind: 'arch', r: 4.4 * k, tube: 0.22 * k, y: 0.2 * k, rot: side * Math.PI / 2, offset: 4.9 * k });
  out.push({ kind: 'spire', y0: 27.6 * k, y1: 33 * k, r0: 0.2 * k, r1: 0.08 * k });
  return out;
}
