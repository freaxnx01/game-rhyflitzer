# CI test gate: what is left of #345 (region test on SwiftShader, brightness test on one GPU runner)

Status: enriched 2026-10-19 (headless `/enrich`, no human gate). Goal from the maintainer: a green, trustworthy
required check `tests`, so AI merges can go through unattended. The game should be bug-free and playable but is
not mission-critical. Not just raising timeouts: tests that do not depend on the renderer or the frame rate, or an
explicit marking where a test really needs a GPU.

## What #345 reported, and what is still true on main (6c61185)

| Part of #345 | State on 2026-10-19 | Evidence |
|---|---|---|
| 30 min timeout when a PR changes a big test file | **resolved** for the PR gate | #371 deals the selected test ids round-robin onto up to 8 hosted / 2 GPU shards (`.github/workflows/tests.yml:30-120`); #369 sends same-repo PRs to the GPU runners. Every PR run since has its slowest shard at 9-12 min, e.g. 39313003234 (33 tests: 10:34 / 3:10), 39303473049 (11:36 / 4:50), 39298176268 (9:33 / 5:26). `select_tests.py` caps a PR at 8 files (`CAP`, line 21). |
| `test_hideout.py::test_the_opening_seen_from_inside_the_tunnel_is_as_bright_as_outside` fails only on SwiftShader | **resolved** on SwiftShader; **new failure on one GPU runner** | The hosted job never installed Pillow until #377 (`tests.yml` `pip install` line before 9c3da56); the same test fails with `ModuleNotFoundError: No module named 'PIL'` in 39303473049, 39298176268, 39296663624. With Pillow it passes on SwiftShader (local headless Chromium, 2026-10-19, 121 s). Since the runner image has Pillow it fails on the `gpu-odroid` runner (Intel UHD) with `the outside reference is itself dark: 0.0` -- an all-black frame -- in 39307582180 and 39313003234. It has not run on `gpu-cirrus` with Pillow yet. |
| `test_region.py::test_choosing_ehrendingen_reloads_with_the_parameter_and_keeps_vehicle` fails only on SwiftShader | **still real** | Reproduced locally on SwiftShader 2026-10-19, 2 of 2 runs: `Page.click: Timeout 30000ms exceeded ... waiting for element to be visible, enabled and stable` on `#worldbtn`. |
| `test_smoke.py::test_grass_and_fields_stay_below_the_road[osm]` | out of scope (#290) | as in the issue |

Still open outside the PR gate (not planned here): a manual `workflow_dispatch` with `all: true` on the GPU
runners (624 tests on 2 shards) hits the 30 min job timeout (39172387160, 39159976327, both cancelled at 30 min).

## Cause of the region failure (measured)

A probe on local SwiftShader, same page setup as `boot()` (`prototype/tests/test_region.py:15-23`, viewport
1280x720, terrain blocked):

- after `#worldstatus` has text, the page's main thread is still busy for 10-22 s (`page.evaluate("() => 1")`
  took 10.1 s and 22.5 s in two runs);
- then the game draws at 0.07-0.24 frames per second;
- Playwright's `click` waits for the element to be *stable* across animation frames, so each click took
  27 s (`#worldbtn`), 19 s (`#region-ehrendingen`), 17 s (`#drivebtn`), close to or over the 30 s default; the
  reload then took 126 s to commit;
- clicking through the DOM (`element.click()` from `page.evaluate`) after the same main-thread stall: all three
  clicks instant, reload committed after 36 s.

The test is about the region choice and the reload URL, not about hit-testing; that the start-screen buttons are
not covered is checked by `test_start_screen_buttons_are_not_covered_by_the_game_nav` (`test_region.py:96-105`).
`open_worlds` also waits for the dialog with the default `requestAnimationFrame` polling (`test_region.py:29`),
which is frame-bound in the same way.

## Design

### A. Region tests click through the DOM (`prototype/tests/test_region.py` only)

- New helper `press(page, sel)`: waits (interval polling every 250 ms, not animation frames; budget 240 s like
  `boot`) until the element exists, has a layout box, is not inside a `[hidden]` ancestor or `visibility:hidden`,
  and is not disabled; then clicks it from a `setTimeout(..., 0)` in the page, so a click that navigates cannot
  destroy the evaluate's context.
- `open_worlds` uses `press(page, "#worldbtn")` and waits for the dialog with `polling=250`.
- `test_choosing_ehrendingen_...` uses `press` for `#region-ehrendingen` and `#drivebtn`. Its assertions and
  the `wait_for_url(..., wait_until="commit", timeout=240000)` stay as they are.
- `test_default_is_hochrhein_and_marked` gets the fix through `open_worlds`. The `#startbtn` click in
  `test_ehrendingen_loads_...` (line 68) is not part of #345 and stays.

