# Autopilot to a Destination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** **O** opens a "Drive to" list (the J landmarks plus every named street). Picking an entry plans an A\* route on the road graph, and the car drives there by itself. It steers along the route, slows down for bends, bridges and the destination, sets the turn signals at junction turns, and stops on arrival. The route shows on the minimap. Any steering, gas or brake input hands control back. A race run that used it is not counted (#18).

**Architecture:** A new pure module `prototype/route.js` builds the road graph from `ROADS` (shared vertices plus road ends that touch a road within 1.5 m, largest connected network), runs A\* and holds every driving rule (`autoStep`: tracking, pure-pursuit steering, speed limits, turn signals, arrival / off-route / stuck). It is tested with `node --test`. `prototype/index.html` adds the glue: an `AUTOP` state, a `'drive'` mode of the J dialog, `startAuto` / `stopAuto` / `autoInputs`, the route on the minimap, a HUD line, the race flag `R.auto` and test hooks. `stepCar` changes only in its input line.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, pure ES modules (`node --test`), Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-autopilot-design.md`

## Global Constraints

- Test-Driven Development for every task: write the failing test, watch it fail, implement minimally, verify green. Never edit a test to make it pass. If a test still fails after 3 attempts, STOP and report what is going wrong.
- **`stepCar` changes only in its input line** (Task 4 Step 4). With the autopilot off, every input is read exactly as today: `test_vehicles.py::test_golden_trace_of_the_compact_car` must stay green unchanged.
- Key **O** only (`grep -c KeyO prototype/index.html` must be 0 before Task 4). F, L, P, B are claimed by #10, #2, #83, #65.
- The constants in `AUTO` / `CLASS_KMH` (Task 1) are the spec's decisions. Change them only if a Playwright drive test cannot pass otherwise, and say so in the PR.
- All new UI text through `tr()`, en and de in `prototype/strings.js` (same keys, Swiss spelling, no `ß`). German strings are impersonal, like the existing ones.
- `prototype/index.html`: dense one-line style, short `//` comments; match the surrounding code, do not reformat neighbours. No framework, bundler, `package.json` or new dependency. New code must not call `rr()` or `rnd()`.
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged and green.
- Commands from the repo root. Node: `node --test prototype/tests/*.test.mjs`. Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_autopilot.py -q`. These runs are slow (minutes, the world file loads per test), so run them in the **foreground only, never `run_in_background`**. Exit 137 = memory cap: stop and report. On a CI runner without `systemd-run --user`, drop the prefix. One-time venv setup if missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task (Conventional Commits, `git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- The `stepCar` input line: autopilot off ⇒ byte-for-byte the old expressions. Pinned by the golden trace.
- `resetCar` and `finish` end the autopilot, so R, J, the map double-click, Start / Retry and the finish all stop it. Pinned by `test_r_ends_the_autopilot_and_c_does_not`.
- The take-over check runs in `keydown` **before** the key's normal action and does not swallow it. Pinned by `test_a_driving_key_takes_back_control`.
- `jumpKey` closes the dialog with **O** in drive mode and **J** in jump mode only. The J list is unchanged (`test_jump.py` stays green).
- `R.auto` is cleared in `startRace` and blocks the record in `finish`.

---

## File map

