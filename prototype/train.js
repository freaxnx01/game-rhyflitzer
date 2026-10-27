// #462: the steam locomotive on the rails -- the track graph, the switches and the ride. Pure (no three.js, no DOM); node --test.
// Frame as the car: x east, z south, metres. A heading th points along (cos th, sin th), so a positive turn (east → south) is RIGHT.
// state st = { edge, s, dir, v, choice, atEnd }: s metres along the edge from pts[0]; dir +1 = the loco faces towards the last point,
// -1 = towards the first; v signed speed along the facing (negative = reversing); choice -1 left / 0 straight / +1 right for the next
// diverging switch; atEnd = standing at a buffer stop (the toast was shown).
export const TRAIN_CFG = { snap: 1.5, accel: 1.0, top: 22.2, coast: 0.05, brake: 1.2, reverseMax: 6.94, endBrakeDist: 210, endGap: 2,
  wheelR: 0.89, chuffsPerRev: 4, idleChuff: 0.6, length: 18.6, width: 3, aheadAngle: Math.PI / 2, look: 5, switchLook: 400 };

export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const motion = (st) => (st.v < 0 ? -1 : 1) * st.dir;

// nodes = polyline ends merged within cfg.snap; edges = the polylines. Degenerate polylines (< 2 distinct points) are skipped, never thrown:
// the world file must not stop the game from loading.
export function buildTrackGraph(polylines, cfg = TRAIN_CFG) {
  const nodes = [], edges = [];
  let skipped = 0;
  const nodeAt = (p) => {
    let n = nodes.find(q => Math.hypot(q.x - p[0], q.z - p[1]) <= cfg.snap);
    if (!n) { n = { id: nodes.length, x: p[0], z: p[1], ends: [] }; nodes.push(n); }
    return n;
  };
  for (const raw of polylines) {
    const pts = [];
    for (const p of Array.isArray(raw) ? raw : []) if (!pts.length || dist2(pts[pts.length - 1], p) > 1e-6) pts.push(p);
    if (pts.length < 2) { skipped++; continue; }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist2(pts[i - 1], pts[i]));
    const a = nodeAt(pts[0]), b = nodeAt(pts[pts.length - 1]), e = { id: edges.length, pts, cum, len: cum[cum.length - 1], a: a.id, b: b.id };
    a.ends.push({ edge: e.id, end: 0 }); b.ends.push({ edge: e.id, end: 1 });
    edges.push(e);
  }
  return { nodes, edges, skipped };
}

// the heading leaving the node into this edge end, measured to the first point cfg.look metres in (ignores a short first segment's kink)
export function outHeading(g, { edge, end }, cfg = TRAIN_CFG) {
  const p = g.edges[edge].pts, n = p.length, from = end === 0 ? p[0] : p[n - 1];
  let to = from;
  for (let i = 1; i < n; i++) { to = end === 0 ? p[i] : p[n - 1 - i]; if (dist2(from, to) >= cfg.look) break; }
  return Math.atan2(to[1] - from[1], to[0] - from[0]);
}

// the edge ends at a node that continue ahead (turn under cfg.aheadAngle) when arriving through `arrived` with heading inHeading
export function branchesAt(g, node, arrived, inHeading, cfg = TRAIN_CFG) {
  return g.nodes[node].ends
    .filter(x => !(arrived && x.edge === arrived.edge && x.end === arrived.end))
    .map(x => ({ ...x, turn: wrap(outHeading(g, x, cfg) - inHeading) }))
    .filter(x => Math.abs(x.turn) < cfg.aheadAngle);
}

// choice 0 or a single branch: the straightest; -1 the leftmost (most negative turn); +1 the rightmost; none: null (buffer stop)
export function pickBranch(branches, choice = 0) {
  if (!branches.length) return null;
  if (branches.length === 1 || !choice) return branches.reduce((m, x) => Math.abs(x.turn) < Math.abs(m.turn) ? x : m);
  return branches.reduce((m, x) => (choice > 0 ? x.turn > m.turn : x.turn < m.turn) ? x : m);
}

// the node the loco is moving towards (by the sign of v, the facing when standing) and the metres to it
export function nodeAhead(g, st) {
  const e = g.edges[st.edge];
  return motion(st) > 0 ? { node: e.b, arrived: { edge: e.id, end: 1 }, dist: e.len - st.s } : { node: e.a, arrived: { edge: e.id, end: 0 }, dist: st.s };
}

// onto a branch at its node end, keeping the direction of motion (and so whether the loco runs forward or in reverse)
export function enter(g, st, b) {
  const sgn = st.v < 0 ? -1 : 1, m = b.end === 0 ? 1 : -1;
  return { ...st, edge: b.edge, s: b.end === 0 ? 0 : g.edges[b.edge].len, dir: m * sgn };
}

export function nearestOnGraph(g, x, z) {
  let best = null;
  for (const e of g.edges) for (let i = 0; i < e.pts.length - 1; i++) {
    const a = e.pts[i], b = e.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (!best || d < best.dist) best = { edge: e.id, s: e.cum[i] + Math.sqrt(L2) * t, dist: d };
  }
  return best;
}

// every way into a diverging switch: a state `back` metres before the node, moving towards it, and which edge each choice takes (tests)
export function divergingApproaches(g, back, cfg = TRAIN_CFG) {
  const out = [];
  for (const e of g.edges) for (const end of [0, 1]) {
    if (e.len <= back) continue;
    const arrived = { edge: e.id, end }, node = end === 1 ? e.b : e.a;
    const br = branchesAt(g, node, arrived, wrap(outHeading(g, arrived, cfg) + Math.PI), cfg);
    if (br.length < 2) continue;
    out.push({ edge: e.id, s: end === 1 ? e.len - back : back, dir: end === 1 ? 1 : -1, node,
      left: pickBranch(br, -1).edge, right: pickBranch(br, 1).edge, straight: pickBranch(br, 0).edge });
  }
  return out;
}
