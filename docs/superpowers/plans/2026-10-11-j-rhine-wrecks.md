# J entry at the Rhine wrecks Implementation Plan (#215)

**Goal:** J has a normal entry `Rhein-Wracks` that drops the car on the Rhine bed next to the capsized rowing boat, facing the rusty car; R returns to a road.

**Architecture:** `landmarks.js` entry + `wreck` pass-through (node-tested); `index.html` `jumpToWreck`, a `pickJump` branch, a `destEntries` filter; one Playwright test in `test_jump.py`. Spec: `docs/superpowers/specs/2026-10-11-j-rhine-wrecks-design.md`.

## Global Constraints

- Buildless; no packages. Locate code by the quoted anchor lines (line numbers are from `main` @ `b4d1279`).
- In `prototype/index.html` never put a `//` comment in the middle of a one-line statement; only after the final `;` of the line, or not at all.
- Changing the `LANDMARK_INFO` length or row lists in existing tests to match the new entry is the intended update, not a loosening; change nothing else in them.
- Browser test in the foreground, capped, one file only: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_jump.py -q -p no:cacheprovider -k "wrack"`. If `pipeline/.venv` is missing use `python3 -m pytest` (install pytest/playwright to a scratch `--target`, never the repo or system). Do not run the whole Playwright suite (about 2 h).
- CHANGELOG hand-written, player-facing, English; never `git cliff -o`.

---

### Task 1: the landmark entry and the `wreck` pass-through

**Files:** Modify `prototype/landmarks.js`, `prototype/tests/landmarks.test.mjs`.

- [ ] **Step 1: failing tests.** Append to `prototype/tests/landmarks.test.mjs`:

```js
test('landmarkEntries passes the wreck flag through (#215)', () => {
  const info = [{ name: 'Wracks', gemeinde: 'Bad Säckingen', at: [1, 2], wreck: true }];
  assert.deepEqual(landmarkEntries(info, {}, []), [{ n: 'Wracks', g: 'Bad Säckingen', x: 1, z: 2, wreck: true }]);
});