- Create: `prototype/route.js`, `prototype/tests/route.test.mjs`, `prototype/tests/test_autopilot.py`.
- Modify `prototype/strings.js`: 12 keys in `en` and `de`.
- Modify `prototype/index.html`: CSS `#autoline` (after `#roadname`, ~L33); `#autoline` div after `#roadname` (~L100); F1 help line after the J line (~L121); ids on the J dialog's title and hint (~L130); `route.js` import (~L206); `keydown` listener and touch handlers (~L915-918); `AUTOP` + glue after `resetCar` (~L951); `raceFlags` hook (~L968); `stepCar` input line (~L995); `startRace` / `finish` / `resultHtml` (~L1035-1039); J dialog functions (~L1041-1058); `drawMap` (~L1101); `hud` (~L1130).
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `7fcda19`. Check them with `grep -n` before editing, since other PRs (#10, #77, #83, #2) may have moved them.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check the anchors.** From the repo root, one command each:

```bash
grep -c "KeyO" prototype/index.html
grep -c "R.jumped = false;" prototype/index.html
grep -c "if (!R.jumped" prototype/index.html
grep -c "R.jumped ? tr('notCountedJump') : ''" prototype/index.html
grep -c "const nitro = keys.KeyN ? 1 : 0, gas = " prototype/index.html
grep -c "function resetCar() {" prototype/index.html
grep -c "function jumpRows() {" prototype/index.html
grep -c "FLY.on" prototype/index.html
```

Expected: `0 1 1 1 1 1 1` and then a number (10 on `main` @ `3ddb51c`, where #10 has landed). If an anchor is missing or doubled, STOP and report. If the last count is > 0, do Task 4 Step 10.

- [ ] **Step 2: Baseline.** `node --test prototype/tests/*.test.mjs` is green.

---

### Task 1: Pure route module `prototype/route.js`

**Files:** Create `prototype/tests/route.test.mjs`, `prototype/route.js`.

- [ ] **Step 1: Write the failing test** `prototype/tests/route.test.mjs`:

```js
// #18: autopilot — road graph, A* route, turn signals, speed and steering rules. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO, CLASS_KMH, TAKE_OVER_KEYS, buildGraph, snapToGraph, findRoute, turnAt, routeSignals, blinkerAt, trackRoute, steerToward, targetSpeed, autoStep, placeName, streetEntries, placeChips } from '../route.js';

const road = (pts, cls = 'residential', extra = {}) => ({ n: '', cls, w: 6, bridge: false, pts, ...extra });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const degree = (g, x, z) => { const i = g.nodes.findIndex((n) => near(n.x, x) && near(n.z, z)); return i < 0 ? -1 : g.adj[i].length; };
// a plus sign: two roads crossing at a shared vertex (0, 0)
const PLUS = [road([[-100, 0], [0, 0], [100, 0]]), road([[0, -100], [0, 0], [0, 100]])];

test('buildGraph puts a node where two roads share a vertex', () => {
  const g = buildGraph(PLUS);
  assert.equal(degree(g, 0, 0), 4);
  assert.equal(g.edges.length, 4);
  assert.ok(g.edges.every((e) => near(e.len, 100)));
});

test('buildGraph joins a road end that touches another road within AUTO.snap, not further away', () => {
  const t = buildGraph([road([[-100, 0], [100, 0]]), road([[30, 1], [30, 80]])]);
  assert.equal(degree(t, 30, 0), 3);
  assert.equal(t.main.reduce((a, b) => a + b, 0), 4);
  const far = buildGraph([road([[-100, 0], [100, 0]]), road([[30, 3], [30, 80]]), road([[-100, 0], [-100, -50]])]);
  assert.equal(degree(far, 30, 0), -1);
  assert.equal(far.main.reduce((a, b) => a + b, 0), 3);   // the loose road is not in the main network
});

test('buildGraph skips footways, paths and steps, keeps bridges and never joins onto the middle of a bridge', () => {
  const g = buildGraph([road([[-100, 0], [100, 0]], 'primary', { bridge: true }), road([[0, 1], [0, 80]]), road([[0, 0], [0, -80]], 'footway')]);
  assert.equal(g.edges.filter((e) => e.road.bridge).length, 1);
  assert.ok(g.edges.every((e) => e.road.cls !== 'footway'));
  assert.equal(degree(g, 0, 0), -1);
});

test('snapToGraph finds the nearest point on the main network, within maxDist only', () => {
  const g = buildGraph(PLUS), s = snapToGraph(g, 40, 5);
  assert.ok(near(s.x, 40) && near(s.z, 0) && near(s.d, 5));
  assert.ok(near(g.edges[s.e].len, 100));
  assert.equal(snapToGraph(g, 40, 50, 30), null);
});

// a 100 m square with a diagonal: from (10, 0) to (90, 100) both ways round the square are 200 m, the diagonal 161 m
const SQUARE = [road([[0, 0], [100, 0]]), road([[100, 0], [100, 100]]), road([[0, 0], [0, 100]]), road([[0, 100], [100, 100]]), road([[0, 0], [50, 50], [100, 100]], 'service')];

test('findRoute takes the shortest way and starts and ends at the snapped points', () => {
  const g = buildGraph(SQUARE), r = findRoute(g, snapToGraph(g, 10, 2), [snapToGraph(g, 90, 103)]);
  assert.deepEqual(r.pts[0], [10, 0]);
  assert.deepEqual(r.pts[r.pts.length - 1], [90, 100]);
  assert.ok(near(r.len, 10 + Math.hypot(100, 100) + 10, 1e-6));   // back to (0,0), the diagonal, back to (90,100)
  assert.equal(r.road.length, r.pts.length - 1);
  assert.ok(r.road.some((x) => x.cls === 'service'));
});

test('findRoute stays on one edge when start and goal share it, and picks the nearest of several goals', () => {
  const g = buildGraph(PLUS);
  const same = findRoute(g, snapToGraph(g, 10, 0), [snapToGraph(g, 60, 0)]);
  assert.ok(near(same.len, 50));
  const two = findRoute(g, snapToGraph(g, 10, 0), [snapToGraph(g, -90, 0), snapToGraph(g, 0, 20)]);
  assert.deepEqual(two.pts[two.pts.length - 1], [0, 20]);
  assert.equal(findRoute(g, snapToGraph(g, 10, 0), []), null);
});

test('route joints carry the junction degree', () => {
  const g = buildGraph(PLUS), r = findRoute(g, snapToGraph(g, -50, 0), [snapToGraph(g, 0, 50)]);
  assert.deepEqual(r.joints.map((j) => j.deg), [4]);
  assert.ok(near(r.joints[0].s, 50));
});

test('turn signals: right and left at junctions, none straight on or at a plain bend', () => {
  const g = buildGraph(PLUS);
  const right = findRoute(g, snapToGraph(g, -50, 0), [snapToGraph(g, 0, 50)]);    // east, then south (+z) = right
  const left = findRoute(g, snapToGraph(g, -50, 0), [snapToGraph(g, 0, -50)]);    // east, then north = left
  const straight = findRoute(g, snapToGraph(g, -50, 0), [snapToGraph(g, 50, 0)]);
  assert.deepEqual(routeSignals(right), [{ s: 50, side: 'right' }]);
  assert.deepEqual(routeSignals(left), [{ s: 50, side: 'left' }]);
  assert.deepEqual(routeSignals(straight), []);
  const bendG = buildGraph([road([[0, 0], [100, 0], [100, 100]])]);
  assert.deepEqual(routeSignals(findRoute(bendG, snapToGraph(bendG, 10, 0), [snapToGraph(bendG, 100, 90)])), []);
  assert.ok(turnAt(right, 50) > 0 && turnAt(left, 50) < 0);
});

test('blinkerAt is on from AUTO.signalBefore before the turn to AUTO.signalAfter after it', () => {
  const sig = [{ s: 100, side: 'left' }];
  assert.equal(blinkerAt(sig, 100 - AUTO.signalBefore - 1), null);
  assert.equal(blinkerAt(sig, 100 - AUTO.signalBefore), 'left');
  assert.equal(blinkerAt(sig, 100 + AUTO.signalAfter), 'left');
  assert.equal(blinkerAt(sig, 100 + AUTO.signalAfter + 1), null);
});

test('trackRoute follows progress and reports the distance to the route', () => {
  const g = buildGraph(PLUS), r = findRoute(g, snapToGraph(g, -100, 0), [snapToGraph(g, 100, 0)]);
  const t = trackRoute(r, 30, 4, 100);
  assert.ok(near(t.s, 130) && near(t.d, 4));
});

test('steerToward steers right (positive) towards a route that bends right, left for a left bend', () => {
  const g = buildGraph(PLUS);
  const right = findRoute(g, snapToGraph(g, -5, 0), [snapToGraph(g, 0, 50)]);
  const left = findRoute(g, snapToGraph(g, -5, 0), [snapToGraph(g, 0, -50)]);
  assert.ok(steerToward(right, 0, -5, 0, 0, 5).steer > 0);
  assert.ok(steerToward(left, 0, -5, 0, 0, 5).steer < 0);
  assert.ok(Math.abs(steerToward(right, 0, -5, 0, 0, 5).steer) <= 1);
});

test('targetSpeed: road class, bridges, bends and the stop at the end', () => {
  const long = (cls, extra) => { const g = buildGraph([road([[0, 0], [2000, 0]], cls, extra)]); return findRoute(g, snapToGraph(g, 0, 0), [snapToGraph(g, 2000, 0)]); };
  assert.ok(near(targetSpeed(long('residential'), 500), CLASS_KMH.residential / 3.6));
  assert.ok(near(targetSpeed(long('primary'), 500), CLASS_KMH.primary / 3.6));
  assert.ok(near(targetSpeed(long('primary', { bridge: true }), 500), AUTO.bridgeKmh / 3.6));
  const r = long('primary');
  assert.ok(targetSpeed(r, r.len - 2) < 0.01);
  assert.ok(targetSpeed(r, r.len - 20) < targetSpeed(r, r.len - 40));
  const g = buildGraph([road([[0, 0], [300, 0], [300, 300]], 'primary')]), bend = findRoute(g, snapToGraph(g, 0, 0), [snapToGraph(g, 300, 300)]);
  assert.ok(targetSpeed(bend, 300) < 7);                                       // in a 90° corner
  assert.ok(targetSpeed(bend, 100) > targetSpeed(bend, 280));                  // slows down before it
});

test('autoStep drives, arrives, notices leaving the route and gives up when stuck', () => {
  const g = buildGraph([road([[0, 0], [500, 0]])]), route = findRoute(g, snapToGraph(g, 0, 0), [snapToGraph(g, 500, 0)]);
  const st = () => ({ route, s: 0, signals: [], stuckT: 0 });
  const go = autoStep(st(), { x: 0, z: 0, th: 0, vf: 0, speed: 0 }, 1 / 60);
  assert.equal(go.status, 'drive'); assert.equal(go.gas, 1); assert.equal(go.brake, 0);
  assert.equal(autoStep(st(), { x: 100, z: 0, th: 0, vf: 25, speed: 25 }, 1 / 60).brake, 1);
  assert.equal(autoStep({ ...st(), s: 490 }, { x: 495, z: 0, th: 0, vf: 1, speed: 1 }, 1 / 60).status, 'arrived');
  assert.equal(autoStep(st(), { x: 0, z: AUTO.offRoute + 1, th: 0, vf: 0, speed: 0 }, 1 / 60).status, 'off-route');
  const stuck = st(); let s = 'drive';
  for (let i = 0; i < 60 * (AUTO.stuckSecs + 0.5) && s === 'drive'; i++) s = autoStep(stuck, { x: 50, z: 0, th: 0, vf: 0, speed: 0 }, 1 / 60).status;
  assert.equal(s, 'stuck');
});

test('TAKE_OVER_KEYS: steering, gas, brake, handbrake, nitro and O; not the turn signals or the camera', () => {
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ControlLeft', 'ControlRight', 'KeyN', 'KeyO']) assert.ok(TAKE_OVER_KEYS.has(k), k);
  for (const k of ['KeyQ', 'KeyE', 'KeyC', 'KeyB', 'Tab', 'KeyH', 'Enter']) assert.ok(!TAKE_OVER_KEYS.has(k), k);
});

test('placeName turns a village sign into a place name', () => {
  assert.equal(placeName('BAD SÄCKINGEN'), 'Bad Säckingen');
  assert.equal(placeName('MÜNCHWILEN'), 'Münchwilen');
});

test('streetEntries: one entry per street name and nearest village, sorted west to east, unnamed roads skipped', () => {
  const villages = [{ t: 'OST', x: 1000, z: 0 }, { t: 'WEST', x: -1000, z: 0 }];
  const g = buildGraph([road([[-1000, 0], [-900, 0]], 'residential', { n: 'Hauptstrasse' }), road([[-900, 0], [-800, 0]], 'residential', { n: 'Hauptstrasse' }),
    road([[-800, 0], [900, 0]]), road([[900, 0], [1000, 0]], 'residential', { n: 'Hauptstrasse' }), road([[900, 0], [900, 100]], 'residential', { n: 'Bachweg' })]);
  const e = streetEntries(g, villages);
  assert.deepEqual(e.map((s) => [s.n, s.g, s.goals.length]), [['Hauptstrasse', 'West', 2], ['Bachweg', 'Ost', 1], ['Hauptstrasse', 'Ost', 1]]);
  assert.ok(e.every((s) => s.street));
  assert.deepEqual(placeChips([{ g: 'Stein' }, { g: 'Sisseln' }, { g: 'Stein' }, { g: null }]), ['Stein', 'Sisseln']);
});
```

- [ ] **Step 2: Run it, expect failure.** `node --test prototype/tests/route.test.mjs` → fails (`Cannot find module '../route.js'`).

- [ ] **Step 3: Implement** `prototype/route.js`:

```js
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
```

- [ ] **Step 4: Run, expect green.** `node --test prototype/tests/route.test.mjs` → 16 pass. Then `node --test prototype/tests/*.test.mjs` → all green.

- [ ] **Step 5: Commit.** `git add prototype/route.js prototype/tests/route.test.mjs && git commit -m "feat(prototype): road graph, A* route and autopilot rules (#18)"`

---

### Task 2: Strings

**Files:** Modify `prototype/strings.js`.

- [ ] **Step 1: Failing test.** Append to `prototype/tests/strings.test.mjs`:

```js
test('#18 autopilot strings exist in both languages', () => {
  assert.equal(translate('en', 'driveTitle'), 'Drive to');
  assert.equal(translate('de', 'driveTitle'), 'Fahren nach');
  assert.equal(translate('en', 'autoLine', 'Smile-Kreisel', '0.7'), 'AUTOPILOT → Smile-Kreisel · 0.7 km');
  assert.equal(translate('de', 'autoArrived', 'Smile-Kreisel'), 'Angekommen: Smile-Kreisel');
  assert.equal(translate('en', 'streetIn', 'Sisseln'), 'street · Sisseln');
  assert.equal(translate('en', 'notCountedAuto'), 'with the autopilot, not counted · ');
});
```

Run `node --test prototype/tests/strings.test.mjs` → fails.

- [ ] **Step 2: Add the keys.** In `en`, `notCountedAuto` after `notCountedJump`, and the rest after `jumpHint`:

```js
  notCountedAuto: 'with the autopilot, not counted · ',
```

```js
  keyAuto: 'autopilot: drive to a place or street (O again, steering, gas or brake: you drive)',
  driveTitle: 'Drive to',
  driveHint: 'type to search · ↑↓ Enter · O / Esc closes',
  streetIn: (g) => `street · ${g}`,
  autoOn: (n) => `Autopilot → ${n}`,
  autoOff: 'Autopilot off — you drive',
  autoArrived: (n) => `Arrived: ${n}`,
  autoStuck: 'Autopilot stuck — you drive',
  autoNoRoute: 'No route from here',
  autoNoWorld: 'Autopilot needs the OSM world',
  autoLine: (n, km) => `AUTOPILOT → ${n} · ${km} km`,
```

In `de`, the same places:

```js
  notCountedAuto: 'mit Autopilot, zählt nicht · ',
```

```js
  keyAuto: 'Autopilot: zu einem Ort oder einer Strasse fahren (nochmals O, lenken, Gas oder Bremse: selbst fahren)',
  driveTitle: 'Fahren nach',
  driveHint: 'tippen zum Suchen · ↑↓ Enter · O / Esc schliesst',
  streetIn: (g) => `Strasse · ${g}`,
  autoOn: (n) => `Autopilot → ${n}`,
  autoOff: 'Autopilot aus — selbst fahren',
  autoArrived: (n) => `Angekommen: ${n}`,
  autoStuck: 'Autopilot steckt fest — selbst fahren',
  autoNoRoute: 'Keine Route von hier',
  autoNoWorld: 'Autopilot braucht die OSM-Welt',
  autoLine: (n, km) => `AUTOPILOT → ${n} · ${km} km`,
```

- [ ] **Step 3: Green.** `node --test prototype/tests/*.test.mjs`.
- [ ] **Step 4: Commit.** `git add prototype/strings.js prototype/tests/strings.test.mjs && git commit -m "feat(i18n): autopilot strings (#18)"`

---

### Task 3: Failing browser tests `prototype/tests/test_autopilot.py`

**Files:** Create `prototype/tests/test_autopilot.py`.

- [ ] **Step 1: Write the tests:**

```python
"""#18: O picks a destination (J landmarks + streets), the car drives there along an A* route.
Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
ROUTE_RGB = (0x3D, 0xDC, 0xFF)


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")   # O only works with the start overlay hidden
    return b, page


def anchor(name):
    lm = json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"][name]
    return lm["x"], lm["z"]


def auto(page):
    return page.evaluate("() => window.__mm.auto()")


def drive_to(page, query, place=None):
    """Pick a destination the way a player does: O, type, choose the row (by place if given), Enter."""
    page.keyboard.press("KeyO")
    page.keyboard.type(query)
    rows = page.evaluate("() => window.__mm.jumpList()")
    i = next(k for k, r in enumerate(rows) if place is None or r["g"] == place)
    for _ in range(i):
        page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    return rows[i]


def route_pixels(page):
    return page.evaluate("""([r, g, b]) => { const c = document.getElementById('map'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) < 24 && Math.abs(d[i + 1] - g) < 24 && Math.abs(d[i + 2] - b) < 24) n++; return n; }""", list(ROUTE_RGB))


def frames(page, n=3):
    page.evaluate("(n) => new Promise(res => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : res()); f(); })", n)


@needs_world
def test_o_opens_the_drive_to_list_with_landmarks_and_streets(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyO")
        assert page.is_visible("#jump")
        assert page.text_content("#jumptitle") == "Drive to"
        assert page.evaluate("() => document.activeElement.id") == "jumpq"
        rows = page.evaluate("() => window.__mm.jumpList()")
        names = [r["n"] for r in rows]
        assert "Smile-Kreisel" in names and "Fridolinsmünster" in names
        assert {"n": "Bodenackerstrasse", "g": "Sisseln"} in rows
        assert "Random spot" not in names
        chips = page.eval_on_selector_all("#jumpchips button", "bs => bs.map(b => b.textContent)")
        assert chips[0] == "All" and "Sisseln" in chips and "Wallbach" in chips
        page.keyboard.press("KeyO")   # O on an empty search closes it
        assert not page.is_visible("#jump")
        page.keyboard.press("KeyJ")   # J is still the jump list
        assert page.text_content("#jumptitle") == "Jump to"
        assert "Random spot" in [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
        b.close()


@needs_world
def test_autopilot_drives_to_a_landmark_signals_and_stops(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        drive_to(page, "Smile")
        a = auto(page)
        assert a["on"] and a["dest"] == "Smile-Kreisel" and a["len"] > 300
        assert "Smile-Kreisel" in page.inner_html("#toast")
        assert page.evaluate("() => window.__mm.raceFlags().auto") is True
        r = page.evaluate("() => window.__mm.autoSim(150)")
        assert r["on"] is False and r["last"] == "arrived", r
        x, z = anchor("smileKreisel")
        assert math.hypot(r["x"] - x, r["z"] - z) < 40
        assert r["blinkers"], "a turn signal was set on the way"
        assert 20 < r["maxKmh"] <= 62
        assert auto(page)["blinker"] is None
        assert "Arrived" in page.inner_html("#toast")
        b.close()


@needs_world
def test_autopilot_drives_to_a_street(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        row = drive_to(page, "Bahnhofstrasse", place="Sisseln")
        assert row == {"n": "Bahnhofstrasse", "g": "Sisseln"}
        r = page.evaluate("() => window.__mm.autoSim(120)")
        assert r["last"] == "arrived", r
        assert page.evaluate("() => window.__mm.hud().road") == "Bahnhofstrasse"
        b.close()


@needs_world
@pytest.mark.parametrize("key", ["KeyA", "ArrowUp", "Space", "KeyS", "KeyO"])
def test_a_driving_key_takes_back_control(server, key):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        drive_to(page, "Smile")
        page.evaluate("() => window.__mm.autoSim(3)")
        page.keyboard.press(key)
        a = auto(page)
        assert a["on"] is False and a["last"] == "off"
        assert "Autopilot off" in page.inner_html("#toast")
        assert not page.is_visible("#jump")
        b.close()


@needs_world
def test_r_ends_the_autopilot_and_c_does_not(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        drive_to(page, "Smile")
        page.keyboard.press("KeyC")
        assert auto(page)["on"] is True
        page.keyboard.press("KeyR")
        assert auto(page)["on"] is False
        b.close()


@needs_world
def test_the_minimap_shows_the_route_while_driving(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        frames(page)
        assert route_pixels(page) < 20
        drive_to(page, "Fridolinsm")
        frames(page)
        assert route_pixels(page) > 200
        assert page.text_content("#autoline").startswith("AUTOPILOT → Fridolinsmünster")
        page.keyboard.press("KeyO")
        frames(page)
        assert route_pixels(page) < 20
        assert page.text_content("#autoline") == ""
        b.close()


@needs_world
def test_a_run_with_the_autopilot_is_not_counted(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.evaluate("() => localStorage.removeItem('mm.best2')")
        drive_to(page, "Smile")
        page.keyboard.press("KeyO")
        page.evaluate("() => window.__mm.finishNow()")
        assert "with the autopilot, not counted" in page.inner_html("#result")
        assert page.evaluate("() => localStorage.getItem('mm.best2')") is None
        page.click("#startbtn")
        assert page.evaluate("() => window.__mm.raceFlags().auto") is False
        b.close()


def test_hand_layout_has_no_autopilot(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, block_world=True)
        page.keyboard.press("KeyO")
        assert not page.is_visible("#jump")
        assert "Autopilot needs the OSM world" in page.inner_html("#toast")
        assert page.evaluate("() => window.__mm.auto().on") is False
        b.close()


@pytest.mark.parametrize("locale,text", [("en-US", "autopilot"), ("de-CH", "Autopilot")])
def test_help_lists_o(server, locale, text):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 1280, "height": 720}, locale=locale)
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=240000)
        assert text in page.inner_html("#help")
        b.close()
```

- [ ] **Step 2: Commit and push** (before the slow run): `git add prototype/tests/test_autopilot.py && git commit -m "test(prototype): autopilot browser tests (#18)" && git push -u origin HEAD`
- [ ] **Step 3: Run, expect failure** (foreground): the Playwright command from the Global Constraints with `test_autopilot.py`. Everything fails (`__mm.auto` is undefined, no `#jumptitle`, no O).

---

### Task 4: Wire the autopilot into `prototype/index.html`

**Files:** Modify `prototype/index.html`.

- [ ] **Step 1: Markup and CSS.**
  - After the `#roadname{…}` CSS rule (~L33) add: `#autoline{font-size:15px;font-weight:700;letter-spacing:2px;color:#3ddcff;text-shadow:2px 2px 0 var(--ink);min-height:18px}`
  - After `<div id="roadname"></div>` (~L100) add: `<div id="autoline"></div>`
  - After the F1 help's J line (`keyJump`, ~L121) add: `<kbd>O</kbd><span data-i18n="keyAuto">autopilot: drive to a place or street (O again, steering, gas or brake: you drive)</span>`
  - In `#jump` (~L130) replace `<div data-i18n="jumpTitle">Jump to</div>` with `<div id="jumptitle">Jump to</div>`, and `<small data-i18n="jumpHint">…</small>` with `<small id="jumphint">type to search · ↑↓ Enter · J / Esc closes</small>`. `renderJump` writes both now (Step 7).

- [ ] **Step 2: Import.** After the `strings.js` import (~L206):

```js
import { buildGraph, snapToGraph, findRoute, routeSignals, autoStep, streetEntries, placeChips, TAKE_OVER_KEYS } from './route.js';
```

`VILLAGES` is already imported from `world.js` (~L203); no change there.

- [ ] **Step 3: Autopilot state and glue.** Directly after the `resetCar` line (~L951), add:

```js
// #18 autopilot: O picks a destination (J landmarks + streets), the car drives there along an A* route (route.js). The graph is built on first use
const AUTOP = { on: false, graph: null, streets: [], dest: null, goals: [], st: null, last: null, ownBlinker: false };
function autoGraph() { if (!AUTOP.graph && L) { AUTOP.graph = buildGraph(ROADS); AUTOP.streets = streetEntries(AUTOP.graph, VILLAGES); } return AUTOP.graph; }
function autoGoals(dest) { if (dest.street) return dest.goals; const s = snapToGraph(AUTOP.graph, dest.x, dest.z, 400); return s ? [s] : []; }
function planRoute() { const route = findRoute(AUTOP.graph, snapToGraph(AUTOP.graph, P.x, P.z), AUTOP.goals); if (!route) return false; AUTOP.st = { route, s: 0, signals: routeSignals(route), stuckT: 0 }; return true; }
function startAuto(dest) { closeJump(); AUTOP.dest = dest; AUTOP.goals = autoGoals(dest); if (!planRoute()) { AUTOP.last = 'no-route'; toast(tr('autoNoRoute')); return; } AUTOP.on = true; AUTOP.last = null; if (R.state === 'armed' || R.state === 'racing') R.auto = true; toast(tr('autoOn', dest.n)); }
// ends the autopilot; why: 'off' (player), 'arrived', 'stuck', 'no-route' (each with a toast) or 'reset' (silent: R, J, map, Start, finish)
const AUTO_TOASTS = { off: 'autoOff', arrived: 'autoArrived', stuck: 'autoStuck', 'no-route': 'autoNoRoute' };
function stopAuto(why) { if (!AUTOP.on) return; AUTOP.on = false; AUTOP.st = null; AUTOP.last = why; if (AUTOP.ownBlinker) HUD.blinker = null; AUTOP.ownBlinker = false; if (AUTO_TOASTS[why]) toast(tr(AUTO_TOASTS[why], AUTOP.dest.n)); }
// stepCar's inputs while the autopilot drives, else null (the player's keys)
function autoInputs(dt) {
  if (!AUTOP.on) return null;
  const fx = Math.cos(P.th), fz = Math.sin(P.th), car = { x: P.x, z: P.z, th: P.th, vf: P.vx * fx + P.vz * fz, speed: Math.hypot(P.vx, P.vz) };
  let c = autoStep(AUTOP.st, car, dt);
  if (c.status === 'off-route') c = planRoute() ? autoStep(AUTOP.st, car, dt) : { status: 'no-route' };
  if (c.status !== 'drive') { stopAuto(c.status); return null; }
  HUD.blinker = c.blinker; AUTOP.ownBlinker = true; return c;
}
function openDrive() { if (!autoGraph()) { toast(tr('autoNoWorld')); return; } openJump('drive'); }
```

Then add `stopAuto('reset');` as the **first** statement inside `resetCar`'s body. In `finish`, add `stopAuto('reset');` as its first statement.

- [ ] **Step 4: `stepCar` input line** (~L995). Replace the line that starts `const nitro = keys.KeyN ? 1 : 0, gas = ` with the same line where every input falls back to the old expression when `ap` is null:

```js
  const ap = autoInputs(dt), nitro = ap ? 0 : (keys.KeyN ? 1 : 0), gas = ap ? ap.gas : ((keys.Space || keys.KeyW || keys.ArrowUp || touch.g || nitro) ? 1 : 0), brake = ap ? ap.brake : ((keys.KeyS || keys.ArrowDown || touch.b) ? 1 : 0), steer = ap ? ap.steer : (((keys.KeyD || keys.ArrowRight || touch.r) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft || touch.l) ? 1 : 0)), hb = ap ? 0 : ((keys.ControlLeft || keys.ControlRight || touch.h) ? 1 : 0);
```

Compare it with the old line character by character: the parts after `ap ? … :` must be exactly the old expressions.

- [ ] **Step 5: Keys and touch.**
  - In the `keydown` listener, right after `keys[e.code] = true;`, add: `if (AUTOP.on && $('overlay').hidden && TAKE_OVER_KEYS.has(e.code)) { stopAuto('off'); if (e.code === 'KeyO') { e.preventDefault(); return; } }`. O turns the autopilot off and does not reopen the dialog in the same press.
  - Next to the J line (`if (e.code === 'KeyJ' && $('overlay').hidden) { … openJump(); }`) add: `if (e.code === 'KeyO' && $('overlay').hidden) { e.preventDefault(); openDrive(); }`
  - Change the J line's `openJump()` call to `openJump('jump')`.
  - In the touch loop (~L918), inside `const on = e => { … }`, add `stopAuto('off');` after `touch[k] = 1;`.

- [ ] **Step 6: Race flag.** In `startRace`, right after `R.jumped = false;`, add `R.auto = false;`. In `finish`, change `if (!R.jumped` to `if (!R.jumped && !R.auto`. In `resultHtml`, right after `${R.jumped ? tr('notCountedJump') : ''}`, add `${R.auto ? tr('notCountedAuto') : ''}`. In the `__mm.raceFlags` hook, add `auto: !!R.auto` to the returned object.

- [ ] **Step 7: The J dialog's drive mode.** Add `mode: 'jump'` to the `JUMP` object (~L946). Then replace the J dialog functions from `function jumpRows()` to `function pickJump(i)` with:

```js
function jumpEntries() { return JUMP.mode === 'drive' ? [...JUMP_ENTRIES, ...AUTOP.streets] : JUMP_ENTRIES; }
function jumpRows() { const rows = filterLandmarks(jumpEntries(), JUMP.q, JUMP.g); return JUMP.mode === 'drive' ? rows : [...rows, { n: tr('randomSpot'), g: null, random: true }]; }
function renderJump() {
  const drive = JUMP.mode === 'drive'; JUMP.rows = jumpRows(); JUMP.sel = Math.min(JUMP.sel, JUMP.rows.length - 1);
  $('jumptitle').textContent = tr(drive ? 'driveTitle' : 'jumpTitle'); $('jumphint').textContent = tr(drive ? 'driveHint' : 'jumpHint');
  $('jumplist').innerHTML = JUMP.rows.map((r, i) => `<li data-i="${i}"${i === JUMP.sel ? ' class="sel"' : ''}>${r.n}<span>${r.street ? tr('streetIn', r.g) : r.g || ''}</span></li>`).join('');
  $('jumpchips').innerHTML = L ? ['All', ...(drive ? placeChips(jumpEntries()) : gemeindenOf(JUMP_ENTRIES))].map(g => `<button type="button" data-g="${g}"${(g === 'All' ? !JUMP.g : JUMP.g === g) ? ' class="on"' : ''}>${g === 'All' ? tr('chipAll') : g}</button>`).join('') : '';
  $('jumplist').querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
}
function openJump(mode) { for (const k in keys) keys[k] = false; JUMP.mode = mode; JUMP.q = ''; JUMP.g = null; JUMP.sel = 0; $('jumpq').value = ''; $('jump').hidden = false; renderJump(); $('jumpq').focus(); }
function closeJump() { $('jump').hidden = true; $('jumpq').blur(); }
function pickJump(i) { const r = JUMP.rows[i]; if (!r) return; if (JUMP.mode === 'drive') startAuto(r); else if (r.random) randomSpot(); else jumpTo(r); }
```

In `jumpKey`, change `(e.code === 'KeyJ' && !$('jumpq').value)` to `(e.code === (JUMP.mode === 'drive' ? 'KeyO' : 'KeyJ') && !$('jumpq').value)`. `closeJump`, `moveJumpSel` and the listeners stay as they are. Any other `openJump()` call (`grep -n "openJump(" prototype/index.html`) gets `'jump'`.

- [ ] **Step 8: Minimap and HUD.** In `drawMap`, right after the `if (HUD.bounds) mg.drawImage(mapBounds, …);` statement, add `if (AUTOP.on) drawRoute(v);`, and above `function drawMap` add:

```js
// #18: the route still ahead, cyan with a dark outline, and a dot at the destination
function drawRoute(v) { const { route, s } = AUTOP.st; let i = 0; while (i < route.pts.length - 2 && route.cum[i + 1] <= s) i++; mg.beginPath(); mg.moveTo(...mapPt(v, P.x, P.z)); for (let k = i + 1; k < route.pts.length; k++) mg.lineTo(...mapPt(v, route.pts[k][0], route.pts[k][1])); mg.lineJoin = 'round'; mg.lineWidth = 7; mg.strokeStyle = '#1c1f26'; mg.stroke(); mg.lineWidth = 4; mg.strokeStyle = '#3ddcff'; mg.stroke(); const [ex, ey] = mapPt(v, ...route.pts[route.pts.length - 1]); mg.beginPath(); mg.arc(ex, ey, 7, 0, 7); mg.fillStyle = '#3ddcff'; mg.fill(); mg.lineWidth = 2; mg.strokeStyle = '#1c1f26'; mg.stroke(); }
```

In `hud`, next to `$('roadname').textContent = HUD.road;` (inside the 250 ms block), add: `$('autoline').textContent = AUTOP.on ? tr('autoLine', AUTOP.dest.n, ((AUTOP.st.route.len - AUTOP.st.s) / 1000).toFixed(1)) : '';`. The test reads it after a few frames. If the 250 ms block makes it lag, move the statement outside the block.

- [ ] **Step 9: Test hooks.** After the `__mm.raceFlags` line, add:

```js
window.__mm.auto = () => ({ on: AUTOP.on, dest: AUTOP.dest ? AUTOP.dest.n : null, len: AUTOP.st ? AUTOP.st.route.len : 0, left: AUTOP.st ? AUTOP.st.route.len - AUTOP.st.s : 0, signals: AUTOP.st ? AUTOP.st.signals.length : 0, blinker: HUD.blinker, last: AUTOP.last });
// drive headless: step the car and the race at 1/60 s while the autopilot is on, at most secs seconds
window.__mm.autoSim = (secs) => { const blinkers = new Set(); let maxKmh = 0, n = 0; for (; n < secs * 60 && AUTOP.on; n++) { stepCar(1 / 60); stepRace(1 / 60); if (HUD.blinker) blinkers.add(HUD.blinker); maxKmh = Math.max(maxKmh, Math.hypot(P.vx, P.vz) * 3.6); } return { on: AUTOP.on, last: AUTOP.last, x: P.x, z: P.z, blinkers: [...blinkers], maxKmh, secs: n / 60 }; };
```

- [ ] **Step 10: Helicopter (#10, merged on `main` @ `3ddb51c`).** If Task 0's `FLY.on` count is > 0 (expected): call `stopAuto('reset');` as the first statement of `function takeOff()`, and make the O line `if (e.code === 'KeyO' && $('overlay').hidden && !FLY.on) { … }`. `land()` ends in `resetCar`, which already stops a (by then impossible) autopilot. Add to `test_autopilot.py` a test that engages the autopilot, presses **F** and asserts `__mm.auto().on` is `False` and `__mm.fly().on` is `True`, then presses **O** and asserts `#jump` stays hidden.

- [ ] **Step 11: Node green.** `node --test prototype/tests/*.test.mjs`.
- [ ] **Step 12: Commit and push.** `git add prototype/index.html && git commit -m "feat(prototype): autopilot to a landmark or street with O (#18)" && git push`
- [ ] **Step 13: Browser tests green** (foreground): the Playwright command with `test_autopilot.py`, then `test_jump.py test_minimap.py test_vehicles.py test_smoke.py test_i18n.py`. If a drive test ends `stuck` or off-route, check `__mm.auto()` and the car's path first. Tune the `AUTO` constants only as the last resort and name the change in the PR.

---

### Task 5: Full suites, changelog, playtest note

- [ ] **Step 1:** Full node suite and the full Playwright suite (`../prototype/tests/ -q`, foreground). Everything green, except the known flaky #64 / #88, which are rerun once.
- [ ] **Step 2: CHANGELOG.** Under `[Unreleased]` → `### Added`:

```markdown
- Press **O** for the autopilot: pick a place from the **J** list or any street, and the car drives there by itself — it finds the way through the road network, slows down for bends and bridges, sets the turn signals before it turns and stops when it arrives. The way ahead shows as a blue line on the map. Steer, accelerate or brake (or press **O** again) and you drive yourself. A race run with the autopilot does not count.
```

- [ ] **Step 3: `test-todo.md`.** Append:

```markdown
## Autopilot (#18)

- [ ] O → "Smile-Kreisel" from the start: the car drives there on its own, the right turn signal blinks before the roundabout, it stops at the Kreisel and says "Arrived".
- [ ] O → a street ("Bahnhofstrasse · Stein"): the route on the minimap leads over the Fridolinsbrücke at walking pace, no jump at the bridge ends.
- [ ] A, D, W, S, Space or O while it drives: the car is yours at once, the key works as usual.
- [ ] Hold Tab (full map, #77): the blue route is on the big map too.
- [ ] Does it feel too slow / too fast in Sisseln and on the Hauptstrasse?
```

- [ ] **Step 4: Commit.** `git add CHANGELOG.md test-todo.md && git commit -m "docs(changelog): autopilot with O (#18)" && git push`
