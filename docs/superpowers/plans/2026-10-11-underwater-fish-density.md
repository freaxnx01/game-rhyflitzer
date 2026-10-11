# Underwater fish density Implementation Plan (#216)

**Goal:** Wherever the car drives on the Rhine bed a school of fish is within about 120 m, and the two wrecks have fish around them.

**Architecture:** two pure helpers and two constants in `prototype/underwater.js` (node-tested); `buildUnderwater()` in `prototype/index.html` places schools with them; one hook. Spec: `docs/superpowers/specs/2026-10-11-underwater-fish-density-design.md`.

## Global Constraints

- Buildless; no packages. Locate code by the quoted anchor lines (numbers are from `main` @ `b4d1279`).
- In `prototype/index.html` never put a `//` comment in the middle of a one-line statement; only after the final `;` of the line, or not at all.
- Tests are not loosened: updating `UW`'s expected object and the school count in `test_underwater.py` to the new, intended values is the change.
- Browser test in the foreground, capped, one file: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underwater.py -q -p no:cacheprovider -k "bed_has_boulders"` (hand layout, fast). If `pipeline/.venv` is missing use `python3 -m pytest` (install to a scratch `--target`). Never the full suite.
- If #217's plan was implemented first, `UW` is unchanged by it (it uses a separate export), so there is no conflict in `underwater.test.mjs`'s `UW` assertion.
- CHANGELOG hand-written, player-facing, English; never `git cliff -o`.

---

### Task 1: `shuffled`, `spreadSchools` and the constants (node first)

**Files:** Modify `prototype/underwater.js`, `prototype/tests/underwater.test.mjs`.

- [ ] **Step 1: failing tests.** In `underwater.test.mjs` add `shuffled, spreadSchools` to the import from `'../underwater.js'`, change the `UW` deep-equal test's expected object by replacing `schools: 14` with `schools: 200, schoolSpacing: 120` (keep the key order of `UW`: put `schoolSpacing` right after `schools` in both), and append:

```js
test('shuffled_GivenARnd_IsADeterministicPermutationAndLeavesTheInputAlone', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const a = shuffled(input, seq(0.1, 0.9, 0.5, 0.3, 0.7)), b = shuffled(input, seq(0.1, 0.9, 0.5, 0.3, 0.7));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});

test('spreadSchools_SeedsFirst_NoTwoCloserThanSpacing_EveryPointCovered', () => {
  const pts = []; for (let x = 0; x <= 1000; x += 12) for (let z = 0; z <= 100; z += 12) pts.push([x, z]);
  const seeds = [[500, 50]];
  const got = spreadSchools(shuffled(pts, seq(0.2, 0.8, 0.4, 0.6, 0.1, 0.9, 0.3, 0.7)), 120, 500, seeds);
  assert.deepEqual(got[0], [500, 50]);
  for (let i = 1; i < got.length; i++) for (let j = 1; j < i; j++) assert.ok(Math.hypot(got[i][0] - got[j][0], got[i][1] - got[j][1]) >= 120, 'spacing');
  for (const [x, z] of pts) assert.ok(got.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 120), `covered ${x},${z}`);
});

test('spreadSchools_MoreSeedsThanMax_KeepsOnlyMax', () => {
  assert.equal(spreadSchools([[0, 0]], 10, 2, [[1, 1], [2, 2], [3, 3]]).length, 2);
});
```

`node --test prototype/tests/underwater.test.mjs` → FAIL (no exports).

- [ ] **Step 2: implement** in `prototype/underwater.js`: in `UW` change `schools: 14, sampleStep: 12, shoreClear: 8,   // content: fish schools; ...` to `schools: 200, schoolSpacing: 120, sampleStep: 12, shoreClear: 8,   // content: at most 200 fish schools, at least 120 m apart; ...`, and append at the end of the file:

```js
export function shuffled(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// school centres: the seeds first, then the points (already shuffled) that are at least `spacing` from every centre kept so far, at most `max` in all
export function spreadSchools(points, spacing, max, seeds = []) {
  const kept = seeds.slice(0, max).map(([x, z]) => [x, z]), min2 = spacing * spacing;
  for (const [x, z] of points) {
    if (kept.length >= max) break;
    if (kept.every(([kx, kz]) => (kx - x) ** 2 + (kz - z) ** 2 >= min2)) kept.push([x, z]);
  }
  return kept;
}
```

