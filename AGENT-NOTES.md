# Agent notes

Repo-local, agent-facing conventions that don't belong in the generated `CLAUDE.md`.

## Browser tests: no-render and the shared browser (#303)

On SwiftShader (GitHub-hosted runners, agent-dev) a drawn frame of the 453k-triangle world costs
seconds. Most Playwright tests only read numbers off `window.__mm` and never need a picture, so
the suite now runs without drawing and shares one browser process per test file.

### No-render mode

`?norender` in the URL, or `window.__MM_NORENDER = true` set before the page runs (what the test
harness does via an init script), makes `drawFrame()` in `prototype/index.html` skip
`renderer.render`, the photo capture and the mirror pass. It still calls
`scene.updateMatrixWorld()` / `camera.updateMatrixWorld()`, so world-matrix reads stay valid.
Everything else is untouched: the fixed-timestep simulation, physics, the 2D minimap and the DOM
HUD all keep running, and `window.__mm.rendering` reports which mode the page is in.

The query/flag parsing is the pure helper `noRenderFromQuery` in `prototype/debug.js`, unit-tested
in `prototype/tests/debug.test.mjs` (`node --test prototype/tests/*.test.mjs`).

### Tests

`prototype/tests/conftest.py` swaps `sync_playwright` in each test module for the pool-backed
stand-in from `prototype/tests/shared_browser.py`, so tests keep their usual

```python
with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
```

shape and need no changes. Within one module, launches with the same arguments get the **same
browser process** (the SwiftShader shader compile is paid once); `browser.close()` closes only
that test's contexts, and the process ends with the module. Isolation is per context, which is
what the tests rely on — `localStorage`, cookies and page state are still fresh for every test.
Only the process (shader and disk cache) is shared.

No-render is **on by default**. A test that genuinely needs pixels carries
`@pytest.mark.render` (or `pytestmark = pytest.mark.render` for a whole file). Currently marked:

| test | why |
|---|---|
| `test_photo.py` (file) | reads the saved PNG of the 3D view |
| `test_mirror.py` (file) | counts the mirror's render passes |
| `test_hideout.py::test_the_opening_seen_from_inside_the_tunnel_is_as_bright_as_outside` | cave-brightness check, reads `__mm.photoUrl()` |
| `test_testhub.py::test_screenshot_hook_returns_a_png_data_url_and_rejects_a_second_request` | the Testhub screenshot hook |

Environment switches:

| variable | effect |
|---|---|
| `MM_RENDER=1` | render everywhere, as if every test were marked `render` |
| `MM_SHARED_BROWSER=0` | one browser process per test, as before #303 |

Both together reproduce the pre-#303 behaviour — that is the A/B baseline, and what to use when
debugging a test by eye.

```bash
# before (today's behaviour)   /   after
time MM_RENDER=1 MM_SHARED_BROWSER=0 python -m pytest prototype/tests/test_hideout.py -k "lift or room" -q
time python -m pytest prototype/tests/test_hideout.py -k "lift or room" -q
```

`PW_CDP_ENDPOINT` (the GPU browser, #304/#325) is unaffected: the pool launches through
`BrowserType.launch`, so the GPU hook and the visual-run counter still see every launch.

### Things to know

- `conftest.py`, `select_tests.py` and `shared_browser.py` are **tooling** in
  `select_tests.py`'s `TOOLING` list: editing one of them selects the smoke set plus the pure
  self-tests on CI.
- `test_visual_runs` now records one launch per module instead of per test, so the "Visual tests"
  PR comment has fewer rows than before.
- `#353` is a known, unrelated red set: `#startbtn` is outside the viewport at 480x270. It is
  **not** limited to the three files the issue names (`test_smoke.py`, `test_drone.py`,
  `test_look_back.py`) — measured on `main`, the button's box at that viewport is
  `top=-78 bottom=-14` against an `innerHeight` of 270, i.e. entirely above the viewport, so
  every one of the 26 call sites that pairs 480x270 with `page.click("#startbtn")` cannot click
  it. `test_lights.py` and `test_hideout.py` are in that group. It is layout, not rendering, and
  it reproduces identically with and without no-render — don't try to fix it here, and don't use
  a 480x270 file to measure test speed (the 180 s click timeout swamps the signal).
