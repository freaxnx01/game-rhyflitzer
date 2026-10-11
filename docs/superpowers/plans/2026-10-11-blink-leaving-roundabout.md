# Blink when leaving the roundabout Implementation Plan (#231)

**Goal:** `routeSignals` signals when the route leaves a roundabout and never on the way in or around the ring. Spec: `docs/superpowers/specs/2026-10-11-blink-leaving-roundabout-design.md`.

## Global Constraints

- Buildless; no packages. Locate code by anchors (`routeSignals`, `blinkerAt`, `assemble`, `export const AUTO`), not line numbers. `prototype/route.js` is a pure module; keep it free of browser state. #207 will reuse `isRoundabout`, so export it.
- `route.road` is per segment (`route.road[i]` for the segment `pts[i] -> pts[i+1]`), `route.cum` the cumulative metres; a route's roads are the same objects as in the world file, so identity comparison with a ring road works.
- Do not change signals for ordinary junctions (existing tests in `prototype/tests/route.test.mjs` must stay green).
- Key handling is untouched. (Task is not about keys; `grep -n "blinker" prototype/*.js prototype/index.html` only to find the `__mm.auto` hook.)
- Tests: `node --test prototype/tests/*.test.mjs` plus ONE Playwright file, foreground, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_autopilot.py -q -p no:cacheprovider -k roundabout` (needs `data/world_hochrhein.json`). Never the full suite.
- CHANGELOG hand-written, timestamped `` `YYYY-MM-DD HH:MM` `` (Zurich) under `[Unreleased]` / `### Fixed`; never `git cliff -o`.

---

### Task 1: `isRoundabout` (node first)

**Files:** Modify `prototype/route.js`, `prototype/tests/route.test.mjs`.

- [ ] **Step 1: failing test.** In `route.test.mjs` add `isRoundabout` to the import and a ring fixture used by the next task too:

```js
// a roundabout: closed ring of radius 12 (32 segments, vertices rounded so arms can share them) with four arms
const ringPts = Array.from({ length: 33 }, (_, k) => { const a = (k % 32) / 32 * Math.PI * 2; return [Math.round(Math.cos(a) * 12000) / 1000, Math.round(Math.sin(a) * 12000) / 1000]; });
const RING = road(ringPts, 'primary');
const arm = (k, dx, dz) => road([[ringPts[k][0] + dx, ringPts[k][1] + dz], ringPts[k]], 'primary');
const ROUNDABOUT = [RING, arm(0, 100, 0), arm(8, 0, 100), arm(16, -100, 0), arm(24, 0, -100)];

test('isRoundabout_ClosedSmallRing_IsTrue', () => assert.equal(isRoundabout(RING), true));
test('isRoundabout_OpenArc_IsFalse', () => assert.equal(isRoundabout(road(ringPts.slice(0, 20), 'primary')), false));
test('isRoundabout_BigLoop_IsFalse', () => {
  const big = ringPts.map(([x, z]) => [x * 4, z * 4]);
  assert.equal(isRoundabout(road(big, 'service')), false);
});
test('isRoundabout_PedestrianRing_IsFalse', () => assert.equal(isRoundabout(road(ringPts, 'pedestrian')), false));
```

- [ ] **Step 2:** `node --test prototype/tests/route.test.mjs` -> FAIL (no export).
- [ ] **Step 3:** In `route.js` after `isRoutable` add `isRoundabout(r)`: `isRoutable(r)`, `r.pts.length > 4`, first and last point within 0.5 m, and the larger bounding-box side between 15 and 45 m. Export it.
- [ ] **Step 4:** node test -> PASS. Commit `feat(autopilot): isRoundabout detects ring roads (#231)`.

### Task 2: Signal on the exit only (node first)

**Files:** Modify `prototype/route.js` (`AUTO`, `routeSignals`, `blinkerAt`), `prototype/tests/route.test.mjs`.

**Interfaces:** `AUTO.roundaboutSignalBefore = 15`; signals gain optional `from` / `to` (metres along the route); `blinkerAt(signals, s)` honours them.

- [ ] **Step 1: failing tests.** Add `ROUNDABOUT` route tests:

