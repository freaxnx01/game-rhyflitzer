# Sisseln 1952 — PR 2: 1952 buildings from the register + time-layer toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** <kbd>Ctrl</kbd>+<kbd>Y</kbd> switches the Hochrhein world to 1952 and back: on the Swiss side, only buildings that already stood in 1952 (per the GWR register) remain; everything newer disappears, with its collision, house-number plate, jump entry and minimap box.

**Architecture:** A pipeline retrofit (like `cap_ridges.py` / `backfill_building_streets.py`) flags each Swiss building that did not stand in 1952 with `"modern": true` in the committed `data/world_hochrhein.json`; it adds a top-level `"era": {"year": 1952}` marker and a source line. The game routes the geometry of modern buildings into their own merged meshes (`ERA.group`) and tags their colliders `modern`. The toggle flips the group's visibility and the colliders' existing `off` flag. No reload, no second world file.

**Tech Stack:** Python 3 pipeline (shapely, numpy, pyproj via `geo.Frame`; pytest), vanilla JS ES modules (`node:test`), pytest + Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-sisseln-1952-design.md` (issue #530). This plan covers delivery step 2. PR 1 (black-and-white, PR#1004) is the base branch. Roads (PR 3), Sisslerfeld fields, parking, props and the DSM landmarks (PR 4), and traced houses (PR 5) are out of scope.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Cutoff year **1952**. Swiss side only; the **German side stays exactly as today**.
- Data source: GWR, `https://public.madd.bfs.admin.ch/ag.zip`, member `gebaeude_batiment_edificio.csv` (tab-separated, UTF-8). Fields: `EGID`, `GKODE`/`GKODN` (LV95), `GBAUJ` (year), `GBAUP` (8011 = before 1919, 8012 = 1919–1945, 8013 = 1946–1960), `GSTAT` (1004 = existing).
- **No network inside any test or inside the retrofit.** Only `gwr_ch.py fetch` downloads, into the gitignored `pipeline/cache/gwr/`. Tests mock `requests`.
- The retrofit leaves the rest of the world file unchanged: same key order, same `separators=(",", ":")`, `ensure_ascii=False` as `osm.write_world`. It is idempotent.
- The time layer and black-and-white are **independent**. Both are off at start, with no persistence.
- **Building colours must not change.** `osmBuilding()` keeps the same seeded `rr()`/`rnd()` draws in the same building order. Only where the geometry is pushed changes.
- Collision follows visibility: hidden buildings lose their colliders for the car, the walker, the helicopter floor and the camera.
- Shortcut: <kbd>Ctrl</kbd>+<kbd>Y</kbd>, matched **by letter** (`e.key`), like the existing plain-Y borders toggle (QWERTZ puts the letter Y on `KeyZ`). Handle it before `keys[e.code] = true`, next to `isMonoKey`, so Ctrl+Y never toggles the borders. It is free in all `*.js` files and `index.html`: plain Y is borders (`controls.js:39`, `index.html` `toggleBorders`), and no Ctrl+Y exists.
- All new UI text in `de` and `en` via `strings.js`. German uses capitalised `Du`/`Dir` and real umlauts.
- Memory cap for real-data runs on this host: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …`.
- Pipeline Python: `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python` (the worktree has no venv; run it from the worktree's `pipeline/`). Browser tests: `python3 -m pytest <file>`, run in the foreground, and only the affected files.
- Commits reference `#530` and use Conventional Commits. Branch `issue-530-sisseln-1952-buildings` (stacked on `issue-530-sisseln-1952`).

## Rulings in this plan (maintainer to check)

