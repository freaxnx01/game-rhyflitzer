# LANDI Tower Landmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 56 m LANDI silo tower at Sisslerstrasse 19.1 (OSM `w197688923`, Eiken, by Bahnhof Sisseln) stands in the OSM world as a solid concrete tower, and the **J** list offers it as **LANDI-Turm** (Eiken) so the car can jump to it (#81).

**Architecture:** A new `landiTurm` entry in `pipeline/anchors.json` `landmarks` resolves the OSM footprint to a position, keeps its house number, and carries the measured height (56 m), size (35.4 × 12.6 m) and heading (82.2°); the footprint goes into `exclude_buildings` so no generic box is drawn there. The prototype gets a `siloTower()` model placed by anchor key next to `dsmChimney` / `waterTower`, and `LANDMARK_INFO` gets an anchor entry. Until the world file is rebuilt (guarded local task), the entry and the model are simply absent, as with #46.

**Tech Stack:** Python 3 + pyosmium + shapely + rasterio (pipeline, pytest); vanilla JS + three.js in the buildless `prototype/index.html`; ES module `prototype/landmarks.js` (`node --test`); Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-landi-tower-design.md`

## Global Constraints

- **Depends on #46 being on `main`** (`keep_buildings`, 23 `LANDMARK_INFO` entries, `WORLD46` in `test_jump.py`). Task 0 checks this.
- The facts, exactly: OSM way **`197688923`** (`"w197688923"`), height **56**, size **[35.4, 12.6]**, heading **82.2** degrees, kind **`"silo"`**, anchor key **`landiTurm`**, J name **`LANDI-Turm`**, Gemeinde **`Eiken`**. Resolved position ≈ (1832.7, 627.7), `addr` `"19.1"`.
- No LANDI lettering, logo or green livery on the model (docs/07-brands-and-permissions.md). The name appears only as text in the J list.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments). Match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()` (the seeded RNG), so no other building changes its look.
- No change to the J dialog UI, to `landmarkEntries`, `filterLandmarks`, `gemeindenOf` or `GEMEINDEN`.
- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally, verify green.
- Run anything heavy (golden tests, world build, Playwright) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never `run_in_background`. Exit 137 means the memory cap was hit: stop and report, do not raise the cap. Without `systemd-run --user` (CI runner), run the same command without the prefix.
- **No `osmium` cut is needed or allowed:** `pipeline/cache/osm/hochrhein.osm.pbf` (3.7 MB) holds the footprint.
- Commands (from the repo root):
  - pipeline tests: `cd pipeline && ./.venv/bin/python -m pytest -q`
  - node tests: `node --test prototype/tests/*.test.mjs` (Node 20+)
  - browser tests: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py ../prototype/tests/test_landi_tower.py -q -rs` (slow, foreground)
  - one-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs and before the rebuild.
- Never hand-edit `data/world_hochrhein.json`. Never commit a world built without `--dsm-heights cache`.

## Review Focus

- **Anchor key missing from the served world** (every CI run, and `main` until the rebuild): no model, no J row, no error. The browser tests key every count on `WORLD81` (Task 3).
- **Double drawing:** the footprint must not also appear as a generic building once the world is rebuilt. The golden test asserts `197688923` is in no `buildings` entry (Task 1).
- **Heading convention:** `box()`'s `w` runs along heading `rot` (`rotateY(-rot)`), and `heading_deg` 82.2 means the long side runs almost north–south. The size is `[long, short]` = `[35.4, 12.6]`, so `siloTower(x, z, rot, w=35.4, d=12.6, h)`. A swapped `w`/`d` turns the tower 90°. Pinned by the solidity test driving in from the **west** across the short side (Task 3).
- **Solidity:** the car must stop at the tower, not drive through (Task 3, `__mm.sim`).
- **Rebuild side effects:** the rebuilt world may differ from `main`'s only by the new anchor and `params.built`; the guard in Task 4 stops on anything else.

---

## File map

- `pipeline/anchors.json`: `landmarks.landiTurm` (new, after `dsmWaterTower`), `exclude_buildings` (+ `"w197688923"`).
- `pipeline/tests/test_anchors.py`, `pipeline/tests/test_golden.py`: new tests (Task 1).
- `prototype/landmarks.js`: `LANDMARK_INFO` Eiken block (`:19-21`) gets the entry (Task 2).
- `prototype/tests/landmarks.test.mjs`: count test replaced, one new test (Task 2).
- `prototype/index.html`: `siloTower()` after `waterTower()` (`:559-565`); placement in the landmark block (`:782-792`, after the `dsmWaterTower` line `:785`) (Task 3).
- `prototype/tests/test_jump.py` (`WORLD81`, `ALL_ROWS`, Eiken chip rows, one new test) and `prototype/tests/test_landi_tower.py` (new) (Task 3).
- `data/world_hochrhein.json`: generated (Task 4).
- `CHANGELOG.md`, `test-todo.md` (Task 5).

Line numbers are from `main` @ `ea601a2`. Verify them with `grep -n` before editing.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Branch from `main` and check that #46 is there.**

```bash
git fetch origin && git checkout -b feature/81-landi-tower origin/main
grep -q keep_buildings pipeline/anchors.json && grep -q "WORLD46" prototype/tests/test_jump.py && grep -q "Schulhaus Sisseln" prototype/landmarks.js && echo "46-OK" || echo "STOP: #46 not merged"
```

If it prints `STOP`: do nothing else. Comment on the issue: "#81 needs #46 merged first (keep_buildings, 23-entry LANDMARK_INFO, WORLD46 in test_jump.py)." Then end the run without a PR.

---

### Task 1: Pipeline — the `landiTurm` anchor and the excluded footprint

**Files:**
- Modify: `pipeline/anchors.json`
- Test: `pipeline/tests/test_anchors.py`, `pipeline/tests/test_golden.py`

**Interfaces:**
- Consumes: `anchors.resolve(spec, data, frame)` (passes `h`, `kind`, `heading_deg` → `rot`, `size`, `addr` through; `pipeline/anchors.py:60-69`), `anchors.exclude_ids(spec)` (`:87`). Unchanged.
- Produces: `world["anchors"]["landmarks"]["landiTurm"] = { x: 1832.7, z: 627.7, kind: "silo", h: 56, rot: 1.4346, size: [35.4, 12.6], addr: "19.1" }` (x, z rounded to 0.1 by `resolve`) and `197688923 ∉ {b["id"] for b in world["buildings"]}`.

- [ ] **Step 1: Write the failing tests.** Append to `pipeline/tests/test_anchors.py`:

```python
def test_osm_landmark_passes_size_heading_and_house_number_through():
    """#81: the LANDI tower anchor carries measured height, footprint size, heading and the OSM house number."""
    data = OsmData(areas=[Area(197688923, True, {"building": "commercial", "addr:housenumber": "19.1"}, shapely.box(1826, 621, 1839, 634))])
    spec = {"landmarks": {"landiTurm": {"osm": "w197688923", "h": 56, "kind": "silo", "heading_deg": 82.2, "size": [35.4, 12.6]}}}
    t = anchors.resolve(spec, data, F)["landmarks"]["landiTurm"]
    assert t["x"] == pytest.approx(1832.5) and t["z"] == pytest.approx(627.5)
    assert t["h"] == 56 and t["kind"] == "silo" and t["addr"] == "19.1"
    assert t["size"] == [35.4, 12.6]
    assert t["rot"] == pytest.approx(math.radians(82.2))


