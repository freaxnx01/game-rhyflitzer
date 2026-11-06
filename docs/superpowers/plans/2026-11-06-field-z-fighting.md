# Field z-fighting (#688) Implementation Plan

**Goal:** no meadow flickering through the farm fields from helicopter height, with roads and the Crash-Platz still on top.
Spec: `docs/superpowers/specs/2026-11-06-field-z-fighting-design.md`.

**Architecture:** one pure table `SURFACE_DEPTH_OFFSET` in `world.js` plus `depthOffsetFor(role)`; `applyStyle` (`index.html:2946`)
sets it on every role material it hands out, so both style profiles get it; `yardGround` moves from −2 to −3.

**Global constraints**
- No lift changes (`FIELD_LIFT`, road `0.04`, yard `0.04` stay).
- Never weaken an existing test. Run `node --test tests/*.test.mjs`, then only this plan's Playwright file, in the foreground.
  Commit and push before the Playwright run.

**Files**
- Modify: `world.js`, `index.html`, `CHANGELOG.md`, `tests/world.test.mjs` (or the node test file that already imports
  `FIELD_KINDS`; add one if none does)
- Create: `tests/test_field_depth.py`

---

### Task 1 - The depth-offset table (TDD)

**Interfaces**
```js
export const SURFACE_DEPTH_OFFSET;   // { field: -1, meadow: -1, road: -2, roadOsm: -2, roadPlain: -2, motorway: -2, gravel: -2 }
export function depthOffsetFor(role); // -> number | null (null: no polygon offset)
```

- [ ] **Step 1: Write the failing test** (in the node test file that imports from `../world.js`)

```js
import { SURFACE_DEPTH_OFFSET, depthOffsetFor } from '../world.js';

test('depthOffsetFor_surfaceRoles_fieldsOverTerrainRoadsOverFields', () => {
  assert.equal(depthOffsetFor('grass'), null);
  assert.ok(depthOffsetFor('field') < 0 && depthOffsetFor('meadow') === depthOffsetFor('field'));
  for (const r of ['road', 'roadOsm', 'roadPlain', 'motorway', 'gravel']) assert.ok(depthOffsetFor(r) < depthOffsetFor('field'), r);
  assert.equal(depthOffsetFor('wall'), null);
});

test('SURFACE_DEPTH_OFFSET_isFrozen', () => { assert.ok(Object.isFrozen(SURFACE_DEPTH_OFFSET)); });
```

- [ ] **Step 2: Run** `node --test tests/*.test.mjs` - fails (no export).
- [ ] **Step 3: Implement** in `world.js`, next to `FIELD_KINDS`:

```js
// #688: the ground layers are a few cm apart (fields 0.02 m, roads 0.04 m over the terrain); from the helicopter the depth
// buffer cannot resolve that and the terrain flickers through. A polygon offset per role keeps the order at any range:
// terrain, then fields and meadows, then roads (more negative = drawn nearer). The Crash-Platz slab uses -3 (yardGround).
export const SURFACE_DEPTH_OFFSET = Object.freeze({ field: -1, meadow: -1, road: -2, roadOsm: -2, roadPlain: -2, motorway: -2, gravel: -2 });
export function depthOffsetFor(role) { return SURFACE_DEPTH_OFFSET[role] ?? null; }
```

- [ ] **Step 4: Run** `node --test tests/*.test.mjs` - passes. Commit and push `fix(fields): depth offset per ground layer (#688)`; open the draft PR.

### Task 2 - Apply it (`index.html`)

- [ ] **Step 1:** import `depthOffsetFor` with the other `./world.js` imports (`index.html:681`).
- [ ] **Step 2:** in `applyStyle` (`index.html:2946`), after `MESH[role].material = St.mat(role);`, set the offset:

```js
const off = depthOffsetFor(role); if (off !== null) { const m = MESH[role].material; m.polygonOffset = true; m.polygonOffsetFactor = off; m.polygonOffsetUnits = off; }
```

  If role meshes get their first material somewhere other than `applyStyle`, apply the same lines there too (or route that
  through `applyStyle`), so the offset is set from the first frame and after every T.
- [ ] **Step 3:** `yardGround` (`index.html:1946`): `polygonOffsetFactor: -3, polygonOffsetUnits: -3`, and add
  `polygonOffset: -3` to its `window.__mm.counts.yardGround` entry.
- [ ] **Step 4:** add a test hook next to `window.__mm.rayHits` (`index.html:4279`):
  `window.__mm.depthOffsets = () => Object.fromEntries(Object.entries(MESH).map(([r, m]) => [r, m.material.polygonOffset ? m.material.polygonOffsetFactor : null]));`
- [ ] **Step 5:** `node --test tests/*.test.mjs`; commit and push `fix(fields): fields and roads keep their order from the helicopter (#688)`.

### Task 3 - Playwright `tests/test_field_depth.py`

Set up like the other world tests (`server` fixture, `needs_world`, launch args), with the measured terrain.

- [ ] **Step 1:** tests:
  - `test_ground_layers_have_their_depth_offsets`: `depthOffsets()` gives `field`/`meadow` −1, every road role present −2,
    `grass` `null`; after pressing <kbd>T</kbd> (style switch) the same; `counts.yardGround.polygonOffset` is −3.
  - `test_no_meadow_through_the_cereal_field_from_the_helicopter`: `place(137, -848, 0)`, press `f`, three times
    `flySim(8, ['Space'])` (about 400 m up); then sample the colour of the rendered frame at the screen positions of a grid of
    points inside the cereal field ring around (737, −848) (`data/world_hochrhein.json`, `fields`, kind `cereal`, the ring that
    contains that point; keep points at least 15 m inside the ring and away from roads and trees). Project with the camera (add
    a `window.__mm.project(x, y, z)` hook that returns screen pixels if none exists; read pixels with `page.screenshot` and
    Pillow, or `gl.readPixels` with `preserveDrawingBuffer` only in the test). Assert fewer than 1 % of the samples are
    meadow-coloured (green channel more than 8 above red). As shipped this sample shows the splinters; with the fix it is clean.
- [ ] **Step 2:** commit and push, then run `pytest tests/test_field_depth.py -x` in the foreground. Attach the before/after
  crop of the repro view to the PR description.

### Task 4 - Changelog

- [ ] Under `[Unreleased]` → `### Fixed`, newest first (`TZ=Europe/Zurich date '+%F %H:%M'`):
  `` - `<time>` From the **helicopter** the meadow no longer **flickers through the fields**; roads still lie on top of them. ``
- [ ] Commit and push `docs(changelog): no field flicker from the helicopter (#688)`.
