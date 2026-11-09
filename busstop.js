// #712: where a Postauto stop stands -- pole, shelter and the yellow zigzag -- clear of every standing bus and off
// the asphalt. Pure module, node --test only. The world's stop point is w/2 + 0.5 right of the route
// (pipeline/world_bus.py); the bus pulls in to 0.3 m short of it (postauto.js busOffset).
import { BUS } from './bus.js';
import { rightOf } from './route.js';

export const STOP = {
  poleOut: 0.6,                 // m: the pole this far beyond the stop point, away from the road
  clear: 0.5,                   // m: pole and shelter to every standing bus; shelter to every asphalt edge
  poleRoad: 0.2,                // m: the pole to the nearest asphalt edge
  push: 0.25, maxPush: 2,       // m: candidates further out, step and limit
  shift: 1, maxShift: 12,       // m: candidates along the kerb, step and limit (both ways)
  shelter: { w: 4, d: 1.8, front: 0.3, back: 2.1, h: 2.4 },   // roof 4 x 1.8 from `front` to `back` behind the pole
  zigzag: { len: 16, w: 0.5 },  // SSV 6.21 along the kerb, centred on the stand point
};

export const stopKey = (st) => `${st.uic}:${st.x}:${st.z}`;

// the sign's rows: one per line and direction that leaves this point; a route that ends here has no row
export function stopRows(calls) {
  const seen = new Map();
  for (const c of calls) if (!c.last) seen.set(`${c.line}|${c.dest}`, { line: c.line, dest: c.dest });
  return [...seen.values()].sort((a, b) => a.line.localeCompare(b.line) || a.dest.localeCompare(b.dest));
}

// a route ends at its last stop only when it ends inside the map; a cut route (#767: 143 at Breitenacher) drives on
export const stopEnds = (i, n, cut) => i === n - 1 && !(cut && cut[1]);

// the Fahrplantafel header (#767): the stop's own lines, once each
export const sheetLines = (rows) => [...new Set(rows.map((r) => r.line))].sort((a, b) => a.localeCompare(b)).join(' ');

export function rectClearance(px, pz, pose, size) {
  const dx = px - pose.x, dz = pz - pose.z, c = Math.cos(pose.th), s = Math.sin(pose.th);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  return Math.max(Math.abs(u) - size.length / 2, Math.abs(v) - size.width / 2);
}

function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

export function roadEdgeDist(x, z, roads) {
  let m = Infinity;
  for (const r of roads) { const p = r.pts; for (let i = 0; i < p.length - 1; i++) { const d = segDist(x, z, p[i], p[i + 1]) - r.w / 2; if (d < m) m = d; } }
  return m;
}

function shelterCorners(cx, cz, u, n, cfg) {
  const hw = cfg.shelter.w / 2, hd = cfg.shelter.d / 2;
  return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [cx + u[0] * hw * a + n[0] * hd * b, cz + u[1] * hw * a + n[1] * hd * b]);
}

// candidate order (spec: 2026-11-07-swiss-bus-stops-design): shift along the kerb 0, +1, -1, +2, -2 ... ±maxShift,
// and for each shift the push 0, 0.25 ... maxPush further out; the first clear candidate wins
function* candidates(cfg) {
  for (let k = 0; k * cfg.shift <= cfg.maxShift; k++) for (const sgn of k ? [1, -1] : [1]) for (let p = 0; p <= cfg.maxPush + 1e-9; p += cfg.push) yield { shift: sgn * k * cfg.shift, push: p };
}

export function stopLayout(stop, poses, roads, bus = BUS, cfg = STOP) {
  const u = [Math.cos(stop.rot), Math.sin(stop.rot)], n = [-u[1], u[0]];   // along the kerb; away from the road (right of travel)
  const mid = (cfg.shelter.front + cfg.shelter.back) / 2;
  const clearance = (x, z) => Math.min(...poses.map((p) => rectClearance(x, z, p, bus)));
  let best = null, bestScore = -Infinity;
  for (const c of candidates(cfg)) {
    const out = cfg.poleOut + c.push;
    const pole = [stop.x + u[0] * c.shift + n[0] * out, stop.z + u[1] * c.shift + n[1] * out];
    const cx = pole[0] + n[0] * mid, cz = pole[1] + n[1] * mid, corners = shelterCorners(cx, cz, u, n, cfg);
    const lay = { x: stop.x, z: stop.z, yaw: stop.rot, pole, shelter: { x: cx, z: cz, corners }, shift: c.shift, pushed: c.push };
    const score = Math.min(clearance(...pole), roadEdgeDist(...pole, roads));
    if (score > bestScore) { bestScore = score; best = lay; }
    const ok = clearance(...pole) >= cfg.clear && roadEdgeDist(...pole, roads) >= cfg.poleRoad
      && corners.every(([x, z]) => clearance(x, z) >= cfg.clear && roadEdgeDist(x, z, roads) >= 0);
    if (ok) return lay;
  }
  // no candidate clears: the sign alone on the pole with the best achieved clearance, not the furthest-fetched one
  return { ...best, shelter: null };
}

export function zigzagLine(route, s, roadW, cfg = STOP) {
  const a = Math.max(0, s - cfg.zigzag.len / 2), b = Math.min(route.len, s + cfg.zigzag.len / 2), off = roadW / 2 - cfg.zigzag.w / 2;
  const out = [];
  for (let q = a; q < b; q += 2) out.push(rightOf(route.pts, route.cum, q, off));
  out.push(rightOf(route.pts, route.cum, b, off));
  return out;
}