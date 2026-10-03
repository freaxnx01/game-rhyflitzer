# Sprungschanze Ramp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After **J → Sprungschanze** in the OSM world, the car stands on a 40 m run-up with the ramp visible straight ahead. Holding gas from there launches the car off the ramp (#80).

**Architecture:** The ramp's physics (`RAMP` + `groundH`) already works in both layouts. Only its mesh is hand-layout-only, and J puts the car on the nearest road, 175 m away. Two changes fix that. (1) The wedge mesh moves into a `rampMesh()` builder that runs in both layouts. (2) The Sprungschanze entry is flagged `ramp: true` in `landmarks.js`, and `pickJump` places such a row on a run-up computed by a pure `rampApproach()`.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, ES module `prototype/landmarks.js`, `node --test`, and Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-sprungschanze-ramp-design.md`

## Global Constraints

- Do not touch `data/` or `pipeline/`. The ramp stays at the `jumpRamp` anchor (337.8, 170.2).
- The wedge geometry is **moved, not changed**: the same vertices, UVs, colour and `push('gravel', g)`. The hand layout must look exactly as before.
- `rampMesh()` must run **before** the `parts` merge loop (`for (const role in parts)`, ~L811). Otherwise the geometry is never added to the scene.
- `landmarkEntries` output for non-ramp items stays exactly `{ n, g, x, z }`. The existing deep-equal tests in `landmarks.test.mjs` stay unchanged and green.
- `__mm.jumpList()` stays `{ n, g }` per row. The existing `test_jump.py` tests stay unchanged and green.
- No new UI string. The toast is the entry name, as today. No `tr()` change.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments). Match the surrounding code, and do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()` (the seeded RNG). Calling `rampMesh()` instead of inlining it changes no RNG draw order, because the wedge uses no RNG.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q`. These runs are slow (several minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **Mesh placement:** `rampMesh()` is called outside `if (!L) { … }` and before the merge. If it is called after the merge, the hand-layout ramp disappears too. `test_hand_layout_still_draws_the_ramp` pins this.
- **Direction:** `th = 0` (+x) is the direction `groundH` raises the ramp (`x0` low, `x1` high). Driving `th = π` would hit the 3.4 m back face.
- **#79 overlap:** #79 also changes `jumpTo`/`pickJump`. If #79 has landed first, keep its change and add only the `r.ramp` branch.

---

## File map

- `prototype/landmarks.js`: `LANDMARK_INFO` Sprungschanze row (~L27), `landmarkEntries` (~L49-57), and the new `rampApproach` export.
- `prototype/tests/landmarks.test.mjs`: three new tests (Task 1).
- `prototype/index.html`:
  - the import (~L204)
  - the wedge block (~L750) moved into `rampMesh()`, with the call after the hand-only block (~L752)
  - `jumpToRamp` next to `jumpTo` (~L923)
  - `pickJump` (~L1021)
  - the `__mm.ramp` hook next to `__mm.place` (~L927)
- `prototype/tests/test_jump.py`: three new tests (Task 2).
- `CHANGELOG.md`, `test-todo.md` (Task 3).

Line numbers are from `main` @ `a1f63d6`. Verify them with `grep -n` before editing, because other PRs may have shifted them.

---

### Task 1: `rampApproach` and the `ramp` flag (node, TDD)

**Files:**
- Modify: `prototype/tests/landmarks.test.mjs`
- Modify: `prototype/landmarks.js`

**Interfaces:**
- `export function rampApproach(ramp, runUp)`: `ramp = { x0, x1, z0, z1 }`. Returns `{ x: ramp.x0 - runUp, z: (ramp.z0 + ramp.z1) / 2, th: 0 }`.
- `landmarkEntries(info, anchors, buildings)`: unchanged signature. An entry from an item with `ramp: true` gets `ramp: true`.

- [ ] **Step 1: Write the failing tests.** Change the import line of `prototype/tests/landmarks.test.mjs` to:

```js
import { GEMEINDEN, LANDMARK_INFO, foldText, landmarkEntries, filterLandmarks, gemeindenOf, rampApproach } from '../landmarks.js';
```

Append at the end of the file:

```js
test('rampApproach stands runUp metres before the low edge, centred, facing up the ramp (+x)', () => {
  assert.deepEqual(rampApproach({ x0: 100, x1: 125.4, z0: 10, z1: 45.6, h: 3.4 }, 40), { x: 60, z: 27.8, th: 0 });
});

test('landmarkEntries passes the ramp flag through, and only for ramp items', () => {
  const info = [
    { name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp', ramp: true },
    { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  ];
  const e = landmarkEntries(info, { jumpRamp: { x: 337.8, z: 170.2 }, smileKreisel: { x: 1270, z: -148 } }, []);
  assert.deepEqual(e, [
    { n: 'Sprungschanze', g: 'Sisseln', x: 337.8, z: 170.2, ramp: true },
    { n: 'Smile-Kreisel', g: 'Sisseln', x: 1270, z: -148 },
  ]);
});

test('LANDMARK_INFO flags only the Sprungschanze as a ramp (#80)', () => {
  assert.deepEqual(LANDMARK_INFO.filter(l => l.ramp).map(l => l.name), ['Sprungschanze']);
});
```

- [ ] **Step 2: Run the tests and watch them fail.**

```bash
node --test prototype/tests/*.test.mjs
```

Expected: FAIL. The import fails with `does not provide an export named 'rampApproach'`, so the whole `landmarks.test.mjs` file errors.

- [ ] **Step 3: Implement.** In `prototype/landmarks.js`, change the Sprungschanze row:

```js
  { name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp', ramp: true },     // J puts the car on its run-up, not on a road (#80)
```

In `landmarkEntries`, replace the `found.push(...)` line with:

```js
    if (p) found.push({ n: item.name, g: item.gemeinde, x: p.x, z: p.z, i, ...(item.ramp ? { ramp: true } : {}) });
```

Add after `gemeindenOf`:

```js
// The Sprungschanze's run-up (#80): runUp metres before the low edge x0, centred across it, facing up the ramp
// (th 0 = +x, the direction groundH raises it).
export function rampApproach(ramp, runUp) {
  return { x: ramp.x0 - runUp, z: (ramp.z0 + ramp.z1) / 2, th: 0 };
}
```

- [ ] **Step 4: Run all node tests and watch them pass.**

```bash
node --test prototype/tests/*.test.mjs
```

Expected: PASS, all files (`landmarks`, `strings`, `debug`, `world`).

- [ ] **Step 5: Commit.**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs
git commit -m "feat(jump): flag the Sprungschanze and compute its run-up (#80)"
```

---

### Task 2: Draw the ramp in both layouts and jump onto its run-up (Playwright, TDD)

**Files:**
- Modify: `prototype/tests/test_jump.py`
- Modify: `prototype/index.html`

**Interfaces:**
- `window.__mm.ramp()` returns `{ x0, x1, z0, z1, h }` (the live `RAMP`).
- `window.__mm.counts.ramp`: `1` once `rampMesh()` has run.
- `function rampMesh()`: builds the wedge from `RAMP` and sets the count.
- `function jumpToRamp(name)`: `placeOnRoad` at `rampApproach(RAMP, RAMP_RUNUP)`.

- [ ] **Step 1: Write the failing tests.** Append to `prototype/tests/test_jump.py`:

```python
def ramp(page):
    return page.evaluate("() => window.__mm.ramp()")


@needs_world
def test_sprungschanze_puts_the_ramp_right_ahead(server):
    """#80: J -> Sprungschanze lands 175 m away on a road with the ramp 90 deg off, and the ramp is not drawn."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "sprung")
        r = ramp(page)
        cx, cz = (r["x0"] + r["x1"]) / 2, (r["z0"] + r["z1"]) / 2
        ax, az = anchor("jumpRamp")
        assert math.hypot(cx - ax, cz - az) < 0.01, "the ramp is not on its anchor"
        assert page.evaluate("() => window.__mm.counts.ramp") == 1, "the ramp is not drawn in the OSM world"
        d = math.hypot(cx - c["x"], cz - c["z"])
        assert 30 < d < 80, f"the ramp is {d:.0f} m away"
        assert c["x"] < r["x0"], "the car does not start before the ramp's low edge"
        th = page.evaluate("() => window.__mm.heading()")
        off = math.degrees((math.atan2(cz - c["z"], cx - c["x"]) - th + math.pi) % (2 * math.pi) - math.pi)
        assert abs(off) < 5, f"the ramp is {off:.0f} deg off the heading"
        b.close()


@needs_world
def test_sprungschanze_run_up_launches_the_car(server):
    # Fixed 1/60 s steps: the dry run (procedural terrain, as here) was 2.41 m above the ground at x 362.8 after 4 s.
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "sprung")
        th = page.evaluate("() => window.__mm.heading()")
        r = ramp(page)
        end = page.evaluate(f"() => window.__mm.sim({c['x']}, {c['z']}, {th}, 0, 4)")
        g = page.evaluate(f"() => window.__mm.ground({end['x']}, {end['z']}, -Infinity)")
        assert end["x"] > r["x1"], "the car did not get over the ramp"
        assert r["z0"] < end["z"] < r["z1"], "the car left the ramp sideways"
        assert end["y"] - g > 1.0, "the ramp did not launch the car"
        b.close()


def test_hand_layout_still_draws_the_ramp(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, block_world=True)
        assert page.evaluate("() => window.__mm.layout") == "hand"
        assert page.evaluate("() => window.__mm.counts.ramp") == 1
        b.close()
```

- [ ] **Step 2: Commit and push the branch, then run the new tests and watch them fail.**

```bash
git add prototype/tests/test_jump.py
git commit -m "test(jump): Sprungschanze puts the ramp ahead and launches the car (#80)"
git push -u origin HEAD
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -k "sprungschanze or hand_layout_still"
```

Expected: 3 FAIL. The two OSM tests fail with `window.__mm.ramp is not a function`. The hand-layout test fails because `counts.ramp` is `None`.

- [ ] **Step 3: Implement the mesh move.** In `prototype/index.html`:

1. Delete the wedge line inside the hand-only block. It is the line starting `  { const { x0, x1, z0, z1, h } = RAMP; const T = (x, z) => terrainH(x, z);` (~L750).
2. Directly after the `}` that closes `if (!L) { // hand-traced buildings and landmarks …` (~L752, the line after `for (const r of ROADS) if (r.houses) housesAlong(r);`), add:

```js
  rampMesh();   // the Sprungschanze, in both layouts: groundH raises the ground there in both (#80)
```

3. Add the builder as a top-level function directly above the `if (!L) { // hand-traced buildings` line (same indentation as the surrounding builders). Use the deleted body unchanged:

```js
  // gravel wedge over RAMP: sloped top rising along +x, back face at x1 (no side walls)
  function rampMesh() { const { x0, x1, z0, z1, h } = RAMP; const T = (x, z) => terrainH(x, z); const pos = [x0, T(x0, z0), z0, x1, T(x1, z0) + h, z0, x1, T(x1, z1) + h, z1, x0, T(x0, z0), z0, x1, T(x1, z1) + h, z1, x0, T(x0, z1), z1, x1, T(x1, z0), z0, x1, T(x1, z1), z1, x1, T(x1, z1) + h, z1, x1, T(x1, z0), z0, x1, T(x1, z1) + h, z1, x1, T(x1, z0) + h, z0]; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => (i % 2 ? (i % 4 === 1 ? 0 : 3) : (i % 4 === 0 ? 0 : 2))), 2)); colorize(g, col('#8a6a48')); push('gravel', g); window.__mm.counts.ramp = 1; }
```

If the surrounding scope turns out not to be a block where a function declaration is fine (check with `grep -n` for the enclosing `{`), declare it as a top-level `function rampMesh()` just above that scope instead. It only needs `RAMP`, `terrainH`, `THREE`, `colorize`, `col` and `push`, all defined earlier at top level.

- [ ] **Step 4: Implement the jump.** In `prototype/index.html`:

1. Import: `import { LANDMARK_INFO, landmarkEntries, filterLandmarks, gemeindenOf, rampApproach } from './landmarks.js';`
2. After the `function jumpTo(p) { … }` line, add:

```js
const RAMP_RUNUP = 40;   // J → Sprungschanze: metres of run-up before the ramp's low edge, enough to launch from standstill (#80)
function jumpToRamp(name) { const s = rampApproach(RAMP, RAMP_RUNUP); placeOnRoad(s.x, s.z, s.th, name); }   // off road: R returns to the run-up
```

3. `pickJump`:

```js
function pickJump(i) { const r = JUMP.rows[i]; if (!r) return; if (r.random) randomSpot(); else if (r.ramp) jumpToRamp(r.n); else jumpTo(r); }
```

4. After the `window.__mm.ground = …` hook, add:

```js
window.__mm.ramp = () => ({ x0: RAMP.x0, x1: RAMP.x1, z0: RAMP.z0, z1: RAMP.z1, h: RAMP.h });
```

- [ ] **Step 5: Commit and push, then run the new tests and watch them pass.**

```bash
git add prototype/index.html
git commit -m "fix(jump): draw the Sprungschanze in the OSM world and jump onto its run-up (#80)"
git push
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -k "sprungschanze or hand_layout_still"
```

Expected: 3 PASS.

- [ ] **Step 6: Run the full suite.** Run each command on its own:

```bash
node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q
```

Expected: all PASS. The existing jump, smoke and debug tests are unchanged. If a test fails 3 times, stop and report what is going wrong.

---

### Task 3: Changelog and playtest note

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `test-todo.md`

- [ ] **Step 1: Changelog.** Under `## [Unreleased]` → `### Fixed`, add as the first bullet:

```markdown
- **J → Sprungschanze** now really takes you to the ramp: the car stands on a short run-up with the gravel ramp right in front of it — step on the gas and fly. Before, the jump dropped you on a road 175 m away and the ramp was invisible (you could only feel a bump in the field).
```

- [ ] **Step 2: Playtest note.** Append to `test-todo.md`:

```markdown
## Sprungschanze (#80)

- [ ] J → Sprungschanze: the gravel ramp is right ahead and clearly visible on the real terrain (not buried in a slope, not floating).
- [ ] Full gas from the jump spot: the car goes up the ramp and flies; the landing feels OK. **R** brings you back to the run-up.
- [ ] Seen from the side, the open wedge (no side walls) is acceptable — or note that it needs side walls.
```

- [ ] **Step 3: Commit and push.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(jump): changelog and playtest note for the Sprungschanze (#80)"
git push
```
