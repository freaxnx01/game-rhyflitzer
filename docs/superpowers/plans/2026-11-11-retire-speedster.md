# Retire the Sissle Speedster — Implementation Plan (#830)

**Goal:** the hatchback is the start car; the compact (Sissle Speedster) is no longer offered in the car selection,
gallery or depot, but stays in `VEHICLES` as the glTF stand-in and load-failure fallback.

**Architecture:** one pure rule `selectableIds(ids)` in `carselect.js` filters the stand-in ids; `index.html` reads
`vehicleIds()` wherever it offers or counts vehicles. `DEFAULT_CHOICE` points at the hatchback. Spec:
`docs/superpowers/specs/2026-11-11-retire-speedster-design.md`.

**Global constraints:** buildless, no new files except tests; node unit tests via `node --test tests/<file>.test.mjs`;
Playwright: run only the files listed in Task 4, in the foreground, under
`systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Line numbers are from `8c37dda`; grep, don't trust them.

---

### Task 1: `selectableIds` and the new default (carselect.js)

**Files:** `carselect.js`, `tests/carselect.test.mjs`, `tests/hatchback.test.mjs`

- [ ] **Step 1: Write the failing tests** (append to `tests/carselect.test.mjs`, add `selectableIds, STAND_IN_IDS` to its import):

```js
test('selectableIds: the stand-in compact is never offered, order and other ids kept (#830)', () => {
  assert.deepEqual(STAND_IN_IDS, ['compact']);
  assert.deepEqual(selectableIds(['compact', 'hatchback', 'delorean', 'slow']), ['hatchback', 'delorean', 'slow']);
  assert.deepEqual(selectableIds([]), []);
});

test('initialChoice: a stored or queried compact becomes the hatchback, its paint kept (#830)', () => {
  const ids = selectableIds(['compact', 'hatchback', 'bus']);
  assert.deepEqual(initialChoice('{"id":"compact","paint":"ice","paintChosen":true}', '', ids, PAINT_IDS), { id: 'hatchback', paint: 'ice', paintChosen: true });
  assert.deepEqual(initialChoice('{"id":"bus","paint":"ice"}', '?vehicle=compact', ids, PAINT_IDS), { id: 'bus', paint: 'ice' });
  assert.deepEqual(initialChoice(null, '?vehicle=compact', ids, PAINT_IDS), { id: 'hatchback', paint: 'navy' });
});
```

- [ ] **Step 2: Update the default-car asserts (kind C):** `carselect.test.mjs:21` → `{ id: 'hatchback', paint: 'navy' }`;
  `carselect.test.mjs:67` and `hatchback.test.mjs:43` (unknown id falls back) → `id: 'hatchback'`;
  `hatchback.test.mjs:44` → `'hatchback'`. Leave every other `'compact'` literal (kind B).
- [ ] **Step 3: Run** `node --test tests/carselect.test.mjs tests/hatchback.test.mjs` → FAIL.
- [ ] **Step 4: Implement** in `carselect.js`:

```js
export const DEFAULT_CHOICE = { id: 'hatchback', paint: 'navy' };   // #830: the hatchback is the start car; navy stays the automatic factory paint

