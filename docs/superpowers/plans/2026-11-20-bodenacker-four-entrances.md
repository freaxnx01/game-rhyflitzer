# Bodenackerstrasse 6: four enterable entrances — plan (#1099)

**Goal:** 6a, 6b, 6c and 6d each get the stair hall + lift + roof door 6c has today; one shared roof deck; the
player sees one place "Bodenackerstrasse 6". Spec: `docs/superpowers/specs/2026-11-20-bodenacker-four-entrances-design.md`.

**Architecture:** `stairhall.js` is already per entrance (it takes `entrance`, `porch`, `floors`, `eg`). The work is in
`index.html`: the single `INT` state becomes per-house records plus an active one, and the hall build runs per house.

## Global constraints

- Buildless, no new dependencies. Pure logic in modules with node tests; `index.html` glue tested by Playwright.
- `$` is a late `const` in index.html: never call `$()` at module top level above it — use `document.getElementById`.
- All walkway sets (four halls incl. cabin slabs, the roof deck) must exist **before** the `WALKS` merge (~line 5232).
- At most one interior group built at a time. Keep today's thresholds (build < 40 m, dispose > 55 m).
- Visible text never shows a house letter: the floor display stays `hudFloorText('6', …)`.
- Run targeted tests only: `node --test tests/*.test.mjs` and the Playwright files named below, in the foreground.
- Commit and push after every task.

## Task 1 — one roof deck for the block (stairhall.js)

**Files:** `stairhall.js`, `tests/stairhall.test.mjs`
**Interface:** `export function blockRoof(halls, bodyWorld)` → a walk set `{ slabs, ramps: [], walls, ceilings: [] }`
with ONE slab `{ poly: bodyWorld, holes: halls.map(h => h.roofHole), y: roof }` and the edge rails (tag `'edge'`) once.
`roof` = `halls[0].levels.at(-1)`. Remove `hallRoofSlab` (and its import/use) once Task 3 uses `blockRoof`.

- [ ] Write the failing test: two halls (ENTRANCE and ENTRANCE shifted 12 m along the body) under one 60×16 m body:
  the deck is walkable between them, both tower holes are not roof, `walls.filter(w => w.tag === 'edge').length === 4`,
  `walkwayPush` stops at the edge. Port the existing `hallRoofSlab_…` test to `blockRoof([h], body)`.
- [ ] Implement; run `node --test tests/stairhall.test.mjs`. Commit.

## Task 2 — terrain pads and façade for all four porches (index.html)

**Files:** `index.html` (`hallTerrainPads` ~1673, `bodenackerBuilding` ~2113)
- [ ] `hallTerrainPads()`: loop over `BODENACKER6.houses`, concatenate the pads of every porch (same `terrainPads`
  call 6c uses). `padBounds`/`padFloorAt` take the combined list.
- [ ] Façade: chain `bodenackerDoorway` over the four porches (each call takes the previous call's `walls`; one
  lintel per porch → one `wallQuads` per lintel).
- [ ] Drop the merged housing boxes loop (`if (s.house === '6c') continue; … box(…)`): every tower gets its own
  housing in Task 3. Drop the `p.house !== '6c'` skip of the default door box (~2092) so no porch gets the dummy door.
- [ ] `tests/test_bodenacker6.py` (~line 88): the housing check holds for every stair; loop it over `stairs`.

## Task 3 — per-house records (index.html)

**Files:** `index.html` (INT ~2618, hall build ~2141-2150, housing meshes ~3321, enterables ~4923-4926)
- [ ] `INT.halls = []`; in `bodenackerBuilding`, for each house: `stairHall(entrance, {w,d}, L.floors, base)`,
  `createTowerLift(levels)`, cabin slab pushed into that hall's `walk.slabs`, `housingGeo`. Record:
  `{ house, hall, lift, cabin, door: { open: 0, target: 0 }, housingGeo, roofDoorOpen: false, roofDoorAmt: 0 }`.
  Then `INT.roofWalk = blockRoof(INT.halls.map(r => r.hall), bodyWorld)`.
