# Buildings stand on the ground under the centroid (#91): implementation plan

**Goal:** A building's roof lands where the pipeline measured it. The base moves from the lowest terrain point under the
outline to the terrain at the footprint centroid (clamped to 4 m above the lowest point), and the walls reach down to the
lowest point so the downhill side never floats. Row houses 4a-4f gain ~1.4 m. No pipeline change, no world rebuild.

**Architecture:** Two pure helpers in `prototype/world.js` (`ringCentroid`, `buildingBase`), consumed by `osmBuilding()` in
`prototype/index.html`. `extrudeFootprint` and the gable `box` get a `bottom` so walls follow. A `BUILDING_BASE` map feeds
the house-number and debug-height labels and the tests (`window.__mm.buildingBases`).
Spec: `docs/superpowers/specs/2026-10-03-building-base-on-slopes-design.md`.

**Tech:** vanilla ES modules, `node --test` (pure helpers), pytest + Playwright (world check). Pipeline untouched.

## Global Constraints

- TDD: failing test first, watch it fail, minimal code, watch it pass. Never edit a test to make it green. Stop and
  report after 3 failed attempts on one test.
- Playwright runs in the foreground only, with a generous `timeout`. Never `run_in_background`. Commit and push the branch
  before starting Playwright. Heavy commands under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- No new `rr()`/`rnd()` calls inside `osmBuilding()`: the seeded RNG sequence for later buildings must not change.
- Surgical: only the lines this change needs. Do not touch `rowHouseTile`, the facade design, `ringPush`, or hand-built
  houses. #87 and #71 may be in flight: rebase, never rewrite their lines.
- Conventional commits; CHANGELOG entry under `[Unreleased]` in the player's voice.

## File structure

- Modify `prototype/world.js`: add `SLOPE_CAP`, `SKIRT_MARGIN`, `ringCentroid`, `buildingBase`; `addrLabels` items get `id`.
- Modify `prototype/debug.js`: `heightLabels` items get `id`.
- Modify `prototype/index.html`: `osmBuilding`, `extrudeFootprint`, `BUILDING_BASE`, the two label `y` lines, `__mm` hook.
- Modify `prototype/tests/world.test.mjs`, `prototype/tests/test_row_houses.py` (new test), `CHANGELOG.md`.

---

### Task 1: Pure helpers `ringCentroid` and `buildingBase`

**Files:** `prototype/world.js`, `prototype/tests/world.test.mjs`.

- [ ] **Step 1: Write the failing tests** (append to `world.test.mjs`, add the names to the import line)

```js
const SQ = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('ringCentroid: area centroid of a square and of an L, either winding', () => {
  assert.deepEqual(ringCentroid(SQ), [5, 5]);
  assert.deepEqual(ringCentroid([...SQ].reverse()), [5, 5]);
  const L = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10]];   // arms 10 x 2 and 2 x 8: centroid (20*5+16*1)/36 on both axes
  const [cx, cz] = ringCentroid(L);
  assert.ok(Math.abs(cx - 116 / 36) < 1e-9 && Math.abs(cz - 116 / 36) < 1e-9);
});

test('ringCentroid: a degenerate ring falls back to the vertex mean', () => {
  assert.deepEqual(ringCentroid([[0, 0], [4, 0], [8, 0]]), [4, 0]);
});

test('buildingBase: flat ground keeps base = low, walls end 0.3 m below', () => {
  const r = buildingBase(SQ, () => 100);
  assert.deepEqual(r, { base: 100, low: 100, bottom: 99.7 });
});

test('buildingBase: a slope puts the base at the centroid ground, not the lowest point', () => {
  const r = buildingBase(SQ, (x) => 100 + 0.1 * x);   // 100 at x 0, 101 at x 10, 100.5 at the centroid
  assert.ok(Math.abs(r.base - 100.5) < 1e-9 && r.low === 100 && Math.abs(r.bottom - 99.7) < 1e-9);
});

test('buildingBase: a cliff is clamped to low + cap, never higher', () => {
  const r = buildingBase(SQ, (x) => (x < 5 ? 0 : 50));   // centroid x = 5 reads 50, lowest 0
  assert.equal(r.base, 4);
  assert.equal(r.low, 0);
});

test('buildingBase: a centroid below the lowest vertex never sinks the base under low', () => {
  const r = buildingBase(SQ, (x, z) => (x === 5 && z === 5 ? -3 : 0));   // a pit in the middle
  assert.equal(r.base, 0);
});
```

