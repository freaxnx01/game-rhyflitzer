# Cap DSM Roof Heights Implementation Plan (#630)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A gable roof whose DSM ridge `rh` exceeds its short side is a tree-canopy artefact; cap it to `0.4 * short side`, keep churches, chapels and towers, rebuild `data/world_hochrhein.json`, and prove only the capped buildings changed.

**Spec:** `docs/superpowers/specs/2026-11-02-dsm-roof-cap-design.md` (evidence, rule, assumptions).

**Tech:** Python 3 pipeline (pytest). No JS change.

## Global Constraints

- **Start from current `origin/main`.** Issue #629 (fields off the Crash-Platz) rebuilds the same `data/world_hochrhein.json` and is dispatched first. Run `git fetch origin && git rebase origin/main` before Task 4 and take the world file from main as the base of the diff. If #629's world is not on main yet, stop and say so in the PR.
- Never hand-edit the JSON; it is changed by the pipeline or by the retrofit script of Task 3 only.
- Memory: every Python run over the world or the pipeline under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …` where `systemd-run` exists; exit 137 means shrink the job.
- Run verification in the foreground, never `run_in_background`. Commit and push the branch before the long steps.
- Tests: `cd pipeline && python -m pytest tests/test_building_heights.py tests/test_world_cli.py -q`, then the whole `pipeline/tests` at the end.

## Files

| File | Change |
|---|---|
| `pipeline/building_heights.py` | `RIDGE_CAP_PER_SIDE = 1.0`, `RIDGE_DEFAULT_PER_SIDE = 0.4`, `cap_ridge(b)`, `tall_ok(tags)`; `apply(..., tall_ok_ids=())` calls `cap_ridge`; stats `ridge_capped`. |
| `pipeline/osm.py` | pass `tall_ok_ids` (ids of `data.areas` whose tags pass `tall_ok`) into `building_heights.apply`; log the stat. |
| `pipeline/cap_ridges.py` (new) | retrofit: apply `cap_ridge` to an existing world file, `--keep-ids`. |
| `pipeline/tests/test_building_heights.py` | unit tests (Task 1, 2) and a committed-world test (Task 4). |
| `pipeline/tests/test_cap_ridges.py` (new) | retrofit test (Task 3). |
| `data/world_hochrhein.json` | rebuilt / retrofitted (Task 4). |
| `docs/11-pipeline-osm.md`, `CHANGELOG.md` | rule, numbers, entry. |

### Task 1: `cap_ridge` and `tall_ok` (pure functions)

**Files:** `pipeline/building_heights.py`, `pipeline/tests/test_building_heights.py`

- [ ] **Step 1: Write the failing test** (append to `pipeline/tests/test_building_heights.py`; the file already has `bld()`):

```python
def gable(i, w, d, rh, h=2.5):
    b = bld(i, 0, 0, w, d, "gable", h=h)
    b["rh"], b["hsrc"] = rh, "dsm"
    return b


def test_cap_ridge_caps_a_canopy_ridge_to_the_default_rise():
    """#630: way 993158962, a 16.6 x 8.8 m shed under bank trees, shipped with rh 20.4."""
    b = gable(993158962, 16.6, 8.8, 20.4)
    assert BH.cap_ridge(b) is True
    assert b["rh"] == 3.5 and b["h"] == 2.5 and b["roof"] == "gable" and b["hsrc"] == "dsm"


def test_cap_ridge_keeps_ordinary_and_steep_roofs():
    for w, d, rh in [(10.0, 8.0, 3.2), (12.0, 6.0, 4.5), (10.0, 8.0, 8.0), (6.0, 11.0, 6.0)]:  # rh == short side stays
        b = gable(1, w, d, rh)
        assert BH.cap_ridge(b) is False and b["rh"] == rh


def test_cap_ridge_uses_the_short_side_whichever_way_the_rect_is_turned():
    a, b = gable(1, 5.0, 12.0, 9.0), gable(2, 12.0, 5.0, 9.0)
    BH.cap_ridge(a), BH.cap_ridge(b)
    assert a["rh"] == b["rh"] == 2.0


def test_cap_ridge_leaves_flat_roofs_and_unmeasured_buildings_alone():
    flat = gable(3, 29.3, 60.2, 32.8)
    flat["roof"] = "flat"
    osm_only = bld(4, 0, 0, 5, 5, "gable")                  # no rh, no hsrc
    assert BH.cap_ridge(flat) is False and flat["rh"] == 32.8
    assert BH.cap_ridge(osm_only) is False and "rh" not in osm_only


