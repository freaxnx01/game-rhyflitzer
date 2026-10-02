# Region extension (Rheinfelden west, Schupfart south, Laufenburg east) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the map in one pipeline run to Rheinfelden/Feldschlösschen (#44), Flugplatz Schupfart (#47) and Laufenburg with bridge and customs post (#19). Add measured German terrain (LGL DGM1) and five new J-list jump targets.

**Spec:** `docs/superpowers/specs/2026-10-03-region-extension-design.md`. **Before dispatch, a human must confirm D1 (edges) and D2 (size budget, 8 m terrain).** If they change, edit the constants in Task 1 and the budget numbers in Task 4. Nothing else depends on them.

**Architecture:** The region stays one rectangle, `geo.DEFAULT_BBOX`. The old rectangle is kept as `geo.CORE_BBOX`, so the existing golden tests keep guarding the old area with unchanged numbers. Tasks 1–6 are code and docs: they run anywhere, CI included, and are pushed before any data work. Tasks 7–10 regenerate `data/terrain_hochrhein.mmh` and `data/world_hochrhein.json`. They need local caches, a human-downloaded DGM1 folder and one cut on odroid-plus-pve. Each is guarded and stops cleanly when a precondition is missing.

**Tech stack:** Python 3 (pyosmium, shapely, rasterio, pyproj, numpy, pytest) in `pipeline/`, vanilla JS ES modules in `prototype/`, Node `node:test`, Playwright (pytest).

## Global constraints

- **Memory:** every pipeline command that reads an extract, a raster or builds the world runs as `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`. Exit code 137 means the cap was hit: **do not raise the cap**. Move that step to odroid-plus-pve (Task 8 shows how), or shrink the input.
- **Never run `osmium extract` on agent-dev or on a CI runner.** The cut runs on odroid-plus-pve only (Task 8).
- **Never hand-edit** `data/world_hochrhein.json` or `data/terrain_hochrhein.mmh`. Never commit them from a machine without the caches.
- **Playwright runs in the foreground.** Never use `run_in_background`; give the call a long timeout instead.
- **Commit and push the branch before Task 7** (end of Task 6), so a run that stops in the data tasks leaves the code recoverable.
- **Branch:** `feature/19-region-extension`. The PR title is `feat(pipeline): extend the region west, south and east (#19, #44, #47)` and the body says `Closes #19`, `Closes #44`, `Closes #47`.
- **Tests:** never weaken an existing assertion to make it green. The only test edits allowed are the ones this plan names: the `CORE_BBOX` switch, the pins and the J counts.
- **Paths:** all `cd pipeline` commands use `./.venv/bin/python`. Without a venv: `python -m venv .venv && ./.venv/bin/pip install -r requirements.txt -r requirements-dev.txt`.

## File structure

| File | Change |
|---|---|
| `pipeline/geo.py` | `DEFAULT_BBOX` → D1 box; new `CORE_BBOX` (old box) |
| `pipeline/terrain.py` | default `--step 8`; `german_datasets` becomes a generator |
| `pipeline/anchors.json` | 4 landmarks, 1 industrial area, 3 labels |
| `pipeline/tests/test_geo_mmh.py` | pins for `CORE_BBOX` and `DEFAULT_BBOX` |
| `pipeline/tests/test_cut.py` | the padded box covers the new edges |
| `pipeline/tests/test_terrain.py` | **new**: lazy DGM, DGM fills the grid, default step |
| `pipeline/tests/test_anchors.py` | the real `anchors.json` parses with the new entries |
| `pipeline/tests/test_golden.py` | core fixtures on `CORE_BBOX`; new `world_region` tests |
| `prototype/landmarks.js` | 3 Gemeinden, 5 entries |
| `prototype/tests/landmarks.test.mjs` | new order and entries |
| `prototype/tests/test_jump.py` | counts keyed on the served world (`REGION`) |
| `docs/08-pipeline-terrain.md`, `docs/11-pipeline-osm.md`, `data/README.md` | region, DGM1, cut on odroid, step |
| `CHANGELOG.md`, `test-todo.md` | player-facing entry, playtest list |
| `data/terrain_hochrhein.mmh`, `data/world_hochrhein.json` | regenerated in Tasks 9–10 only |

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Branch from a fresh main**

```bash
git fetch origin && git checkout -b feature/19-region-extension origin/main
```

- [ ] **Step 2: Check the decisions were confirmed.** Read the bodies of #19, #44 and #47. If any of them still carries the `needs-human` label, or the Assumptions block still lists A1/A3 as open, comment on #19: "Region extension blocked: D1/D2 in the spec are not confirmed yet." Then stop without a PR.

