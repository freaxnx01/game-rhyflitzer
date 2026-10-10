# Region south to Flugplatz Schupfart (#47) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Hochrhein south edge from 47.532 to 47.500 N so Flugplatz Schupfart is on the map and a **J** target under a new *Schupfart* chip. Swiss data only: no DGM1, no west/east change.

**Spec:** `docs/superpowers/specs/2026-10-10-region-south-schupfart-design.md`.

**Architecture:** The region stays one rectangle, `geo.DEFAULT_BBOX`; the old one is kept as `geo.CORE_BBOX` so the golden tests keep guarding the old area with unchanged numbers. Tasks 1–6 are code, tests and docs and are pushed before any data work. Tasks 7–10 regenerate `data/terrain_hochrhein.mmh` and `data/world_hochrhein.json`; they need the local caches on agent-dev and the extract a human cut on odroid-plus-pve. Each data task is guarded and stops cleanly when a precondition is missing. **Implement locally on agent-dev, not via the `ai-implement` pipeline** (spec A8).

**Tech stack:** Python 3 (pyosmium, shapely, rasterio, pyproj, numpy, pytest) in `pipeline/`; vanilla JS ES modules in `prototype/`; Node `node:test`; Playwright (pytest).

## Global constraints

- **Memory:** every pipeline command that reads an extract, a raster or builds the world runs as `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`. Exit 137 = the cap was hit: **never raise the cap**; run that step in the odroid LXC instead (copy `pipeline/`, `cache/`, `data/`).
- **Never run `osmium extract` (or `osm.py cut`, or `osm_cut.py`) on agent-dev or a CI runner** on a country file. The cut is the human step H1 below.
- **Never hand-edit** `data/world_hochrhein.json` or `data/terrain_hochrhein.mmh`.
- **Playwright runs in the foreground.** Never `run_in_background`; give the call a long timeout. Run only the suites named in a step, except Task 10 Step 6 (the whole browser suite once on the rebuilt data).
- **Tests:** never weaken an existing assertion. The only test edits allowed are the ones named here: the `CORE_BBOX` switch, the grid/pad pins, the J counts and chips, the `VILLAGES` count and bounds.
- **Branch:** `feature/47-region-south`. PR title `feat(pipeline): extend the region south to Flugplatz Schupfart (#47)`, body `Closes #47`.
- **Paths:** `cd pipeline` commands use `./.venv/bin/python`. The caches live in the **main checkout's** `pipeline/cache/`; in a worktree, symlink it: `ln -s /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/cache pipeline/cache` (and `pipeline/.venv` likewise).
- **Parallel work:** before Task 5, count `LANDMARK_INFO` entries and the `ALL_ROWS` formula on `main`. Every J number below is "main + 1"; use main's numbers if they moved.

## Human prerequisite H1 — the OSM cut on odroid-plus-pve

Done by a human **before** the data tasks (7–10); Tasks 1–6 do not need it.

1. Print the commands (cheap, anywhere; the folder must hold **only** the two cached country files, symlinked):

```bash
cd pipeline   # in the main checkout
mkdir -p /tmp/countries && ln -sf $PWD/cache/osm/switzerland-latest.osm.pbf $PWD/cache/osm/freiburg-regbez-latest.osm.pbf /tmp/countries/
./.venv/bin/python osm.py cut --pbf-dir /tmp/countries --out hochrhein-south.osm.pbf --bbox 7.905 47.500 8.030 47.572 --dry-run
```

2. Copy the two **cached 2026-09-28** files (not fresh Geofabrik downloads, spec A3) into a throwaway LXC on odroid-plus-pve with osmium-tool, run the printed `osmium extract … -s smart` ×2 and `osmium merge`. Expected: peak ~3.6 GB, result ~5–8 MB.
3. Copy the result back to `pipeline/cache/osm/hochrhein-south.osm.pbf` in the main checkout. Do not overwrite `hochrhein.osm.pbf` (Task 8 does that).

## File structure

