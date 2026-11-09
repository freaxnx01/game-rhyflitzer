# PostAuto line 143 alongside line 133 (#767)

## Goal

PostAuto **line 143 Stein-Säckingen – Sisseln – Kaisten – Laufenburg** runs in the game by the real weekday timetable, next to line 133 (#500). Inside the map it serves Stein-Säckingen Bahnhof … Sisseln DSM like 133, plus **Sisseln Unterdorf** and **Sisseln Breitenacher**, which have no bus today. East of Breitenacher it **leaves the map at the east edge** (and enters there in the other direction), using the cut handling #682 already built (`cut`, `fromOutside`/`toOutside`, `PA.edgeSpeed`). Displays (#713), map markers (#711), the F3 list (#707) and the stop signs (#712) show the line number per bus and per stop.

Lands **after #763** (Umlauf at the terminus). This issue does not implement the Umlauf; it adapts one rule of it so that 143's data does not break #763's own acceptance check (see A6).

## Today

- `pipeline/anchors.json:48` `"bus": { "lines": ["133"] }`; `world_bus.read` takes every `route=bus` relation whose `ref` is listed (`pipeline/world_bus.py:42-57`), `build` chains, clips (`_clipped`, `:154-164`), places stops (`_stops`, `:198-214`) and emits one `busRoutes` entry **per relation** (`:217-240`).
- `timetable.py` keeps the agency's trips of the world's lines with ≥ 2 in-map calls and assigns each trip to the **first** world route of its line whose stops contain its calls in order (`pipeline/timetable.py:161-166`). It already sets `fromOutside`/`toOutside` (`:231`).
- The game is line-agnostic in its logic: `postauto.js` windows and placement handle `fromOutside`/`toOutside` (`postauto.js:156-189`), `ledText` (`:278`), `busMarks` (`busmarks.js:9`), the F3 row (`postautodebug.js:36`) and the sign rows (`busstop.js:20-24`) all take the line from the data.
- Two places still assume a single, uncut line:
  - `buildBusStops` marks a route's last in-map stop as its end (`last: i === R.stops.length - 1`, `index.html:5847`), so a sign gets no row for a route that only *leaves the map* there.
  - `timetableTex` draws a hard-coded `'133'` in every stop's Fahrplantafel header (`index.html:991`).
- `PA.maxBuses: 8` (`postauto.js:14`).
- #763 (enriched, not merged): `linkTrips` links a terminus arrival to the line's **earliest** next departure from the same stop within `PA.turnMax` (900 s), one predecessor per trip; its Task 3 runs the whole committed timetable and asserts no two buses stand on one terminus at once, and `seen.size <= 4` runs.

### Measured (data probes, 2026-11-08)

OSM extract `pipeline/cache/osm/hochrhein.osm.pbf` (2026-10-10), run through the unchanged `world_bus.read/build` against the committed world roads:

| Relation | Name | In-map length | `cut` | In-map stops |
|---|---|---|---|---|
| 9093371 | Bus 143: Stein-Säckingen → Kaisten → Laufenburg | 8064.7 m | `[false, true]` | 9: Stein-Säckingen Bahnhof … DSM, Sisseln Unterdorf, Breitenacher |
| 11533939 | Bus 143: Stein-Säckingen → Laufenburg | 8096.3 m | `[false, true]` | the same 9 |
| 11533937 | Bus 143: Laufenburg → Kaisten → Stein-Säckingen | 8007.3 m | `[true, false]` | Ritanne (s = 0) + the same 9 reversed |
| 11533938 | Bus 143: Laufenburg → Stein-Säckingen | 8007.3 m | `[true, false]` | Ritanne (s = 0) + the same 9 reversed |

- Each relation is **one piece** inside the map; every in-map member way (70 and 68) is a road of the world file.
- Two relations per direction (via Kaisten village / direct) are **the same line inside the map**: 11533937 and 11533938 are identical (Hausdorff 0.0 m, same stops); 9093371 and 11533939 have the same stops and differ by up to 16.6 m (11533939 starts at another Stein-Säckingen Bahnhof stop node, 31.7 m from 133's terminus point).
- Ritanne (uic 8580562) appears in the Laufenburg→Stein relations at **s = 0**: its stop node 7836985306 lies 10.7 m beyond the map's east edge (x 4787.8 vs 4777.1) and projects onto the clipped line's first point. The other direction's Ritanne node (983964053, x 5037) is already dropped as off-line.
- Shared stops with 133: Stein-Säckingen Bahnhof, Bahnhofstrasse, Rüchligstrasse, Kreuzstrasse, Novartis, Syngenta, DSM. For the kept routes (9093371, 11533937) every shared stop sits at **exactly the same point** (0.0 m) as the same-direction 133 stop, so `stopKey` (`busstop.js:17`) already merges them: one pole, one shelter, both lines' rows. New stop points: Sisseln Unterdorf and Breitenacher, one per direction (20 → 24 points).

GTFS `gtfs_fp2026_20261104.zip`, cut with the unchanged `timetable.cut` for `--date 2026-11-10` (Tuesday) on the two kept routes:

- Line 143: **83 weekday trips** — 42 on 11533937 (41 Laufenburg → Stein-Säckingen, `fromOutside`, 9 calls; 1 short trip 12:07 Breitenacher → Sisseln Unterdorf), 41 on 9093371 (40 Stein-Säckingen → Laufenburg, `toOutside`, 9 calls; 1 short trip 08:22 Stein-Säckingen → Sisseln DSM, 7 calls). First call 05:25, last 23:48. Line 133 unchanged: 14 trips. 0 unmatched. The Lauterbrunnen "143" (96-987-j26-1) has no call at a world stop and drops out by the existing ≥ 2 in-map calls rule. Matches #682's earlier count (83, 84 on Friday).
- `block_id` is empty for 470 of 551 trips of 96-155-5 — the feed does not say which bus runs which trip.
- **Buses at once** (trip windows as `tripWindow` computes them, edge speed 12 m/s): line 143 at most **3**, both lines together at most **4**; also with #763's Umlauf.
- Stands at shared stops: **0** overlaps between a 133 and a 143 bus at the same stop point, **0** same-direction departures of the two lines within 120 s at any shared stop; 0 cross-line overlaps at Stein-Säckingen Bahnhof with or without Umlauf.
- Stein-Säckingen turnarounds of 143 (arrival → next departure): 0, 240, 540, 840 s. With #763's rule as planned (earliest departure, arrivals in order) 22 links and **one overlap**: the 06:08 arrival takes the 06:22 departure and waits; the 06:18 arrival finds no free departure within 15 min (06:36 is 18 min) and stands its 60 s layover next to it, 06:18–06:19. With the refinement of A6, 22 links and 0 overlaps on both lines (133 keeps its 6 links).

## Design

### 1. Pipeline (`world_bus.py`, `anchors.json`)

- `anchors.json`: `"bus": { "lines": ["133", "143"] }`.
- **Stops beyond the map.** `_stops` drops a stop whose OSM node lies outside the clip (`stats["stop-outside"]`) without marking its uic as seen, so an in-map platform of the same uic still counts. Ritanne disappears from both directions; line 133 is untouched (all its stops lie inside, #682 *Measured*).
- **One route per in-map variant.** After building, `build` drops an entry whose `line` and stop-uic sequence equal an earlier entry's (`stats["duplicate-variant"]`). Routes are sorted by relation id (`_routes`, `:57`), so the lowest id is kept — the same route `timetable._route_of` picks for those trips. Line 143 keeps **9093371** and **11533937**; 133 keeps both of its routes.
- `timetable.py` is unchanged.

### 2. Game

- `busstop.js` gets two pure helpers:
  - `stopEnds(i, n, cut)` — the last stop ends the route only when the route ends inside the map (`!cut[1]`); `buildBusStops` uses it for `last`. Breitenacher's sign then shows "143 → Laufenburg, Bahnhof" as well as "143 → Stein-Säckingen, Bahnhof".
  - `sheetLines(rows)` — the stop's line numbers, once each, sorted, space-separated ("133 143"); `busStop` passes it to `timetableTex(label)`, which draws it instead of `'133'`.
- Nothing else changes in `postauto.js` for 143: windows, placement, edge entry/exit, displays, markers and F3 rows already read the line and the cut flags from the data. `PA.maxBuses` stays 8.

### 3. #763 adaptation (after #763 is merged)

- `linkTrips`: a bus does **not** take a departure when another bus of its line arrives at that stop after it and before that departure — the later bus takes it. In code: skip the link `a → b` if some trip `t` of the same line ends (`!t.toOutside`) at the same uic with `lastArr(a) < lastArr(t) < firstDep(b)`. The rest of #763's rule (same line, same uic, `!fromOutside`, `!toOutside`, within `turnMax`, earliest departure, one predecessor) stays.
- #763's timetable-wide test: `standingAtTerminus` counts a bus only at a **real** terminus (`k === 0 && !trip.fromOutside`, or `k === last && !trip.toOutside`) — Breitenacher is the first/last *in-map* call of 143 but a through stop; and the `seen.size <= 4` bound applies to line 133's runs.

### 4. Data and tests

- Data rebuild (`data/world_hochrhein.json`, `data/timetable_hochrhein.json`) needs the local caches; the maintainer runs it (#682 A13 rule).
- Data-dependent assertions branch on whether the committed data has line 143, so the code PR is green on today's data and again after the data commit.
- Playwright: existing Postauto tests become line-agnostic (they pick `trips[0]`, which becomes a 143 trip after the rebuild); one new targeted file `tests/test_postauto_143.py` checks a 143 bus (display, F3 row, full-map label) and skips without 143 data.

## Assumptions

- **A0a** [confirmed] "Linie 143 einführen" — the maintainer wants line 143 in the game.
- **A0b** [confirmed] "Kaisten and Laufenburg lie outside the map (DEFAULT_BBOX east edge 8.030): the line drives in/out at the map edge like the pipeline's existing cut handling." Measured: `cut` `[false, true]` / `[true, false]`, `fromOutside`/`toOutside` set on 81 of 83 trips.
- **A0c** [confirmed] "Lands after #763 ('the arriving bus runs the next trip' at the terminus, decided as Umlauf)": landing order #763 → #767; this issue does not implement the Umlauf and must not conflict with it (A6, A7).
- **A0d** [confirmed] "Only GTFS route_id 96-155-5-j26-1 (agency 801); the other '143' (96-987-j26-1, Lauterbrunnen) is excluded." No code needed: the Lauterbrunnen trips have no call at a world stop and drop out by the ≥ 2 in-map calls rule (`pipeline/timetable.py:221-224`); the golden test pins 83 trips.
- **A1** [high] Line 143 is selected by `ref` in `anchors.json` like 133, and `timetable.py` stays unchanged. Rejected: GTFS route ids or relation ids in the anchors (#682 A4: the route id carries the timetable year).
- **A2** [high] Of several OSM relations of one line with the same in-map stop sequence, only the lowest relation id is kept (9093371, 11533937). Rejected: keeping all four — `timetable._route_of` (`pipeline/timetable.py:161-166`) assigns every trip to the first one anyway, so two routes would run no bus but still draw a second Stein-Säckingen stop 31.7 m from the real one and a second line on the map; rejected: a relation-id list in `anchors.json` (A1).
- **A3** [high] A stop whose OSM node lies outside the map is dropped. Rejected: keeping Ritanne at s = 0 — its sign would stand at the map edge about 50 m from the real stop and every entering bus would stop the moment it appears (`placeTrip` places a `fromOutside` bus driving towards `calls[0]`, `postauto.js:180`).
- **A4** [high] A cut route's last in-map stop is not its end for the sign rows (`stopEnds`). Rejected: today's `i === n - 1` (`index.html:5847`), which drops "143 → Laufenburg, Bahnhof" from Breitenacher's sign although the bus departs from there.
- **A5** [med] The Fahrplantafel header shows the stop's own lines ("133", "143" or "133 143") instead of the hard-coded "133" (`index.html:991`). Rejected: one sheet per line (more meshes and texture work for a decorative sheet with no real times).
- **A6** [med] #763's link rule gets one more condition: a bus does not take a departure when another bus of its line arrives at that stop in between; the later bus takes it. This changes #763's `linkTrips_TwoCandidates…` expectation (a1 1000 / a2 1100 / b1 1250 / b2 1450: now only a2 → b1). Rejected: leaving the rule — with 143's data its own acceptance check ("no two buses on one terminus stand") fails at Stein-Säckingen 06:18–06:19 (*Measured*); rejected: "latest arrival takes each departure" (LIFO), which in that same fixture has a1 wait 1000–1450 while a2 waits 1100–1250 on the same stand. The feed's `block_id` is mostly empty, so the real vehicle schedule cannot decide it.
- **A7** [high] #763's timetable-wide test counts only real termini and bounds the runs of line 133. Rejected: keeping `seen.size <= 4` over all lines (143 alone makes about 60 runs a day) and counting Breitenacher, where a 143 bus only passes through.
- **A8** [high] `PA.maxBuses` stays 8: at most 3 buses of 143 and 4 of both lines at once (*Measured*). Rejected: raising it, or a per-line cap.
- **A9** [high] No bus-to-bus rule: the timetable never puts a 133 and a 143 bus on the same stand at once and never sends them within 120 s of each other in the same direction (*Measured*), as #500 A7 assumed for one line.
- **A10** [med] The two short trips (08:22 Stein-Säckingen → Sisseln DSM, 12:07 Breitenacher → Sisseln Unterdorf) run as the timetable says: they end inside the map, stand 60 s and vanish, like every 133 terminus (#500 A5). Rejected: filtering them out of the cut (`timetable.py` would need a special case for one line).
- **A11** [high] The maintainer rebuilds the data locally: the CI runner has neither the extract, the swisstopo/LWB caches nor the GTFS zip. Same rule as #682 A13 [confirmed there: "Agent liefert Code, ich baue lokal"].
- **A12** [med] Data-dependent assertions branch on "line 143 present in the committed data" (stop points 20 → 24, timetable counts, golden route ids), so the code PR stays green before the data commit. Rejected: changing the literals now (red CI until the maintainer's data commit).
- **A13** [med] The existing Playwright Postauto tests become line-agnostic (display line equals the bus's line; marker lines are lines of the timetable; full-map labels equal the marker's line) rather than pinned to a 133 trip; only the new `tests/test_postauto_143.py` is run (targeted-test rule). Rejected: running every Postauto Playwright file (~ the 2 h suite rule) and pinning every test to 133 (a 143 bus can be on screen at the same time).
- **A14** [high] No Playwright and no dry run during enrichment; the numbers above come from data probes with the unchanged pipeline code.

## Consequences

- Sisseln Unterdorf and Breitenacher get buses; about every 30 min per direction from 05:25 to 23:48 (133 ends at 18:08). The fleet is busy all evening now.
- Up to 4 Postautos at once instead of 2; a few more draw calls and engine voices (`pickVoices` already limits them).
- A 143 bus appears or vanishes at the east map edge at 12 m/s; a player there sees it pop in or out.
- The full map draws four route lines; the two lines overlap between Stein-Säckingen and Sisseln DSM.
- Signs at the shared stops list both lines; Stein-Säckingen Bahnhof shows "133 → Frick, Bahnhof" and "143 → Laufenburg, Bahnhof".
- The four new stop points (Unterdorf, Breitenacher) are laid out by `stopLayout` like the rest; whether each gets a shelter is only known after the data rebuild (the world-data test checks it).
- `data/world_hochrhein.json` grows by about 15 KB (two routes of ~320 points, 18 stops), `data/timetable_hochrhein.json` from 14 to 97 trips (about +20 KB).
- The rebuild also picks up every pipeline change merged since the last world build; the golden tests show such drift.
- #763's two-candidate unit test changes its expected links (A6).
- Discovery, not acted on: the hand-traced fallback world puts a stop "Breitenacher" with two **133** rows (`index.html:2442`); the real 133 does not serve Breitenacher (143 does).

## Dependencies

**Lands after #763.** Task 4 of the plan edits #763's merged `linkTrips` and its timetable-wide test; if `linkTrips` is not in `postauto.js` on `main`, that task stops and the PR says so. No dependency on other open issues.

## Acceptance Criteria

- [ ] `anchors.json` lists `["133", "143"]`; `world_bus.build` drops stops whose node lies outside the clip (`stop-outside`) and later relations of a line with the same stop-uic sequence (`duplicate-variant`), with unit tests.
- [ ] Golden (skips without the extract): line 143 gives exactly relations 9093371 (`cut` `[false, true]`) and 11533937 (`[true, false]`), one piece each, 9 stops each from 8572748 to 8572416 (reverse for 11533937), no 8580562, length 7–9 km; line 133 unchanged (11533940, 11533941, 11 stops each).
- [ ] With the rebuilt data: 83 trips of line 143 (42 on 11533937, 41 on 9093371), every call's uic among its route's stops, nondecreasing times; line 133 still 14 trips.
- [ ] Each stop sign lists every line and direction that departs there, also for a route that leaves the map after that stop; the Fahrplantafel header shows the stop's lines.
- [ ] Shared stops have one pole and shelter (24 stop points with 143 data, 20 without), every point laid out clear of the standing bus and the road.
- [ ] After #763: a bus never takes a departure across another same-line arrival at that stop; #763's timetable-wide check counts real termini only and passes on the rebuilt data in real time and time-lapse.
- [ ] In the game during a 143 trip: a 143 bus drives in from (or out to) the east edge, its display shows "143" and its destination, the F3 row starts with "143 →", the full map labels it "143".
- [ ] `cd pipeline && ./.venv/bin/python -m pytest -q`, `node --test tests/`, and `tests/test_postauto_143.py` pass; `CHANGELOG.md` has a player-facing entry; `docs/11-pipeline-osm.md` documents the two new rules and line 143.
