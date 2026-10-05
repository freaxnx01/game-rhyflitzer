// route.js — autopilot (#18): road graph, A* route search and the driving rules that follow a route.
// Pure: no DOM, no three.js, so node --test can import it. World metres, x east, z south; heading th = atan2(dz, dx),
// so a growing th turns right (like the D key).
import { makeGrid, gridAddSegment, gridQuery } from './world.js';

export const NOT_ROUTABLE = new Set(['footway', 'path', 'steps', 'cycleway', 'pedestrian']);
export const isRoutable = (r) => !NOT_ROUTABLE.has(r.cls);
// km/h per OSM class: what the autopilot drives at most, not a traffic rule (there are none)
export const CLASS_KMH = { motorway: 100, trunk: 100, motorway_link: 60, trunk_link: 60, primary: 60, secondary: 60, primary_link: 50, secondary_link: 50, tertiary: 50, tertiary_link: 50, unclassified: 50, residential: 30, service: 30, living_street: 20 };
export const AUTO = {
  snap: 1.5,          // a road end this close to another road's centre line joins it there (T-junctions without a shared node)
  maxStart: 30,       // the car must be this close to the main network to start
  lookMin: 7, lookMax: 25, lookPerMs: 0.6, steerGain: 2.5,
  brakeAccel: 4, latAccel: 3.5, chord: 16, sampleStep: 5,
  defaultKmh: 30, bridgeKmh: 30, bridgeMargin: 20, uturnSpeed: 4,
  arriveDist: 8, offRoute: 20, stuckSecs: 4,
  turnAngle: Math.PI / 6, signalBefore: 50, signalAfter: 10,
};

// a press of any of these hands the car back to the player (touch drive buttons do the same in index.html)
export const TAKE_OVER_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ControlLeft', 'ControlRight', 'KeyN', 'KeyO']);

const keyOf = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function cumulative(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

export function pointAt(pts, cum, s) {
  if (s <= 0) return [pts[0][0], pts[0][1]];
  const n = pts.length - 1;
  if (s >= cum[n]) return [pts[n][0], pts[n][1]];
  let i = 0;
  while (cum[i + 1] < s) i++;
  const u = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
}

function project(a, b, x, z) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const u = L2 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1) : 0;
  const px = a[0] + dx * u, pz = a[1] + dz * u;
  return { u, x: px, z: pz, d: Math.hypot(x - px, z - pz) };
}

// A road end that touches another road's centre line (within AUTO.snap) without a shared node joins it: the other
// road gets the end point as a new vertex, or the end moves onto the other road's vertex. Bridge spans get no joins.
function joinTouchingEnds(rs, snap) {
  const owners = new Map(), grid = makeGrid(32), inserts = rs.map(() => []);
  rs.forEach(({ pts }, ri) => { for (const p of pts) { const k = keyOf(p); if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(ri); } });
  rs.forEach(({ pts }, ri) => { for (let i = 0; i < pts.length - 1; i++) gridAddSegment(grid, ...pts[i], ...pts[i + 1], snap, [ri, i]); });
  rs.forEach(({ pts }, ri) => {
    for (const e of [pts[0], pts[pts.length - 1]]) {
      if (owners.get(keyOf(e)).size > 1) continue;
      let best = null;
      for (const [rj, i] of gridQuery(grid, e[0], e[1], 0)) {
        if (rj === ri) continue;
        const q = project(rs[rj].pts[i], rs[rj].pts[i + 1], e[0], e[1]);
        if (q.d > snap || (rs[rj].r.bridge && q.u > 0 && q.u < 1)) continue;
        if (!best || q.d < best.q.d) best = { rj, i, q };
      }
      if (!best) continue;
      const { rj, i, q } = best, seg = rs[rj].pts;
      if (q.u <= 0 || q.u >= 1) { const v = seg[q.u <= 0 ? i : i + 1]; e[0] = v[0]; e[1] = v[1]; } else { e[0] = q.x; e[1] = q.z; inserts[rj].push({ i, u: q.u, p: [q.x, q.z] }); }
    }
  });
  rs.forEach((o, rj) => { for (const { i, p } of inserts[rj].sort((a, b) => b.i - a.i || b.u - a.u)) o.pts.splice(i + 1, 0, p); });
}

