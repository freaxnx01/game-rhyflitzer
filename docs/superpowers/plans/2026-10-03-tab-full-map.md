# Tab = Full Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While **Tab** is held, the minimap grows into a big map in the middle of the screen showing the whole region (1×); releasing Tab restores the corner minimap at the player's zoom. The 3× time-lapse and its "not counted" race flag (`R.fast`) are removed (#77).

**Architecture:** No second map renderer. `hud()` in `prototype/index.html` reads `keys.Tab && $('overlay').hidden` every frame and calls `setFullMap(full)`, which flips `MAP.full`, toggles the CSS class `full` on `#br` and re-renders the `#mapzoom` label. `mapView()` uses zoom 1 while `MAP.full`, so `drawMap`, `worldToMap`, `mapToWorld` and the double-click placement follow automatically. CSS `#br.full` centres the panel and enlarges the existing 800×400 canvas. The time-lapse loop, `R.fast`, `notCountedFast` and the hooks that exposed them go.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, Playwright smoke tests with pytest, `node --test` for `strings.js`.

**Spec:** `docs/superpowers/specs/2026-10-03-tab-full-map-design.md`

## Global Constraints

- **Hold, not toggle.** No new Tab handling in the `keydown` listener (`index.html:889`); `keys.Tab` is already set/cleared by the generic `keydown`/`keyup`/`blur` handlers and by `openJump()`. Keep `'Tab'` in the listener's `preventDefault` list.
- Tab does nothing while `#overlay` (start/result screen) is visible — same gate as C.
- The game keeps running while the full map is shown (no pause, no slow motion).
- `MAP.zoom` is **not** changed by Tab; the full map always shows 1×, and the chosen zoom returns on release. `#mapzoom` shows the zoom on screen (`1×` while full).
- Full-map CSS, verbatim: `#br.full{left:50%;top:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);z-index:20}` and `#br.full #map{width:min(92vw,calc((100vh - 80px) * 2));height:auto}`.
- Help text: `keyTab` en `full map (hold)`, de `ganze Karte (halten)`. Strings go through `tr()`; `prototype/strings.js` keeps identical key sets in `en` and `de` (`strings.test.mjs` enforces it; Swiss spelling, no `ß`).
- Remove `R.fast` completely (keydown line, `startRace` reset, `finish` check, `resultHtml` part, `notCountedFast` en+de, `fast` in `__mm.raceFlags()`), `HUD.scale`, the per-frame ×3 loop, and `timeScale` in `__mm.hud()`. `R.jumped` / `notCountedJump` stay untouched.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must not call `rr()` or `rnd()`.
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged and green, **except** `test_hud_bundle` (`prototype/tests/test_smoke.py:415`, `:426`), which pins the removed time-lapse and is updated in Task 2 as specified there.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs`. Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_full_map.py -q`. These runs are slow. Run them in the **foreground only, never `run_in_background`**. Exit 137 = memory cap hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **Double-click on the full map** must put the car where the player clicked (the view is 1× and the canvas is much larger). Pinned by `test_double_click_on_the_full_map_places_the_car`.
- **Small screens:** under 900 px width the `#map` rule shrinks the canvas; the full map must still be big and must stay inside the viewport. Pinned by `test_full_map_fits_a_small_screen`.
- **Zoom keys while full:** `+`/`-` change `MAP.zoom` but the full map keeps showing 1× and the label `1×`; after release the new zoom shows. Pinned in `test_hold_tab_shows_the_whole_map_big_and_centred` (press `+` while held).
- **Window loses focus while Tab is held** (Alt-Tab): the existing `blur` handler clears `keys`, so the full map closes on the next frame. No new code; checked by hand (test-todo).
- **Start overlay:** holding Tab on the start screen must not open the map behind the overlay. Pinned by `test_tab_does_nothing_on_the_start_screen`.

---

### Task 1: Hold Tab shows the whole map, big and centred

**Files:**
- Create: `prototype/tests/test_full_map.py`
- Modify: `prototype/index.html` — CSS after `:54`; `MAP`/`mapView`/`stepMapZoom`/`__mm.map` at `:1057-1069`; `hud()` at `:1099`

**Interfaces:**
- Consumes: `keys` (`:889`), `$` (`:1001`), `MAP`, `ZOOMS`, `mapView()`, `stepMapZoom(dir)`, `drawMap()`, `__mm.map()`.
- Produces: `MAP.full` (bool, initially `false`); `setFullMap(full: boolean): void`; `renderMapZoom(): void`; `__mm.map()` → `{ zoom, full, cx, cz }`. Task 2 uses `__mm.map().full`.

- [ ] **Step 1: Write the failing tests**

Create `prototype/tests/test_full_map.py`:

