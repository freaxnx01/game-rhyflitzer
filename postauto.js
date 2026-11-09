// postauto.js (#500): Postautos drive their line by the weekday timetable. Pure: no DOM, no three.js, node --test only.
// World metres, x east, z south; heading th = atan2(dz, dx) like route.js. A bus is kinematic: progress s along its route,
// drawn on the lane line; it is never pushed (spec A0b, A1).
import { makeGrid, gridAddSegment, gridQuery } from './world.js';
import { cumulative, pointAt, isRoutable, routeSignals, blinkerAt, trackRoute, targetSpeed, routeLaneOffset } from './route.js';
import { BUS } from './bus.js';

export const PA = {
  topKmh: 60, junctionKmh: 30, junctionBefore: 10, junctionAfter: 5,   // A4
  accel: 1.2, brake: 2, hardBrake: 5, arrive: 0.5,
  minDwell: 10, spawnBefore: 90, layover: 60, edgeSpeed: 12, turnMax: 900,   // A5, #763 A4
  pullIn: 25, pullOut: 15, kerbGap: 0.3, pullOutSecs: 4,                 // A6
  look: 40, sideClear: 0.5, gap: 2, above: 3,                            // A7
  maxBuses: 8, resync: 5, reach: 2,
  smoothHalf: 10, smoothStopFree: 8, smoothStopFull: 20,               // #710
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
  route.drive = driveLine(pts, cum, route.stops.map((st) => st.s), cfg);
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

// ---------- the driving line (#710): the centre line with its corners rounded, so a 12 m bus swings through bends ----------
// one point per metre of original arc length s: the mean of the polyline over s +- smoothHalf (a box filter: a 90 degree
// corner becomes a bend of about smoothHalf metres radius, clusters of short legs included). Stops and the route ends keep
// the original line: the weight rises from 0 at smoothStopFree to 1 at smoothStopFull metres of s away.
function resampled(pts, cum) {
  const len = cum[cum.length - 1], out = [];
  let i = 0;
  for (let k = 0; k <= Math.floor(len) + 1; k++) {
    const s = Math.min(k, len);
    while (i < pts.length - 2 && cum[i + 1] < s) i++;
    const u = clamp((s - cum[i]) / ((cum[i + 1] - cum[i]) || 1), 0, 1);
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]);
  }
  return out;
}

export function driveLine(pts, cum, stopS, cfg = PA) {
  const base = resampled(pts, cum), last = base.length - 1, len = cum[cum.length - 1], half = Math.round(cfg.smoothHalf);
  const span = cfg.smoothStopFull - cfg.smoothStopFree;
  const out = base.map((o, k) => {
    const near = Math.min(k, len - k, ...stopS.map((q) => Math.abs(q - k))), w = smooth(clamp((near - cfg.smoothStopFree) / span, 0, 1));
    if (w === 0) return o;
    let ax = 0, az = 0;
    for (let q = -half; q <= half; q++) { const p = base[clamp(k + q, 0, last)]; ax += p[0]; az += p[1]; }
    const n = 2 * half + 1;
    return [o[0] + w * (ax / n - o[0]), o[1] + w * (az / n - o[1])];
  });
  return { pts: out };
}