function largestComponent(n, edges, adj) {
  const comp = new Int32Array(n).fill(-1), sizes = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const c = sizes.length, stack = [s]; comp[s] = c; let size = 0;
    while (stack.length) { const u = stack.pop(); size++; for (const e of adj[u]) { const v = edges[e].a === u ? edges[e].b : edges[e].a; if (comp[v] < 0) { comp[v] = c; stack.push(v); } } }
    sizes.push(size);
  }
  const big = sizes.indexOf(Math.max(...sizes, 0)), main = new Uint8Array(n);
  for (let i = 0; i < n; i++) main[i] = comp[i] === big ? 1 : 0;
  return main;
}

// Road graph: nodes where roads end or share a vertex, one edge per stretch between nodes (both directions: the world
// file has no one-way data). `main` flags the largest connected part; only it is used for routes.
export function buildGraph(roads, snap = AUTO.snap) {
  const rs = roads.filter(isRoutable).map((r) => ({ r, pts: r.pts.map((p) => [p[0], p[1]]) }));
  joinTouchingEnds(rs, snap);
  const count = new Map();
  for (const { pts } of rs) for (const k of new Set(pts.map(keyOf))) count.set(k, (count.get(k) || 0) + 1);
  const nodes = [], ids = new Map(), edges = [], adj = [];
  const node = (p) => { const k = keyOf(p); let id = ids.get(k); if (id === undefined) { id = nodes.length; ids.set(k, id); nodes.push({ x: p[0], z: p[1] }); adj.push([]); } return id; };
  for (const { r, pts } of rs) {
    let from = 0;
    for (let i = 1; i < pts.length; i++) {
      if (i < pts.length - 1 && count.get(keyOf(pts[i])) < 2) continue;
      const seg = pts.slice(from, i + 1), a = node(seg[0]), b = node(seg[seg.length - 1]);
      from = i;
      if (a === b) continue;
      const cum = cumulative(seg), id = edges.length;
      edges.push({ a, b, pts: seg, cum, len: cum[cum.length - 1], road: r });
      adj[a].push(id); adj[b].push(id);
    }
  }
  const main = largestComponent(nodes.length, edges, adj), grid = makeGrid(32);
  edges.forEach((e, id) => { if (main[e.a]) for (let i = 0; i < e.pts.length - 1; i++) gridAddSegment(grid, ...e.pts[i], ...e.pts[i + 1], 0, [id, i]); });
  return { nodes, edges, adj, main, grid };
}

// Nearest point on the main network within maxDist: { e (edge id), along (metres from the edge's first point), x, z, d } or null
export function snapToGraph(g, x, z, maxDist = AUTO.maxStart) {
  let best = null;
  for (const [id, i] of gridQuery(g.grid, x, z, maxDist)) {
    const e = g.edges[id], q = project(e.pts[i], e.pts[i + 1], x, z);
    if (q.d <= maxDist && (!best || q.d < best.d)) best = { e: id, along: e.cum[i] + q.u * (e.cum[i + 1] - e.cum[i]), x: q.x, z: q.z, d: q.d };
  }
  return best;
}

function slice(e, from, to) {
  const lo = Math.min(from, to), hi = Math.max(from, to), out = [pointAt(e.pts, e.cum, lo)];
  for (let i = 1; i < e.pts.length - 1; i++) if (e.cum[i] > lo && e.cum[i] < hi) out.push(e.pts[i]);
  out.push(pointAt(e.pts, e.cum, hi));
  return from > to ? out.reverse() : out;
}

function assemble(g, pieces) {
  const pts = [], road = [], joints = [];
  for (const { pts: p, road: r, endNode } of pieces) {
    for (let i = 0; i < p.length; i++) {
      const last = pts[pts.length - 1];
      if (last && Math.hypot(p[i][0] - last[0], p[i][1] - last[1]) < 1e-6) continue;
      if (pts.length) road.push(r);
      pts.push([p[i][0], p[i][1]]);
    }
    if (endNode !== undefined) joints.push({ i: pts.length - 1, deg: g.adj[endNode].length });
  }
  if (pts.length === 1) { pts.push([pts[0][0], pts[0][1]]); road.push(pieces[0].road); }
  const cum = cumulative(pts);
  return { pts, cum, road, len: cum[cum.length - 1], joints: joints.map((j) => ({ s: cum[j.i], deg: j.deg })) };
}

