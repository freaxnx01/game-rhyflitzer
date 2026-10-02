# Minimap Zoom and Double-Click Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player zoom the minimap (1×, 2×, 4×, 8× via mouse wheel over the map and **+**/**-**), keep a zoomed view centred on the car but inside the map, and put the car on the nearest road with a double-click or double-tap on the map. During a race, a placement counts as a jump, the same rule as **J**.

**Architecture:** The pre-rendered `mapStatic` canvas and its 1× transform (`MB`, `MS`, `MX`, `MZ`) stay as they are. A view state `MAP.zoom` and a pure `mapView()` (zoom and the clamped view centre in base canvas px) feed one transform `mapPt`. `drawMap()` blits a crop of `mapStatic` and draws checkpoints, finish and car through `mapPt`. The inverse `mapToWorld` serves the click handler and the test hooks. Placement reuses `jumpTo` from #21.

**Tech Stack:** Vanilla JS + three.js in one buildless file (`prototype/index.html`); Playwright smoke tests with pytest (`prototype/tests/`).

**Spec:** `docs/superpowers/specs/2026-10-02-minimap-zoom-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Small, surgical edits in the dense one-line style of `prototype/index.html` (long single-line statements, short `//` comments). Match the surrounding style and do not reformat neighbouring code.
- No framework, no bundler, no `package.json`, no build step. No new files except the test file `prototype/tests/test_minimap.py`.
- Leave `MB`, `MS`, `MX`, `MZ`, the `mapStatic` pre-render block, `jumpTo`, `placeOnRoad`, `randomSpot` and `finish` unchanged. The map is never re-rendered per frame.
- Zoom steps are exactly `[1, 2, 4, 8]`. Match keys by `e.key` (`'+'`, `'='` → in; `'-'` → out), **not** by `e.code`: on a Swiss keyboard the `Minus` code is the `'`/`?` key, and `?` opens the help.
- Only `#map` gets `pointer-events:auto`. `#hud` keeps `pointer-events:none`.
- All existing tests in `prototype/tests/test_smoke.py` stay unchanged and green.
- Test command (slow, several minutes; run it in the **foreground**, never in the background): `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`. Single file: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q`.
- Commit after every task with Conventional Commits and explicit paths only (`git add <paths>`), ending with the repo's attribution lines. Commit and push the branch **before** long verification runs.

## Review Focus

- **1× must be pixel-identical to today.** `drawImage(mapStatic, sx, sy, sw, sh, 0, 0, w, h)` with the full canvas as the source rect equals the old `drawImage(mapStatic, 0, 0)`. At 1× both clamp bounds collapse to `w/2` and `h/2`, so the view never moves. Test: Task 1 asserts `map()` at 1× does not change when the car moves.
- **One transform for drawing, clicking and hooks.** `drawMap`, `placeFromMap`, `worldToMap` and `mapToWorld` all go through `mapView()`/`mapPt`. Nothing duplicates the maths. Test: Task 1 round trip, Task 3 clicks at `worldToMap` positions.
- **One gesture = one placement.** A browser may fire both the touch detector and a synthesized `dblclick` for the same double-tap. `MAP.placedT` drops a second placement within 500 ms. Not unit-tested; check in review.
- **Canvas vs CSS size:** the canvas is 800×400 and shown at 400×200 (240×120 under 900 px). `placeFromMap` scales by `mapC.width / rect.width`. Task 3 clicks at 400×200; the factor is read from the rect, so 240×120 works the same way.
- **Known edge:** on a Swiss keyboard `+` is Shift+1. With the **J** menu open, that press also triggers the existing `Digit1` jump. This is pre-existing digit handling and is accepted.

---

## File map

- Modify `prototype/index.html`:
  - CSS `#map` (~L45): add `pointer-events:auto;touch-action:none;cursor:crosshair`.
  - `#help` (~L110, after the `J` line): one new line.
  - map header (~L140): zoom label `<span id="mapzoom">`.
  - `keydown` one-liner (~L779): `+`/`=`/`-` → `stepMapZoom`.
  - HUD & map section (~L888-892): new block above `drawMap()`; `drawMap()` replaced.
- Modify `CHANGELOG.md`: one line under `[Unreleased]` → `### Added`.
- Create `prototype/tests/test_minimap.py`.