| File | Change |
|---|---|
| `pipeline/geo.py` | `DEFAULT_BBOX` S → 47.500; new `CORE_BBOX` (old box) |
| `pipeline/terrain.py` | default `--step 8`, docstring usage |
| `pipeline/anchors.json` | `flugplatzSchupfart` landmark, `SCHUPFART` label |
| `pipeline/tests/test_geo_mmh.py`, `test_cut.py` | grid and pad pins for both boxes |
| `pipeline/tests/test_terrain.py` | **new**: default step |
| `pipeline/tests/test_anchors.py` | the airfield anchor lands in the strip |
| `pipeline/tests/test_golden.py` | core fixtures on `CORE_BBOX`; new `world_south` tests |
| `prototype/landmarks.js`, `prototype/tests/landmarks.test.mjs` | Schupfart chip + entry |
| `prototype/tests/test_jump.py` | counts and chips keyed on the served world |
| `prototype/world.js`, `prototype/tests/world.test.mjs` | six village names |
| `docs/08-pipeline-terrain.md`, `docs/11-pipeline-osm.md` | region, step, the south cut |
| `CHANGELOG.md`, `test-todo.md` | player-facing entry, playtests |
| `data/terrain_hochrhein.mmh`, `data/world_hochrhein.json` | regenerated in Tasks 9–10 only |

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Branch from a fresh main**

```bash
git fetch origin && git checkout -b feature/47-region-south origin/main
```

- [ ] **Step 2: Check #19 did not land first.** `grep -n "DEFAULT_BBOX\|CORE_BBOX" pipeline/geo.py`. If `CORE_BBOX` already exists (#19/#44 landed), keep its W/E edges, set only S to 47.500, skip the `CORE_BBOX` line of Task 1 and recompute the Task 1 grid numbers with `geo.grid_for`. Say so in the PR.

---

### Task 1: Region constants

**Files:**
- Modify: `pipeline/geo.py:14`
- Test: `pipeline/tests/test_geo_mmh.py`, `pipeline/tests/test_cut.py`

**Interfaces:**
- Produces: `geo.CORE_BBOX = (7.905, 47.532, 8.030, 47.572)` and `geo.DEFAULT_BBOX = (7.905, 47.500, 8.030, 47.572)`, lon/lat (W, S, E, N).

- [ ] **Step 1: Write the failing tests.** In `pipeline/tests/test_geo_mmh.py`, replace `test_grid_for_default_matches_existing_mmh` and `test_pad_bbox_two_km` with:

```python
def test_grid_for_core_matches_the_first_mmh():
    """The pre-#47 region (CORE_BBOX) at 4 m is the grid of the first published .mmh."""
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    g = geo.grid_for(geo.CORE_BBOX, f, 4.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (2362, 1130, -4692.0, -2416.0)


def test_grid_for_region_south_to_schupfart():
    """#47: south edge 47.500 at the 8 m terrain step."""
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    g = geo.grid_for(geo.DEFAULT_BBOX, f, 8.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (1186, 1010, -4696.0, -2416.0)


def test_region_contains_the_core_and_the_airfield():
    w, s, e, n = geo.DEFAULT_BBOX
    assert (w, e, n) == (geo.CORE_BBOX[0], geo.CORE_BBOX[2], geo.CORE_BBOX[3])   # only the south edge moved
    assert s == 47.500 and s < geo.CORE_BBOX[1]
    for lon, lat in [(7.9458, 47.5079), (7.9541, 47.5102)]:                      # Flugplatz Schupfart r2782819 bounds
        assert w < lon < e and s < lat < n


def test_pad_bbox_two_km():
    w, s, e, n = geo.pad_bbox(geo.DEFAULT_BBOX, 2000)
    assert w < 7.905 - 0.025 and e > 8.030 + 0.025
    assert s < 47.500 - 0.017 and n > 47.572 + 0.017
```

In `pipeline/tests/test_cut.py`, replace the bounds line in the loop:

```python
        assert w < 7.905 and e > 8.030 and s < 47.500 and n > 47.572
```

- [ ] **Step 2: Watch them fail**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_geo_mmh.py tests/test_cut.py -q
```

Expected: FAIL (`geo` has no `CORE_BBOX`; the cut box stops at 47.514).

- [ ] **Step 3: Implement.** In `pipeline/geo.py` replace line 14:

```python
CORE_BBOX = (7.905, 47.532, 8.030, 47.572)      # lon/lat: the first region, Bad Saeckingen west ... east of Sisseln
DEFAULT_BBOX = (7.905, 47.500, 8.030, 47.572)   # #47: the same, south up the Tafeljura to Flugplatz Schupfart
```

- [ ] **Step 4: Run the pipeline suite**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q -rs
```

