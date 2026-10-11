# Fridolinsinsel open meadow Implementation Plan (#214)

**Goal:** A car driving up the Rhine bed reaches the Fridolinsinsel and drives onto it (no invisible wall at its west shore).

**Architecture:** Pure helper `clearWoods` (world.js) + region field `openWoods` (regions.js) + `index.html` builds `WOODS` and uses it instead of `L.forests`. Spec: `docs/superpowers/specs/2026-10-11-island-woods-design.md`.

## Global Constraints

- Buildless; no new packages. Not a world rebuild: it works on the committed `data/world_hochrhein.json`.
- Re-find code by the quoted anchor lines, not by line number (numbers are from `main` @ `b4d1279`).
- In `prototype/index.html` never put a `//` comment in the middle of a one-line statement; only after the closing `;` at the end of a line, or not at all.
- The test reaches its end state through the `__mm.step` hook in a loop, never by loosening an assertion.
- Browser test in the foreground, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest <file> -q -p no:cacheprovider`. Commit before it. If `pipeline/.venv` is missing use `python3 -m pytest` (pytest and playwright must be installed into a scratch `--target`, never into the repo or system).
- CHANGELOG entry hand-written, player-facing, English, under `## [Unreleased]` / `### Added`. Never `git cliff -o`.

---

### Task 1: `clearWoods` in world.js (node test first)

**Files:** Modify `prototype/world.js`; Create `prototype/tests/openwoods.test.mjs`.

- [ ] **Step 1: failing test.** Create `prototype/tests/openwoods.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearWoods } from '../world.js';
import { REGIONS } from '../regions.js';

const SQUARE = { ring: [[0, 0], [10, 0], [10, 10], [0, 10]] };
const OTHER = { ring: [[100, 100], [110, 100], [110, 110], [100, 110]] };

test('clearWoods_PointInsideOnePolygon_DropsOnlyThatPolygon', () => {
  assert.deepEqual(clearWoods([SQUARE, OTHER], [[5, 5]]), [OTHER]);
});

test('clearWoods_PointOutsideEverything_KeepsAll', () => {
  assert.deepEqual(clearWoods([SQUARE, OTHER], [[50, 50]]), [SQUARE, OTHER]);
});

test('clearWoods_NoPoints_ReturnsTheSameList', () => {
  const list = [SQUARE];
  assert.equal(clearWoods(list, []), list);
  assert.equal(clearWoods(list, undefined), list);
});

test('Hochrhein_OpenWoods_DropsExactlyTheFridolinsinselWood', () => {
  const w = JSON.parse(readFileSync(new URL('../../data/world_hochrhein.json', import.meta.url), 'utf8'));
  const kept = clearWoods(w.forests, REGIONS.hochrhein.openWoods);
  assert.equal(kept.length, w.forests.length - 1);
  const gone = w.forests.filter(f => !kept.includes(f));
  const xs = gone[0].ring.map(p => p[0]), zs = gone[0].ring.map(p => p[1]);
  assert.ok(Math.min(...xs) > -1250 && Math.max(...xs) < -1195 && Math.min(...zs) > 100 && Math.max(...zs) < 210, 'it is the island polygon');
});

test('Ehrendingen_OpenWoods_IsEmpty', () => {
  assert.deepEqual(REGIONS.ehrendingen.openWoods, []);
});
```

Run `node --test prototype/tests/openwoods.test.mjs`. Expected: FAIL (`clearWoods` is not exported).

- [ ] **Step 2: implement.** In `prototype/world.js`, directly above the line `export function forestIndex(forests, step = 8) {` insert:

```js
export function clearWoods(forests, points) {
  if (!points || !points.length) return forests;
  const inRing = (x, z, ring) => { let c = false; for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) { const [xi, zi] = ring[i], [xk, zk] = ring[k]; if ((zi > z) !== (zk > z) && x < xi + (z - zi) * (xk - xi) / (zk - zi)) c = !c; } return c; };
  return forests.filter(f => !points.some(([x, z]) => inRing(x, z, f.ring)));
}
```

(The one-line comment above it in the file stays attached to `forestIndex`; add your own line before the function: `// #214: the woods minus every polygon that contains one of the points [x, z] (an island the OSM draws as a wood)`.)

- [ ] **Step 3:** run Task 2 first (the test needs `openWoods`), then `node --test prototype/tests/openwoods.test.mjs` → PASS. Commit both with `feat(world): clearWoods drops the wood a pinned point lies in (#214)`.

