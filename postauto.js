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

// ---------- the timetable (#682 MMT1): calls [uic, arr, dep] in seconds after midnight of the service day ----------
export const tripKey = (trip) => `${trip.route}:${trip.calls[0][2]}`;

export function tripCalls(trip, route) {
  const calls = trip.calls.map(([uic, arr, dep]) => ({ uic: String(uic), s: route.stopS.get(String(uic)), arr, dep }));
  return calls.length >= 2 && calls.every((c) => c.s !== undefined) ? calls : null;
}

// when the bus is in the world (A5): 90 s before the first departure (or entering at the map edge) to 60 s after the
// last arrival (or leaving at the map edge)
export function tripWindow(trip, calls, route, cfg = PA) {
  const first = calls[0], last = calls[calls.length - 1];
  return {
    from: trip.fromOutside ? first.arr - first.s / cfg.edgeSpeed : first.dep - cfg.spawnBefore,
    to: trip.toOutside ? last.dep + (route.len - last.s) / cfg.edgeSpeed : last.arr + cfg.layover,
  };
}

// the trip's own clock for wall time `now`: a trip past midnight runs on the service day (> 86400); null outside its window
export function tripTime(win, now) {
  for (const t of [now, now + DAY]) if (t >= win.from && t < win.to) return t;
  return null;
}

// a bus where the timetable says it is at `now` (a trip's window opens, or the clock jumped); null outside the window
export function placeTrip(trip, route, now, cfg = PA) {
  const calls = tripCalls(trip, route);
  if (!calls) return null;
  const win = tripWindow(trip, calls, route, cfg), t = tripTime(win, now);
  if (t === null) return null;
  const n = calls.length, base = { key: tripKey(trip), trip, route, calls, win, shift: t - now, leftAt: -Infinity };
  const stand = (k, until) => ({ ...base, k, phase: 'stand', s: calls[k].s, v: 0, until });
  const drive = (k, s) => ({ ...base, k, phase: 'drive', s, v: busTarget(route, s, k < n ? calls[k].s : null, null, cfg), until: 0 });
  if (t < calls[0].arr) return trip.fromOutside ? drive(0, Math.max(0, calls[0].s - (calls[0].arr - t) * cfg.edgeSpeed)) : stand(0, calls[0].dep);
  for (let k = 0; k < n; k++) {
    const c = calls[k];
    if (t < c.arr) { const p = calls[k - 1]; return drive(k, p.s + (c.s - p.s) * clamp((t - p.dep) / ((c.arr - p.dep) || 1), 0, 1)); }
    if (k < n - 1 && t < c.dep) return stand(k, c.dep);
  }
  const last = calls[n - 1];
  if (!trip.toOutside) return stand(n - 1, last.arr + cfg.layover);
  return t < last.dep ? stand(n - 1, last.dep) : drive(n, Math.min(route.len, last.s + (t - last.dep) * cfg.edgeSpeed));
}

// ---------- driving (kinematic, A1) ----------
// the speed to aim for at s, m/s: route.js's class/bridge/curve speed, 30 km/h at junctions (A4), a stop at the next call,
// and a stop `gap` metres ahead for the player (A7)
export function busTarget(route, s, stopS, gap, cfg = PA) {
  const ahead = (v, q, a) => Math.sqrt(v * v + 2 * a * Math.max(0, q - s));
  let v = Math.min(targetSpeed(route, s), cfg.topKmh / 3.6);
  for (const j of route.joints) {
    if (j.deg < 3 || j.s < s - cfg.junctionAfter) continue;
    if (j.s - cfg.junctionBefore > s + 100) break;
    v = Math.min(v, ahead(cfg.junctionKmh / 3.6, j.s - cfg.junctionBefore, cfg.brake));
  }
  if (stopS !== null) v = Math.min(v, ahead(0, stopS, cfg.brake));
  if (gap !== null) v = Math.min(v, ahead(0, s + gap, cfg.hardBrake));
  return v;
}

function arrive(b, t, cfg) {
  const stop = b.calls[b.k], last = b.k === b.calls.length - 1 && !b.trip.toOutside;
  b.s = stop.s; b.v = 0; b.phase = 'stand';
  b.until = last ? t + cfg.layover : Math.max(stop.dep, t + cfg.minDwell);
}

