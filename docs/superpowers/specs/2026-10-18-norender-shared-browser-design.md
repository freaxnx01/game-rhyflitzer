# Faster browser suite: no-render mode and one browser per test file (#303)

Status: enriched 2026-10-18 (headless `/enrich`, no human gate). Goal set by the maintainer on 2026-10-18: make the
browser suite much faster on GitHub-hosted runners (SwiftShader). One PR's suite took 27 min (PR#350, close to the
30 min timeout of #345). Step 1 of the faster-tests plan; the isolated self-hosted GPU runner (#369) comes after.

## Scope of #303

1. No-render mode for logic tests: **this spec.**
2. One browser per test file: **this spec.**
3. Remote browser hook: **already done** (PR#325: `PW_CDP_ENDPOINT`, `prototype/tests/gpu_browser.py`). Not re-planned.
   The new browser pool sits above it, so a GPU browser keeps working.

**Out of scope:** #353 (red tests on main), the GPU runner (#369), changing any test's assertions.

## Today (evidence)

- Almost every test does `with sync_playwright() as p:` and `p.chromium.launch(args=ARGS)` itself, 80 launches in
  56 files (`prototype/tests/test_hideout.py:21-22`, `test_lights.py:13-14`). `test_hideout.py` has 27 tests, so
  27 browsers, 27 first frames.
- Under SwiftShader the first frame takes 30 s+ (shader compile) and every frame ~1-10 s afterwards, because
  `loop()` always ends in `renderer.render(scene, camera); if (photoPending) capturePhoto(); drawMirror(...)`
  (`prototype/index.html:3014-3015`). Nearly all tests only read numbers through `window.__mm`.
- `BrowserType.launch` is already wrapped twice in `prototype/tests/conftest.py:15-33` (GPU hook, then the
  visual-runs counter), so a launch seam exists. `select_tests.py:23` lists `conftest.py` and its helper modules
  as tooling that selects the whole suite: touching them is expected to run everything on the PR.
- Few tests need pixels or GPU state: `test_testhub.py` (Testhub screenshot), `test_photo.py` (`capturePhoto`),
  `test_mirror.py` (`__mm.mirror().renders`), `test_shadow.py`, `test_carselect.py` (car-select scene).
  The implementer finds the exact set empirically (Task 4).
- `#startbtn` outside the 480x270 viewport times out `Page.click` in test_smoke/test_drone/test_look_back (#353).
  Layout, not rendering: no-render neither fixes nor worsens it.

## Design

### A. No-render mode (game side)

- `noRenderFromQuery(search, flag)` in `prototype/debug.js` (pure, node-tested): true when `?norender` is present and
  not `0/false/off/no`, or when `flag === true`. The flag is `window.__MM_NORENDER`, set by an init script, so tests
  that build their own URLs need no change.
- `index.html` reads it once into `NORENDER`, exposes `window.__mm.rendering = !NORENDER`, and folds the two identical
  draw tails of `loop()` into one `drawFrame(paused)`. With `NORENDER` it does only
  `scene.updateMatrixWorld(); camera.updateMatrixWorld();` (what `renderer.render` would have done for world
  matrices, so `getWorldPosition`-style reads stay right) and returns. Simulation, physics, HUD, DOM, toasts, sound,
  `requestAnimationFrame` keep running. No shader is ever compiled, no geometry uploaded.
- Normal play and `?norender`-less pages are byte-for-byte the same behaviour.

### B. Shared browser per test file (test side)

- New `prototype/tests/shared_browser.py`, plain functions and classes, unit-tested with fakes (no browser):
  - `BrowserPool`: caches one real browser per `(launch args, kwargs)` key; relaunches if `is_connected()` is false.
  - `BrowserProxy`: delegates to the real browser; `new_page` / `new_context` add the no-render init script when the
    pool says so; `close()` closes the browser's contexts only (the process lives on, shaders stay compiled).
  - `shared_sync_playwright(pool)`: a stand-in for `sync_playwright` whose `with` yields an object with
    `.chromium.launch(...)` -> pooled proxy, and whose exit does nothing. Real Playwright starts lazily on first use
    and stops at module teardown.
- `conftest.py`: a module-scoped autouse fixture builds the pool and replaces `sync_playwright` in the test module's
  namespace (`request.module`), so the 56 files stay untouched. A function-scoped autouse fixture sets
  `pool.norender` from the `render` marker. Pool is closed at module teardown.
- Opt-outs: `@pytest.mark.render` (per test, or `pytestmark` per module) = real rendering, for pixel and look tests;
  env `MM_RENDER=1` = rendering everywhere; env `MM_SHARED_BROWSER=0` = old behaviour (a browser per test). Both envs
  together reproduce today's suite exactly, which is the baseline of the CI measurement.

### C. Measuring on CI

`tests.yml` gets `workflow_dispatch` inputs: `tests` (pytest arguments; empty = the diff selection as today) and
`legacy` (boolean; sets `MM_RENDER=1 MM_SHARED_BROWSER=0`). Run the same commit twice
(`gh workflow run tests.yml --ref <branch> -f tests=... -f legacy=true|false`) and compare the "Durations" summary
and the step time. The numbers go into the PR description and the issue.

## Assumptions

- **A1** [high] No-render skips `renderer.render` entirely instead of drawing a tiny canvas. Rejected: a reduced
  scene (trees/buildings hidden), because the render call itself is what costs and hiding objects would change what
  tests can observe. Evidence: all per-frame cost is behind `index.html:3014-3015`.
- **A2** [med] `scene.updateMatrixWorld()` per frame is kept so world-matrix reads stay valid. Rejected: skipping it
  (risk of stale matrices). If it measures as expensive on the 85k-tree world, the implementer may drop it only when
  the suite stays green.
- **A3** [high] Item 2 is done by patching `sync_playwright` in each test module from conftest, not by editing 56
  files. Rejected: a `browser` fixture migration (huge diff, touches every test). Evidence: tests launch inline
  (`test_hideout.py:21`).
- **A4** [med] Default is no-render for every test, with explicit `render` marks for the ones that fail without it
  for an inherent reason (they read pixels or render counters). Rejected: opt-in no-render per file (the speed-up
  would not reach 56 files). A test is marked only if it needs pixels; a test that fails otherwise is a finding.
- **A5** [med] State leaking between tests in one browser is limited to the process (shader/disk cache): every test
  still gets fresh contexts, and `close()` closes them. localStorage is per context, so no leakage.
- **A6** [high] The docs go to a new `AGENT-NOTES.md` (the file `CLAUDE.md` names for repo-local conventions); the
  generated `CLAUDE.md` / `.ai/stacks/browser-game.md` are not edited by hand.
- **A7** [med] The 30 min timeout (#345) stays at first; it is changed only if the measured numbers justify it.
- **A8** [high] The CI A/B uses a fixed `tests=` selection that excludes the #353 files, so their timeouts do not
  distort the comparison.

## Consequences

- `conftest.py` is tooling, so the PR runs the entire suite on CI once (expected, and a good first data point).
- `test_visual_runs` records one launch per module instead of per test; the "Visual tests" comment shows fewer rows.
- Tests that need a fresh browser process (a crashed GPU context, `launch` args that differ) get their own pool
  entry via the args key; `is_connected()` guards a dead one.
- Anyone debugging by eye can run `MM_RENDER=1` or mark the test `render`.

## Acceptance criteria

- [ ] `?norender` / `window.__MM_NORENDER` skips drawing; simulation and HUD keep running; node test for the helper.
- [ ] `pytest prototype/tests/test_hideout.py -k "lift or room"` runs at least 3x faster than with
      `MM_RENDER=1 MM_SHARED_BROWSER=0`, measured twice on the same machine under the same load.
- [ ] Tests that need pixels carry `@pytest.mark.render` and still render and pass.
- [ ] One browser process per test file (unit-tested pool; visible as one launch per module in the Visual tests comment).
- [ ] `MM_RENDER=1 MM_SHARED_BROWSER=0` reproduces today's behaviour; with `PW_CDP_ENDPOINT` set it still works.
- [ ] CI A/B on GitHub-hosted runners reported (before/after, same commit and selection); target at least 2x.
- [ ] No test assertion changed. Documented in `AGENT-NOTES.md`. #353 untouched.
