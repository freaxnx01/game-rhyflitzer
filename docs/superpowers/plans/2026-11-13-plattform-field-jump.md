# #902 No high jump from the field onto the Plattform yard — Implementation Plan

**Goal:** a kerb-like ground rise (the Geuerenstrasse ribbon edge north of the Plattform, 0.45–0.72 m) no longer launches the car; smooth rises (crests, the Sprungschanze) still do.

**Architecture:** pure helpers in `vehicle.js` decide kerb vs slope from ground heights sampled along the frame's path; `stepCar`'s grounded branch (`index.html:5625`) calls them. Spec: `docs/superpowers/specs/2026-11-13-plattform-field-jump-design.md` (measurements there).

**Global constraints:** buildless, no new packages. Do not touch `plattform.js`, `world.js` (`ribbonLift`) or road drawing. Playwright in the foreground only, with `PW_CDP_ENDPOINT` set if available; run only the tests named here (not the full Playwright suite). Node: `node --test tests/<file>.test.mjs`, then the whole `node --test tests/*.test.mjs`.

---

### Task 1: pure kerb helpers in `vehicle.js`

**Files:** modify `vehicle.js`, `tests/vehicle.test.mjs`

**Interfaces:**
```js
export const KERB = { grade: 0.5, spacing: 0.25, keep: 0.6, min: 1 };
export function stepSamples(x0, z0, x1, z1, spacing = KERB.spacing)   // -> [[x, z], ...], n + 1 points, n = max(1, ceil(dist / spacing)), first = (x0, z0), last = (x1, z1)
export function isKerb(heights, run, grade = KERB.grade)                 // heights along those points; true if any heights[i+1] - heights[i] > grade * run / (heights.length - 1)
export function launchVy(lift, dt, kerb, cfg = KERB)                     // 0 if kerb or lift <= 0; else v = lift / dt * keep; v < min -> 0
```

- [ ] **Step 1: Write the failing tests** (append to `tests/vehicle.test.mjs`, extend the import)

```js
import { vehicleFromQuery, KERB, stepSamples, isKerb, launchVy } from '../vehicle.js';

test('stepSamples_PathOf1m_FivePointsQuarterMetreApartEndsIncluded', () => {
  const s = stepSamples(0, 0, 1, 0);
  assert.equal(s.length, 5);
  assert.deepEqual(s[0], [0, 0]); assert.deepEqual(s[4], [1, 0]);
  assert.ok(Math.abs(s[1][0] - 0.25) < 1e-9);
});

test('stepSamples_ZeroLengthPath_TwoPointsOnTheSpot', () => {
  assert.deepEqual(stepSamples(3, 4, 3, 4), [[3, 4], [3, 4]]);
});

test('isKerb_SprungschanzeGrade_NotAKerb', () => {
  const g = 3.4 / 25.4, run = 1.0, h = [0, 1, 2, 3, 4].map((i) => g * run * i / 4);   // index.html:1651 ramp, 1 m of it
  assert.equal(isKerb(h, run), false);
});

test('isKerb_GeuerenstrasseEdge07mInsideOneFrame_IsKerb', () => {
  // #902 measured: +0.72 m between two frames 0.40 m apart (24 m/s), the step between samples 1 and 2
  assert.equal(isKerb([-0.82, -0.81, -0.10, -0.10], 0.40), true);
});

test('isKerb_SameStepAt100ms_StillAKerb', () => {
  const s = stepSamples(0, 0, 1.7, 0), h = s.map(([x]) => (x > 0.9 ? 0.6 : 0));   // 1.7 m per frame, the step inside one 0.25 m gap
  assert.equal(isKerb(h, 1.7), true);
});

test('isKerb_ZeroRunWithRise_IsKerb', () => {
  assert.equal(isKerb([0, 0.44], 0), true);   // #902: a collider push onto the ribbon edge at ~0 m/s
});

test('isKerb_ZeroRunFlat_NotAKerb', () => {
  assert.equal(isKerb([0, 0], 0), false);
});

test('launchVy_KerbRise_NoLaunch', () => {
  assert.equal(launchVy(0.72, 1 / 60, true), 0);
});

test('launchVy_SlopeRise_SameAsBefore', () => {
  const lift = 0.05, dt = 1 / 60;
  assert.ok(Math.abs(launchVy(lift, dt, false) - lift / dt * KERB.keep) < 1e-9);   // 1.8 m/s
});

test('launchVy_TinyOrNegativeLift_Zero', () => {
  assert.equal(launchVy(0.02, 1 / 60, false), 0);   // 0.72 m/s < min 1
  assert.equal(launchVy(-0.3, 1 / 60, false), 0);
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/vehicle.test.mjs` (imports undefined).