function standStep(b, t) {
  if (t < b.until) return;
  if (b.k >= b.calls.length - 1 && !b.trip.toOutside) { b.phase = 'done'; return; }
  b.k++; b.phase = 'drive'; b.leftAt = t;
}

function driveStep(b, t, dt, gap, cfg) {
  const stop = b.k < b.calls.length ? b.calls[b.k] : null;
  const target = busTarget(b.route, b.s, stop ? stop.s : null, gap, cfg);
  b.v = Math.max(0, b.v + clamp(target - b.v, -cfg.hardBrake * dt, cfg.accel * dt));
  b.s += b.v * dt;
  if (stop && (b.s >= stop.s || (stop.s - b.s < cfg.arrive && b.v < 1))) arrive(b, t, cfg);
  else if (!stop && b.s >= b.route.len - 2) b.phase = 'done';
}

// one step of a bus at wall time `now`; gap = obstacleGap for the player, or null
export function stepBus(b, now, dt, gap, cfg = PA) {
  const t = now + b.shift;
  if (b.phase === 'stand') standStep(b, t);
  else if (b.phase === 'drive') driveStep(b, t, dt, gap, cfg);
}

// left when pulling out of a stop, right when pulling in (A6), the route's turn and roundabout signals otherwise
export function busBlinker(b, now, cfg = PA) {
  if (b.phase !== 'drive') return null;
  if (now + b.shift - b.leftAt < cfg.pullOutSecs) return 'left';
  const stop = b.calls[b.k];
  if (stop && stop.s - b.s < cfg.pullIn) return 'right';
  return blinkerAt(b.route.signals, b.s);
}

// metres the bus may still drive before the player in its lane ahead (A0b, A7); null when he is not in the way
export function obstacleGap(route, s, player, cfg = PA) {
  const tr = trackRoute(route, player.x, player.z, s), ahead = tr.s - s;
  if (!(ahead > 0) || ahead > cfg.look) return null;
  const [lx, lz] = rightOf(route.pts, route.cum, tr.s, busOffset(route, tr.s, cfg));
  if (Math.hypot(player.x - lx, player.z - lz) > BUS.width / 2 + player.r + cfg.sideClear) return null;
  return Math.max(0, ahead - BUS.length / 2 - player.r - cfg.gap);
}

// ---------- the fleet ----------
// the buses for `now`: running ones kept, finished ones kept (hidden) until their window closes so they are not placed
// again, a new bus for every trip whose window is open; at most cfg.maxBuses running
export function syncFleet(buses, trips, routes, now, cfg = PA) {
  const kept = buses.filter((b) => b.phase !== 'done' || tripTime(b.win, now) !== null), have = new Set(kept.map((b) => b.key));
  let running = kept.filter((b) => b.phase !== 'done').length;
  for (const trip of trips) {
    if (running >= cfg.maxBuses) break;
    const route = routes.get(trip.route);
    if (!route || have.has(tripKey(trip))) continue;
    const b = placeTrip(trip, route, now, cfg);
    if (!b) continue;
    kept.push(b); have.add(b.key); running++;
  }
  return kept;
}

// the wall clock moved by more than the frame (tab hidden, pause, ?patime, midnight): place every bus again
export function fleetJumped(prev, now, dt, cfg = PA) { return Math.abs(now - prev - dt) > cfg.resync; }

// a solid box the player bounces off (A0b); `low` with h: a car on the roof is not pushed (collide() rule)
export function busCollider(x, z, th, y) {
  return { x, z, hw: BUS.length / 2, hd: BUS.width / 2, c: Math.cos(th), s: Math.sin(th), low: true, h: y + BUS.height, postauto: true };
}

export function ledText(trip) { return { line: String(trip.line), dest: trip.to }; }

// busStop(..., faceDeg) turns local -z (the shelter) to world (-sin, -cos): pi - rot puts it right of travel, the board facing the road
export function stopFaceDeg(rot) { return (Math.PI - rot) * 180 / Math.PI; }
