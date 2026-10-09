# Südspange as a Jump Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** J lists "Südspange Sisslerfeld" (Eiken) and puts the car on the road at the K295 junction (1528, 409).

**Architecture:** `prototype/landmarks.js` only (a data row, plus the `at` source of `sourcePos` if #94 has not added it). No `pipeline/` or `data/` change, no dependency on #42.

**Spec:** `docs/superpowers/specs/2026-10-09-suedspange-jump-target-design.md` (issue #125).

## Global Constraints

- Do not touch `pipeline/`, `data/` or `prototype/index.html`.
- Do not add Bergsee, Plattform or Hallenbad work (#94).
- CHANGELOG entry: English, player-facing, under `[Unreleased]` / `Added`. Never `git cliff -o CHANGELOG.md`.
- UI strings: the name is a proper name, shown unchanged in `de` and `en`; no new string keys.
- Tests: `node --test prototype/tests/*.test.mjs`; one Playwright test in the foreground, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_jump.py -k suedspange -x`. Run only the affected test, not the full suite. Commit and push the branch before the browser run.
- Counts in existing tests (`LANDMARK_INFO.length`, `ALL_ROWS`, Eiken names) may differ if #94 landed first: change them by +1 relative to what is on `main`, do not hardcode from this plan.

### Task 1: Failing node tests

**Files:**
- Modify: `prototype/tests/landmarks.test.mjs`

**Interfaces:**
- Consumes: `LANDMARK_INFO`, `landmarkEntries`, `filterLandmarks`.
- Produces: three tests pinning the Südspange row.

- [ ] **Step 1: Write the failing tests** (append; if #94 already added an `at` test, reuse its fixtures)

```js
test('LANDMARK_INFO has the Südspange row in Eiken at the K295 junction (#125)', () => {
  const item = LANDMARK_INFO.find(x => x.name === 'Südspange Sisslerfeld');
  assert.ok(item);
  assert.equal(item.gemeinde, 'Eiken');
  assert.deepEqual(item.at, [1528, 409]);
  assert.equal(item.jump, undefined);
});

test('landmarkEntries gives the Südspange its fixed point without any world anchor (#125)', () => {
  const e = landmarkEntries(LANDMARK_INFO, {}, []).find(x => x.n === 'Südspange Sisslerfeld');
  assert.deepEqual(e, { n: 'Südspange Sisslerfeld', g: 'Eiken', x: 1528, z: 409 });
});

test('filterLandmarks finds the Südspange by "sudspange", "südspange" and "SISSLERFELD" (#125)', () => {
  const e = landmarkEntries(LANDMARK_INFO, {}, []);
  for (const q of ['sudspange', 'südspange', 'SISSLERFELD']) assert.ok(filterLandmarks(e, q, null).some(x => x.n === 'Südspange Sisslerfeld'), q);
});
```

- [ ] **Step 2: Run, expect FAIL:** `node --test prototype/tests/landmarks.test.mjs`
- [ ] **Step 3: Commit** `test(jump): pin the Südspange row (#125)`

### Task 2: The row and the `at` source

**Files:**
- Modify: `prototype/landmarks.js`
- Modify: `prototype/tests/landmarks.test.mjs` (existing count and Eiken-list assertions, +1)

**Interfaces:**
- Consumes: Task 1 tests.
- Produces: the `LANDMARK_INFO` row; `sourcePos` handles `item.at`.

- [ ] **Step 1:** Run `git log origin/main -- prototype/landmarks.js` and `grep -n "item.at" prototype/landmarks.js`. If `sourcePos` already handles `at` (from #94), skip Step 2.
- [ ] **Step 2:** Add as the first branch of `sourcePos`: `if (item.at) return { x: item.at[0], z: item.at[1] };`
- [ ] **Step 3:** Add after the `LANDI-Turm` row: `{ name: 'Südspange Sisslerfeld', gemeinde: 'Eiken', at: [1528, 409] },   // #125: the K295 junction, the road's start; J snaps to the nearest road (the K295 until #42 builds the Südspange)`
- [ ] **Step 4:** Update the existing assertions that count `LANDMARK_INFO` or list the Eiken names (around `landmarks.test.mjs:69-83`) to include the new row.
- [ ] **Step 5: Run, expect PASS:** `node --test prototype/tests/*.test.mjs`
- [ ] **Step 6: Commit** `feat(jump): Südspange Sisslerfeld in the J list (#125)`

### Task 3: Browser test, count update and CHANGELOG

**Files:**
- Modify: `prototype/tests/test_jump.py`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `open_page`, `rows`, `car` helpers in `test_jump.py`; `window.__mm.jumpList()`.
- Produces: test `test_suedspange_jump_lands_on_a_road_at_the_k295_junction`.

- [ ] **Step 1:** Update `EIKEN_ROWS` and `ALL_ROWS` in `test_jump.py` by +1 (relative to `main`); the row exists in any world because `at` needs no anchor.
- [ ] **Step 2:** Add the test in the style of the neighbouring jump tests: `open_page`, find the row `Südspange Sisslerfeld`, assert `g == "Eiken"`, trigger the jump the way the neighbouring tests do (search "sudspange", Enter), then assert `math.hypot(car.x - 1528, car.z - 409) < 40` and that the car is not inside a building (same check the Hallenbad test uses). Do not assert a Südspange road (that is #42).
- [ ] **Step 3:** Commit and push the branch, then run the one test in the foreground with the cap above; expect PASS. Also run the existing row-count test.
- [ ] **Step 4:** Add under `## [Unreleased]` / `### Added`: `- The **J** list has a new place, the **Südspange Sisslerfeld** in Eiken: it drops the car at the junction with the Laufenburgerstrasse where the new road is planned to start. Type "südspange" to find it.`
- [ ] **Step 5: Commit** `feat(jump): changelog and browser test for the Südspange target (#125)`; open the PR.