- [ ] **Step 3: Implement** in `vehicle.js` (append; keep the file's comment style, `#902` tag):

```js
// #902: a rise under a grounded car launches it only when it is a slope (a crest, the Sprungschanze), not a kerb (a road
// ribbon's edge over an embankment, the kreisel apron). Sampled at a fixed spacing along the frame's path, so frame rate and speed don't matter.
export const KERB = { grade: 0.5, spacing: 0.25, keep: 0.6, min: 1 };

export function stepSamples(x0, z0, x1, z1, spacing = KERB.spacing) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / spacing));
  return Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
}

export function isKerb(heights, run, grade = KERB.grade) {
  const gap = run / (heights.length - 1);
  for (let i = 1; i < heights.length; i++) if (heights[i] - heights[i - 1] > grade * gap) return true;
  return false;
}

export function launchVy(lift, dt, kerb, cfg = KERB) {
  if (kerb || lift <= 0) return 0;
  const v = lift / dt * cfg.keep;
  return v < cfg.min ? 0 : v;
}
```
Make sure `stepSamples` end points are exact (`i / n` with `i = n` gives `x1`).

- [ ] **Step 4: Run, expect PASS** — `node --test tests/vehicle.test.mjs`.

- [ ] **Step 5: Commit** — `fix(physics): kerb vs slope helpers for the car's ground launch (#902)`

---

### Task 2: use the helpers in `stepCar`

**Files:** modify `index.html` (a new `vehicle.js` import beside the other module imports, ~line 1019; and line ~5625)

- [ ] **Step 1: Write the failing Playwright test** `tests/test_plattform_field.py` (measured terrain; pattern: `tests/test_bridge_ends.py`, no `.mmh` 404 route — the coarse fallback terrain does not reproduce the bug):

```python
"""#902: from the field north of the Plattform Sisslerfeld onto the Geuerenstrasse the car is not launched.
Measured terrain only. Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

DATA = Path(__file__).parents[1] / "data"
pytestmark = pytest.mark.skipif(not ((DATA / "world_hochrhein.json").exists() and (DATA / "terrain_hochrhein.mmh").exists()),
                                reason="run pipeline/osm.py build and terrain.py first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# world angle of the start point from the tower (270 = north, the field), start speed; before #902: 6.3-14.5 m above ground
RUNS = [(240, 20), (270, 10), (270, 20), (300, 15), (330, 20)]
DRIVE = """([a, v]) => { const p = window.__mm.plattform(), t = a * Math.PI / 180;
  window.__mm.resetCar && window.__mm.resetCar();
  window.__mm.sim(p.x + 30 * Math.cos(t), p.z + 30 * Math.sin(t), t + Math.PI + 0.12, v, 1 / 60, ['KeyW']);
  let top = 0;
  for (let i = 0; i < 150; i++) { window.__mm.step(1 / 60, ['KeyW']); const c = window.__mm.car();
    top = Math.max(top, c.y - c.ground); if (Math.hypot(c.x - p.x, c.z - p.z) < 3) break; }
  return top; }"""


def test_car_from_the_field_is_not_launched_at_the_road_edge(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 320, "height": 180})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.plattform() && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.click("#startbtn")
        tops = {run: page.evaluate(DRIVE, list(run)) for run in RUNS}
        b.close()
    assert errors == []
    for run, top in tops.items():
        assert top < 0.5, (run, top)
```
Check `__mm.resetCar` restores damage (a crash in one run must not wreck the next — wrecks ignore W). If it does not, open a fresh page per run instead.

- [ ] **Step 2: Run, expect FAIL** (foreground): `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest tests/test_plattform_field.py -x -q` — tops ≈ 6–14 m.

- [ ] **Step 3: Implement.** `index.html` does not import `vehicle.js` yet: add `import { stepSamples, isKerb, launchVy } from './vehicle.js';   // #902` next to the `wreck.js` import (line ~1019). In `stepCar`, replace

```js
const lift = gh2 - groundH(P.x - P.vx * dt, P.z - P.vz * dt, P.y); P.vy = Math.max(0, (L && lift > 1 ? 0 : lift) / dt * 0.6); if (P.vy < 1) P.vy = 0;
```
with
```js
const bx = P.x - P.vx * dt, bz = P.z - P.vz * dt, lift = gh2 - groundH(bx, bz, P.y);
const kerb = launchVy(lift, dt, false) > 0 && isKerb(stepSamples(bx, bz, P.x, P.z).map(([sx, sz]) => groundH(sx, sz, P.y)), Math.hypot(P.x - bx, P.z - bz));   // #902: sampled only when it would launch
P.vy = L && lift > 1 ? 0 : launchVy(lift, dt, kerb);
```
Extend the line's trailing comment: `#902: a kerb (a rise steeper than 1:2 over 0.25 m) is stepped onto, not launched from`. Leave the rest of the line unchanged.

- [ ] **Step 4: Run, expect PASS** — the new test, then the ramp and bridge-end regressions (foreground):
`python3 -m pytest tests/test_plattform_field.py "tests/test_jump.py::test_sprungschanze_run_up_launches_the_car" tests/test_bridge_ends.py tests/test_plattform_car.py -q`
and `node --test tests/*.test.mjs`.

- [ ] **Step 5: CHANGELOG** — under `## [Unreleased]` → `### Fixed` (create the heading if missing), player-facing, with the go-live time:
`` - `YYYY-MM-DD HH:MM` Kein **Riesensprung** mehr, wenn man **vom Feld her** zur **Plattform Sisslerfeld** fährt: eine Strassenkante hebt das Auto jetzt nur noch auf die Strasse, statt es meterhoch in die Luft zu schleudern. Das gilt auch für andere Kanten, z. B. am Kreisel. ``
(Match the language of the neighbouring entries in that section.)

- [ ] **Step 6: Commit** — `fix(physics): a kerb no longer launches the car (#902)` with `Closes #902`.
