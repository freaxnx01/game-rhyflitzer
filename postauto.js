// postauto.js (#500): Postautos drive their line by the weekday timetable. Pure: no DOM, no three.js, node --test only.
// World metres, x east, z south; heading th = atan2(dz, dx) like route.js. A bus is kinematic: progress s along its route,
// drawn on the lane line; it is never pushed (spec A0b, A1).
import { makeGrid, gridAddSegment, gridQuery } from './world.js';
import { cumulative, pointAt, isRoutable, routeSignals, blinkerAt, trackRoute, targetSpeed, rightOf, routeLaneOffset } from './route.js';
import { BUS } from './bus.js';

export const PA = {
  topKmh: 60, junctionKmh: 30, junctionBefore: 10, junctionAfter: 5,   // A4
  accel: 1.2, brake: 2, hardBrake: 5, arrive: 0.5,
  minDwell: 10, spawnBefore: 90, layover: 60, edgeSpeed: 12,             // A5
  pullIn: 25, pullOut: 15, kerbGap: 0.3, pullOutSecs: 4,                 // A6
  look: 40, sideClear: 0.5, gap: 2, above: 3,                            // A7
  maxBuses: 8, resync: 5, reach: 2,
};
const DAY = 86400;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => k * k * (3 - 2 * k);

// ---------- clock (A0a): Europe/Zurich wall time, the weekday timetable every day ----------
const ZURICH = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function zurichSeconds(date) {
  const p = Object.fromEntries(ZURICH.formatToParts(date).map((x) => [x.type, x.value]));
  return Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) + date.getMilliseconds() / 1000;
}
// ?patime=HH:MM (A11): the clock starts there and runs in real time
export function parsePatime(text) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text ?? '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null;
}

// ---------- the route a bus drives: a route.js route from one busRoutes entry (#682) ----------
export const NO_ROAD = Object.freeze({ n: '', cls: 'unclassified', w: 0, bridge: false, pts: [] });

function segDist(a, b, x, z) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const u = L2 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1) : 0;
  return { u, d: Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u) };
}

// the routable world road nearest each segment's midpoint (identity matters: routeSignals compares road objects)
function segmentRoads(pts, roads, cfg) {
  const grid = makeGrid(32), out = [];
  roads.forEach((r, ri) => { if (isRoutable(r)) for (let i = 0; i < r.pts.length - 1; i++) gridAddSegment(grid, ...r.pts[i], ...r.pts[i + 1], cfg.reach, [ri, i]); });
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
    let best = null;
    for (const [ri, k] of gridQuery(grid, mx, mz, 0)) {
      const { d } = segDist(roads[ri].pts[k], roads[ri].pts[k + 1], mx, mz);
      if (d <= cfg.reach && (!best || d < best.d)) best = { d, r: roads[ri] };
    }
    out.push(best ? best.r : out[i - 1] ?? NO_ROAD);
  }
  return out;
}

// every main-network node with 3+ roads within reach of the route, as route.js joints { s, deg }
function routeJoints(pts, cum, graph, cfg) {
  const grid = makeGrid(32), out = [];
  for (let i = 0; i < pts.length - 1; i++) gridAddSegment(grid, ...pts[i], ...pts[i + 1], cfg.reach, i);
  graph.nodes.forEach((n, id) => {
    const deg = graph.adj[id].length;
    if (deg < 3 || !graph.main[id]) return;
    let best = null;
    for (const i of gridQuery(grid, n.x, n.z, 0)) {
      const q = segDist(pts[i], pts[i + 1], n.x, n.z);
      if (q.d <= cfg.reach && (!best || q.d < best.d)) best = { d: q.d, s: cum[i] + q.u * (cum[i + 1] - cum[i]) };
    }
    if (best) out.push({ s: best.s, deg });
  });
  return out.sort((a, b) => a.s - b.s);
}

export function busRoute(br, roads, graph, cfg = PA) {
  const pts = br.pts.map((p) => [p[0], p[1]]), cum = cumulative(pts);
  const route = { id: br.id, line: String(br.line), pts, cum, len: cum[cum.length - 1], road: segmentRoads(pts, roads, cfg), joints: routeJoints(pts, cum, graph, cfg) };
  route.signals = routeSignals(route);
  route.stops = br.stops.map((st) => { const [cx, cz] = pointAt(pts, cum, st.s); return { ...st, uic: String(st.uic), kerb: Math.hypot(st.x - cx, st.z - cz) }; }).sort((a, b) => a.s - b.s);
  route.stopS = new Map(route.stops.map((st) => [st.uic, st.s]));
  return route;
}

// metres right of the centre line: the lane (#678), out to the kerb while pulling in to and out of a stop (A6)
export function busOffset(route, s, cfg = PA) {
  const lane = routeLaneOffset(route, s);
  let off = lane;
  for (const st of route.stops) {
    const d = s - st.s;
    if (d <= -cfg.pullIn || d >= cfg.pullOut) continue;
    const k = smooth(d < 0 ? 1 + d / cfg.pullIn : 1 - d / cfg.pullOut), kerb = Math.max(lane, st.kerb - BUS.width / 2 - cfg.kerbGap);
    off = Math.max(off, lane + (kerb - lane) * k);
  }
  return off;
}

export function busPose(route, s, cfg = PA) {
  const at = (q) => rightOf(route.pts, route.cum, q, busOffset(route, q, cfg));
  const [x, z] = at(s), a = at(s - 3), b = at(s + 3);
  return { x, z, th: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