```js
const roundaboutRoute = (from, to) => {
  const g = buildGraph(ROUNDABOUT);
  return findRoute(g, snapToGraph(g, ...from, 5), [snapToGraph(g, ...to, 5)]);
};

test('routeSignals_RouteThroughRoundabout_BlinksOnlyAtTheExit', () => {
  const r = roundaboutRoute([-112, 0], [0, 112]);
  const sigs = routeSignals(r);
  assert.equal(sigs.length, 1);
  assert.ok(Math.abs(sigs[0].s - (100 + 12 * Math.PI / 2)) < 2, 'the signal sits at the exit point');
  assert.equal(blinkerAt(sigs, 90), null, 'not before the entry');
  assert.equal(blinkerAt(sigs, 100), null, 'not at the entry');
  assert.ok(blinkerAt(sigs, sigs[0].s - 5));
  assert.equal(blinkerAt(sigs, sigs[0].s + 40), null);
});

test('routeSignals_RoundaboutExit_SideFollowsTheRingDirection', () => {
  const cw = routeSignals(roundaboutRoute([-112, 0], [0, 112]))[0].side;
  const ccw = routeSignals(roundaboutRoute([-112, 0], [0, -112]))[0].side;
  assert.notEqual(cw, ccw);   // opposite ways round the ring, opposite exit side
});

test('routeSignals_RouteEndingInsideTheRing_HasNoSignal', () => {
  assert.deepEqual(routeSignals(roundaboutRoute([-112, 0], [0, 12])), []);
});
```

(If the second assertion's two routes both go the same way round with the fixture, change the destination so one route takes the short way clockwise and the other counter-clockwise; check the sign with `turnAt` on the ring run.)

- [ ] **Step 2:** `node --test prototype/tests/route.test.mjs` -> FAIL.
- [ ] **Step 3:** Implement. Add `roundaboutSignalBefore: 15` to `AUTO`. In `routeSignals`: first build the ring runs from `route.road` and `route.cum` (maximal consecutive segments with `isRoundabout(route.road[i])`, giving `sIn`, `sOut`, and the summed heading change from `turnAt`-style angles over the run). For each joint skip it when `j.s` lies in `[sIn - 0.5, sOut + 0.5]` of any run; for each run with `sIn > 0` and `sOut < route.len - 0.5` push `{ s: sOut, side: total > 0 ? 'right' : 'left', from: sOut - AUTO.roundaboutSignalBefore, to: sOut + AUTO.signalAfter }`. Return signals sorted by `s`. In `blinkerAt` use `sg.from ?? sg.s - AUTO.signalBefore` and `sg.to ?? sg.s + AUTO.signalAfter`.
- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` -> PASS (existing junction-signal tests unchanged). Commit `fix(autopilot): blink when leaving a roundabout, not entering (#231)`.

### Task 3: Real-world check (Playwright)

**Files:** Modify `prototype/tests/test_autopilot.py`, `prototype/index.html` (only the `window.__mm.auto = ` hook, anchor that string, if `signals` there is only a count).

- [ ] **Step 1: failing test.** `test_autopilot_blinks_leaving_a_roundabout_not_entering` (marked `@needs_world`, copy the `open_page` and drive-to pattern of `test_autopilot_drives_to_a_landmark_signals_and_stops`): start the autopilot to a destination whose route crosses a mapped roundabout (e.g. from the start towards a street beyond the roundabout at (3908, 4647), way 57850117; pick the destination with a quick node probe of `findRoute` over `data/world_hochrhein.json` that yields a route crossing it, and hard-code that destination name). Assert from `window.__mm.auto()` (extend it to list `{ s, side, from, to }` if it only holds a count) that no signal of the route has `from` less than the ring's entry `s`, and with `__mm.autoSim` that the blinker was set within the exit window.
- [ ] **Step 2:** run the pytest command -> FAIL.
- [ ] **Step 3:** Expose the signal list in the `__mm.auto` hook if needed.
- [ ] **Step 4:** pytest command -> PASS; `node --test prototype/tests/*.test.mjs` -> PASS.
- [ ] **Step 5:** CHANGELOG entry: "The **autopilot** now blinks when it **leaves a roundabout**, not when it drives in; going round the ring it stays dark." Commit `docs(changelog): roundabout blinker (#231)`.
