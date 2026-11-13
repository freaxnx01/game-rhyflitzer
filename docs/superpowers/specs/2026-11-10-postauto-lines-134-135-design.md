# PostAuto lines 134 and 135 next to 133 and 143 (#808)

## Goal

The game runs **four** PostAuto lines by the real weekday timetable: **133, 134, 135, 143**. Midday more buses are on the road at once (#796). Line **134** Frick – Oeschgen – Eiken – Münchwilen – Stein-Säckingen runs completely inside the map. Line **135** Frick – Aarau / Laufenburg lives in the map only between Frick Bahnhof and the east map edge (1.6 to 2.2 km), where it enters and leaves, cut like line 143 towards Kaisten (#767, PR#784).

Follows #767 closely. The decisive difference: almost everything is already data-driven, so **no game code changes**; the work is one pipeline rule, the anchors, line-agnostic tests, docs and the maintainer's data rebuild.

## Today

- `pipeline/anchors.json:49` `"bus": { "lines": ["133", "143"] }`; `world_bus.read` takes every `route=bus` relation with a listed `ref`; `build` chains, clips, drops stops beyond the map (`stop-outside`) and keeps one route per line and in-map stop sequence (`_unique_variants`, `pipeline/world_bus.py:220-232`, #767). `timetable.py` assigns each trip to the first world route of its line whose stops contain its calls in order (`_route_of`, `pipeline/timetable.py:161-166`) and drops trips with fewer than 2 in-map calls.
- The game reads line, cut flags and destinations from the data: sign rows are collected **per stop uic** (`index.html:6180-6191`, `stopRows`/`stopEnds`), the Fahrplantafel header comes from `sheetLines`, LED, map marks and the F3 list take the line from the trip. A stop point with no room for a shelter already degrades to a sign alone (`stopLayout` returns `shelter: null`, `busstop.js:78`; `index.html:2104`).
- `PA.maxBuses: 8` (`postauto.js:14`). #763's timetable-wide test counts standing buses per **stop uic** at real termini (`tests/postauto.test.mjs:385`).

### Measured (data probes, 2026-11-10; unchanged `world_bus.read/build` on `pipeline/cache/osm/hochrhein.osm.pbf` with the committed world roads; unchanged `timetable.cut` on `gtfs_fp2026_20261104.zip`, Tuesday 2026-11-10)

| Relation | Line, direction | In-map length | `cut` | In-map stops |
|---|---|---|---|---|
| 9093370 | 134 Stein-Säckingen → Frick | 8765.7 m | `[false, false]` | 13: Stein-Säckingen Bahnhof … Frick Unterdorf, Frick Bahnhof |
| 11530930 | 134 Frick → Stein-Säckingen | 8703.8 m | `[false, false]` | the same 13 reversed |
| 367215 | 135 Frick → Aarau | 1704.7 m | `[false, true]` | 3: Frick Bahnhof, Unterdorf, Oberdorf |
| 10888047 | 135 Frick → Laufenburg | 2045.6 m | `[false, true]` | 3: Frick Bahnhof, Unterdorf, Neumatt |
| 20345371 | 135 Frick → Ebnet → Aarau | 2195.0 m | `[false, true]` | 4: Bahnhof, Ebnet, Firma Müller, Oberdorf |
| 10888048 | 135 Aarau → Frick | 1609.9 m | `[true, false]` | 3: Oberdorf, Unterdorf, Bahnhof |
| 10888046 | 135 Laufenburg → Frick | 1962.2 m | `[true, false]` | 3: Neumatt, Unterdorf, Bahnhof |
| 20345372 | 135 Aarau → Ebnet → Frick | 2151.3 m | `[true, false]` | 4: Oberdorf, Firma Müller, Ebnet, Bahnhof |
| 11534399 | 135 Aarau → Frick → Laufenburg | 1274.0 m | `[true, true]` | **1**: Neumatt (only one piece of the through relation) |

- The other 135 relations are the same in-map variants (dropped as `duplicate-variant`, 4 in total over all lines) or lie outside the map (2, Laufenburg – Kaisten).
- **Cut points**: every cut end is at the **east edge x = 4777.1**: 135 towards Aarau at z = 5241.6, towards Laufenburg at z = 3863.5 (143: z = 101.1). The **south edge (z = 5592) is not touched**; 134 is not cut.
- Frick Bahnhof is the common terminus of 133, 134 and 135: **five stop points** within 31 m (5 to 10 m apart, own kerb point per route); Stein-Säckingen Bahnhof gets a second point (134's own OSM node, 15 m from 133/143's).
- Stop points with the four lines: **50** (24 uics); before: 24 points. Layout (`stopLayout`) finds a shelter for 49 (the 134 terminus point at Frick Bahnhof shifts it **9 m** along the kerb, limit 12, the others at most 6); **one fails**: the 134 point at Stein-Säckingen Bahnhof (-1322.9, 1005.5, shared by both 134 routes; pole clear by 5.6 m and 0.96 m from the asphalt, but no shelter spot within ±12 m).
- GTFS (candidate world of the 12 routes): **289 trips** = 133: 14, 143: 83, **134: 55** (28 Frick → Stein-Säckingen, 27 back; 05:19 to 23:39; all 13 calls), **135: 137** (34 Frick → Aarau, 30 Frick → Laufenburg, 4 via Ebnet → Aarau; 33 Aarau → Frick, 31 Laufenburg → Frick, 5 via Ebnet; 04:59 to 00:37; 3 or 4 calls). Unmatched: **10** = 9 through trips Aarau → Frick Bahnhof → Laufenburg (calls Oberdorf, Unterdorf, Bahnhof, Unterdorf, Neumatt: they enter and leave the map, the world keeps one piece per route) and 1 line-134 trip with an extra Frick Ebnet call.
- **Buses at once** (trip windows with #763's runs, edge speed 12 m/s): at most **7** (06:06), 143: 3, 134: 2, 135: 2, 133: 1; 0 s with more than 8 windows open; 181 runs for 289 trips.
- **Stands**: no two buses on the same stop point at once. On **different points of Frick Bahnhof** within 13 m (a bus is 12 m long): 33 overlaps a day, 2130 s in total, longest 300 s, always 135 with 133 or 135 (e.g. 06:19:30: the 135 to Laufenburg departs 06:20, the one to Aarau 06:21, 133 at 06:22). #763's timetable-wide test on this data: **red per stop uic** (Frick Bahnhof, 06:01:57) and red per uic and line (135, 06:19:30), **green per stop point** (real time and 60x).

## Design

### 1. Pipeline

- `anchors.json`: `"bus": { "lines": ["133", "134", "135", "143"] }`.
- **`world_bus.servable(routes, stats)`**: drops a route with fewer than two in-map stops (`stats["too-few-stops"]`), because the timetable needs two in-map calls per trip, so no bus could ever run on it. Today only 11534399 (a 1274 m line on the map without a bus). `osm.build_world` calls it right after `world_bus.build`; `build` and its fixtures stay as they are.
- `timetable.py` and `world_bus.build` are unchanged.

### 2. Game

No change. Signs list per uic every line and direction that leaves there (Frick Bahnhof: 133 → Stein-Säckingen, 134 → Stein-Säckingen, 135 → Aarau, 135 → Laufenburg; the Fahrplantafel header "133 134 135"). The Stein-Säckingen Bahnhof 134 point stands without a shelter (sign and pole only).

### 3. Tests

- #763's timetable-wide test counts standing buses per **stop point** (the world's `uic:x:z` per route and stop) instead of per uic.
- The world-data stop tests derive the point count from the world file, accept a sign without shelter only for the named Stein-Säckingen Bahnhof point (pole still clear), and no longer expect Frick Bahnhof to show only 133.
- Golden pipeline tests (skip without the extract / branch on the line being in the data) pin 134 and 135 route ids, cuts, stops and trip counts per line. One Playwright file with the stepped fake clock checks a 134 and a 135 bus (skips without data).

### 4. Data

The maintainer rebuilds `data/world_hochrhein.json` and `data/timetable_hochrhein.json` locally (last task); the runner has no extract, no LWB/swisstopo caches and no GTFS zip (#767 A11).

## Assumptions

- **A0a** [confirmed] "I want to have this routes: 135, 134, 133, 143" — lines 134 and 135 are added, 133 and 143 stay.
- **A0b** [confirmed] "Routes leaving the map are cut at the map edge, like line 143 towards Kaisten (#767)." Measured: all 135 cut ends lie at the east edge (x = 4777.1), none at the south edge; 134 stays inside.
- **A1** [high] Lines are selected by `ref` in `anchors.json`; `timetable.py` is unchanged. Rejected: relation or GTFS route ids (#682 A4).
- **A2** [high] No game code changes: sign rows are per uic and use `stopEnds`/`sheetLines` (`index.html:6180-6191`), `ledText`, `busMarks` and the F3 row read the trip's line, cut handling exists since #682/#767. Rejected: a per-line special case.
- **A3** [high] The six in-map 135 variants stay, chosen by the existing one-route-per-stop-sequence rule (#767 A2). Rejected: keeping only Aarau and Laufenburg routes (a 135 trip via Ebnet has no other route to run on) and a relation-id list in `anchors.json`.
- **A4** [high] A route with fewer than two in-map stops is dropped by a new `world_bus.servable`, called from `osm.build_world`. Rejected: keeping 11534399 (draws a line on the full map that no bus ever runs on); rejected: the rule inside `build` (three existing `build` fixtures hold one-stop and zero-stop routes on purpose, `pipeline/tests/test_bus.py:96-122`).
- **A5** [med] The 10 unmatched trips stay dropped (9 through trips Aarau – Frick – Laufenburg, 1 line-134 trip with an extra Ebnet call). Rejected: a route that leaves and re-enters the map (`world_bus.build` keeps one piece per route, #682 A9) and a `timetable.py` special case. Consequence: the 9 through buses never appear.
- **A6** [med] Buses on neighbouring points of Frick Bahnhof may overlap for up to 5 min (33 times a day, *Measured*); accepted, the same way the two 133 points 5 m apart were. Rejected: a bus-to-bus rule (#767 A9: none), merging the five points (one point cannot hold three simultaneous buses either), and delaying buses.
- **A7** [med] #763's timetable-wide test counts per stop point (`uic:x:z` from the world file, falling back to the uic), not per uic. Rejected: per uic (red at 06:01:57, three lines end at Frick Bahnhof) and per uic and line (red at 06:19:30: two real 135 buses stand at once, one to Aarau, one to Laufenburg, on different points). The `seen.size <= 4` bound stays on line 133.
- **A8** [med] The 134 point at Stein-Säckingen Bahnhof has no shelter and the 134 point at Frick Bahnhof shifts its shelter 9 m (*Measured*); `stopLayout` already returns sign-and-pole for the first case. The test names both points (shelterless allowed only there, shift bound 9 instead of 6 only there) and still requires every pole clear of buses and asphalt. Rejected: changing the layout limits (#712's rules), merging it into 133/143's point 15 m away (another OSM node on 134's own road line).
- **A9** [med] `PA.maxBuses` stays 8: at most 7 windows at once (*Measured*). One bus of margin; if the real timetable ever exceeds 8 a bus would silently not spawn. Rejected: raising it without a measured need.
- **A10** [high] The maintainer rebuilds the data locally (the runner lacks all caches), same rule as #767 A11 / #682 A13.
- **A11** [med] Data-dependent assertions branch on "line 134 / 135 is in the committed data" and the stop-point count is derived from the world file, so the code PR is green before and after the data commit. Rejected: new hardcoded point counts (50 would break with the next line).
- **A12** [high] No Playwright and no dry run during enrichment; all numbers come from data probes with the unchanged pipeline and the game's own `fleetRuns`/`stopLayout` code on a candidate world.

## Consequences

- Frick turns busy: Frick Bahnhof has five signs and shelters within 31 m, each listing 133, 134 and 135; a 135 bus drives only 1.6 to 2.2 km on the map, entering or leaving at the east edge (it pops in or out there at 12 m/s).
- Up to 7 Postautos at once instead of 4; more draw calls and engine voices (`pickVoices` limits the latter).
- The full map shows twelve route lines instead of four; 134 runs parallel to 133 between Stein-Säckingen and Eiken.
- `data/world_hochrhein.json` grows by about 80 KB (8 routes, ~25 stop points), `data/timetable_hochrhein.json` from 97 to 289 trips (about +45 KB).
- The rebuild also picks up every pipeline change merged since the last world build; golden tests show drift.
- Discovery, not acted on: the world also holds 143's 83 trips' two routes only; the Aarau - Frick - Laufenburg through service shows as 9 missing buses (A5).

## Dependencies

None open: #763 (Umlauf) and #767 (line 143) are on `main`.

## Acceptance Criteria

- [ ] `anchors.json` lists `["133", "134", "135", "143"]`; `world_bus.servable` drops routes with fewer than two in-map stops (`too-few-stops`), with a unit test.
- [ ] Golden (skips without the extract): 134 = relations 9093370 and 11530930, `[false, false]`, 13 stops each; 135 = 367215, 10888047, 20345371 (`[false, true]`, first stop Frick Bahnhof) and 10888046, 10888048, 20345372 (`[true, false]`, last stop Frick Bahnhof); no route with fewer than two stops; 133 and 143 unchanged.
- [ ] With the rebuilt data: 55 trips of 134 (28/27), 137 of 135 (34/30/4 out, 33/31/5 in), 14 of 133 and 83 of 143; every call's uic among its route's stops, nondecreasing times.
- [ ] #763's timetable-wide check counts per stop point and passes on the rebuilt data in real time and time-lapse; `seen.size <= 4` stays on 133.
- [ ] Stop tests derive the point count from the world file; the only shelterless point is Stein-Säckingen Bahnhof's 134 point, with its pole clear; Frick Bahnhof's sign lists 133 → Stein-Säckingen, 134 → Stein-Säckingen, 135 → Aarau, 135 → Laufenburg.
- [ ] In the game, a 134 bus and a 135 bus show their number and destination on the LED and in the F3 list (`tests/test_postauto_lines.py`, stepped fake clock).
- [ ] `cd pipeline && ./.venv/bin/python -m pytest -q`, `node --test tests/` and `tests/test_postauto_lines.py` pass; `CHANGELOG.md` has a player-facing entry; `docs/11-pipeline-osm.md` documents `servable` and lines 134 and 135.