Expected: the new tests pass. `test_golden.py` fails on counts or is skipped (it still uses `DEFAULT_BBOX`); Task 4 fixes it — do not touch it yet. Everything else passes.

- [ ] **Step 5: Commit**

```bash
git add pipeline/geo.py pipeline/tests/test_geo_mmh.py pipeline/tests/test_cut.py
git commit -m "feat(pipeline): move the region's south edge to Flugplatz Schupfart (#47)"
```

---

### Task 2: Terrain default step 8 m

**Files:**
- Modify: `pipeline/terrain.py` (`--step` default and help, docstring usage line)
- Create: `pipeline/tests/test_terrain.py`

- [ ] **Step 1: Write the failing test.** Create `pipeline/tests/test_terrain.py`:

```python
import numpy as np

import terrain


def test_default_step_is_8_m(monkeypatch, tmp_path):
    """#47 (spec D2 of the region extension): the game draws a 16 m mesh; 8 m keeps the .mmh inside 13 MB."""
    seen = {}

    def fake_build(bbox, origin, step, base, cache, dgm_dir):
        seen["step"] = step
        return {"w": 1, "h": 1}, np.zeros((1, 1), np.float32)

    monkeypatch.setattr(terrain, "build", fake_build)
    monkeypatch.setattr(terrain, "write_mmh", lambda path, header, heights: None)
    assert terrain.main(["--out", str(tmp_path / "x.mmh")]) == 0
    assert seen["step"] == 8.0
```

- [ ] **Step 2: Watch it fail**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_terrain.py -q
```

Expected: FAIL, `assert 4.0 == 8.0`.

- [ ] **Step 3: Implement.** In `terrain.main`:

```python
    ap.add_argument("--step", type=float, default=8.0, help="grid spacing in metres (default 8; the game draws a 16 m mesh)")
```

In the module docstring change `--step 4` to `--step 8`. `region.STEP` (generated worlds, 4 m) stays as it is.

- [ ] **Step 4: Run the pipeline suite** (Task 1 Step 4 command). Expected: as after Task 1, plus `test_terrain.py` green.

- [ ] **Step 5: Commit**

```bash
git add pipeline/terrain.py pipeline/tests/test_terrain.py
git commit -m "feat(pipeline): 8 m terrain grid by default (#47)"
```

---

### Task 3: Airfield anchor and label

**Files:**
- Modify: `pipeline/anchors.json`
- Test: `pipeline/tests/test_anchors.py`

**Interfaces:**
- Produces: `anchors.landmarks.flugplatzSchupfart` (kind `poi`, position only; the prototype draws models by key and ignores it) and the label `SCHUPFART`.

- [ ] **Step 1: Write the failing test.** Append to `pipeline/tests/test_anchors.py`:

```python
def test_repo_anchors_place_flugplatz_schupfart_in_the_south_strip():
    """#47: the airfield is a lon/lat anchor (aeroway is no area key) inside the new strip, south of the old edge."""
    spec = anchors.load(Path(__file__).parents[1] / "anchors.json")
    e = spec["landmarks"]["flugplatzSchupfart"]
    assert e["lonlat"] == [7.9505, 47.5090] and e["kind"] == "poi"
    r = anchors.resolve({"landmarks": {"f": e}}, OsmData(), F)["landmarks"]["f"]
    _, old_edge = F.to_game(geo.CORE_BBOX[2], geo.CORE_BBOX[1])
    _, new_edge = F.to_game(geo.DEFAULT_BBOX[2], geo.DEFAULT_BBOX[1])
    assert old_edge < r["z"] < new_edge and -1300 < r["x"] < -1150, r
    assert any(lb["t"] == "SCHUPFART" for lb in spec["labels"])
```

- [ ] **Step 2: Watch it fail**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_anchors.py -q
```

Expected: FAIL with `KeyError: 'flugplatzSchupfart'`. If `OsmData()` needs arguments, build it the way the other tests in this file do.

- [ ] **Step 3: Implement.** In `pipeline/anchors.json` add after `"jumpRamp"` (comma after the `jumpRamp` line):

