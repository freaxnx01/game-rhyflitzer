# Red browser tests on main: causes and fixes (#353)

Status: enriched 2026-10-19 (headless `/enrich --quick --headless`, no human gate). Goal set by the maintainer: a
green, trustworthy `tests` gate (the required check in `.github/workflows/tests.yml`) so AI merges can run unattended.
Fix the test or the game. Never loosen an assertion to get green.

## Evidence base

- CI: the hosted full run on `ci/shard-browser-tests` (run 39154285239, 8 shards, cancelled at 30 min, so no
  tracebacks), the GPU full run (run 39156440722, cancelled), the GPU full run on `perf/303-norender-shared-browser`
  (run 39164665160, tracebacks, but that branch changes `index.html` and `conftest.py`), and the PR runs from
  2026-10-19 (39296663624 … 39313003234). `main` itself never gets a full run: `tests.yml` triggers only on
  `pull_request` and `workflow_dispatch`, and a PR runs only the tests its diff selects.
- Local reproduction on `origin/main` at `6c61185` with **Playwright 1.63.0** (the CI pin, `tests.yml:26`,
  Chromium 153), headless SwiftShader, host `TZ=UTC` (like the runners), 2 GB memory cap. Every cause below comes
  from a local run or from a diagnostic probe, unless it says otherwise.

## Per test

