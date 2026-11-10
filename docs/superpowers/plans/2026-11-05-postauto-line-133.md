# Postauto line 133 by the timetable Implementation Plan (#500)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` syntax.

**Goal:** Postautos drive line 133 through the world by the weekday timetable (Europe/Zurich clock), stop at the stops, slow down at junctions, signal, wait for the player, are solid, and show line and destination on the LED.

**Architecture:** A new pure module `postauto.js` (clock, route building, schedule placement, kinematic driving, fleet sync, collider, LED text) on top of `route.js` (`targetSpeed`, `routeSignals`, `blinkerAt`, `trackRoute`, and #678's `rightOf`/`routeLaneOffset`). `index.html` loads `data/timetable_hochrhein.json` in the background, clones `assets/bus.glb` per bus, steps the fleet in the frame loop, and adds the buses to `collide()`/`collideFoot()`.

**Tech Stack:** Vanilla ES modules, three.js (already loaded), `node --test`, Playwright (one targeted file).

**Spec:** `docs/superpowers/specs/2026-11-05-postauto-line-133-design.md`.

## Dependency

**Lands after #682, #678 and #680** (and therefore after #679).

Before Task 1, check on `main`:

1. `route.js` exports `rightOf(pts, cum, s, off)` and `routeLaneOffset(route, s)` (#678). If the names or signatures differ, use the merged ones in `postauto.js` only.
2. `routeSignals` returns `side: 'right'` for roundabout exits (#680).
3. `data/world_hochrhein.json` has `busRoutes` and `data/timetable_hochrhein.json` exists with `format: "MMT1"` (#682). Read `docs/11-pipeline-osm.md` for the merged field names; if they differ from `busRoutes[].{id,line,pts,stops[].{uic,name,s,x,z,rot}}` and `trips[].{line,route,to,fromOutside,toOutside,calls}`, adapt `postauto.js` and the fixtures, not the design.

If any of the three is not merged, stop and report which one; do not invent the fields or helpers.

## Global Constraints

- Buildless, no new dependency, no new asset. Files: `postauto.js` (new), `tests/postauto.test.mjs` (new), `tests/test_postauto.py` (new), `regions.js`, `world.js` (`layoutFromWorld` only), `about.js`, `strings.js`, `index.html`, `tests/regions.test.mjs`, `tests/world.test.mjs`, `tests/about.test.mjs`, `CHANGELOG.md`.
- TDD: the failing test first; never change an existing assertion to make it green (the `ABOUT_LINKS` key set in Task 7 is extended because the spec adds a link).
- `route.js` stays unchanged. `bus.js` stays unchanged.
- Pure modules have no DOM and no three.js.
- Unit tests: `node --test tests/<file>.test.mjs`. Browser: only `tests/test_postauto.py`, in the foreground; commit and push before running it. Not the full Playwright suite.
- Logging: say what is about to happen, then what happened (timetable load, model load).

## File Structure

| File | Responsibility |
|---|---|
| `postauto.js` | `PA` config; `zurichSeconds`, `parsePatime`; `busRoute`; `busOffset`, `busPose`; `tripCalls`, `tripWindow`, `tripTime`, `tripKey`, `placeTrip`; `busTarget`, `stepBus`, `busBlinker`, `obstacleGap`; `syncFleet`, `fleetJumped`; `busCollider`, `ledText`, `stopFaceDeg` |
| `index.html` | timetable fetch, Postauto meshes (glTF clone, LED, blinkers), stop signs, `stepPostauto`, collisions, `window.__mm.postauto` |
| `regions.js` | `REGIONS.hochrhein.timetable` |
| `world.js` | `layoutFromWorld` passes `busRoutes` |
| `about.js`, `strings.js` | link `otd`, string `aboutTimetable` (en/de) |

## Task 1: Region timetable path and `busRoutes` passthrough

**Files:** Modify `regions.js`, `world.js:117-120`; Test `tests/regions.test.mjs`, `tests/world.test.mjs`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/regions.test.mjs`:

```js
test('REGIONS: only Hochrhein has a Postauto timetable (#500)', () => {
  assert.equal(REGIONS.hochrhein.timetable, './data/timetable_hochrhein.json');
  assert.equal(REGIONS.ehrendingen.timetable, undefined);
});
```

Append to `tests/world.test.mjs`:

```js
test('layoutFromWorld passes busRoutes, empty without them (#500)', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], anchors: {}, bbox: [0, 0, 1, 1] };
  const br = [{ id: 7, line: '133', pts: [[0, 0], [1, 0]], stops: [] }];
  assert.deepEqual(layoutFromWorld({ ...base, busRoutes: br }).busRoutes, br);
  assert.deepEqual(layoutFromWorld(base).busRoutes, []);
});
```

- [ ] **Step 2: Run** `node --test tests/regions.test.mjs tests/world.test.mjs`; both new tests fail.
- [ ] **Step 3: Implement.** In `regions.js`, `REGIONS.hochrhein`, after the `backdrop` line:

```js
    timetable: './data/timetable_hochrhein.json',   // #500: Postauto weekday timetable (#682, opentransportdata.swiss)
```

In `world.js` `layoutFromWorld`, add `busRoutes: w.busRoutes || [],` to the returned object (after `fields`).

- [ ] **Step 4: Run** the two test files; all pass.
- [ ] **Step 5: Commit** `feat(postauto): region timetable path and busRoutes in the layout (#500)`.

## Task 2: Clock and bus route (`postauto.js`)

**Files:** Create `postauto.js`, `tests/postauto.test.mjs`.

- [ ] **Step 1: Write the failing test.** Create `tests/postauto.test.mjs`:

```js
// #500: Postautos drive line 133 by the weekday timetable. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../route.js';
import { BUS } from '../bus.js';
import { PA, zurichSeconds, parsePatime, busRoute, busOffset, busPose, tripCalls, tripWindow, tripTime, tripKey, placeTrip,
  busTarget, stepBus, busBlinker, obstacleGap, syncFleet, fleetJumped, busCollider, ledText, stopFaceDeg } from '../postauto.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const road = (pts, cls = 'primary', extra = {}) => ({ n: '', cls, w: 6, bridge: false, pts, ...extra });
// a primary road east along z = 0 with a residential cross road at x = 500 (shared vertex: a 4-way junction)
const MAIN = road([[0, 0], [500, 0], [1000, 0]]), CROSS = road([[500, -100], [500, 0], [500, 100]], 'residential');
const ROADS = [MAIN, CROSS], G = buildGraph(ROADS);
const stop = (uic, s) => ({ uic, name: 'S' + uic, s, x: s, z: 3.5, rot: 0 });   // at the kerb right of eastward travel: w/2 + 0.5
const BR = { id: 1, line: '133', pts: [[0, 0], [500, 0], [1000, 0]], stops: [stop('1', 100), stop('2', 400), stop('3', 900)] };
const R = busRoute(BR, ROADS, G);
const TRIP = { line: '133', route: 1, to: 'Ende, Bahnhof', fromOutside: false, toOutside: false,
  calls: [['1', 36000, 36000], ['2', 36100, 36120], ['3', 36200, 36200]] };

test('zurichSeconds: Europe/Zurich local time, winter and summer', () => {
  assert.equal(zurichSeconds(new Date('2026-01-15T06:30:00Z')), 7.5 * 3600);    // CET, UTC+1
  assert.equal(zurichSeconds(new Date('2026-07-15T06:30:00Z')), 8.5 * 3600);    // CEST, UTC+2
  assert.equal(zurichSeconds(new Date('2026-07-15T22:15:30Z')), 15 * 60 + 30); // past midnight in Zurich
});

test('parsePatime: HH:MM to seconds, anything else null', () => {
  assert.equal(parsePatime('07:30'), 27000);
  assert.equal(parsePatime('00:00'), 0);
  for (const bad of ['7:30', '24:00', '12:60', '', null, 'x']) assert.equal(parsePatime(bad), null, String(bad));
});

test('busRoute: road per segment, junction joints, stops with kerb distance', () => {
  assert.equal(R.len, 1000);
  assert.deepEqual(R.road, [MAIN, MAIN]);
  assert.deepEqual(R.joints, [{ s: 500, deg: 4 }]);
  assert.deepEqual(R.signals, []);   // straight through
  assert.ok(R.stops.every((st) => near(st.kerb, 3.5)));
  assert.equal(R.stopS.get('2'), 400);
});

test('busRoute: a turn onto the cross road is on the cross road and signals right', () => {
  const turn = busRoute({ id: 2, line: '133', pts: [[0, 0], [500, 0], [500, 100]], stops: [] }, ROADS, G);
  assert.deepEqual(turn.road, [MAIN, CROSS]);
  assert.equal(turn.signals.length, 1);
  assert.equal(turn.signals[0].side, 'right');   // east, then south: th grows
});

test('busOffset: the lane away from stops, out to the kerb at a stop, blended', () => {
  const kerb = 3.5 - BUS.width / 2 - PA.kerbGap;
  assert.ok(near(busOffset(R, 250), 1.5));
  assert.ok(near(busOffset(R, 400), kerb));
  const mid = busOffset(R, 400 - PA.pullIn / 2);
  assert.ok(mid > 1.5 && mid < kerb);
  assert.ok(near(busOffset(R, 400 + PA.pullOut + 1), 1.5));
});

test('busPose: on the right of travel, heading along the route', () => {
  const p = busPose(R, 250);
  assert.ok(near(p.x, 250) && near(p.z, 1.5) && near(p.th, 0));
});
```

- [ ] **Step 2: Run** `node --test tests/postauto.test.mjs`; it fails (no module).
- [ ] **Step 3: Implement** `postauto.js` (the rest of the import list is filled in by Tasks 3 to 5):

```js
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
```

- [ ] **Step 4: Run** `node --test tests/postauto.test.mjs`; the Task 2 tests pass (the import of not-yet-written names fails the whole file: write the Task 2 tests first with only the Task 2 names in the import, extend the import in Tasks 3 to 5).
- [ ] **Step 5: Commit** `feat(postauto): Zurich clock and bus routes on the road network (#500)`.

## Task 3: Placing a trip from the timetable

**Files:** Modify `postauto.js`, `tests/postauto.test.mjs`.

- [ ] **Step 1: Write the failing test.**

```js
test('placeTrip: outside the window null, standing at stops, driving between them by time', () => {
  assert.equal(placeTrip(TRIP, R, 35000), null);
  assert.equal(placeTrip(TRIP, R, 36300), null);
  let b = placeTrip(TRIP, R, 35950);
  assert.equal(b.phase, 'stand'); assert.equal(b.k, 0); assert.equal(b.s, 100); assert.equal(b.until, 36000);
  b = placeTrip(TRIP, R, 36050);
  assert.equal(b.phase, 'drive'); assert.equal(b.k, 1); assert.ok(near(b.s, 250));
  b = placeTrip(TRIP, R, 36110);
  assert.equal(b.phase, 'stand'); assert.equal(b.k, 1); assert.equal(b.until, 36120);
  b = placeTrip(TRIP, R, 36230);
  assert.equal(b.phase, 'stand'); assert.equal(b.k, 2); assert.equal(b.until, 36200 + PA.layover);
  assert.equal(b.key, tripKey(TRIP));
});

test('placeTrip: a trip past midnight runs on the service-day clock', () => {
  const late = { ...TRIP, calls: [['1', 86380, 86380], ['2', 86450, 86460], ['3', 86500, 86500]] };
  const b = placeTrip(late, R, 70);   // 00:01:10 = 86470 on the service day
  assert.equal(b.phase, 'drive'); assert.equal(b.k, 2); assert.equal(b.shift, DAY_SECS);
  assert.ok(near(b.s, 400 + 500 * 10 / 40));
});

test('placeTrip: fromOutside enters at the route start, toOutside leaves at the end', () => {
  const inbound = { ...TRIP, fromOutside: true };
  assert.ok(near(tripWindow(inbound, tripCalls(inbound, R), R).from, 36000 - 100 / PA.edgeSpeed));
  const b = placeTrip(inbound, R, 35995);
  assert.equal(b.phase, 'drive'); assert.equal(b.k, 0); assert.ok(near(b.s, 100 - 5 * PA.edgeSpeed));
  const outbound = { ...TRIP, toOutside: true, calls: [['1', 36000, 36000], ['2', 36100, 36120], ['3', 36200, 36210]] };
  const o = placeTrip(outbound, R, 36215);
  assert.equal(o.phase, 'drive'); assert.equal(o.k, 3); assert.ok(near(o.s, 900 + 5 * PA.edgeSpeed));
});

test('tripCalls: a call at a stop not on the route drops the trip', () => {
  assert.equal(tripCalls({ ...TRIP, calls: [['1', 1, 1], ['99', 2, 2]] }, R), null);
  assert.equal(tripTime({ from: 10, to: 20 }, 15), 15);
  assert.equal(tripTime({ from: 86390, to: 86500 }, 50), 86450);
  assert.equal(tripTime({ from: 10, to: 20 }, 25), null);
});
```

Add `const DAY_SECS = 86400;` near the fixtures.

- [ ] **Step 2: Run**; the new tests fail.
- [ ] **Step 3: Implement** (append to `postauto.js`):

```js
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
```

`busTarget` is written in Task 4; until then define it as in Task 4 Step 3 (write it now, its own test comes next).

- [ ] **Step 4: Run**; all `postauto` tests pass.
- [ ] **Step 5: Commit** `feat(postauto): place a bus on its trip from the timetable (#500)`.

## Task 4: Driving, stopping, signalling, waiting for the player

**Files:** Modify `postauto.js`, `tests/postauto.test.mjs`.

- [ ] **Step 1: Write the failing test.**

```js
// runs a bus from wall time t0 for secs at 20 Hz; player(t) gives { x, z, r } or null; returns the samples
function run(b, t0, secs, player = () => null, dt = 0.05) {
  const out = [];
  for (let t = t0; t < t0 + secs; t += dt) {
    const p = player(t), gap = p && b.phase === 'drive' ? obstacleGap(b.route, b.s, p) : null;
    stepBus(b, t, dt, gap);
    out.push({ t, s: b.s, v: b.v, phase: b.phase, k: b.k, blinker: busBlinker(b, t) });
  }
  return out;
}

test('stepBus: leaves on time, stops at the next stop, stands until the departure time', () => {
  const b = placeTrip(TRIP, R, 35950), log = run(b, 35950, 180);
  const left = log.find((x) => x.phase === 'drive');
  assert.ok(left.t >= 36000 && left.t < 36000.1);
  const at = log.find((x) => x.t >= 36100);
  assert.equal(at.phase, 'stand'); assert.equal(at.k, 1); assert.equal(at.s, 400);
  const again = log.find((x) => x.k === 2 && x.phase === 'drive');
  assert.ok(again.t >= 36120);
});

test('stepBus: a late bus stands the minimum dwell only', () => {
  const late = { ...TRIP, calls: [['1', 36000, 36000], ['2', 36005, 36005], ['3', 36200, 36200]] };
  const log = run(placeTrip(late, R, 35999), 35999, 120);
  const arrive = log.find((x) => x.k === 1 && x.phase === 'stand'), leave = log.find((x) => x.k === 2);
  assert.ok(near(leave.t - arrive.t, PA.minDwell, 0.11));
});

test('stepBus: 30 km/h through the junction, blinkers at the stop, gone after the layover', () => {
  const log = run(placeTrip(TRIP, R, 36115), 36115, 160);
  const junction = log.filter((x) => x.s > 500 - PA.junctionBefore && x.s < 500 + PA.junctionAfter);
  assert.ok(junction.length && junction.every((x) => x.v <= PA.junctionKmh / 3.6 + 0.15));   // + one 20 Hz step of braking lag
  assert.ok(log.some((x) => x.s > 600 && x.s < 850 && x.v > PA.junctionKmh / 3.6 + 1));   // primary: faster again after it
  assert.equal(log.find((x) => x.phase === 'drive').blinker, 'left');                     // pulling out of stop 2
  assert.equal(log.find((x) => x.phase === 'drive' && x.s > 900 - PA.pullIn + 1).blinker, 'right');
  const end = log.find((x) => x.k === 2 && x.phase === 'stand');
  assert.equal(log.find((x) => x.phase === 'done')?.t >= end.t + PA.layover - 0.1, true);
});

test('obstacleGap: the player in the lane ahead, not beside, behind or far ahead', () => {
  const p = (x, z) => ({ x, z, r: 1 });
  assert.ok(near(obstacleGap(R, 270, p(300, 1.5)), 30 - BUS.length / 2 - 1 - PA.gap));
  assert.equal(obstacleGap(R, 270, p(300, -3)), null);
  assert.equal(obstacleGap(R, 270, p(200, 1.5)), null);
  assert.equal(obstacleGap(R, 270, p(270 + PA.look + 5, 1.5)), null);
});

test('stepBus: waits for a player in the lane and drives on when he leaves', () => {
  const b = placeTrip(TRIP, R, 36050);   // driving to stop 2 (s 400) from s 250
  const blocked = run(b, 36050, 20, () => ({ x: 330, z: 1.5, r: 1 }));
  const last = blocked[blocked.length - 1];
  assert.equal(last.v, 0);
  assert.ok(last.s <= 330 - BUS.length / 2 - 1 - PA.gap + 0.5 && last.s > 300);
  const free = run(b, 36070, 60);
  assert.ok(free.some((x) => x.k === 1 && x.phase === 'stand' && x.s === 400));
});
```

- [ ] **Step 2: Run**; the new tests fail.
- [ ] **Step 3: Implement** (append):

```js
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
```

- [ ] **Step 4: Run**; all pass. If a timing assertion fails, check the cause before touching numbers in `PA` (the spec's numbers are tuning, but a failing test is not a reason to retune). Stop after 3 attempts and report.
- [ ] **Step 5: Commit** `feat(postauto): buses drive, stop, signal and wait for the player (#500)`.

## Task 5: Fleet, collider, LED text, stop facing

**Files:** Modify `postauto.js`, `tests/postauto.test.mjs`.

- [ ] **Step 1: Write the failing test.**

```js
const ROUTES = new Map([[1, R]]);

test('syncFleet: starts buses for open windows, keeps finished ones until the window closes, caps the count', () => {
  assert.equal(syncFleet([], [TRIP], ROUTES, 35000).length, 0);
  const fleet = syncFleet([], [TRIP], ROUTES, 35950);
  assert.equal(fleet.length, 1);
  assert.equal(syncFleet(fleet, [TRIP], ROUTES, 35951).length, 1);   // no second bus for the same trip
  fleet[0].phase = 'done';
  const kept = syncFleet(fleet, [TRIP], ROUTES, 36250);
  assert.equal(kept.length, 1); assert.equal(kept[0].phase, 'done');   // not placed again
  assert.equal(syncFleet(kept, [TRIP], ROUTES, 36300).length, 0);
  assert.equal(syncFleet([], [TRIP], ROUTES, 35950, { ...PA, maxBuses: 0 }).length, 0);
  assert.equal(syncFleet([], [{ ...TRIP, route: 99 }], ROUTES, 35950).length, 0);   // unknown route
});

test('fleetJumped: more than PA.resync beyond the frame time', () => {
  assert.equal(fleetJumped(100, 100.05, 0.05), false);
  assert.equal(fleetJumped(100, 130, 0.05), true);
  assert.equal(fleetJumped(86399, 1, 0.05), true);   // midnight: placed again, harmless
});

test('busCollider, ledText, stopFaceDeg', () => {
  const o = busCollider(10, 20, Math.PI / 2, 5);
  assert.equal(o.hw, BUS.length / 2); assert.equal(o.hd, BUS.width / 2);
  assert.ok(near(o.c, 0) && near(o.s, 1)); assert.equal(o.h, 5 + BUS.height); assert.equal(o.low, true);
  assert.deepEqual(ledText(TRIP), { line: '133', dest: 'Ende, Bahnhof' });
  assert.ok(near(stopFaceDeg(0), 180));          // travel east: local -z (shelter) points south, right of travel
  assert.ok(near(stopFaceDeg(Math.PI / 2), 90));  // travel south: shelter to the west
});
```

- [ ] **Step 2: Run**; the new tests fail.
- [ ] **Step 3: Implement** (append):

```js
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
```

- [ ] **Step 4: Run** `node --test tests/postauto.test.mjs tests/route.test.mjs`; all pass.
- [ ] **Step 5: Commit** `feat(postauto): fleet sync, collider and LED text (#500)`.

## Task 6: The Postautos in the game (`index.html`)

**Files:** Modify `index.html`.

Read first: `loadVehicleModel` and `GLTF_CARS` (`index.html:2823-2860`), `textTex`/`makeTex` (`:923`), `busStop` (`:1958`), `autoGraph`/`ROADS` (`:3698`), `collide` (`:4401`), `collideFoot` (`:3904`), the loop (`:5222`), `applyLamps` flash (`:5143`), `groundH` (`:1272`), `LEVELS.isSurface()`. Line numbers are from the enrichment commit; find the code by name.

- [ ] **Step 1: Import.** Next to the `route.js` import:

```js
import { PA, zurichSeconds, parsePatime, busRoute, busPose, syncFleet, fleetJumped, stepBus, busBlinker, obstacleGap, busCollider, ledText, stopFaceDeg } from './postauto.js';   // #500
```

- [ ] **Step 2: State, clock and timetable load.** After the autopilot block (`autoGraph`):

```js
// #500: Postautos on line 133 by the weekday timetable (postauto.js). Loaded in the background after the world, never blocks it.
const POSTAUTO = { ready: false, routes: new Map(), trips: [], buses: [], meshes: new Map(), colliders: [], group: new THREE.Group(), prev: null, syncT: 0, loading: false };
scene.add(POSTAUTO.group);
const PATIME = parsePatime(new URLSearchParams(location.search).get('patime')), PATIME_T0 = performance.now();
function postautoClock() { return PATIME === null ? zurichSeconds(new Date()) : (PATIME + (performance.now() - PATIME_T0) / 1000) % 86400; }
async function loadPostauto() {
  if (!L || !REGION.timetable || !L.busRoutes.length) return;
  console.info('Loading the Postauto timetable from', REGION.timetable);
  const tt = await fetch(REGION.timetable).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!tt || tt.format !== 'MMT1') { console.warn('No Postauto timetable: file missing or not MMT1'); return; }
  const g = autoGraph();
  for (const br of L.busRoutes) POSTAUTO.routes.set(br.id, busRoute(br, ROADS, g));
  POSTAUTO.trips = tt.trips.filter((t) => POSTAUTO.routes.has(t.route));
  POSTAUTO.ready = true;
  console.info(`Postauto timetable loaded: ${POSTAUTO.trips.length} trips on ${POSTAUTO.routes.size} routes (feed ${tt.feed?.version})`);
}
```

Call `loadPostauto()` (not awaited) where the world has finished building and `ROADS` is final (after the loading screen's last stage). Build the stop signs there too:

```js
for (const br of L?.busRoutes ?? []) for (const st of br.stops) busStop(st.x, st.z, st.name, stopFaceDeg(st.rot));   // #500, A10
```

- [ ] **Step 3: Mesh per bus.** A Postauto mesh is built once its model is ready and only touches its own group:

```js
// #500: one Postauto: a clone of bus.glb (shared geometry and materials), an LED with line and destination, own blinkers
function ledTexture({ line, dest }) {
  return makeTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#0d0d0d'; g.fillRect(0, 0, w, h); g.fillStyle = g.strokeStyle = '#ff9a1a'; g.lineWidth = 6;
    g.strokeRect(8, 12, 170, h - 24); g.font = '700 84px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(line, 93, h / 2 + 4);
    let size = 84; do { g.font = `700 ${size}px "Barlow Condensed", sans-serif`; size -= 4; } while (g.measureText(dest).width > w - 220 && size > 30);
    g.textAlign = 'left'; g.fillText(dest, 200, h / 2 + 4);
  });
}
function buildPostautoMesh(trip) {
  const g = new THREE.Group(), root = GLTF_CARS.bus.scene.clone(true); g.rotation.order = 'YZX'; g.add(root);
  const box = new THREE.Box3().setFromObject(root);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.24), new THREE.MeshBasicMaterial({ map: ledTexture(ledText(trip)) }));
  led.position.set(box.max.x + 0.03, box.max.y - 0.32, 0); led.rotation.y = Math.PI / 2; g.add(led);   // A9: check once on a screenshot
  const blink = { left: new THREE.Group(), right: new THREE.Group() }, m = new THREE.MeshBasicMaterial({ color: 0xff9a1a });
  for (const [x, y, z] of VEHICLES.bus.blinkers) for (const [side, s] of [['left', -1], ['right', 1]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), m); b.position.set(x, y, s * z); blink[side].add(b); }
  g.add(blink.left, blink.right); g.userData.blink = blink; g.userData.led = ledText(trip);
  return g;
}
```

Dispose only the LED texture/material and the blinker geometry when a bus is removed; never the shared glTF geometry (`userData.sharedGeo`).

- [ ] **Step 4: Step and draw.** Add `stepPostauto(dt)` and call it in `loop` right after `stepFerris();`:

```js
function stepPostauto(dt) {
  if (!POSTAUTO.ready) return;
  const now = postautoClock(), jumped = POSTAUTO.prev !== null && fleetJumped(POSTAUTO.prev, now, dt);
  POSTAUTO.syncT -= dt;
  if (jumped || POSTAUTO.syncT <= 0) { POSTAUTO.buses = syncFleet(jumped ? [] : POSTAUTO.buses, POSTAUTO.trips, POSTAUTO.routes, now); POSTAUTO.syncT = 1; }
  POSTAUTO.prev = now;
  if (POSTAUTO.buses.some((b) => b.phase !== 'done') && gltfState('bus') === 'idle') loadVehicleModel('bus');
  const flashOn = Math.floor(performance.now() / 350) % 2 === 0, player = { x: P.x, z: P.z, r: FOOT.on ? WALKER.radius : carRadius() };
  POSTAUTO.colliders = [];
  const alive = new Set();
  for (const b of POSTAUTO.buses) {
    if (b.phase === 'done') continue;
    const level = b.y === undefined || Math.abs(P.y - b.y) < PA.above;   // a player on a bridge above or in the air is not in the way
    const gap = b.phase === 'drive' && level ? obstacleGap(b.route, b.s, player) : null;
    stepBus(b, now, dt, gap);
    if (b.phase === 'done') continue;
    alive.add(b.key); drawPostauto(b, flashOn);
  }
  for (const [key, g] of POSTAUTO.meshes) if (!alive.has(key)) { POSTAUTO.group.remove(g); disposePostautoMesh(g); POSTAUTO.meshes.delete(key); }
  POSTAUTO.group.visible = LEVELS.isSurface();
}
function drawPostauto(b, flashOn) {
  const p = busPose(b.route, b.s), c = Math.cos(p.th), s = Math.sin(p.th), half = BUS.wheelbase / 2;
  const yF = groundH(p.x + c * half, p.z + s * half, (b.y ?? 0) + 1), yR = groundH(p.x - c * half, p.z - s * half, (b.y ?? 0) + 1);
  b.y = (yF + yR) / 2;
  POSTAUTO.colliders.push(busCollider(p.x, p.z, p.th, b.y));
  if (gltfState('bus') !== 'ready') return;
  let g = POSTAUTO.meshes.get(b.key);
  if (!g) { g = buildPostautoMesh(b.trip); POSTAUTO.meshes.set(b.key, g); POSTAUTO.group.add(g); }
  g.position.set(p.x, b.y, p.z); g.rotation.set(0, -p.th, Math.atan2(yF - yR, BUS.wheelbase));
  const side = busBlinker(b, postautoClock());
  g.userData.blink.left.visible = flashOn && side === 'left'; g.userData.blink.right.visible = flashOn && side === 'right';
}
```

`b.y` is the bus height from the last draw. Check the sign of the pitch (`rotation.z`) against how `car` is pitched; the nose must go up on an uphill road. If `gltfState('bus') === 'failed'`, log once and draw nothing (A8).

- [ ] **Step 5: Collisions.** In `collide(r)`, iterate `POSTAUTO.colliders` in addition to `gridQuery(OBB_GRID, ...)` (e.g. `for (const o of [...gridQuery(OBB_GRID, P.x, P.z, reach + 2), ...POSTAUTO.colliders])`), so the existing response (push, bounce, crash sound, damage, `low`/`h` rule) applies unchanged. Do the same in `collideFoot` (via `footSolids` or a second loop) and `footFree`.
- [ ] **Step 6: Debug hook.** Next to `window.__mm.auto`:

```js
window.__mm.postauto = () => ({ ready: POSTAUTO.ready, clock: postautoClock(), model: gltfState('bus'),
  buses: POSTAUTO.buses.filter((b) => b.phase !== 'done').map((b) => { const p = busPose(b.route, b.s); return { line: b.trip.line, to: b.trip.to, route: b.route.id, phase: b.phase, k: b.k, s: b.s, v: b.v, x: p.x, z: p.z, th: p.th, y: b.y, blinker: busBlinker(b, postautoClock()), led: POSTAUTO.meshes.get(b.key)?.userData.led ?? null }; }) });
```

- [ ] **Step 7: Run** `node --test tests/postauto.test.mjs`, then serve (`python3 -m http.server 8000`) and open `http://localhost:8000/index.html?patime=<a time during a line 133 trip>` once in a headless browser via `tests/test_postauto.py` (Task 8): no console errors.
- [ ] **Step 8: Commit** `feat(postauto): Postautos drive line 133 in the world (#500)`.

## Task 7: Credit opentransportdata.swiss

**Files:** Modify `about.js`, `strings.js`, `index.html` (About *Data* list), `tests/about.test.mjs`.

- [ ] **Step 1: Write the failing test.** In `tests/about.test.mjs`, the agreed set of `ABOUT_LINKS` keys gains `'otd'` (sorted between `'osm'` and `'plattform'`), and append:

```js
test('ABOUT_LINKS: the Postauto timetable source (#500)', () => {
  assert.equal(ABOUT_LINKS.otd, 'https://opentransportdata.swiss/');
});
```

- [ ] **Step 2: Run** `node --test tests/about.test.mjs`; it fails.
- [ ] **Step 3: Implement.** `about.js`: `otd: 'https://opentransportdata.swiss/',   // #500: Postauto timetable (terms 5.1: cite as source)`. `strings.js`: `aboutTimetable: 'Postauto timetable: opentransportdata.swiss'` (en), `aboutTimetable: 'Postauto-Fahrplan: opentransportdata.swiss'` (de). `index.html` *Data* `<dd>`: append `<br><a data-link="otd" data-i18n="aboutTimetable"></a>`.
- [ ] **Step 4: Run** `node --test tests/about.test.mjs tests/strings.test.mjs`.
- [ ] **Step 5: Commit** `feat(about): credit opentransportdata.swiss for the Postauto timetable (#500)`.

## Task 8: Browser test and changelog

**Files:** Create `tests/test_postauto.py`; Modify `CHANGELOG.md`.

- [ ] **Step 1: Write the test.** Model it on `tests/test_autopilot.py` (`open_page`, SwiftShader args, `wait_for_function` on `window.__mm.sim`). Read `data/timetable_hochrhein.json`; skip when it or the world file is missing. Pick the first trip and a time 30 s after its second call's departure (driving) and its third call's arrival + 2 s (standing); format as `HH:MM` (round down, then allow the bus to be in either phase only where a minute rounding requires it).

```python
"""#500: Postautos on line 133 by the weekday timetable. Slow (Playwright): run in the foreground."""
import json
from pathlib import Path
import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
TT = ROOT / "data" / "timetable_hochrhein.json"
needs_data = pytest.mark.skipif(not TT.exists(), reason="run the #682 timetable cut first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def hhmm(secs):
    secs = int(secs) % 86400
    return f"{secs // 3600:02d}:{secs // 60 % 60:02d}"


def open_at(p, server, patime):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/index.html?patime={patime}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
    return b, page, errors


@needs_data
def test_postauto_drives_line_133_with_led(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postauto().buses.some(x => x.led)", timeout=120000)
        bus = next(x for x in page.evaluate("() => window.__mm.postauto().buses") if x["led"])
        assert bus["line"] == "133" and bus["led"]["line"] == "133" and bus["led"]["dest"]
        s0 = bus["s"]
        page.wait_for_timeout(3000)
        moved = page.evaluate("() => window.__mm.postauto().buses")
        assert any(x["s"] != s0 or x["phase"] == "stand" for x in moved)
        assert not errors
        b.close()


@needs_data
def test_player_bounces_off_a_standing_postauto(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, _ = open_at(p, server, hhmm(trip["calls"][0][2] - 60))   # standing at the first stop
        page.wait_for_function("() => window.__mm.postauto().buses.some(x => x.phase === 'stand' && x.k === 0)", timeout=120000)
        bus = next(x for x in page.evaluate("() => window.__mm.postauto().buses") if x["phase"] == "stand")
        # drive at the bus side-on from 15 m away; the car must end up outside the bus box
        import math
        nx, nz = -math.sin(bus["th"]), math.cos(bus["th"])
        x0, z0 = bus["x"] - nx * 15, bus["z"] - nz * 15
        page.evaluate(f"() => window.__mm.sim({x0}, {z0}, {math.atan2(nz, nx)}, 8, 3)")
        car = page.evaluate("() => window.__mm.carPose().pos")
        lateral = (car[0] - bus["x"]) * nx + (car[2] - bus["z"]) * nz
        assert lateral < -1.2   # stopped on its own side of the bus
        b.close()
```

`window.__mm.sim` steps the car physics synchronously and calls `collide`; the Postauto colliders from the last drawn frame are in `POSTAUTO.colliders`. If `sim` does not see them, adapt the test to drive with real key presses for 3 s instead; do not weaken the assertion. Add one screenshot check of the LED position (A9) by eye, not as an assertion: save `page.screenshot()` with the camera near the bus into your own `mktemp -d` and look at it.

- [ ] **Step 2: Commit and push the branch**, then run `python -m pytest tests/test_postauto.py -x` in the foreground with a generous timeout. Only this file.
- [ ] **Step 3: CHANGELOG.** Under `[Unreleased]` → `### Added`, a player-facing entry (time stamp per the file's convention), e.g.: "**Postautos** now drive **line 133** Frick – Eiken – Sisseln – Stein-Säckingen by the real weekday timetable (Swiss time): they stop at every stop, slow down at junctions, signal, and show line and destination on the display. A Postauto waits if you stand in its way, and you bounce off it if you ram it. Timetable data: opentransportdata.swiss."
- [ ] **Step 4: Run** `node --test tests/postauto.test.mjs tests/route.test.mjs tests/regions.test.mjs tests/world.test.mjs tests/about.test.mjs`; all pass.
- [ ] **Step 5: Commit** `docs(changelog): Postauto line 133 (#500)` and push.