- [ ] **Step 2: Run, expect FAIL** (`ringCentroid is not exported`): `node --test prototype/tests/world.test.mjs`

- [ ] **Step 3: Implement** in `prototype/world.js` (next to `roofTop`):

```js
// #91: a building stands on the ground under its footprint centroid, the reference the pipeline measured h against
// (pipeline/building_heights.py), not the lowest point under the outline. Never more than SLOPE_CAP above that lowest point
// (cliffs, the Rhine bank), and its walls reach SKIRT_MARGIN below it so the downhill side does not float.
export const SLOPE_CAP = 4;
export const SKIRT_MARGIN = 0.3;
export function ringCentroid(ring) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length], k = x0 * z1 - x1 * z0;
    a += k; cx += (x0 + x1) * k; cz += (z0 + z1) * k;
  }
  if (Math.abs(a) < 1e-6) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return [cx / (3 * a), cz / (3 * a)];
}
export function buildingBase(ring, groundAt, cap = SLOPE_CAP) {
  let low = Infinity; for (const [x, z] of ring) low = Math.min(low, groundAt(x, z));
  const [cx, cz] = ringCentroid(ring);
  return { base: Math.min(Math.max(groundAt(cx, cz), low), low + cap), low, bottom: low - SKIRT_MARGIN };
}
```

If a float-exact `deepEqual` in the flat-ground test fails (`99.7`), compare with a 1e-9 tolerance: that is a test-precision
fix on the new test, not a behaviour change.

- [ ] **Step 4: Run, expect PASS**, then the whole file: `node --test prototype/tests/`.
- [ ] **Step 5: Commit** `feat(buildings): ringCentroid and buildingBase for slope-aware building bases (#91)`

---

### Task 2: `osmBuilding()` stands on `base`, walls reach `bottom`

**Files:** `prototype/index.html`, `prototype/tests/test_row_houses.py`.

- [ ] **Step 1: Write the failing Playwright tests** (new tests in `test_row_houses.py`, reuse `open_page`, `needs_world`,
  `ROW_IDS`). They read `window.__mm.buildingBases` (id -> `{ base, low, bottom }`), which does not exist yet:

```python
@needs_world
def test_buildings_stand_on_the_centroid_ground_and_walls_reach_the_low_point(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        try:
            r = page.evaluate("""() => {
                const m = window.__mm.buildingBases; if (!m) return null;
                const rows = [...m.values()];
                return { n: rows.length,
                         floating: rows.filter(v => v.bottom > v.low - 0.29).length,        // walls must end 0.3 m under the low point
                         belowLow: rows.filter(v => v.base < v.low - 1e-6).length,
                         overCap: rows.filter(v => v.base > v.low + 4 + 1e-6).length,
                         lifted: rows.filter(v => v.base - v.low > 0.01).length,
                         row: [...m].filter(([id]) => id === 171822953).map(([, v]) => v.base - v.low) };
            }""")
        finally:
            b.close()
    assert r is not None, "window.__mm.buildingBases missing"
    assert r["n"] > 1500 and r["floating"] == 0 and r["belowLow"] == 0 and r["overCap"] == 0
    assert r["lifted"] > 100                       # a real slope effect region-wide (99+ buildings are over 2 m in #34's numbers)
    assert 1.2 <= r["row"][0] <= 1.6               # 4a-4f: the ~1.4 m the roofs were short (centroid minus lowest = 1.48 m on the DTM)
```

Also assert, in the same file, that a flat-ground building's roof is unchanged: pick the first building with
`base - low < 0.01` and check its collider top (`OBB` entry for its `rect`) equals `low + h` within 0.01. Use whatever OBB
hook `test_row_houses.py` already uses to find an obstacle; if none exists, expose nothing new and skip this one assertion,
noting it in the PR.