| Test | On main today | Cause | Scope |
|---|---|---|---|
| `test_smoke.py::test_camera_cycles_with_c` (`#startbtn` at 480×270) | **passes** locally | fixed by PR#367 (#346 start screen) | verify only |
| `test_build_time.py`, 5 of 6 | fails with Chromium 153 + host TZ UTC; passes with Playwright 1.48 or host TZ Zurich | `document.lastModified` | **in** |
| `test_full_map.py::test_tab_does_nothing_on_the_start_screen` | fails: `box("#map")` is `None` | stale premise | **in** |
| `test_debug.py::test_panel_shows_world_map_extent` | fails: panel shows `map 9.47 × 7.95 km · 75.3 km²` | stale literal | **in** |
| `test_blitz.py::test_finishing_gives_a_rank_and_saves_the_best_time_left` | fails: `#best` still `Best left —` | reads before the next frame | **in** |
| `test_beam.py`, both double-click/tap tests | fails: 120 s timeout waiting for a beam | the clicked point is sky | **in** |
| `test_navi.py::test_the_navi_does_not_touch_the_race_the_car_or_the_turn_signals` | fails: flags gained `walked`, `pontoon` | stale literal | **in** |
| `test_autopilot.py::test_the_minimap_shows_the_route_while_driving` | passes locally; fails on the GPU runner (`#autoline` still filled) | `#autoline` refreshes at most every 250 ms | **in** |
| `test_underpass.py`: headroom, side roads, walls | **fail** locally (the other 4 pass) | south strip and 8 m grid (#47) | **blocked** (A9), not planned |
| `test_holzbruecke.py::test_no_console_errors` | fails: CORS error from `rhyflitzer-api…/api/gallery` | gallery fetch | **out**: covered by #348 |
| `test_hideout.py::test_the_opening_seen_from_inside_the_tunnel_is_as_bright_as_outside` | fails on every hideout PR, GPU included | brightness reference | **out**: covered by #345 |
| `test_on_foot.py::test_z_gets_out_and_back_in_next_to_the_car` | (CI) | checkpoint toast replaces "Stop first" | **out**: covered by #365 |
| `test_smoke.py::test_grass_and_fields_stay_below_the_road[osm]` | (CI) | real world defects | **out**: covered by #290 |
| `test_pause.py::test_p_pauses_and_game_keys_are_silent` | **fails** locally | Change vehicle button (#189) | **in** |
| `test_toast.py::…[touch-phone]` | **fails** locally | toast and debug panel overlap by 1.1 px | **in** |
| `test_vehicles.py`: golden trace, set_vehicle, top speed | **fails** locally | #273 moved the ground (bisected) | **in** |

### build_time: `document.lastModified` is in the host's zone, `new Date()` parses in the emulated one

`prototype/index.html:3530` reads `new Date(d.lastModified)`. `document.lastModified` is a zone-less string
(`MM/DD/YYYY hh:mm:ss`). Chromium 153 formats it in the **host's** time zone, while `new Date(string)` parses it in
the **emulated** one (`timezone_id` in the test). The runners run in UTC and the test emulates `Europe/Zurich` /
`America/New_York`, so the build time shifts by the zone offset. Measured: `Build: 11.10.2026, 06:59 (vor 3 Stunden
35 Minuten)` instead of `08:59 (vor 1 Stunde 35 Minuten)`; en-US: `6:59 AM (just now)` instead of `2:59 AM (1 hour 35
minutes ago)`. With Playwright 1.48 (Chromium 130) or host TZ Zurich the same tests pass.

For a real visitor host and JS zone agree, so players do not see the bug. But the gate needs it, and the GPU
runner's remote browser (`gpu_browser.py`, connected over CDP) cannot be given a per-test `TZ`. So the game fix:
read `Last-Modified` from the response header, which is an absolute GMT time. One `HEAD` request for
`location.href`, no-store. The badge keeps `document.lastModified` as the fallback for `file://` or a failed
request. The tooltip only reads `built` on hover, so a late answer costs nothing. The test's `stamp` route already
rewrites the header for every request to `index.html`, the `HEAD` included.

### full_map: the minimap is hidden on the start screen since #346

The #346 AC hides HUD plates and the map while `#overlay` is shown, so `#map` has no box on the start screen. The
test's intent ("Tab does nothing on the start screen") stays the same; its evidence changes to: `map().full` stays
false, `#br` does not get `.full`, and `#map` stays hidden.

### debug: the region grew south (#47)

`c016bd7` (#243) moved the south edge to Flugplatz Schupfart: `world_hochrhein.json` bbox
`[7.905, 47.5, 8.03, 47.572]`, about 9.4 × 8.0 km. The panel reads `TGRID.GW × TGRID.GD` (`index.html:3292`) and
shows `map 9.47 × 7.95 km · 75.3 km²`, consistent with the bbox. The literal `9.44 × 4.39 km · 41.5 km²` is the
pre-#47 world. Update the golden value.

### blitz: `#best` is written by `hud()` on the next frame

`finish()` (`index.html:2988`) stores the best time and the result, but `#best` is only written in `hud(dt)`
(`index.html:3310`), once per frame. A headless page draws only while something polls rAF, so the test's immediate
`text("#best")` sees the old value. Probe: `'Best left —'` right after `finishNow()`, `'Best left 01:15.0'` three
frames later. Fix in the test: wait for the HUD line (same expected text, so nothing loosens).

### beam: (1000, 200) is above the horizon

`beamPick(1000, 200)` returns `null` on main and on `4ea468a` (#239, where the feature came in). The chase camera
sits 6.9 m behind and 2.6 m above the car and looks 6° down (`__mm.cam()`), so the upper right of the screen is sky.
Most likely (not measured on an old runner) the test only passed while the camera was still near its first-frame
pose (`index.html:3374`: 14 m out, 5 m up, looking down at the car), on a renderer slow enough that
`wait_frames(page)` (2 frames) left it there. On today's runners it is sky after 4 frames already. `beamPick(1000, 420)` after the camera settles hits terrain at about (1876.9, -300.1), 10 m
from the car. Fix in the test: wait until the camera has settled, assert the pick exists *before* clicking (fail
fast instead of a 120 s timeout), use a point below the horizon. Touch test likewise.

### navi: two race flags were added

`raceFlags()` (`index.html:2724`) now also returns `walked` (#350 on foot) and `pontoon` (pontoon). The test's
literal for the untouched state lacks both. Add them as `False`, which is still exactly "untouched".

### autopilot: `#autoline` is throttled to 250 ms

`hud()` refreshes `#autoline` only when 250 ms have passed (`HUD.waterT`, `index.html:3310`). The test checks it 3
frames after `O`. On the GPU runner 3 frames take well under 250 ms. Fix in the test: wait for `#autoline` to empty,
same expected value.

### Underpass

Reproduced locally on main: 3 of 7 fail, the other 4 pass. (The issue's "7 tests" was the `#startbtn` click at
480×270 in `run()`, fixed by #346.) None of the three has a confident fix, so they are **blocked on a maintainer
decision** (Assumption A9) and are not in the plan.

- `test_every_underpass_has_headroom` and `test_walls_follow_skewed_decks_and_leave_side_roads_open`: both come
  from **one place**, the Königsweg under the rail decks 27/28 at (4609, 5563), in the south strip that #47
  (`c016bd7`) added. `__mm.crossings()` reports `depth 0` / `0.07`, `clearance -0.88` / `-0.48` m (the road surface
  is above the deck's underside), `capped: {x: 4609.8, z: 5582, kind: "dead"}`. In the world, Königsweg is three
  pieces: 1300, 2422 (the 10 m under the deck) and 2423, which ends 20 m south of the deck with nothing joining. By
  the #120 rule (`prototype/world.js:182`, `cutNetwork` at `:256`) a dead end keeps its ground, so the cut cannot
  descend, and the trough wall (road 2422) stands at ground level and pokes 0.11 m through the deck surface
  (`top 96.22 > deckTop 96.11 - 0.25`). Not verified: whether Königsweg really ends there or goes on as a
  `highway=track`, which the pipeline drops (`pipeline/world_roads.py:11`, `DRIVE`).
  Possible fixes, each a design decision: (a) the pipeline keeps a track that continues a road out of an underpass;
  (b) a dead end within reach of a cut may descend with it (changes the #120 rule); (c) the pipeline drops the rail
  deck at a crossing where the road cannot get the clearance (the road then crosses at grade).
- `test_side_roads_descend_with_the_cut`: the Hauptstrasse arm at bridges 18/19, (2376, 2642), steps **0.306 m**
  between two 1 m samples of the terrain column (limit 0.3), from s = 5 to 6. The arm's own floor steps only 0.08 m
  there, so the step is in the lowered patch surface, not in the floor. A likely but **unmeasured** cause: #47 also
  switched the terrain grid to 8 m by default (`c016bd7`), which changes the patch surface under overlapping
  cuts. Fixing it means finding the patch cell that steps, which is a `world.js` investigation of its own.

### Pause, toast, vehicles (not in the issue's list)

These failed in the `perf/303` run and looked branch-made. Locally on main they **fail too**:

- `test_pause.py::test_p_pauses_and_game_keys_are_silent`: after `Tab` the focus is on `pausevehicle`, the test
  expects `pauserestart`. #189 (`0914823`) put **Change vehicle** between Resume and Restart
  (`prototype/index.html:434-435`), so the next button after Resume is now Change vehicle. Stale literal: the test's
  point ("Tab moved the focus") stays, the expected id becomes `pausevehicle`.
- `test_toast.py::test_key_toast_is_centred_below_the_checkpoint_block[touch-phone]`: the toast's bottom (311.1 px)
  overlaps the debug panel's top (310 px) by 1.1 px. The pontoon feature (`baae2fe`, #100) added `#prompt` under
  `#roadname`/`#autoline` with `min-height:18px` (`index.html:36-37`), which put the toast 18 px lower. On the same
  day `cda3b21` pinned the debug panel to `top:calc(310px …)` for coarse-pointer portrait (`index.html:57`). Which of
  the two came second is not verified, the overlap itself is measured. A real layout overlap, but only on a phone
  with `?debug` on. Fix in the game: move that debug panel down to 324 px (the toast's slot is fixed: every line
  above it reserves its 18 px even when empty).
- `test_vehicles.py`, the golden trace (and `test_set_vehicle_validates_and_round_trips`, which compares with the
  same golden values): the `gas` run ends 0.67 mm further and 1.4e-5 m/s slower than the recording.
  `git bisect` with a probe of the `gas` run (`d13e5b6` good → `origin/main` bad, 8 steps) names `a6eb4a5`
  (#273, PR#291) "wheels on the road at the Sisseln junction": it changed `surfH` and added `discSurfH` in
  `prototype/index.html`, so the ground under the car on the hand Bahnhofstrasse moved by a hair and the trace with
  it. That is a deliberate ground fix, not a physics regression. Re-record **all seven** golden values on main with
  the test's own `GOLDEN_JS`, and add a comment line naming #273 like the existing #69 line. The 1e-6 tolerance
  stays. `test_table_top_speed_is_used` (failed in the `perf/303` run) compares with `gas` too: re-check it after
  the re-record.

## Out of scope

- #348 (gallery CORS → console-clean tests), #345 (timeouts, SwiftShader-only tests in `test_hideout`/`test_region`),
  #365 (on foot), #290 (grass over road). Not touched here. Note for #345: since #377 installed Pillow, the hideout
  brightness test also fails on the **GPU** runner, with `the outside reference is itself dark: 0.0` (run
  39313003234), not only on SwiftShader.
- Adding a scheduled full run on `main` is not part of this issue. It would have caught all of this, so it is noted
  in Consequences as a follow-up.

## Acceptance

- Every in-scope test passes locally under Playwright 1.63 with host `TZ=UTC`, and in one `workflow_dispatch` run
  with `all: true` on the PR branch. The out-of-scope tests and the three blocked underpass tests may still fail
  there, for their own reason only.
- No assertion is loosened: expected values change only where the game changed on purpose (#47, #189, #273, #346,
  #350, pontoon), and the waits wait for the same expected value.
- The `tests` gate is fully green only once the blocked underpass decision (A9) and #345/#348/#365/#290 have landed.
  This issue does not claim more than its own share.

## Assumptions

- **A1** [med] build_time is fixed in the game: the tooltip reads the `Last-Modified` response header (one `HEAD`
  request) and keeps `document.lastModified` as the fallback. Rejected: passing `TZ` to the browser launch in the
  test, which does nothing for the GPU runner's remote browser (`prototype/tests/gpu_browser.py`, CDP connect).
  Rejected: expected values that follow the host zone, which would loosen the test. The code sits between
  `game-nav-buildtime` markers (`prototype/index.html:3522-3570`), which look like a block shared with the games
  hub. If a hub sync rewrites it, the fix has to go upstream too.
- **A2** [high] full_map: the start-screen test asserts "not full, `#br` not `.full`, `#map` hidden" in place of
  "width 400". The #346 AC hides the map behind `#overlay`.
- **A3** [high] debug: the golden extent becomes `map 9.47 × 7.95 km · 75.3 km²`. It is the #47 region, consistent
  with the world bbox `[7.905, 47.5, 8.03, 47.572]`.
- **A4** [high] blitz: the test waits for `#best` to read `Best left 01:15`. Rejected: writing `#best` from
  `finish()`. Players see no difference, because the HUD is hidden behind the result screen.
- **A5** [high] navi: the untouched-flags literal gains `walked: False, pontoon: False` (`index.html:2724`).
- **A6** [high] autopilot: the test waits for `#autoline` (refreshed every 250 ms) to reach the asserted text.
- **A7** [med] beam: wait for the chase camera to settle, then pick `(1000, 420)` (terrain about 10 m from the car)
  and assert the pick before clicking. Rejected: a new test hook that projects a world point to the screen (more
  game surface for a test).
- **A8** [high] pause: after Tab the expected focus is `pausevehicle` (#189 put Change vehicle after Resume,
  `index.html:434-435`).
- **A9** ⛔ [low] Underpass (3 tests) is **blocked**: the Königsweg dead end in the #47 south strip caps the cut, and
  whether the fix belongs in the pipeline (keep the track), in the #120 rule (let a dead end descend) or in the
  deck data (drop the deck) is a design decision with no signal in the repo. The Hauptstrasse 0.306 m step has no
  measured cause yet. Not planned. A maintainer picks (a)/(b)/(c) for Königsweg and decides whether the step is
  investigated here or in a new issue.
- **A10** [med] toast: the coarse-pointer portrait debug panel moves from `top: 310px` to `324px`
  (`index.html:57`). Rejected: dropping `min-height` on empty HUD lines, which would make the toast jump each time
  a line fills.
- **A11** [med] vehicles: the seven golden values are re-recorded on main, after the bisect named #273 (`a6eb4a5`).
  The test's docstring says "must never change", but the file already re-recorded for #69, with a comment.
- **A12** [high] Out of scope: `test_holzbruecke::test_no_console_errors` is the gallery CORS error, reproduced
  locally with the same message as #348, so #348 covers it. Hideout brightness goes to #345, on foot to #365, grass to
  #290.
- **A13** [high] `test_smoke.py::test_camera_cycles_with_c` (`#startbtn` at 480×270) passes on main since #346
  (PR#367). Verify only, no change.

## Consequences

- One extra same-origin `HEAD` request per page load (the build-time header).
- After this issue the gate is still red until A9 and #345/#348/#365/#290 land. A green `tests` check is the sum of
  all five.
- Nobody runs the whole suite on `main`, so tests that no PR selects can rot unnoticed, which is how this backlog
  built up (#47 → debug and underpass, #189 → pause, #273 → vehicles, all a week old). A scheduled full run on
  `main` would be a follow-up issue.
- The re-recorded golden trace bakes in #273's ground change. Any earlier drift in the same window is accepted along
  with it (the bisect shows none: one step from good to bad).
- With `?debug` on a phone in portrait, the debug panel sits 14 px lower.
- `test_build_time` once timed out locally in `page.hover` ("waiting for element to be visible and stable") with host
  TZ Zurich, 1 of 6. That is a flake to watch, not a planned change.