- [ ] **Step 3: Note parallel work.** Check whether `prototype/landmarks.js` on `main` has more than 14 `LANDMARK_INFO` entries (for example #46 landed). If it does, every count in Task 5 is `<count on main> + 5` rows and `<chips on main> + 3` chips. Use those numbers instead of 19/20 below.

---

### Task 1: Region constants

**Files:**
- Modify: `pipeline/geo.py:15`
- Test: `pipeline/tests/test_geo_mmh.py`, `pipeline/tests/test_cut.py`

**Interfaces:**
- Produces: `geo.CORE_BBOX = (7.905, 47.532, 8.030, 47.572)` and `geo.DEFAULT_BBOX = (7.775, 47.500, 8.085, 47.572)`. Both are lon/lat tuples (W, S, E, N).

- [ ] **Step 1: Write the failing tests.** In `pipeline/tests/test_geo_mmh.py`, replace `test_grid_for_default_matches_existing_mmh` and `test_pad_bbox_two_km` with:

```python
def test_grid_for_core_matches_the_first_mmh():
    """The pre-#19 region (CORE_BBOX) at 4 m is the grid of the first published .mmh."""
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    g = geo.grid_for(geo.CORE_BBOX, f, 4.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (2362, 1130, -4692.0, -2416.0)


def test_grid_for_extended_region():
    """#19/#44/#47: Rheinfelden to Laufenburg, south to Schupfart, at the 8 m terrain step."""
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    g = geo.grid_for(geo.DEFAULT_BBOX, f, 8.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (2926, 1021, -14472.0, -2448.0)


def test_extended_region_contains_the_core_and_the_three_targets():
    w, s, e, n = geo.DEFAULT_BBOX
    cw, cs, ce, cn = geo.CORE_BBOX
    assert w <= cw and s <= cs and e >= ce and n >= cn
    for lon, lat in [(7.7845, 47.5470),    # Brauerei Feldschlösschen (#44)
                     (7.9505, 47.5090),    # Flugplatz Schupfart (#47)
                     (8.0761, 47.5628)]:   # Zollstation Laufenburg (#19)
        assert w < lon < e and s < lat < n


def test_pad_bbox_two_km():
    w, s, e, n = geo.pad_bbox(geo.DEFAULT_BBOX, 2000)
    assert w < 7.775 - 0.025 and e > 8.085 + 0.025
    assert s < 47.500 - 0.017 and n > 47.572 + 0.017
```

In `pipeline/tests/test_cut.py`, replace the bounds line inside the loop:

```python
        assert w < 7.775 and e > 8.085 and s < 47.500 and n > 47.572
```

- [ ] **Step 2: Watch them fail**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_geo_mmh.py tests/test_cut.py -q
```

Expected: FAIL. `geo` has no `CORE_BBOX`, and the cut box does not reach 7.775.

- [ ] **Step 3: Implement.** In `pipeline/geo.py` replace line 15:

```python
CORE_BBOX = (7.905, 47.532, 8.030, 47.572)      # lon/lat: the first region, Bad Saeckingen west ... east of Sisseln
DEFAULT_BBOX = (7.775, 47.500, 8.085, 47.572)   # #19/#44/#47: Rheinfelden (W) ... Laufenburg (E), south to Schupfart
```

- [ ] **Step 4: Run the whole pipeline suite**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q -rs
```

Expected: the new tests pass. `test_golden.py` is either skipped (no extract) or fails on counts, because it still uses `DEFAULT_BBOX`. Task 4 fixes that, so do not touch it yet. Every other test passes.

- [ ] **Step 5: Commit**

```bash
git add pipeline/geo.py pipeline/tests/test_geo_mmh.py pipeline/tests/test_cut.py
git commit -m "feat(pipeline): widen the default region to Rheinfelden, Schupfart and Laufenburg (#19, #44, #47)"
```

---

### Task 2: Terrain: 8 m default and one DGM1 tile at a time

**Files:**
- Modify: `pipeline/terrain.py` (`german_datasets`, the `--step` default, the module docstring's usage line)
- Create: `pipeline/tests/test_terrain.py`

**Interfaces:**
- Produces: `terrain.german_datasets(folder) -> Iterator[tuple[DatasetReader, CRS]]`, a generator. `build()` already closes each dataset after painting it (`terrain.py:158-160`), so only one DGM tile is open at a time.
- Produces: `terrain.main` default `--step 8.0`.

- [ ] **Step 1: Write the failing tests.** Create `pipeline/tests/test_terrain.py`:

```python
import types
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

import geo
import terrain

DGM_LABEL = "DGM1 Datengrundlage: LGL, www.lgl-bw.de (dl-de/by-2-0)"


def write_dgm_tile(path: Path, west: float, north: float, height: float, size: int = 60, res: float = 10.0):
    """A tiny LGL-like tile in EPSG:25832 (UTM32), constant height."""
    with rasterio.open(path, "w", driver="GTiff", height=size, width=size, count=1, dtype="float32",
                       crs="EPSG:25832", transform=from_origin(west, north, res, res), nodata=-9999) as ds:
        ds.write(np.full((size, size), height, dtype=np.float32), 1)


def test_german_datasets_is_lazy_and_yields_every_tile(tmp_path):
    write_dgm_tile(tmp_path / "a.tif", 420800, 5267800, 300.0)
    write_dgm_tile(tmp_path / "b.tif", 421400, 5267800, 310.0)
    gen = terrain.german_datasets(tmp_path)
    assert isinstance(gen, types.GeneratorType)       # nothing opened before the first next()
    tiles = []
    for ds, crs in gen:
        tiles.append(str(crs))
        ds.close()
    assert tiles == ["EPSG:25832", "EPSG:25832"]


def test_german_datasets_without_folder_yields_nothing(tmp_path):
    assert list(terrain.german_datasets(None)) == []
    assert list(terrain.german_datasets(tmp_path / "missing")) == []


def test_build_fills_the_german_side_from_dgm1(tmp_path, monkeypatch):
    """North of the Rhine near Bad Saeckingen: no Swiss tile, the DGM tile sets the height (300 m - base 284 m = 16 m)."""
    monkeypatch.setattr(terrain, "swiss_tiles", lambda bbox, cache: [])
    write_dgm_tile(tmp_path / "t.tif", 420800, 5267800, 300.0)
    bbox = (7.9500, 47.5550, 7.9520, 47.5560)
    header, h = terrain.build(bbox, geo.DEFAULT_ORIGIN, 8.0, 284.0, tmp_path / "cache", tmp_path)
    assert DGM_LABEL in header["sources"]
    assert np.allclose(h, 16.0, atol=0.01)


def test_default_step_is_8_m(monkeypatch, tmp_path):
    seen = {}

    def fake_build(bbox, origin, step, base, cache, dgm_dir):
        seen["step"] = step
        return {"w": 1, "h": 1}, np.zeros((1, 1), np.float32)

    monkeypatch.setattr(terrain, "build", fake_build)
    monkeypatch.setattr(terrain, "write_mmh", lambda path, header, heights: None)
    assert terrain.main(["--out", str(tmp_path / "x.mmh")]) == 0
    assert seen["step"] == 8.0
```

- [ ] **Step 2: Watch them fail**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_terrain.py -q
```

Expected: `test_german_datasets_is_lazy…` FAILS (a list, not a generator), and `test_default_step_is_8_m` FAILS (4.0). The others may already pass.

If `test_build_fills_the_german_side_from_dgm1` fails because the tile does not cover the bbox, print the bbox in UTM32 (`pyproj.Transformer.from_crs(4326, 25832, always_xy=True)`). Move the tile origin so it covers the bbox with a ≥ 100 m margin. Never loosen the 16 m assertion.

- [ ] **Step 3: Implement.** Replace `german_datasets` in `pipeline/terrain.py`:

```python
def german_datasets(folder: Path | None):
    """Yield (dataset, crs) for each LGL DGM1 tile, one at a time; the caller closes each before the next opens."""
    if not folder:
        return
    folder = folder.expanduser()
    if not folder.is_dir():
        log(f"DGM folder not found: {folder} (German side stays empty)")
        return
    count = 0
    for p in sorted(folder.rglob("*")):
        suffix = p.suffix.lower()
        if suffix in (".tif", ".tiff", ".asc"):
            ds = rasterio.open(p)
            if ds.crs is None:
                log(f"  {p.name}: no CRS, assuming EPSG:25832")
            count += 1
            yield ds, ds.crs or ETRS_UTM32
        elif suffix == ".xyz":
            count += 1
            yield xyz_to_dataset(p, ETRS_UTM32), ETRS_UTM32
    log(f"LGL DGM1: {count} tiles from {folder}")
```

In `main`, change the step default and its help:

```python
    ap.add_argument("--step", type=float, default=8.0, help="grid spacing in metres (default 8; the game draws a 16 m mesh)")
```

In the module docstring, change the usage example `--step 4` to `--step 8`.

- [ ] **Step 4: Run the pipeline suite**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q -rs
```

Expected: `test_terrain.py` all pass. `test_golden.py` is in the same state as after Task 1.

- [ ] **Step 5: Commit**

```bash
git add pipeline/terrain.py pipeline/tests/test_terrain.py
git commit -m "feat(pipeline): 8 m terrain grid and one DGM1 tile in memory at a time (#19, #44)"
```

---

### Task 3: Anchors for the new places

**Files:**
- Modify: `pipeline/anchors.json`
- Test: `pipeline/tests/test_anchors.py`

**Interfaces:**
- Produces: `anchors.landmarks` keys `alteRheinbrueckeRheinfelden`, `laufenbruecke`, `zollLaufenburg`, `flugplatzSchupfart` (kind `poi`, position only; the prototype draws models by key and ignores these). `areas.industrial` gains `w41115630`. Three labels.

- [ ] **Step 1: Write the failing test.** Append to `pipeline/tests/test_anchors.py`:

```python
def test_real_anchors_json_has_the_region_extension_places():
    """#19/#44/#47: the new landmarks are OSM refs or lon/lat, and the lon/lat ones land inside the new region."""
    from pathlib import Path
    spec = anchors.load(Path(__file__).parents[1] / "anchors.json")
    lm = spec["landmarks"]
    assert lm["alteRheinbrueckeRheinfelden"]["osm"] == "w35075968"
    assert lm["laufenbruecke"]["osm"] == "w52451103"
    assert lm["zollLaufenburg"]["osm"] == "w172512597"
    assert "w41115630" in spec["areas"]["industrial"]
    r = anchors.resolve({"landmarks": {"f": lm["flugplatzSchupfart"]}}, OsmData(), F)
    x0, z0 = F.to_game(geo.DEFAULT_BBOX[0], geo.DEFAULT_BBOX[3])
    x1, z1 = F.to_game(geo.DEFAULT_BBOX[2], geo.DEFAULT_BBOX[1])
    f = r["landmarks"]["f"]
    assert x0 < f["x"] < x1 and z0 < f["z"] < z1
    assert 4400 < f["z"] < 5000                       # south of the old edge (z ~ 2034), on the Tafeljura
    assert {"RHEINFELDEN", "LAUFENBURG", "SCHUPFART"} <= {lb["t"] for lb in spec["labels"]}
```

- [ ] **Step 2: Watch it fail**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_anchors.py -q
```

Expected: FAIL with `KeyError: 'alteRheinbrueckeRheinfelden'`.

- [ ] **Step 3: Implement.** In `pipeline/anchors.json`, add after `"jumpRamp"` (keep the existing alignment style):

```json
    "jumpRamp":         { "game": [337.8, 170.2], "kind": "ramp", "heading_deg": 0 },
    "alteRheinbrueckeRheinfelden": { "osm": "w35075968", "kind": "poi", "src": "#44: Alte Rheinbrücke Rheinfelden AG / Baden" },
    "laufenbruecke":    { "osm": "w52451103", "kind": "poi", "src": "#19: Laufenbrücke Laufenburg AG / Baden" },
    "zollLaufenburg":   { "osm": "w172512597", "kind": "poi", "src": "#19: Zollstation Laufenburg at the Hochrheinbrücke" },
    "flugplatzSchupfart": { "lonlat": [7.9505, 47.5090], "kind": "poi", "src": "#47: Flugplatz Schupfart (OSM r2782819); lon/lat because aeroway is not an area key in osm_read" }
```

Add three labels at the end of `"labels"` (positions are the OSM place nodes `n240069687`, `n1776602020` and `n240030566`):

```json
    { "t": "HOLZBRÜCKE", "game": [-1143, -70] },
    { "t": "RHEINFELDEN", "lonlat": [7.79229, 47.55439] },
    { "t": "LAUFENBURG", "lonlat": [8.06017, 47.56046] },
    { "t": "SCHUPFART", "lonlat": [7.96578, 47.51455] }
```

And the brewery site in `areas.industrial`:

```json
    "industrial": [ "w1378060195", "w41115630" ],
```

- [ ] **Step 4: Run the pipeline suite** (same command as Task 2 Step 4). Expected: `test_anchors.py` passes, and nothing else changes state.

- [ ] **Step 5: Commit**

```bash
git add pipeline/anchors.json pipeline/tests/test_anchors.py
git commit -m "feat(pipeline): anchors for Rheinfelden, Laufenburg and Flugplatz Schupfart (#19, #44, #47)"
```

---

### Task 4: Golden tests: core stays pinned, region gets its own

**Files:**
- Modify: `pipeline/tests/test_golden.py`

**Interfaces:**
- Consumes: Task 1 (`CORE_BBOX`), Task 3 (anchors).
- Produces: fixture `world_region` (skips until the extract covers the new region) and the D2 world budget `REGION_BUDGET = 12e6` bytes.

- [ ] **Step 1: Switch the core fixtures.** In `pipeline/tests/test_golden.py`, change **both** `osm.build_world(…, geo.DEFAULT_BBOX, …)` calls (fixtures `world` ~L17 and `world_dsm` ~L112) to `geo.CORE_BBOX`. Change no assertion: they describe the old area and must keep passing on the new extract (A7: same country files).

- [ ] **Step 2: Add the region tests** at the end of the file:

```python
ANCHORS = Path(__file__).parents[1] / "anchors.json"
REGION_WAYS = {52451103, 35075968, 831863383}   # Laufenbrücke (E), Alte Rheinbrücke Rheinfelden (W), Schupfart Dorf (S)
REGION_BUDGET = 12e6                             # bytes, spec D2


def _extract_covers_region() -> bool:
    import osmium

    class Seen(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.ids = set()

        def way(self, w):
            if w.id in REGION_WAYS:
                self.ids.add(w.id)

    h = Seen()
    h.apply_file(str(PBF))
    return h.ids == REGION_WAYS


@pytest.fixture(scope="module")
def world_region():
    if not _extract_covers_region():
        pytest.skip("extract predates the region extension (#19/#44/#47): plan Task 8")
    return osm.build_world(PBF, MMH if MMH.exists() else None, geo.DEFAULT_BBOX, geo.DEFAULT_ORIGIN,
                           30.0, 1000.0, ANCHORS)


def test_region_bbox_and_new_places(world_region):
    assert world_region["bbox"] == list(geo.DEFAULT_BBOX)
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    xs, zs = f.to_game([geo.DEFAULT_BBOX[0], geo.DEFAULT_BBOX[2]], [geo.DEFAULT_BBOX[3], geo.DEFAULT_BBOX[1]])
    clip = shapely.box(float(xs[0]), float(zs[0]), float(xs[1]), float(zs[1]))
    lm = world_region["anchors"]["landmarks"]
    for key in ("alteRheinbrueckeRheinfelden", "laufenbruecke", "zollLaufenburg", "flugplatzSchupfart"):
        assert key in lm, key
        assert clip.contains(shapely.Point(lm[key]["x"], lm[key]["z"])), key
    assert any(r["id"] == 52451103 and r["bridge"] for r in world_region["roads"])       # Laufenbrücke


def test_region_feldschloesschen_brewery_is_an_industrial_building(world_region):
    by_id = {b["id"]: b for b in world_region["buildings"]}
    assert 98020654 in by_id
    assert by_id[98020654]["palette"] == "industrial"


def test_region_rhine_runs_from_rheinfelden_to_laufenburg(world_region):
    """The Rhine multipolygon (r1706150) must be complete across the wider box: -s smart, not -s simple."""
    xs = [x for w in world_region["water"] for ring in w["rings"] for x, _ in ring]
    assert min(xs) < -13000 and max(xs) > 7000


def test_region_world_fits_the_budget(world_region, tmp_path):
    p = tmp_path / "w.json"
    osm.write_world(p, world_region)
    assert p.stat().st_size <= REGION_BUDGET, p.stat().st_size
```

- [ ] **Step 3: Run**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected without the extract (CI): all skipped. Expected with the current 3.7 MB extract: the core tests PASS (they are the pre-change numbers on the pre-change area), and the four `test_region_*` are SKIPPED with "extract predates the region extension". Any core failure here is a real regression from Tasks 1–3: fix it, never the test.

- [ ] **Step 4: Commit**

```bash
git add pipeline/tests/test_golden.py
git commit -m "test(pipeline): pin the golden numbers to the core region, add region checks (#19, #44, #47)"
```

---

### Task 5: J list: three Gemeinden, five places

**Files:**
- Modify: `prototype/landmarks.js`
- Test: `prototype/tests/landmarks.test.mjs`, `prototype/tests/test_jump.py`

**Interfaces:**
- Consumes: the anchor keys from Task 3; world building `98020654`.

- [ ] **Step 1: Write the failing node test.** In `prototype/tests/landmarks.test.mjs`, change the `LANDMARK_INFO holds the 14 landmarks of the spec` test. Count 14 → 19, or `<main> + 5` (Task 0). The `GEMEINDEN` and building expectations become:

```js
test('LANDMARK_INFO holds the 19 landmarks of the specs (#41, #19/#44/#47)', () => {
  assert.equal(LANDMARK_INFO.length, 19);
  for (const l of LANDMARK_INFO) {
    assert.ok(GEMEINDEN.includes(l.gemeinde), l.name);
    assert.ok(!!l.anchor !== !!l.building, `${l.name}: exactly one of anchor / building`);
  }
  assert.deepEqual(GEMEINDEN, ['Rheinfelden', 'Bad Säckingen', 'Stein', 'Münchwilen', 'Schupfart', 'Eiken', 'Sisseln', 'Laufenburg']);
  assert.deepEqual(LANDMARK_INFO.filter(l => l.building).map(l => [l.name, l.building]),
    [['Brauerei Feldschlösschen', 98020654], ['Bodenackerstrasse 6c', 171822634], ['Bodenackerstrasse 10B', 171822943]]);
});

test('the region extension places sit in their Gemeinden (#19, #44, #47)', () => {
  const g = Object.fromEntries(LANDMARK_INFO.map(l => [l.name, [l.gemeinde, l.anchor || l.building]]));
  assert.deepEqual(g['Brauerei Feldschlösschen'], ['Rheinfelden', 98020654]);
  assert.deepEqual(g['Alte Rheinbrücke Rheinfelden'], ['Rheinfelden', 'alteRheinbrueckeRheinfelden']);
  assert.deepEqual(g['Flugplatz Schupfart'], ['Schupfart', 'flugplatzSchupfart']);
  assert.deepEqual(g['Laufenbrücke'], ['Laufenburg', 'laufenbruecke']);
  assert.deepEqual(g['Zollstation Laufenburg'], ['Laufenburg', 'zollLaufenburg']);
});
```

If #46 landed first, keep its building entries in the expected list, in table order.

- [ ] **Step 2: Watch it fail**

```bash
node --test prototype/tests/*.test.mjs
```

Expected: FAIL (length 14, old `GEMEINDEN`).

- [ ] **Step 3: Implement** in `prototype/landmarks.js`:

```js
export const GEMEINDEN = ['Rheinfelden', 'Bad Säckingen', 'Stein', 'Münchwilen', 'Schupfart', 'Eiken', 'Sisseln', 'Laufenburg'];   // west → east
```

Insert at the **top** of `LANDMARK_INFO`:

```js
  { name: 'Brauerei Feldschlösschen', gemeinde: 'Rheinfelden', building: 98020654 },
  { name: 'Alte Rheinbrücke Rheinfelden', gemeinde: 'Rheinfelden', anchor: 'alteRheinbrueckeRheinfelden' },
```

After `Plattform Sisslerfeld`:

```js
  { name: 'Flugplatz Schupfart', gemeinde: 'Schupfart', anchor: 'flugplatzSchupfart' },
```

At the **end**:

```js
  { name: 'Laufenbrücke', gemeinde: 'Laufenburg', anchor: 'laufenbruecke' },
  { name: 'Zollstation Laufenburg', gemeinde: 'Laufenburg', anchor: 'zollLaufenburg' },
```

Update the comment above `LANDMARK_INFO` to `// Gemeinden verified against OpenStreetMap on 2026-10-02 (#41) and 2026-10-03 (#19/#44/#47; re-checked in plan Task 10)`.

- [ ] **Step 4: Run the node tests.** `node --test prototype/tests/*.test.mjs`. Expected: all pass.

- [ ] **Step 5: Key the browser counts on the served world.** In `prototype/tests/test_jump.py`, add below `SISSELN_ROWS`:

```python
def _served_region():
    if not WORLD.exists():
        return False
    return json.loads(WORLD.read_text(encoding="utf-8"))["bbox"][0] < 7.8   # #19/#44/#47 world reaches Rheinfelden


REGION = _served_region()
ROWS_ALL = 20 if REGION else 15       # 19 landmarks + Random spot; the old world skips the 5 new ones
CHIPS = (["All", "Rheinfelden", "Bad Säckingen", "Stein", "Münchwilen", "Schupfart", "Eiken", "Sisseln", "Laufenburg"]
         if REGION else ["All", "Bad Säckingen", "Stein", "Münchwilen", "Eiken", "Sisseln"])
needs_region = pytest.mark.skipif(not REGION, reason="served world predates the region extension (plan Task 10)")
```

Replace `assert len(r) == 15` (~L62) and `assert len(rows(page)) == 15` (~L179) with `== ROWS_ALL`. Replace the chips literal (~L66) with `CHIPS`. Leave every other assertion alone. If Task 0 found #46 on main, the old-world numbers are main's numbers and the region numbers are those + 5.

Append:

```python
@needs_region
def test_region_places_are_listed_and_jumpable(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("feldschl")
        assert names(page) == ["Brauerei Feldschlösschen", "Random spot"]
        page.keyboard.press("Enter")
        ring = next(x for x in json.loads(WORLD.read_text(encoding="utf-8"))["buildings"] if x["id"] == 98020654)["ring"]
        bx, bz = sum(q[0] for q in ring) / len(ring), sum(q[1] for q in ring) / len(ring)
        c = car(page)
        assert math.hypot(c["x"] - bx, c["z"] - bz) < 80
        page.keyboard.press("KeyJ")
        page.click('#jumpchips button[data-g="Laufenburg"]')
        assert names(page) == ["Laufenbrücke", "Zollstation Laufenburg", "Random spot"]
        page.click('#jumpchips button[data-g="All"]')
        page.keyboard.type("schupfart")
        assert names(page) == ["Flugplatz Schupfart", "Random spot"]
        b.close()
```

- [ ] **Step 6: Run the J browser tests against main's world** (foreground; slow):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -rs
```

Expected: everything passes with `REGION == False`, and `test_region_places_are_listed_and_jumpable` is SKIPPED.

- [ ] **Step 7: Commit**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs prototype/tests/test_jump.py
git commit -m "feat(prototype): J list gains Rheinfelden, Schupfart and Laufenburg places (#19, #44, #47)"
```

---

### Task 6: Docs, changelog, playtest list, push

**Files:**
- Modify: `docs/08-pipeline-terrain.md`, `docs/11-pipeline-osm.md`, `data/README.md`, `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: docs/08.**
  - "Default region" line → `7.775–8.085 E, 47.500–47.572 N (Rheinfelden to Laufenburg, south to Schupfart), 8 m grid, about 23.4 × 7.9 km, about 12 MB`.
  - Options line: `--step 8`.
  - "German tiles": replace "around Bad Säckingen / Wehr / Murg" with "the German side between Rheinfelden (Baden) and Laufenburg (Baden): UTM32 E 406–432 km, N 5262–5270 km, north of the Rhine; GeoTIFF preferred (XYZ is loaded whole into memory)". Suggested folder: `~/geodata/lgl_dgm1`.
  - Remove the "German side stays flat" known limit **only in Task 9**, after a DGM1 build has really been published.

- [ ] **Step 2: docs/11.**
  - "Run it": the cut runs on odroid-plus-pve from the **cached 2026-09-29** `switzerland-latest` and `freiburg-regbez-latest` files, with the padded box 7.748–8.112 E × 47.482–47.590 N.
  - Keep the old 3.7 MB extract as `cache/osm/hochrhein-core-2026-10-01.osm.pbf`; only `hochrhein.osm.pbf` is current.
  - Add `CORE_BBOX` to the `geo.py` bullet, and the four new anchors to the **Anchors** paragraph.

- [ ] **Step 3: data/README.md.** Terrain row source: `swissALTI3D © swisstopo; German side: DGM1 Datengrundlage: LGL, www.lgl-bw.de (dl-de/by-2-0)`.

- [ ] **Step 4: CHANGELOG.md** under `[Unreleased]` → `### Added` (player-facing):

```markdown
- The map is much bigger: west to Rheinfelden with the Feldschlösschen brewery and the Alte Rheinbrücke, south up to Flugplatz Schupfart, and east to Laufenburg with the Laufenbrücke and the customs post. All of them are in the **J** list. The German side of the Rhine finally has real hills instead of a flat plain.
```

- [ ] **Step 5: test-todo.md.** Append a `#19/#44/#47` block: J → Feldschlösschen and drive into Rheinfelden; cross the Alte Rheinbrücke; J → Laufenbrücke, drive over it to the Zollstation; drive from Eiken up to Schupfart; check the Hotzenwald slopes north of Bad Säckingen are no longer flat; check the first load on a phone (time until the start button) and the frame rate in Sisseln.

- [ ] **Step 6: Full verification, then push** (the data tasks may stop; the code must already be safe):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q -rs
cd .. && node --test prototype/tests/*.test.mjs
git add docs/08-pipeline-terrain.md docs/11-pipeline-osm.md data/README.md CHANGELOG.md test-todo.md
git commit -m "docs(pipeline): document the extended region, DGM1 and the odroid cut (#19, #44, #47)"
git fetch origin && git rebase origin/main
git push -u origin feature/19-region-extension
```

Open the PR now as a **draft**, with the three `Closes` lines and the D1/D2 numbers from the spec.

---

### Task 7: Data preconditions (guarded — stop here on CI)

**Files:** none.

- [ ] **Step 1: Caches and DGM1 present?**

```bash
cd pipeline
test -f cache/osm/switzerland-latest.osm.pbf && test -f cache/osm/freiburg-regbez-latest.osm.pbf && echo COUNTRY-OK || echo "STOP: country extracts missing"
[ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] && echo DSM-OK || echo "STOP: swissSURFACE3D cache missing"
[ "$(find ~/geodata/lgl_dgm1 -type f \( -iname '*.tif' -o -iname '*.tiff' -o -iname '*.xyz' -o -iname '*.asc' \) 2>/dev/null | wc -l)" -ge 20 ] && echo DGM-OK || echo "STOP: DGM1 tiles missing in ~/geodata/lgl_dgm1"
```

If any line prints `STOP`, do none of Tasks 8–10:
- no cut;
- no terrain or world build;
- no touching `data/`.

Put this in the PR description: "Data not rebuilt: <which precondition>. Code is complete. Run Tasks 7–10 of docs/superpowers/plans/2026-10-03-region-extension.md locally. The DGM1 download is manual (LGL Open GeoData portal, product DGM1, UTM32 E 406–432 km × N 5262–5270 km, into ~/geodata/lgl_dgm1). The OSM cut runs on odroid-plus-pve." Then go to the end and mark the PR ready.

---

### Task 8: OSM cut on odroid-plus-pve (heavy: never on agent-dev)

**Files:** `pipeline/cache/osm/hochrhein.osm.pbf` (local, git-ignored).

`osmium extract -s smart` needs about 3.6 GB (measured on the first cut). That is over the 2 GB agent-box cap, and `-s simple` would break the Rhine multipolygon (spec A6). So this step runs in a throwaway LXC on **odroid-plus-pve**, the same way as the first cut (docs/11).

- [ ] **Step 1: Print the commands** (light, agent box is fine):

```bash
cd pipeline && ./.venv/bin/python osm.py cut --pbf-dir cache/osm/countries --out cache/osm/hochrhein.osm.pbf --dry-run
```

`cut` takes every `*.osm.pbf` in `--pbf-dir`. Put only the two country files in that folder (move or link them into `cache/osm/countries/`), never the regional cuts.

- [ ] **Step 2: Run on odroid-plus-pve.** Copy `pipeline/osm.py`, `pipeline/geo.py` and the two country files (the 2026-09-29 copies, **not** fresh downloads, spec A7) into a throwaway LXC with osmium-tool and pyosmium. Run:

```bash
python osm.py cut --pbf-dir ~/geodata/geofabrik --out hochrhein.osm.pbf
```

Expected: two `osmium extract … -s smart` runs plus one merge, a peak around 3.5–4 GB, and a result of a few to ~20 MB. Copy it back.

- [ ] **Step 3: Install it, keeping the old one**

```bash
cd pipeline && mv cache/osm/hochrhein.osm.pbf cache/osm/hochrhein-core-2026-10-01.osm.pbf && cp <copied-back>/hochrhein.osm.pbf cache/osm/hochrhein.osm.pbf
```

- [ ] **Step 4: Core golden tests on the new extract** (must PASS with unchanged numbers; region tests now RUN):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

- If a core test fails, the core area's data changed. Check that the country files were the cached ones. Do **not** edit the numbers.
- If it exits 137, the build of the region world needs more than 2 GB. Run Tasks 9–10 in the odroid LXC instead (copy `pipeline/`, `cache/` and `data/`). Never raise the cap.
- `test_region_world_fits_the_budget` failing means D2 is exceeded. STOP the data tasks, report the measured size in the PR and on #19, and leave the decision to the human.

---

### Task 9: Terrain build with DGM1 (guarded)

**Files:** `data/terrain_hochrhein.mmh`.

- [ ] **Step 1: Build** (downloads ~150 swissALTI3D tiles, ~150 MB, into `cache/swissalti3d`):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python terrain.py --dgm-dir ~/geodata/lgl_dgm1 --out ../data/terrain_hochrhein.mmh
```

Exit 137: run it on odroid-plus-pve (as in Task 8 Step 4), never with a higher cap.

- [ ] **Step 2: Check the header**

```bash
cd pipeline && ./.venv/bin/python -c "import mmh; h, a = mmh.read_mmh('../data/terrain_hochrhein.mmh'); print(h['w'], h['h'], h['step'], h['x0'], h['z0'], h['sources'], round(h['min'],1), round(h['max'],1)); import os; print(os.path.getsize('../data/terrain_hochrhein.mmh')/1e6, 'MB')"
```

Expected:
- `2926 1021 8.0 -14472.0 -2448.0`;
- `sources` holds both the swissALTI3D and the DGM1 strings;
- the log line says well under 1 % of the grid has no data;
- size ≤ 13 MB (D2).

Anything else: STOP, `git checkout -- ../data/terrain_hochrhein.mmh`, and report it.

- [ ] **Step 3:** Remove the "German side stays flat until DGM1 tiles are added" known-limit lines from `docs/08-pipeline-terrain.md` and `docs/11-pipeline-osm.md`.

- [ ] **Step 4: Commit**

```bash
git add data/terrain_hochrhein.mmh docs/08-pipeline-terrain.md docs/11-pipeline-osm.md
git commit -m "chore(data): terrain for the extended region with LGL DGM1 (#19, #44, #47)"
```

---

### Task 10: World build, Gemeinde check, performance check (guarded)

**Files:** `data/world_hochrhein.json`; possibly `prototype/landmarks.js`.

- [ ] **Step 1: Golden tests against the new terrain.** Same command as Task 8 Step 4. All must pass and none may be skipped.

- [ ] **Step 2: Build** (downloads ~120 more swissSURFACE3D tiles, ~1.5 GB; check `df -h` first):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Exit 137: odroid-plus-pve, as above.

- [ ] **Step 3: Size guard**

```bash
ls -l ../data/world_hochrhein.json && gzip -c ../data/world_hochrhein.json | wc -c
```

Raw ≤ 12 MB (D2). Otherwise STOP, `git checkout -- ../data/world_hochrhein.json`, and report both numbers.

- [ ] **Step 4: Gemeinde check** of the five J places (spec A12). Save as `/tmp/gemeinde_check.py` and run it capped:

```python
import json, sys
import osmium, shapely
from shapely import wkb
sys.path.insert(0, ".")
import geo

f = geo.Frame(*geo.DEFAULT_ORIGIN)
w = json.load(open("../data/world_hochrhein.json", encoding="utf-8"))
lm = w["anchors"]["landmarks"]
ring = next(b for b in w["buildings"] if b["id"] == 98020654)["ring"]
pts = {"Brauerei Feldschlösschen": (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))}
for name, key in [("Alte Rheinbrücke Rheinfelden", "alteRheinbrueckeRheinfelden"), ("Flugplatz Schupfart", "flugplatzSchupfart"),
                  ("Laufenbrücke", "laufenbruecke"), ("Zollstation Laufenburg", "zollLaufenburg")]:
    pts[name] = (lm[key]["x"], lm[key]["z"])
fab = osmium.geom.WKBFactory()
gem = []


class H(osmium.SimpleHandler):
    def area(self, a):
        if a.tags.get("boundary") == "administrative" and a.tags.get("admin_level") == "8" and not a.from_way():
            try:
                gem.append((a.tags.get("name"), wkb.loads(fab.create_multipolygon(a), hex=True)))
            except RuntimeError:
                pass


H().apply_file("cache/osm/hochrhein.osm.pbf", locations=True)
for name, (x, z) in pts.items():
    lon, lat = f.game_to_lonlat(x, z)
    hit = [g for g, poly in gem if poly.contains(shapely.Point(float(lon), float(lat)))]
    print(name, hit)
```

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python /tmp/gemeinde_check.py
```

Expected: Rheinfelden ×2, Schupfart, Laufenburg ×2. A bridge point in the Rhine may hit both national sides: take the Swiss one. If a place lands in another Gemeinde (for example the airfield in Obermumpf), take the probe's answer. Change it in `LANDMARK_INFO`, `GEMEINDEN` (west → east by place-node longitude), `landmarks.test.mjs`, `CHIPS` in `test_jump.py`, and the expectation in this task. Say so in the PR.

- [ ] **Step 5: Browser checks on the rebuilt world** (foreground; slow; `REGION` is now True):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q -rs
cd .. && node --test prototype/tests/*.test.mjs
```

All pass, and `test_region_places_are_listed_and_jumpable` runs. If `test_smoke.py` or another suite times out on the bigger world (page ready > 240 s in SwiftShader), first run the same test against `main`'s world. Record both times in the PR, and do not raise the timeouts silently. That is D2 data for the human.

- [ ] **Step 6: Performance numbers for D2.** For this branch and for `main`, run one Playwright load (`wait_for_function(... #worldstatus ...)`) in the foreground and record:
  - seconds until the start button is ready;
  - `window.__mm.physMs`;
  - the data transferred (`page.on("response")` sizes of the two data files).

  Put the four numbers side by side in the PR description.

- [ ] **Step 7: Commit and push**

```bash
git add data/world_hochrhein.json prototype/landmarks.js prototype/tests/landmarks.test.mjs prototype/tests/test_jump.py
git commit -m "chore(data): rebuild the world for the extended region (#19, #44, #47)"
git fetch origin && git rebase origin/main
git push
```

If the rebase hits `data/world_hochrhein.json` (another issue rebuilt it meanwhile): take **this** branch's file only if that issue's pipeline change is on this branch too, then re-run Steps 2–5. Otherwise stop and report. Never merge two world files by hand.

Mark the PR ready for review.
