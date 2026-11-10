# Pin "two PostAuto lines at the same time" (#796) — plan

Spec: `docs/superpowers/specs/2026-11-09-postauto-one-line-at-a-time-design.md`. The measurement shows the game follows the timetable; no production code changes. This plan only adds a characterization test on the real data (it passes from the start: it pins a verified fact, it does not drive a fix). No CHANGELOG entry: nothing player-facing changes.

**Files:** modify `tests/postauto.test.mjs` (append; it already imports `buildGraph`, `busRoute`, `syncFleet`, `fs`).

## Task 1 — real-data test

- [ ] Append to `tests/postauto.test.mjs`:

```js
// #796: the weekday timetable has trips of two lines inside the map at the same time (133 runs in the peaks, 143 all day)
const REAL_WORLD = new URL('../data/world_hochrhein.json', import.meta.url);
const REAL_TT = new URL('../data/timetable_hochrhein.json', import.meta.url);
const linesAt = (routes, trips, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return [...new Set(syncFleet([], trips, routes, h * 3600 + m * 60).filter((b) => b.phase !== 'done').map((b) => b.trip.line))].sort();
};
test('realData_PeakHour_TwoLinesOnTheRoadAtOnce', { skip: !fs.existsSync(REAL_WORLD) || !fs.existsSync(REAL_TT) }, () => {
  const L = JSON.parse(fs.readFileSync(REAL_WORLD, 'utf8')), tt = JSON.parse(fs.readFileSync(REAL_TT, 'utf8'));
  const G = buildGraph(L.roads), routes = new Map(L.busRoutes.map((br) => [br.id, busRoute(br, L.roads, G)]));
  assert.deepEqual(linesAt(routes, tt.trips, '07:00'), ['133', '143']);
  assert.deepEqual(linesAt(routes, tt.trips, '16:30'), ['133', '143']);
  assert.deepEqual(linesAt(routes, tt.trips, '12:00'), ['143']);   // 133 has no trip in the map between 09:18 and 14:43
});
```

- [ ] Run `node --test tests/postauto.test.mjs` (whole file, it is pure node, seconds) and expect all green. If the 07:00 case ever fails, `fleetRuns`/`placeRun`/`maxBuses` dropped a line: debug with `systematic-debugging`, do not edit the expectation.
- [ ] Commit `test(postauto): pin two lines on the road at once (#796)`; PR to `main` per the repo flow.
