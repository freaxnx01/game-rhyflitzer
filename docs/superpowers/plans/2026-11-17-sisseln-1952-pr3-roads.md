# Sisseln 1952 — PR 3: hidden new roads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With <kbd>Ctrl</kbd>+<kbd>Y</kbd> on, the Swiss side also loses its post-1952 roads: the A3 and its ramps, the Fridolinsbrücke (the newer Stein–Bad Säckingen road bridge), the minor roads of the Sisslerfeld industrial area, and residential streets with no 1952 house along them. A car on a road that disappears is moved to the nearest road that stays, with a short notice.

**Architecture:** This follows the PR 2 pattern. A retrofit pipeline step, `pipeline/era_roads.py`, flags roads `modern: true` in the committed `data/world_hochrhein.json`. At runtime the modern ribbons, markings, end and junction discs and bridge models are built under the existing `ERA_COLLECT` flag, so they land in `ERA.group` / `ERA.mesh`. Modern bridge decks, road surfaces and road logic (jump spots, snapping, navi graph, minimap) skip modern roads while `ERA.on`. Toggling on runs the road-gone fallback.

**Tech Stack:** Python 3 + shapely (pipeline venv), vanilla JS ES modules, `node:test`, pytest + Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-sisseln-1952-design.md` (issue #530), sections "Roads" and "Calls made by Claude". PR 2 plan for the existing runtime pieces: `docs/superpowers/plans/2026-11-15-sisseln-1952-pr2-buildings.md`.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- **German side stays exactly as today.** Every road rule except the Fridolinsbrücke applies only to roads whose midpoint (`interpolate(0.5, normalized=True)`) lies inside the CH outline (`pipeline/ch_outline.geojson`, via `era_1952._outline_to_game`).
- "**Residential streets** (decided by the maintainer 2026-11-15): a residential street on the Swiss side disappears in 1952 when no building that stood in 1952 lies along it; main and through roads, and roads leading to old houses, stay."
- The Holzbrücke is old and stays. Cars cross the Rhine on it in 1952.
- "The road-gone fallback moves the car to the nearest old road (same spawn logic the game already uses for jumps/teleports) and shows a short bilingual notice."
- Retrofit pattern: patch the committed world file in place and keep everything else byte-identical. Write with `json.dumps(ensure_ascii=False, separators=(",", ":"))`. The step must be idempotent.
- Road `id`s are **not unique** (59 duplicates). Key everything by list index, never by `id`.
- All new UI text goes in `de` and `en` in `strings.js`. German uses capitalised `Du`/`Dir` and real umlauts.
- Pipeline python: `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python` (the worktree has no venv). Run heavy jobs under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- Browser tests: run only the affected Playwright files, in the foreground. Node: `node --test tests/*.test.mjs`.
- Commits reference `#530`. Use Conventional Commits. Branch: `issue-530-sisseln-1952-roads`, stacked on PR#1018.

## Rulings (Claude's calls, recorded for the maintainer)

| Ruling | Why | Cost if wrong |
|---|---|---|
| "Residential street" candidates are `cls` in `residential`, `living_street`, `service` | `service` ways are driveways to (mostly modern) houses; left in, they leave the same empty stubs the maintainer objected to | A farm access that stood in 1952 vanishes; easy to whitelist |
| "Along it" = an old Swiss building footprint within `NEAR_OLD = 25.0` m of the road line | Matches the spike: 189 residential streets kept, 602 hidden | Threshold tweak |
| Connectivity repair: a kept road component that is cut off from the main kept network gets back the fewest hidden *residential-rule* roads that reconnect it | "Roads leading to old houses stay" | A few extra empty streets |
| Industrial rule: non-main roads (not `motorway*`, `trunk*`, `primary*`, `secondary*`, `tertiary*`) with ≥ 50 % of their length inside the industrial site | Main roads through the Sisslerfeld (Hauptstrasse) existed | A main road inside the site stays |
| Industrial site polygon: OSM way `w1378060195` (`anchors.json` `areas.industrial`), committed once as `pipeline/industrial_sisslerfeld.geojson` (lon/lat) | The world file has no site geometry; PR 4 (fields) reuses the same file | None |
| Fridolinsbrücke = every road named `Fridolinsbrücke` (13 ways: 4 deck pieces and approaches), on both banks | It is one structure; half a bridge is worse | The German approach stubs vanish too |
| Motorway rule: `motorway`, `motorway_link` on the Swiss side only | German side stays as today (non-goal) | None |
| PostAuto buses are not shown in 1952; their minimap lines are hidden too | Every route runs 0.1–2.2 km on hidden roads (spike); the spec has no historic vehicles | Stops without buses in 1952 |
| On toggle, an active autopilot or navi route is stopped (the existing stop path, no new UI) | Its route may run over hidden roads | The player re-enters the destination |
| A J entry whose landing spot lies on a gone road is not offered in 1952 | Spec: "Any viewpoint, mission or start point whose subject or position is hidden is simply not offered" | None |

## Review Focus

1. **Car on the Fridolinsbrücke deck when Ctrl+Y goes on.** The deck vanishes. The car must be moved to the nearest old road, not drop into the Rhine. Covered by the Task 4 Playwright test `test_era_road_gone_moves_car_off_bridge`.
2. **Car on a hidden residential street.** Same fallback, with the notice `eraRoadGone`. Covered by the Task 4 test on a spot taken from `__mm.era().goneSample`.
3. **Ctrl+Y back to today while on a field where a road reappears.** Nothing happens: no relocation, no notice. The car simply drives on the road again. Covered by the Task 4 test, second half.
4. **Autopilot or navi running when the layer flips.** Stopped, not left steering onto vanished asphalt. Covered by the Task 4 test via `__mm` autopilot state.
5. **An isolated old hamlet.** Its only access is a residential street with no old house, so the access must stay. Covered by the Task 1 test `test_reconnect_restores_access_to_isolated_old_street`.

---

### Task 1: pipeline flags the modern roads

**Files:**
- Create: `pipeline/era_roads.py`, `pipeline/industrial_sisslerfeld.geojson`, `pipeline/tests/test_era_roads.py`
- Modify: `data/world_hochrhein.json` (real run), `data/README.md`, `docs/11-pipeline-osm.md` (one paragraph next to the `era_1952.py` one)

**Interfaces:**
- Consumes: `era_1952._outline_to_game`, `era_1952._load_outline`, `geo.Frame`.
- Produces:
  - `classify_roads(roads, buildings, swiss, industrial) -> dict[int, str]`: road index → reason `"motorway" | "bridge" | "industrial" | "empty"`. Only hidden roads are present. `buildings` carry `modern` from PR 2. A building is "old Swiss" if it is not `modern` and its centroid lies in `swiss`.
  - `reconnect(roads, hidden) -> set[int]`: the indices of `"empty"` roads to restore.
  - `apply(world, outline_lv95, industrial_lonlat) -> dict` sets `road["modern"] = True` on hidden roads, removes the flag elsewhere, and returns counts per reason.
  - CLI: `python era_roads.py --world ../data/world_hochrhein.json [--outline ch_outline.geojson] [--industrial industrial_sisslerfeld.geojson]`, prints `era_roads: {counts}`.

- [ ] **Step 1: Extract the industrial site.** Run `osmium getid -r <pbf> w1378060195` and then `osmium export`, both under the memory cap. The pbf is `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/cache/osm/hochrhein.osm.pbf`. Write a single-Feature GeoJSON (Polygon, lon/lat) to `pipeline/industrial_sisslerfeld.geojson`, rounded to 6 decimals. Check that its game-frame bounds contain the 36 `palette: "industrial"` buildings (x 716–1261, z −115–432).
- [ ] **Step 2: Write failing tests** in `pipeline/tests/test_era_roads.py`. Use tiny synthetic worlds in the game frame, with `swiss` as a shapely box and no real files:
  - `test_motorway_on_swiss_side_is_modern`: `motorway` and `motorway_link` inside → `"motorway"`; the same outside `swiss` → absent.
  - `test_fridolinsbruecke_is_modern_on_both_banks`: two roads named `Fridolinsbrücke`, one outside `swiss` → both `"bridge"`.
  - `test_minor_road_in_industrial_site_is_modern`: a `service` road 60 % inside → `"industrial"`; a `primary` road fully inside → absent; a `service` road 40 % inside → not `"industrial"`.
  - `test_residential_without_old_house_is_modern`: a `residential` road with a modern building 5 m away → `"empty"`; the same with an old building 20 m away → absent; with an old building 30 m away → `"empty"`.
  - `test_main_and_unclassified_roads_stay_without_houses`: `tertiary` and `unclassified` with no buildings → absent.
  - `test_reconnect_restores_access_to_isolated_old_street`: main road A, empty residential B sharing an endpoint with A, old-house residential C sharing B's other endpoint → `reconnect` returns `{B}`. When C also touches A directly, it returns `set()`.
  - `test_apply_is_idempotent_and_byte_stable`: run `apply` twice on a copy; `json.dumps` of both equal. A road flagged by a previous run but no longer hidden loses `modern`.
- [ ] **Step 3: Run, expect FAIL**: `cd pipeline && <venv python> -m pytest tests/test_era_roads.py -v` fails with ModuleNotFoundError.
- [ ] **Step 4: Implement** `pipeline/era_roads.py`. Header docstring `#530: …` in the style of `era_1952.py`. Constants: `NEAR_OLD = 25.0`, `INDUSTRIAL_SHARE = 0.5`, `ENDPOINT_TOL = 0.5`, `RESIDENTIAL = ("residential", "living_street", "service")`, `MAIN_PREFIXES = ("motorway", "trunk", "primary", "secondary", "tertiary")`, `BRIDGE_NAME = "Fridolinsbrücke"`. Rule precedence: bridge > motorway > industrial > empty.
  - `reconnect`: build an endpoint graph over all roads (nodes = endpoints snapped to `ENDPOINT_TOL`). Take the kept-road components. The main component is the one with the most kept roads. For every other kept component that contains a non-`"empty"`-rule road or an old-house road, BFS through `"empty"` roads only, find the shortest road chain to any node of the main component, and restore it. Components that cannot be reached stay as they are.
- [ ] **Step 5: Run tests**: PASS.
- [ ] **Step 6: Real run.** `<venv python> era_roads.py --world ../data/world_hochrhein.json` under the cap. Record the counts in the commit body. Expect about 85 motorway, 13 bridge, a few dozen industrial and several hundred empty. Then verify `git diff --stat data/` touches only that file, and that a second run leaves it unchanged (`git diff` empty after re-run).
- [ ] **Step 7: Docs.** Add a paragraph to `data/README.md` and `docs/11-pipeline-osm.md`: what the flag means, the rules, and the CLI.
- [ ] **Step 8: Commit** `feat(pipeline): flag the roads that did not exist in 1952 (#530)`

### Task 2: pure runtime helpers and strings

**Files:**
- Modify: `timelayer.js`, `strings.js` (en block next to `eraNoDelivery` ~line 279, de block ~line 1079)
- Test: `tests/timelayer.test.mjs`, and `tests/world.test.mjs` (the road keeps `modern` through `world.js` line 117)

**Interfaces:**
- Produces:
  - `export function roadGoneAt(hits)`: `hits` is `[{ modern: boolean, d: number, hw: number }]`, where `d` is the distance from the centre line and `hw` the half width. It returns true when some hit has `d <= hw` and `modern`, and no hit has `d <= hw` and is not modern.
  - `export function eraRoads(roads, on)`: `roads.filter(r => eraShown(r, on))`.
  - Strings `eraRoadGone`, with en `'This road did not exist in 1952 · moved to the nearest old road'` and de `'Diese Strasse gab es 1952 noch nicht · auf die nächste alte Strasse versetzt'`.

- [ ] **Step 1: Failing tests.**
  - `roadGoneAt`: `[]` → false. One modern hit inside → true. A modern and an old hit, both inside → false. A modern hit outside (`d > hw`) → false.
  - `eraRoads`: the off state keeps all roads; the on state drops the modern ones.
  - `world.test.mjs`: a road with `modern: true` keeps it in `loadWorld(...).roads` and `.bridges`.
  - Strings: `eraRoadGone` exists in both languages, as in the existing parity test.
- [ ] **Step 2: Run** `node --test tests/timelayer.test.mjs tests/world.test.mjs tests/strings.test.mjs`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expect PASS. Then run `node --test tests/*.test.mjs`. Expect PASS.
- [ ] **Step 5: Commit** `feat(era): helpers for roads gone in 1952 (#530)`

### Task 3: hidden roads leave the 3D view and stop carrying the car

**Files:**
- Modify: `index.html`. Touch these places:
  - the road loop (~2570: ribbons, `ROAD_SURF`);
  - markings (~2573–2582);
  - end discs (~2585) and junction discs (~2586);
  - the bridge build (`OSM_BRIDGES` ~1393–1432, hero and generic deck drawing ~2589–2700);
  - `onBridge` (~1344);
  - `roadSurfH` / `surfH` (~1623);
  - `__mm.era` (~5433).
- Test: extend `tests/test_era_toggle.py`.

**Interfaces:**
- Consumes: `ERA_COLLECT`, `ERA.group`, `ERA.mesh` (PR 2); `road.modern` (Task 1).
- Produces:
  - **Road surfaces:** a road's surface object (`sf`) carries `modern`. `roadSurfH` ignores modern surfaces while `ERA.on`.
  - **Bridges:** OSM bridge objects `b` carry `modern = !!b.r.modern`. For the stone chain this holds for every piece and every approach (`addApproach` copies `r`, so set it from the chain). `onBridge` skips `b.modern` while `ERA.on`.
  - **Debug hook:** `__mm.era()` additionally returns:
    - `roadsHidden`: the count of modern roads;
    - `goneSample`: `[x, z]`, the midpoint of the longest modern non-bridge Swiss road;
    - `deckSample`: `[x, z]`, the midpoint of the longest modern bridge piece;
    - `bridgeAt(x, z)`: whether `onBridge(x, z, 1e4)` hits.
  - **Markings** of modern roads go into their own merged meshes, added to `ERA.group` and not to `marks`.
  - **Discs:** an end disc of a modern road, and a junction disc that touches no old road (no non-modern road within `r + 0.5` of the disc centre, via `ROAD_GRID`), are built under `ERA_COLLECT`.
  - **Bridge models:** the hero bridge model, generic deck models and their colliders for modern bridges are built under `ERA_COLLECT`, so `pushOBB` files their colliders into `ERA.solids`.

- [ ] **Step 1: Failing test** `test_era_hides_new_roads_and_bridge_deck(server)`. Start like the existing era tests.
  - Before the toggle: assert `roadsHidden > 50`, and that `bridgeAt(*deckSample)` is true.
  - Press `Control+y`. Assert `bridgeAt(*deckSample)` is false.
  - Cast a downward ray at `goneSample` against the visible meshes (reuse the PR 2 `sample`/`visible` way of checking, or add `__mm.era().roadMeshAt(x, z)` → whether a visible road-role mesh is hit). Assert no road is hit.
  - Press `Control+y` again. Assert both are back.
  - `errors == []`.
- [ ] **Step 2: Run** `python3 -m pytest tests/test_era_toggle.py -k new_roads -v`. Expect FAIL.
- [ ] **Step 3: Implement** the Interfaces above. The style switch (`applyStyle` loops over `[MESH, ERA.mesh]`) must also cover the new road roles. The existing style test in `test_era_toggle.py` must stay green.
- [ ] **Step 4: Run** `python3 -m pytest tests/test_era_toggle.py tests/test_house_facades.py -v`. Expect PASS. Then also run the bridge test that covers the Fridolinsbrücke (grep `fridolin` in `tests/*.py`) and expect PASS. Run `node --test tests/*.test.mjs` and expect PASS.
- [ ] **Step 5: Commit** `feat(era): the new roads and the Fridolinsbrücke vanish in 1952 (#530)`

### Task 4: road logic follows the layer, plus the road-gone fallback

**Files:**
- Modify: `index.html`. Touch these places:
  - `jumpable` (~4615) and `snapRoad` (~1660);
  - `autoGraph` (~4684);
  - `toggleEra` (~7369);
  - `eraEntries` (~6930);
  - `paintMapStatic` roads and `MOTORWAY_LABELS` (~7249–7250);
  - the PostAuto bus draw/update and its minimap lines (~4810, ~7343);
  - `__mm.raceFlags` / autopilot hooks if needed.
- Test: extend `tests/test_era_toggle.py`.

**Interfaces:**
- Consumes: `roadGoneAt`, `eraRoads`, `eraRoadGone` (Task 2); `goneSample`, `deckSample` (Task 3).
- Produces:
  - `jumpable(r)` and `snapRoad` skip `r.modern` while `ERA.on`.
  - `autoGraph()` builds from `eraRoads(ROADS, ERA.on)` and caches one graph per state (`AUTOP.graphs = { today, era }`). `AUTOP.graph` and `AUTOP.streets` point at the current one.
  - `function goneUnderCar()` in `index.html` (a query). It builds `roadGoneAt` hits from `gridQuery(ROAD_GRID, P.x, P.z, 16)` and returns true when the car stands on a gone road, or `onBridge` would hit a modern deck at the car's position with the layer off.
  - `toggleEra` when switching **on**: compute `goneUnderCar()` *before* flipping. Then:
    - stop autopilot/navi;
    - if the car was on a gone road (and `!FLY.on && LEVELS.isSurface() && !caveInside()`), call `placeOnRoad(best.x, best.z, P.th, 'era')` with `best = nearestJumpable(P.x, P.z)`, which is evaluated after the flip so only old roads qualify;
    - toast `eraRoadGone` instead of `eraOn`.

    The PR 2 relocation on switching **off** stays unchanged.
  - **J entries:** `eraEntries` also drops entries whose landing spot (`e.jump` or the entry's own x/z) gives `roadGoneAt` true while `ERA.on`.
  - **Minimap:** roads skip `r.modern && ERA.on`. Motorway labels and PostAuto lines are not drawn while `ERA.on`.
  - **PostAuto:** no buses are shown or collide while `ERA.on`. Clear the fleet on switch-on; `syncFleet` does not respawn while on.
  - **Debug hook:** `__mm.era()` additionally returns `buses` (the visible bus count) and `jumpsOnGone` (the count of offered J entries with `roadGoneAt` true; must be 0 while on).

- [ ] **Step 1: Failing tests.**
  - `test_era_road_gone_moves_car_off_street(server)`:
    - Place the car at `goneSample` and press `Control+y`.
    - Wait for the toast containing `1952`. Assert it says "did not exist" (en) or uses the `eraRoadGone` text.
    - Assert the car moved more than 3 m, that `roadGoneAt` is false at the new spot (via `goneUnderCar` exposed on `__mm.era().goneHere`), and that the car's y is within 1 m of the ground.
    - Press `Control+y` again. Assert the car did not move and no `eraRoadGone` toast appeared.
  - `test_era_road_gone_moves_car_off_bridge(server)`: place the car on `deckSample`, press `Control+y`, wait 2 s, assert the car's y is above the water level and not falling (vy ≈ 0), and that `goneHere` is false.
  - `test_era_road_logic_follows_layer(server)`:
    - Start the autopilot to any street entry and press `Control+y`. Assert the autopilot is off.
    - Assert `jumpsOnGone == 0` and `buses == 0`.
    - Assert `__mm.mapBoxes`-style evidence for roads if cheap. Otherwise, assert that the count of jumpable roads (add `__mm.era().jumpableRoads`) drops while on and comes back off.
- [ ] **Step 2: Run** `python3 -m pytest tests/test_era_toggle.py -k "road_gone or road_logic" -v`. Expect FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `python3 -m pytest tests/test_era_toggle.py -v` and expect PASS. Then run the PostAuto and autopilot Playwright files that touch the changed functions (grep `postauto`, `autopilot`, `navi` in `tests/*.py`; run each file once), and expect PASS. Run `node --test tests/*.test.mjs` and expect PASS.
- [ ] **Step 5: Commit** `feat(era): a car on a road gone in 1952 moves to the nearest old road (#530)`

### Task 5: changelog, screenshot, PR

**Files:** `CHANGELOG.md` (`[Unreleased]` → `### Added`, newest first)

- [ ] **Step 1:** Add a changelog entry, timestamped with `TZ=Europe/Zurich date '+%F %H:%M'`. German, like the PR 2 entry:
  `` `<ts>` Mit <kbd>Ctrl</kbd> <kbd>Y</kbd> verschwinden auch die **neuen Strassen**: die Autobahn, die **Fridolinsbrücke** und die Quartierstrassen ohne altes Haus. Über den Rhein geht's 1952 über die **Holzbrücke**; stehst Du auf einer Strasse, die es noch nicht gab, landest Du auf der nächsten alten. ``
- [ ] **Step 2:** Run `node --test tests/*.test.mjs` and `python3 -m pytest tests/test_era_toggle.py -v`. Expect all to pass.
- [ ] **Step 3:** Re-shoot the PR 2 framing with the scratchpad script `era-shots/era_shots.py`: today and 1952, Sisseln from (1880,−150). Look at it before the PR.
- [ ] **Step 4: Commit** `docs(changelog): Sisseln 1952 roads (#530)`. Push and open the PR against the PR 2 branch, titled `feat(era): new roads vanish in 1952, car moves to the nearest old road`, with body `Part of #530`.

---

## Addendum 2026-11-20: trim streets to the stretch the old houses need

The PR 3 screenshot showed most of Sisseln's empty street grid still standing in 1952: a residential street stays whole
when a single old house lies anywhere along it (21 of 24 residential streets in the Sisseln view). The maintainer
chose to trim before merging. Same Global Constraints as above (TDD verbatim).

**Rule (revised 2026-11-20 after the first Task 6 run trimmed only 4 of 18 streets in the Sisseln view: "both ends on
the network keeps it whole" exempts every street of a grid).** The old network is every kept road that is not a
trim candidate (main roads, `unclassified`, restored roads, bridges, German side). A trim candidate is a kept Swiss road
of a `RESIDENTIAL` class with old Swiss footprints within `NEAR_OLD`. Each candidate's *house stretch* runs from its
nearest old footprint's projection minus `TRIM_PAD` to its farthest plus `TRIM_PAD` (clamped). Then, house stretches
nearest the network first, each stretch not yet joined to the kept set is joined by the **shortest route** (Dijkstra
over road vertices, cost = metres not yet kept, 0 for metres already kept) through candidate roads to the kept set;
the route's metres become kept. Whatever of a candidate is not kept in the end is hidden in 1952. A stretch with no
route at all keeps its whole road (the old fallback). Cut points at `a`/`b` are interpolated, not snapped to vertices.

**Rule revision 2 (2026-11-20, from the top-down map of Sisseln: Rütistrasse 256 m, Alte Bündten-Strasse 167 m and
Innermattstrasse with no old house stayed whole as `restored` roads; corner houses kept stretches on every street within
25 m).** (a) An old footprint counts only for its **nearest** road (distance to the footprint; another road within 1 m
of that distance counts too), still only within `NEAR_OLD`. (b) The trim replaces the whole-road `reconnect` for these
roads: "empty" roads are routable with full cost, and the targets to join are the house stretches **plus** every kept
Swiss component that `reconnect` would have joined (its islands). An "empty" road keeps only the metres a route uses
(`keep1952` intervals, not `modern`); an "empty" road no route uses stays `modern`. `restored` in the counts becomes the
number of "empty" roads with kept metres. The no-route fallback stays (whole road).

**Data shape.** `road["keep1952"] = [[a, b], ...]` (sorted, disjoint intervals in metres along `pts`, rounded to 0.1) on
a trimmed road only; removed from every other road; never together with `modern`. Written only if at least 0.5 m is
dropped. A candidate whose kept intervals are empty does not occur (its house stretch is always kept).

### Task 6: pipeline trim

**Files:** Modify `pipeline/era_roads.py` (new constant `TRIM_PAD = 10.0`, new `trim(roads, hidden, buildings, swiss) -> {index: (a, b)}`, called by `apply` after `reconnect`; `apply` counts `trimmed`), `pipeline/tests/test_era_roads.py`, `data/README.md` + `docs/11-pipeline-osm.md` (one sentence each), then re-run on `data/world_hochrhein.json`.

**Interfaces:** Produces `keep1952` as above. Consumes `classify`, `reconnect`, `_node_sets`/`_components` as they are.

- [ ] **Step 1: Failing tests** in `pipeline/tests/test_era_roads.py`:
  - `test_trim_DeadEndWithOldHouseNearStart_KeepsStartToHousePlusPad`: a 200 m residential street whose start joins a kept main road, one old footprint beside it at 40 m → `trim` gives `(0, ≈ house far edge + TRIM_PAD)`; the end is dropped.
  - `test_trim_GridOfStreets_KeepsOnlyShortestRouteToHouse`: a 3×3 residential grid between two main roads, one old house mid-grid → only the house stretch plus the shortest route to a main road stay; the rest of the grid is dropped.
  - `test_trim_NoRouteToNetwork_FallsBackToWhole`: a street joined to nothing kept → no entry (it stays whole, as before).
  - `test_trim_ChainThroughNeighbour_KeepsTheLink`: street A (old house near its far end) reaches the main road only through street B → the part of B between A's junction and the main road stays, B's other end is dropped.
  - `test_trim_CornerHouse_CountsForNearestRoadOnly`: a house 5 m from street A and 20 m from street B → only A gets a house stretch.
  - `test_trim_RestoredRoad_KeepsOnlyTheRouteMetres`: an island reached through a long empty road keeps only the empty road's metres between the island and the network.
  - `test_trim_TwoIntervalsOnOneRoad`: a long street whose two old houses are reached from opposite ends → two intervals.
  - `test_trim_MainRoadsAndGermanSideNeverTrimmed`.
  - `test_apply_Idempotent_WithKeep1952` (run twice, same JSON; `keep1952` never together with `modern`).
- [ ] **Step 2:** Run `pipeline/.venv/bin/python -m pytest pipeline/tests/test_era_roads.py -v` — FAIL.
- [ ] **Step 3:** Implement. Connectivity on pieces: treat each kept road as its kept stretch; an end vertex counts as touching another road if the other's kept stretch contains a vertex key there (`ENDPOINT_TOL`), or for a full road any vertex (as `_nodes`).
- [ ] **Step 4:** Tests PASS; re-run `era_roads.py --world ../data/world_hochrhein.json`; print counts; check idempotence with a second run (byte-identical).
- [ ] **Step 5: Commit** `feat(era): a 1952 street ends after its last old house (#530)`

### Task 7: the game splits trimmed roads

**Files:** Modify `world.js` `layoutFromWorld`; `tests/world.test.mjs`; `CHANGELOG.md` (reword the PR 3 entry: "Quartierstrassen ohne altes Haus" → "Quartierstrassen enden nach dem letzten alten Haus").

**Interfaces:** `layoutFromWorld` turns a road with `keep1952: [[a, b], ...]` into alternating pieces: the kept intervals without `modern`, the gaps (including before the first and after the last) with `modern: true`, each `{ ...r, pts }` minus `keep1952`, cut points interpolated on the polyline; pieces shorter than 0.5 m are dropped. Everything downstream (meshes, physics, J, autopilot, minimap) already handles per-road `modern`.

- [ ] **Step 1: Failing node tests:** `layoutFromWorld_Keep1952_SplitsIntoKeptAndModernPieces` (two intervals → five pieces; lengths, flags, endpoints match the cut points, `L.bridges` unaffected); `layoutFromWorld_Keep1952_FullRange_NoSplit`.
- [ ] **Step 2:** `node --test tests/world.test.mjs` — FAIL.
- [ ] **Step 3:** Implement with the existing `polylineLength`/`pointAtLength` helpers.
- [ ] **Step 4:** `node --test tests/*.test.mjs` PASS; `python3 -m pytest tests/test_era_toggle.py` PASS (under `systemd-run … MemoryMax=3G`); re-shoot `era-shots/pr3_shots.py` and look at it.
- [ ] **Step 5: Commit** `feat(era): the game draws only the kept stretch of a trimmed street (#530)`