- [ ] `INT.cur` = the 6c record at load; `INT.hall`, `INT.lift`, `INT.cabin`, `INT.door`, `INT.roofDoor*` become
  getters (or are reassigned in one `setCurrent(rec)`) pointing at `INT.cur`, so lift pad, `LIFT_RIDE`, `liftPadKey`
  and `footSolids` keep working.
- [ ] Housing meshes (~3321): one housing, panel, door leaf and door plug per record (same material role
  `plasterWhite`, so `applyStyle` restyles all).
- [ ] `WALKS` merge (~5232): every record's `hall.walk` plus `INT.roofWalk`.
- [ ] Enterables (~4923): `e.entrances = INT.halls.map(r => ({ ...porchOf(r.house).entrance, house: r.house }))`.
  `ENTER_HANDLERS['bodenackerstrasse-6c'] = (entry, entrance) => { recOf(entrance.house).door.target = 1; }`.
- [ ] Node test (`tests/enterables.test.mjs`): an entry with four entrances — `nearestEntrance` returns the one at the
  walker and keeps its `house` field. Commit.

## Task 4 — the active house (index.html)

**Files:** `index.html` (`updateInterior` ~5494, `stepInterior` ~5519, `buildInterior` ~5583, `disposeInterior`
~5654, `leaveBuilding` ~5262, `footFloorAt` ~5492, activity stats ~8506)
- [ ] `updateInterior()`: pick `INT.cur` = the record whose `hallArea` ≠ `'out'` (or whose roof door / tower the walker
  is at on the roof), else the record with the nearest entrance. Switching records while an interior is built disposes
  it first; `buildInterior()` builds for `INT.cur` only.
- [ ] Every door eases every frame (all four can be open), but lift step and cabin only for `INT.cur`.
- [ ] `bodyOff`: true when the walker is in any record's porch/tower (`bodyColliderOff` per record, OR-ed).
- [ ] `leaveBuilding`, `footFloorAt`, mapfloor, `activityOf` use `INT.cur`.
- [ ] Interior materials belong to the built group and are disposed with it (only one group exists).

## Task 5 — debug hooks and the Playwright test

**Files:** `index.html` (~5823-5835), new `tests/test_enter_bodenacker_all.py`
- [ ] `__mm.interior(house)`, `__mm.interiorSim(…, house)`, `__mm.interiorCount(house)`: optional house; default
  `INT.cur`. Add `__mm.interiorHouse()` → `INT.cur.house`.
- [ ] Write `tests/test_enter_bodenacker_all.py` (reuse `open_world`, `key`, `foot_sim` patterns of
  `tests/test_enter_6c.py`): for each of `6a`, `6b`, `6d`: place the walker 1.5 m in front of that porch's entrance,
  facing it; <kbd>E</kbd> opens that door (`interior(house).door > 0.9`); walk in with `foot_sim(2.5, ['KeyW'])`;
  assert `interiorHouse() == house`, `area == 'tower'`, label `6 · EG` / `6 · ground floor`, `pageerror` empty.
  For `6a` only: ride the lift to the roof (`D` on the pad, as in `test_enter_6c.py`) and assert label `6 · Dach`.
- [ ] Run `tests/test_enter_bodenacker_all.py`, `tests/test_enter_6c.py`, `tests/test_enter_6c_ground.py`,
  `tests/test_bodenacker6.py` and `node --test tests/*.test.mjs`. All green.

## Task 6 — CHANGELOG

- [ ] Under `[Unreleased]` › `Added`, newest first, `TZ=Europe/Zurich date '+%F %H:%M'`:
  ``- `<ts>` **All four entrances** of **Bodenackerstrasse 6** in Sisseln are open now: each with its stair hall, lift and roof door.``