Line numbers are from `main` at `6d29cb8`. Other PRs (e.g. #5 vehicle table) may shift them, so locate each edit by its quoted text (`grep -n`), not by its number.

The tests use the hand-traced layout (world and terrain files blocked), so they need no data files and are deterministic. On the hand **Bahnhofstrasse**, (1780, 560) and (1660, 330) are road vertices (`ROADS` ~L242), so the nearest jumpable road point is the clicked point itself. Hand map: `MS ≈ 0.164` canvas px/m (≈ 12 m per CSS px at 1×).

---

### Task 1: View transform, keys, header and test hooks

**Files:**
- Create: `prototype/tests/test_minimap.py`
- Modify: `prototype/index.html` (map header ~L140, `keydown` ~L779, HUD & map section ~L888-892)

**Interfaces:**
- Consumes: `mapC`, `mg`, `MB`, `MS`, `MX`, `MZ`, `mapStatic`, `P`, `clamp`, `$`, `CPS`, `cpObjs`, `FINISH`, `R`; existing hooks `window.__mm.place(x, z)`, `window.__mm.car()`.
- Produces: `MAP` (`{ zoom, wheel, tapT, tapX, tapY, placedT }`), `ZOOMS`, `mapView()` → `{ z, ox, oy }`, `mapPt(v, x, z)` → `[px, py]`, `worldToMap(x, z)`, `mapToWorld(px, py)` → `[x, z]` (canvas px, 800×400), `stepMapZoom(dir)` (dir = +1/-1); hooks `window.__mm.map()` → `{ zoom, cx, cz }`, `window.__mm.mapToWorld`, `window.__mm.worldToMap`. Test helpers `open_hand`, `car`, `dist`, `zoom`, `on_map`, constants `SISSELN`, `UPHILL` (reused by Tasks 2-5).

- [ ] **Step 1: Write the failing test.** Create `prototype/tests/test_minimap.py`:

```python
"""#11 minimap: zoom 1x/2x/4x/8x (wheel over the map, +/- keys), a zoomed view follows the car and stays on the map,
double-click / double-tap on the map puts the car on the nearest road there (a jump during a race).
Hand-traced layout (world + terrain blocked): no data files needed, deterministic. (1780, 560) and (1660, 330) are
vertices of the hand Bahnhofstrasse, so the nearest jumpable road point is the clicked point itself.
Viewport 1280x720: the map is 400x200 CSS px and clear of #game-nav."""
import math

import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SISSELN = (1780, 560)   # hand Bahnhofstrasse vertex = checkpoint 1, Bahnhof Sisseln
UPHILL = (1660, 330)    # hand Bahnhofstrasse vertex, 260 m from SISSELN


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def car(page):
    return page.evaluate("() => window.__mm.car()")


def dist(c, pt):
    return math.hypot(c["x"] - pt[0], c["z"] - pt[1])


def zoom(page):
    return page.evaluate("() => window.__mm.map().zoom")


def on_map(page, x, z):
    """Client (CSS px) position of world point (x, z) on the minimap; the canvas is 800x400, shown smaller via CSS."""
    px, py = page.evaluate(f"() => window.__mm.worldToMap({x}, {z})")
    box = page.locator("#map").bounding_box()
    return box["x"] + px * box["width"] / 800, box["y"] + py * box["height"] / 400


def test_minimap_zoom_keys_follow_the_car_and_stay_on_the_map(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        mm = lambda: page.evaluate("() => window.__mm.map()")
        whole = mm(); corner = page.evaluate("() => window.__mm.mapToWorld(0, 0)")
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")
        whole_after_place = mm()
        steps = []
        for key in ["NumpadAdd", "Equal", "NumpadAdd", "NumpadAdd", "Minus", "NumpadSubtract", "Minus", "Minus"]:
            page.keyboard.press(key); steps.append(zoom(page))
        page.keyboard.press("NumpadAdd"); page.keyboard.press("NumpadAdd")
        label = page.text_content("#mapzoom")
        centred = mm()
        car_px = page.evaluate(f"() => window.__mm.worldToMap({SISSELN[0]}, {SISSELN[1]})")
        back = page.evaluate("() => window.__mm.mapToWorld(123, 45)")
        there = page.evaluate(f"() => window.__mm.worldToMap({back[0]}, {back[1]})")
        page.evaluate(f"() => window.__mm.place({corner[0]}, {corner[1]})")
        clamped = mm(); corner_4x = page.evaluate("() => window.__mm.mapToWorld(0, 0)")
        b.close()
    assert whole["zoom"] == 1 and whole_after_place == pytest.approx(whole, abs=1e-9)   # 1x = the whole region, car-independent
    assert steps == [2, 4, 8, 8, 4, 2, 1, 1]
    assert label == "4×"
    assert centred["zoom"] == 4 and centred["cx"] == pytest.approx(SISSELN[0], abs=0.5) and centred["cz"] == pytest.approx(SISSELN[1], abs=0.5)
    assert car_px == pytest.approx([400, 200], abs=0.5)
    assert there == pytest.approx([123, 45], abs=1e-6)
    assert corner_4x == pytest.approx(corner, abs=0.5)                       # clamped: never shows beyond the map
    assert clamped["cx"] > corner[0] + 500 and clamped["cz"] > corner[1] + 200
```

(The test runs on the menu screen without clicking Start: the race loop does not step the car there, and the key handler and the hooks work anyway.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q -k keys`
Expected: FAIL — `TypeError: window.__mm.map is not a function`.

- [ ] **Step 3: Implement.**

Map header (~L140), replace
```html
    <div class="bar"><span>Map · Hochrhein</span><b>N ↑</b></div>
```
with
```html
    <div class="bar"><span>Map · Hochrhein · <span id="mapzoom">1×</span></span><b>N ↑</b></div>
```

`keydown` one-liner (~L779), replace the exact text
```js
if (e.code === 'KeyE') HUD.blinker = HUD.blinker === 'right' ? null : 'right';
```
with
```js
if (e.code === 'KeyE') HUD.blinker = HUD.blinker === 'right' ? null : 'right'; if (e.key === '+' || e.key === '=') stepMapZoom(1); if (e.key === '-') stepMapZoom(-1);
```
(`stepMapZoom` is a function declaration further down, so it is hoisted, and the handler only runs after the script has loaded.)

HUD & map section: replace the whole line that starts with `function drawMap() {` (~L892) with these lines:

```js
// minimap zoom (#11): 1x = the whole region; zoomed in, the view follows the car but stays on the map. The view is a crop of mapStatic (base 1x canvas px ox/oy = its centre)
const MAP = { zoom: 1, wheel: 0, tapT: 0, tapX: 0, tapY: 0, placedT: 0 }, ZOOMS = [1, 2, 4, 8];
function mapView() { const z = MAP.zoom, w = mapC.width, h = mapC.height; return { z, ox: clamp(MX(P.x), w / 2 / z, w - w / 2 / z), oy: clamp(MZ(P.z), h / 2 / z, h - h / 2 / z) }; }
const mapPt = (v, x, z) => [(MX(x) - v.ox) * v.z + mapC.width / 2, (MZ(z) - v.oy) * v.z + mapC.height / 2];
const worldToMap = (x, z) => mapPt(mapView(), x, z);
const mapToWorld = (px, py) => { const v = mapView(), bx = (px - mapC.width / 2) / v.z + v.ox, by = (py - mapC.height / 2) / v.z + v.oy; return [(bx - (mapC.width - (MB.x1 - MB.x0) * MS) / 2) / MS + MB.x0, (by - (mapC.height - (MB.z1 - MB.z0) * MS) / 2) / MS + MB.z0]; };
function stepMapZoom(dir) { MAP.zoom = ZOOMS[clamp(ZOOMS.indexOf(MAP.zoom) + dir, 0, ZOOMS.length - 1)]; $('mapzoom').textContent = MAP.zoom + '×'; }
window.__mm.map = () => { const [cx, cz] = mapToWorld(mapC.width / 2, mapC.height / 2); return { zoom: MAP.zoom, cx, cz }; }; window.__mm.mapToWorld = mapToWorld; window.__mm.worldToMap = worldToMap;
function drawMap() { const v = mapView(), w = mapC.width, h = mapC.height; mg.drawImage(mapStatic, v.ox - w / 2 / v.z, v.oy - h / 2 / v.z, w / v.z, h / v.z, 0, 0, w, h); CPS.forEach((c, i) => { const d = cpObjs[i].done, [cx, cy] = mapPt(v, c.x, c.z); mg.beginPath(); mg.arc(cx, cy, 7, 0, 7); mg.fillStyle = d ? '#7fe0a0' : (R.target && R.target.i === i ? '#ffc61a' : '#4a515e'); mg.fill(); mg.lineWidth = 2; mg.strokeStyle = d ? '#1c1f26' : '#ffc61a'; mg.stroke(); if (!d) { mg.fillStyle = R.target && R.target.i === i ? '#1c1f26' : '#ffc61a'; mg.font = '800 11px "Barlow Condensed", sans-serif'; mg.textAlign = 'center'; mg.fillText(String(i + 1), cx, cy + 4); mg.textAlign = 'left'; } }); const [fx, fy] = mapPt(v, FINISH.x, FINISH.z), [px, py] = mapPt(v, P.x, P.z); mg.fillStyle = R.done === 5 ? '#e0322d' : '#6a2a2a'; mg.fillRect(fx - 6, fy - 6, 12, 12); mg.strokeStyle = '#1c1f26'; mg.strokeRect(fx - 6, fy - 6, 12, 12); mg.save(); mg.translate(px, py); mg.rotate(P.th); mg.beginPath(); mg.moveTo(10, 0); mg.lineTo(-7, 6); mg.lineTo(-4, 0); mg.lineTo(-7, -6); mg.closePath(); mg.fillStyle = '#f5efe0'; mg.fill(); mg.lineWidth = 2; mg.strokeStyle = '#1c1f26'; mg.stroke(); mg.restore(); }
```

The new `drawMap` differs from the old one only in the coordinates. The blit becomes the crop, every `MX(..)`/`MZ(..)` pair becomes a `mapPt(v, ..)` result, and colours, sizes and order stay the same. Check: `grep -c "MX(c.x)\|MX(FINISH.x)\|MX(P.x), MZ(P.z))" prototype/index.html` prints `0`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q -k keys`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_minimap.py
git commit -m "feat(prototype): minimap zoom 1x-8x with +/- keys, view follows the car (#11)"
```

---

### Task 2: Mouse wheel over the map

**Files:**
- Modify: `prototype/index.html` (CSS `#map` ~L45, HUD & map section)
- Test: `prototype/tests/test_minimap.py`

**Interfaces:**
- Consumes: `MAP.wheel`, `stepMapZoom`.
- Produces: `#map` receives pointer events; a `wheel` listener on `mapC`.

- [ ] **Step 1: Write the failing test.** Append:

```python
def test_minimap_wheel_zooms_and_never_scrolls(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("() => { window.__wheel = []; addEventListener('wheel', e => window.__wheel.push(e.defaultPrevented)); }")
        box = page.locator("#map").bounding_box(); page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        steps = []
        for dy in [-100, -100, -100, -100, 100, 100, 100, 100]:
            page.mouse.wheel(0, dy); page.wait_for_timeout(100); steps.append(zoom(page))
        page.mouse.wheel(0, -40); page.wait_for_timeout(100); small = zoom(page)
        page.mouse.wheel(0, -60); page.wait_for_timeout(100); summed = zoom(page)
        prevented = page.evaluate("() => window.__wheel")
        b.close()
    assert steps == [2, 4, 8, 8, 4, 2, 1, 1]
    assert (small, summed) == (1, 2)                                         # small trackpad deltas add up to one step
    assert prevented and all(prevented), prevented
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q -k wheel`
Expected: FAIL — `assert [1, 1, 1, 1, 1, 1, ...] == [2, 4, 8, 8, 4, 2, ...]`. The wheel passes through the click-through HUD to the 3D canvas.

- [ ] **Step 3: Implement.**

CSS (~L45), replace
```css
#map{display:block;width:400px;height:200px}
```
with
```css
#map{display:block;width:400px;height:200px;pointer-events:auto;touch-action:none;cursor:crosshair}
```
(The `@media (max-width:900px)` rule only overrides the size; the new properties apply there too.)

In the HUD & map section, insert directly above the line `window.__mm.map = () => {`:

```js
mapC.addEventListener('wheel', e => { e.preventDefault(); MAP.wheel += e.deltaY * (e.deltaMode ? 40 : 1); if (Math.abs(MAP.wheel) < 100) return; stepMapZoom(MAP.wheel < 0 ? 1 : -1); MAP.wheel = 0; }, { passive: false });   // one notch (100) = one step; trackpad deltas add up
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_minimap.py
git commit -m "feat(prototype): zoom the minimap with the mouse wheel (#11)"
```

---

### Task 3: Double-click on the map places the car

**Files:**
- Modify: `prototype/index.html` (HUD & map section)
- Test: `prototype/tests/test_minimap.py`

**Interfaces:**
- Consumes: `mapToWorld`, `jumpTo(p)` (~L812: nearest point on a jumpable road → `placeOnRoad`, which sets `P.safe`, resets the car, closes `#jump`, toasts `p.n` and sets `R.jumped` while armed/racing), `MAP.placedT`.
- Produces: `placeFromMap(e)` (a pointer/mouse event → placement), a `dblclick` listener on `mapC`.

- [ ] **Step 1: Write the failing test.** Append:

```python
def test_minimap_double_click_puts_the_car_on_the_road(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        start = car(page)
        page.mouse.click(*on_map(page, *SISSELN)); page.wait_for_timeout(600)
        after_click = car(page); flags_click = page.evaluate("() => window.__mm.raceFlags()")
        page.mouse.dblclick(*on_map(page, *SISSELN))
        at_1x = car(page); road_1x = page.evaluate("() => window.__mm.roadDist()"); flags = page.evaluate("() => window.__mm.raceFlags()")
        page.keyboard.press("NumpadAdd"); page.keyboard.press("NumpadAdd"); page.wait_for_timeout(700)
        page.mouse.dblclick(*on_map(page, *UPHILL))
        at_4x = car(page); road_4x = page.evaluate("() => window.__mm.roadDist()")
        b.close()
    assert dist(after_click, (start["x"], start["z"])) < 1 and flags_click["jumped"] is False   # a single click does nothing
    assert dist(at_1x, SISSELN) < 30 and road_1x < 0, (at_1x, road_1x)
    assert flags["jumped"] is True                                           # a map placement during a race is a jump
    assert dist(at_4x, UPHILL) < 30 and road_4x < 0, (at_4x, road_4x)
```

(After Start the car is at the hand `START`, 858 m from Bahnhof Sisseln. At 4× the view is centred on the car at Sisseln, so (1660, 330) is inside it. The 700 ms wait clears the 500 ms placement debounce.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q -k click`
Expected: FAIL — `assert (858.38... < 30)`: the car never left the start.

- [ ] **Step 3: Implement.** In the HUD & map section, insert directly above the line `window.__mm.map = () => {`:

```js
// double-click (mouse) on the map: the car goes onto the nearest jumpable road there, like J (a jump during a race). Placements < 500 ms apart are one gesture
function placeFromMap(e) { if (performance.now() - MAP.placedT < 500) return; MAP.placedT = performance.now(); const r = mapC.getBoundingClientRect(), [x, z] = mapToWorld((e.clientX - r.left) * mapC.width / r.width, (e.clientY - r.top) * mapC.height / r.height); jumpTo({ n: 'From the map', x, z }); }
mapC.addEventListener('dblclick', placeFromMap);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_minimap.py
git commit -m "feat(prototype): double-click the minimap to put the car on the road there (#11)"
```

---

### Task 4: Double-tap on touch screens

**Files:**
- Modify: `prototype/index.html` (HUD & map section)
- Test: `prototype/tests/test_minimap.py`

**Interfaces:**
- Consumes: `placeFromMap`, `MAP.tapT`, `MAP.tapX`, `MAP.tapY`.
- Produces: a `pointerdown` listener on `mapC` (touch only).

- [ ] **Step 1: Write the failing test.** Append:

```python
# touch taps as pointer events in one evaluate: a headless renderer dispatches real touchscreen taps seconds apart (one per slow frame)
TAPS_JS = """([x, y, n]) => { const m = document.querySelector('#map'); for (let i = 0; i < n; i++) m.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: x, clientY: y, bubbles: true })); }"""


def test_minimap_double_tap_puts_the_car_on_the_road(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        start = car(page)
        x, y = on_map(page, *SISSELN)
        page.evaluate(TAPS_JS, [x, y, 1]); page.wait_for_timeout(600)
        after_tap = car(page)
        page.evaluate(TAPS_JS, [x, y, 2])
        placed = car(page); road = page.evaluate("() => window.__mm.roadDist()"); flags = page.evaluate("() => window.__mm.raceFlags()")
        b.close()
    assert dist(after_tap, (start["x"], start["z"])) < 1                    # a single tap does nothing
    assert dist(placed, SISSELN) < 30 and road < 0 and flags["jumped"] is True, (placed, road, flags)
```

Why synthetic events: `page.touchscreen.tap` in a `has_touch` context does reach `#map` as `pointerType: 'touch'`, but under swiftshader each tap waits for a frame. Two taps then arrive 2–6 s apart, never within 300 ms (verified while planning). The synthetic events test the detector itself.

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q -k tap`
Expected: FAIL — `assert (858.38... < 30)`.

- [ ] **Step 3: Implement.** Insert directly below the line `mapC.addEventListener('dblclick', placeFromMap);`:

```js
// double-tap (touch): mobile browsers do not fire dblclick reliably, so two taps < 300 ms and < 30 px apart
mapC.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; const t = performance.now(); if (t - MAP.tapT < 300 && Math.hypot(e.clientX - MAP.tapX, e.clientY - MAP.tapY) < 30) { MAP.tapT = 0; placeFromMap(e); return; } MAP.tapT = t; MAP.tapX = e.clientX; MAP.tapY = e.clientY; });
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_minimap.py
git commit -m "feat(prototype): double-tap the minimap to place the car on touch screens (#11)"
```

---

### Task 5: F1 help and changelog

**Files:**
- Modify: `prototype/index.html` (`#help` ~L110), `CHANGELOG.md`
- Test: `prototype/tests/test_minimap.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test.** Append:

```python
def test_help_mentions_map_zoom_and_placement(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.keyboard.press("F1"); text = page.inner_text("#help")
        b.close()
    assert "zoom the map" in text and "double-click" in text, text
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q -k help`
Expected: FAIL — `assert 'zoom the map' in 'Keys · F1 closes …'`.

- [ ] **Step 3: Implement.**

`#help` (~L110): directly below the line
```html
      <kbd>J</kbd><span>jump to a place</span>
```
insert
```html
      <kbd>+ · -</kbd><span>zoom the map 1× · 2× · 4× · 8× (or the mouse wheel over it) · double-click or double-tap the map: put the car on the road there</span>
```

`CHANGELOG.md`: as the **first** bullet under `## [Unreleased]` → `### Added`, insert (player voice, English like the other entries):

```markdown
- The minimap zooms: turn the mouse wheel over it or press **+**/**-** to step through 1×, 2×, 4× and 8× — zoomed in, it follows your car. Double-click (or double-tap) the minimap to put the car on the nearest road there; during a race that counts as a jump, like **J**.
```

Do not touch any other changelog line, and never regenerate the file with `git cliff -o`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_minimap.py -q`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_minimap.py CHANGELOG.md
git commit -m "docs(prototype): help and changelog for minimap zoom and placement (#11)"
```

---

### Task 6: Full verification

**Files:** none changed (unless a check fails).

- [ ] **Step 1: Sweep.** Each command must print what is noted:

```bash
grep -c "pointer-events:auto;touch-action:none;cursor:crosshair" prototype/index.html   # 1
grep -n "mg.drawImage(mapStatic, 0, 0)" prototype/index.html                               # nothing
grep -n "#hud{position:fixed;inset:0;pointer-events:none" prototype/index.html             # still there
git diff --stat main -- prototype/tests/test_smoke.py                                      # nothing: smoke tests untouched
```

- [ ] **Step 2: Push the branch, then run the whole suite in the foreground** (several minutes; do not background it):

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`
Expected: every test passes. `test_smoke.py` is unchanged; `test_minimap.py` gives 5 passed. Data-dependent smoke tests may skip where the data files are missing, exactly as before.

- [ ] **Step 3: Manual playtest** (`python3 -m http.server 8000` at the repo root, open `http://localhost:8000/prototype/index.html`):
  - The console is empty.
  - At 1× the minimap looks exactly as before.
  - The wheel over the map and **+**/**-** step through 1×/2×/4×/8×, and the header shows the zoom.
  - Zoomed in, the map follows the car while driving and stops at the border near the map's edge.
  - Checkpoint numbers, finish square and car arrow keep their size.
  - A double-click on a road puts the car there with the toast "From the map". In a race, the finish then shows "with a jump, not counted" and no record.
  - A single click does nothing. The wheel never scrolls the page.
  - Clicks elsewhere on the HUD still go through to the game.
  - Under 900 px width (240×120 map), a double-click still lands where clicked.
  - F1 lists the new line.

- [ ] **Step 4: Commit** only if a fix was needed (`fix(prototype): …`), with explicit paths.
