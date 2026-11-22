# Sisseln 1952 PR 5: traced houses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the 1952 layer (<kbd>Ctrl</kbd>+<kbd>Y</kbd>), the 28 Sisseln houses that stood in 1946–1952 and are gone today stand again, solid for the car, and vanish again in today's world.

**Architecture:** A committed, hand-traced data file (`pipeline/era_traced_sisseln.json`, LV95 footprints, already in the branch) is merged by a new retrofit step `era_traced.py` into `world.era.houses` (a separate list, so missions, address plates, landmarks and the GWR filter never see them). `era_roads.py` counts them as old houses. At runtime they are built through the existing `ERA_PAST` collector (PR 4) into `ERA.past`, and their colliders are past solids that are only on while `ERA.on`.

**Tech Stack:** Python 3.12 + shapely (pipeline, pytest), buildless three.js `index.html` + ES modules (node tests), Playwright (browser tests).

**Spec:** `docs/superpowers/specs/2026-11-15-sisseln-1952-design.md` (section "Traced houses (Sisseln only)", delivery item 5)

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Default height 2 storeys, gable roof, village palette (spec): `h = 6.0`, (`rh = 4.0` was dropped: osmBuilding only reads `rh` for DSM-measured buildings, roof shape follows the game's gable default), `roof = "gable"`, `palette = "village"`.
- Tracing references only, never textures: no historic imagery is committed or loaded at runtime.
- Collision follows visibility: traced houses are solid only while the 1952 layer is on.
- Memory-heavy jobs (world JSON regeneration, pytest over the world file) run under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`; Playwright under `MemoryMax=3G`.
- Pipeline Python: `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python` (the worktree has no venv).
- Browser checks: only `tests/test_era_toggle.py`, in the foreground. No full suite.
- Retrofit order after this PR: `era_1952.py` → `era_traced.py` → `era_roads.py` → `era_fields.py`.
- All commits reference #530. German player text: capitalised Du/Dir, real umlauts.

## Review Focus

1. The car stands where a traced house appears when the player switches to 1952 → the car is moved to the nearest road, as when a building reappears today (Task 2 test).
2. Re-running `era_1952.py` after `era_traced.py` keeps `era.houses` (Task 1 test).
3. `era_traced.py` run on a world without `era` (before `era_1952.py`) → fails with a clear error, writes nothing (Task 1 test).
4. In today's mode the minimap and colliders show no traced house; in 1952 the minimap paints them (Task 2 test).
5. Traced houses never overlap a building or road that stands in 1952 (Task 1 data test on the committed world file).

---

### Task 1: Pipeline step `era_traced.py`, roads count traced houses, world regenerated

**Files:**
- Create: `pipeline/era_traced.py`, `pipeline/tests/test_era_traced.py`
- Modify: `pipeline/era_roads.py` (`apply`), `pipeline/tests/test_era_roads.py`, `pipeline/tests/test_era_1952.py`
- Regenerate: `data/world_hochrhein.json`
- Docs: `docs/11-pipeline-osm.md` (new paragraph "Traced houses (#530)" after "Building ages", and the order sentence in the roads/fields paragraphs), `data/README.md` (`era.houses` shape), `CREDITS.md` (one line: Siegfried map and SWISSIMAGE HIST 1946 © swisstopo, tracing reference only)
- Input (exists, do not edit): `pipeline/era_traced_sisseln.json` — `{"_about": str, "houses": [{"id": "sisseln-NN", "ref": str, "ring": [[E, N], ...]}]}`, 28 entries, LV95

**Interfaces:**
- Produces: `world["era"]["houses"]`: list of `{"id": "sisseln-NN", "h": 6.0, "roof": "gable", "palette": "village", "rect": [cx, cz, w, d, angle], "ring": [[x, z], ...], "rh": 4.0}` in game coordinates (same shape `osmBuilding` reads for `world.buildings`; `rect` from `world_buildings.roof(poly)[1]`).
- Produces: `era_traced.house(entry, frame) -> dict`, `era_traced.apply(world, traced) -> int` (count), constants `H = 6.0`, `RH = 4.0`, `SOURCE_LINE = "Historic houses: traced from the Siegfried map and SWISSIMAGE HIST 1946 © swisstopo"`.

- [ ] **Step 1: Write failing tests** in `pipeline/tests/test_era_traced.py`:
  - `test_house_shape`: one square LV95 entry 10 × 10 m at the world origin + (100, -50) → `house()` returns the keys above, `h == 6.0`, `rh == 4.0`, `roof == "gable"`, ring in game frame (x = E − origin E, z = origin N − N), `rect[2:4]` ≈ (10, 10).
  - `test_apply_writes_era_houses_and_source`: a minimal world with `era = {"year": 1952}` → `apply` returns 2, `world["era"]["houses"]` has 2 entries, `world["era"]["year"] == 1952`, `SOURCE_LINE` in `sources` once; running `apply` twice gives the same world (idempotent).
  - `test_apply_needs_era`: world without `era` → `ValueError` naming `era_1952.py`, world unchanged.
  - `test_committed_houses_clear_of_1952` (data test, reads `data/world_hochrhein.json`, skip if missing): 28 houses; no house intersects any building without `modern` by more than 0.5 m²; none intersects any road without `modern` (`LineString(pts).buffer(w / 2)`) by more than 0.5 m².
  - In `test_era_1952.py`: `test_apply_keeps_era_houses`: a world whose `era` has `houses` keeps them after `era_1952.apply`.
  - In `test_era_roads.py`: `test_traced_house_keeps_residential_street`: a residential street with no old building nearby but one `era.houses` footprint within 25 m is not `modern` after `apply`.
- [ ] **Step 2: Run them, watch them fail** (`pytest pipeline/tests/test_era_traced.py pipeline/tests/test_era_roads.py pipeline/tests/test_era_1952.py -q`; expected: import error / assertion failures; the data test fails on a missing `era.houses`).
- [ ] **Step 3: Implement** `pipeline/era_traced.py` (module docstring in the style of `era_fields.py`; CLI `--world` required, `--traced` defaulting to `HERE / "era_traced_sisseln.json"`; writes the world back in the same JSON style the other era steps use) and in `era_roads.apply` pass `world["buildings"] + world.get("era", {}).get("houses", [])` wherever the old footprints are gathered (`classify`, `_plan`). `apply` replaces `era.houses` (idempotent) and inserts it after `year`/`fields` without dropping other `era` keys.
- [ ] **Step 4: Regenerate the world** under the memory cap, in order: `era_traced.py`, `era_roads.py`, `era_fields.py` on `data/world_hochrhein.json`. Check `git diff --stat` and a JSON diff: only `era.houses`, the new `sources` line, and road `modern` / `keep1952` flags may change; report how many roads changed flag.
- [ ] **Step 5: Run all pipeline tests green** (`pytest pipeline/tests -q`, under the cap).
- [ ] **Step 6: Docs** as listed under Files.
- [ ] **Step 7: Commit** `feat(era): traced Sisseln houses of 1952 in the world file (#530)`.

### Task 2: Runtime — build the traced houses into the 1952 layer

**Files:**
- Modify: `world.js` (`eraHouses: w.era?.houses || []` next to `eraFields`), `index.html`, `CHANGELOG.md`
- Test: `tests/world.test.mjs`, `tests/test_era_toggle.py`

**Interfaces:**
- Consumes: `world.era.houses` from Task 1 (same record shape as `world.buildings`).
- Produces: `L.eraHouses`; collider flag `o.past = true` on solids built while `ERA_PAST`; `window.__mm.era()` gains `pastHouses` (count built) and `pastHouseSolidsOn` (past solids with `!o.off`); `window.__mm.counts.eraHouses`.

- [ ] **Step 1: Write failing tests.**
  - `tests/world.test.mjs`: `eraHouses` is `[]` without `era.houses` and passes the list through when present; `buildings` never contains them.
  - `tests/test_era_toggle.py` (new tests, same fixtures/helpers as the existing ones there):
    - `test_traced_houses_hidden_today`: on load `pastHouses == 28`, `pastHouseSolidsOn == 0`, `ERA.past` not visible.
    - `test_traced_houses_shown_in_1952`: after <kbd>Ctrl</kbd>+<kbd>Y</kbd>: `pastHouseSolidsOn == 28`, `pastVisible` true; after a second <kbd>Ctrl</kbd>+<kbd>Y</kbd> back to 0.
    - `test_car_moved_out_of_appearing_house`: place the car (existing teleport/debug hook the file already uses) at the centroid of `sisseln-` house with the largest area, switch to 1952 → the car is no longer inside any active solid (`nearestSolid` / `solidHolds` via the existing hooks) and stands on a road.
    - `test_minimap_paints_traced_houses_only_in_1952`: `__mm.mapBoxes()` grows by 28 after <kbd>Ctrl</kbd>+<kbd>Y</kbd> compared with today.
- [ ] **Step 2: Run them, watch them fail** (node: `node --test tests/world.test.mjs`; browser: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pytest tests/test_era_toggle.py -q -k "traced or minimap_paints"`).
- [ ] **Step 3: Implement** in `index.html`:
  - Build `L.eraHouses` right after the `L.buildings` loop (line ~3022) with `ERA_PAST = true` around `osmBuilding(b)`, reset after; count into `__mm.counts.eraHouses`. Everything `osmBuilding` creates must land in `ERA.past` — if it adds anything outside `push()`/`pushOBB()` (windows, lights, labels), route it the way the `ERA_COLLECT` branch does for modern buildings.
  - `pushOBB`: when `ERA_PAST`, set `o.past = true`, `o.off = true`, push to `ERA.solids`.
  - `toggleEra` (line ~8222): `o.off = o.past ? !ERA.on : ERA.on`. The "back inside a reappearing building" check runs in both directions: any solid that just turned on and holds the car → `placeOnRoad(nearestJumpable(...))`, at most one placement per toggle (do not double-move when the PR 3 road-gone fallback also fires).
  - Minimap `paintMapStatic` and `__mm.mapBoxes`: skip `o.off && (o.modern || o.past)` instead of `o.modern && o.off`.
  - `__mm.era()`: add `pastHouses`, `pastHouseSolidsOn`.
- [ ] **Step 4: Run the tests green**: node suite (`node --test tests/`), then `tests/test_era_toggle.py` complete (foreground, capped).
- [ ] **Step 5: CHANGELOG** entry under `[Unreleased]`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, German, e.g. ``- `<ts>` In **1952** (<kbd>Ctrl</kbd>+<kbd>Y</kbd>) stehen in **Sisseln** wieder die Häuser, die es heute nicht mehr gibt: nachgezeichnet nach dem Luftbild von 1946 und der **Siegfriedkarte**.``
- [ ] **Step 6: Commit** `feat(era): traced Sisseln houses stand in the 1952 layer (#530)`.

### After the tasks (controller, not a subagent)

Side-by-side screenshot for the maintainer gate: game top-down over the Sisseln core in 1952 (black and white on) next to SWISSIMAGE HIST 1946, same framing (LV95 box E 2641250–2641800, N 1266900–1267320). The PR stays draft until the maintainer approves it.
