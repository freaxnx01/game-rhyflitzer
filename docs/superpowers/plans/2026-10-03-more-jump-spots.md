# More Jump Spots (Bergsee, Plattform) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Bergsee** to the J list, and make **Plattform Sisslerfeld** land beside its tower instead of inside it. **Hallenbad** is already listed and stays as is (#94).

**Architecture:** `prototype/landmarks.js` only. `sourcePos` learns a third source, `at: [x, z]` (hand game metres), for entries with no anchor and no building. The Bergsee entry and a `jump` on the Plattform entry use #79's per-entry `jump` field, which `jumpTo` already snaps and faces. No pipeline or world-data change.

**Tech Stack:** vanilla JS ES modules in the buildless `prototype/`, `node --test`, Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-more-jump-spots-design.md`

## Global Constraints

- **Precondition (Task 1):** #79 must be on `main` (`faceToward` exported from `prototype/landmarks.js`, `j` passthrough in `landmarkEntries`, `jumpTo` snapping `p.j`). If not, STOP, report it on the issue, and do not re-implement it here.
- No change to `pipeline/`, `pipeline/anchors.json`, `data/`, or `prototype/index.html`. No new UI strings. No new dependency.
- Entries without `at`/`jump` keep today's shape `{ n, g, x, z }`.
- Do not modify existing assertions except the ones Task 2 names (they count entries or assume one source per entry, and Bergsee legitimately changes them).
- Commands (repo root): node `node --test prototype/tests/*.test.mjs`. Playwright, foreground only, never `run_in_background`: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q` (slow; exit 137 = cap hit, stop and report). Without `systemd-run --user`, run without the prefix.
- Conventional Commits, explicit paths with `git add`, never `-A`. Push the branch before the Playwright run.
- Changelog (player voice, German as the file does): append one entry under `[Unreleased]` in `CHANGELOG.md`.

## Review Focus

- The Plattform `jump` must be on `Breitenloh` and away from the tower (the tower stands on the road at the anchor). Pinned by the world-sanity node test and the Playwright distance check.
- `at` must not break the "one source per entry" invariant test: the invariant becomes exactly one of `anchor` / `building` / `at`.

## File Structure

- Modify `prototype/landmarks.js` — `at` source, Bergsee entry, Plattform `jump`.
- Modify `prototype/tests/landmarks.test.mjs`, `prototype/tests/test_jump.py`.
- Modify `CHANGELOG.md`, `test-todo.md`.

---

### Task 1: Precondition and failing node tests

**Files:** `prototype/tests/landmarks.test.mjs`

- [ ] **Step 1: Check #79 is on `main`**

Run: `grep -n "export function faceToward" prototype/landmarks.js`
Expected: one hit. No hit: STOP (see Global Constraints).

- [ ] **Step 2: Write the failing tests**

Add `import { readFileSync, existsSync } from 'node:fs';` at the top of `prototype/tests/landmarks.test.mjs` and append:

```js
test('#94 an `at` item resolves to its hand-kept position without anchors or buildings', () => {
  const e = landmarkEntries([{ name: 'Teich', gemeinde: 'Stein', at: [10, -20] }], {}, []);
  assert.deepEqual(e, [{ n: 'Teich', g: 'Stein', x: 10, z: -20 }]);
});

test('#94 Bergsee, Hallenbad and Plattform are in the J table', () => {
  const by = n => LANDMARK_INFO.find(l => l.name === n);
  assert.equal(by('Bergsee').gemeinde, 'Bad Säckingen');
  assert.deepEqual(by('Bergsee').at, [-2349, -2207]);
  assert.deepEqual(by('Bergsee').jump, [-2345, -2143]);
  assert.equal(by('Hallenbad Sissila').gemeinde, 'Sisseln');
  assert.equal(by('Hallenbad Sissila').anchor, 'hallenbad');
  assert.equal(by('Plattform Sisslerfeld').gemeinde, 'Münchwilen');
  assert.deepEqual(by('Plattform Sisslerfeld').jump, [78.1, 861.4]);
  const names = landmarkEntries(LANDMARK_INFO, { hallenbad: { x: 1968, z: -374.2 } }, []).map(x => x.n);
  assert.ok(names.includes('Bergsee') && names.includes('Hallenbad Sissila'));
  assert.deepEqual(filterLandmarks(landmarkEntries(LANDMARK_INFO, {}, []), 'berg', null).map(x => x.n), ['Bergsee']);
});

const WORLD_URL = new URL('../../data/world_hochrhein.json', import.meta.url);
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const distToRoads = (roads, x, z) => Math.min(...roads.filter(r => r.cls !== 'motorway' && !r.bridge).flatMap(r => r.pts.slice(1).map((p, i) => {
  const [ax, az] = r.pts[i], dx = p[0] - ax, dz = p[1] - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
})));

test('#94 world sanity: Bergsee lies in a water body of that name, the jump spots lie on roads', { skip: !existsSync(WORLD_URL) }, () => {
  const w = JSON.parse(readFileSync(WORLD_URL, 'utf8'));
  const by = n => LANDMARK_INFO.find(l => l.name === n);
  const [bx, bz] = by('Bergsee').at;
  assert.ok(w.water.some(c => c.name === 'Bergsee' && inRing(c.rings[0], bx, bz)), 'Bergsee centre is inside a Bergsee water ring');
  assert.ok(distToRoads(w.roads, ...by('Bergsee').jump) < 3, 'Bergsee jump spot is on a road');
  assert.ok(distToRoads(w.roads, ...by('Plattform Sisslerfeld').jump) < 3, 'Plattform jump spot is on a road');
  const p = w.anchors.landmarks.plattform, j = by('Plattform Sisslerfeld').jump;
  assert.ok(Math.hypot(j[0] - p.x, j[1] - p.z) >= 15, 'Plattform jump spot is clear of the tower');
});
```

- [ ] **Step 3: Run, expect failure**

Run: `node --test prototype/tests/*.test.mjs`
Expected: the new tests FAIL (`at` ignored, no Bergsee entry, no Plattform `jump`).

- [ ] **Step 4: Commit**

```bash
git add prototype/tests/landmarks.test.mjs
git commit -m "test(prototype): failing tests for the Bergsee and Plattform jump spots (#94)"
```

### Task 2: Implement in `landmarks.js` and adapt the counting tests

**Files:** `prototype/landmarks.js`, `prototype/tests/landmarks.test.mjs`

- [ ] **Step 1: `sourcePos` takes `at` first**

In `sourcePos(item, anchors, buildingsById)`, add as the first line:

```js
  if (item.at) return { x: item.at[0], z: item.at[1] };
```

- [ ] **Step 2: Table**

After the `Aqualon Therme` line add:

```js
  { name: 'Bergsee', gemeinde: 'Bad Säckingen', at: [-2349, -2207], jump: [-2345, -2143] },   // #94: OSM lake "Bergsee" (water chunks 7/8) above Bad Säckingen; the spot is on Am Bergsee, facing the lake
```

Change the Plattform line to:

```js
  { name: 'Plattform Sisslerfeld', gemeinde: 'Münchwilen', anchor: 'plattform', jump: [78.1, 861.4] },   // #94: the tower stands on Breitenloh; the spot is 25 m east of it on the same road
```

- [ ] **Step 3: Adapt exactly these existing tests** (Bergsee adds one entry with a third source)

- `LANDMARK_INFO holds the 14 landmarks…`: `assert.equal(LANDMARK_INFO.length, 24)` becomes `25`; the title gains "and the Bergsee of #94"; the invariant becomes `assert.equal([l.anchor, l.building, l.at].filter(Boolean).length, 1, `${l.name}: exactly one of anchor / building / at`);`.
- `#46 entries resolve…` and `#81 LANDI-Turm…` call `landmarkEntries(LANDMARK_INFO, …)` and assert exact name lists that must not include the `at` entry: pass `LANDMARK_INFO.filter(l => !l.at)` instead of `LANDMARK_INFO` in those calls (including the `{ dsmChimney }` call of the #81 test).

If #79 or #80 changed these tests on `main` (another count or invariant), keep their edits and add only the `at` handling.

- [ ] **Step 4: Run, expect all green**

Run: `node --test prototype/tests/*.test.mjs`
Expected: PASS, including the world-sanity test (skipped if the world file is missing).

- [ ] **Step 5: Commit**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs
git commit -m "feat(prototype): Bergsee in the J list, Plattform jump spot beside the tower (#94)"
```

### Task 3: Playwright checks

**Files:** `prototype/tests/test_jump.py`

- [ ] **Step 1: Update counts**

`ALL_ROWS`: `(24 if WORLD46 else 17)` becomes `(25 if WORLD46 else 18)`. Any assertion listing the Bad Säckingen rows gains `"Bergsee"` after `Aqualon Therme`. The first row stays `Fridolinsmünster`; the chips are unchanged.

- [ ] **Step 2: Add tests** (use the file's `open_page`, `jump_via_dialog`, `anchor`, `needs_world`)

```python
@needs_world
def test_bergsee_jump_lands_on_the_lake_road_facing_the_lake(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "bergsee")
        h = page.evaluate("() => window.__mm.heading()")
        b.close()
    dx, dz = -2349 - c["x"], -2207 - c["z"]
    assert math.hypot(dx, dz) < 80, c
    assert dx * math.cos(h) + dz * math.sin(h) > 0.5 * math.hypot(dx, dz), (c, h)


@needs_world
def test_plattform_jump_lands_beside_the_tower_not_in_it(server):
    ax, az = anchor("plattform")
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "plattform")
        b.close()
    assert 15 < math.hypot(c["x"] - ax, c["z"] - az) < 40, c


@needs_world
def test_hallenbad_jump_still_lands_near_the_pool(server):
    ax, az = anchor("hallenbad")
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "hallenbad")
        b.close()
    assert math.hypot(c["x"] - ax, c["z"] - az) < 60, c
```

If `__mm.heading()` uses degrees or another convention, read it in `prototype/index.html` first and convert; the dot-product check is what matters.

- [ ] **Step 3: Push, then run (foreground)**

Run `git push`, then the Playwright command from Global Constraints.
Expected: PASS. A failing Bergsee heading check: print `c` and `h` and fix the `jump` coordinates (not the test) if the spot is off the road.

- [ ] **Step 4: Commit**

```bash
git add prototype/tests/test_jump.py
git commit -m "test(prototype): J to Bergsee, Plattform and Hallenbad (#94)"
```

### Task 4: Changelog and manual check list

**Files:** `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1:** Under `## [Unreleased]` → `Added`: „Neue Sprungziele: Bergsee (Bad Säckingen); der Sprung zur Plattform Sisslerfeld landet jetzt neben dem Turm statt darin."
- [ ] **Step 2:** In `test-todo.md` add a manual check (this file is committed and pushed straight to `main`, only that file): with the real terrain, J → Bergsee puts the car on Am Bergsee with the lake ahead; J → Plattform shows the tower in front of the car, not around it.
- [ ] **Step 3: Commit** with `git add CHANGELOG.md` and `git commit -m "docs(changelog): Bergsee and Plattform jump spots (#94)"`.