// A* from a snap point to the nearest of several goal snap points. Route: { pts, cum, road (per segment), len, joints: [{ s, deg }] } or null
export function findRoute(g, start, goals) {
  if (!start || !goals.length) return null;
  const se = g.edges[start.e];
  let best = null;
  for (const gl of goals) if (gl.e === start.e) { const c = Math.abs(gl.along - start.along); if (!best || c < best.c) best = { c, gl }; }
  const exit = new Map();   // node -> cheapest { c, gl } from that node to a goal
  for (const gl of goals) { const e = g.edges[gl.e]; for (const [n, c] of [[e.a, gl.along], [e.b, e.len - gl.along]]) if (!exit.has(n) || c < exit.get(n).c) exit.set(n, { c, gl }); }
  const h = (n) => { let m = Infinity; for (const gl of goals) m = Math.min(m, Math.hypot(g.nodes[n].x - gl.x, g.nodes[n].z - gl.z)); return m; };
  const dist = new Map([[se.a, start.along], [se.b, se.len - start.along]]), prev = new Map(), open = [];
  const push = (n, d) => { open.push({ n, d, f: d + h(n) }); };
  push(se.a, start.along); push(se.b, se.len - start.along);
  let done = null;
  while (open.length) {
    let k = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[k].f) k = i;
    const { n, d, f } = open[k]; open[k] = open[open.length - 1]; open.pop();
    if (best && f >= best.c) break;
    if (d > dist.get(n)) continue;
    const x = exit.get(n);
    if (x && (!best || d + x.c < best.c)) { best = { c: d + x.c, gl: x.gl }; done = n; }
    for (const id of g.adj[n]) {
      const e = g.edges[id], v = e.a === n ? e.b : e.a, nd = d + e.len;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, { u: n, id }); push(v, nd); }
    }
  }
  if (!best) return null;
  if (done === null) return assemble(g, [{ pts: slice(se, start.along, best.gl.along), road: se.road }]);
  const chain = [];
  for (let n = done; prev.has(n); n = prev.get(n).u) chain.unshift({ ...prev.get(n), v: n });
  const first = chain.length ? chain[0].u : done, pieces = [];
  pieces.push({ pts: slice(se, start.along, first === se.a ? 0 : se.len), road: se.road, endNode: first });
  for (const { id, u, v } of chain) { const e = g.edges[id]; pieces.push({ pts: e.a === u ? e.pts : [...e.pts].reverse(), road: e.road, endNode: v }); }
  const ge = g.edges[best.gl.e];
  pieces.push({ pts: slice(ge, done === ge.a ? 0 : ge.len, best.gl.along), road: ge.road });
  return assemble(g, pieces);
}

// Signed heading change at s, measured over +-w metres: > 0 turns right
export function turnAt(route, s, w = 10) {
  const a = pointAt(route.pts, route.cum, s - w), b = pointAt(route.pts, route.cum, s), c = pointAt(route.pts, route.cum, s + w);
  const d1 = [b[0] - a[0], b[1] - a[1]], d2 = [c[0] - b[0], c[1] - b[1]];
  return Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
}

// Turn signals: at junctions (3+ roads) where the route turns by AUTO.turnAngle or more
export function routeSignals(route) {
  const out = [];
  for (const j of route.joints) {
    if (j.deg < 3) continue;
    const t = turnAt(route, j.s);
    if (Math.abs(t) >= AUTO.turnAngle) out.push({ s: j.s, side: t > 0 ? 'right' : 'left' });
  }
  return out;
}

export function blinkerAt(signals, s) {
  for (const sg of signals) if (s >= sg.s - AUTO.signalBefore && s <= sg.s + AUTO.signalAfter) return sg.side;
  return null;
}

// Progress along the route near the last known progress (so a route that passes the same place twice is not confused)
export function trackRoute(route, x, z, sPrev) {
  let best = null;
  for (let i = 0; i < route.pts.length - 1; i++) {
    if (route.cum[i + 1] < sPrev - 10 || route.cum[i] > sPrev + 60) continue;
    const q = project(route.pts[i], route.pts[i + 1], x, z);
    if (!best || q.d < best.d) best = { s: route.cum[i] + q.u * (route.cum[i + 1] - route.cum[i]), d: q.d };
  }
  return best || { s: sPrev, d: Infinity };
}

export function steerToward(route, s, x, z, th, speed) {
  const look = clamp(AUTO.lookMin + AUTO.lookPerMs * speed, AUTO.lookMin, AUTO.lookMax);
  const p = pointAt(route.pts, route.cum, s + look), alpha = wrap(Math.atan2(p[1] - z, p[0] - x) - th);
  return { steer: clamp(alpha * AUTO.steerGain, -1, 1), alpha };
}

const segAt = (route, s) => { let i = 0; while (i < route.road.length - 1 && route.cum[i + 1] <= s) i++; return i; };
const roadKmh = (r) => CLASS_KMH[r.cls] ?? AUTO.defaultKmh;

