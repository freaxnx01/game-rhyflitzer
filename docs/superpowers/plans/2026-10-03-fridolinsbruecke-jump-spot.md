# Fridolinsbrücke Jump Spot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** J → Fridolinsbrücke always places the car on the Swiss side (Stein), on the road, facing the bridge (#79).

**Architecture:** A `LANDMARK_INFO` item in `prototype/landmarks.js` may carry a hand-kept `jump: [x, z]` (game metres). `landmarkEntries` passes it through as `j`. A new pure `faceToward(th, x, z, tx, tz)` flips a road heading to face a target. In `prototype/index.html`, the nearest-road search moves into `nearestJumpable(px, pz)` (identical to the helicopter plan's helper, #10), and `jumpTo` snaps `p.j` when present and faces the landmark. Only the Fridolinsbrücke gets a jump spot.

**Tech Stack:** vanilla JS ES modules in the buildless `prototype/`, `node --test` for `landmarks.js`, Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-fridolinsbruecke-jump-spot-design.md`

## Global Constraints

- Entries **without** `jump` keep exactly today's shape `{ n, g, x, z }`, and `jumpTo` without `p.j` keeps exactly today's snap and heading. Existing tests in `prototype/tests/landmarks.test.mjs` and `prototype/tests/test_jump.py` stay unchanged and green.
- `nearestJumpable(px, pz)` must be **character-for-character** the helper in `docs/superpowers/plans/2026-10-03-helicopter-mode.md` (Task "Split `jumpTo`", Step 4), so #10 and #79 rebase onto each other trivially. If #10 has already merged and `nearestJumpable` exists on `main`, reuse it and only change `jumpTo`.
- No new UI strings (the toast stays the landmark name). No change to `pipeline/`, `pipeline/anchors.json` or `data/`.
- Out of scope: #78 (deck level with the roads). Do not touch bridge geometry, `BRIDGES`, `jumpable`, or deck heights.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()`.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q`. These runs are slow (several minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **Facing:** `faceToward` must compare against the landmark's own position (`p.x, p.z`, the bridge mid-river), not against the jump spot. Pinned by the heading assertion in the Playwright test.
- **Other landmarks unchanged:** `j` is only added when the item has `jump`; pinned by the existing `deepEqual` tests in `landmarks.test.mjs`.

## File Structure

- Modify `prototype/landmarks.js` — `jump` on the Fridolinsbrücke item, `j` passthrough in `landmarkEntries`, new export `faceToward`.
- Modify `prototype/tests/landmarks.test.mjs` — three new tests.
- Modify `prototype/index.html` — import `faceToward`; split `nearestJumpable` out of `jumpTo`; `jumpTo` uses `p.j`.
- Modify `prototype/tests/test_jump.py` — one new Playwright test.
- Modify `CHANGELOG.md` — one `Fixed` entry under `[Unreleased]`.

---

### Task 1: Jump spot and `faceToward` in `landmarks.js`

**Files:**
- Modify: `prototype/landmarks.js` (item at line 9; `landmarkEntries` at lines 51-60; new export after it)
- Test: `prototype/tests/landmarks.test.mjs`

**Interfaces:**
- `LANDMARK_INFO` item: optional `jump: [x, z]` (game metres).
- `landmarkEntries(info, anchors, buildings)` → entries `{ n, g, x, z }`, plus `j: [x, z]` when the item has `jump`.
- `faceToward(th, x, z, tx, tz)` → `th` when `(cos th, sin th)` has a non-negative dot product with `(tx - x, tz - z)`, else `th + Math.PI`.

- [ ] **Step 1: Write the failing tests.** In `prototype/tests/landmarks.test.mjs`, extend the import on line 3 to

```js
import { GEMEINDEN, LANDMARK_INFO, foldText, landmarkEntries, filterLandmarks, gemeindenOf, faceToward } from '../landmarks.js';
```

and append:

```js
test('landmarkEntries passes a jump spot through as j (#79)', () => {
  const info = [{ name: 'Brücke', gemeinde: 'Stein', anchor: 'muenster', jump: [10, 20] }];
  assert.deepEqual(landmarkEntries(info, ANCHORS, []), [{ n: 'Brücke', g: 'Stein', x: -1331, z: -172.7, j: [10, 20] }]);
});

test('faceToward keeps a heading towards the target and flips one away from it (#79)', () => {
  assert.equal(faceToward(0, 0, 0, 10, 1), 0);
  assert.equal(faceToward(0, 0, 0, -10, 1), Math.PI);
  assert.equal(faceToward(Math.PI / 2, 5, 5, 5, 50), Math.PI / 2);
  assert.equal(faceToward(Math.PI / 2, 5, 5, 5, -50), Math.PI / 2 + Math.PI);
});

test('the Fridolinsbrücke jumps to the Swiss approach, east of the deck end (#79)', () => {
  const item = LANDMARK_INFO.find(x => x.name === 'Fridolinsbrücke');
  assert.ok(item.jump, 'Fridolinsbrücke has a jump spot');
  assert.ok(item.jump[0] > -1233.5, 'jump spot is east of the Swiss deck end (-1233.5, 533.5)');
  assert.ok(Math.hypot(item.jump[0] + 1233.5, item.jump[1] - 533.5) < 40, 'jump spot is near the Swiss deck end');
});
```

- [ ] **Step 2: Run them and see them fail.** `node --test prototype/tests/*.test.mjs` — expected: the three new tests fail (`faceToward` is not exported; no `j`; no `jump`), everything else passes.

- [ ] **Step 3: Implement.** In `prototype/landmarks.js`, replace line 9 with

```js
  { name: 'Fridolinsbrücke', gemeinde: 'Bad Säckingen', anchor: 'fridolinsbruecke', jump: [-1211.0, 535.5] },   // #79: J lands on the Swiss approach (Stein), westbound, ~23 m before the deck
```

In `landmarkEntries`, replace the push line

```js
    if (p) found.push({ n: item.name, g: item.gemeinde, x: p.x, z: p.z, i });
```

with

```js
    if (p) found.push({ n: item.name, g: item.gemeinde, x: p.x, z: p.z, ...(item.jump ? { j: [...item.jump] } : {}), i });
```

and after `landmarkEntries` add

```js
// #79: a road heading (car forward = (cos th, sin th)) turned, if needed, so the car faces (tx, tz)
export function faceToward(th, x, z, tx, tz) {
  return Math.cos(th) * (tx - x) + Math.sin(th) * (tz - z) < 0 ? th + Math.PI : th;
}
```

- [ ] **Step 4: Run the node tests.** `node --test prototype/tests/*.test.mjs` — expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs
git commit -m "feat(prototype): jump spot and faceToward for J landmarks (#79)"
```

### Task 2: `jumpTo` uses the jump spot and faces the landmark

**Files:**
- Modify: `prototype/index.html` (import at line 204; `jumpTo` at line 923)
- Test: `prototype/tests/test_jump.py`

**Interfaces:**
- Consumes `faceToward` and the `j` field from Task 1.
- Produces `nearestJumpable(px, pz)` → `{ d, x, z, th } | null` (shared with #10).

- [ ] **Step 1: Write the failing test.** Append to `prototype/tests/test_jump.py`:

```python
SWISS_END = (-1233.5, 533.5)      # Fridolinsbrücke deck end at Schaffhauserstrasse (Stein CH)
GERMAN_END = (-1462.6, 459.1)     # deck end at Fricktalstraße (Bad Säckingen DE)


def _jumpable_road_dist(x, z):
    best = math.inf
    for r in json.loads(WORLD.read_text(encoding="utf-8"))["roads"]:
        if r["bridge"] or r["cls"] in ("motorway", "motorway_link"):
            continue
        for (ax, az), (bx, bz) in zip(r["pts"], r["pts"][1:]):
            dx, dz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / ((dx * dx + dz * dz) or 1)))
            best = min(best, math.hypot(x - (ax + dx * t), z - (az + dz * t)))
    return best


@needs_world
def test_fridolinsbruecke_lands_on_the_swiss_side_facing_the_bridge(server):
    """#79: the Swiss approach (Stein), on the road, facing the deck - not the German bank nearest the mid-river anchor."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "fridolinsbr")
        to_ch = math.hypot(c["x"] - SWISS_END[0], c["z"] - SWISS_END[1])
        to_de = math.hypot(c["x"] - GERMAN_END[0], c["z"] - GERMAN_END[1])
        assert to_ch < 60, f"car at ({c['x']:.1f}, {c['z']:.1f}) is {to_ch:.0f} m from the Swiss deck end"
        assert to_ch < to_de
        assert c["bridge"] is False
        assert _jumpable_road_dist(c["x"], c["z"]) < 4
        th = page.evaluate("() => window.__mm.heading()")
        ax, az = anchor("fridolinsbruecke")
        ux, uz = ax - c["x"], az - c["z"]
        assert (math.cos(th) * ux + math.sin(th) * uz) / math.hypot(ux, uz) > 0.5, "car does not face the bridge"
        b.close()
```

- [ ] **Step 2: Commit and push the test, then run it and see it fail.**

```bash
git add prototype/tests/test_jump.py
git commit -m "test(prototype): J to the Fridolinsbrücke lands on the Swiss side (#79)"
git push -u origin HEAD
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -k fridolinsbruecke
```

Expected: FAIL on `to_ch < 60` (today the car lands on the German bank, about 230 m away). Foreground only.

- [ ] **Step 3: Implement.** In `prototype/index.html` line 204, extend the import:

```js
import { LANDMARK_INFO, landmarkEntries, filterLandmarks, gemeindenOf, faceToward } from './landmarks.js';
```

Replace the whole `function jumpTo(p) { … }` line (~L923) with these two lines (`nearestJumpable` is identical to #10's; if it already exists on `main`, keep that one and replace only `jumpTo`):

```js
function nearestJumpable(px, pz) { let best = null; for (const r of ROADS) { if (!jumpable(r)) continue; for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1), x = ax + dx * t, z = az + dz * t, d = Math.hypot(px - x, pz - z); if (!best || d < best.d) best = { d, x, z, th: Math.atan2(dz, dx) }; } } return best; }
function jumpTo(p) { const [tx, tz] = p.j || [p.x, p.z], best = nearestJumpable(tx, tz); if (!best) return; placeOnRoad(best.x, best.z, p.j ? faceToward(best.th, best.x, best.z, p.x, p.z) : best.th, p.n); }   // #79: a landmark's own jump spot (j), facing the landmark
```

- [ ] **Step 4: Run the jump tests.** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q` — expected: all pass, the new one included. Foreground only.

- [ ] **Step 5: Commit.**

```bash
git add prototype/index.html
git commit -m "fix(prototype): J to the Fridolinsbrücke lands on the Swiss side (#79)"
```

### Task 3: Changelog and full suite

**Files:**
- Modify: `CHANGELOG.md` (`### Fixed` under `## [Unreleased]`, line 42)

- [ ] **Step 1: Changelog.** Add as the first bullet under `### Fixed` in `[Unreleased]`:

```markdown
- **J** → Fridolinsbrücke now puts you on the Swiss side in Stein, on the road and facing the bridge — no longer somewhere on the German bank.
```

- [ ] **Step 2: Full suite.** `node --test prototype/tests/*.test.mjs`, then `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q` (slow, foreground only). Expected: all pass (OSM cases skip without the world file).

- [ ] **Step 3: Commit and push.**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): J to the Fridolinsbrücke lands in Stein (#79)"
git push
```

- [ ] **Step 4: PR.** Title `fix(prototype): J → Fridolinsbrücke places the car on the Swiss side`, body `Closes #79`. Under Testing, list the manual playtest still owed: J → Fridolinsbrücke lands on the Stein side facing the deck; other J entries and the map double-click land as before. Note in the PR that driving onto the deck from there may still jump — that is #78.