test('LANDMARK_INFO lists the Rhine wrecks under Bad Säckingen (#215)', () => {
  const w = LANDMARK_INFO.find(l => l.wreck);
  assert.equal(w.name, 'Rhein-Wracks');
  assert.equal(w.gemeinde, 'Bad Säckingen');
  assert.equal(w.at.length, 2);
});
```

`node --test prototype/tests/landmarks.test.mjs` → the two new tests FAIL.

- [ ] **Step 2: implement.** In `prototype/landmarks.js`:
  - after the line starting `  { name: 'Bergsee', gemeinde: 'Bad Säckingen', at: [-2349, -2207], jump:` insert
    `  { name: 'Rhein-Wracks', gemeinde: 'Bad Säckingen', at: [-1088.4, -406.4], wreck: true },   // #215: the capsized rowing boat and the rusty car on the Rhine bed (#101); J puts the car on the bed beside them (index.html jumpToWreck, position from the built wrecks); at is only the list position`
  - in `landmarkEntries` replace `...(item.ramp ? { ramp: true } : {}), i });` with `...(item.ramp ? { ramp: true } : {}), ...(item.wreck ? { wreck: true } : {}), i });`
- [ ] **Step 3:** run `node --test prototype/tests/landmarks.test.mjs`. Existing tests that count entries now fail because of the intended new entry: update `assert.equal(LANDMARK_INFO.length, 28)` to `29`, and in every expected list that contains `'Bergsee'` followed by `'Reservoir Hübel'` (e.g. the `landmarkEntries(LANDMARK_INFO, { dsmChimney: ... }, [])` expectation) insert `'Rhein-Wracks'` between them; fix the title text of the count test to mention #215. Re-run until PASS.
- [ ] Commit: `feat(jump): Rhein-Wracks entry in the J list data (#215)`.

### Task 2: `jumpToWreck` in index.html

**Files:** Modify `prototype/index.html` (3 places).

- [ ] **1. Add the function.** Directly after the line starting `function jumpToRamp(name) {` add these two lines:

```js
const WRECK_RUNUP = 8;
function jumpToWreck(name) { const c = UWS.counts; if (!c || !c.wreck) return; const [bx, bz] = c.wreck, th = Math.atan2(c.wreckCar[1] - bz, c.wreckCar[0] - bx), px = bx - Math.cos(th) * WRECK_RUNUP, pz = bz - Math.sin(th) * WRECK_RUNUP, wet = waterLevelAt(px, pz, 1e4) !== null, x = wet ? px : bx, z = wet ? pz : bz, road = nearestJumpable(bx, bz); if (!road) return; placeOnRoad(road.x, road.z, road.th, name); P.x = x; P.z = z; P.th = th; P.y = groundH(x, z, -Infinity); restShadow(); camPos.set(x - Math.cos(th) * 12, P.y + 3, z - Math.sin(th) * 12); }
```

(`placeOnRoad` sets `P.safe` to the road beside the wreck and closes the dialog; the next lines then move the car onto the bed. `camPos` is a `const` declared further down the file; that is fine because the function runs later.)

- [ ] **2. Route it.** In `function pickJump(i) {` replace `else if (r.ramp) jumpToRamp(r.n); else jumpTo(r); }` with `else if (r.ramp) jumpToRamp(r.n); else if (r.wreck) jumpToWreck(r.n); else jumpTo(r); }`.
- [ ] **3. Keep it out of Drive/Navi.** Replace `function destEntries() { return [...JUMP_ENTRIES, ...AUTOP.streets]; }` with `function destEntries() { return [...JUMP_ENTRIES.filter(e => !e.wreck), ...AUTOP.streets]; }`.

### Task 3: the one browser test, the row count, CHANGELOG

**Files:** Modify `prototype/tests/test_jump.py`, `CHANGELOG.md`.

- [ ] In `test_jump.py` change the `ALL_ROWS` line: `... + 3   # landmarks shown + Random spot; the Südspange (#125), the Bergsee (#94) and the Reservoir Hübel (#102) are fixed points, listed in any world` to `+ 4` and add `, the Rhein-Wracks (#215)` to the comment's list. Then `grep -n "Bad Säckingen" prototype/tests/test_jump.py` and fix any other expectation that enumerates the Bad Säckingen rows (add `Rhein-Wracks` after `Bergsee`).
- [ ] Add, next to the Bergsee test, this test (it fails before Task 2):

```python
@needs_world
def test_rhein_wracks_jump_puts_the_car_on_the_bed_by_the_wrecks(server):
    """#215: J -> 'wrack' drops the car on the Rhine bed 8 m upstream of the capsized boat; R brings it back to a road."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "wrack")
        u = page.evaluate("() => window.__mm.underwater()")
        page.keyboard.press("KeyR")
        page.wait_for_function("() => window.__mm.car().water === null", timeout=60000)
        back = car(page)
        b.close()
    bx, bz = u["wreck"]
    assert math.hypot(c["x"] - bx, c["z"] - bz) < 12, c
    assert c["water"] is not None and c["submerged"] is True, c       # on the bed, under the surface
    assert back["splash"] == 0 and back["submerged"] is False, back    # R: out of the water, on a road
```

- [ ] Run the foreground command from Global Constraints (`-k "wrack"`), then `node --test prototype/tests/` → PASS. Then run once `-k "j_opens or bergsee"` in the same file to prove the row-count and neighbour tests still pass.
- [ ] `CHANGELOG.md`, `## [Unreleased]` / `### Added`: `- The **J** list has a new place, the **Rhein-Wracks** below Bad Säckingen: it drops the car on the bed of the Rhine a few metres from the capsized rowing boat, with the rusty car further down the river. Type "wrack" to find it; **R** puts you back on the road.`
- [ ] Commit `feat(jump): J spot at the sunken rowing boat and the rusty car (#215)`, push the branch, PR closing #215.