// Speed the autopilot aims for at progress s, m/s: the road class, slower on and near bridges, slower before bends,
// and braking to a stop at the end. Every limit ahead is reached with AUTO.brakeAccel.
export function targetSpeed(route, s) {
  const ahead = (v, q) => Math.sqrt(v * v + 2 * AUTO.brakeAccel * Math.max(0, q - s));
  let v = roadKmh(route.road[segAt(route, s)]) / 3.6;
  const horizon = (v * v) / (2 * AUTO.brakeAccel) + 20;
  for (let i = 0; i < route.road.length; i++) {
    if (route.cum[i] > s + horizon) break;
    if (route.cum[i + 1] < s - AUTO.bridgeMargin) continue;
    const r = route.road[i];
    if (r.bridge) v = Math.min(v, ahead(AUTO.bridgeKmh / 3.6, route.cum[i] - AUTO.bridgeMargin));
    if (route.cum[i] > s) v = Math.min(v, ahead(roadKmh(r) / 3.6, route.cum[i]));
  }
  for (let q = s; q < Math.min(route.len, s + horizon); q += AUTO.sampleStep) {
    const t = Math.abs(turnAt(route, q, AUTO.chord / 2));
    if (t > 0.05) v = Math.min(v, ahead(Math.sqrt((AUTO.latAccel * AUTO.chord) / t), q));
  }
  return Math.min(v, ahead(0, route.len - 2));
}

// One autopilot step. st = { route, s, signals, stuckT }; car = { x, z, th, vf (forward speed), speed }.
// Returns the inputs for stepCar and a status: 'drive', 'arrived', 'off-route' or 'stuck'.
export function autoStep(st, car, dt) {
  const tr = trackRoute(st.route, car.x, car.z, st.s), left = st.route.len - tr.s, idle = { gas: 0, brake: 0, steer: 0, blinker: null };
  st.s = tr.s;
  if (left < 2 || (left < AUTO.arriveDist && Math.abs(car.vf) < 2)) return { status: 'arrived', ...idle };
  if (tr.d > AUTO.offRoute) return { status: 'off-route', ...idle };
  st.stuckT = car.speed < 1 ? (st.stuckT || 0) + dt : 0;
  if (st.stuckT > AUTO.stuckSecs) return { status: 'stuck', ...idle };
  const { steer, alpha } = steerToward(st.route, tr.s, car.x, car.z, car.th, car.speed);
  let v = targetSpeed(st.route, tr.s);
  if (Math.abs(alpha) > Math.PI / 2) v = Math.min(v, AUTO.uturnSpeed);
  return { status: 'drive', gas: car.vf < v - 0.5 ? 1 : 0, brake: car.vf > v + 1.5 && car.vf > 0.5 ? 1 : 0, steer, blinker: blinkerAt(st.signals, tr.s), target: v };
}

// Village sign name -> place name: 'BAD SÄCKINGEN' -> 'Bad Säckingen'
export function placeName(t) { return t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }

// Street destinations: one entry per street name and nearest village, on the main network.
// { n, g (place), x, z, street: true, goals: [snap points, one per stretch of the street] }, sorted west -> east by place, then by name
export function streetEntries(g, villages) {
  const groups = new Map(), order = [...villages].sort((a, b) => a.x - b.x).map((v) => placeName(v.t));
  g.edges.forEach((e, id) => {
    if (!g.main[e.a] || !e.road.n) return;
    const along = e.len / 2, [x, z] = pointAt(e.pts, e.cum, along);
    let near = villages[0], nd = Infinity;
    for (const v of villages) { const d = Math.hypot(v.x - x, v.z - z); if (d < nd) { nd = d; near = v; } }
    const place = placeName(near.t), k = e.road.n + '\n' + place;
    if (!groups.has(k)) groups.set(k, { n: e.road.n, g: place, x, z, street: true, goals: [], longest: 0 });
    const gr = groups.get(k);
    gr.goals.push({ e: id, along, x, z, d: 0 });
    if (e.len > gr.longest) { gr.longest = e.len; gr.x = x; gr.z = z; }
  });
  return [...groups.values()].map(({ longest, ...s }) => s).sort((a, b) => order.indexOf(a.g) - order.indexOf(b.g) || a.n.localeCompare(b.n, 'de'));
}

// Chip names for the destination dialog: every place in the order it first appears in the entries
export function placeChips(entries) { return [...new Set(entries.map((e) => e.g).filter(Boolean))]; }
