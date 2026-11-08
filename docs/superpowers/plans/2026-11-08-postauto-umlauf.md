# Postauto Umlauf at the terminus (#763): implementation plan

**Goal:** The bus that arrives at a terminus runs the same line's next trip from there (within 15 min): it turns, the
display switches, no second bus is placed on the same stand. Unlinked trips behave as today.

**Spec:** [docs/superpowers/specs/2026-11-08-postauto-umlauf-design.md](../specs/2026-11-08-postauto-umlauf-design.md)

**Global constraints:**
- Buildless; `postauto.js` stays pure (no DOM, no three.js). Do not touch `data/`, `pipeline/`, `paclock.js`, `busdisplay.js`.
- No change for unlinked trips: `placeTrip(trip, route, now, cfg)` without a window keeps today's behaviour, every
  existing test in `tests/postauto.test.mjs` stays green unmodified.
- Only same-line trips chain (#767 reuses this for line 143): compare `trip.line`, no line list.
- Tests: `node --test tests/postauto.test.mjs tests/paclock.test.mjs`, then the full `node --test tests/`. Playwright
  **only** `python3 -m pytest tests/test_postauto_umlauf.py -x` once, in the foreground with a generous timeout. Never
  `run_in_background`, not the whole suite.
- CHANGELOG entry under `[Unreleased]` → `### Fixed`, player voice, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.
- Commit and push after each task.

### Task 1: linking and runs (pure)

**Files:** `postauto.js`, `tests/postauto.test.mjs`

**Interfaces:**
- `PA.turnMax = 900` (add to the `PA` object, next to `layover`).
- `linkTrips(trips, cfg = PA) -> Map<tripKey, trip>`
- `fleetRuns(trips, routes, cfg = PA) -> [{ key, legs: [{ trip, route, calls, win }], win: { from, to } }]`

- [ ] **Write the failing tests** (append to `tests/postauto.test.mjs`; the fixture uses the file's existing `R`, `ROUTES`):

```js
const leg = (line, from, to, arr, dep, route = 1) => ({ line, route, to: 'Z' + to, fromOutside: false, toOutside: false,
  calls: [[from, dep - 100, dep], ['2', dep + 100, dep + 100], [to, arr, arr]] });

test('linkTrips_SameLineSameStopWithinLimit_Links', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1240, 1300);
  assert.equal(linkTrips([a, b]).get(tripKey(a)), b);
});
test('linkTrips_OtherLine_DoesNotLink', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('143', '3', '1', 1240, 1300);
  assert.equal(linkTrips([a, b]).size, 0);
});
test('linkTrips_BeyondTurnMaxOrWrongStopOrOutside_DoesNotLink', () => {
  const a = leg('133', '1', '3', 1000, 800);
  assert.equal(linkTrips([a, leg('133', '3', '1', 1000 + PA.turnMax + 1, 1900)]).size, 0);
  assert.equal(linkTrips([a, leg('133', '9', '1', 1240, 1300)]).size, 0);
  assert.equal(linkTrips([a, { ...leg('133', '3', '1', 1240, 1300), fromOutside: true }]).size, 0);
  assert.equal(linkTrips([{ ...a, toOutside: true }, leg('133', '3', '1', 1240, 1300)]).size, 0);
  assert.equal(linkTrips([a, leg('133', '3', '1', 990, 990)]).size, 0);   // departs before the arrival
});
test('linkTrips_TwoCandidates_EarliestDepartureWinsAndOnePredecessorEach', () => {
  const a1 = leg('133', '1', '3', 1000, 800), a2 = leg('133', '1', '3', 1100, 900);
  const b1 = leg('133', '3', '1', 1200, 1250), b2 = leg('133', '3', '1', 1400, 1450);
  const m = linkTrips([a1, a2, b1, b2]);
  assert.equal(m.get(tripKey(a1)), b1); assert.equal(m.get(tripKey(a2)), b2);
});
test('fleetRuns_LinkedTrips_OneRunWithContiguousWindowsAtTheArrival', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1240, 1300), c = leg('133', '1', '3', 2000, 1900);
  const runs = fleetRuns([b, a, c], new Map([[1, R]]));
  assert.equal(runs.length, 2);                                   // a -> b chained, c alone
  const run = runs.find((r) => r.key === tripKey(a));
  assert.equal(run.legs.length, 2);
  assert.equal(run.legs[0].win.to, 1000); assert.equal(run.legs[1].win.from, 1000);   // split at the arrival
  assert.equal(run.win.from, run.legs[0].win.from); assert.equal(run.win.to, run.legs[1].win.to);
  assert.deepEqual(fleetRuns([a], new Map([[1, R]]))[0].legs[0].win, tripWindow(a, tripCalls(a, R), R));   // unlinked: as today
  assert.equal(fleetRuns([a, b], new Map()).length, 0);          // unknown route: no run
});
```
(Stops `'1'`, `'2'`, `'3'` exist on `R`, so `tripCalls` resolves.) Import `linkTrips`, `fleetRuns` in the test file's import line. Run: they fail (not exported).

- [ ] **Implement** in `postauto.js` after `tripWindow`:

```js
// ---------- the Umlauf (#763): the bus that arrives at a terminus runs the line's next trip from there ----------
const firstDep = (t) => t.calls[0][2], lastArr = (t) => t.calls[t.calls.length - 1][1];
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
```

`fleetRuns` (memoised in a `WeakMap` keyed by `trips`, storing `{ routes, cfg, runs }`, recomputed when `routes` or `cfg` differ):
build `valid = trips` whose route is in `routes` and `tripCalls(...)` is non-null; `links = linkTrips(valid, cfg)`;
`hasPrev = new Set(links.values())` (as tripKeys); for each valid trip not in `hasPrev`, follow `links` to collect the
chain; each leg `{ trip, route, calls, win: tripWindow(trip, calls, route, cfg) }`; then for `i > 0` set
`legs[i].win = { ...legs[i].win, from: lastArr(legs[i-1].trip) }` and for `i < last` set
`legs[i].win = { ...legs[i].win, to: lastArr(legs[i].trip) }`; `run = { key: tripKey(chain[0]), legs, win: { from: legs[0].win.from, to: legs[last].win.to } }`.
A trip never appears in two runs. Re-run tests: green.

- [ ] **Commit** `feat(postauto): link a terminus arrival to the line's next trip (#763)`, push.

### Task 2: the bus drives its run

**Files:** `postauto.js`, `tests/postauto.test.mjs`

**Interfaces:**
- `placeTrip(trip, route, now, cfg = PA, win = null)`: `win ?? tripWindow(...)`; nothing else changes.
- `placeRun(run, now, cfg = PA)`: first leg whose `placeTrip(leg.trip, leg.route, now, cfg, leg.win)` is non-null, then
  `{ ...b, key: run.key, legs: run.legs, leg: i, win: run.win }`; `null` if none.
- `turn(b, t, cfg)` (internal), `hasNext = (b) => !!b.legs && b.leg < b.legs.length - 1`.
- `syncFleet` iterates `fleetRuns(trips, routes, cfg)`; `have` holds run keys; the keep-rule uses `b.win` (now the run window).

- [ ] **Write the failing tests** (same `leg` helper; routes need two stops each: use `R` for both legs, trip a stops 1→3 and b stops 3→1 reversed on a second route `R2` built with `busRoute({ id: 2, line: '133', pts: BR.pts, stops: [stop('3', 900), stop('2', 400), stop('1', 100)] }, ROADS, G)` kept as `ROUTES2 = new Map([[1, R], [2, R2]])`, trip b uses `route: 2`):

```js
test('stepBus_ArrivalAtLinkedTerminus_TurnsIntoTheNextTripAndKeepsTheKey', () => {
  const a = leg('133', '1', '3', 1000, 800), b = { ...leg('133', '3', '1', 1240, 1300, 2) };
  const [fleet] = syncFleet([], [a, b], ROUTES2, 900);
  const key = fleet.key; assert.equal(key, tripKey(a));
  for (let now = 900; fleet.trip === a && now < 1300; now += 0.5) stepBus(fleet, now, 0.5, null);
  assert.equal(fleet.key, key); assert.equal(fleet.trip, b); assert.equal(fleet.route, R2);
  assert.equal(fleet.phase, 'stand'); assert.equal(fleet.k, 0); assert.equal(fleet.s, R2.stopS.get('3'));
  assert.equal(ledText(fleet.trip).dest, 'Z1');
  assert.ok(fleet.until >= 1300);
  assert.equal(syncFleet([fleet], [a, b], ROUTES2, 1100).length, 1);   // no second bus for b
});
test('stepBus_LateArrivalAfterNextDeparture_StandsMinDwellThenLeavesLate', () => { /* arrive at 1310, b.dep 1300: until === 1310 + PA.minDwell */ });
test('stepBus_LinkedTurn_ThenDrivesTheNextRouteToItsEnd', () => { /* after turn, step on: phase 'drive' at 1300, k 1, ends 'done' after layover */ });
test('placeRun_ClockJump_PlacesTheLegForNow', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1240, 1300, 2);
  const run = fleetRuns([a, b], ROUTES2)[0];
  assert.equal(placeRun(run, 900).trip, a);                       // driving leg a
  const afterA = placeRun(run, 1100);                             // arrival passed: standing at b's first stop, b's destination
  assert.equal(afterA.trip, b); assert.equal(afterA.phase, 'stand'); assert.equal(afterA.k, 0);
  assert.equal(placeRun(run, 1320).trip, b);                      // driving b
  assert.equal(placeRun(run, 1240 + 60 + 10_000), null);          // past the window
});
test('syncFleet_ShortTurnaround_NeverTwoBusesOnTheSameStand', () => {   // fails on main: 60 s gap, layover 60, spawnBefore 90
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1060, 1060, 2);
  for (let now = 700; now < 1400; now += 5) {
    const fleet = syncFleet([], [a, b], ROUTES2, now).filter((x) => x.phase === 'stand' && x.k === 0 && x.calls[0].uic === '3');
    assert.ok(fleet.length <= 1, `at ${now}`);
  }
});
test('syncFleet_UnlinkedTrip_BehavesAsBefore', () => { /* the existing syncFleet test already covers it; assert key === tripKey(TRIP) and win equals tripWindow */ });
```
Fill the three stubbed bodies fully (they are listed so none is forgotten). Run: fail.

- [ ] **Implement:**

```js
function hasNext(b) { return !!b.legs && b.leg < b.legs.length - 1; }

// the Umlauf (#763): the bus turns while standing -- the next leg's trip, route and calls, re-posed at its first stop
function turn(b, t, cfg) {
  const next = b.legs[++b.leg];
  Object.assign(b, { trip: next.trip, route: next.route, calls: next.calls, k: 0, s: next.calls[0].s, v: 0, phase: 'stand',
    until: Math.max(next.calls[0].dep, t + cfg.minDwell), leftAt: -Infinity });
}
```
In `arrive`, first line after computing `last`: `if (last && hasNext(b)) { turn(b, t, cfg); return; }`. `standStep` is unchanged
(a turned bus has `k = 0`, so it departs through the normal branch). `placeTrip` and `syncFleet` per the interfaces above.
Existing tests stay green; new ones pass.

- [ ] **Commit** `feat(postauto): the arriving bus runs the next trip from the terminus (#763)`, push.

### Task 3: timetable-wide node check

**Files:** `tests/postauto.test.mjs` (or new `tests/postauto-umlauf.test.mjs`), no production code.

- [ ] **Write the test** (it is the guard for the whole timetable; run it also against `main`'s `syncFleet` by temporarily passing
  `{ ...PA, turnMax: -1 }`, which disables linking: it must then fail on at least one pair, proving the check bites):

```js
import fs from 'node:fs';
const TT = JSON.parse(fs.readFileSync(new URL('../data/timetable_hochrhein.json', import.meta.url), 'utf8'));

// one straight synthetic route per route id: its stops (uic order from the trips) every 400 m
function synthRoutes(trips) {
  const out = new Map();
  for (const t of trips) {
    if (out.has(t.route)) continue;
    const uics = t.calls.map((c) => String(c[0])), len = (uics.length + 1) * 400;
    const rd = road([[0, 0], [len, 0]]);
    out.set(t.route, busRoute({ id: t.route, line: t.line, pts: [[0, 0], [len, 0]], stops: uics.map((u, i) => stop(u, 200 + i * 400)) }, [rd], buildGraph([rd])));
  }
  return out;
}
function standingAtTerminus(fleet) {
  const by = new Map();
  for (const b of fleet) if (b.phase === 'stand' && (b.k === 0 || b.k === b.calls.length - 1)) by.set(b.calls[b.k].uic, (by.get(b.calls[b.k].uic) ?? 0) + 1);
  return [...by].filter(([, n]) => n > 1);
}
for (const [name, dt, factor] of [['real time', 1, 1], ['time-lapse 60x', 1, 60]]) {
  test(`timetable_NoTwoBusesStandOnTheSameTerminusAtOnce_${name}`, () => {
    const routes = synthRoutes(TT.trips); let fleet = [];
    const end = 18.5 * 3600, seen = new Set();
    for (let now = 5.5 * 3600; now < end; now += dt * factor) {
      fleet = syncFleet(fleet, TT.trips, routes, now);
      const { n, h } = fleetSteps(dt * factor);
      for (const b of fleet) for (let i = 0; i < n; i++) stepBus(b, now + (i + 1) * h, h, null);
      assert.deepEqual(standingAtTerminus(fleet), [], `at ${now}`);
      for (const b of fleet) seen.add(b.key);
    }
    assert.ok(seen.size <= 4);   // 14 trips make a handful of runs, not 14 buses
  });
}
```
(`stop(uic, s)` and `road` are the file's existing helpers; `busRoute` needs the route's `stops` x/z: `stop()` puts them at the kerb.)
`seen.size` bound: the real data gives 2-3 runs; keep `<= 4`. Run: green; with `turnMax: -1` it must fail.

- [ ] **Commit** `test(postauto): no two buses share a terminus stand across the timetable (#763)`, push.

### Task 4: display repaint, debug hook, Playwright, CHANGELOG

**Files:** `index.html`, `tests/test_postauto_umlauf.py` (new), `CHANGELOG.md`

- [ ] **Repaint in place.** In `buildPostautoMesh` (`index.html:4062`) keep the cloned display materials:
  `g.userData.displayMats = []` and have the painting loop push to it, or add a function
  `repaintBusDisplay(g, text)` that traverses `g` for the same `o.material?.userData?.overGlass` meshes (their material
  clone carries the flag), does `m.map?.dispose(); m.map = m.emissiveMap = displayTexture(text);` and sets
  `g.userData.led = text`. Own materials only: never touch `SHARED_CAR_MATS` (check `!SHARED_CAR_MATS.has(m)` first).
  In `drawPostauto` (`index.html:4147`), after the mesh is found or built:
  `const text = ledText(b.trip); if (g.userData.led.dest !== text.dest || g.userData.led.line !== text.line) repaintBusDisplay(g, text);`.
  `disposePostautoMesh` already frees the current map. No other `index.html` change: F3 (`:5666`), markers (`:5587`),
  engine voices and follow read `key`, `b.trip`, `b.k`, `b.calls` live.
- [ ] **Debug hook.** In `window.__mm.postauto().buses` (`index.html:4650`) add `leg: b.leg ?? 0` and `legs: b.legs?.length ?? 1`.
- [ ] **Playwright** `tests/test_postauto_umlauf.py` (copy `open_at` and the `needs_data` mark from `tests/test_postauto_debug.py`;
  foreground, one test): open `?patime=08:15&pasp=10`; wait until `postauto().buses` has a bus with `to == "Frick, Bahnhof"`,
  remember its `key`; then `wait_for_function` (timeout 240000) that the bus with that `key` now has
  `to == "Stein-Säckingen, Bahnhof"`, and `led.dest` equals `to` for it; sample 20 times over the turn: no two buses with
  `phase == "stand"` closer than 8 m (`x`, `z`); `errors` empty. (The Frick arrival is 08:18, the departure 08:22; at 10x the turn
  is ~20 s of real time after the load.) Run **once**: `python3 -m pytest tests/test_postauto_umlauf.py -x`.
- [ ] **CHANGELOG** under `[Unreleased]` → `### Fixed`, player voice: „An den **Endhaltestellen** stehen die **Postautos** nicht mehr
  ineinander: der Bus, der in **Frick** oder **Stein-Säckingen** ankommt, **wendet** und fährt als nächste Fahrt zurück, die
  **Zielanzeige** wechselt dabei." (English like the neighbouring entries if the file stays English: follow the surrounding style.)
- [ ] **Run** `node --test tests/` (all green) and the one Playwright file. **Commit** `fix(postauto): the arriving bus runs the next trip instead of a second bus standing inside it (#763)`, push.

**Verify (acceptance):** no two buses on one terminus stand (Task 3, both clocks); the arriving bus keeps its `key` and the
destination flips (Tasks 2 and 4); jumps place the right leg (`placeRun_ClockJump`); F3 rows and markers key on the unchanged `key`.