```json
    "flugplatzSchupfart": { "lonlat": [7.9505, 47.5090], "kind": "poi", "src": "#47: Flugplatz Schupfart (LSZI, OSM r2782819, Gemeinde Schupfart): centroid of the aerodrome; lon/lat because aeroway is no area key in osm_read" }
```

and at the end of `"labels"` (place node `n240030566`):

```json
    { "t": "HOLZBRÜCKE", "game": [-1143, -70] },
    { "t": "SCHUPFART", "lonlat": [7.96578, 47.51455] }
```

- [ ] **Step 4: Run the pipeline suite** (Task 1 Step 4). Expected: `test_anchors.py` green, nothing else changes.

- [ ] **Step 5: Commit**

```bash
git add pipeline/anchors.json pipeline/tests/test_anchors.py
git commit -m "feat(pipeline): Flugplatz Schupfart anchor and label (#47)"
```

---

### Task 4: Golden tests: core stays pinned, the south strip gets its own

**Files:**
- Modify: `pipeline/tests/test_golden.py`

**Interfaces:**
- Consumes: `CORE_BBOX` (Task 1), the anchor (Task 3).
- Produces: fixture `world_south` (skips until the extract covers the strip); `SOUTH_BUDGET = 12e6` bytes (D2).

- [ ] **Step 1: Switch the core fixtures.** Change **both** `osm.build_world(…, geo.DEFAULT_BBOX, …)` calls (fixtures `world`, `world_dsm`) to `geo.CORE_BBOX`. Change no assertion.

- [ ] **Step 2: Add the south tests** at the end of the file:

```python
ANCHORS = Path(__file__).parents[1] / "anchors.json"
SOUTH_NODES = {240030566, 191017638}   # place nodes Schupfart and Frick: only the #47 cut reaches them
SOUTH_BUDGET = 12e6                     # bytes, world JSON (spec D2)


def _extract_covers_the_south() -> bool:
    import osmium
    seen = {o.id for o in osmium.FileProcessor(str(PBF), osmium.osm.NODE) if o.id in SOUTH_NODES}
    return seen == SOUTH_NODES


@pytest.fixture(scope="module")
def world_south():
    if not _extract_covers_the_south():
        pytest.skip("extract predates the south extension (#47): human step H1 + plan Task 8")
    return osm.build_world(PBF, MMH if MMH.exists() else None, geo.DEFAULT_BBOX, geo.DEFAULT_ORIGIN,
                           30.0, 1000.0, ANCHORS)


def _clip():
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    xs, zs = f.to_game([geo.DEFAULT_BBOX[0], geo.DEFAULT_BBOX[2]], [geo.DEFAULT_BBOX[3], geo.DEFAULT_BBOX[1]])
    return float(xs[0]), float(zs[0]), float(xs[1]), float(zs[1])


def test_south_bbox_and_airfield_anchor(world_south):
    assert world_south["bbox"] == list(geo.DEFAULT_BBOX)
    a = world_south["anchors"]["landmarks"]["flugplatzSchupfart"]
    assert shapely.box(*_clip()).contains(shapely.Point(a["x"], a["z"]))
    assert any(lb["t"] == "SCHUPFART" for lb in world_south["anchors"]["labels"])


def test_south_has_roads_buildings_and_woods_in_the_strip(world_south):
    """Schupfart, Frick and Oeschgen are driveable; the Tafeljura woods continue south of the old edge (z ~ 2034)."""
    strip = shapely.box(-4689, 2100, 4777, _clip()[3])
    assert sum(1 for r in world_south["roads"] if any(strip.contains(shapely.Point(p)) for p in r["pts"])) > 150
    assert sum(1 for b in world_south["buildings"] if strip.contains(shapely.Point(b["ring"][0]))) > 200
    woods = sum(shapely.Polygon(p["ring"], p.get("holes", [])).intersection(strip).area for p in world_south["forests"])
    assert woods > 4e6, woods


def test_south_world_fits_the_budget(world_south, tmp_path):
    p = tmp_path / "w.json"
    osm.write_world(p, world_south)
    assert p.stat().st_size <= SOUTH_BUDGET, p.stat().st_size
```

- [ ] **Step 3: Run**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected with today's 3.7 MB extract: the core tests PASS with their numbers; the three `test_south_*` are SKIPPED ("extract predates…"). A core failure here is a regression from Tasks 1–3: fix the code, never the test.