def test_tall_ok_recognises_churches_chapels_towers():
    for tags in [{"building": "church"}, {"building": "chapel"}, {"building": "yes", "amenity": "place_of_worship"},
                 {"building": "yes", "man_made": "tower"}, {"man_made": "chimney"}, {"building": "cathedral"}]:
        assert BH.tall_ok(tags), tags
    for tags in [{"building": "shed"}, {"building": "yes"}, {"building": "house"}, {}]:
        assert not BH.tall_ok(tags), tags
```

- [ ] **Step 2: Run, expect FAIL** (`AttributeError: module 'building_heights' has no attribute 'cap_ridge'`): `cd pipeline && python -m pytest tests/test_building_heights.py -q`.

- [ ] **Step 3: Implement** in `pipeline/building_heights.py`, after the `ROOF_MAJORITY` constant and before `roof_shape`:

```python
RIDGE_CAP_PER_SIDE = 1.0      # #630: a gable rises at most its short side (a 63 degree pitch); more is tree canopy
RIDGE_DEFAULT_PER_SIDE = 0.4  # the rise the prototype draws for a gable without a measurement (world.js roofTop)
TALL_BUILDINGS = {"church", "chapel", "cathedral", "tower"}
TALL_MAN_MADE = {"tower", "chimney", "silo", "water_tower"}


def tall_ok(tags):
    """OSM tags of a building that may legitimately rise above its width: churches, chapels, towers (#630)."""
    return (tags.get("building") in TALL_BUILDINGS or tags.get("amenity") == "place_of_worship"
            or tags.get("man_made") in TALL_MAN_MADE)


