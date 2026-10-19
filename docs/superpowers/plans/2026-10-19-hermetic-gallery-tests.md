# Hermetic gallery in browser tests (#348) Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-19-hermetic-gallery-tests-design.md`.

**Goal:** no browser test calls the deployed API's `/api/gallery`, so Chromium logs no CORS console error on a test
page and `test_holzbruecke.py::test_no_console_errors` (and every future console check) is green without loosening it.

**Architecture:** a new test helper `prototype/tests/hermetic_api.py` wraps `Browser.new_context` and
`Browser.new_page` so every new browser context answers the production gallery URL with `200 []` (CORS header set).
`conftest.py` installs the wrappers next to its existing `BrowserType.launch` hooks. It is a context route, so a
test's own `page.route("**/api/gallery", ...)` still wins (`test_gallery.py`, `test_smoke.py:19`).

## Global Constraints

- Never change a test's assertions, console filters or expected-message lists. `test_holzbruecke.py`,
  `test_smoke.py` and `test_world.py` stay byte-for-byte unchanged.
- No game code changes (`prototype/*.js`, `index.html`), no change under `service/`.
- Route only the exact production gallery URL. `?worldhost=` targets and every other URL stay untouched.
- Commit and push before any long browser run. Browser runs in the foreground, never `run_in_background`. Cap memory:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>` where `systemd-run` exists; on exit 137
  run fewer tests, do not raise the cap.
- No IPs or hostnames of the homelab in code, docs, PR text or issue comments.
- Buildless stack: no new dependencies. Conventional Commits; PR title `fix(tests): answer the gallery in every
  browser test so the console checks stay green (#348)`. No CHANGELOG entry: tooling, not player-facing.
- Do not fix #353's other failures (start-button click, underpass). If you see them, say so in the PR.

## File Structure

- Create `prototype/tests/hermetic_api.py`, `prototype/tests/test_hermetic_api.py`
- Modify `prototype/tests/conftest.py` (install/remove the wrappers)
- Modify `prototype/tests/select_tests.py` (`TOOLING`, line 23)

---

### Task 1: the gallery route helper

**Files:** `prototype/tests/hermetic_api.py`, `prototype/tests/test_hermetic_api.py`

**Interfaces:** `GALLERY: str`; `answer_empty_gallery(route) -> None`; `route_gallery(context) -> None`;
`hermetic_new_context(original) -> callable`; `hermetic_new_page(original) -> callable`.

- [ ] **Step 1: write the failing tests** (`prototype/tests/test_hermetic_api.py`)

```python
"""#348: the gallery route every browser test gets (hermetic_api.py). The pure tests use fakes; the last one opens the game."""
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

import hermetic_api

ROOT = Path(__file__).parents[2]
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ROUTED = [(hermetic_api.GALLERY, hermetic_api.answer_empty_gallery)]


class FakeContext:
    def __init__(self):
        self.routes = []

    def route(self, url, handler):
        self.routes.append((url, handler))


class FakePage:
    def __init__(self):
        self.context = FakeContext()


class FakeRoute:
    def __init__(self):
        self.fulfilled = None

    def fulfill(self, **kwargs):
        self.fulfilled = kwargs


def test_new_context_routes_the_gallery_on_the_context_it_returns():
    made = FakeContext()
    new_context = hermetic_api.hermetic_new_context(lambda self, *args, **kwargs: made)
    assert new_context(object(), viewport={"width": 1, "height": 1}) is made
    assert made.routes == ROUTED


def test_new_page_routes_the_gallery_on_the_page_context():
    made = FakePage()
    new_page = hermetic_api.hermetic_new_page(lambda self, *args, **kwargs: made)
    assert new_page(object()) is made
    assert made.context.routes == ROUTED


def test_the_wrappers_pass_their_arguments_through():
    seen, browser = [], object()

    def original(self, *args, **kwargs):
        seen.append((self, args, kwargs))
        return FakePage()

    hermetic_api.hermetic_new_page(original)(browser, 1, locale="de-CH")
    assert seen == [(browser, (1,), {"locale": "de-CH"})]


def test_the_gallery_is_an_empty_list_a_cross_origin_page_may_read():
    route = FakeRoute()
    hermetic_api.answer_empty_gallery(route)
    assert route.fulfilled == {"status": 200, "headers": {"Access-Control-Allow-Origin": "*"},
                               "content_type": "application/json", "body": "[]"}


def test_the_routed_url_is_the_game_s_gallery_url():
    worlds_js = (ROOT / "prototype" / "worlds.js").read_text(encoding="utf-8")
    host = re.search(r"export const WORLD_HOST = '([^']+)'", worlds_js).group(1)
    assert hermetic_api.GALLERY == f"{host}/api/gallery"   # galleryUrl() in prototype/gallery.js


def test_a_page_without_its_own_gallery_route_boots_without_console_errors(server):
    """The test_holzbruecke.py view (#353): no gallery stub of its own, and the own-page console messages stay empty."""
    msgs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.on("pageerror", lambda e: msgs.append((str(e), "")))
        page.on("console", lambda m: msgs.append((m.text, m.location.get("url", ""))) if m.type in ("error", "warning") else None)
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => Array.isArray(window.__mm && window.__mm.gallery)", timeout=180000)
        gallery = page.evaluate("() => window.__mm.gallery")
        b.close()
    # the same own-page filter as test_holzbruecke.py: the terrain 404 is on purpose, third-party resources are not under test
    own = [t for t, u in msgs if "terrain_hochrhein.mmh" not in u and (not u or u.startswith(server))]
    assert gallery == []
    assert own == []
```

- [ ] **Step 2: run the pure tests, expect failure.**
  `python -m pytest prototype/tests/test_hermetic_api.py -k "not page_without" -q` — fails with
  `ModuleNotFoundError: No module named 'hermetic_api'`.

- [ ] **Step 3: implement** `prototype/tests/hermetic_api.py`

```python
"""#348: no browser test talks to the deployed API. Every new browser context answers the production gallery URL with an
empty list, so the page's boot-time gallery fetch (index.html showGallery) never leaves the browser and never trips the
API's CORS policy, which admits only the Pages origin and makes Chromium log a console error on a test page. A test's
own page.route() wins over this context route (Playwright: page routes take precedence), so test_gallery.py keeps its
stubs. conftest.py wires it."""
GALLERY = "https://rhyflitzer-api.freaxnx01.ch/api/gallery"   # WORLD_HOST in prototype/worlds.js + /api/gallery
CORS = {"Access-Control-Allow-Origin": "*"}


def answer_empty_gallery(route):
    route.fulfill(status=200, headers=CORS, content_type="application/json", body="[]")


def route_gallery(context):
    context.route(GALLERY, answer_empty_gallery)


def hermetic_new_context(original):
    """A Browser.new_context replacement: the new context answers the gallery."""
    def new_context(self, *args, **kwargs):
        context = original(self, *args, **kwargs)
        route_gallery(context)
        return context
    return new_context


def hermetic_new_page(original):
    """A Browser.new_page replacement: the page's own context answers the gallery before the test navigates."""
    def new_page(self, *args, **kwargs):
        page = original(self, *args, **kwargs)
        route_gallery(page.context)
        return page
    return new_page
```

- [ ] **Step 4: run the pure tests, expect them to pass.**
  `python -m pytest prototype/tests/test_hermetic_api.py -k "not page_without" -q` — 5 passed.

- [ ] **Step 5: commit.** `test(tests): add a gallery route helper for hermetic browser tests (#348)`

### Task 2: install it for every browser test

**Files:** `prototype/tests/conftest.py`, `prototype/tests/select_tests.py`

**Interfaces:** `conftest._install_api_hook()`, `conftest._remove_api_hook()` (module-private).

- [ ] **Step 1: run the browser test, expect failure.** Push first, then
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest prototype/tests/test_hermetic_api.py::test_a_page_without_its_own_gallery_route_boots_without_console_errors -q`
  — fails: `own` holds `"Access to fetch at 'https://rhyflitzer-api.freaxnx01.ch/api/gallery' from origin ... has
  been blocked by CORS policy ..."`. (Without network access the message differs or the test passes by accident;
  note in the PR which one you saw.)

