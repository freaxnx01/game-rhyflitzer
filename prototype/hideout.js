// #102: the secret hideout in the Hübel -- pure helpers (no three.js, no DOM): the tunnel axis, the two cut descriptors (the rail
// underpass model of world.js with its own parameter set), the roofed / tree-free predicates, the cavern ring and the Eiffel
// Tower as primitive descriptors. Unit-tested with `node --test prototype/tests/hideout.test.mjs`.
import { UNDERPASS, cutReach } from './world.js';

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
// the floor: ground at the mouth (g0), down the grade to the cavern centre, flat from there
export function floorAt(s, g0, h = HIDEOUT) { return g0 - h.grade * Math.min(Math.max(0, s), h.length); }

// Two cuts in the shape makeCut() builds (index.html): the tunnel polyline mouth -> centre with its deepest point (t) at the
// centre, and a 0.1 m polyline through the centre whose hw makes cutFloorAt a flat disc of radius cavernR.
export function hideoutCuts(groundAt, h = HIDEOUT, u = TUNNEL) {
  const a = hideoutAxis(h), g0 = groundAt(a.mouth[0], a.mouth[1]), f0 = floorAt(h.length, g0, h), depth = groundAt(a.centre[0], a.centre[1]) - f0;
  const tunnel = { pts: a.pts, t: h.length, hw: h.hw, flat: 0, f0, u, x: a.centre[0], z: a.centre[1], capped: null, depth };
  tunnel.reach = [cutReach(tunnel, (s) => groundAt(a.centre[0] + a.ux * s, a.centre[1] + a.uz * s), u)[0], 0];
  const [cx, cz] = a.centre, e = 0.05;
  const cavern = { pts: [[cx - a.ux * e, cz - a.uz * e], [cx + a.ux * e, cz + a.uz * e]], t: e, hw: h.cavernHw, flat: 1, f0, u, x: cx, z: cz, capped: null, depth, reach: [1, 1] };
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
// under the lid: the cavern disc up to the outside of its ring wall, or the tunnel corridor from the portal on
export function roofed(x, z, portal, h = HIDEOUT, u = TUNNEL) {
  if (inCavern(x, z, u.wall, h)) return true;
  const { s, d } = axisCoords(x, z, h);
  return d <= h.hw + u.margin + u.wall / 2 && s >= portal && s <= h.length;
}
// where no tree may grow: the trench and tunnel corridor with 10 m to spare, the cavern with 4 m
export function inHideout(x, z, h = HIDEOUT) {
  if (inCavern(x, z, 4, h)) return true;
  const { s, d } = axisCoords(x, z, h);
  return d <= 10 && s >= -4 && s <= h.length;
}
// n wall pieces around a circle: centre, tangent heading (rot, as wallStations' rot: the box's long axis is (cos rot, sin rot))
export function ringStations(cx, cz, r, n) {
  const out = [];
  for (let k = 0; k < n; k++) { const a = (k + 0.5) / n * 2 * Math.PI; out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, rot: a + Math.PI / 2, len: 2 * Math.PI * r / n + 0.05 }); }
  return out;
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