- [ ] **Step 4: Commit**

```bash
git add pipeline/tests/test_golden.py
git commit -m "test(pipeline): pin golden numbers to the core region, add south-strip checks (#47)"
```

---

### Task 5: J list: Schupfart chip and the airfield

**Files:**
- Modify: `prototype/landmarks.js`
- Test: `prototype/tests/landmarks.test.mjs`, `prototype/tests/test_jump.py`

- [ ] **Step 1: Write the failing node test.** In `prototype/tests/landmarks.test.mjs`, in the test `LANDMARK_INFO holds the 14 landmarks of #41, …`: append `and Flugplatz Schupfart of #47` to its title, change `28` → `29` (main + 1) and the `GEMEINDEN` expectation to:

```js
  assert.deepEqual(GEMEINDEN, ['Bad Säckingen', 'Stein', 'Münchwilen', 'Schupfart', 'Eiken', 'Sisseln']);
```

Append a test:

```js
test('#47: Flugplatz Schupfart sits in its own Gemeinde, between Münchwilen and Eiken', () => {
  const e = landmarkEntries(LANDMARK_INFO, { flugplatzSchupfart: { x: -1219.4, z: 4633.6 } }, []);
  assert.deepEqual(e.find(x => x.n === 'Flugplatz Schupfart'), { n: 'Flugplatz Schupfart', g: 'Schupfart', x: -1219.4, z: 4633.6 });
  assert.deepEqual(gemeindenOf(e, GEMEINDEN), ['Bad Säckingen', 'Münchwilen', 'Schupfart', 'Eiken']);
  assert.deepEqual(filterLandmarks(e, 'flugplatz', null).map(x => x.n), ['Flugplatz Schupfart']);
});
```

If `gemeindenOf` on that input returns a different set because of the fixed `at:` points, keep the first and the last assertion and replace the middle one with `assert.ok(gemeindenOf(e, GEMEINDEN).includes('Schupfart'))` — never drop the entry check.

- [ ] **Step 2: Watch it fail**

```bash
node --test prototype/tests/*.test.mjs
```

Expected: FAIL (28 entries, old `GEMEINDEN`, no Flugplatz).

- [ ] **Step 3: Implement** in `prototype/landmarks.js`:

```js
export const GEMEINDEN = ['Bad Säckingen', 'Stein', 'Münchwilen', 'Schupfart', 'Eiken', 'Sisseln'];   // west → east
```

After the `Reservoir Hübel` entry:

```js
  { name: 'Flugplatz Schupfart', gemeinde: 'Schupfart', anchor: 'flugplatzSchupfart' },   // #47: LSZI on the Tafeljura (r2782819, Gemeinde Schupfart r1684421); J snaps to the nearest road
```

Update the comment above `LANDMARK_INFO` to `// Gemeinden verified against OpenStreetMap on 2026-10-02/03 (#41, #46, #81, #103) and 2026-10-10 (#47)`.

- [ ] **Step 4: Node tests green.** `node --test prototype/tests/*.test.mjs` — all pass.

- [ ] **Step 5: Key the browser counts on the served world.** In `prototype/tests/test_jump.py`, below the `WORLD103` lines add:

```python
WORLD47 = "flugplatzSchupfart" in _world_anchor_keys()  # world rebuilt for #47 (south to Schupfart)
needs_world47 = pytest.mark.skipif(not WORLD47, reason="world not rebuilt for #47 (Tasks 8-10 of docs/superpowers/plans/2026-10-10-region-south-schupfart.md)")
CHIPS = ["All", "Bad Säckingen", "Stein", "Münchwilen"] + (["Schupfart"] if WORLD47 else []) + ["Eiken", "Sisseln"]
```

Add `+ (1 if WORLD47 else 0)` to the `ALL_ROWS` expression (before `+ 3`). Replace the chips literal in `test_j_opens_the_landmark_list_with_focus_in_the_search_field` with `CHIPS`. Leave every other assertion alone. Append:

```python
@needs_world47
def test_flugplatz_schupfart_is_listed_and_jumpable(server):
    """#47: 'flugplatz' finds Flugplatz Schupfart under its own chip; Enter puts the car on the road nearest the airfield."""
    ax, az = anchor("flugplatzSchupfart")
    road = _jumpable_road_dist(ax, az)
    assert road < 300, road                      # a road runs past the airfield
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.click('#jumpchips button[data-g="Schupfart"]')
        assert rows(page) == [{"n": "Flugplatz Schupfart", "g": "Schupfart"}, {"n": "Random spot", "g": None}]
        page.click('#jumpchips button[data-g="All"]')
        page.keyboard.type("flugplatz")
        page.keyboard.press("Enter")
        c = car(page)
        assert math.hypot(c["x"] - ax, c["z"] - az) < road + 30
        b.close()
```

(`_jumpable_road_dist` is defined further down the file; Python resolves it at call time.)

- [ ] **Step 6: Run the J browser tests on main's world** (foreground; slow):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -rs
```

Expected: all pass with `WORLD47 == False`; `test_flugplatz_schupfart_is_listed_and_jumpable` SKIPPED.

- [ ] **Step 7: Commit**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs prototype/tests/test_jump.py
git commit -m "feat(prototype): Flugplatz Schupfart in the J list with a Schupfart chip (#47)"
```

---

### Task 6: Village names, docs, changelog, playtests, push

**Files:**
- Modify: `prototype/world.js`, `prototype/tests/world.test.mjs`, `docs/08-pipeline-terrain.md`, `docs/11-pipeline-osm.md`, `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: Failing village test.** In `prototype/tests/world.test.mjs`, test `VILLAGES: eight uppercase names inside the world, …`: title `fourteen …`, `8` → `14` (both lines), bounds line →

```js
    assert.ok(v.x > -4689 && v.x < 4777 && v.z > -2350 && v.z < 5592, v.t);   // the world's extent since #47
```

and append inside the test:

```js
  for (const t of ['EIKEN', 'OBERMUMPF', 'OESCHGEN', 'SCHUPFART', 'HELLIKON', 'FRICK']) assert.ok(VILLAGES.some(v => v.t === t), t);   // #47