### Task 2: region field `openWoods`

**Files:** Modify `prototype/regions.js`, `prototype/tests/regions.test.mjs`.

- [ ] In `prototype/regions.js` Hochrhein, replace
`    treeBox: [-3100, 3100, -1800, 1900], forestAbove: 18, handFallback: true,`
with
`    treeBox: [-3100, 3100, -1800, 1900], forestAbove: 18, handFallback: true, openWoods: [[-1222, 166]],   // #214: the Fridolinsinsel is an OSM wood; its edge walls stopped the car on the bed, so the wood is dropped`
- [ ] In the Ehrendingen block, on the line `treeBox: [-1520, 1840, -2225, 2065], forestAbove: 90, handFallback: false,` add `openWoods: [],` right after `handFallback: false,` (before the `//` comment).
- [ ] In `prototype/tests/regions.test.mjs` change the key list `'treeBox', 'forestAbove']` to `'treeBox', 'forestAbove', 'openWoods']`.
- [ ] `node --test prototype/tests/regions.test.mjs prototype/tests/openwoods.test.mjs` → PASS.

### Task 3: use `WOODS` in index.html

**Files:** Modify `prototype/index.html`. Make exactly these 6 replacements (each anchor is unique):

1. Import line (starts `import { makeGrid, gridAdd, ...`): change `forestIndex, forestEdges, forestTrees,` to `clearWoods, forestIndex, forestEdges, forestTrees,`.
2. Before: `const FOREST = forestIndex(L ? L.forests : []);` After: `const WOODS = L ? clearWoods(L.forests, REGION.openWoods) : [], FOREST = forestIndex(WOODS);` (keep the trailing `//` comment).
3. `const OSM_WOODS = !!(L && L.forests.length);` → `const OSM_WOODS = !!(L && WOODS.length);`
4. `if (L && L.forests.length) {` → `if (L && WOODS.length) {`
5. `const edges = forestEdges(L.forests, FOREST), placed = forestTrees(L.forests, FOREST, edges, rng(13));` → `const edges = forestEdges(WOODS, FOREST), placed = forestTrees(WOODS, FOREST, edges, rng(13));`
6. `polys: L.forests.length,` → `polys: WOODS.length,`

Verify nothing is left: `grep -n "L.forests" prototype/index.html` must show only the `clearWoods(L.forests, ...)` call.

### Task 4: the one browser test

**Files:** Create `prototype/tests/test_fridolinsinsel.py`.

- [ ] Write (test first, run it before Task 3 to see it fail: the loop returns `None`):

```python
"""#214: the car drives out of the Rhine onto the Fridolinsinsel. Real world + real terrain (tracked in data/).
Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# from the bed 38 m west of the island's shore, heading east (+x) along z = 170; steps of 0.25 s through the hook, until the car is out of the water
DRIVE = """() => { window.__mm.sim(-1262, 170, 0, 0, 0, []);
  for (let i = 0; i < 80; i++) { window.__mm.step(0.25, ['KeyW']); const c = window.__mm.car();
    if (c.water === null) return { t: i * 0.25, x: c.x, z: c.z }; }
  return null; }"""


def test_car_drives_out_of_the_rhine_onto_the_fridolinsinsel(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 480, "height": 270}).new_page()
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.click("#startbtn", timeout=180000)
        out = page.evaluate(DRIVE)
        polys = page.evaluate("() => window.__mm.counts.forest.polys")
        b.close()
    assert out is not None, "the car never left the water: a wall stops it on the bed"
    assert -1235 < out["x"] < -1195, out      # it came out on the island, not somewhere else
    assert polys == len(json.loads(WORLD.read_text(encoding="utf-8"))["forests"]) - 1
```

- [ ] After Task 3 run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_fridolinsinsel.py -q -p no:cacheprovider` → PASS. (Measured before the fix: the car stalls at x = -1238, speed 0.2.)
- [ ] Also run `node --test prototype/tests/` (all node tests) → PASS. Do not run the full Playwright suite (about 2 h).

### Task 5: CHANGELOG and commit

- [ ] Under `## [Unreleased]` / `### Added` of `CHANGELOG.md` add: `- You can drive out of the Rhine onto the Fridolinsinsel in Bad Säckingen now: the island is a meadow without its trees and the invisible wall around it, so the car can climb out of the river bed and drive around on it. **R** puts you back on the road.`
- [ ] Commit: `feat(world): drive out of the Rhine onto the Fridolinsinsel (#214)`, push the branch, open a PR that closes #214.