### B. Brightness test tells "no picture" from "a dark picture" (`prototype/tests/test_hideout.py` only)

The pixel check is an end-to-end visual check, renderer-dependent by nature; the renderer-independent part (fog,
sky, light values along the tunnel) is already covered by
`test_cave_light_stays_daylight_until_the_deep_point_and_the_tunnel_darkens_locally` (`test_hideout.py:623-646`).
So the pixel test stays, but an all-black frame is no longer read as "dark outside" without checking whether this
browser can return a WebGL picture at all:

- `crop_brightness` (`test_hideout.py:649-655`, used only by this test) also returns the brightest grey of the
  whole frame.
- `GL_PROBE` (a JS string): a fresh 8x8 WebGL2 canvas with `antialias: true` (like the game's renderer,
  `prototype/index.html:1769`) is cleared to white and read back twice -- `readPixels`, and `toBlob` decoded
  through `createImageBitmap` onto a 2D canvas (the game's photo path is `canvas.toBlob`, `index.html:3318`). It
  also reports whether the game's own context (`#gl`) is lost and the unmasked renderer string.
- Pure `frame_verdict(max_grey, probe)`: `"picture"` when the frame has any non-black pixel; `"no-readback"` when
  the frame is all black and the game context is lost or the control picture does not come back white;
  otherwise `"black"`.
- The test asserts `errors == []` and the inside/outside state as today, then: `"no-readback"` -> `pytest.skip`
  with the probe in the reason (visible in the job log); `"picture"` or `"black"` -> the brightness assertions as
  today, with the probe added to their messages. A game that really draws black still fails.
- `frame_verdict` gets a pure test in the same file (no browser).

### Not changed

`conftest.py`, `select_tests.py`, `test-map.json`, `.github/workflows/tests.yml`, the game code. No pytest marker
is registered (a `render` marker is part of open PR#370 in `conftest.py`).

## Assumptions

- **A1** [high] The timeout part of #345 is not re-planned; it is resolved for the required PR check by #371 and
  #369 (run evidence in the table above). Rejected: "select only the changed tests in a changed test file" -- the
  slowest PR shard is at a third of the limit. The `all: true` GPU dispatch overrun is a manual path, recorded,
  not planned.
- **A2** [high] The SwiftShader failure of the brightness test was the missing Pillow, fixed by #377. Evidence: the
  hosted install line had no Pillow before 9c3da56 and `pipeline/requirements.txt` has none; the same test fails
  with `ModuleNotFoundError: No module named 'PIL'` in 39303473049; it passes on local SwiftShader with Pillow.
- **A3** [med] The region tests click through the DOM instead of Playwright's actionability clicks. Rejected:
  larger per-click timeouts (still frame-bound, ~190 s per test, and the maintainer ruled out just raising
  timeouts); a smaller viewport (still frame-bound, and it changes the layout the Worlds dialog is tested at); waiting for
  PR#370's no-render mode (open, its last runs red). Hit-testing of the start-screen buttons stays covered by
  `test_region.py:96-105`.
- **A4** [low] On an all-black frame the brightness test skips only when the same browser cannot read back a
  WebGL picture (control canvas not white, or the game context lost); otherwise it fails as today. The cause on
  the `gpu-odroid` runner was **not measured**: no CI run has reported its renderer or context state, and this
  enrichment cannot run on that runner. Rejected: pinning the test to `gpu-cirrus` (needs per-test runner routing
  in `tests.yml`); fixing the runner image instead (homelab repo, cause unknown); `xfail` on that runner (hides a
  real regression there too). A maintainer may prefer to fix or relabel the runner instead.
- **A5** [high] No change to files the parallel enrichments of #348 and #353 or open PR#370's infrastructure
  touch: not `conftest.py`, `tests.yml`, `gallery.js`, `test_gallery.py`, `test_smoke.py`, `test_holzbruecke.py`,
  `test_underpass.py`. PR#370 does edit `test_hideout.py`; whichever lands second rebases (small, separate hunks).

## Consequences

- A PR that selects `test_hideout.py` and lands that test on a runner which cannot read back WebGL goes green
  with one skipped test instead of red; the skip reason names the renderer. Nothing pages anyone about it.
- If the probe shows the control picture is fine on `gpu-odroid`, the brightness test keeps failing there, now
  with the renderer string in the message: that is then a game bug on that GPU, for a new issue.
- `test_region.py` gets about 2 minutes faster per affected test on SwiftShader (measured: 190 s of clicks and
  reload down to ~36 s).
- Hosted (SwiftShader) runs only happen for fork PRs, `hosted: true`, or as the manual fallback when the GPU
  runners are offline (`tests.yml:80-95`); the region fix matters for those paths.