- [ ] **Step 2: Run, expect FAIL** (`buildingBases missing`), in the foreground with a generous timeout:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 prototype/.venv/bin/python -m pytest prototype/tests/test_row_houses.py -k centroid -x`
  (use whichever Python the other prototype tests use; see `prototype/tests/conftest.py`).

- [ ] **Step 3: Implement** in `prototype/index.html`:
  1. Add `buildingBase` to the `world.js` import.
  2. Above `osmBuilding`: `const BUILDING_BASE = new Map(); window.__mm.buildingBases = BUILDING_BASE;`
  3. `extrudeFootprint(ring, base, h, ..., bottom = base - 2)`: `y0 = Math.min(base - 2, bottom)`; `v0 = (y0 - base) / tile[1]`
     (it is `-2 / tile[1]` today, so the texture continues down by the same scale).
  4. In `osmBuilding`, replace the `let base = Infinity; for ... Math.min` by
     `const { base, bottom } = buildingBase(b.ring, terrainH); BUILDING_BASE.set(b.id, { base, low: bottom + SKIRT_MARGIN, bottom });`
     (import `SKIRT_MARGIN` too) and pass `bottom` to both `extrudeFootprint` calls. For the gable path:
     `const drop = Math.max(3, base - bottom); box(w, h + drop, d, cx, base - drop, cz, ...)`.
     Nothing else in the function changes: `gable(..., base + h, ...)` and both `addOBB(..., base + h)` already use `base`.
  5. Do not add any random call.

- [ ] **Step 4: Run** the new test (PASS), then `test_row_houses.py` in full, then the whole prototype suite in the
  foreground, and `node --test prototype/tests/`. Open the page once with Playwright and assert an empty console.
  Note the 4a-4f roofs: take the `base` delta against `main` from the test output, not by eye.
- [ ] **Step 5: Commit** `fix(buildings): stand buildings on the centroid ground with a foundation skirt (#91)`

---

### Task 3: Labels follow the base

**Files:** `prototype/world.js`, `prototype/debug.js`, `prototype/index.html`, `prototype/tests/world.test.mjs`, `prototype/tests/debug.test.mjs`.

- [ ] **Step 1: Failing tests.** `addrLabels` items carry the building `id` (landmark items get none); `heightLabels` items
  carry `id`. Extend the existing `addrLabels` test in `world.test.mjs:135-150` and the `heightLabels` test in
  `debug.test.mjs` with `assert.equal(item.id, <building id>)`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Add `id: b.id` to the two item builders. In `index.html` (the two `it.y = terrainH(it.x, it.z) + it.top + ...`
  lines, ~858 and ~1206) use `(BUILDING_BASE.get(it.id)?.base ?? terrainH(it.x, it.z))`. `BUILDING_BASE` is filled when the
  buildings are built (line ~823), before both lines run; verify by reading the order, and move the `const` above if not.
- [ ] **Step 4: Run** node tests, `test_street_labels.py` and `test_debug.py` (foreground).
- [ ] **Step 5: Commit** `fix(buildings): house-number and debug-height labels follow the building base (#91)`

---

### Task 4: Changelog, verification, hand-off

- [ ] **Step 1:** CHANGELOG `[Unreleased]` / `Fixed`, player voice, e.g. "Houses on a slope now stand where they really stand
  instead of at their lowest corner, so roofs are no longer too low (the Bodenackerstrasse row houses are about 1.4 m taller)
  and the downhill side reaches down to the ground." Keep the file's existing language and style (read the neighbouring entries).
- [ ] **Step 2: Verify before the PR**, foreground: `node --test prototype/tests/`, the full prototype pytest suite, an empty
  console on load, and a screenshot of Bodenackerstrasse 4a-4f from the downhill side showing no gap. Confirm no pipeline
  file changed (`git diff --stat origin/main`) and `data/world_hochrhein.json` is untouched.
- [ ] **Step 3:** PR `fix(buildings): stand buildings on the centroid ground with a foundation skirt`, `Closes #91`. List in
  the PR which of #87/#71 landed first and how the rebase was resolved. No version bump unless the repo's release flow asks.