- [ ] **Step 3:** `node --test prototype/tests/underwater.test.mjs` → PASS. Commit `feat(underwater): spread fish schools by spacing (#216)`.

### Task 2: `buildUnderwater()` uses them

**Files:** Modify `prototype/index.html`.

- [ ] **1. Import.** In the line `import { UW, bedDepth, submerged, underwaterCamY, bedSamples, makeSchool, schoolPose } from './underwater.js';` add `shuffled, spreadSchools` after `bedSamples,`.
- [ ] **2. Move the wreck coordinates up.** Inside `buildUnderwater()` cut these two statements:
  `let [wx, wz] = [(RIVER.pts[9][0] + RIVER.pts[10][0]) / 2, (RIVER.pts[9][1] + RIVER.pts[10][1]) / 2]; if (!inWater(wx, wz) && samples.length) [wx, wz] = samples[0];`
  and `const wdir = Math.atan2(RIVER.pts[10][1] - RIVER.pts[9][1], RIVER.pts[10][0] - RIVER.pts[9][0]);`
  and paste both (same text, in that order, with the same two-space indent) directly above the line starting `  // fish: schools well inside the river`. Nothing else in the wreck code changes (`wood`, `rust`, the boat and car blocks keep using `wx`, `wz`, `wdir`).
- [ ] **3. Replace the school placement.** Replace these two lines

```js
  const deep = samples.filter(([x, z]) => riverDist(x, z) < -30), pool = deep.length >= UW.schools ? deep : samples, every = Math.max(1, Math.floor(pool.length / UW.schools));
  for (let i = 0; i < UW.schools && i * every < pool.length; i++) { const [x, z] = pool[i * every], wl = waterLevelAt(x, z, 1e4), sch = makeSchool(x, z, bedAt(x, z), rnd, i); sch.y = Math.min(sch.y, wl - 1.5); FISH.schools.push(sch); }
```

with

```js
  const deep = samples.filter(([x, z]) => riverDist(x, z) < -30), pool = deep.length >= 3 ? deep : samples, fishRnd = rng(216);
  const seeds = [[wx, wz], [wx + Math.cos(wdir) * 30, wz + Math.sin(wdir) * 30]].filter(([x, z]) => inWater(x, z));
  spreadSchools(shuffled(pool, fishRnd), UW.schoolSpacing, UW.schools, seeds).forEach(([x, z], i) => { const wl = waterLevelAt(x, z, 1e4), sch = makeSchool(x, z, bedAt(x, z), fishRnd, i); sch.y = Math.min(sch.y, wl - 1.5); FISH.schools.push(sch); });
```

- [ ] **4. Hook.** Directly after the line starting `window.__mm.fishPose = (i) =>` add:
`window.__mm.nearestSchool = (x, z) => Math.min(...FISH.schools.map(s => Math.hypot(s.x - x, s.z - z)));`

### Task 3: the one browser test, CHANGELOG, commit

**Files:** Modify `prototype/tests/test_underwater.py`, `CHANGELOG.md`.

- [ ] In `test_bed_has_boulders_weed_fish_and_wrecks_in_the_water` (hand layout) the body becomes:

```python
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        u = underwater(page)
        wreck = bed(page, *u["wreck"])
        near = page.evaluate("([x, z]) => window.__mm.nearestSchool(x, z)", list(u["wreck"]))
        b.close()
    assert u["stones"] > 200 and u["weeds"] > 400, u
    assert u["schools"] >= 3 and 8 * u["schools"] <= u["fish"] <= 14 * u["schools"], u   # the wreck schools plus the spread ones
    assert wreck["water"] is not None and wreck["depth"] > 2, wreck            # the wrecks lie in the deep, not on the bank
    assert near < 1, near                                                      # a school circles the capsized boat (the seed)
```

- [ ] Run the Global Constraints command → PASS; then `node --test prototype/tests/` → PASS.
- [ ] `CHANGELOG.md` `## [Unreleased]` / `### Added`: `- There are many more fish in the Rhine now: a school every 120 metres or so along the river bed instead of 14 for the whole river, and one circles the capsized rowing boat and another the rusty car.`
- [ ] Commit `fix(underwater): fish you can actually meet (#216)`, push, PR closing #216.
