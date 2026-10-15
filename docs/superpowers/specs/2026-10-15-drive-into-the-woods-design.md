# Drive into the woods and between the trees (#211) — design

Status: enriched 2026-10-15 (`--headless`). Playtest 2026-10-10, entry 08 (`docs/ai-notes/feedback/2026-10-10-playtest.md`):
„Ich kann nicht in den Wald reinfahren, bzw. zwischen zwei Bäumen durchfahren". Builds on #13 (OSM woods) and #131 (solid trunks).

## Finding

Today the car cannot enter an OSM wood by design:

- `prototype/index.html` (anchor: `for (const e of edges) if (!(HIDE && segmentInHideout(e.x0, e.z0, e.x1, e.z1))) addSolid({`) puts one
  invisible 1.6 m wall (`forest: true`, 2.4 m thick) along every wood edge segment, 1.2 m inside the edge. The Hochrhein world has
  17,819 of them (#323 measurement).
- The forest trees (`window.__FOREST`, `[x, z, h, ground]`, ~77 k) have **no collider**: #13 A4 chose the walls because 70 k circles
  "in OBB_GRID" looked expensive. The scattered trees (`window.__TREES`) do have one since #131 (`treeCollider`, a circle of
  `0.06 · h` at the trunk, `low: true`, added with `addSolid` after the placement loop).
- There is **no off-road rule**: `stepCar` applies one rolling drag `0.12` (plus `UW.drag` under water) everywhere
  (anchor: `vf -= vf * ((wet ? UW.drag : 0.12) + (dead ? WRECK.coast : 0)) * dt`). Grass, fields and roads drive the same.

Geometry check: edge trees stand every ~6 m (jitter ±1.5 m along, 0.5–3 m deep, `forestTrees` in `world.js`), fill trees
1 per 600 m² (~24 m apart). Trunk radius `0.06 · h` with `h` 7–14 m is 0.42–0.84 m; the car's circle is 1.3 m (2.6 m wide).
A typical edge gap of ~6 − 1.7 ≈ 4.3 m lets the car through; where two trees happen to stand closer than ~4.3 m centre to centre the gap is shut.

## Decision