def test_repo_anchors_place_the_landi_tower_and_exclude_its_footprint():
    spec = anchors.load(Path(__file__).parents[1] / "anchors.json")
    t = spec["landmarks"]["landiTurm"]
    assert t["osm"] == "w197688923" and t["h"] == 56 and t["kind"] == "silo"
    assert t["size"] == [35.4, 12.6] and t["heading_deg"] == 82.2
    assert 197688923 in anchors.exclude_ids(spec)
```

Add `import math` and `from pathlib import Path` to the imports at the top of the file if they are not there yet.

Append to `pipeline/tests/test_golden.py`:

```python
def test_issue81_landi_tower_anchor(world):
    """#81: the LANDI silo tower (Sisslerstrasse 19.1, Eiken, w197688923) is an anchor with its measured height, and its
    footprint is not also drawn as a generic building."""
    t = world["anchors"]["landmarks"]["landiTurm"]
    assert abs(t["x"] - 1832.7) < 2 and abs(t["z"] - 627.7) < 2, t
    assert t["h"] == 56 and t["kind"] == "silo" and t["size"] == [35.4, 12.6] and t["addr"] == "19.1", t
    assert abs(t["rot"] - 1.4346) < 1e-3, t
    assert all(b["id"] != 197688923 for b in world["buildings"])