```python
"""#77: hold Tab = the whole map (1x), big in the middle of the screen; release = the corner minimap at the chosen
zoom. The 3x time-lapse (#20) and its "not counted" flag are gone. Hand-traced layout (world + terrain blocked): no
data files needed, deterministic. (1780, 560) and (1660, 330) are vertices of the hand Bahnhofstrasse."""
import math

import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SISSELN = (1780, 560)   # hand Bahnhofstrasse vertex = checkpoint 1, Bahnhof Sisseln
UPHILL = (1660, 330)    # hand Bahnhofstrasse vertex, 260 m from SISSELN


def open_hand(p, server, width=1280, height=720):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": width, "height": height})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def mm(page):
    return page.evaluate("() => window.__mm.map()")


def box(page, sel):
    return page.locator(sel).bounding_box()


def car(page):
    return page.evaluate("() => window.__mm.car()")


def hold_tab(page):
    page.keyboard.down("Tab")
    page.wait_for_function("() => window.__mm.map().full === true", timeout=120000)


def release_tab(page):
    page.keyboard.up("Tab")
    page.wait_for_function("() => window.__mm.map().full === false", timeout=120000)


def wait_frames(page, n=3):
    """A headless tab only renders while a raf-polled wait drives it, so count frames instead of waiting on the clock."""
    page.evaluate("() => { if (window.__frames === undefined) { window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } }")
    f0 = page.evaluate("() => window.__frames")
    page.wait_for_function("f0 => window.__frames > f0 + %d" % n, arg=f0, timeout=120000)


def on_map(page, x, z):
    """Client (CSS px) position of world point (x, z) on the map canvas (800x400 buffer, any CSS size)."""
    px, py = page.evaluate(f"() => window.__mm.worldToMap({x}, {z})")
    bb = box(page, "#map")
    return bb["x"] + px * bb["width"] / 800, bb["y"] + py * bb["height"] / 400


def test_tab_does_nothing_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.down("Tab"); wait_frames(page)
        held = mm(page); width = box(page, "#map")["width"]
        page.keyboard.up("Tab")
        b.close()
    assert held["full"] is False and width == pytest.approx(400, abs=1)


def test_hold_tab_shows_the_whole_map_big_and_centred(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")
        whole = mm(page)
        page.keyboard.press("NumpadAdd"); page.keyboard.press("NumpadAdd")
        zoomed = mm(page)
        hold_tab(page)
        full = mm(page); label_full = page.text_content("#mapzoom"); big = box(page, "#map"); panel = box(page, "#br")
        page.keyboard.press("NumpadAdd"); wait_frames(page)                     # zoom key while full: 8x is remembered, 1x stays on screen
        full_after_plus = mm(page); label_after_plus = page.text_content("#mapzoom")
        release_tab(page)
        back = mm(page); label_back = page.text_content("#mapzoom"); small = box(page, "#map")
        b.close()
    assert whole["zoom"] == 1 and zoomed["zoom"] == 4
    assert full["full"] is True and full["zoom"] == 4 and label_full == "1×"
    assert (full["cx"], full["cz"]) == pytest.approx((whole["cx"], whole["cz"]), abs=0.5)   # the whole region
    assert big["width"] > 1000, big
    assert abs(panel["x"] + panel["width"] / 2 - 640) <= 2 and abs(panel["y"] + panel["height"] / 2 - 360) <= 2, panel
    assert full_after_plus["zoom"] == 8 and full_after_plus["full"] is True and label_after_plus == "1×"
    assert (full_after_plus["cx"], full_after_plus["cz"]) == pytest.approx((whole["cx"], whole["cz"]), abs=0.5)
    assert back["full"] is False and back["zoom"] == 8 and label_back == "8×"
    assert small["width"] == pytest.approx(400, abs=1)


def test_full_map_fits_a_small_screen(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server, 800, 450)
        page.click("#startbtn")
        hold_tab(page)
        big = box(page, "#map"); panel = box(page, "#br")
        release_tab(page)
        b.close()
    assert big["width"] > 600, big                                              # bigger than the 240 px small-screen minimap
    assert panel["x"] >= 0 and panel["y"] >= 0, panel
    assert panel["x"] + panel["width"] <= 800 and panel["y"] + panel["height"] <= 450, panel


def test_double_click_on_the_full_map_places_the_car(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        hold_tab(page)
        page.mouse.dblclick(*on_map(page, *UPHILL))
        placed = car(page); road = page.evaluate("() => window.__mm.roadDist()")
        release_tab(page)
        b.close()
    assert math.hypot(placed["x"] - UPHILL[0], placed["z"] - UPHILL[1]) < 30 and road < 0, (placed, road)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_full_map.py -q`
