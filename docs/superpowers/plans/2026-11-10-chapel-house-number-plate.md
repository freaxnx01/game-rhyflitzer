# No house-number plate on replaced buildings (#823) — Implementation Plan

**Goal:** buildings that a swissBUILDINGS3D model replaces (Fridolinskapelle, Kirche Bruder Klaus) show no house-number
plate, because the plate sits on the OSM footprint and floats in front of the model (measured: 4.39 m in front of the
chapel's nave wall, 0.48 m in front of Bruder Klaus).

**Architecture:** one pure helper `plateBuildings(buildings, replaced)` in `chlandmarks.js`; `index.html` passes
`plateBuildings(L.buildings, CH_LM_BY_OSM)` instead of `L.buildings` to `addrLabels`. `addrLabels` itself is unchanged.

**Global constraints:** buildless; no new packages; no changes to `world.js`, the GLB loader or `index.json`. Tests are
`node --test`. Only the files below.

## Files

- Modify `chlandmarks.js`: add `plateBuildings`.
- Modify `tests/chlandmarks.test.mjs`: tests for it.
- Modify `index.html` (~line 788 import, ~line 2638 plate loop).
- Modify `CHANGELOG.md`: entry under `[Unreleased]` → `### Fixed`.

## Task 1: `plateBuildings` helper (TDD)

**Interface:** `plateBuildings(buildings, replaced) → buildings[]`. `replaced` is anything with `.has(id)` (the
`CH_LM_BY_OSM` Map, or a Set). Returns the buildings whose `id` is not in `replaced`, in their original order. A
missing `replaced` returns `buildings` unchanged.

- [ ] **Step 1: Write the failing tests** — append to `tests/chlandmarks.test.mjs` and add `plateBuildings` to its
  import from `../chlandmarks.js`:

```js
test('plateBuildings_replacedBuilding_isDropped', () => {
  const B = [{ id: 1, addr: '1' }, { id: 171822707, addr: '6.1' }, { id: 3, addr: '3' }];
  const replaced = new Map([[171822707, { id: 'fridolinskapelle-sisseln' }]]);
  assert.deepEqual(plateBuildings(B, replaced).map(b => b.id), [1, 3]);
});

test('plateBuildings_nothingReplaced_keepsEveryBuildingInOrder', () => {
  const B = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(plateBuildings(B, new Map()), B);
  assert.deepEqual(plateBuildings(B, undefined), B);
});

test('plateBuildings_realHochrhein_dropsOnlyThePlacedLandmarks', async () => {
  const fs = await import('node:fs');
  const world = JSON.parse(fs.readFileSync(new URL('../data/world_hochrhein.json', import.meta.url)));
  const index = JSON.parse(fs.readFileSync(new URL('../assets/landmarks/index.json', import.meta.url)));
  const placed = chLandmarksFor(index, 'hochrhein', world.origin, 284);
  const byOsm = new Map(placed.filter(c => c.osm != null).map(c => [c.osm, c]));
  const kept = plateBuildings(world.buildings, byOsm);
  assert.ok(!kept.some(b => b.id === 171822707), 'Fridolinskapelle has no plate');
  assert.ok(!kept.some(b => b.id === 407386050), 'Kirche Bruder Klaus has no plate');
  assert.equal(kept.length, world.buildings.length - byOsm.size, 'every other building stays');
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/chlandmarks.test.mjs` → `plateBuildings` is not exported.

- [ ] **Step 3: Implement** — in `chlandmarks.js`, after `chLandmarksFor`:

```js
// #823: a building a landmark replaces gets no house-number plate: the plate goes on the OSM ring (addrLabels), and the
// model's walls do not follow it (the chapel's plate stood 4.4 m in front of the nave)
export function plateBuildings(buildings, replaced) {
  if (!replaced) return buildings;
  return buildings.filter(b => !replaced.has(b.id));
}
```

- [ ] **Step 4: Run, expect PASS** — `node --test tests/chlandmarks.test.mjs`.

- [ ] **Step 5: Commit** — `fix(world): no house-number plate on buildings a landmark model replaces` (body: `Refs #823`).

## Task 2: wire it into `index.html`

- [ ] **Step 1:** extend the import at ~line 788:

```js
import { chLandmarksFor, roofOrWall, plateBuildings } from './chlandmarks.js';   // #649: swissBUILDINGS3D landmarks
```

- [ ] **Step 2:** in the plate loop at ~line 2638, replace `addrLabels(L.buildings, L.anchors.landmarks, nearestRoadPoint)`
  with `addrLabels(plateBuildings(L.buildings, CH_LM_BY_OSM), L.anchors.landmarks, nearestRoadPoint)`. Nothing else on
  that line changes. `CH_LM_BY_OSM` is filled at ~line 2546, before this line runs; check that with
  `grep -n "CH_LM_BY_OSM" index.html` (the assignment's line number must be lower than the plate loop's).

- [ ] **Step 3:** extend the comment above `const LABELS` (~line 2631) with: `#823: none on a building a
  swissBUILDINGS3D model replaces (plateBuildings)`.

- [ ] **Step 4: Verify** — `node --test tests/` (full suite) passes, and `grep -c "plateBuildings" index.html` prints 2.

- [ ] **Step 5: Commit** — `fix(world): hide the plate at the Fridolinskapelle and Kirche Bruder Klaus` (`Refs #823`).

## Task 3: CHANGELOG

- [ ] **Step 1:** under `## [Unreleased]` → the first `### Fixed`, add at the top (time = when it goes live, Swiss time):

```markdown
- `YYYY-MM-DD HH:MM` The **house number** no longer floats in the air in front of the **Fridolinskapelle** in Sisseln: the churches drawn from the real 3D models (the chapel and the Catholic church in Stein) carry no number plate any more.
```

- [ ] **Step 2: Commit** — `docs(changelog): note the chapel house-number fix` (`Closes #823`).

## Verification (optional, one browser check if the runner has one)

Not required for merge: the node tests pin the rule on the real data. If a Playwright check is run, use one targeted
test, not the full suite: load the hochrhein world, put the car next to the chapel (world x 1744, z -425) and check
that no house-number plate is shown there, while a plate still shows at an ordinary numbered house nearby.