```

`node --test prototype/tests/*.test.mjs` → FAIL (8 names).

- [ ] **Step 2: Implement.** In `prototype/world.js` add to `VILLAGES` after `WALLBACH` (place nodes via `geo.Frame(*DEFAULT_ORIGIN).to_game`, 2026-10-10):

```js
  { t: 'EIKEN', x: 1696.7, z: 2139.9, r: 450 },             // node 191017634 (#47: inside the map since the south extension)
  { t: 'OBERMUMPF', x: -2161.1, z: 2379.2, r: 450 },        // node 1420719124
  { t: 'OESCHGEN', x: 3788.0, z: 3471.4, r: 450 },          // node 240041868
  { t: 'SCHUPFART', x: -72.5, z: 4008.9, r: 450 },          // node 240030566
  { t: 'HELLIKON', x: -3143.1, z: 4582.4, r: 450 },         // node 1592994106
  { t: 'FRICK', x: 4040.8, z: 4762.6, r: 450 },             // node 191017638
```

Node tests green.

- [ ] **Step 3: docs/08.** "Default region" line → `7.905–8.030 E, 47.500–47.572 N (Bad Säckingen to east of Sisseln, south up to Flugplatz Schupfart), 8 m grid, about 9.4 × 8.0 km, about 5 MB`. Options line: `--step 8`. Keep the "German side stays flat" limit (#19 removes it).

- [ ] **Step 4: docs/11.** In "Run it": the current extract is the #47 cut, `--bbox 7.905 47.500 8.030 47.572` from the cached 2026-09-28 country files on odroid-plus-pve; the pre-#47 extract is kept as `cache/osm/hochrhein-core-2026-10-01.osm.pbf`, and only `hochrhein.osm.pbf` is current. Add `CORE_BBOX` to the `geo.py` bullet and `flugplatzSchupfart` to the Anchors paragraph.

- [ ] **Step 5: CHANGELOG.md**, under `[Unreleased]` → `### Added`:

```markdown
- The map reaches further south now, up onto the Tafeljura: Schupfart with its airfield, Frick, Oeschgen, Obermumpf and Hellikon are there to drive to, with their village names. **J** → `flugplatz` (or the new **Schupfart** chip) takes you to Flugplatz Schupfart.
```

- [ ] **Step 6: test-todo.md.** Append a `## Region south to Schupfart (#47)` block:
  - J → Flugplatz Schupfart: the car lands on a road by the airfield; are the hangars there?
  - drive from Eiken up to Schupfart and on to Frick: no seams or cliffs at the old edge (z ≈ 2034), the terrain climbs to the Tafeljura;
  - village names EIKEN, SCHUPFART, FRICK, … appear and fade like the others;
  - the open fields in the south have no lone trees (only the OSM woods) — acceptable?
  - Hold **Tab**: the whole taller map fits; minimap 1× still readable;
  - first load on a phone (time to the start button) and frame rate in Sisseln, compared with before.

- [ ] **Step 7: Full verification, then push**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q -rs
cd .. && node --test prototype/tests/*.test.mjs
git add prototype/world.js prototype/tests/world.test.mjs docs/08-pipeline-terrain.md docs/11-pipeline-osm.md CHANGELOG.md test-todo.md
git commit -m "docs(pipeline): document the south extension and its village names (#47)"
git fetch origin && git rebase origin/main
git push -u origin feature/47-region-south
```

Open the PR as a **draft** now (`Closes #47`, the D2 numbers from the spec).

---

### Task 7: Data preconditions (guarded)

**Files:** none.

- [ ] **Step 1**

```bash
cd pipeline
test -f cache/osm/hochrhein-south.osm.pbf && echo CUT-OK || echo "STOP: human step H1 (the odroid cut) not done"
test -f cache/osm/hochrhein.osm.pbf && echo OLD-OK || echo "STOP: current extract missing"
[ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] && echo DSM-OK || echo "STOP: swissSURFACE3D cache missing"
df -h . | tail -1   # need ~1 GB free for ~60 new swisstopo tiles
```

If any line prints `STOP`: do none of Tasks 8–10 and do not touch `data/`. Put in the PR: "Data not rebuilt: <which>. Code is complete; run human step H1 and Tasks 7–10 of docs/superpowers/plans/2026-10-10-region-south-schupfart.md locally." Mark the PR ready and stop.

---

### Task 8: Install the new extract

**Files:** `pipeline/cache/osm/hochrhein.osm.pbf` (local, git-ignored).

- [ ] **Step 1: Install, keeping the old one**

```bash
cd pipeline && mv cache/osm/hochrhein.osm.pbf cache/osm/hochrhein-core-2026-10-01.osm.pbf && cp cache/osm/hochrhein-south.osm.pbf cache/osm/hochrhein.osm.pbf
```

- [ ] **Step 2: Golden tests on the new extract** (core must PASS unchanged; `test_south_*` now RUN):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

- A core failure means the core's data changed: check H1 used the cached 2026-09-28 files. Do **not** edit numbers; restore the old extract and report.
- Exit 137: the build needs more than 2 GB — run Tasks 9–10 in the odroid LXC. Never raise the cap.
- `test_south_world_fits_the_budget` failing = D2 exceeded: STOP, report the size in the PR and on #47.
- A `test_south_has_…` threshold missed: print the measured count and report it; do not lower the threshold.

---

### Task 9: Terrain build at 8 m (guarded)

**Files:** `data/terrain_hochrhein.mmh`.

- [ ] **Step 1: Build** (downloads ~30 new swissALTI3D tiles):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python terrain.py --out ../data/terrain_hochrhein.mmh
```

- [ ] **Step 2: Check the header**

```bash
cd pipeline && ./.venv/bin/python -c "import mmh, os; h, a = mmh.read_mmh('../data/terrain_hochrhein.mmh'); print(h['w'], h['h'], h['step'], h['x0'], h['z0'], h['sources'], round(h['min'],1), round(h['max'],1), os.path.getsize('../data/terrain_hochrhein.mmh')/1e6, 'MB')"
```

Expected: `1186 1010 8.0 -4696.0 -2416.0`, sources `['swissALTI3D (c) swisstopo']`, `max` ≈ 250–400 (Tafeljura), size ≈ 4.8 MB (≤ 13 MB, D2). The build log's "no data" share should be about today's (the German side; no new holes in the south). Anything else: STOP, `git checkout -- ../data/terrain_hochrhein.mmh`, report.

- [ ] **Step 3: Real-terrain browser suites** (foreground; these load the real `.mmh`; the world is still main's):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_fridolinsbruecke.py ../prototype/tests/test_hideout.py ../prototype/tests/test_underpass.py ../prototype/tests/test_shadow.py ../prototype/tests/test_sound.py ../prototype/tests/test_wheels.py ../prototype/tests/test_region.py -q -rs
```

All must pass. If one fails, check it against main's terrain:

```bash
cp ../data/terrain_hochrhein.mmh /tmp/terrain-8m.mmh && git checkout origin/main -- ../data/terrain_hochrhein.mmh
# re-run only the failing test file, then put the 8 m file back:
cp /tmp/terrain-8m.mmh ../data/terrain_hochrhein.mmh
```

Passes on main, fails on 8 m → **STOP and ask the maintainer** (spec A2: the fallback is `--step 4`, 19.1 MB raw, over D2's 13 MB). Never change the test.

- [ ] **Step 4: Commit**

```bash
git add data/terrain_hochrhein.mmh
git commit -m "chore(data): terrain for the region south to Schupfart, 8 m grid (#47)"
```

---

### Task 10: World build, airfield check, performance (guarded)

**Files:** `data/world_hochrhein.json`; possibly `pipeline/anchors.json`.

- [ ] **Step 1: Golden tests against the new terrain** — Task 8 Step 2 command. All pass, none skipped except `world_dsm` if its cache is short.

- [ ] **Step 2: Build** (downloads ~30 new swissSURFACE3D tiles, ~400 MB):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

The log must not say `anchors: … not found`.

- [ ] **Step 3: Size guard**

```bash
ls -l ../data/world_hochrhein.json && gzip -c ../data/world_hochrhein.json | wc -c
```

Raw ≤ 12 MB (D2; expected 4.5–5.5 MB). Otherwise STOP, `git checkout -- ../data/world_hochrhein.json`, report both numbers.

- [ ] **Step 4: Airfield buildings.** Save as `/tmp/airfield_check.py` and run it capped (`systemd-run … ./.venv/bin/python /tmp/airfield_check.py` from `pipeline/`):

```python
import json, sys
import osmium, shapely
sys.path.insert(0, ".")
import geo

f = geo.Frame(*geo.DEFAULT_ORIGIN)
x0, z1 = f.to_game(7.9458, 47.5079)
x1, z0 = f.to_game(7.9541, 47.5102)
box = shapely.box(x0 - 50, z0 - 50, x1 + 50, z1 + 50)
world = {b["id"] for b in json.load(open("../data/world_hochrhein.json", encoding="utf-8"))["buildings"]}
for o in osmium.FileProcessor("cache/osm/hochrhein.osm.pbf").with_locations():
    if o.is_way() and "building" in o.tags:
        pts = [f.to_game(n.lon, n.lat) for n in o.nodes if n.location.valid()]
        if pts and box.contains(shapely.Point(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))):
            print(o.id, o.tags.get("building"), o.tags.get("name"), "IN WORLD" if o.id in world else "DROPPED")
```

Every `DROPPED` hangar or club building of the aerodrome goes into `keep_buildings` in `pipeline/anchors.json` as `"w<id>"`; then re-run Steps 2–3. Say so in the PR.

- [ ] **Step 5: Browser checks on the rebuilt world** (foreground; slow — the whole suite once, since the world file changed for every test):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q -rs
cd .. && node --test prototype/tests/*.test.mjs
```

All pass, and `test_flugplatz_schupfart_is_listed_and_jumpable` runs (not skipped). A test that fails here but passes on `main`: STOP and report; do not touch the test. A timeout on the bigger world: run the same test on `main`, record both times in the PR; do not raise timeouts silently.

- [ ] **Step 6: Performance numbers.** For this branch and `main`, one Playwright load each (foreground): seconds until `#startbtn` is ready, `window.__mm.physMs`, and the transferred bytes of the two data files (`page.on("response")`). Put them side by side in the PR.

- [ ] **Step 7: Commit and push**

```bash
git add data/world_hochrhein.json pipeline/anchors.json
git commit -m "chore(data): rebuild the world for the region south to Schupfart (#47)"
git fetch origin && git rebase origin/main
git push
```

If the rebase conflicts on `data/world_hochrhein.json` (another issue rebuilt it meanwhile): rebase, then re-run Steps 2–5 from this branch's pipeline. Never merge two world files by hand. Mark the PR ready for review.
