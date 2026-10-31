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

export const trainInput = (keys) => ({ throttle: keys.KeyW || keys.ArrowUp ? 1 : 0, brake: keys.KeyS || keys.ArrowDown ? 1 : 0 });

// heavy and slow: steam up to top, a long coast, the brake stops and (held at rest) reverses up to reverseMax; throttle while reversing brakes first
export function speedStep(v, input, dt, cfg = TRAIN_CFG) {
  if (input.brake) return v > 0 ? Math.max(0, v - cfg.brake * dt) : Math.max(-cfg.reverseMax, v - cfg.accel * dt);
  if (input.throttle) return v < 0 ? Math.min(0, v + cfg.brake * dt) : Math.min(cfg.top, v + cfg.accel * dt);
  return v > 0 ? Math.max(0, v - cfg.coast * dt) : Math.min(0, v + cfg.coast * dt);
}

// the track ahead in the direction of motion, node by node: the choice at the first diverging switch, straight after it
function* trackAhead(g, st, cfg) {
  let cur = st, choice = st.choice || 0, total = 0;
  for (let guard = 0; guard < 256; guard++) {
    const nx = nodeAhead(g, cur);
    total += nx.dist;
    const br = branchesAt(g, nx.node, nx.arrived, wrap(outHeading(g, nx.arrived, cfg) + Math.PI), cfg);
    yield { node: nx.node, dist: total, branches: br };
    const pick = pickBranch(br, br.length > 1 ? choice : 0);
    if (!pick) return;
    if (br.length > 1) choice = 0;
    cur = enter(g, cur, pick);
  }
}

export function distToEnd(g, st, cfg = TRAIN_CFG) {
  for (const n of trackAhead(g, st, cfg)) {
    if (n.dist > cfg.endBrakeDist + cfg.endGap) return Infinity;
    if (!n.branches.length) return n.dist;
  }
  return Infinity;
}

export function nextSwitch(g, st, cfg = TRAIN_CFG) {
  for (const n of trackAhead(g, st, cfg)) {
    if (n.dist > cfg.switchLook) return null;
    if (n.branches.length > 1) return n;
  }
  return null;
}

// d >= 0 metres along the motion, across nodes (the choice applies at the first diverging switch and resets there)
function advance(g, st, d, cfg) {
  let cur = st;
  for (let guard = 0; guard < 64; guard++) {
    const nx = nodeAhead(g, cur), m = motion(cur);
    if (d <= nx.dist) return { ...cur, s: cur.s + m * d };
    d -= nx.dist;
    const br = branchesAt(g, nx.node, nx.arrived, wrap(outHeading(g, nx.arrived, cfg) + Math.PI), cfg), pick = pickBranch(br, br.length > 1 ? cur.choice : 0);
    if (!pick) return { ...cur, s: m > 0 ? g.edges[cur.edge].len : 0 };
    cur = { ...enter(g, cur, pick), choice: br.length > 1 ? 0 : cur.choice };
  }
  return cur;
}

// one step: speed, then the buffer-stop cap (stop endGap metres before a dead end ahead, one 'trackEnd' event), then the move
export function stepTrain(st, input, g, dt, cfg = TRAIN_CFG) {
  let v = speedStep(st.v, input, dt, cfg);
  const events = [], room = distToEnd(g, { ...st, v }, cfg) - cfg.endGap;
  if (v !== 0 && room !== Infinity) v = Math.sign(v) * Math.min(Math.abs(v), Math.sqrt(2 * cfg.brake * Math.max(0, room)));
  if (v !== 0 && room <= 0.05) {
    if (!st.atEnd) events.push({ type: 'trackEnd' });
    return { state: { ...st, v: 0, atEnd: true }, events };
  }
  const moved = advance(g, { ...st, v }, Math.min(Math.abs(v) * dt, Math.max(0, room)), cfg);
  return { state: { ...moved, atEnd: v === 0 ? st.atEnd : false }, events };
}

export function poseAt(g, st) {
  const e = g.edges[st.edge], s = Math.min(Math.max(st.s, 0), e.len);
  let lo = 0, hi = e.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (e.cum[mid] <= s) lo = mid; else hi = mid; }
  const a = e.pts[lo], b = e.pts[hi], t = (s - e.cum[lo]) / (e.cum[hi] - e.cum[lo]);
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, th: wrap(Math.atan2(b[1] - a[1], b[0] - a[0]) + (st.dir < 0 ? Math.PI : 0)) };
}

// #496: the turntable at the loco's home in Sisseln. At rest within reach of the home spot, the loco turns round on the disc.
export const TURNTABLE = { radius: 11, reach: 3, turnTime: 6 };

export function onTurntable(g, st, home, cfg = TURNTABLE) {
  const a = poseAt(g, st), b = poseAt(g, home);
  return Math.abs(st.v) < 0.05 && Math.hypot(a.x - b.x, a.z - b.z) <= cfg.reach;
}

// 0 → π over turnTime, a smooth start and stop (smoothstep)
export function turnAngle(t, cfg = TURNTABLE) {
  const u = Math.min(1, Math.max(0, t / cfg.turnTime));
  return Math.PI * u * u * (3 - 2 * u);
}

// on the disc centre (the home edge at home.s), at rest, facing opposite to st's heading -- st may stand on a neighbouring edge
export function turnedState(g, st, home) {
  const want = wrap(poseAt(g, st).th + Math.PI), fwd = poseAt(g, { ...home, dir: 1 }).th;
  return { ...st, edge: home.edge, s: home.s, dir: Math.abs(wrap(fwd - want)) < Math.PI / 2 ? 1 : -1, v: 0, choice: 0, atEnd: false };
}

// chuffs (a smoke puff and a steam sound each) per second: chuffsPerRev per driving-wheel turn, an idle trickle at rest
export function chuffEmit(acc, v, dt, cfg = TRAIN_CFG) {
  const rate = Math.max(cfg.idleChuff, Math.abs(v) / (2 * Math.PI * cfg.wheelR) * cfg.chuffsPerRev), total = acc + rate * dt, n = Math.floor(total);
  return { acc: total - n, n };
}

// keydown in the loco: Q/E the next switch, H the whistle, R back to Sisseln, C the camera, A/D turn on the turntable (#496);
// the car's own keys are swallowed
const TRAIN_KEYS = { KeyQ: 'left', KeyE: 'right', KeyH: 'whistle', KeyR: 'reset', KeyC: 'camera', KeyA: 'turnLeft', KeyD: 'turnRight' };
const TRAIN_BLOCKED = new Set(['KeyF', 'KeyX', 'KeyU', 'KeyO', 'KeyI', 'KeyL', 'Digit1', 'KeyV', 'Enter', 'NumpadEnter']);
export function trainKeyAction(code) { return TRAIN_KEYS[code] ?? (TRAIN_BLOCKED.has(code) ? 'block' : 'pass'); }