Expected: FAIL. `test_tab_does_nothing_on_the_start_screen` fails with `KeyError: 'full'`; the other three time out in `hold_tab` (`__mm.map().full` is `undefined`).

- [ ] **Step 3: Add the CSS**

In `prototype/index.html`, insert a new line directly after the `@media (max-width:900px){#speedo…}` line (`:54`):

```css
#br.full{left:50%;top:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);z-index:20}#br.full #map{width:min(92vw,calc((100vh - 80px) * 2));height:auto}
```

(two ids → it overrides the `max-width:900px` `#map` size too)

- [ ] **Step 4: Full-map state in the minimap code**

At `index.html:1056-1062`, change the `MAP` line, `mapView`, and `stepMapZoom`, and add `renderMapZoom`/`setFullMap` after `stepMapZoom`:

```js
// minimap zoom (#11): 1x = the whole region; zoomed in, the view follows the car but stays on the map. The view is a crop of mapStatic (base 1x canvas px ox/oy = its centre). Tab held (#77): MAP.full shows the whole region big, MAP.zoom is kept
const MAP = { zoom: 1, full: false, wheel: 0, tapT: 0, tapX: 0, tapY: 0, placedT: 0 }, ZOOMS = [1, 2, 4, 8];
function mapView() { const z = MAP.full ? 1 : MAP.zoom, w = mapC.width, h = mapC.height; return { z, ox: clamp(MX(P.x), w / 2 / z, w - w / 2 / z), oy: clamp(MZ(P.z), h / 2 / z, h - h / 2 / z) }; }
```

```js
function stepMapZoom(dir) { MAP.zoom = ZOOMS[clamp(ZOOMS.indexOf(MAP.zoom) + dir, 0, ZOOMS.length - 1)]; renderMapZoom(); }
function renderMapZoom() { $('mapzoom').textContent = (MAP.full ? 1 : MAP.zoom) + '×'; }
// #77: hold Tab = full map; #br gets the class `full` (CSS centres and enlarges it), only on a change
function setFullMap(full) { if (full === MAP.full) return; MAP.full = full; $('br').classList.toggle('full', full); renderMapZoom(); }
```

Change `__mm.map` (`:1069`) to also return `full`:

```js
window.__mm.map = () => { const [cx, cz] = mapToWorld(mapC.width / 2, mapC.height / 2); return { zoom: MAP.zoom, full: MAP.full, cx, cz }; };
```

(keep the rest of that line — `window.__mm.mapToWorld = …; window.__mm.worldToMap = …;` — unchanged)

- [ ] **Step 5: Read Tab every frame**

In `hud(dt)` (`:1099`), replace the single `drawMap();` with:

```js
setFullMap(!!keys.Tab && $('overlay').hidden); drawMap();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_full_map.py -q`
Expected: 4 passed.

