# Debug Height Label Clamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In debug mode (F3 / `?debug`), a building-height label never leaves the top of the screen: every frame, any label whose roof-top position projects above NDC y 0.8 is lowered along its building's vertical axis to exactly 0.8 (never below ground + 2 m), and debug height sprites are drawn over buildings (#70).

**Architecture:** Two pure helpers in `prototype/debug.js` (no three.js): `labelNdcY` projects a world point with the camera's view matrix elements and `tan(fov/2)`, `clampLabelY` solves for the clamped height in closed form. `prototype/index.html` stores each label's floor, drops the depth test on debug height sprites, and calls a new `clampDebugHeights()` every frame right after `debugTick()`. `__mm.debug().heights` gains `ny` and `clamped` for the browser test.

**Tech Stack:** vanilla JS + three.js r170 in the buildless `prototype/index.html`, `node --test` for `debug.js`, Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-debug-label-clamp-design.md`

## Global Constraints

- Only the debug height layer changes (`DEBUG_H`). House numbers (`LABELS`), village names, landmark signs, the debug panel text: **unchanged**.
- No new keys, no new UI strings (nothing for `strings.js` / `tr()`).
- Never raise a label: the clamp returns `min(y, y*)`, floored at `terrainH + 2`.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()` (the seeded RNG).
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged and green.
- **Animated camera:** the chase camera is smoothed, the loop clamps `dt` to 0.05 s, and a headless renderer draws under 1 fps. Browser checks **poll for arrival** (camera at its expected offset) with `page.wait_for_function(…, timeout=120000)`; never a fixed `wait_for_timeout`, never "wait until it stops moving".
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py -q`. These runs are slow (several minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- The browser test needs `data/world_hochrhein.json` (it is skipped without it, like the existing `test_coordinates_and_building_heights_near_the_car`).
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **Stale view matrix:** `hud()` runs after `stepCamera()` but before `renderer.render()`, so `camera.matrixWorldInverse` is a frame old unless `clampDebugHeights()` calls `camera.updateMatrixWorld()` first. Without it the label lags one frame behind a moving camera.
- **Idempotence:** the clamp must always start from the label item's unclamped `it.y`, never from the sprite's current `position.y`, or labels ratchet down and never come back up.
- **Depth test:** a clamped label sits on or inside its own building; with the default depth test it would be hidden by its own walls.

---

## File map

- `prototype/debug.js`: `DEBUG_LABEL_NDC_MAX`, `labelNdcY`, `clampLabelY` (Task 1).
- `prototype/tests/debug.test.mjs`: unit tests (Task 1).
- `prototype/tests/test_debug.py`: browser test (Task 2).
- `prototype/index.html` (Task 2):
  - the `./debug.js` import (~L203)
  - `DEBUG_H` label setup, sprite pool, `debugMat` (~L1086-1089)
  - new `clampDebugHeights()` after the `debugLayer({...})` block (~L1094)
  - the `__mm.debug` hook (~L1097)
  - `hud()`: `debugTick();` → `debugTick(); clampDebugHeights();` (~L1099)
- `CHANGELOG.md`, `test-todo.md` (Task 3).

Line numbers are from `main` @ `a1f63d6`. Verify them with `grep -n` before editing, because other PRs may have shifted them.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check the debug layer is where the plan expects it.** Run each on its own from the repo root:

```bash
grep -n "const DEBUG_H = " prototype/index.html
grep -n "function debugMat" prototype/index.html
grep -n "debugTick(); drawMap();" prototype/index.html
grep -n "window.__mm.debug = " prototype/index.html
grep -n "export function heightLabels" prototype/debug.js
```

Expected: one hit each. If `debugTick(); drawMap();` is gone (another PR reshaped `hud`), insert `clampDebugHeights();` directly after `debugTick();` wherever it is now.

- [ ] **Step 2: Baseline.** Run `node --test prototype/tests/*.test.mjs`. Expected: all pass.

---

### Task 1: Pure clamp helpers in `debug.js`

**Files:**
- Modify: `prototype/tests/debug.test.mjs`
- Modify: `prototype/debug.js`

**Interfaces:**
- `export const DEBUG_LABEL_NDC_MAX = 0.8`
- `export function labelNdcY(view, tanHalf, x, y, z)` → number; NDC y of world point `(x, y, z)`; `NaN` when the point is not in front of the camera. `view` = 16 column-major elements of the camera's `matrixWorldInverse`; `tanHalf = tan(verticalFov / 2)`.
- `export function clampLabelY(view, tanHalf, x, y, z, ndcMax, floor)` → number; `y` unchanged when `labelNdcY(...) <= ndcMax`, when the point is behind the camera (`NaN`), or when the denominator is ≤ 0; otherwise `max(floor, min(y, y*))` where `y*` is the height whose NDC y equals `ndcMax`.

- [ ] **Step 1: Write the failing test.** In `prototype/tests/debug.test.mjs`, extend the import line to

```js
import { debugFromQuery, gameToLv95, lv95ToWgs84, debugPosition, heightText, heightLabels, positionLines, buildingLines, copyText, DEBUG_LABEL_NDC_MAX, labelNdcY, clampLabelY } from '../debug.js';
```

and append at the end of the file:

```js
// #70: camera view matrices as camera.matrixWorldInverse.elements (column-major); FOV 62° like the game camera
const TAN = Math.tan(31 * Math.PI / 180);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const pitched = (a, ty, tz) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, ty, tz, 1]; };

test('labelNdcY: projects like a three.js PerspectiveCamera; NaN behind the camera', () => {
  assert.ok(Math.abs(labelNdcY(IDENTITY, TAN, 0, 10 * TAN, -10) - 1) < 1e-12);
  assert.equal(labelNdcY(IDENTITY, TAN, 5, 0, -10), 0);
  assert.ok(Number.isNaN(labelNdcY(IDENTITY, TAN, 0, 1, 5)));
});

test('clampLabelY: a label above the limit comes down to exactly ndcMax', () => {
  const y = clampLabelY(IDENTITY, TAN, 0, 10, -10, 0.8, -1e9);
  assert.ok(Math.abs(y - 8 * TAN) < 1e-9, String(y));
  const view = pitched(0.3, -2, -1), y2 = clampLabelY(view, TAN, 3, 30, -20, 0.8, -1e9);
  assert.ok(y2 < 30, String(y2));
  assert.ok(Math.abs(labelNdcY(view, TAN, 3, y2, -20) - 0.8) < 1e-9);
});

test('clampLabelY: a camera moved up by 5 m clamps 5 m higher', () => {
  const lifted = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -5, 0, 1];
  assert.ok(Math.abs(clampLabelY(lifted, TAN, 0, 30, -10, 0.8, -1e9) - (5 + 8 * TAN)) < 1e-9);
});

test('clampLabelY: labels that fit, labels behind the camera and the floor', () => {
  assert.equal(clampLabelY(IDENTITY, TAN, 0, 1, -10, 0.8, -1e9), 1);          // fits: unchanged, never raised
  assert.equal(clampLabelY(IDENTITY, TAN, 0, 10, 5, 0.8, -1e9), 10);          // behind the camera: unchanged
  assert.equal(clampLabelY(IDENTITY, TAN, 0, 10, -10, 0.8, 6), 6);            // never below the floor
});

test('DEBUG_LABEL_NDC_MAX: 0.8 leaves a tenth of the screen above the label centre', () => {
  assert.equal(DEBUG_LABEL_NDC_MAX, 0.8);
});
```

- [ ] **Step 2: Run it and watch it fail.** Run `node --test prototype/tests/*.test.mjs`. Expected: FAIL — `debug.js` does not export `DEBUG_LABEL_NDC_MAX` / `labelNdcY` / `clampLabelY` (SyntaxError on the import).

- [ ] **Step 3: Implement.** Append to `prototype/debug.js`:

```js
// #70: keep debug height labels on screen. view = camera.matrixWorldInverse.elements (column-major), tanHalf = tan(fov / 2).
export const DEBUG_LABEL_NDC_MAX = 0.8;
export function labelNdcY(view, tanHalf, x, y, z) {
  const e = view, yc = e[1] * x + e[5] * y + e[9] * z + e[13], zc = e[2] * x + e[6] * y + e[10] * z + e[14];
  return zc < 0 ? yc / (-zc * tanHalf) : NaN;
}
// lower y along the vertical axis until the point projects to ndcMax (closed form: yc(y) = -ndcMax * tanHalf * zc(y)); never raise, never below floor
export function clampLabelY(view, tanHalf, x, y, z, ndcMax, floor) {
  if (!(labelNdcY(view, tanHalf, x, y, z) > ndcMax)) return y;
  const e = view, k = ndcMax * tanHalf, den = e[5] + k * e[6];
  if (den <= 0) return y;
  const a = e[1] * x + e[9] * z + e[13], c = e[2] * x + e[10] * z + e[14];
  return Math.max(floor, Math.min(y, -(a + k * c) / den));
}
```

- [ ] **Step 4: Run it and watch it pass.** Run `node --test prototype/tests/*.test.mjs`. Expected: all pass (old and new).

- [ ] **Step 5: Commit.**

```bash
git add prototype/debug.js prototype/tests/debug.test.mjs
git commit -m "feat(debug): add screen-space clamp helpers for height labels (#70)"
```

---

### Task 2: Clamp the debug height sprites every frame

**Files:**
- Modify: `prototype/tests/test_debug.py`
- Modify: `prototype/index.html`

**Interfaces:**
- `clampDebugHeights()` — command, no return; no-op when debug is off.
- `window.__mm.debug().heights[i]` → `{ t, id, d, ny, clamped }` (`ny`: the sprite's current NDC y, 3 decimals, `null` if behind the camera; `clamped`: sprite drawn lower than its roof-top height).

- [ ] **Step 1: Write the failing test.** In `prototype/tests/test_debug.py`, add after `BODENACKER_6 = 171822634`:

```python
TALLEST = 155170807                                  # roof top 38.1 m (h 32.5 + rh 5.6), the tallest in the region
SPOT_DX = {BODENACKER_6: 20, TALLEST: 22}            # car this far east of the footprint centre, clear of the façade
CHASE_ARRIVED = ("() => { const c = window.__mm.cam(), d = c.d; return c.view === 0"
                 " && Math.abs(Math.hypot(d[0], d[2]) - 9) < 0.3 && Math.abs(d[1] - 3.4) < 0.3; }")
COCKPIT_ARRIVED = ("() => { const c = window.__mm.cam(), d = c.d; return c.view === 2"
                   " && Math.abs(d[0] - 0.325) < 0.05 && Math.abs(d[1] - 1.586) < 0.05 && Math.abs(d[2] - 0.494) < 0.05; }")
```

and append at the end of the file:

```python
@needs_world
@pytest.mark.parametrize("bid", [BODENACKER_6, TALLEST])
def test_tall_building_label_stays_on_screen(server, bid):
    """#70: facing a tall building from close by, its height label is lowered into the screen (NDC y <= 0.8)."""
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    b = next(x for x in w["buildings"] if x["id"] == bid)
    cx, cz = b["rect"][0] + SPOT_DX[bid], b["rect"][1]
    label = f"window.__mm.debug().heights.find(l => l.id === {bid})"
    with sync_playwright() as p:
        br, page = open_page(p, server, query="?debug")
        page.click("#startbtn", timeout=180000)
        page.evaluate(f"() => window.__mm.sim({cx}, {cz}, Math.PI, 0, 0, [])")     # heading pi = facing west, at the building
        page.wait_for_function(CHASE_ARRIVED, timeout=120000)
        page.wait_for_function(f"() => !!{label}", timeout=60000)
        chase = page.evaluate(f"() => {label}")
        page.keyboard.press("KeyC")
        page.keyboard.press("KeyC")
        page.wait_for_function(COCKPIT_ARRIVED, timeout=120000)
        page.wait_for_function(f"() => !!{label}", timeout=60000)
        cockpit = page.evaluate(f"() => {label}")
        br.close()
    for view, l in (("chase", chase), ("cockpit", cockpit)):
        assert l.get("clamped") is True, (view, l)
        assert l.get("ny") is not None and -1 <= l["ny"] <= 0.8 + 1e-3, (view, l)
```

- [ ] **Step 2: Commit and push the test, then run it and watch it fail.**

```bash
git add prototype/tests/test_debug.py
git commit -m "test(debug): pin height labels on screen for tall buildings (#70)"
git push -u origin HEAD
```

Then (foreground, slow): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py -q -k tall_building`. Expected: 2 FAILED with `AssertionError: ('chase', {...})` — the label has no `clamped` / `ny` yet.

If a run instead **times out on `CHASE_ARRIVED`**, print `window.__mm.cam()`: a building behind the car is pulling the chase camera in. Then move that building's spot to the other side (`rect[0] - SPOT_DX`, heading `0`) and adjust the test once; do not loosen the arrival tolerance.

- [ ] **Step 3: Implement in `prototype/index.html`.**

(a) The import (~L203) — extend it:

```js
import { debugFromQuery, debugPosition, heightLabels, positionLines, buildingLines, copyText, DEBUG_LABEL_NDC_MAX, labelNdcY, clampLabelY } from './debug.js';
```

(b) The label setup (~L1087) — replace

```js
if (L) for (const it of heightLabels(L.buildings)) { it.y = terrainH(it.x, it.z) + it.top + 4; gridAdd(DEBUG_H.grid, it.x, it.z, it.x, it.z, it); }
```

with

```js
if (L) for (const it of heightLabels(L.buildings)) { const g = terrainH(it.x, it.z); it.y = g + it.top + 4; it.floor = g + 2; gridAdd(DEBUG_H.grid, it.x, it.z, it.x, it.z, it); }
```

(c) The sprite pool (~L1088) — draw them after the buildings:

```js
for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(); s.scale.set(6.4, 1.2, 1); s.renderOrder = 10; s.visible = false; DEBUG_H.pool.push(s); scene.add(s); }
```

(d) `debugMat` (~L1089) — add `depthTest: false` to the `SpriteMaterial` options, i.e. `..., depthWrite: false, depthTest: false });`. Leave the rest of the line as is.

(e) After the `debugLayer({ ... });` block (~L1094), add:

```js
// #70: a label over a tall building close to the camera would leave the top of the screen: every frame, lower each shown label from its roof-top it.y to NDC y 0.8 (debug.js clampLabelY). hud runs before render, so refresh the view matrix first.
const camTanHalf = () => Math.tan(camera.fov * Math.PI / 360);
function clampDebugHeights() { if (!DEBUG.on) return; camera.updateMatrixWorld(); const view = camera.matrixWorldInverse.elements, tanHalf = camTanHalf(); DEBUG_H.pool.forEach((s, i) => { const it = DEBUG_H.shown[i]; if (s.visible && it) s.position.y = clampLabelY(view, tanHalf, it.x, it.y, it.z, DEBUG_LABEL_NDC_MAX, it.floor); }); }
```

(f) The hook (~L1097) — replace `heights: DEBUG_H.shown.map(l => ({ t: l.t, id: l.id, d: +l.d.toFixed(1) }))` with

```js
heights: DEBUG_H.shown.map((l, i) => { const s = DEBUG_H.pool[i], ny = labelNdcY(camera.matrixWorldInverse.elements, camTanHalf(), s.position.x, s.position.y, s.position.z); return { t: l.t, id: l.id, d: +l.d.toFixed(1), ny: Number.isNaN(ny) ? null : +ny.toFixed(3), clamped: s.position.y < l.y - 1e-6 }; })
```

Leave the other hook fields unchanged.

(g) In `hud(dt)` (~L1099) — replace `debugTick(); drawMap();` with `debugTick(); clampDebugHeights(); drawMap();`.

- [ ] **Step 4: Run the tests and watch them pass.** Node: `node --test prototype/tests/*.test.mjs` (all pass). Commit and push first:

```bash
git add prototype/index.html
git commit -m "fix(debug): keep building height labels on screen for tall buildings (#70)"
git push
```

Then (foreground, slow): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py -q`. Expected: all pass — the 4 existing tests unchanged, plus 2 new.

- [ ] **Step 5: Full suite.** Foreground: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q`. Expected: no new failures (compare with `main` if anything unrelated is red).

---

### Task 3: Changelog and playtest note

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `test-todo.md`

- [ ] **Step 1: CHANGELOG.** Under `## [Unreleased]` → `### Fixed`, add as the first bullet:

```markdown
- In the **F3** debug view, the height of a tall building right in front of you no longer floats off the top of the screen — up close, the label slides down onto the façade, and it shows through other buildings.
```

- [ ] **Step 2: test-todo.** Under `## Debug mode (#39)`, append:

```markdown
- [ ] #70: F3, stand right next to Bodenackerstrasse 6 (and the 38 m block at `155170807`) in every camera view (C): the height label is fully readable, sits on the upper façade, and rises back above the roof as you drive away. No visible jitter while driving.
```

- [ ] **Step 3: Commit and push.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(debug): changelog and playtest note for the label clamp (#70)"
git push
```
