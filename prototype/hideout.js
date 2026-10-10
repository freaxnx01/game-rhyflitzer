// #102: the secret hideout in the Hübel -- pure helpers (no three.js, no DOM): the tunnel axis, the two cut descriptors (the rail
// underpass model of world.js with its own parameter set), the roofed / tree-free predicates, the cavern ring and the Eiffel
// Tower as primitive descriptors. Unit-tested with `node --test prototype/tests/hideout.test.mjs`.
import { UNDERPASS, armReach } from './world.js';

// mouth = the hill-side edge of the Hübel (centre line [-703.3, 1419.1] + w/2 + margin), heading = the steepest rise (probe 2026-10-09)
export const HIDEOUT = { mouth: [-703.7, 1423.6], heading: 95 * Math.PI / 180, length: 105, hw: 4.5, grade: 0.05, cavernHw: 20, roofDepth: 5.5, towerH: 33, key: 'mm.hideout' };
export const TUNNEL = { ...UNDERPASS, grade: 0.05, maxDepth: 80 };

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
// under the lid: the cavern disc up to the outside of its ring wall, or the tunnel corridor from the portal on; pad widens
// both sideways (the drawn lid takes TUNNEL.wall, so it reaches over the trough walls' outer half and the cut's edge)
export function roofed(x, z, portal, h = HIDEOUT, u = TUNNEL, pad = 0) {
  if (inCavern(x, z, u.wall + pad, h)) return true;
  const { s, d } = axisCoords(x, z, h);
  return d <= h.hw + u.margin + u.wall / 2 + pad && s >= portal && s <= h.length;
}
// where no tree may grow: the trench and tunnel corridor with 10 m to spare, the cavern with 4 m
export function inHideout(x, z, h = HIDEOUT) {
  if (inCavern(x, z, 4, h)) return true;
  const { s, d } = axisCoords(x, z, h);
  return d <= 10 && s >= -4 && s <= h.length;
}
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
// The cavern's ring wall is an arc, not a closed circle: the stretch facing the tunnel is left out, so the corridor opens
// into the cavern. The arc ends exactly at the corridor's outer faces (hw + margin + wall off the axis). The wall's outer
// face sits on the cut's edge and its inner face a whole wall thickness inside it, because the skirt the patch grid draws
// there drops the full height of the hill: a 1 m patch cell blends the hilltop up to a cell diagonal inside the edge, and
// anything of that left uncovered reads as a green wall in the cave.
export function ringArc(h = HIDEOUT, u = TUNNEL) {
  const r = cavernR(h, u) - u.wall / 2, half = Math.asin(Math.min(1, (h.hw + u.margin + u.wall) / r)), a0 = h.heading + Math.PI + half;
  return { r, a0, a1: a0 + 2 * Math.PI - 2 * half };
}
// The Eiffel Tower at h metres (1:10 at 33), base y = 0, centred on (0, 0), unrotated: four legs of three tapered segments
// (base corners +-6.25 -> 1st floor +-3.5 at 5.7 -> 2nd floor +-2.0 at 11.5 -> top +-0.9 at 27.6), X braces on the two lower
// storeys, three platforms, four arches under the 1st floor, the spire to 33. kinds: leg {from, to, r0, r1}, box {w, h, d, y},
// arch {r, tube, y, rot, offset}, spire {y0, y1, r0, r1}
export function eiffelParts(h = HIDEOUT.towerH) {
  const k = h / 33, P = (x, y, z) => [x * k, y * k, z * k], out = [];
  const corners = (half) => [[-half, -half], [half, -half], [half, half], [-half, half]];
  const levels = [[6.25, 0, 0.9], [3.5, 5.7, 0.6], [2.0, 11.5, 0.4], [0.9, 27.6, 0.25]];
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