```

- [ ] **Step 2: Run and expect FAIL.**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_anchors.py -q
```

Expected: `test_osm_landmark_passes_size_heading_and_house_number_through` passes already (the pass-through exists), `test_repo_anchors_place_the_landi_tower_and_exclude_its_footprint` fails with `KeyError: 'landiTurm'`.

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs -k issue81
```

Expected: FAIL with `KeyError: 'landiTurm'`, or SKIPPED without the extract.

- [ ] **Step 3: Implement.** In `pipeline/anchors.json`, insert after the `"dsmWaterTower"` line:

```json
    "landiTurm":        { "osm": "w197688923", "h": 56, "kind": "silo", "heading_deg": 82.2, "size": [35.4, 12.6], "src": "LANDI silo tower, Sisslerstrasse 19.1 Eiken, by Bahnhof Sisseln (#81): height = swissSURFACE3D flat top over the footprint (p50 55.8, p90 56.0 m above ground), size and heading from the OSM footprint's rotated rectangle" },
```

Change the `"exclude_buildings"` line to:

```json
  "exclude_buildings": [ "w806132044", "w194161080", "w1559348004", "w557475162", "w170395848", "w197688923" ],
```

- [ ] **Step 4: Run and expect PASS.**

```bash
cd pipeline && ./.venv/bin/python -m pytest -q
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected: all pass (the golden file skips without the extract).

- [ ] **Step 5: Commit.**

```bash
git add pipeline/anchors.json pipeline/tests/test_anchors.py pipeline/tests/test_golden.py
git commit -m "feat(pipeline): LANDI tower anchor by Bahnhof Sisseln (#81)"
```

---

### Task 2: Prototype — the `LANDI-Turm` J entry

**Files:**
- Modify: `prototype/landmarks.js:19-21`
- Test: `prototype/tests/landmarks.test.mjs`

**Interfaces:**
- Consumes: `LANDMARK_INFO`, `landmarkEntries(info, anchors, buildings)`, `filterLandmarks(entries, query, gemeinde)` (unchanged).
- Produces: `LANDMARK_INFO` with 24 entries; `{ name: 'LANDI-Turm', gemeinde: 'Eiken', anchor: 'landiTurm' }` as the last Eiken entry.

- [ ] **Step 1: Write the failing tests.** In `prototype/tests/landmarks.test.mjs`, replace the test `'LANDMARK_INFO holds the 14 landmarks of #41 and the 9 of #46'` with:

```js
test('LANDMARK_INFO holds the 14 landmarks of #41, the 9 of #46 and the LANDI tower of #81', () => {
  assert.equal(LANDMARK_INFO.length, 24);
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
  assert.deepEqual(LANDMARK_INFO.filter(l => l.gemeinde === 'Eiken').map(l => l.name), ['DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm']);
});
```

Append at the end of the file:

```js
test('#81 LANDI-Turm resolves from its anchor, sits last in Eiken and is found by "landi"', () => {
  const anchors = { dsmChimney: { x: 1065.2, z: 345.1 }, stationSisseln: { x: 1854.2, z: 685.8 }, landiTurm: { x: 1832.7, z: 627.7 } };
  const e = landmarkEntries(LANDMARK_INFO, anchors, [{ id: '199241726', ring: [[2600, 900], [2610, 900], [2610, 910], [2600, 910]] }]);
  assert.deepEqual(e.map(x => x.n), ['DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm']);
  assert.deepEqual(e.find(x => x.n === 'LANDI-Turm'), { n: 'LANDI-Turm', g: 'Eiken', x: 1832.7, z: 627.7 });
  assert.deepEqual(filterLandmarks(e, 'landi', null).map(x => x.n), ['LANDI-Turm']);
  assert.deepEqual(filterLandmarks(e, 'LANDI', 'Eiken').map(x => x.n), ['LANDI-Turm']);
  assert.deepEqual(landmarkEntries(LANDMARK_INFO, { dsmChimney: anchors.dsmChimney }, []).map(x => x.n), ['DSM-Kamin']);   // anchor missing: skipped
});
```

