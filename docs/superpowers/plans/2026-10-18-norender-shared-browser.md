# Faster browser suite: no-render mode and shared browser (#303) Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-18-norender-shared-browser-design.md`. Item 3 of #303 (remote browser hook) is
> already done (PR#325); do not touch `gpu_browser.py`.

**Goal:** make the browser suite much faster on SwiftShader runners: tests run without drawing by default, and one
browser process serves a whole test file.

**Architecture:** (A) the game skips `renderer.render` when `?norender` or `window.__MM_NORENDER` is set, via a pure
helper in `debug.js`. (B) `conftest.py` swaps `sync_playwright` in every test module for a pool-backed stand-in
(`shared_browser.py`) that reuses one browser per module and injects the no-render flag unless the test carries
`@pytest.mark.render`. (C) `tests.yml` gets manual inputs for an A/B measurement.

## Global Constraints

- Never change a test's assertions or sleeps to make it pass. A test that needs pixels gets `@pytest.mark.render`;
  anything else that fails is reported, not patched.
- Do not fix #353 (`#startbtn` outside the viewport at 480x270: test_smoke, test_drone, test_look_back). If a file
  from that list fails the same way before and after, say so in the PR.
- Commit the branch and push before any long browser run. Browser runs in the foreground, never `run_in_background`.
  Cap memory: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`; on exit 137 run fewer tests,
  do not raise the cap.
- No IPs or hostnames of the homelab in code, docs, PR text or issue comments.
- Buildless stack: no `package.json`, no new dependencies. Conventional Commits; PR title `perf(tests): ...`.
- `conftest.py` and `shared_browser.py` are tooling in `select_tests.py` (`TOOLING`, line 23): add
  `f"{TESTS}/shared_browser.py"` there next to `gpu_browser.py`, so editing it selects the whole suite.

## File Structure

- Modify `prototype/debug.js` (helper), `prototype/index.html` (`drawFrame`, `NORENDER`, `__mm.rendering`)
- Create `prototype/tests/shared_browser.py`, `prototype/tests/test_shared_browser.py`
- Modify `prototype/tests/conftest.py`, `prototype/tests/select_tests.py` (TOOLING), `prototype/tests/debug.test.mjs`
- Modify `.github/workflows/tests.yml`
- Create `AGENT-NOTES.md`. No CHANGELOG entry: it is player-facing and this is tooling.

---

### Task 1: no-render switch in the game

**Files:** `prototype/debug.js`, `prototype/index.html`, `prototype/tests/debug.test.mjs`

**Interfaces:** `export function noRenderFromQuery(search, flag)` -> boolean. `window.__mm.rendering` -> boolean.

- [ ] **Step 1: write the failing test** (append to `prototype/tests/debug.test.mjs`, add `noRenderFromQuery` to its import)

```js
test('noRenderFromQuery: ?norender or the init-script flag switch drawing off, 0/false/off/no and nothing leave it on', () => {
  for (const q of ['?norender', '?norender=1', '?x=1&norender', '?norender=TRUE']) assert.equal(noRenderFromQuery(q, undefined), true, q);
  for (const q of ['', '?', '?norender=0', '?norender=false', '?norender=Off', '?norender=no', '?norenderx=1']) assert.equal(noRenderFromQuery(q, undefined), false, q);
  assert.equal(noRenderFromQuery('', true), true);
  assert.equal(noRenderFromQuery('', false), false);
  assert.equal(noRenderFromQuery('?norender', false), true);
});
```

- [ ] **Step 2: run it, expect failure.** `node --test prototype/tests/debug.test.mjs` (`noRenderFromQuery` is not exported).

- [ ] **Step 3: implement** in `prototype/debug.js` after `debugFromQuery`:

```js
// #303: logic tests do not need a picture. ?norender, or window.__MM_NORENDER = true (a test's init script), skips drawing.
export function noRenderFromQuery(search, flag) {
  if (flag === true) return true;
  const p = new URLSearchParams(search);
  return p.has('norender') && !OFF.has(p.get('norender').toLowerCase());
}
```

- [ ] **Step 4: wire it into `prototype/index.html`.**
  - add `noRenderFromQuery` to the `./debug.js` import (line ~352)
  - right after `window.__mm = {...}` (line ~676): `const NORENDER = noRenderFromQuery(location.search, window.__MM_NORENDER); window.__mm.rendering = !NORENDER;`
  - add above `function loop`:

```js
// #303: the one draw tail. No-render keeps the world matrices current (what renderer.render would do) and draws nothing.
function drawFrame(paused) {
  if (NORENDER) { scene.updateMatrixWorld(); camera.updateMatrixWorld(); return; }
  renderer.render(scene, camera); if (photoPending) capturePhoto(); drawMirror(paused);
}
```

  - in `loop`, replace the paused tail `renderer.render(scene, camera); if (photoPending) capturePhoto(); drawMirror(true);` by `drawFrame(true);` and the running tail `renderer.render(scene, camera); if (photoPending) capturePhoto(); drawMirror(false);` by `drawFrame(false);`. Nothing else in `loop` changes. Grep that no other `renderer.render(scene, camera)` remains outside `drawFrame` (the mirror's own render calls stay).

- [ ] **Step 5: verify.** `node --test prototype/tests/*.test.mjs` green. Then one throwaway browser script in the foreground (hand layout, world blocked, as `start_hand` in `test_lights.py`): `index.html?norender` -> after start `window.__mm.rendering === false` and the sim still advances (use a hook the existing tests use); without the query `rendering === true`. Do not commit the script.

- [ ] **Step 6: commit** `perf(tests): add a no-render switch to the game (#303)`

### Task 2: shared browser pool and conftest wiring

**Files:** create `prototype/tests/shared_browser.py`, `prototype/tests/test_shared_browser.py`; modify `conftest.py`, `select_tests.py`

**Interfaces:** `NORENDER_SCRIPT`; `BrowserPool(launch, reuse=True)` with `.get(args, kwargs)` -> `BrowserProxy`, `.norender`, `.close_all()`; `shared_sync_playwright(pool)` -> a `sync_playwright` replacement.

- [ ] **Step 1: write the failing tests** `prototype/tests/test_shared_browser.py` (fakes, no browser)

```python
"""#303: the shared browser pool, tested with fakes. No browser is started here."""
import shared_browser as sb


class FakeContext:
    def __init__(self): self.scripts, self.closed = [], False
    def add_init_script(self, script): self.scripts.append(script)
    def close(self): self.closed = True


class FakeBrowser:
    def __init__(self): self.contexts, self.connected, self.closes = [], True, 0
    def is_connected(self): return self.connected
    def new_context(self, **kw): c = FakeContext(); self.contexts.append(c); return c
    def new_page(self, **kw): return self.new_context()   # the page stands in for its context: it has add_init_script
    def close(self): self.closes += 1


def make_pool(reuse=True):
    launched = []
    def launch(*a, **k): b = FakeBrowser(); launched.append(b); return b
    return sb.BrowserPool(launch, reuse=reuse), launched


def test_same_launch_args_reuse_one_browser_and_other_args_get_another():
    pool, launched = make_pool()
    a, b, c = pool.get((["--x"],), {}), pool.get((["--x"],), {}), pool.get((["--y"],), {})
    assert a.real is b.real and a.real is not c.real and len(launched) == 2


def test_a_disconnected_browser_is_launched_again():
    pool, launched = make_pool()
    pool.get((), {}).real.connected = False
    pool.get((), {})
    assert len(launched) == 2


def test_close_closes_the_contexts_but_not_the_process():
    pool, launched = make_pool()
    proxy = pool.get((), {})
    proxy.new_context(); proxy.new_page()
    proxy.close()
    assert all(c.closed for c in launched[0].contexts) and launched[0].closes == 0


def test_close_all_closes_every_process_once():
    pool, launched = make_pool()
    pool.get((), {}); pool.get((["--y"],), {})
    pool.close_all(); pool.close_all()
    assert [b.closes for b in launched] == [1, 1]


def test_without_reuse_every_launch_is_a_new_process_that_close_ends():
    pool, launched = make_pool(reuse=False)
    a, b = pool.get((), {}), pool.get((), {})
    assert a.real is not b.real and len(launched) == 2
    a.close()
    assert launched[0].closes == 1


def test_norender_adds_the_init_script_to_pages_and_contexts():
    pool, _ = make_pool()
    pool.norender = True
    proxy = pool.get((), {})
    assert proxy.new_page().scripts == [sb.NORENDER_SCRIPT]
    assert proxy.new_context().scripts == [sb.NORENDER_SCRIPT]


def test_render_mode_adds_no_init_script():
    pool, _ = make_pool()
    pool.norender = False
    assert pool.get((), {}).new_page().scripts == []


def test_the_stand_in_hands_out_pool_browsers_and_never_stops_anything():
    pool, launched = make_pool()
    with sb.shared_sync_playwright(pool)() as p:
        p.chromium.launch(args=["--x"])
    assert len(launched) == 1 and launched[0].closes == 0
```

- [ ] **Step 2: run, expect failure.** `python -m pytest prototype/tests/test_shared_browser.py -q` (module missing).

- [ ] **Step 3: implement `prototype/tests/shared_browser.py`**

```python
"""#303: one browser process per test file, and no drawing unless a test asks for it.

conftest.py swaps `sync_playwright` in each test module for `shared_sync_playwright(pool)`, so the tests keep their
`with sync_playwright() as p: br = p.chromium.launch(...)` shape. The first launch in a module starts the browser; later
tests in the same module get the same process (shaders stay compiled) with fresh contexts. `close()` only closes the
test's contexts; the process ends with the module. `reuse=False` gives every launch its own process (the old behaviour)."""
import contextlib

NORENDER_SCRIPT = "window.__MM_NORENDER = true;"


class BrowserProxy:
    def __init__(self, real, pool, owned):
        self.real, self._pool, self._owned = real, pool, owned

    def _prepared(self, target):
        if self._pool.norender:
            target.add_init_script(NORENDER_SCRIPT)
        return target

    def new_context(self, *args, **kwargs):
        return self._prepared(self.real.new_context(*args, **kwargs))

    def new_page(self, *args, **kwargs):
        return self._prepared(self.real.new_page(*args, **kwargs))

    def close(self):
        if self._owned:
            self.real.close()
            return
        for context in list(self.real.contexts):
            context.close()

    def __getattr__(self, name):
        return getattr(self.real, name)


class BrowserPool:
    def __init__(self, launch, reuse=True):
        self._launch, self._reuse, self._browsers, self.norender = launch, reuse, {}, True

    def get(self, args, kwargs):
        if not self._reuse:
            return BrowserProxy(self._launch(*args, **kwargs), self, owned=True)
        key = repr((args, sorted(kwargs.items())))
        browser = self._browsers.get(key)
        if browser is None or not browser.is_connected():
            browser = self._browsers[key] = self._launch(*args, **kwargs)
        return BrowserProxy(browser, self, owned=False)

    def close_all(self):
        browsers, self._browsers = list(self._browsers.values()), {}
        for browser in browsers:
            browser.close()


class _Chromium:
    def __init__(self, pool):
        self._pool = pool

    def launch(self, *args, **kwargs):
        return self._pool.get(args, kwargs)


class _Playwright:
    def __init__(self, pool):
        self.chromium = _Chromium(pool)


def shared_sync_playwright(pool):
    """A `sync_playwright` replacement: its `with` yields a chromium that hands out the pool's browsers and stops nothing."""
    @contextlib.contextmanager
    def sync_playwright():
        yield _Playwright(pool)
    return sync_playwright
```

  Only `chromium.launch` is stood in for; every current test uses nothing else of `p`. If an existing test uses
  another attribute of `p` (grep `p\.\(firefox\|webkit\|devices\|selectors\)` in `prototype/tests`), add a pass-through
  to the real Playwright object for it rather than editing the test.

- [ ] **Step 4: wire `conftest.py`.** Add `import shared_browser`, register the marker in `pytest_configure`
  (`config.addinivalue_line("markers", "render: needs real drawing (pixels, render counters); no-render is off for it (#303)")`) and add:

```python
@pytest.fixture(scope="module", autouse=True)
def _shared_browser(request):
    """#303: one browser process per test file, no-render unless a test is marked `render`.
    MM_SHARED_BROWSER=0 gives every test its own process, MM_RENDER=1 renders everywhere (together: today's behaviour)."""
    from playwright.sync_api import sync_playwright
    started = {}

    def launch(*args, **kwargs):
        if "pw" not in started:
            started["pw"] = sync_playwright().start()
        return started["pw"].chromium.launch(*args, **kwargs)   # goes through the GPU hook and the run counter

    pool = shared_browser.BrowserPool(launch, reuse=os.environ.get("MM_SHARED_BROWSER") != "0")
    module, original = request.module, getattr(request.module, "sync_playwright", None)
    if original is not None:
        module.sync_playwright = shared_browser.shared_sync_playwright(pool)
    POOL["current"] = pool
    yield
    POOL["current"] = None
    pool.close_all()
    if "pw" in started:
        started["pw"].stop()
    if original is not None:
        module.sync_playwright = original


@pytest.fixture(autouse=True)
def _render_mode(request):
    pool = POOL["current"]
    if pool is not None:
        pool.norender = request.node.get_closest_marker("render") is None and os.environ.get("MM_RENDER") != "1"
    yield
```

  with `POOL = {"current": None}` next to `GPU`/`RUNS`. Modules that do not import `sync_playwright` (node-less unit
  tests, `test_gpu_browser.py`) are unaffected: the stand-in is only installed where the name exists, and the real
  Playwright starts only if something launches.

- [ ] **Step 5: tooling list.** Add `f"{TESTS}/shared_browser.py"` and `f"{TESTS}/test_shared_browser.py"`-style entries to `TOOLING` in `select_tests.py` exactly as `gpu_browser.py` is handled; read `test_select_tests.py` first and extend it if it enumerates TOOLING files.

- [ ] **Step 6: verify.** `python -m pytest prototype/tests/test_shared_browser.py prototype/tests/test_select_tests.py prototype/tests/test_gpu_browser.py prototype/tests/test_visual_runs.py -q` green. Then one real module, foreground, capped: `python -m pytest prototype/tests/test_lights.py -v` (one launch in the Visual tests footer) and the same with `MM_SHARED_BROWSER=0 MM_RENDER=1` (today's behaviour) still passes.

- [ ] **Step 7: commit** `perf(tests): one browser per test file and no-render by default (#303)`

### Task 3: A/B inputs in the workflow

**Files:** `.github/workflows/tests.yml`

- [ ] **Step 1:** extend `workflow_dispatch`:

```yaml
  workflow_dispatch:
    inputs:
      tests:
        description: "pytest arguments (files or -k); empty = the diff selection"
        required: false
        default: ""
      legacy:
        description: "true = render everything, one browser per test (the pre-#303 behaviour), for the A/B measurement"
        type: boolean
        default: false
```

- [ ] **Step 2:** in `Select the affected browser tests` pass the input through `env: TESTS: ${{ inputs.tests }}` (never interpolate it into the script) and short-circuit at the top of the run block:
  `if [ -n "$TESTS" ]; then printf '%s\n' "$TESTS" > "$RUNNER_TEMP/selected.txt"; echo "count=1" >> "$GITHUB_OUTPUT"; exit 0; fi`. The empty case keeps today's logic.
- [ ] **Step 3:** in `Browser tests` add `MM_RENDER: ${{ inputs.legacy && '1' || '' }}` and `MM_SHARED_BROWSER: ${{ inputs.legacy && '0' || '' }}` to `env`, take `SECONDS` before and after, and append `mode: legacy|fast` plus the step seconds to `$GITHUB_STEP_SUMMARY`. conftest compares only with `== "0"` / `== "1"`, so empty means unset.
- [ ] **Step 4:** YAML parse check (`python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/tests.yml'))"`), then commit `ci(test): manual inputs for a render/no-render A/B run (#303)`.

### Task 4: opt-outs and the local before/after

**Files:** only test modules that need pixels (a `pytestmark` or decorator added); no assertion changes.

- [ ] **Step 1: baseline and result, same load, foreground, capped.** Twice each, record wall times:
  `time MM_RENDER=1 MM_SHARED_BROWSER=0 python -m pytest prototype/tests/test_hideout.py -k "lift or room" -q`, then
  `time python -m pytest prototype/tests/test_hideout.py -k "lift or room" -q`. The first can take 13-20 min.
- [ ] **Step 2: find the render-dependent tests.** Run the browser suite in no-render mode, module by module, capped. Compare failures with the same module under legacy mode, or with the CI data of `main` plus #353/#345, to avoid hours of local rendering. A test that fails only in no-render and reads pixels or render counters gets `@pytest.mark.render` (module-level `pytestmark = pytest.mark.render` when the whole file is about drawing), with a one-line comment (`# #303: reads the drawn canvas`). Expected candidates: `test_testhub.py`, `test_photo.py`, `test_mirror.py`, `test_shadow.py`, `test_carselect.py`. Any other failure is not marked away: list it as a finding in the PR.
- [ ] **Step 3:** confirm marked tests pass with rendering and the rest pass in no-render.
- [ ] **Step 4: commit** `test(tests): mark the tests that need real drawing (#303)` and push the branch.

### Task 5: CI measurement, docs, PR

**Files:** `AGENT-NOTES.md`, PR description

- [ ] **Step 1: A/B on CI**, same commit, a selection without the #353 files:

```bash
gh workflow run tests.yml --ref <branch> -f legacy=true  -f tests="prototype/tests/test_hideout.py prototype/tests/test_lights.py prototype/tests/test_mirror.py"
gh workflow run tests.yml --ref <branch> -f legacy=false -f tests="prototype/tests/test_hideout.py prototype/tests/test_lights.py prototype/tests/test_mirror.py"
```

  Watch in the foreground (`gh run watch`); if the legacy run hits the 30 min timeout, split the selection and say so. Compare the two "mode / step seconds" summaries and Durations tables. Target: at least 2x on the step time.
- [ ] **Step 2: timeout.** Keep `timeout-minutes: 30` (#345) unless the numbers show the full suite fits with ample margin and a lower value would catch hangs sooner; then change it in this PR and say why. Otherwise note the new headroom in the PR.
- [ ] **Step 3: `AGENT-NOTES.md`** (create, repo root, short): "Browser tests: no-render and the shared browser": what `?norender` / `window.__MM_NORENDER` do; tests are no-render by default and `@pytest.mark.render` opts out; `MM_RENDER=1`, `MM_SHARED_BROWSER=0`; one browser per file and what it means for isolation (fresh contexts only); the A/B recipe from Step 1; `conftest.py` and `shared_browser.py` select the whole suite; #353 is a known unrelated red set.
- [ ] **Step 4: PR** to `main`, title `perf(tests): no-render mode and one browser per test file (#303)`, body: Summary, local and CI before/after numbers, the `render`-marked tests with reasons, unrelated findings, `Closes #303`.
- [ ] **Step 5:** final run of `node --test prototype/tests/*.test.mjs` and `python -m pytest prototype/tests/test_shared_browser.py prototype/tests/test_select_tests.py -q`; commit and push.