Then: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q`
Expected: all pass (the minimap without Tab is unchanged).

- [ ] **Step 7: Commit**

```bash
git add prototype/index.html prototype/tests/test_full_map.py
git commit -m "feat(controls): hold Tab to show the whole map (#77)"
git push -u origin HEAD
```

---

### Task 2: Remove the 3× time-lapse and `R.fast`; help, smoke test, changelog

**Files:**
- Modify: `prototype/tests/test_full_map.py` (append)
- Modify: `prototype/tests/test_smoke.py:385-426` (`test_hud_bundle`)
- Modify: `prototype/index.html` — help line `:114`, keydown `:889`, `__mm.hud` `:932`, `__mm.raceFlags` `:942`, `startRace` `:1004`, `finish` `:1007`, `resultHtml` `:1008`, `loop` `:1104`
- Modify: `prototype/strings.js:33`, `:86`, `:131`, `:181`
- Modify: `CHANGELOG.md:21`

**Interfaces:**
- Consumes: `hold_tab(page)`, `release_tab(page)`, `open_hand`, `__mm.map().full` from Task 1; `__mm.finishNow()` (`:1046`).
- Produces: `__mm.raceFlags()` → `{ jumped }`; `__mm.hud()` without `timeScale`.

- [ ] **Step 1: Write the failing test**

Append to `prototype/tests/test_full_map.py`:

```python
def test_tab_no_longer_speeds_up_and_the_run_counts(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")                                                 # race armed
        hold_tab(page); release_tab(page)
        flags = page.evaluate("() => window.__mm.raceFlags()")
        hud = page.evaluate("() => window.__mm.hud()")
        page.evaluate("() => window.__mm.finishNow()")
        result = page.text_content("#overlay")
        best = page.evaluate("() => localStorage.getItem('mm.best2')")
        help_text = page.text_content("#help")
        b.close()
    assert "fast" not in flags and flags["jumped"] is False, flags
    assert "timeScale" not in hud, hud
    assert "time-lapse" not in result and "not counted" not in result, result
    assert best is not None                                                     # the first finish is saved as the best time
    assert "full map (hold)" in help_text and "×3" not in help_text, help_text
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_full_map.py -q -k no_longer`
Expected: FAIL on `assert "fast" not in flags` (the Tab press still sets `R.fast`).

- [ ] **Step 3: Remove the time-lapse in `index.html`**

1. `keydown` listener (`:889`): delete exactly `if (e.code === 'Tab' && (R.state === 'armed' || R.state === 'racing')) R.fast = true; ` — keep `'Tab'` in the `preventDefault` array at the end of the listener.
2. `__mm.hud` (`:932`): delete `, timeScale: keys.Tab ? 3 : 1` (the object then ends with `road: HUD.road }`).
3. `__mm.raceFlags` (`:942`): `window.__mm.raceFlags = () => ({ jumped: !!R.jumped });`
4. `startRace` (`:1004`): delete ` R.fast = false;`.
5. `finish` (`:1007`): `if (!R.jumped && !R.fast && (R.best === null || t < R.best))` → `if (!R.jumped && (R.best === null || t < R.best))`.
6. `resultHtml` (`:1008`): delete `${R.fast ? tr('notCountedFast') : ''}`.
7. `loop` (`:1104`): replace
   `HUD.scale = keys.Tab ? 3 : 1; if (keys.Tab && (R.state === 'armed' || R.state === 'racing')) R.fast = true; for (let k = 0; k < HUD.scale; k++) { if (R.state !== 'ready') stepCar(dt); stepRace(dt); }`
   with
   `if (R.state !== 'ready') stepCar(dt); stepRace(dt);`
8. Help line (`:114`): `<kbd>Tab</kbd><span data-i18n="keyTab">full map (hold)</span>`

Afterwards `grep -n "R.fast\|HUD.scale\|notCountedFast\|timeScale" prototype/index.html` must print nothing.

- [ ] **Step 4: Strings**

In `prototype/strings.js`:
- delete the `notCountedFast` line in `en` (`:33`) and in `de` (`:131`);
- `en` `keyTab: 'full map (hold)',` (`:86`);
- `de` `keyTab: 'ganze Karte (halten)',` (`:181`).

Run: `node --test prototype/tests/*.test.mjs`
Expected: all pass (en/de key parity holds).

- [ ] **Step 5: Update `test_hud_bundle`**

The time-lapse it pinned is gone by design (spec, Decisions → Time-lapse). In `prototype/tests/test_smoke.py`:

- docstring (`:386-387`): replace `Tab = game speed x3 (a run that used it is not recorded).` with `Tab held = the whole map, big (#77).`
- line `:415`: replace with
  `page.keyboard.down("Tab"); page.wait_for_function("() => window.__mm.map().full === true", timeout=120000); full_map = page.evaluate("() => window.__mm.map().full"); page.keyboard.up("Tab"); page.wait_for_function("() => window.__mm.map().full === false", timeout=120000); corner_map = page.evaluate("() => window.__mm.map().full")`
- line `:416` (`jumped = page.evaluate(...)`): delete it.
- line `:426`: replace with `assert full_map is True and corner_map is False`

- [ ] **Step 6: CHANGELOG**

In `CHANGELOG.md:21` (`[Unreleased]`, the time-lapse never shipped in a release), replace the sentence `Hold **Tab** to run the game three times faster (that run won't count as a record).` with `Hold **Tab** to see the whole map big in the middle of the screen.`

- [ ] **Step 7: Commit and push before the long runs**

```bash
git add prototype/index.html prototype/strings.js prototype/tests/test_full_map.py prototype/tests/test_smoke.py CHANGELOG.md
git commit -m "feat(controls): drop the 3x time-lapse from Tab (#77)"
git push
```

- [ ] **Step 8: Run the full suite**

Run: `node --test prototype/tests/*.test.mjs`
Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q`
Expected: all pass (`test_hud_bundle` and other world-data tests are skipped if `data/world_hochrhein.json` is not built — that is fine). Foreground only.

- [ ] **Step 9: test-todo**

Append to `test-todo.md` (repo root), under a new `## #77 Tab = full map` heading:

```markdown
- [ ] Hold Tab while driving: the map is big and centred, the car arrow moves, releasing Tab brings back the corner minimap at the old zoom.
- [ ] Hold Tab, then Alt-Tab away and back: the full map is closed.
- [ ] Finish a race after using Tab: the time counts as a record.
```

```bash
git add test-todo.md
git commit -m "docs(test-todo): Tab full map checks (#77)"
git push
```