- **Undecided buildings** (no register match, or only period 8013 without a year). In the industrial area (`palette == "industrial"`) they are modern. Without a match and under 60 m² (a shed or garage) they are modern. Otherwise a building **stays** only if at least one decided neighbour lies within 30 m of its centroid and **every** decided neighbour there is old; otherwise it is modern. Spike on the real data (2026-11-15): 474 old, 1323 modern, 23 undecided kept, 154 undecided hidden, and the German side's 1191 untouched. Sisseln keeps about 50–60 houses.
- **Special models stay standing** in 1952, even if the register says newer: the Bodenackerstrasse row houses and Bodenackerstrasse 6 with its enterable stair hall (`isRowHouse`, `isBodenacker6`), and buildings that a swissBUILDINGS3D landmark replaces (`CH_LM_BY_OSM`). The game clears their `modern` flag at load, in one place. If this is wrong, a follow-up hides them, together with their interiors.
- **The minimap follows the layer**: the static minimap is repainted on toggle without hidden buildings.
- **Delivery:** Ctrl+Y is refused during a delivery shift. A shift that starts while 1952 is on switches back to today first (the addresses are today's houses).
- **Switching back to today while inside a reappearing building:** the player is moved to the nearest drivable road point, exactly as a <kbd>J</kbd> jump does.

## Review Focus

1. **Switch back to today while standing where a modern building reappears** → the player is placed on the nearest road, not trapped inside (Task 4 test).
2. **Style switch (<kbd>T</kbd>) while 1952 is on** → the modern meshes get the new style's materials and stay hidden; switching back shows them in the right style (Task 4 test).
3. **Helicopter and camera over a hidden building** → `heliFloor` and the camera's wall check ignore `off` boxes (Task 3 node test for `heliFloor`; Task 4 asserts the camera loop skips `off`).
4. **Ctrl+Y in a world without a 1952 layer** (Ehrendingen, the hand layout) → a short notice, nothing else changes (Task 3 node test of `eraAvailable`; Task 4 test on the no-world page if the existing fixtures allow it).
5. **German-side buildings** → never flagged, even right at the Rhine (Task 2 test).

---

### Task 1: `gwr_ch.py` — fetch the register extract (offline-testable)

**Files:**
- Create: `pipeline/gwr_ch.py`
- Test: `pipeline/tests/test_gwr_ch.py`

**Interfaces:**
- Produces: `parse(lines: Iterable[str], lv95_box: tuple[float, float, float, float]) -> list[dict]`. It reads the tab-separated CSV text (header first) and keeps rows with `GSTAT == "1004"` and coordinates inside the box. Each item is `{"egid": int, "E": float, "N": float, "year": int | None, "period": int | None}`.
- Produces: `fetch(bbox, out, session=None, zip_path=None) -> int`. It skips when `out` exists, like `fields_ch.fetch`. Otherwise it downloads `ag.zip` (or uses `zip_path`), streams the member through `parse` with `fields_ch.lv95_bbox(bbox)`, and writes `{"source": "GWR © BFS", "rows": [...]}` atomically via `.part`. Returns the row count.
- CLI: `python gwr_ch.py fetch --out cache/gwr/hochrhein.json [--bbox W S E N] [--zip PATH]`.

- [ ] **Step 1: Write the failing tests** (`test_gwr_ch.py`):
  - `test_parse_keeps_existing_rows_inside_the_box`: three rows inside the box, with statuses 1004, 1004 and 1007, plus one 1004 row outside it. Expect 2 items, with the right `egid`/`E`/`N`.
  - `test_parse_reads_year_and_period_or_none`: `GBAUJ=""`, `GBAUP="8012"` → `year is None`, `period == 8012`; `GBAUJ="1931"` → `year == 1931`.
  - `test_fetch_reads_a_zip_and_writes_json(tmp_path)`: build an in-memory zip holding `gebaeude_batiment_edificio.csv`, and serve it from a fake session whose `get(...).content` returns the bytes. Expect the file to be written, the return value to equal the row count, and a second call not to touch the session.
- [ ] **Step 2: Run, expect FAIL**: `cd pipeline && $PY -m pytest tests/test_gwr_ch.py -v` (no module).
- [ ] **Step 3: Implement `pipeline/gwr_ch.py`.** Use a module docstring in the style of `fields_ch.py`: what, attribution, how to run. Use `zipfile` + `io.TextIOWrapper(..., encoding="utf-8")` + `csv.DictReader(delimiter="\t")`. Stream it, and never extract the 55 MB file to disk. Use `requests` with `timeout=600`.
- [ ] **Step 4: Run, expect PASS.** Then fetch the real data with the copy that is already downloaded: `$PY gwr_ch.py fetch --out cache/gwr/hochrhein.json --zip /tmp/claude-1000/-home-freax-repos-github-freaxnx01-public-game-rhyflitzer--worktrees-sisseln/2572d954-92e3-4cfa-b75a-24abd59b382c/scratchpad/gwr/ag.zip`. Run it under the memory cap. Expected: a few thousand rows. `cache/` is gitignored, so check that `git status` stays clean of it.
- [ ] **Step 5: Commit** `feat(pipeline): fetch GWR building ages for the Hochrhein (#530)`

### Task 2: `era_1952.py` — flag modern buildings in the world file

**Files:**
- Create: `pipeline/era_1952.py`
- Modify: `data/world_hochrhein.json` (output of the real run), `CREDITS.md`, `data/README.md`, `docs/02-data-sources.md`, `docs/11-pipeline-osm.md` (one paragraph next to the fields one)
- Test: `pipeline/tests/test_era_1952.py`

**Interfaces:**
- Consumes: Task 1's JSON (`rows` with `E`, `N`, `year`, `period`).
- Produces: `classify(buildings: list[dict], gwr_xz: list[tuple[float, float, int | None, int | None]], swiss: shapely.Polygon, cutoff: int = 1952) -> dict[int, str]`. It maps building id to `"old" | "modern" | "de"`. `gwr_xz` holds game-frame points, `swiss` is the CH outline in the game frame, and the rules are those under "Rulings in this plan". Constants: `MATCH_PAD = 2.0` (m buffer around the footprint), `SHED_AREA = 60.0` (m²), `NEIGHBOUR_R = 30.0` (m).
- Produces: `apply(world: dict, gwr_rows: list[dict], outline_lv95: shapely.Polygon) -> dict`, the retrofit. It sets `b["modern"] = True` on modern buildings and removes a stale `modern` from the others. It sets `world["era"] = {"year": 1952}`, inserted directly after `"sources"`. It appends `"Building ages: GWR © BFS"` to `sources` once. It returns counts per class.
- CLI: `python era_1952.py --world ../data/world_hochrhein.json --gwr cache/gwr/hochrhein.json`. It reads `ch_outline.geojson`, converts the outline with `geo.Frame(origin).lv95_to_game`, and writes like `osm.write_world`.
- World file contract for Tasks 3–5: `world.era` exists iff the layer is available, and `building.modern === true` means hidden in 1952.

- [ ] **Step 1: Write the failing tests**, on synthetic squares and points in the game frame:
  - `test_register_year_decides`: one footprint with a point of year 1931 → `old`; with year 1975 → `modern`; with year 1952 → `old`; with year 1953 → `modern`.
  - `test_period_without_year`: period 8011 or 8012 → `old`; 8013 alone → undecided, so the neighbour rule applies.
  - `test_any_old_point_wins`: one footprint with years 1980 and 1900 → `old`.
  - `test_undecided_keeps_with_all_old_neighbours`: an unmatched 100 m² house 15 m from two old houses → `old`. Add one modern neighbour within 30 m → `modern`. No decided neighbour → `modern`.
  - `test_unmatched_shed_and_industrial_are_modern`: an unmatched 40 m² shed between old houses → `modern`. An unmatched `palette: "industrial"` hall → `modern`.
  - `test_german_side_untouched`: a footprint whose centroid is outside `swiss`, even 5 m from the border and with no match → `de`. `apply` never sets `modern` on it.
  - `test_apply_is_idempotent_and_keeps_the_rest`: run `apply` twice on a small world dict. The output is identical, `sources` holds the GWR line once, `era` comes right after `sources`, and the unrelated keys are unchanged.
- [ ] **Step 2: Run, expect FAIL**: `$PY -m pytest tests/test_era_1952.py -v`.
- [ ] **Step 3: Implement** with an `STRtree` over the points (`predicate="contains"` on the footprint buffered by `MATCH_PAD`) and one over the footprints for the neighbour rule. Neighbours are decided buildings whose footprint intersects a `NEIGHBOUR_R` circle around the centroid; decided means `old` or `modern` before the undecided pass.
- [ ] **Step 4: Run** the tests and the whole pipeline suite (`$PY -m pytest -q`), expect PASS. Then run the real retrofit under the memory cap and record its counts in the commit body. Expected order of magnitude: old ≈ 500, modern ≈ 1480, de ≈ 1190. Check that `git diff --stat data/world_hochrhein.json` is a single file, and that `node --test tests/*.test.mjs` is still green.
- [ ] **Step 5: Attribution** in `CREDITS.md`, `data/README.md` and `docs/02-data-sources.md`, following the field-data entries: "Gebäude- und Wohnungsregister (GWR) © BFS, Open Data (freie Nutzung, Quellenangabe Pflicht)". Before writing it, verify the terms on opendata.swiss / the BFS page; if they differ, use the real wording and report it.
- [ ] **Step 6: Commit** `feat(pipeline): flag buildings newer than 1952 from the GWR register (#530)`

### Task 3: pure JS — key, availability, exemptions, flags on plates and entries, heli floor

**Files:**
- Create: `timelayer.js`
- Modify: `world.js` (`plate()` output, around line 596), `landmarks.js` (`landmarkEntries`), `enterables.js` (`enterableEntries`), `heli.js` (`heliFloor`), `strings.js`
- Test: `tests/timelayer.test.mjs`; extend the existing `tests/heli*.test.mjs`, `tests/landmarks*.test.mjs` and `tests/enterables*.test.mjs` if they exist (otherwise put the cases in `timelayer.test.mjs`).

**Interfaces:**
- Produces in `timelayer.js`:
  - `isEraKey(e): boolean`: `!!e.ctrlKey && (e.key || '').toLowerCase() === 'y'`.
  - `eraAvailable(world): boolean`: `!!(world && world.era)`.
  - `clearExempt(buildings, keep: (b) => boolean): number`, a command. It deletes `modern` from every building where `keep(b)` holds and returns how many.
  - `eraShown(entry, on): boolean`: `!(on && entry.modern)`.
- Produces: plates from `world.js` carry `modern: true` when their building is modern. Entries from `landmarkEntries` / `enterableEntries` carry `modern: true` when their source building (by OSM id) is modern.
- Produces: `heliFloor` skips boxes with `o.off`.
- Strings, in `en` / `de`:
  - `eraOn`: `'1952 · Ctrl+Y for today'` / `'1952 · Ctrl+Y für heute'`
  - `eraOff`: `'Today'` / `'Heute'`
  - `eraNone`: `'This world has no 1952 view'` / `'In dieser Welt gibt es kein 1952'`
  - `eraNoDelivery`: `'Not during a delivery'` / `'Nicht während einer Lieferung'`
  - `keyEra`: `'the villages as they stood in 1952, and back'` / `'die Dörfer wie 1952, und zurück'`
  - `aboutGwr`: `'Building ages: Federal Register of Buildings and Dwellings (GWR) © BFS (free use, attribution required)'` / `'Baujahre: Gebäude- und Wohnungsregister (GWR) © BFS (freie Nutzung, Quellenangabe Pflicht)'`

- [ ] **Step 1: Write the failing tests:**
  - `isEraKey`: `{key:'y', ctrlKey:true}` → true; `{key:'Y', ctrlKey:true}` → true; `{key:'y', ctrlKey:false}` → false; `{key:'z', code:'KeyY', ctrlKey:true}` (a US key on QWERTZ) → false.
  - `eraAvailable`: `{era:{year:1952}}` → true; `{}`, `null` → false.
  - `clearExempt`: three buildings, two modern, `keep` true for one modern building → returns 1, and that building no longer has `modern`.
  - `eraShown`: `({modern:true}, true)` → false; `({modern:true}, false)` → true; `({}, true)` → true.
  - plates: a modern building with an `addr` → its plate has `modern: true`; an old one has no `modern`.
  - `landmarkEntries` / `enterableEntries`: an item sourced from a modern building id → entry `modern: true`.
  - `heliFloor`: a 30 m box under the rotor gives a floor of 30 + clearance; the same box with `off: true` gives ground + clearance.
  - strings: all six keys exist in `en` and `de` (`translate(lang, k) !== k`), and `eraOn` contains `Ctrl+Y` in both.
- [ ] **Step 2: Run, expect FAIL**: `node --test tests/timelayer.test.mjs` plus the touched test files.
- [ ] **Step 3: Implement.** `timelayer.js` starts with a `// #530: …` header and is pure: no DOM, no three.js.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs`, expect PASS, all green.
- [ ] **Step 5: Commit** `feat(era): 1952 helpers, flags on plates and jump entries, strings (#530)`

### Task 4: the layer in the game — split meshes, toggle, colliders, safety

**Files:**
- Modify: `index.html`. Touch points:
  - import line (next to `isMonoKey`)
  - `push()` (~line 1677) and `pushOBB()` (~line 1808)
  - the building loop (~line 2832)
  - the merge loop (~line 3123)
  - `applyStyle()` (~line 3703)
  - the keydown hook (next to `isMonoKey`)
  - `toggleEra()` next to `toggleMono()`
  - the camera wall loop (~line 5703: skip `o.off`)
  - the shift start in the delivery code
  - the help row after Ctrl·B
  - a `window.__mm.era` hook
- Test: `tests/test_era_toggle.py` (model: `tests/test_mono_toggle.py`, but with the Hochrhein world loaded the way the OSM tests in `tests/` do it).

**Interfaces:**
- Consumes: `isEraKey`, `eraAvailable`, `clearExempt` (Task 3); `building.modern`, `world.era` (Task 2).
- Produces:
  - `const ERA = { on: false, group: THREE.Group, solids: [], mesh: {} }`
  - `function toggleEra()`, a command
  - `window.__mm.era = () => ({ available, on, solids: ERA.solids.length, off: <count of solids with off>, visible: ERA.group.visible, sample: [x, z] of the first solid or null, materials: <role → material.uuid of ERA.mesh> })`
- Behaviour:
  - **At load**, before plates, jump entries and the building loop: `clearExempt(L.buildings, b => isRowHouse(b) || isBodenacker6(b) || CH_LM_BY_OSM.has(b.id))`.
  - **Building loop**: for a modern building, set a module flag so `push()` collects into `partsModern` and `pushOBB()` tags `o.modern = true` and adds `o` to `ERA.solids`; reset the flag after the building. No other change to `osmBuilding`.
  - **Merge**: `partsModern` merges per role like `parts`, with the same `castShadow` / `receiveShadow` / `renderOrder` rules. Each mesh goes into `ERA.group` (added to the scene) and into `ERA.mesh[role]`. `applyStyle` gives `ERA.mesh` the same material and polygon offset as `MESH`.
  - **`toggleEra()`**:
    - Not available → `toast(tr('eraNone'))`, stop.
    - `deliveryActive()` → `toast(tr('eraNoDelivery'))`, stop.
    - Otherwise flip `ERA.on`, set `ERA.group.visible = !ERA.on`, set `o.off = ERA.on` for every solid, repaint the minimap (Task 5 provides `paintMapStatic()`; until then, no-op), and toast `eraOn` / `eraOff`.
    - When turning off: if `(P.x, P.z)` lies inside a solid (oriented-box test with `hw`/`hd`/`c`/`s`; for a `ring` solid, the point-in-ring test the colliders already use), relocate with `placeOnRoad` at `nearestJumpable(P.x, P.z)`, keeping the current heading.
  - **Shift start**: if `ERA.on`, call `toggleEra()` first.

- [ ] **Step 1: Write the failing tests** (`test_era_toggle.py`):
  - `test_ctrl_y_hides_newer_buildings_and_back`. Load the world and read `__mm.era()`: available, off, with `solids > 1000`, `off == 0`, visible. Press `Control+y`: `on`, `off == solids`, not visible, and the toast contains `Ctrl+Y`. The borders state (whatever `__mm` exposes for `HUD.borders`; add `__mm.borders()` only if nothing exists) is unchanged. Press again: everything is back. Expect no errors.
  - `test_switching_back_inside_a_building_moves_the_player`. Turn the layer on, set the car to `sample` (through the existing debug teleport / `__mm` hook the OSM tests use), turn the layer off, and assert the player is no longer inside that solid, i.e. its distance from `sample` exceeds the solid's half-diagonal.
  - `test_style_switch_keeps_the_layer`. Turn the layer on and press `T`: still not visible, and `materials` changed to the new style's. Turn it off: visible.
  - `test_camera_skips_off_solids` is optional, if a camera hook exists. Otherwise the reviewer checks the `o.off` guard in the camera loop by reading it.
- [ ] **Step 2: Run, expect FAIL**: `python3 -m pytest tests/test_era_toggle.py -v`.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `python3 -m pytest tests/test_era_toggle.py tests/test_mono_toggle.py -v` and `node --test tests/*.test.mjs`, expect PASS. Also run one existing OSM building test (`grep -l "buildings" tests/test_*.py`, pick the smallest) to confirm the colours and counts did not change.
- [ ] **Step 5: Commit** `feat(era): Ctrl+Y shows the villages as in 1952 (#530)`

### Task 5: what points at hidden buildings — plates, J list, entrances, minimap, About

**Files:**
- Modify: `index.html`. Touch points:
  - the label pick (~line 2927): skip `eraShown(it, ERA.on) === false`
  - the jump-list rendering: filter entries with `eraShown`
  - the enterable lookup: an entrance of a `modern` entry is not offered while on
  - the static minimap block (~line 7237): turn it into `function paintMapStatic()`, called once where the block stood and from `toggleEra()`, and skip solids with `o.modern && o.off`
  - `__mm.mapBoxes`: count only boxes that are painted
  - the About tab: an `aboutGwr` line after `aboutAgis`, with a `data-link` to the GWR page, following how `agis` is wired
- Test: extend `tests/test_era_toggle.py`.

**Interfaces:**
- Consumes: `eraShown` (Task 3), `ERA`, `toggleEra` (Task 4).
- Produces: `function paintMapStatic()`, a command.

- [ ] **Step 1: Write the failing test** `test_hidden_buildings_leave_map_plates_and_jumps`. With the layer on:
  - `__mm.mapBoxes()` drops by at least 1000.
  - `__mm.plateSpots(t)` for a plate number known to sit on a modern building returns `[]`. Pick it in the test from the world JSON: the first building with `modern` and `addr`.
  - The J list (whatever `__mm` exposes; add `__mm.jumpNames()` only if nothing exists) contains no entry with `modern`.

  With the layer off, all three are back to their earlier values. The About tab contains "GWR".
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `python3 -m pytest tests/test_era_toggle.py -v` and `node --test tests/*.test.mjs`, expect PASS.
- [ ] **Step 5: Commit** `feat(era): hidden buildings leave the minimap, plates and jump list (#530)`

### Task 6: help, changelog, PR

**Files:** Modify `index.html` (help row, if Task 4 did not add it), `CHANGELOG.md`.

- [ ] **Step 1:** Add the help row `<kbd data-cmd="ctrl+KeyY">Ctrl · Y</kbd><span data-i18n="keyEra">…</span>` after the Ctrl·B row, if Task 4 did not already add it. Add a test assertion to `test_era_toggle.py` that the help contains `keyEra`.
- [ ] **Step 2:** Add the `CHANGELOG.md` entry under `[Unreleased]` / Added, newest first, with `TZ=Europe/Zurich date '+%F %H:%M'`, in German:
  `` `<ts>` <kbd>Ctrl</kbd> <kbd>Y</kbd> zeigt die Dörfer auf der Schweizer Seite wie **1952**: Häuser, die erst später gebaut wurden, verschwinden (laut **Gebäuderegister** des Bundes); nochmals drücken bringt **heute** zurück. Mit <kbd>Ctrl</kbd> <kbd>B</kbd> dazu sieht es aus wie ein altes Foto. ``
- [ ] **Step 3:** `node --test tests/*.test.mjs` and `python3 -m pytest tests/test_era_toggle.py tests/test_mono_toggle.py -v`, all PASS.
- [ ] **Step 4: Commit** `docs(changelog): Sisseln 1952 buildings (#530)`. Push and PR are left to the controller: base `issue-530-sisseln-1952` until PR#1004 merges, title `feat(era): Ctrl+Y shows the villages as in 1952`, body "Part of #530".
