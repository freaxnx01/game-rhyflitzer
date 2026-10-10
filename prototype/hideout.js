// #102 / #201: the secret hideout in the Hübel -- pure helpers (no three.js, no DOM): the T1 tunnel axis, the cave system
// behind it (#201: a graph of disc rooms and straight corridors on one floor, each a cut in the rail-underpass model of
// world.js with its own parameter set), the roofed / tree-free predicates, the ring arcs between a room's exits, the capped
// ceilings, the line-of-sight test that keeps the tower hidden from the gate, and the placeholder Eiffel Tower as
// primitive descriptors. Unit-tested with `node --test prototype/tests/hideout.test.mjs`.
import { UNDERPASS, armReach } from './world.js';

// mouth = the hill-side edge of the Hübel (centre line [-703.3, 1419.1] + w/2 + margin), heading = the steepest rise (probe 2026-10-09)
export const HIDEOUT = { mouth: [-703.7, 1423.6], heading: 95 * Math.PI / 180, length: 105, hw: 4.5, grade: 0.05, cavernHw: 20, roofDepth: 5.5, towerH: 33, key: 'mm.hideout' };
export const TUNNEL = { ...UNDERPASS, grade: 0.05, maxDepth: 80 };
// #201: every corridor is a tunnel 12 m high (T1 from the gate on too); rooms with ceiling 'lid' keep the hill's underside
export const TUNNEL_CEIL = 12;
const deg = (d) => d * Math.PI / 180, step = (p, a, l) => [p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l];
const R0 = step(HIDEOUT.mouth, HIDEOUT.heading, HIDEOUT.length);   // T1's end, the #102 cavern's centre (-712.8, 1528.2)
// #201: the cave system. r is the cut's hw (nodeR adds margin + wall/2, as cavernR does for R0); the hall's floor is the one
// floor f0 of the whole system (T1's end), its shell ceiling 380 m up, its drawn shell at shellR (inside the cut's edge, so
// the patch skirt there is hidden behind it). N1 is the bend where T2a turns south into T2b: three exits need its radius.
export const CAVE = {
  nodes: { r0: { c: R0, r: 20, ceiling: 'lid' }, n1: { c: step(R0, deg(185), 90), r: 12, ceiling: 'lid' }, hall: { c: [-790, 1855], r: 168, ceiling: 380, shellR: 167 } },
  links: [{ id: 't2a', from: 'r0', to: 'n1', hw: 4.5, ceiling: TUNNEL_CEIL }, { id: 't2b', from: 'n1', to: 'hall', hw: 4.5, ceiling: TUNNEL_CEIL }],
  stubs: [{ id: 'stubE', node: 'r0', heading: deg(45), len: 15, hw: 4.5, ceiling: 'lid' }, { id: 'stubW', node: 'n1', heading: deg(185), len: 15, hw: 4.5, ceiling: 'lid' }],
};
// #201: the life-size tower. feet: the four foot boxes (relative to the hall centre, metres), to be re-measured from the loaded
// model's footprints (__mm.eiffelFootprints) -- spec defaults until the GLB is measured; the placeholder's legs end on them.
export const EIFFEL = { h: 330, feet: [[-50, -50], [50, -50], [50, 50], [-50, 50]], footHw: 13, footH: 60, url: './assets/models/eiffel_tower.glb', colour: 0x6b4a32, roughness: 0.75, metalness: 0.35, loadWithin: 400 };
// #201: the chase camera looks up in the hall (tilt = rise per metre of horizontal distance to the look point), eased over `ease` s
export const HALL_CAM = { tilt: 0.45, ease: 1 };
// #201: four floodlights on the hall's diagonals at radius r, aimed aimY m up the tower (three r170 physical units: cd; 8000 cd
// at 171 m with decay 2 give ~0.27 each, ~1.1 summed at the aim point -- the sun outside is 0.75)
export const TOWER_SPOTS = { r: 140, aimY: 100, intensity: 8000, distance: 600, angle: 0.5, penumbra: 0.5 };

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
// a flat disc: the #102 trick, a 0.1 m polyline through the centre whose hw makes cutFloorAt level over the disc
const disc = (id, c, r, f0, depth, u) => { const e = 0.05; return { id, pts: [[c[0] - e, c[1]], [c[0] + e, c[1]]], t: e, hw: r, flat: 1, f0, u, x: c[0], z: c[1], depth, reach: [1, 1], roundEnds: true, capped: null }; };
// a level corridor: t at its start, flat past its end, reach to its end; roundEnds keeps the floor level past both ends
const corridor = (id, pts, hw, f0, depth, u) => { const len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); return { id, pts, t: 0, hw, flat: 1e9, f0, u, x: (pts[0][0] + pts[1][0]) / 2, z: (pts[0][1] + pts[1][1]) / 2, depth, reach: [0, len], roundEnds: true, capped: null }; };
// every cut of the system on T1's floor f0: T1 and R0 as #102 built them, then N1, the links, the hall and the stubs
export function caveCuts(groundAt, h = HIDEOUT, u = TUNNEL) {
  const { tunnel, cavern, f0 } = hideoutCuts(groundAt, h, u), dep = (c) => groundAt(c[0], c[1]) - f0, N = CAVE.nodes;
  tunnel.id = 't1'; cavern.id = 'r0';
  const cuts = [tunnel, cavern, disc('n1', N.n1.c, N.n1.r, f0, dep(N.n1.c), u),
    ...CAVE.links.map(l => corridor(l.id, linkPts(l), l.hw, f0, dep(linkPts(l)[1]), u)), disc('hall', N.hall.c, N.hall.r, f0, dep(N.hall.c), u),
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
  if (id === 'r0') exits.push({ a: HIDEOUT.heading + Math.PI, hw: HIDEOUT.hw });
  const half = (e) => Math.asin(Math.min(1, (e.hw + u.margin + u.wall) / R)), out = [];
  const sorted = exits.map(e => ({ a: ((e.a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), half: half(e) })).sort((p, q) => p.a - q.a);
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i], f = sorted[(i + 1) % sorted.length], a0 = e.a + e.half, a1 = (i + 1 < sorted.length ? f.a : f.a + 2 * Math.PI) - f.half;
    if (a1 > a0) out.push({ a0, a1 });
  }
  return out;
}
// the ceiling over (x, z) under the hill, null outside the system: a room with ceiling 'lid' has the hill's underside
// (meshAt - 0.6, the #102 lid), the hall its shell height over the floor, a corridor the lower of the lid and f0 + 12, and
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
// the air of the system in plan: the room discs, the corridors (to the wall's inner face) and T1's corridor from the mouth
function inCaveAir(x, z, h = HIDEOUT, u = TUNNEL) {
  if (roomAt(x, z, 0, u) || corridorAt(x, z, -u.wall / 2, u)) return true;
  const { s, d } = axisCoords(x, z, h); return d <= h.hw + u.margin && s >= -1 && s <= h.length;
}
// is the straight line a -> b (in plan) interrupted by rock anywhere? sampled every 0.5 m
export function sightBlocked(a, b) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
  for (let k = 0; k <= n; k++) if (!inCaveAir(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return true;
  return false;
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