1. **Remove the forest edge walls.** No `addSolid` for wood edges any more; `forestEdges` stays (the edge tree row is built from it).
2. **Every forest tree gets the #131 trunk collider**, flagged `forest: true`, registered in `OBB_GRID` with `addSolid` **after** the
   forest placement loop (so `free()` inside that loop never sees a forest trunk and the wood keeps its density). The collider is
   built from the position list (`[x, z, h]` + `lidGround(x, z)`), never from mesh geometry (#323). New pure helper
   `forestCollider(x, z, h, base)` in `world.js` = `treeCollider` + `forest: true`.
   - `collide()` needs no change: it already handles `circle` and `low`, and its pontoon exception (`o.forest && PONTOON.deck &&
     pontoonCorridor(...)`) keeps applying to forest trunks. Per frame it reads only the 32 m cells around the car (`gridQuery`).
3. **Forest floor is slower.** New pure helper `floorDrag(inWood, roadD)` in `world.js` returns `FOREST_FLOOR.drag` (0.4) when the car
   is inside a wood (`FOREST.inside(P.x, P.z)`, the existing 8 m mask) and off the asphalt (`roadDist > 0`), else 0. `stepCar` adds it
   to the rolling drag on land (not under water). The Rhyflitzer's cruise speed at full gas drops from ≈ 40 m/s to ≈ 20 m/s
   (`v = (accel − 0.6) / (accel/top + drag)`: 15.4 / 0.387 vs 15.4 / 0.787).
4. `__mm.counts.forest` loses `walls` and gains `solid` (the number of forest trunk colliders = `trees`).
5. The orphaned `segmentInHideout` import in `index.html` goes; the function and its node tests in `hideout.js` stay (not ours to delete).

## Acceptance criteria

- [ ] No forest edge wall exists: `__mm.counts.forest.walls` is gone, `solid === trees`.
- [ ] Driving straight at a wood edge from 25 m out through a gap between edge trees, the car ends inside the wood (`test_forest_edge_lets_the_car_in`).
- [ ] Driving straight at a forest trunk from 25 m out stops the car with its circle on the trunk (`test_sim_driveAtAForestTree_stopsInFrontOfTheTrunk`).
- [ ] A car resting 0.5 m beside an isolated forest trunk is pushed out by `rCar + rTree − 0.5` (≥ 20 trunks).
- [ ] Coasting 1 s from 30 m/s on a flat, trunk-free line inside a wood ends below 21 m/s; the same coast on flat open grass ends above 24 m/s
      (`test_forest_floor_is_slower`). New read-only hooks `__mm.inWood(x, z)` and `__mm.roadDistAt(x, z)`.
- [ ] Roads through woods unchanged: `treesOnRoad() == 0`; road driving has no extra drag (`floorDrag(true, -1) === 0`).
- [ ] Minimap unchanged with and without woods (`mapBoxes` equal); forest density unchanged (`edge`/`fill`/`trees` counts as before).
- [ ] Node: `forestCollider` and `floorDrag` pinned in `prototype/tests/world.test.mjs`.
- [ ] Playwright: `test_tree_collision.py`, `test_smoke.py::test_forest_loaded`, `test_smoke.py::test_forest_edge_lets_the_car_in`,
      `test_smoke.py::test_forest_trees_stay_off_the_minimap`, `test_region.py::test_ehrendingen_has_its_osm_woods`, `test_pontoon.py`,
      `test_heli.py`, `test_hideout.py` green.
- [ ] Docs: `docs/11-pipeline-osm.md` Forests paragraph, `CHANGELOG.md` `[Unreleased]` → `### Changed`, `test-todo.md` playtest section.

## Assumptions

- **A1** [confirmed] Collision model: „Solid trunks, gaps open": remove the wall at the forest edge (#13); each trunk blocks like a post (#131),
  the car fits through any gap wider than itself. Rejected: keeping the walls with gaps cut in them.
- **A2** [confirmed] Feel: „Slower off-road": more rolling resistance on forest floor, reusing the existing off-road (grass/field) rule if the game has one.
  The game has none (`stepCar` uses one drag everywhere, anchor above), so a forest-floor term is added; grass and fields stay as they are.
- **A3** [med] Trunk colliders go into the **existing `OBB_GRID`** via `addSolid`, as plain objects (≈ 77 k, roughly +10 MB JS heap, minus the
  17.8 k wall objects). Per frame `collide()` reads 1–4 cells of 32 m; an edge cell holds ~10–20 trunks. Rejected: a separate typed-array
  trunk grid (less memory, but a second collision path in `collide()`, the camera test and `heliFloor`). Rejected: a linear scan over `__FOREST`.
- **A4** [high] Collider shape and radius are #131's (`treeCollider`, `0.06 · h`, `low: true`), so both tree styles and the crash response
  (speed loss, damage, crash sound) are identical to the scattered trees. Rejected: a forest-specific radius.
- **A5** [high] Registered after the forest placement loop, like #131 (`for (const [x, z, h] of TREES) addSolid(treeCollider(...))`), so
  `free(x, z, 2)` in the loop never sees a trunk. Rejected: inside the loop (it would thin every wood).
- **A6** [med] Forest-floor drag `0.4` (cruise at full gas ≈ half the road value). Rejected: a speed cap (abrupt), a grip change (steering, not speed).
- **A7** [high] „Inside a wood" is the existing 8 m mask `FOREST.inside`, and only off the asphalt (`roadDist > 0`), so roads through woods
  (corridors cut in the pipeline, #13 A5) drive as before. Rejected: exact point-in-polygon per frame.
- **A8** [med] The helicopter floor and the chase-camera clearance test see forest trunks unchanged (they read `OBB_GRID`): the helicopter keeps
  10 m above the crowns near trunks, the camera pulls in when it crosses a trunk — the #131 behaviour for scattered trees (#131 A5).
  Rejected: skipping `o.forest` there.
- **A9** [high] `forest: true` on the trunks keeps #100's pontoon exception working without change.

## Consequences

- The woods become drivable slaloms; a wood is a shortcut only at ~half speed.
- Beaming (#165) into a wood now lands the car between the trees instead of snapping to a road, unless the spot is on a trunk.
- The helicopter flies higher over woods than before (crown + 10 m instead of ground + 1.6 m + 10 m at the edges).
- The chase camera zooms in more often while driving inside a wood.
- Where two edge trees stand closer than ~4.3 m the gap is shut; a car can wedge between two trunks and be pushed by both at once.
- `OBB_GRID` holds ~60 k more entries; memory roughly +10 MB JS heap (#323 counts it).
- `test_forest_edge_blocks_the_car` and `test_forest_walls_stay_off_the_minimap` are replaced; the `walls` count disappears from `counts.forest`.
