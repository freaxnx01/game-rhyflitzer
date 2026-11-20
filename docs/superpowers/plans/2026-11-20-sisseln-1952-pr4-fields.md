# Sisseln 1952, PR 4: Sisslerfeld fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the 1952 layer, field strips cover the Sisslerfeld industrial site. Its car parks, props and the two DSM landmarks (chimney, water tower) are hidden, and the Plattform viewpoint, whose subject is the chimney, is not offered.

**Architecture:**
- A new idempotent retrofit step, `pipeline/era_fields.py`, runs after `era_roads.py`.
- It writes the strips to `world["era"]["fields"]` and sets `modern: true` on the parking lots, props and landmark anchors inside the site.
- At runtime a third collector (`partsPast`, beside `parts` and `partsModern`) builds the strips into `ERA.past`. That group is shown only while the layer is on, the inverse of `ERA.group`.
- Everything flagged `modern` is built into the existing `ERA.group` and `ERA.solids`.

**Tech Stack:** Python 3 + shapely (pipeline, pytest), vanilla ES modules + three.js (node `--test`, Playwright).

**Spec:** `docs/superpowers/specs/2026-11-15-sisseln-1952-design.md` (issue #530), sections "Sisslerfeld fields", "Calls made by Claude" (parking/props, viewpoints) and "Plattform Sisslerfeld" in the decisions table.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Reference #530 in every commit.
- Pipeline:
  - Python is `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python`. Run it from `pipeline/`.
  - JSON is written with `ensure_ascii=False, separators=(",", ":")`, like `era_roads.py`.
  - Anything that loads `data/world_hochrhein.json` runs under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- Browser tests:
  - Run only the touched Playwright file, in the foreground, under `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0`.
  - Node tests: `node --test tests/*.test.mjs`.
- Spec, verbatim: "Plausible strip layout is enough; it doesn't have to match the 1952 parcels exactly."
- Spec, verbatim: "car parks (`world_parking.py`) and props (`world_props.py`) inside the industrial area are hidden with the buildings."
- Spec, verbatim: "Plattform Sisslerfeld **Stays standing** and climbable in 1952 … Its viewpoint (subject: DSM chimney, hidden in 1952) is not offered while the layer is on."
- Non-goals (spec): no historic forests, no historic rail changes, no historic terrain. Forests, water, rail and today's fields inside the site stay as they are, in both eras.
- All new UI text exists in `de` and `en` (`strings.js`). This PR is expected to add none.
- The `CHANGELOG.md` entry goes under `[Unreleased]`. It is timestamped with `TZ=Europe/Zurich date '+%F %H:%M'` and bolds 1 to 3 keywords.

## Review Focus

1. **Order of the retrofit steps.** Re-running `era_1952.py` after `era_fields.py` must keep `world.era.fields`, because today it overwrites `era` with `{"year": 1952}`. Pinned in Task 2.
2. **Grey look and the strips.** Switching to the black-and-white look (or any render style) while the layer is off must still give the hidden 1952 strips the new material. Otherwise they appear in the wrong style on the next Ctrl+Y. Pinned in Task 4.
3. **Fields and what stays in 1952.** A strip must never lie on a road that stays in 1952 (Südspange, the cycleway, a kept `keep1952` stretch), on a track, or in a pond or forest inside the site. Pinned in Tasks 1 and 2 (unit test + real-data check).
4. **Viewpoint hunt in 1952.** It ends after the offered viewpoints are shot (3 of 4), and the gone chimney gets no map mark or arrow. Pinned in Task 5.
5. **The Ehrendingen world.** It has no `era`. It must load with `eraFields: []` and an empty `ERA.past`. Pinned in Task 3.

---

### Task 1: Field strips for a polygon (pure geometry)

**Files:**
- Create: `pipeline/era_fields.py`
- Test: `pipeline/tests/test_era_fields.py`

**Interfaces:**
- Consumes: from `world_fields`: `direction(p)`, `_polys(g)`, `_entry(kind, p, src, cut)`, `SEAM`, `MIN_AREA`.
- Produces:
  - `strips(site: Polygon, seed: int = 1952) -> list[tuple[str, Polygon]]`: uncut strips covering `site`, each with its kind.
  - `layout(site: Polygon, keep_out) -> list[dict]`: the field entries, shaped like `world["fields"]` items with `src: "era"`. `keep_out` is a shapely geometry or `None`.
  - Constants: `STRIP_MIN = 18.0`, `STRIP_MAX = 40.0` (m, strip width across the long axis), `CROSS_MIN = 120.0`, `CROSS_MAX = 260.0` (m, strip length along it), `ERA_KINDS = ("cereal", "cereal", "cereal", "root", "meadow", "pasture", "bare")`.

- [ ] **Step 1: Write the failing tests** in `pipeline/tests/test_era_fields.py`:

```python
import era_fields as F
import world_fields as W
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

SITE = box(0, 0, 400, 150)   # long axis along x

def test_strips_cover_the_site_and_stay_inside():
    s = F.strips(SITE)
    u = unary_union([p for _, p in s])
    assert abs(u.area - SITE.area) < 1.0 and u.difference(SITE.buffer(0.01)).is_empty

def test_strips_run_along_the_long_axis_with_widths_in_range():
    for _, p in F.strips(SITE):
        minx, minz, maxx, maxz = p.bounds
        assert maxz - minz <= F.STRIP_MAX + 0.01            # width across the long axis
        assert maxx - minx <= F.CROSS_MAX + 0.01

def test_strips_are_deterministic_and_use_era_kinds():
    a, b = F.strips(SITE), F.strips(SITE)
    assert [(k, p.wkt) for k, p in a] == [(k, p.wkt) for k, p in b]
    assert {k for k, _ in a} <= set(F.ERA_KINDS) and len({k for k, _ in a}) > 1

def test_layout_keeps_off_keep_out_and_insets_by_half_a_seam():
    road = LineString([(0, 75), (400, 75)]).buffer(4)
    out = F.layout(SITE, road)
    assert out and all(e["src"] == "era" and "dir" in e for e in out)
    for e in out:
        p = Polygon(e["ring"])
        assert not p.intersects(road)
        assert p.area >= W.MIN_AREA
        assert p.within(SITE.buffer(-W.SEAM / 2 + 0.05))

def test_layout_of_a_site_fully_kept_out_is_empty():
    assert F.layout(SITE, SITE.buffer(1)) == []
```

- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_era_fields.py -q`. Expected: FAIL (`No module named 'era_fields'`).

- [ ] **Step 3: Implement `strips` and `layout`.**
  - `strips`:
    - Rotate `site` by `-direction(site)` (radians) about its centroid, so the long axis runs along x.
    - Walk z from `miny` to `maxy` in bands of width `rng.uniform(STRIP_MIN, STRIP_MAX)`. Cut each band along x into pieces of length `rng.uniform(CROSS_MIN, CROSS_MAX)`.
    - Intersect each piece with the rotated site and rotate it back. Each polygon part gets `ERA_KINDS[rng.randrange(len(ERA_KINDS))]`.
    - `rng = random.Random(seed)`; draw in a fixed order, so the same site gives the same strips.
    - A last band or piece narrower than `STRIP_MIN / 2` merges into the previous one, so there are no slivers.
  - `layout`: for each strip, `difference(keep_out)`, then `buffer(-SEAM / 2)`. Drop parts under `MIN_AREA`. Emit `_entry(kind, part, "era", keep_out)`. Sort the entries like `world_fields.build`, by bounds.

- [ ] **Step 4: Run the tests.** Expected: PASS. Then run the whole `.venv/bin/python -m pytest -q`. Expected: green.

- [ ] **Step 5: Commit** `feat(era): field strips for the 1952 Sisslerfeld (#530)`.

---

### Task 2: Retrofit the world: strips, modern flags, docs

**Files:**
- Modify: `pipeline/era_fields.py` (add `keep_out_of`, `flag_site`, `apply`, CLI)
- Modify: `pipeline/era_1952.py` (`apply` keeps the existing `era` keys)
- Modify: `data/world_hochrhein.json` (regenerated by the step)
- Modify: `data/README.md`, `docs/11-pipeline-osm.md` (one paragraph each, after the `era_roads.py` one)
- Test: `pipeline/tests/test_era_fields.py`, `pipeline/tests/test_era_1952.py`

**Interfaces:**
- Consumes: `layout`, from Task 1. From `era_roads`: `_to_game(lonlat_geojson, frame)` and the CLI pattern (`--world`, `--industrial` defaulting to `HERE / "industrial_sisslerfeld.geojson"`). From `world_fields`: `FIELD_GAP`, `RAIL_GAP`, `STREAM_GAP`, `PARKING_GAP`.
- Produces:
  - `keep_out_of(world, site) -> Geometry`: what stays visible in 1952 inside the site.
  - `flag_site(world, site) -> dict`: sets `modern: True` and returns counts `{"parking": n, "props": n, "landmarks": n}`.
  - `apply(world, industrial_lonlat) -> dict`: the counts plus `"fields": n`.
  - New data in the world file:
    - `world["era"]["fields"]`: list of field entries.
    - `modern: true` on `parking[i]`, on `props[i]` and on `anchors.landmarks[k]` inside the site.
  - `KEEP_LANDMARKS = ("plattform",)`: never flagged.

- [ ] **Step 1: Write the failing tests.**
  - `test_keep_out_holds_old_roads_kept_stretches_rail_forest_water_and_todays_fields`:
    - The world is synthetic. One old road crosses the site. One road is `modern`. One road has `keep1952: [[0, 50]]` over a 200 m line, and its dropped part lies inside the site. It also has one rail line, one forest ring, one water ring, one today field, and one old building.
    - Assert that `keep_out` contains points on:
      - the old road;
      - the kept 0 to 50 m stretch;
      - the rail line;
      - the forest;
      - the water;
      - the today field;
      - the old building.
    - Assert that `keep_out` does not contain points on the modern road, or on the dropped 50 to 200 m stretch.
  - `test_flag_site_marks_parking_props_and_landmarks_inside_only`:
    - Synthetic world: one lot inside the site and one outside, by ring centroid; one prop inside and one outside; landmarks `dsmChimney` inside, `plattform` inside and `muenster` outside.
    - Assert that only the inside lot, the inside prop and `dsmChimney` get `modern: True`.
    - Assert the counts `{"parking": 1, "props": 1, "landmarks": 1}`.
  - `test_apply_is_idempotent_and_writes_era_fields`: apply twice; the JSON dump is identical; `world["era"]["year"] == 1952`; `world["era"]["fields"]`; no field ring intersects an old road corridor.
  - `test_flag_site_clears_a_stale_flag_outside`: a lot outside the site that carries `modern: True` from an earlier run loses it.
  - In `test_era_1952.py`: `test_apply_keeps_existing_era_keys`. With `world["era"] = {"year": 1952, "fields": [x]}`, after `apply` `world["era"]["fields"] == [x]`.

- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_era_fields.py tests/test_era_1952.py -q`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - `keep_out_of` is the union of:
    - each non-`modern` road, cut down to its `keep1952` intervals with `shapely.ops.substring`, buffered by `w / 2 + FIELD_GAP`;
    - rail lines buffered by `RAIL_GAP`;
    - streams buffered by `w / 2 + STREAM_GAP`;
    - forest rings and water `rings[0]` buffered by 2 m;
    - today's `fields` rings buffered by `SEAM`;
    - non-`modern` building rings and non-`modern` parking rings buffered by `PARKING_GAP`.
  - `flag_site`:
    - Test parking by ring centroid, props by `(x, z)`, and landmarks (dicts with `x`/`z`) by their point, all inside `site`.
    - Set `modern` as the last key when inside, and pop it otherwise (for parking, props and landmarks).
    - Skip `KEEP_LANDMARKS`.
  - `apply`:
    - Steps: frame, then `site = _to_game(...)`, then `flag_site`, then `layout(site, keep_out_of(world, site))`.
    - Then `world["era"]["fields"] = …`. Raise `ValueError` if `world` has no `era` (run `era_1952.py` first).
  - `era_1952.apply`: `_insert_after(world, "sources", "era", {**world.get("era", {}), "year": 1952})`.

- [ ] **Step 4: Run the tests.** Expected: PASS. Then run the whole pipeline suite. Expected: green.

- [ ] **Step 5: Run on the real world**, under the memory cap: `python era_fields.py --world ../data/world_hochrhein.json`. Expected counts:
  - `parking` is 3;
  - `props` is 0;
  - `landmarks` is 2 (dsmChimney, dsmWaterTower);
  - `fields` is between 60 and 400.

  Run it a second time: `git diff --stat data/` must not change between the two runs.

  Real-data check, in a scratch script in the session scratchpad: no era field intersects a non-modern road buffered by `w / 2`, and the field area inside the site is at least 25 ha (the site is 37.1 ha). Paste both numbers into the report.

- [ ] **Step 6: Docs.**
  - `docs/11-pipeline-osm.md`: a paragraph "Fields of 1952 (#530)" after "Roads of 1952". It covers the step order (`era_1952` → `era_roads` → `era_fields`), the strip constants, what stays (keep-out), what gets flagged, `KEEP_LANDMARKS`, and the CLI.
  - `data/README.md`: one paragraph on the data shape, `era.fields` plus `modern` on parking, props and landmarks.

- [ ] **Step 7: Commit** `feat(era): the 1952 Sisslerfeld gets fields, its car parks and DSM landmarks are flagged (#530)`.

---

### Task 3: Loader and pure helpers

**Files:**
- Modify: `world.js` (`layoutFromWorld`)
- Modify: `landmarks.js` (`sourcePos` for anchors)
- Modify: `viewpoints.js` (`resolveViewpoints`, plus a new `offeredMask`)
- Test: `tests/world.test.mjs`, `tests/landmarks*.test.mjs` (whichever already covers `landmarkEntries`; grep for it), `tests/viewpoints.test.mjs`

**Interfaces:**
- Produces:
  - `layoutFromWorld(w).eraFields`: `w.era?.fields || []`.
  - `landmarkEntries(...)`: an anchor with `modern: true` gives an entry with `modern: true`, as buildings already do. The existing `eraJumpEntries` then drops the DSM-Kamin and DSM-Wasserturm J spots in 1952 with no further change.
  - `resolveViewpoints(...)`: each item gains `modern: true` when its `at` or `subject` landmark is `modern`.
  - `offeredMask(list, shot, on) -> boolean[]`: true where a viewpoint is shot already, or is `modern` while `on`. Index i is "skip".
  - `offeredCount(list, on) -> number`.

- [ ] **Step 1: Write the failing tests.**
  - `layoutFromWorld_eraFields_passThroughAndDefaultEmpty`: a world with `era: {year: 1952, fields: [f]}` gives `[f]`. A world without `era` gives `[]`, which is the Ehrendingen case.
  - `landmarkEntries_modernAnchor_entryIsModern`.
  - `resolveViewpoints_modernSubject_flagged`.
  - `offeredMask_hidesModernOnlyWhenOn`: with list `[{}, {modern: true}]` and shot `[false, false]`, `on = true` gives `[false, true]` and `on = false` gives `[false, false]`.
  - `offeredCount_1952_countsOnlyShown`.
- [ ] **Step 2: Run** `node --test tests/*.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the changes listed in the Interfaces block.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(era): loader and helpers for the 1952 fields and hidden landmarks (#530)`.

---

### Task 4: Runtime: strips shown in 1952, site contents hidden

**Files:**
- Modify: `index.html`:
  - `fieldMeshes`, around line 1855;
  - `push` and `ERA`, around lines 1789 to 1810;
  - `parkingMeshes`, around line 2466;
  - `propMeshes`, around line 2498;
  - the landmark block, around line 3011;
  - the role-mesh build, around line 3340;
  - `applyStyle`, around line 3951;
  - `__mm.era`, around line 5880;
  - `toggleEra`, around line 8144.
- Modify: `CHANGELOG.md`
- Test: `tests/test_era_toggle.py`

**Interfaces:**
- Consumes: `L.eraFields`, plus `modern` on `L.parking[i]`, `L.props[i]` and `L.anchors.landmarks[k]`.
- Produces:
  - `ERA.past` (a `THREE.Group`, `visible = false` at start) and `ERA.pastMesh` (role → mesh).
  - `fieldMeshes(list, countsKey)`, called as `fieldMeshes(L.fields, 'fields')` and `fieldMeshes(L.eraFields, 'eraFields')`, with the second call under the past collector.
  - `__mm.era()` gains `pastVisible`, `pastFields` (= `counts.eraFields.n`), `pastMaterials` (role → material uuid), `landmarkSolidsOff` and `parkingHidden`.

- [ ] **Step 1: Write the failing Playwright tests** in `tests/test_era_toggle.py`, reusing its `open_game` helper:
  - `test_1952_fields_appear_only_in_1952`: `era().pastFields > 50`. Before Ctrl+Y, `pastVisible` is False; after it, True; after a second Ctrl+Y, False again.
  - `test_1952_hides_site_parking_and_dsm_landmarks`: after Ctrl+Y, `era().solids` is larger than on main for the same world. Concretely, `solids` counts the chimney and water-tower colliders: assert that `era().landmarkSolidsOff == 2`. Add that field to `__mm.era()`: the number of `ERA.solids` with `o.landmark` and `o.off`.
  - `test_style_switch_while_today_restyles_the_1952_fields`: record `pastMaterials`, switch the render style with the key the existing grey/style test uses, and assert that every uuid changed.
- [ ] **Step 2: Run** `systemd-run … pytest tests/test_era_toggle.py -k "fields or site or style_switch" -x`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`push`:** add `const partsPast = {}; let ERA_PAST = false;`. `push` then picks `ERA_PAST ? partsPast : ERA_COLLECT ? partsModern : parts`.
  - **Role meshes:** after the `partsModern` loop, the same loop over `partsPast` into `ERA.past` / `ERA.pastMesh`; then `scene.add(ERA.past)`.
  - **`sceneMeshes`:** includes `ERA.pastMesh` while `ERA.past.visible`.
  - **`applyStyle`:** iterates `[MESH, ERA.mesh, ERA.pastMesh]`.
  - **`toggleEra`:** sets `ERA.past.visible = ERA.on` next to `ERA.group.visible = !ERA.on`.
  - **Fields:** `fieldMeshes(L.eraFields, 'eraFields')` runs inside `ERA_PAST = true … false`, right after the existing call. It writes `window.__mm.counts[countsKey]`.
  - **Parking:**
    - Each lot's asphalt and sign go in with `ERA_COLLECT = !!lot.modern`, and are reset after.
    - `parkingSign` takes a parent argument: `signs` for today's lots, `ERA.group` for modern ones.
    - Bay lines of modern lots form a second decal mesh, with the same material settings, added to `ERA.group`.
  - **Props:**
    - Modern props are left out of `KNOCK` (its stand-up resets `obb.off` and would revive a 1952 collider).
    - They are built as plain `InstancedMesh`es per kind, added to `ERA.group`.
    - Their colliders go through `pushOBB` while `ERA_COLLECT` is true.
  - **Landmarks:** wrap the `dsmChimney` and `waterTower` calls in `ERA_COLLECT = !!at(k).modern … false`.
    - These builders call `addOBB` directly. Switch them to `pushOBB`, and give those OBBs a `landmark: true` field.
    - Anything else they add to the scene outside `push` (an aviation light, for example) goes to `ERA.group` when modern.
  - **`CHANGELOG.md`:** a player-facing entry, for example: "In **1952** (<kbd>Ctrl</kbd>+<kbd>Y</kbd>) the **Sisslerfeld** is farmland again: field strips instead of the factories, without the DSM chimney and water tower."
- [ ] **Step 4: Run** the three tests, then the whole of `tests/test_era_toggle.py` and `node --test tests/*.test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(era): the 1952 Sisslerfeld shows fields, its car parks and DSM landmarks vanish (#530)`.

---

### Task 5: Viewpoint hunt in 1952

**Files:**
- Modify: `index.html`, the viewpoint block (lines 6246 to 6330), `drawViewMarks` (line 8120), and `__mm.views` (line 8003).
- Test: `tests/test_viewpoints.py`

**Interfaces:**
- Consumes: `offeredMask` and `offeredCount` (Task 3); `VIEWPOINTS[i].modern` (Task 3).

- [ ] **Step 1: Write the failing Playwright test** `test_1952_plattform_viewpoint_not_offered`:
  - Start the view mode (as the existing tests do) and press Ctrl+Y.
  - Assert `views().offered == 3`. Add `offered: offeredCount(VIEWPOINTS, ERA.on)` to `__mm.views`.
  - Assert that `views().spots` marks `plattform` as `hidden: true`.
  - Shooting the 3 others ends the run. Use the same shot helper the existing finish test uses.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `standingAt`, `nearestPresent` and `drawViewMarks` get `offeredMask(VIEWPOINTS, VIEW_RUN.shot, ERA.on)` in place of `VIEW_RUN.shot`.
  - The end check and the "x of n" text use `offeredCount(VIEWPOINTS, ERA.on)`.
  - `setPipCount` and `__mm.views` follow; each `views().spots` item gains `hidden: !eraShown(v, ERA.on)`.
  - The tutorial keeps `TUT_VP` as is (see Notes).
- [ ] **Step 4: Run** `tests/test_viewpoints.py`, `tests/test_era_toggle.py` and the node tests. Expected: all pass.
- [ ] **Step 5: Commit** `feat(era): the Plattform viewpoint is not offered in 1952 (#530)`.

---

## Notes and rulings

- **Where the strips live:** in `world.era.fields`, not in `world.fields`.
  - Every other reader of `L.fields` (`fieldProbe`, the harvester, counts) keeps seeing today's parcels only.
  - The 1952-only data stays under `era`, where PR 5's traced houses can join it.
- **Southern bypass (Südspange):** this road is classified old by PR 3's rules (tertiary, a main road). It stays in 1952 and the strips keep off it.
  - Whether it should be hidden is a PR 3 rule question and not part of this plan.
  - It goes in the PR description as a known gap.
- **Tutorial:**
  - The Plattform step of the tutorial (`TUT_VP`) still points at the chimney.
  - A player who presses Ctrl+Y during the first-visit tutorial would aim at nothing.
  - This is not handled here and is listed in the PR as a known gap.
- **No new data source:** the strips are invented ("Plausible strip layout is enough"), so there is no attribution change.
