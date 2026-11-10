# Big map wheel zoom (#843) Implementation Plan

**Goal:** with Tab held, the mouse wheel zooms the big map in steps 1/2/4/8x towards the cursor, clamped to the map. Spec: `docs/superpowers/specs/2026-11-10-bigmap-wheel-zoom-design.md`.

**Files:** create `mapzoom.js`, `tests/mapzoom.test.mjs`; modify `index.html` (lines ~834, 6050-6059, 6065), `tests/test_full_map.py`, `CHANGELOG.md`. No new UI text, no i18n change. Do not run the full Playwright suite: run `node --test tests/mapzoom.test.mjs` and the new browser test only.

## Task 1 - pure math (TDD)

**Files:** `mapzoom.js`, `tests/mapzoom.test.mjs`

- [ ] **Step 1: write the failing test** `tests/mapzoom.test.mjs` (format like `tests/hudfade.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampCentre, zoomAt } from '../mapzoom.js';

const Z = [1, 2, 4, 8], W = 800, H = 400;

test('clampCentre_AtOneX_IsTheMiddle', () => {
  assert.equal(clampCentre(10, W, 1), 400);
  assert.equal(clampCentre(790, W, 1), 400);
});

test('clampCentre_ZoomedIn_StaysInsideTheEdges', () => {
  assert.equal(clampCentre(0, W, 2), 200);
  assert.equal(clampCentre(800, W, 2), 600);
  assert.equal(clampCentre(300, W, 2), 300);
});

test('zoomAt_ZoomIn_KeepsThePointUnderTheCursor', () => {
  const v = zoomAt({ z: 1, ox: 400, oy: 200 }, 1, 600, 100, W, H, Z);
  assert.equal(v.z, 2);
  // base point under the cursor before: (600-400)/1+400 = 600, (100-200)/1+200 = 100
  assert.equal((600 - W / 2) / v.z + v.ox, 600);
  assert.equal((100 - H / 2) / v.z + v.oy, 100);
});

test('zoomAt_CursorNearTheEdge_ClampsTheView', () => {
  const v = zoomAt({ z: 1, ox: 400, oy: 200 }, 1, 790, 395, W, H, Z);
  assert.equal(v.z, 2);
  assert.equal(v.ox, 600);
  assert.equal(v.oy, 300);
});

test('zoomAt_ZoomOutToOneX_ReturnsToTheWholeMap', () => {
  const v = zoomAt({ z: 2, ox: 600, oy: 300 }, -1, 790, 395, W, H, Z);
  assert.deepEqual(v, { z: 1, ox: 400, oy: 200 });
});

test('zoomAt_AtTheEndOfTheSteps_ReturnsTheSameView', () => {
  assert.deepEqual(zoomAt({ z: 8, ox: 500, oy: 250 }, 1, 100, 100, W, H, Z), { z: 8, ox: 500, oy: 250 });
  assert.deepEqual(zoomAt({ z: 1, ox: 400, oy: 200 }, -1, 100, 100, W, H, Z), { z: 1, ox: 400, oy: 200 });
});
```

- [ ] **Step 2:** run `node --test tests/mapzoom.test.mjs`; expect failure (module missing).
- [ ] **Step 3: implement** `mapzoom.js` (header comment: `// mapzoom.js (#843): pure zoom-towards-the-cursor math for the big Tab map. No DOM; index.html applies it.`):

```js
export const clampCentre = (c, size, z) => Math.min(Math.max(c, size / 2 / z), size - size / 2 / z);

export function zoomAt(view, dir, px, py, w, h, zooms) {
  const i = Math.min(Math.max(zooms.indexOf(view.z) + dir, 0), zooms.length - 1), z = zooms[i];
  if (z === view.z) return { z: view.z, ox: view.ox, oy: view.oy };
  const bx = (px - w / 2) / view.z + view.ox, by = (py - h / 2) / view.z + view.oy;
  return { z, ox: clampCentre(bx - (px - w / 2) / z, w, z), oy: clampCentre(by - (py - h / 2) / z, h, z) };
}
```

- [ ] **Step 4:** run the test again; expect all pass. Commit `feat(map): pure zoom-at-cursor math for the big map (#843)`.

## Task 2 - wire it into index.html

**Files:** `index.html`

- [ ] **Step 1:** next to the `hudfade.js` import (~line 834) add `import { clampCentre, zoomAt } from './mapzoom.js';   // #843`.
- [ ] **Step 2:** extend `MAP` (line ~6050) with `fz: 1, fx: 0, fy: 0`. Replace `mapView()` (line 6051):

```js
function mapView() { const w = mapC.width, h = mapC.height; if (MAP.full) return { z: MAP.fz, ox: clampCentre(MAP.fx, w, MAP.fz), oy: clampCentre(MAP.fy, h, MAP.fz) }; const z = MAP.zoom; return { z, ox: clamp(MX(P.x), w / 2 / z, w - w / 2 / z), oy: clamp(MZ(P.z), h / 2 / z, h - h / 2 / z) }; }
```

- [ ] **Step 3:** `renderMapZoom` label: `(MAP.full ? MAP.fz : MAP.zoom) + '×'`.
- [ ] **Step 4:** in `setFullMap`, after `MAP.full = full;` add `if (full) { MAP.fz = 1; MAP.fx = mapC.width / 2; MAP.fy = mapC.height / 2; }` (every open starts at 1x, the whole region).
- [ ] **Step 5:** in the wheel handler, replace `stepMapZoom(MAP.wheel < 0 ? 1 : -1);` with `wheelStep(e, MAP.wheel < 0 ? 1 : -1);` and add above it:

```js
function wheelStep(e, dir) {
  if (!MAP.full) return stepMapZoom(dir);
  const r = mapC.getBoundingClientRect(), v = zoomAt(mapView(), dir, (e.clientX - r.left) * mapC.width / r.width, (e.clientY - r.top) * mapC.height / r.height, mapC.width, mapC.height, ZOOMS);
  MAP.fz = v.z; MAP.fx = v.ox; MAP.fy = v.oy; renderMapZoom();   // #843: the big map has its own zoom, the minimap's MAP.zoom stays
}
```

  Keep `e.preventDefault()` and the 100-per-notch accumulator as they are. The wheel listener is on `mapC` (`pointer-events:auto`, CSS line 123), and the big map is that same canvas enlarged (`#br.full #map`), so the whole big map is the hit area.
- [ ] **Step 6:** `window.__mm.map` (line ~6065): add `fullZoom: MAP.fz` to the returned object.
- [ ] **Step 7:** update the comment at line 6049 (`MAP.zoom is kept` -> the big map has its own zoom `MAP.fz`, reset to 1x on open, #843).
- [ ] **Step 8:** run `node --test tests/mapzoom.test.mjs`. Commit `feat(map): zoom the big Tab map with the mouse wheel (#843)`.

## Task 3 - browser test

**Files:** `tests/test_full_map.py`

Add after `test_double_click_on_the_full_map_places_the_car`, reusing `open_hand`, `hold_tab`, `release_tab`, `wait_frames`, `on_map`, `mm`, `box`:

```python
def test_wheel_zooms_the_full_map_towards_the_cursor(server):
    """#843: with Tab held the wheel zooms the big map (1/2/4/8x) towards the cursor; the minimap zoom is untouched."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")
        page.keyboard.press("NumpadAdd")                                        # minimap 2x
        before = mm(page)
        hold_tab(page)
        start = mm(page)
        x, y = on_map(page, *UPHILL)
        page.mouse.move(x, y)
        page.mouse.wheel(0, -100); wait_frames(page)
        zoomed = mm(page); label = page.text_content("#mapzoom"); under = on_map(page, *UPHILL)
        page.mouse.wheel(0, 100); wait_frames(page)
        out = mm(page)
        page.mouse.wheel(0, -100); wait_frames(page)
        release_tab(page); hold_tab(page)
        reopened = mm(page)
        release_tab(page)
        after = mm(page)
        b.close()
    assert start["fullZoom"] == 1
    assert zoomed["fullZoom"] == 2 and label == "2×"
    assert (under[0], under[1]) == pytest.approx((x, y), abs=3)                 # the point under the cursor stayed there
    assert out["fullZoom"] == 1
    assert reopened["fullZoom"] == 1                                            # every open starts at 1x
    assert before["zoom"] == 2 and after["zoom"] == 2                           # minimap zoom unchanged
```

- [ ] Run only this test: `python -m pytest tests/test_full_map.py -k wheel_zooms -x` (one file, no full suite). If `UPHILL` ends so near an edge that the clamp moves it, use `SISSELN` instead; do not loosen the cursor tolerance.
- [ ] Commit `test(map): wheel zoom on the big map (#843)`.

## Task 4 - changelog

**Files:** `CHANGELOG.md`

- [ ] Stamp: `TZ=Europe/Zurich date '+%F %H:%M'`. Add as the first line under `### Added` in `[Unreleased]` (newest first; never `git cliff -o`):

```markdown
- `<stamp>` Hold <kbd>Tab</kbd> and turn the **mouse wheel** to **zoom the big map** in and out (1x to 8x) towards the cursor. The big map opens at 1x each time and its zoom is separate from the **minimap**.
```

- [ ] Commit `docs(changelog): big map wheel zoom (#843)`.

## Definition of done

- Wheel zooms the big map 1/2/4/8x towards the cursor, clamped; label shows the step; `preventDefault` stops page scroll.
- Opens at 1x; minimap zoom unchanged after Tab release.
- `node --test tests/mapzoom.test.mjs` and the new Playwright test pass; existing `test_full_map.py` tests unaffected (zoom keys still step the minimap).