def cap_ridge(b):
    """#630: swissSURFACE3D also measures tree crowns, so a shed under bank trees came out with a 20 m gable. A gable
    measured higher than its short side gets the default rise 0.4 * short side; the eaves stay. Flat roofs and
    buildings without a measurement are not touched. True when b changed."""
    if b.get("hsrc") != "dsm" or b["roof"] != "gable":
        return False
    short = min(b["rect"][2], b["rect"][3])
    if b["rh"] <= RIDGE_CAP_PER_SIDE * short:
        return False
    b["rh"] = round(RIDGE_DEFAULT_PER_SIDE * short, 1)
    return True
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(pipeline): cap_ridge limits a DSM ridge to the short side (#630)`.

### Task 2: use it in `apply`, keep tall buildings, wire `osm.py`

**Files:** `pipeline/building_heights.py`, `pipeline/osm.py`, `pipeline/tests/test_building_heights.py`

- [ ] **Step 1: Write the failing test** (append; uses the existing `tiles` fixture, which has a 10 x 8 m gable at (40, 0) with ridge 3.2 m and a 12 x 10 m flat box at (-40, 0)). Add a third footprint to the fixture's DSM: inside `tiles`, after the two `put(...)` calls add `put(0, -60, 6, 10, lambda u, v: 6.0 + 18.0 * (1 - abs(v) / 5))   # canopy: 6 m wide, eaves 6 m, a 18 m spike` (all existing tests keep their expectations, none looks at (0, -60)); then:

```python
def test_apply_caps_a_canopy_ridge_but_not_a_listed_tall_building(tiles):
    """#630: the 6 m wide footprint measures a ridge far over its short side; a church id keeps it."""
    canopy, church = bld(20, 0, -60, 6, 10, "gable"), bld(21, 0, -60, 6, 10, "gable")
    stats = BH.apply([canopy], FRAME, *tiles)
    assert canopy["rh"] == 2.4 and stats["ridge_capped"] == 1            # 0.4 * 6 m
    stats = BH.apply([church], FRAME, *tiles, tall_ok_ids={21})
    assert church["rh"] > 6.0 and stats["ridge_capped"] == 0
```

- [ ] **Step 2: Run, expect FAIL** (`unexpected keyword tall_ok_ids`).
- [ ] **Step 3: Implement.** `apply(buildings, frame, dsm_paths, dtm_paths, min_samples=8, max_h=150.0, tall_ok_ids=frozenset())`; after `b["hsrc"] = "dsm"` and before `stats["dsm"] += 1`:

```python
            if b["id"] not in tall_ok_ids and cap_ridge(b):
                stats["ridge_capped"] += 1
```

In `pipeline/osm.py` just before the `if dsm_cache:` block compute `tall = {a.id for a in data.areas if building_heights.tall_ok(a.tags)}` and pass `tall_ok_ids=tall` to `building_heights.apply`. Update the module docstring of `building_heights.py` with one sentence on the cap and the `apply` docstring ("... ridge capped (#630)").
- [ ] **Step 4: Run** `python -m pytest tests/test_building_heights.py tests/test_world_cli.py -q`, expect PASS.
- [ ] **Step 5: Commit** `fix(pipeline): cap DSM roof ridges that pick up tree canopy (#630)`.

### Task 3: retrofit script `cap_ridges.py`

Needed because a CI runner has no `cache/osm/hochrhein.osm.pbf` and must not cut one (`docs/11-pipeline-osm.md`). Same pattern as `backfill_building_streets.py` (#578): patch the existing file, leave the rest byte-identical.

**Files:** `pipeline/cap_ridges.py` (new), `pipeline/tests/test_cap_ridges.py` (new)

- [ ] **Step 1: Write the failing test:**

```python
"""#630: retrofit the ridge cap into a world file."""
import json

import cap_ridges as CR


def world():
    def b(i, w, d, rh, roof="gable"):
        return {"id": i, "h": 2.5, "roof": roof, "rect": [0, 0, w, d, 0.0], "ring": [], "rh": rh, "hsrc": "dsm"}
    return {"buildings": [b(1, 16.6, 8.8, 20.4), b(2, 12.5, 12.0, 14.8), b(3, 10.0, 8.0, 3.2), b(4, 30.0, 29.3, 32.8, "flat"),
                          {"id": 5, "h": 6.0, "roof": "gable", "rect": [0, 0, 5, 5, 0.0], "ring": []}], "other": [1]}


def test_cap_world_changes_only_the_capped_buildings():
    w = world()
    changed = CR.cap_world(w, keep_ids={2})
    assert changed == [1] and w["buildings"][0]["rh"] == 3.5
    assert [b.get("rh") for b in w["buildings"][1:]] == [14.8, 3.2, 32.8, None] and w["other"] == [1]


def test_main_patches_the_file_in_place_and_is_idempotent(tmp_path):
    p = tmp_path / "w.json"
    p.write_text(json.dumps(world()), encoding="utf-8")
    assert CR.main(["--world", str(p), "--keep-ids", "2"]) == 0
    first = p.read_text(encoding="utf-8")
    assert json.loads(first)["buildings"][0]["rh"] == 3.5
    assert CR.main(["--world", str(p), "--keep-ids", "2"]) == 0 and p.read_text(encoding="utf-8") == first
```

- [ ] **Step 2: Run, expect FAIL** (`ModuleNotFoundError: cap_ridges`).
- [ ] **Step 3: Implement.** Read `pipeline/backfill_building_streets.py` first and copy its `main()` shape (argparse, load, patch, write back). The JSON must be written the way `osm.py` writes world files so the diff stays minimal: find that call in `osm.py` (`json.dumps(... separators ...)`) and reuse the same arguments (check by running the script on an unchanged copy of the file with `--keep-ids` of every id: the output must be byte-identical to the input; if not, fix the dump arguments first). `cap_world(world, keep_ids)` loops `world["buildings"]`, calls `building_heights.cap_ridge(b)` for ids not in `keep_ids`, returns the changed ids. `--keep-ids` is a comma list. Print `capped N buildings: <ids>`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(pipeline): cap_ridges.py retrofits the ridge cap into a world file (#630)`.

### Task 4: rebuild the world and verify by id

**Files:** `data/world_hochrhein.json`, `pipeline/tests/test_building_heights.py`

- [ ] **Step 1:** `git fetch origin && git rebase origin/main` (see Global Constraints: #629 first). Save the base: `cp data/world_hochrhein.json "$(mktemp -d)/before.json"` (own mktemp dir; remember it for step 4).
- [ ] **Step 2: Write the failing test** (append; reads the committed file, runs without the swisstopo cache):

```python
def test_committed_world_has_no_canopy_ridges():
    """#630: no gable carries a ridge above its short side except churches, chapels, towers. 210827224 (St. Wendelins-
    Kapelle) and 390841597 (Evang. Stadtkirche) are the two OSM-tagged ones in the Hochrhein world."""
    import json
    from pathlib import Path
    world = json.loads((Path(__file__).parents[2] / "data" / "world_hochrhein.json").read_text())
    over = {b["id"] for b in world["buildings"]
            if b.get("hsrc") == "dsm" and b["roof"] == "gable" and b["rh"] > min(b["rect"][2], b["rect"][3])}
    assert over == {210827224, 390841597}
    shed = next(b for b in world["buildings"] if b["id"] == 993158962)
    assert shed["rh"] == 3.5 and shed["h"] == 2.5
```

  Run it, expect FAIL (`over` has 73 ids on today's file).
- [ ] **Step 3: Produce the world, foreground, capped.** Check `ls pipeline/cache/osm/hochrhein.osm.pbf`.
  - **Extract present** (agent box, main checkout's `pipeline/cache`; copy or symlink `cache/` into the worktree): the documented full rebuild, keeping both flags:

```bash
cd pipeline
python fields_ch.py fetch --out cache/lwb/hochrhein.geojson   # skipped when cached
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python osm.py build --pbf cache/osm/hochrhein.osm.pbf \
    --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json \
    --fields cache/lwb/hochrhein.geojson --dsm-heights cache
```

    `--dsm-heights cache` needs the swissSURFACE3D/swissALTI3D tiles in `cache/` (95 files on the agent box; the build downloads missing ones, about 500 MB, under the same cap).
  - **Extract absent** (CI runner): do not cut one. Use the retrofit with the two tall ids from the spec:

```bash
cd pipeline && python cap_ridges.py --world ../data/world_hochrhein.json --keep-ids 210827224,390841597
```

  - Stop and report if the full build fails; never hand-edit the JSON.
- [ ] **Step 4: Verify by id** (one script in your own scratch dir; paths as arguments):

```python
import json, sys
before = {b["id"]: b for b in json.load(open(sys.argv[1]))["buildings"]}
after_w = json.load(open(sys.argv[2])); after = {b["id"]: b for b in after_w["buildings"]}
assert before.keys() == after.keys()
keep = {210827224, 390841597}
expect = {i for i, b in before.items() if b.get("hsrc") == "dsm" and b["roof"] == "gable"
          and b["rh"] > min(b["rect"][2], b["rect"][3]) and i not in keep}
changed = {i for i in before if before[i] != after[i]}
assert changed == expect, (sorted(changed - expect)[:10], sorted(expect - changed)[:10])
assert len(changed) == 71, len(changed)                      # 73 gables over the line minus 2 exempt, at main bca2535
for i in changed:
    b, a = before[i], after[i]
    assert {k for k in b if b[k] != a[k]} == {"rh"} and a["rh"] == round(0.4 * min(a["rect"][2], a["rect"][3]), 1)
rest = {k: v for k, v in after_w.items() if k != "buildings"}
before_w = json.load(open(sys.argv[1]))
assert rest == {k: v for k, v in before_w.items() if k != "buildings"}    # nothing outside buildings moved
print("OK", len(changed), "buildings capped")
```

  Expected `OK 71 buildings capped`. If #629's world changed other buildings' rect or the count differs by the base file, the count may differ: the id-set equality is the contract, the 71 is the number at bca2535 (state both in the PR). A full rebuild that changes anything else than `rh` of those ids (another key, another building, another top-level key) is a failure: investigate, do not paper over.
- [ ] **Step 5: Run the new test and the whole suite:** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest tests -q`. Expected PASS. A golden test that pinned a changed `rh` is the only acceptable edit, update that number only with the id and reason in the commit body.
- [ ] **Step 6: Commit** `data(world): cap canopy roof ridges on 71 buildings (#630)` with the verification output in the body.

### Task 5: docs, changelog, PR

**Files:** `docs/11-pipeline-osm.md`, `CHANGELOG.md`

- [ ] **Step 1:** `docs/11-pipeline-osm.md`, in *Building heights (#17)* add: the ridge cap (`rh` above the short side of a gable becomes `0.4 x` short side, tall-building exemptions by OSM tag, flat roofs untouched), the numbers (73 gables over the line, 71 capped, church 390841597 and chapel 210827224 kept; ratio p50 0.32, p90 0.65, p95 0.88), and `cap_ridges.py` as the way to apply it to a world file without the extract (with `--keep-ids`).
- [ ] **Step 2:** `CHANGELOG.md`, newest first under `[Unreleased]`, local time from `TZ=Europe/Zurich date '+%F %H:%M'`, 1 to 3 bold keywords, player's view: ``- `<stamp>` The **needle-like sheds** on the Rhine bank are gone: roofs that picked up the height of the trees now get a normal **roof pitch**.``
- [ ] **Step 3:** Commit `docs: ridge cap rule and changelog (#630)`, push the branch, open the PR `fix(buildings): cap DSM roof heights that pick up tree canopy` with `Closes #630`, the verification output of Task 4 Step 4 and the before/after for way 993158962 (rh 20.4 to 3.5). One in-browser look at (LV95 2640868 / 1267145) is optional; this is a data change only, run no full Playwright suite.
