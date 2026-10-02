# More Landmarks for the J List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nine more real landmarks reach the J dialog's landmark list (#41), each with its Gemeinde (#46): Schloss Schönau (Trompeterschloss), Gallusturm, Diebsturm, Bahnhof Bad Säckingen, Kursaal, Aqualon Therme, Bahnhof Eiken, Gemeindehaus Sisseln and Schulhaus Sisseln. Seven of their buildings are not in the world yet, so the pipeline must keep them.

**Architecture:** A new `keep_buildings` list in `pipeline/anchors.json` names OSM building ways that `world_buildings.build()` keeps regardless of main-road distance and area. It mirrors `exclude_buildings`. The prototype gets nine `building:` entries in `prototype/landmarks.js` `LANDMARK_INFO`, the #41 pattern of the Bodenackerstrasse houses, so positions come from the world footprints. Entries whose building is missing from the loaded world are skipped (existing behaviour). The world file is rebuilt last, behind a guard.

**Tech Stack:** Python 3 + pyosmium + shapely (pipeline, pytest); vanilla JS ES module `prototype/landmarks.js` (`node --test`); Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-02-more-landmarks-design.md`

## Global Constraints

- **Depends on #41 (PR #52).** `prototype/landmarks.js`, `prototype/tests/landmarks.test.mjs` and `prototype/tests/test_jump.py` exist only once #41 is merged. Task 0 checks this and stops if they are missing.
- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Run anything heavy (world build, golden tests, Playwright suite) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never `run_in_background`. Exit 137 means the memory cap was hit: stop and report, and do not raise the cap. If `systemd-run --user` is unavailable (CI runner), run the same command without the prefix.
- **No `osmium` cut is needed or allowed:** the existing 3.7 MB `pipeline/cache/osm/hochrhein.osm.pbf` holds every object.
- The seven kept building ids, exactly: `390621357` (Schloss Schönau), `25835477` (Gallusturm), `92036948` (Diebsturm), `25049518` (station building Bad Säckingen), `199241726` (Bahnhof Eiken), `171822808` (Gemeindehaus Sisseln), `171822721` (Schulhaus Sisseln).
- Already in the world, so they are not added to `keep_buildings`: `91592556` (contains the Kursaal node `n426864010`) and `92039355` (Aqualon Therme).
- Names and Gemeinden exactly (verified 2026-10-02 by point-in-polygon against OSM `admin_level=8`): `Schloss Schönau (Trompeterschloss)`, `Gallusturm`, `Diebsturm`, `Bahnhof Bad Säckingen`, `Kursaal`, `Aqualon Therme` are in **Bad Säckingen**; `Bahnhof Eiken` is in **Eiken**; `Gemeindehaus Sisseln` and `Schulhaus Sisseln` are in **Sisseln**.
- Kept buildings are ordinary world buildings. No new landmark `kind`, no new `anchors.landmarks` entry, no model, no label.
- No change to the J dialog UI, to `landmarkEntries`, `filterLandmarks`, `gemeindenOf` or `GEMEINDEN`.
- Commands:
  - pipeline tests: `cd pipeline && ./.venv/bin/python -m pytest -q`
  - node tests: `node --test prototype/tests/*.test.mjs` (Node 20+, from the repo root)
  - smoke tests: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q` (slow, foreground)
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** long verification runs.
- Never hand-edit `data/world_hochrhein.json`. Never commit a world built without `--dsm-heights`.

## Review Focus

- A ref listed in both `exclude_buildings` and `keep_buildings`: exclude wins (a landmark model replaces that footprint). Covered in Task 1.
- A kept building whose centroid lies outside the map clip, or that is a `roof`/`carport` or smaller than 20 m², is still dropped. Covered in Task 1.
- The prototype served with **main's current world** (not rebuilt): the seven new entries are silently skipped, and Kursaal and Aqualon already show. The list must have 17 rows then, and 24 after the rebuild. Covered in Task 3 (`WORLD46` switch).
- Accent-blind search finds the new names: `schonau`, `trompeter`, `sackingen` (the station). Covered in Task 2.
- New footprints can take an address node away from a neighbour in `_assign_numbers`, which changes that neighbour's `addr`. The Task 4 guard prints any such change instead of hiding it.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check that #41 is on `main`.**

```bash
git fetch origin && git checkout -b feature/46-more-landmarks origin/main
test -f prototype/landmarks.js && test -f prototype/tests/landmarks.test.mjs && test -f prototype/tests/test_jump.py && echo "41-OK" || echo "STOP: #41 not merged"
```

If it prints `STOP`: do nothing else. Comment on the issue: "#46 needs #41 (PR #52) merged first: prototype/landmarks.js is missing on main." Then end the run without a PR.

---

### Task 1: Pipeline — `keep_buildings`

**Files:**
- Modify: `pipeline/anchors.py` (add `keep_ids` next to `exclude_ids`)
- Modify: `pipeline/world_buildings.py` (`build()` signature and the selection condition)
- Modify: `pipeline/osm.py` (`build_world()`: pass `keep_ids`)
- Modify: `pipeline/anchors.json` (new top-level key `keep_buildings`)
- Test: `pipeline/tests/test_buildings.py`, `pipeline/tests/test_anchors.py`, `pipeline/tests/test_golden.py`

**Interfaces:**
- Produces: `anchors.keep_ids(spec: dict) -> set[int]` (ints from `spec["keep_buildings"]`, or an empty set when the key is absent).
- Produces: `world_buildings.build(areas, roads, clip, house_dist=30.0, big_area=1000.0, exclude_ids=frozenset(), industrial=(), keep_all=(), addr_nodes=(), keep_ids=frozenset())` and a new stats key `kept_landmark`.

- [ ] **Step 1: Write the failing unit tests**

Append to `pipeline/tests/test_buildings.py`:

```python
def test_keep_ids_keep_far_small_buildings_but_not_excluded_sheds_or_outside():
    far = [house(1, 0, 400),                                                   # far, 108 m2: kept by id
           house(2, 0, 500),                                                   # kept by id but also excluded
           house(3, 0, 600),                                                   # far, not listed: dropped
           Area(4, True, {"building": "yes"}, shapely.box(0, 700, 3, 703)),    # 9 m2 < 20
           Area(5, True, {"building": "roof"}, shapely.box(0, 800, 20, 820)),  # skipped type
           house(6, 0, 1500)]                                                  # outside the clip
    bl, stats = B.build(far, MAIN, CLIP, exclude_ids={2}, keep_ids={1, 2, 4, 5, 6})
    assert [b["id"] for b in bl] == [1]
    assert stats["kept_landmark"] == 1
    assert stats["excluded_landmark"] == 1


def test_keep_ids_default_keeps_nothing_extra():
    bl, _ = B.build([house(1, 0, 400)], MAIN, CLIP)
    assert bl == []
```

Append to `pipeline/tests/test_anchors.py`:

```python
def test_keep_ids():
    assert anchors.keep_ids({"keep_buildings": ["w390621357", "w25835477"]}) == {390621357, 25835477}
    assert anchors.keep_ids({}) == set()
```

Append to `pipeline/tests/test_golden.py`:

```python
KEPT_46 = {390621357, 25835477, 92036948, 25049518, 199241726, 171822808, 171822721}


def test_issue46_landmark_buildings_are_kept(world):
    """#46: named landmark buildings far from main roads are kept by id (anchors.json keep_buildings); the
    Kursaal building and the Aqualon Therme were already in the world and stay."""
    ids = {b["id"] for b in world["buildings"]}
    assert KEPT_46 <= ids, KEPT_46 - ids
    assert {91592556, 92039355} <= ids
```

- [ ] **Step 2: Run and expect FAIL**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_buildings.py tests/test_anchors.py -q
```

Expected: `TypeError: build() got an unexpected keyword argument 'keep_ids'` and `AttributeError: module 'anchors' has no attribute 'keep_ids'`.

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs -k issue46
```

Expected: FAIL with the seven ids missing, or SKIPPED without the extract.

- [ ] **Step 3: Implement**

In `pipeline/anchors.py`, below `exclude_ids`:

```python
def keep_ids(spec) -> set:
    """Building ways kept in the world regardless of main-road distance and area (landmarks for the J list, #46)."""
    return {_osm_ref(s)[1] for s in spec.get("keep_buildings", [])}
```

In `pipeline/world_buildings.py`, extend the signature with `keep_ids=frozenset()` as the last keyword. Replace the selection lines:

```python
        near = tree is not None and len(tree.query(p, predicate="dwithin", distance=house_dist)) > 0
        in_quarter = not near and quarters is not None and quarters.contains(p.centroid)
        if not near and not in_quarter and (big_area <= 0 or p.area < big_area):
            continue
```

with:

```python
        near = tree is not None and len(tree.query(p, predicate="dwithin", distance=house_dist)) > 0
        in_quarter = not near and quarters is not None and quarters.contains(p.centroid)
        listed = not near and not in_quarter and a.id in keep_ids     # named landmark kept by id (#46)
        if not near and not in_quarter and not listed and (big_area <= 0 or p.area < big_area):
            continue
```

Then replace the stats line:

```python
        stats["kept_near" if near else "kept_area" if in_quarter else "kept_big"] += 1
```

with:

```python
        stats["kept_near" if near else "kept_area" if in_quarter else "kept_landmark" if listed else "kept_big"] += 1
```

The exclude, type-skip, degenerate, 20 m² and clip checks stay before this and so still apply to kept ids.

In `pipeline/osm.py` `build_world()`, extend the call:

```python
    buildings, stats = world_buildings.build(data.areas, roads, clip, house_dist, big_area,
                                             anchors_mod.exclude_ids(spec), sites,
                                             anchors_mod.keep_all_boxes(spec, resolved),
                                             addr_nodes=data.addr_nodes, keep_ids=anchors_mod.keep_ids(spec))
```

In `pipeline/anchors.json`, add after the `"exclude_buildings"` line (put a comma after its closing `]`):

```json
  "keep_buildings": [ "w390621357", "w25835477", "w92036948", "w25049518", "w199241726", "w171822808", "w171822721" ]
```

- [ ] **Step 4: Run and expect PASS**

```bash
cd pipeline && ./.venv/bin/python -m pytest -q
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected: all pass. The golden file passes where `pipeline/cache/osm/hochrhein.osm.pbf` exists and skips otherwise.

- [ ] **Step 5: Commit**

```bash
git add pipeline/anchors.py pipeline/world_buildings.py pipeline/osm.py pipeline/anchors.json pipeline/tests/test_buildings.py pipeline/tests/test_anchors.py pipeline/tests/test_golden.py
git commit -m "feat(pipeline): keep named landmark buildings by id (#46)"
```

---

### Task 2: Prototype — nine new J list entries

**Files:**
- Modify: `prototype/landmarks.js` (`LANDMARK_INFO`)
- Test: `prototype/tests/landmarks.test.mjs`

**Interfaces:**
- Consumes: `LANDMARK_INFO`, `landmarkEntries(info, anchors, buildings)`, `filterLandmarks(entries, query, gemeinde)` from #41 (unchanged).
- Produces: `LANDMARK_INFO` with 23 entries.

- [ ] **Step 1: Write the failing tests**

In `prototype/tests/landmarks.test.mjs`, replace the test `'LANDMARK_INFO holds the 14 landmarks of the spec'` with this version. The landmark set changes by design in #46.

```js
const BUILDINGS_46 = [
  ['Schloss Schönau (Trompeterschloss)', 'Bad Säckingen', 390621357],
  ['Gallusturm', 'Bad Säckingen', 25835477],
  ['Diebsturm', 'Bad Säckingen', 92036948],
  ['Bahnhof Bad Säckingen', 'Bad Säckingen', 25049518],
  ['Kursaal', 'Bad Säckingen', 91592556],
  ['Aqualon Therme', 'Bad Säckingen', 92039355],
  ['Bahnhof Eiken', 'Eiken', 199241726],
  ['Gemeindehaus Sisseln', 'Sisseln', 171822808],
  ['Schulhaus Sisseln', 'Sisseln', 171822721],
];

test('LANDMARK_INFO holds the 14 landmarks of #41 and the 9 of #46', () => {
  assert.equal(LANDMARK_INFO.length, 23);
  for (const l of LANDMARK_INFO) {
    assert.ok(GEMEINDEN.includes(l.gemeinde), l.name);
    assert.ok(!!l.anchor !== !!l.building, `${l.name}: exactly one of anchor / building`);
  }
  assert.deepEqual(GEMEINDEN, ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln']);
  assert.deepEqual(LANDMARK_INFO.filter(l => l.building).map(l => [l.name, l.gemeinde, l.building]),
    [['Schloss Schönau (Trompeterschloss)', 'Bad Säckingen', 390621357], ['Gallusturm', 'Bad Säckingen', 25835477],
     ['Diebsturm', 'Bad Säckingen', 92036948], ['Bahnhof Bad Säckingen', 'Bad Säckingen', 25049518],
     ['Kursaal', 'Bad Säckingen', 91592556], ['Aqualon Therme', 'Bad Säckingen', 92039355],
     ['Bahnhof Eiken', 'Eiken', 199241726],
     ['Bodenackerstrasse 6c', 'Sisseln', 171822634], ['Bodenackerstrasse 10B', 'Sisseln', 171822943],
     ['Gemeindehaus Sisseln', 'Sisseln', 171822808], ['Schulhaus Sisseln', 'Sisseln', 171822721]]);
});

test('#46 entries resolve from their buildings, sort into their Gemeinde and are found accent-blind', () => {
  const square = (id, x) => ({ id: String(id), ring: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]] });
  const buildings = BUILDINGS_46.map(([, , id], i) => square(id, i * 100));
  const e = landmarkEntries(LANDMARK_INFO, {}, buildings);              // no anchors: only the building entries
  assert.deepEqual(e.map(x => [x.n, x.g]), BUILDINGS_46.map(([n, g]) => [n, g]));
  assert.deepEqual(e.find(x => x.n === 'Kursaal'), { n: 'Kursaal', g: 'Bad Säckingen', x: 405, z: 5 });
  assert.deepEqual(filterLandmarks(e, 'schonau', null).map(x => x.n), ['Schloss Schönau (Trompeterschloss)']);
  assert.deepEqual(filterLandmarks(e, 'trompeter', null).map(x => x.n), ['Schloss Schönau (Trompeterschloss)']);
  assert.deepEqual(filterLandmarks(e, 'bahnhof bad sackingen', null).map(x => x.n), ['Bahnhof Bad Säckingen']);
  assert.deepEqual(filterLandmarks(e, '', 'Eiken').map(x => x.n), ['Bahnhof Eiken']);
});
```

- [ ] **Step 2: Run and expect FAIL**

`node --test prototype/tests/*.test.mjs`. Expected: `23 !== 14`, and an empty entry list for the #46 test.

- [ ] **Step 3: Implement**

In `prototype/landmarks.js` `LANDMARK_INFO`, insert:

- after `{ name: 'Fridolinsbrücke', … }`:

```js
  { name: 'Schloss Schönau (Trompeterschloss)', gemeinde: 'Bad Säckingen', building: 390621357 },
  { name: 'Gallusturm', gemeinde: 'Bad Säckingen', building: 25835477 },
  { name: 'Diebsturm', gemeinde: 'Bad Säckingen', building: 92036948 },
  { name: 'Bahnhof Bad Säckingen', gemeinde: 'Bad Säckingen', building: 25049518 },     // station building of n313032305
  { name: 'Kursaal', gemeinde: 'Bad Säckingen', building: 91592556 },                  // contains n426864010
  { name: 'Aqualon Therme', gemeinde: 'Bad Säckingen', building: 92039355 },
```

- after `{ name: 'Bahnhof Sisseln', … }`:

```js
  { name: 'Bahnhof Eiken', gemeinde: 'Eiken', building: 199241726 },
```

- after `{ name: 'Sprungschanze', … }`:

```js
  { name: 'Gemeindehaus Sisseln', gemeinde: 'Sisseln', building: 171822808 },
  { name: 'Schulhaus Sisseln', gemeinde: 'Sisseln', building: 171822721 },
```

Change the comment above `LANDMARK_INFO` to `// Gemeinden verified against OpenStreetMap on 2026-10-02 (#41, #46)`.

- [ ] **Step 4: Run and expect PASS**

`node --test prototype/tests/*.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs
git commit -m "feat(prototype): nine more landmarks in the J list (#46)"
```

---

### Task 3: Browser tests follow the longer list

**Files:**
- Modify: `prototype/tests/test_jump.py`

**Interfaces:**
- Consumes: `window.__mm.jumpList()` and `window.__mm.car()` (from #41), `LANDMARK_INFO` from Task 2.

These tests run against the served `data/world_hochrhein.json`. Before Task 4, that is `main`'s world: Kursaal and Aqualon are in it, the seven kept buildings are not, so 16 landmarks + Random spot = **17** rows. After Task 4 there are 23 + 1 = **24**. The test pins both states exactly, keyed on whether building `390621357` is in the world file.

- [ ] **Step 1: Write the failing tests**

Below `needs_world = …` add:

```python
def _world_building_ids():
    return {b["id"] for b in json.loads(WORLD.read_text(encoding="utf-8"))["buildings"]} if WORLD.exists() else set()


WORLD46 = 390621357 in _world_building_ids()            # world rebuilt with #46's kept buildings
needs_world46 = pytest.mark.skipif(not WORLD46, reason="world not rebuilt for #46 (Task 4 of docs/superpowers/plans/2026-10-02-more-landmarks.md)")
ALL_ROWS = 24 if WORLD46 else 17                         # landmarks shown + Random spot
```

Replace the `SISSELN_ROWS = [...]` line with:

```python
SISSELN_ROWS = ["DSM-Wasserturm", "Smile-Kreisel", "Hallenbad Sissila", "Bodenackerstrasse 6c", "Bodenackerstrasse 10B", "Sprungschanze"] \
    + (["Gemeindehaus Sisseln", "Schulhaus Sisseln"] if WORLD46 else [])
```

Add a helper below `anchor()`:

```python
def building_mean(bid):
    ring = next(b["ring"] for b in json.loads(WORLD.read_text(encoding="utf-8"))["buildings"] if b["id"] == bid)
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
```

In `test_j_opens_the_landmark_list_with_focus_in_the_search_field`, change `assert len(r) == 15` to `assert len(r) == ALL_ROWS`.

In `test_j_types_with_text_and_closes_when_empty_esc_closes`, change `assert len(rows(page)) == 15` to `assert len(rows(page)) == ALL_ROWS`.

Append two tests:

```python
@needs_world
def test_kursaal_is_listed_and_jumpable(server):
    """#46: the Kursaal's building (w91592556) is already in the world, so it is listed before the rebuild too."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("kursaal")
        assert rows(page) == [{"n": "Kursaal", "g": "Bad Säckingen"}, {"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        kx, kz = building_mean(91592556)
        c = car(page)
        assert math.hypot(c["x"] - kx, c["z"] - kz) < 80
        b.close()


@needs_world46
def test_kept_landmark_buildings_are_listed_and_jumpable(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("trompeter")
        assert names(page) == ["Schloss Schönau (Trompeterschloss)", "Random spot"]
        page.fill("#jumpq", "")
        page.click('#jumpchips button[data-g="Eiken"]')
        assert names(page) == ["DSM-Kamin", "Bahnhof Sisseln", "Bahnhof Eiken", "Random spot"]
        page.click('#jumpchips button[data-g="All"]')
        page.keyboard.type("gallus")
        page.keyboard.press("Enter")
        gx, gz = building_mean(25835477)
        c = car(page)
        assert math.hypot(c["x"] - gx, c["z"] - gz) < 80
        b.close()
```

- [ ] **Step 2: Watch it fail, then pass**

First check the red state against the #41 version of the list. Restore `landmarks.js` from `origin/main` and run the Kursaal test:

```bash
git show origin/main:prototype/landmarks.js > prototype/landmarks.js
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -rs -k "kursaal or opens"
```

Expected: FAIL. `kursaal` yields only Random spot, and the list has 15 rows, not 17.

Then restore Task 2's version and run the whole file:

```bash
git checkout -- prototype/landmarks.js
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -rs
```

Expected with `main`'s world: everything passes, and `test_kept_landmark_buildings_are_listed_and_jumpable` is SKIPPED (world not rebuilt for #46).

- [ ] **Step 3: Commit, then push the branch**

```bash
git add prototype/tests/test_jump.py
git commit -m "test(prototype): J list counts follow the #46 landmarks (#46)"
git push -u origin HEAD
```

---

### Task 4: Rebuild the world file (with measured heights), guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

**Interfaces:**
- Consumes: Task 1 (pipeline). Tasks 2–3 do not depend on this task.

The branch is already pushed (Task 3), so the work is safe if this task stops.

- [ ] **Step 1: Cache check, and STOP if it fails.** The build needs the local caches, and a CI runner usually has none of them:

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP`, skip to Task 5 and do none of the following:

- run the build;
- touch or commit `data/world_hochrhein.json`;
- let the build download tiles;
- attempt an `osmium` cut.

State in the PR description: "World not rebuilt: pipeline caches missing on this machine. Run Task 4 of docs/superpowers/plans/2026-10-02-more-landmarks.md locally. Until then the J list shows Kursaal and Aqualon Therme, but not the seven kept buildings."

- [ ] **Step 2: Golden tests first** (they must pass on the real extract, not skip):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected: all pass, with no `SKIPPED`.

- [ ] **Step 3: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected in the log:

- `building heights from swissSURFACE3D: {...}`;
- the summary's buildings stats contain `'kept_landmark': 7`;
- the building count is 7 higher than `main`'s (1885 → 1892 at the time of writing).

- [ ] **Step 4: Guard: the world may differ from `main` only by the seven buildings** (plus `params.built`, plus a reported house-number shift on neighbours):

```bash
git fetch origin main
git show origin/main:data/world_hochrhein.json > /tmp/world_main.json
./pipeline/.venv/bin/python - <<'EOF'
import json
a = json.load(open("/tmp/world_main.json", encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
KEEP = {390621357, 25835477, 92036948, 25049518, 199241726, 171822808, 171822721}
for w in (a, b): w["params"].pop("built", None)
ob = {x["id"]: x for x in a.pop("buildings")}; nb = {x["id"]: x for x in b.pop("buildings")}
assert a == b, ["non-building keys differ:", [k for k in set(a) | set(b) if a.get(k) != b.get(k)]]
assert set(nb) - set(ob) == KEEP, ("added", set(nb) - set(ob), "missing", KEEP - set(nb))
assert set(ob) <= set(nb), ("dropped", set(ob) - set(nb))
bad, addr = [], []
for i, o in ob.items():
    if o != nb[i]:
        keys = {k for k in set(o) | set(nb[i]) if o.get(k) != nb[i].get(k)}
        (addr if keys == {"addr"} else bad).append((i, sorted(keys), o.get("addr"), nb[i].get("addr")))
assert not bad, ("existing buildings changed beyond addr", bad[:10])
assert sum(1 for x in nb.values() if x.get("hsrc") == "dsm") > 1500        # measured heights kept
print("guard ok: +", len(KEEP), "buildings; addr changes on neighbours:", addr)
EOF
```

Expected: `guard ok: + 7 buildings; addr changes on neighbours: []`. A non-empty addr list is allowed, but list every entry in the PR description.

If the guard fails: **STOP**, run `git checkout -- data/world_hochrhein.json`, and report the differing keys. They may be keys that other issues added to the pipeline without rebuilding `main`'s world file (for example `boundaries` from #48). If so, say so in the PR and leave the rebuild to the maintainer.

- [ ] **Step 5: Commit**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild world with the #46 landmark buildings (#46)"
```

---

### Task 5: Changelog, playtest note, full verification

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Added`)
- Modify: `test-todo.md`

- [ ] **Step 1: Changelog entry** (player-facing, English, appended under `[Unreleased]` → `### Added`):

```markdown
- Nine more places in the **J** list: Schloss Schönau (the Trompeterschloss), Gallusturm, Diebsturm, Bahnhof Bad Säckingen, the Kursaal and the Aqualon Therme in Bad Säckingen, Bahnhof Eiken, and the Gemeindehaus and Schulhaus in Sisseln. Their buildings now stand in the world too, even away from the main roads.
```

- [ ] **Step 2: Playtest note** (append to `test-todo.md`):

```markdown
- [ ] #46: J → type `trompeter`, `gallus`, `dieb`, `kursaal`, `aqualon`; chip Eiken → Bahnhof Eiken; chip Sisseln → Gemeindehaus Sisseln, Schulhaus Sisseln. Each jump lands next to its building, and the building stands there (Schloss Schönau and the Diebsturm in the old town, away from main roads).
```

- [ ] **Step 3: Commit, push, then run every suite in the foreground:**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(changelog): more landmarks in the J list (#46)"
git push
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q
cd .. && node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q -rs
```

Expected: all green. `test_kept_landmark_buildings_are_listed_and_jumpable` runs if Task 4 ran, and skips with its reason otherwise.

- [ ] **Step 4: PR description** says:
  - which buildings are kept, and why Kursaal and Aqualon need no keep entry;
  - whether Task 4 ran (and any addr changes on neighbours), or why not;
  - `Closes #46`.