export function drivePoint(drive, s) {
  const f = clamp(s, 0, drive.pts.length - 1), i = Math.min(Math.floor(f), drive.pts.length - 2), u = f - i, a = drive.pts[i], b = drive.pts[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

// the lane point the bus is drawn on: busOffset metres right of the driving line's direction of travel
export function lanePoint(route, s, cfg = PA) {
  const p = drivePoint(route.drive, s), off = busOffset(route, s, cfg);
  if (!off) return p;
  const a = drivePoint(route.drive, s - 1), b = drivePoint(route.drive, s + 1), dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  return len ? [p[0] - (dz / len) * off, p[1] + (dx / len) * off] : p;
}

export function busPose(route, s, cfg = PA) {
  const [x, z] = lanePoint(route, s, cfg), a = lanePoint(route, s - 3, cfg), b = lanePoint(route, s + 3, cfg);
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

// ---------- the Umlauf (#763): the bus that arrives at a terminus runs the line's next trip from there ----------
const firstDep = (t) => t.calls[0][2], lastArr = (t) => t.calls[t.calls.length - 1][1];

// for each trip that ends at a terminus (!toOutside), the same line's next trip from that stop within cfg.turnMax,
// earliest departure first, one predecessor per trip (A5)
export function linkTrips(trips, cfg = PA) {
  const next = new Map(), taken = new Set();
  for (const a of [...trips].sort((x, y) => lastArr(x) - lastArr(y))) {
    if (a.toOutside) continue;
    const uic = String(a.calls[a.calls.length - 1][0]);
    const b = trips.filter((t) => t !== a && !taken.has(tripKey(t)) && !t.fromOutside && t.line === a.line
      && String(t.calls[0][0]) === uic && firstDep(t) >= lastArr(a) && firstDep(t) - lastArr(a) <= cfg.turnMax)
      .sort((x, y) => firstDep(x) - firstDep(y))[0];
    if (!b) continue;
    next.set(tripKey(a), b); taken.add(tripKey(b));
  }
  return next;
}

const fleetRunsCache = new WeakMap();

// the runs a fleet drives: a run is the chain of same-line trips one bus drives (A1, A6), with contiguous windows
// split at the timetable arrival; unlinked trips are a run of one leg (A11). Memoised per `trips` array (#726: syncFleet
// runs every second), recomputed when `routes` or `cfg` differ. `routes`/`cfg` are compared by reference, not content:
// safe only because index.html's one call site always passes the same, already-fully-populated Map/PA object on every
// call -- a call site that mutates `routes` or `cfg` after a prior call with the same `trips` array would get stale runs.
export function fleetRuns(trips, routes, cfg = PA) {
  const cached = fleetRunsCache.get(trips);
  if (cached && cached.routes === routes && cached.cfg === cfg) return cached.runs;

  const valid = trips.filter((t) => routes.has(t.route) && tripCalls(t, routes.get(t.route)));
  const links = linkTrips(valid, cfg), hasPrev = new Set(links.values());
  const runs = [];
  for (const first of valid) {
    if (hasPrev.has(first)) continue;
    const chain = [first];
    for (let next = links.get(tripKey(first)); next; next = links.get(tripKey(next))) chain.push(next);
    const legs = chain.map((trip) => { const route = routes.get(trip.route), calls = tripCalls(trip, route); return { trip, route, calls, win: tripWindow(trip, calls, route, cfg) }; });
    for (let i = 1; i < legs.length; i++) legs[i].win = { ...legs[i].win, from: lastArr(legs[i - 1].trip) };
    for (let i = 0; i < legs.length - 1; i++) legs[i].win = { ...legs[i].win, to: lastArr(legs[i].trip) };
    runs.push({ key: tripKey(chain[0]), legs, win: { from: legs[0].win.from, to: legs[legs.length - 1].win.to } });
  }
  fleetRunsCache.set(trips, { routes, cfg, runs });
  return runs;
}

// the trip's own clock for wall time `now`: a trip past midnight runs on the service day (> 86400), one spawning before a
// just-after-midnight departure opens the evening before (< 0); null outside its window
export function tripTime(win, now) {
  for (const t of [now - DAY, now, now + DAY]) if (t >= win.from && t < win.to) return t;
  return null;
}

// a bus where the timetable says it is at `now` (a trip's window opens, or the clock jumped); null outside the window.
// `win` overrides the trip's own window (#763): a leg inside a run uses the run's contiguous window instead.
export function placeTrip(trip, route, now, cfg = PA, win = null) {
  const calls = tripCalls(trip, route);
  if (!calls) return null;
  win = win ?? tripWindow(trip, calls, route, cfg);
  const t = tripTime(win, now);
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

// the placement of a run (#763) at wall time `now`: the first leg whose window holds it, carrying the run's key and
// window so the bus is one continuous entity across a turn; null outside every leg's window
export function placeRun(run, now, cfg = PA) {
  for (let i = 0; i < run.legs.length; i++) {
    const leg = run.legs[i], b = placeTrip(leg.trip, leg.route, now, cfg, leg.win);
    if (b) return { ...b, key: run.key, legs: run.legs, leg: i, win: run.win };
  }
  return null;
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

// true while a run's bus still has a later leg to turn into (#763)
function hasNext(b) { return !!b.legs && b.leg < b.legs.length - 1; }

// the Umlauf: the bus turns while standing -- the next leg's trip, route and calls, re-posed at its first stop (A7)
function turn(b, t, cfg) {
  const next = b.legs[++b.leg];
  Object.assign(b, { trip: next.trip, route: next.route, calls: next.calls, k: 0, s: next.calls[0].s, v: 0, phase: 'stand',
    until: Math.max(next.calls[0].dep, t + cfg.minDwell), leftAt: -Infinity });
}

function arrive(b, t, cfg) {
  const stop = b.calls[b.k], last = b.k === b.calls.length - 1 && !b.trip.toOutside;
  if (last && hasNext(b)) { turn(b, t, cfg); return; }
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
  const [lx, lz] = lanePoint(route, tr.s, cfg);
  if (Math.hypot(player.x - lx, player.z - lz) > BUS.width / 2 + player.r + cfg.sideClear) return null;
  return Math.max(0, ahead - BUS.length / 2 - player.r - cfg.gap);
}

// ---------- the fleet ----------
// the buses for `now`: running ones kept, finished ones kept (hidden) until their run's window closes so they are not
// placed again, a new bus for every run whose window is open; at most cfg.maxBuses running. A run (#763) is the chain
// of same-line trips one bus drives: the key and window are the run's, so a bus that turns at a terminus is one entity.
export function syncFleet(buses, trips, routes, now, cfg = PA) {
  const kept = buses.filter((b) => b.phase !== 'done' || tripTime(b.win, now) !== null), have = new Set(kept.map((b) => b.key));
  let running = kept.filter((b) => b.phase !== 'done').length;
  for (const run of fleetRuns(trips, routes, cfg)) {
    if (running >= cfg.maxBuses) break;
    if (have.has(run.key)) continue;
    const b = placeRun(run, now, cfg);
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