- [ ] **Step 2: wire the hook** in `prototype/tests/conftest.py`. Change the Playwright import and add the module
  import next to the others:

```python
from playwright.sync_api import Browser, BrowserType

import gpu_browser
import hermetic_api
import visual_runs
```

Below `RUN_HOOK = {"launch": None}` add:

```python
# #348: every new browser context answers the production /api/gallery, so no test reaches the deployed API
API_HOOK = {"new_context": None, "new_page": None}
```

After `_install_gpu_hook` add:

```python
def _install_api_hook():
    API_HOOK["new_context"], API_HOOK["new_page"] = Browser.new_context, Browser.new_page
    Browser.new_context = hermetic_api.hermetic_new_context(Browser.new_context)
    Browser.new_page = hermetic_api.hermetic_new_page(Browser.new_page)


def _remove_api_hook():
    if API_HOOK["new_context"] is None:
        return
    Browser.new_context, Browser.new_page = API_HOOK["new_context"], API_HOOK["new_page"]
    API_HOOK["new_context"] = API_HOOK["new_page"] = None
```

Call `_install_api_hook()` as the first line of `pytest_configure`, and `_remove_api_hook()` as the last line of
`pytest_unconfigure`.

- [ ] **Step 3: mark it as tooling** in `prototype/tests/select_tests.py` line 23: add
  `f"{TESTS}/hermetic_api.py"` to `TOOLING` right after `f"{TESTS}/gpu_browser.py"`.

- [ ] **Step 4: run the browser test, expect it to pass.** Same command as Step 1 — 1 passed.

- [ ] **Step 5: run the acceptance set** (foreground, capped):

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest \
  prototype/tests/test_hermetic_api.py prototype/tests/test_select_tests.py prototype/tests/test_gpu_browser.py \
  prototype/tests/test_holzbruecke.py::test_no_console_errors \
  prototype/tests/test_smoke.py::test_hand_traced_fallback prototype/tests/test_smoke.py::test_osm_layout -v
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest prototype/tests/test_gallery.py -v
node --test prototype/tests/*.test.mjs
```

  All pass. `test_gallery.py` proves a test's own `page.route` still wins over the context route. If exit 137, run
  the files one at a time.

- [ ] **Step 6: confirm nothing else moved.** `git diff --stat origin/main` lists only the four files of this plan.

- [ ] **Step 7: commit and open the PR.** Commit `fix(tests): answer the gallery in every browser test (#348)`.
  PR body: the cause (CORS error from the production gallery fetch on a test page), the reproduction before/after,
  that `test_holzbruecke.py::test_no_console_errors` is the #353 row this fixes, and `Closes #348`.
