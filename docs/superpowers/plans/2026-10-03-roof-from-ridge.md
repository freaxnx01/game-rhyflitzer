# Roof Shape from the Measured Ridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measured buildings (`hsrc: "dsm"`) get `roof: "gable"` or `"flat"` from the ridge swissSURFACE3D measured, so the Bodenackerstrasse row houses 10, 12, 14, 18, 20, 21 are pitched and 3, 4, 7, 8, 11, 13, 15, 16, 17 are flat (#43).

**Architecture:** A pure function `roof_shape(kind, rh, fill, area)` in `pipeline/building_heights.py` decides the shape; `apply()` calls it for every measured footprint after `h`/`rh` are set and counts the re-classifications. The prototype is not touched: `osmBuilding()` already draws whatever `roof` says, with the measured `rh` as the ridge rise along the long side. The world file is rebuilt last, behind a cache guard.

**Tech Stack:** Python 3 + numpy + rasterio + shapely (pipeline, pytest).

**Spec:** `docs/superpowers/specs/2026-10-03-roof-from-ridge-design.md`

## Global Constraints

- Run anything heavy (world build, golden tests) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never `run_in_background`. Exit 137 means the memory cap was hit: stop and report, and do not raise the cap. If `systemd-run --user` is unavailable (CI runner), run the same command without the prefix.
- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green. Never modify an existing test to make it green.
- Thresholds, exactly: `RIDGE_GABLE = 1.5`, `RIDGE_FLAT = 0.6`, `RECT_FILL = 0.85`, `GABLE_MAX_AREA = 1000.0`.
- The eaves `h` and the ridge `rh` of every building stay exactly as today. The pitched-roof push-down in `apply()` keeps reading the footprint heuristic's `roof` **before** the new rule runs.
- **No change** to `prototype/index.html`, `prototype/world.js` or any other prototype file (#45 edits `osmBuilding()` in parallel).
- Pipeline tests: `cd pipeline && ./.venv/bin/python -m pytest -q` (where no `.venv` exists: `python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt` first).
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the rebuild task.
- Never hand-edit `data/world_hochrhein.json`. Never commit a world built without `--dsm-heights`. No `osmium` cut: `pipeline/cache/osm/hochrhein.osm.pbf` holds every object.

## Review Focus

- A `"flat"` footprint with a big ridge but an L shape (fill < 0.85): must stay flat, because `gable()` would draw a rectangular box over the L. Covered in Task 1 (`roof_shape("flat", 2.9, 0.7, 500)`).
- A hall over 1,000 m² with a 3 m rooftop structure: must stay flat, or it turns into a plaster-and-tile box. Covered in Task 1.
- A shallow ridge between 0.6 and 1.5 m: the heuristic's `kind` must survive in both directions (175 buildings). Covered in Task 1.
- A footprint the surface does not show (`not_built`) or outside the tiles (`no_data`): `roof` must stay untouched, because no `rh` exists. Covered in Task 1 (existing `b[2]` and the `not_built` test keep their `roof`; Task 1 asserts it).
- The rebuilt world must differ from `main` in `roof` and `params.built` only; a stray change in `h` means the push-down moved. Covered by the guard in Task 3.

---

### Task 1: `roof_shape` and its use in `apply()`

**Files:**
- Modify: `pipeline/building_heights.py` (constants after `NOT_BUILT`, new function `roof_shape`, three lines in `apply()`, docstring)
- Test: `pipeline/tests/test_building_heights.py`

**Interfaces:**
- Produces: `building_heights.roof_shape(kind: str, rh: float, fill: float, area: float) -> str` returning `"gable"` or `"flat"`.
- Produces: `apply()` sets `b["roof"]` for measured buildings and adds the stats keys `ridge_gable` and `ridge_flat` (number of re-classified buildings per direction).

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_building_heights.py`:

```python
def test_roof_shape_from_the_ridge():
    """#43: the measured ridge decides flat vs. pitched on rectangular footprints under 1,000 m2; in the 0.6-1.5 m band
    the footprint heuristic keeps deciding."""
    assert BH.roof_shape("flat", 2.9, 0.89, 500) == "gable"        # Bodenackerstrasse 20a-20f: 36 x 13 m, pitched
    assert BH.roof_shape("gable", 0.1, 1.0, 208) == "flat"         # 16a-16c: the heuristic said gable, the roof is flat
    assert BH.roof_shape("flat", 0.1, 0.87, 395) == "flat"         # 8a-8f
    assert BH.roof_shape("flat", 2.9, 0.7, 500) == "flat"          # L-shaped: gable() would draw a box over the L
    assert BH.roof_shape("flat", 3.0, 0.87, 14689) == "flat"       # hall with rooftop plant
    assert BH.roof_shape("flat", 1.5, 0.85, 999.9) == "gable"      # thresholds are inclusive / exclusive as named
    assert BH.roof_shape("flat", 1.5, 0.85, 1000.0) == "flat"
    assert BH.roof_shape("gable", 1.0, 0.95, 100) == "gable"       # shallow ridge: heuristic keeps deciding
    assert BH.roof_shape("flat", 1.0, 0.95, 400) == "flat"
    assert BH.roof_shape("gable", 0.6, 0.95, 100) == "gable"
    assert BH.roof_shape("gable", 0.59, 0.95, 100) == "flat"


def test_measured_ridge_overrides_the_footprint_roof(tiles):
    """#43: a 'flat' footprint over a pitched surface becomes gable, a 'gable' footprint over a flat roof becomes flat;
    footprints without a measurement keep their roof."""
    b = [bld(6, 40, 0, 10, 8, "flat"), bld(7, -40, 0, 12, 10, "gable"), bld(8, 900, 900, 10, 8, "gable"),
         bld(9, 0, 60, 15, 12, "gable", h=12.0)]
    stats = BH.apply(b, FRAME, *tiles)
    assert b[0]["roof"] == "gable" and b[0]["rh"] >= 1.5 and b[0]["hsrc"] == "dsm"
    assert b[1]["roof"] == "flat" and b[1]["rh"] < 0.6 and b[1]["hsrc"] == "dsm"
    assert b[2]["roof"] == "gable" and "rh" not in b[2]            # outside the tiles
    assert b[3]["roof"] == "gable" and "rh" not in b[3]            # not built in 2020
    assert stats["ridge_gable"] == 1 and stats["ridge_flat"] == 1
```

- [ ] **Step 2: Run and expect FAIL**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_building_heights.py -q
```

Expected: `AttributeError: module 'building_heights' has no attribute 'roof_shape'` and, for the tiles test, `assert 'flat' == 'gable'`.

- [ ] **Step 3: Implement**

In `pipeline/building_heights.py`, below `NOT_BUILT = 2.0 …`, add:

```python
RIDGE_GABLE = 1.5         # m: a ridge this high on a rectangular footprint is a pitched roof (#43)
RIDGE_FLAT = 0.6          # m: under this the roof is flat (the prototype's cut, index.html osmBuilding)
RECT_FILL = 0.85          # footprint share of its rotated rectangle, as in world_buildings.roof()
GABLE_MAX_AREA = 1000.0   # m2: the pipeline's big-building threshold; a bigger hall keeps a flat roof


def roof_shape(kind, rh, fill, area):
    """Roof from the measured ridge (#43). A ridge of at least RIDGE_GABLE on a footprint that fills RECT_FILL of its
    rectangle and is under GABLE_MAX_AREA is a gable; a ridge under RIDGE_FLAT is flat; between the two the footprint
    heuristic's `kind` stays (a shallow roof and a parapet measure alike)."""
    if rh >= RIDGE_GABLE and fill >= RECT_FILL and area < GABLE_MAX_AREA:
        return "gable"
    if rh < RIDGE_FLAT:
        return "flat"
    return kind
```

In `apply()`, directly after the line `b["hsrc"] = "dsm"` (and before `stats["dsm"] += 1`), add:

```python
            shape = roof_shape(b["roof"], b["rh"], poly.area / (b["rect"][2] * b["rect"][3]), poly.area)
            if shape != b["roof"]:
                stats["ridge_" + shape] += 1
                b["roof"] = shape
```

`poly` is the footprint in LV95 built at the top of the loop; its area equals the ring's. The push-down a few lines above still reads the heuristic's `roof`, so `h` does not change.

Update the `apply()` docstring to `"""Set b["h"] (eaves), b["rh"] (ridge), b["hsrc"] = "dsm" and b["roof"] from the ridge (#43) where the surface data covers the footprint. Returns stats."""`, and add one sentence to the module docstring after "A flat roof has rh ~ 0.": `The roof shape follows the ridge (#43): rh >= 1.5 m on a rectangular footprint under 1,000 m2 is a gable, rh < 0.6 m is flat, in between the footprint heuristic decides.`

- [ ] **Step 4: Run and expect PASS**

```bash
cd pipeline && ./.venv/bin/python -m pytest -q
```

Expected: all pass. `test_flat_and_gable_heights_from_the_surface` is unchanged and still green (its `"flat"` building measures `rh` ≈ 0, its `"gable"` building `rh` ≈ 3.2). Golden tests skip without the extract.

- [ ] **Step 5: Commit**

```bash
git add pipeline/building_heights.py pipeline/tests/test_building_heights.py
git commit -m "fix(pipeline): roof shape from the measured ridge (#43)"
```

---

### Task 2: Golden test, docs, changelog, playtest note

**Files:**
- Modify: `pipeline/tests/test_golden.py` (append)
- Modify: `docs/11-pipeline-osm.md` (the **Buildings** paragraph and the **Building heights (#17)** paragraph)
- Modify: `CHANGELOG.md` (`[Unreleased]`)
- Modify: `test-todo.md` (append a section)

**Interfaces:**
- Consumes: the `world_dsm` fixture of `test_golden.py` (skips without the swissSURFACE3D tiles).

- [ ] **Step 1: Write the golden test**

Append to `pipeline/tests/test_golden.py`:

```python
BODENACKER_FLAT = {512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913, 171822799}
BODENACKER_GABLE = {171822943, 171822937, 171822949, 171822938, 171822934, 171822932}


def test_bodenacker_row_houses_roof_from_the_ridge(world_dsm):
    """#43 (player, 2026-10-02): Bodenackerstrasse 3, 4, 7, 8, 11, 13, 15, 16, 17 have flat roofs, 10, 12, 14, 18, 20, 21
    pitched ones. The footprint heuristic said flat for every 36 x 13 m block; the measured ridge decides now."""
    by_id = {b["id"]: b for b in world_dsm["buildings"]}
    assert by_id[171822908]["roof"] == "flat" and by_id[171822908]["rh"] < 0.6          # 8a–8f
    assert by_id[171822934]["roof"] == "gable" and by_id[171822934]["rh"] >= 1.5        # 20a–20f
    assert by_id[171822799]["roof"] == "flat" and by_id[171822799]["addr"] == "16a–16c"  # the three-house row
    assert {i: by_id[i]["roof"] for i in BODENACKER_FLAT} == dict.fromkeys(BODENACKER_FLAT, "flat")
    assert {i: by_id[i]["roof"] for i in BODENACKER_GABLE} == dict.fromkeys(BODENACKER_GABLE, "gable")
    assert all(by_id[i]["h"] >= 6.0 for i in BODENACKER_FLAT | BODENACKER_GABLE)        # eaves untouched (#34 is separate)
```

- [ ] **Step 2: Run it**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs -k bodenacker_row
```

Expected: PASS where the tiles exist; SKIPPED (`run osm.py build --dsm-heights once …`) otherwise. To see it red, temporarily comment out the three `shape` lines added in Task 1 and rerun: the six `BODENACKER_GABLE` ways come back `"flat"`. Restore with `git checkout -- pipeline/building_heights.py`.

- [ ] **Step 3: Docs**

In `docs/11-pipeline-osm.md`, in the **Buildings.** paragraph, replace

```text
Gable roof if the footprint is under 250 m² and at least 85 % of its rotated rectangle, otherwise flat.
```

with

```text
Gable roof if the footprint is under 250 m² and at least 85 % of its rotated rectangle, otherwise flat; for measured buildings the ridge overrides this (see Building heights).
```

In the **Building heights (#17).** paragraph, after the sentence ending `keeps its OSM-tag or default height.`, insert:

```text
The roof shape follows the measured ridge (#43): `rh` ≥ 1.5 m on a footprint that fills at least 85 % of its rotated rectangle and is under 1,000 m² sets `roof: "gable"`, `rh` < 0.6 m sets `"flat"`, and between the two the footprint heuristic stands (a shallow roof and a parapet measure alike). The eaves are not touched by this. Real extract: about 169 footprints become gable (the 36 × 13 m Bodenackerstrasse rows 10, 12, 14, 18, 19, 20, 21 among them) and about 132 flat.
```

- [ ] **Step 4: Changelog and playtest note**

In `CHANGELOG.md`, under `## [Unreleased]`, add a `### Fixed` section after the `### Added` list (create it if missing) with:

```markdown
- Roofs on the Swiss side now follow the measured ridge: the Bodenackerstrasse row houses 10, 12, 14, 18, 20 and 21 in Sisseln have their pitched roofs, 3, 4, 7, 8, 11, 13, 15, 16 and 17 stay flat — and the same rule fixes every other measured house that was drawn with the wrong roof.
```

Append to `test-todo.md`:

```markdown
## Roofs from the measured ridge (#43)

- [ ] Bodenackerstrasse, Sisseln: 10, 12, 14, 18, 20, 21 (and 19) have pitched roofs with the ridge along the long side, about 3 m high — a gentle slope, not a tent. 3, 4, 7, 8, 11, 13, 15, 16a–16c and 17 are flat.
- [ ] F3 next to 20a–20f: the height label still shows the same eaves as before (7.7 m) — only the roof shape changed.
```

- [ ] **Step 5: Commit and push**

```bash
git add pipeline/tests/test_golden.py docs/11-pipeline-osm.md CHANGELOG.md test-todo.md
git commit -m "test(pipeline): Bodenackerstrasse roofs pinned, docs and changelog (#43)"
git push -u origin HEAD
```

---

### Task 3: Rebuild the world file (with measured heights), guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

**Interfaces:**
- Consumes: Task 1. The branch is pushed (Task 2), so the work is safe if this task stops.

- [ ] **Step 1: Cache check, and STOP if it fails.** The build needs the local caches, and a CI runner has none of them:

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP`, skip to Task 4 and do none of the following:

- run the build;
- touch or commit `data/world_hochrhein.json`;
- let the build download tiles;
- attempt an `osmium` cut.

State in the PR description: "World not rebuilt: pipeline caches missing on this machine. Run Task 3 of docs/superpowers/plans/2026-10-03-roof-from-ridge.md locally. Until then the game still draws every Bodenackerstrasse block flat."

- [ ] **Step 2: Golden tests first** (they must pass on the real extract, not skip):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected: all pass, with no `SKIPPED`.

- [ ] **Step 3: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected in the log: `building heights from swissSURFACE3D: {...}` with `'ridge_gable'` about 169 and `'ridge_flat'` about 132, and the same `'dsm'` count as before.

- [ ] **Step 4: Guard: the world may differ from `main` only by `roof` and `params.built`**

```bash
git fetch origin main
git show origin/main:data/world_hochrhein.json > /tmp/world_main.json
./pipeline/.venv/bin/python - <<'EOF'
import json
a = json.load(open("/tmp/world_main.json", encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
for w in (a, b): w["params"].pop("built", None)
ob = {x["id"]: x for x in a.pop("buildings")}; nb = {x["id"]: x for x in b.pop("buildings")}
assert a == b, ["non-building keys differ:", [k for k in set(a) | set(b) if a.get(k) != b.get(k)]]
assert set(ob) == set(nb), ("building ids differ", set(ob) ^ set(nb))
flips, bad = {"flat": 0, "gable": 0}, []
for i, o in ob.items():
    n = nb[i]
    keys = {k for k in set(o) | set(n) if o.get(k) != n.get(k)}
    if keys == {"roof"}: flips[n["roof"]] += 1
    elif keys: bad.append((i, sorted(keys)))
assert not bad, ("buildings changed beyond roof", bad[:10])
assert all(nb[i]["roof"] == "flat" for i in (512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913, 171822799))
assert all(nb[i]["roof"] == "gable" for i in (171822943, 171822937, 171822949, 171822938, 171822934, 171822932, 171822933))
print("guard ok: flat->gable", flips["gable"], "gable->flat", flips["flat"])
for i in (512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913, 171822799, 171822943, 171822937, 171822949, 171822938, 171822934, 171822932, 171822933):
    print(i, nb[i].get("addr"), nb[i]["roof"], nb[i]["h"], nb[i]["rh"])
EOF
```

Expected: `guard ok: flat->gable 169 gable->flat 132` (± a few if `main`'s world was built from a newer extract), then the 16 rows with 10, 12, 14, 18, 19, 20, 21 `gable` and the rest `flat`.

If the guard fails: **STOP**, run `git checkout -- data/world_hochrhein.json`, and report the differing keys in the PR. They may be keys another issue added to the pipeline without rebuilding `main`'s world; leave the rebuild to the maintainer then.

- [ ] **Step 5: Commit**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild the world with roofs from the measured ridge (#43)"
```

---

### Task 4: Full verification and PR

**Files:** none.

- [ ] **Step 1: Push, then run the pipeline suite in the foreground**

```bash
git push
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q -rs
```

Expected: all green; the golden tests run if the caches exist and skip with their reason otherwise.

- [ ] **Step 2: Browser smoke test that loads the OSM world** (only if Task 3 ran; foreground, generous timeout):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_smoke.py -q -rs -k "osm_layout"
```

Expected: PASS; the start screen still reports the same building count.

- [ ] **Step 3: PR description** says:
  - the rule (1.5 m / 0.6 m / fill 0.85 / 1,000 m²) and that eaves are untouched;
  - that building 16 is `w171822799` (`16a–16c`);
  - whether Task 3 ran, with the guard's flip counts, or why not;
  - `Closes #43`.