- [ ] **Step 2: Run and expect FAIL.**

```bash
node --test prototype/tests/*.test.mjs
```

Expected: `24 !== 23`, the Eiken list lacks `LANDI-Turm`, and the new test finds three Eiken entries instead of four.

- [ ] **Step 3: Implement.** In `prototype/landmarks.js`, insert after the `{ name: 'Bahnhof Eiken', … }` line:

```js
  { name: 'LANDI-Turm', gemeinde: 'Eiken', anchor: 'landiTurm' },                    // Sisslerstrasse 19.1, w197688923 (#81)
```

Change the comment above `LANDMARK_INFO` to `// Gemeinden verified against OpenStreetMap on 2026-10-02/03 (#41, #46, #81)`.

- [ ] **Step 4: Run and expect PASS.**

```bash
node --test prototype/tests/*.test.mjs
```

Expected: all pass (`landmarks`, `strings`, `debug`, `world`).

- [ ] **Step 5: Commit.**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs
git commit -m "feat(prototype): LANDI-Turm in the J list (#81)"
```

---

### Task 3: Prototype — the `siloTower` model and the browser tests

**Files:**
- Modify: `prototype/index.html` (new `siloTower()` after `waterTower()` `:559-565`; one line in the landmark block after `:785`)
- Modify: `prototype/tests/test_jump.py:20-24` and `:240-255`, plus one new test
- Create: `prototype/tests/test_landi_tower.py`

**Interfaces:**
- Consumes: `box(w, h, d, x, y, z, rot, c, role, tile, dark)` (`:436`), `addOBB(x, z, w, d, rot, h)` (`:480`), `terrainH(x, z)` (`:380`), `col()`, the anchor `L.anchors.landmarks.landiTurm` from Task 1 (`{ x, z, rot, h, size }`).
- Produces: `function siloTower(x, z, rot, w, d, h)`; `window.__mm.counts.landiTurm === 1` once built; test hooks already present: `__mm.sim(x, z, th, v, secs)`, `__mm.wallRoleAt(x, z, tx, tz)`, `__mm.car()`, `__mm.jumpList()`.

- [ ] **Step 1: Write the failing browser tests.** In `prototype/tests/test_jump.py`, below the `SISSELN_ROWS = …` lines (`:23-24`), add:

```python
def _world_anchor_keys():
    return set(json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"]) if WORLD.exists() else set()


WORLD81 = "landiTurm" in _world_anchor_keys()           # world rebuilt with the #81 LANDI tower anchor
needs_world81 = pytest.mark.skipif(not WORLD81, reason="world not rebuilt for #81 (Task 4 of docs/superpowers/plans/2026-10-03-landi-tower.md)")
EIKEN_ROWS = ["DSM-Kamin", "Bahnhof Sisseln"] + (["Bahnhof Eiken"] if WORLD46 else []) + (["LANDI-Turm"] if WORLD81 else [])
```

Change the `ALL_ROWS = …` line to:

```python
ALL_ROWS = (24 if WORLD46 else 17) + (1 if WORLD81 else 0)   # landmarks shown + Random spot
```

In `test_kept_landmark_buildings_are_listed_and_jumpable`, replace

```python
        assert names(page) == ["DSM-Kamin", "Bahnhof Sisseln", "Bahnhof Eiken", "Random spot"]
```

with

```python
        assert names(page) == EIKEN_ROWS + ["Random spot"]
```

Append to the file:

```python
@needs_world81
def test_landi_tower_is_listed_and_jumpable(server):
    """#81: 'landi' finds the LANDI-Turm (Eiken, by Bahnhof Sisseln); Enter puts the car on a road within 80 m of the tower."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("landi")
        assert rows(page) == [{"n": "LANDI-Turm", "g": "Eiken"}, {"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        tx, tz = anchor("landiTurm")
        c = car(page)
        assert math.hypot(c["x"] - tx, c["z"] - tz) < 80
        b.close()
```

Create `prototype/tests/test_landi_tower.py`:

```python
"""#81: the LANDI silo tower by Bahnhof Sisseln stands at its anchor as a solid concrete tower.
Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def _anchor():
    if not WORLD.exists():
        return None
    return json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"].get("landiTurm")


TOWER = _anchor()
needs_tower = pytest.mark.skipif(TOWER is None, reason="world not rebuilt for #81 (Task 4 of docs/superpowers/plans/2026-10-03-landi-tower.md)")


def open_page(p, server):
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    return br, page


@needs_tower
def test_tower_is_built_once_and_its_west_wall_is_concrete(server):
    """The model counts itself, and a ray from 30 m west of the centre hits the 'stone' slab (the long side runs
    roughly north-south, so west is across the 12.6 m short side)."""
    x, z = TOWER["x"], TOWER["z"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        assert page.evaluate("() => window.__mm.counts.landiTurm") == 1
        role = page.evaluate(f"() => window.__mm.wallRoleAt({x - 30}, {z}, {x}, {z})")
        br.close()
    assert role == "stone", role


@needs_tower
def test_tower_stops_the_car(server):
    """Driving east at the tower from 30 m west at 15 m/s for 3 s (45 m without an obstacle), the car must be stopped by
    the tower and never come out on its far side."""
    x, z = TOWER["x"], TOWER["z"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        r = page.evaluate(f"() => window.__mm.sim({x - 30}, {z}, 0, 15, 3)")
        br.close()
    assert r["x"] < x, r
```

- [ ] **Step 2: Run the browser tests against the current world: new tests SKIP, old ones PASS.**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py ../prototype/tests/test_landi_tower.py -q -rs
```

Expected: everything that ran passes; `test_landi_tower_is_listed_and_jumpable`, `test_tower_is_built_once_and_its_west_wall_is_concrete` and `test_tower_stops_the_car` are SKIPPED with "world not rebuilt for #81". (They go red-then-green in Task 4 Step 6, against the rebuilt world.)

- [ ] **Step 3: Implement the model.** In `prototype/index.html`, insert after the `waterTower` function (its closing `}` at `:565`):

```js
function siloTower(x, z, rot, w, d, h) { // #81 LANDI silo tower by Bahnhof Sisseln: flat-roofed concrete slab (w along rot, d across), small head house on the roof, no lettering (docs/07); solid
  const b = terrainH(x, z);
  box(w, h + 1, d, x, b - 1, z, rot, col('#c9c5bd'), 'stone', [6, 6], 2.5);
  box(9, 2.5, Math.max(3, d - 3), x, b + h, z, rot, col('#b5b1a9'), 'stone', [3, 3], 0);
  addOBB(x, z, w, d, rot, b + h);
  window.__mm.counts.landiTurm = 1;
}
```

In the landmark block (`:782-792`), insert after the `if (at('dsmWaterTower')) …` line:

```js
    if (at('landiTurm')) { const t = at('landiTurm'), s = t.size || [35.4, 12.6]; siloTower(t.x, t.z, t.rot || 0, s[0], s[1], t.h || 56); }
```

- [ ] **Step 4: Check the page still loads with the current world (the anchor is absent, so nothing changes).**

```bash
node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -rs -k opens
```

Expected: PASS. `test_j_opens_the_landmark_list_with_focus_in_the_search_field` loads the whole world and the J list with the new `siloTower` code present but unused, so a syntax slip in `index.html` shows up here.

- [ ] **Step 5: Commit and push the branch** (before the long runs that follow).

```bash
git add prototype/index.html prototype/tests/test_jump.py prototype/tests/test_landi_tower.py
git commit -m "feat(prototype): LANDI silo tower model by Bahnhof Sisseln (#81)"
git push -u origin HEAD
```

---

### Task 4: Rebuild the world file (with measured heights), guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

**Interfaces:**
- Consumes: Task 1 (anchor + exclusion). Tasks 2–3 do not depend on this task.

The branch is already pushed (Task 3), so the work is safe if this task stops.

- [ ] **Step 1: Cache check, and STOP if it fails.** The build needs the local caches; a CI runner has none:

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP`, skip to Task 5 and do none of the following: run the build, touch or commit `data/world_hochrhein.json`, let the build download tiles, attempt an `osmium` cut. State in the PR description: "World not rebuilt: pipeline caches missing on this machine. Run Task 4 of docs/superpowers/plans/2026-10-03-landi-tower.md locally. Until then the LANDI-Turm is neither in the J list nor in the world."

- [ ] **Step 2: Golden tests first** (they must pass on the real extract, not skip):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected: all pass, no `SKIPPED`.

- [ ] **Step 3: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected in the log: `building heights from swissSURFACE3D: {...}`; the building count equal to `main`'s (the excluded footprint was never in the world).

- [ ] **Step 4: Guard: the world may differ from `main` only by the new anchor and `params.built`.**

```bash
git fetch origin main
git show origin/main:data/world_hochrhein.json > /tmp/world_main.json
./pipeline/.venv/bin/python - <<'EOF'
import json
a = json.load(open("/tmp/world_main.json", encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
for w in (a, b): w["params"].pop("built", None)
t = b["anchors"]["landmarks"].pop("landiTurm")
assert abs(t["x"] - 1832.7) < 2 and abs(t["z"] - 627.7) < 2 and t["h"] == 56 and t["size"] == [35.4, 12.6] and t["addr"] == "19.1", t
assert a == b, ["keys that differ:", [k for k in set(a) | set(b) if a.get(k) != b.get(k)]]
assert all(x["id"] != 197688923 for x in b["buildings"])
assert sum(1 for x in b["buildings"] if x.get("hsrc") == "dsm") > 1000        # measured heights kept
print("guard ok: landiTurm", t)
EOF
```

Expected: `guard ok: landiTurm {...}`.

If the guard fails: **STOP**, run `git checkout -- data/world_hochrhein.json`, and report the differing keys in the PR description. They may come from pipeline changes other issues merged without rebuilding `main`'s world; if so, leave the rebuild to the maintainer.

- [ ] **Step 5: Commit.**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild world with the LANDI tower anchor (#81)"
```

- [ ] **Step 6: Now the #81 browser tests run for real (red check first, then green).** Prove the tests bite: temporarily hide the model and watch them fail.

```bash
sed -i "s/if (at('landiTurm')) {/if (false \&\& at('landiTurm')) {/" prototype/index.html
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_landi_tower.py -q -rs
```

Expected: both tests FAIL (`counts.landiTurm` is `None`, the car drives through). Then restore and run everything:

```bash
git checkout -- prototype/index.html
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py ../prototype/tests/test_landi_tower.py -q -rs
```

Expected: all pass, nothing skipped for #81; the J list has 25 rows, the Eiken chip shows `DSM-Kamin, Bahnhof Sisseln, Bahnhof Eiken, LANDI-Turm`.

---

### Task 5: Changelog, playtest note, full verification

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Added`)
- Modify: `test-todo.md`

- [ ] **Step 1: Changelog entry** (player-facing, appended under `[Unreleased]` → `### Added`):

```markdown
- The LANDI silo tower by Bahnhof Sisseln now stands in the world at its real 56 m, a grey concrete tower you can see from across the Sisslerfeld. **J** → `landi` takes you there; it is listed under Eiken, where it actually stands.
```

- [ ] **Step 2: Playtest note** (append to `test-todo.md`):

```markdown
## LANDI-Turm (#81)

- [ ] J → `landi` → LANDI-Turm (Eiken). The car lands on the Bahnhofstrasse or Sisslerstrasse by the station; the tower stands just west of the Bahnhofstrasse, south of the railway, next to the LANDI halls (Sisslerstrasse 19).
- [ ] It is a tall flat-topped concrete slab, long side roughly north–south, about as tall as the DSM water tower (59 m) and much lower than the chimney (140 m). Does it read as the LANDI tower, or does it need a different shape (silo cells, a taller head house)?
- [ ] Drive into it: the car stops, no sinking, no driving through. The house number `19.1` floats above its base.
- [ ] Eiken chip in J: DSM-Kamin, Bahnhof Sisseln, Bahnhof Eiken, LANDI-Turm.
```

- [ ] **Step 3: Commit, push, then run every suite in the foreground:**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(changelog): LANDI tower landmark (#81)"
git push
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q
cd .. && node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q -rs
```

Expected: all green. The #81 browser tests run if Task 4 ran and skip with their reason otherwise.

- [ ] **Step 4: PR description** says:
  - the OSM building (`w197688923`, Sisslerstrasse 19.1, Eiken), the measured height (56 m) and why the Gemeinde is Eiken, not Sisseln;
  - whether Task 4 ran (and the guard's output), or why not;
  - `Closes #81`.