// #830: built as the stand-in while a glTF car loads and as its load-failure fallback, never offered to the player
export const STAND_IN_IDS = ['compact'];
export const selectableIds = (ids) => ids.filter(id => !STAND_IN_IDS.includes(id));
```

- [ ] **Step 5: Run** the two files → PASS. **Commit** `feat(vehicles): selectable ids without the stand-in, hatchback default (#830)`.

### Task 2: Wire `vehicleIds()` into the game (index.html)

**Files:** `index.html`, `tests/depot.test.mjs`, `tests/analytics.test.mjs`

- [ ] **Step 1: Write the failing unit tests:**

```js
// tests/depot.test.mjs
test('depotLayout over selectable ids leaves the stand-in out (#830)', () => {
  const defs = { compact: car('everyday', 1.3), hatchback: car('everyday', 1.25), mini: car('screen', 1.0) };
  const ids = selectableIds(Object.keys(defs));
  assert.deepEqual(depotLayout(ids, defs).map(s => s.id).sort(), ['hatchback', 'mini']);
});
// tests/analytics.test.mjs
test('vehicleSource: ?vehicle=compact is not a query once compact is not selectable (#830)', () => {
  assert.equal(vehicleSource('?vehicle=compact', null, ['hatchback', 'mini']), 'default');
  assert.equal(vehicleSource('?vehicle=compact', '{"id":"compact"}', ['hatchback', 'mini']), 'stored');
});
```
(import `selectableIds` from `../carselect.js`; reuse the file's existing `car` helper.)
  These pass on the pure modules already; they pin the contract `index.html` relies on.

- [ ] **Step 2: Implement** in `index.html`:
  1. Import `selectableIds` in the `./carselect.js` import (line ~848).
  2. Below the `VEHICLES` literal (after `let VEH = …`, ~3003):
     `function vehicleIds() { return selectableIds(Object.keys(VEHICLES)); }   // #830: what the player can pick; the compact only stands in`
  3. Replace `Object.keys(VEHICLES)` with `vehicleIds()` in: `initialChoice(...)` (~3292), `stepVehicle` (~5639),
     `renderCarSel` (~5642), `stepGallery` (~5690), `galleryIds` (~5693), `__mm.carsel` (~5706),
     `depotLayout(...)` (~5773), `vehicleSource(...)` in `umamiTrack('game-ready', …)` (~6520).
     Leave `loadGalleryModels` (5701), `__mm.carGallery().types` (5705) and every `VEHICLES[...]` lookup alone.
  4. Move the `hatchback: HATCHBACK, …` line (~2956) to directly after the `compact: { … }` entry.
  5. Header comment (~2930): `compact = the original car` → `compact = the stand-in while a glTF car loads (#830, no longer selectable)`.
- [ ] **Step 3: Run** `node --test tests/depot.test.mjs tests/analytics.test.mjs` → PASS.
- [ ] **Step 4: Commit** `feat(vehicles): the Speedster leaves selection, gallery and depot (#830)`.

### Task 3: Player-facing text

**Files:** `strings.js`, `CHANGELOG.md`

- [ ] **Step 1:** `vehicleLoadFailed` EN → ``(name) => `The ${name} could not be loaded — driving a stand-in car instead.` ``;
  DE → ``(name) => `${name} konnte nicht geladen werden — es fährt ein Ersatzauto.` ``.
- [ ] **Step 2:** `veh_hatchback_desc` EN → `'A proper little family car, red from the factory. Revs high, grips hard and sounds like it means it.'`;
  DE → `'Ein richtiger kleiner Familienwagen, ab Werk rot. Dreht hoch, haftet gut und klingt, als meine er es ernst.'`
  Keep `veh_compact_*`. Run `node --test tests/` for any strings test that pins these texts and update it.
- [ ] **Step 3:** CHANGELOG, `## [Unreleased]` → `### Changed` (create the heading if absent), newest first,
  timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:
  `` - `<ts>` The **Mazda hatchback** is now the **start car**. The **Sissle Speedster** has retired: it is gone from **Choose car**, the gallery and the vehicle depot. A saved Speedster choice drives the hatchback. ``
- [ ] **Step 4: Commit** `feat(vehicles): texts and changelog for the retired Speedster (#830)`.

### Task 4: Move the browser tests

Classify each file that names `compact` by this rule (full table in the spec):

| Kind | Action |
|---|---|
| A: a modified copy of `__mm.vehicles().compact` activated via `setVehicle`/`registerVehicle` | keep |
| B: literal `'compact'` in pure unit tests (fallback ids, reference numbers) | keep |
| C: asserts the compact is the default / start / selectable car | change to the hatchback and the new counts |
| D: relies on the default car's numbers without naming it | pin: `page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().compact)")` right after boot |
| E: pins the stand-in or the load-failure fallback | keep |

- [ ] **Step 1 (kind C):**
  - `tests/test_carselect.py`: counts `21` → `20` (`Car 1 of 20`, `Garage · 20 vehicles`, `Auto 1 von 20`, `Garage · 20 Fahrzeuge`),
    a registered test car `Car 21 of 21` with `["false"] * 20 + ["true"]` tiles; start id `compact` → `hatchback`
    (wait for `gltfState` ready where the test reads `bodyColor`/`top` of the start car, or pin with kind D where it
    tests the procedural car's numbers, e.g. `top == 60`); cycling wraps to `hatchback`; `Car 2 of 21`/DeLorean → `Car 2 of 20`;
    the garage click on `data-id="compact"` → another selectable id; the armchair loop drops `compact`.
  - `tests/test_car_gallery.py`: pressed tile and stage id `compact` → `hatchback`; `SPREAD_JS` id `compact` → `hatchback`.
  - `tests/test_depot.py`: the driven id `compact` → `hatchback`, the driven slot is the hatchback's; line 96's colour
    follows the new default; any 21-vehicle count → 20.
  - `tests/test_analytics.py:49–57`: `?vehicle=compact` → `?vehicle=delorean`, `previous == "delorean"`.
  - `tests/test_vehicles.py:337–346`: an unknown `?vehicle=` now starts the hatchback (its stand-in is `compact` until loaded).
- [ ] **Step 2 (kind D):** add the pin to `tests/test_vehicles.py` (`GOLDEN` runs, true-to-size, gear test),
  `tests/test_shadow.py` (`test_shadow_is_sized_from_the_car`, the DeLorean comparison's compact half),
  `tests/test_underwater.py`, `tests/test_building_collision.py`, `tests/test_lights.py`. Where a file's own
  `open_hand` boots the car, put the pin in that helper.
- [ ] **Step 3: Run** these files only, one at a time, in the foreground:
  `test_carselect.py test_car_gallery.py test_depot.py test_analytics.py test_vehicles.py test_shadow.py test_hatchback.py
  test_underwater.py test_building_collision.py test_lights.py`. A file that fails because the start car changed
  (numbers or `id == 'compact'` without naming it) gets the kind C or D treatment; never change an expected number
  to the hatchback's without pinning.
- [ ] **Step 4:** `node --test tests/` → all PASS.
- [ ] **Step 5: Commit** `test(vehicles): the hatchback is the start car, the compact only stands in (#830)`.
  The PR's CI runs the full suite; fix any further kind C/D file it reports the same way.

### Manual check

- [ ] Fresh profile: the start screen shows the stand-in at once, the red hatchback swaps in, Race enables; console clean.
- [ ] `localStorage['mm.car'] = '{"id":"compact","paint":"ice","paintChosen":true}'` → an ice-blue hatchback.
- [ ] Choose car: "Car 1 of 20", no Speedster in ‹ ›, the gallery or the garage; depot has 20 cars.
