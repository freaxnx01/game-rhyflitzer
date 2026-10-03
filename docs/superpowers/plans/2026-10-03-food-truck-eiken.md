# Güggeli Food Truck in Eiken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A low-poly food truck with a hand-painted **Güggeli** sign stands on the Bahnhof Eiken car park (OSM parking way `210461003`, game (1758.5, 1986.5)), is solid, and the **J** list offers it as **Güggeli-Foodtruck** (Eiken) so the car can jump to it (#103). The spot is a first guess the user corrects later, so it is one constant in `pipeline/anchors.json`.

**Architecture:** A new `foodTruck` entry in `pipeline/anchors.json` `landmarks` (a `game` anchor like `smileKreisel`) puts the position and heading into the world file. The prototype gets a `foodTruck()` model built in code (`box` / `push` / `addOBB`, a `textTex` board via `signs`) and placed by anchor key next to `siloTower`; `LANDMARK_INFO` gets an anchor entry. Until the world file is rebuilt (guarded local task), the entry and the model are simply absent, as with #81.

**Tech Stack:** Python 3 + shapely (pipeline, pytest); vanilla JS + three.js in the buildless `prototype/index.html`; ES module `prototype/landmarks.js` (`node --test`); Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-food-truck-eiken-design.md`

## Global Constraints

- **Depends on #81 being on `main`** (`siloTower`, `landiTurm` anchor, `WORLD81` in `test_jump.py`, 24 `LANDMARK_INFO` entries). Task 0 checks this.
- The facts, exactly: anchor key **`foodTruck`**, `game` **`[1758.5, 1986.5]`**, `heading_deg` **`0`**, `kind` **`"foodTruck"`**, J name **`Güggeli-Foodtruck`**, Gemeinde **`Eiken`**, parking lot **`210461003`**. Resolved anchor `{ x: 1758.5, z: 1986.5, kind: "foodTruck", h: null, rot: 0 }`. **The position is this one constant**; nothing else in the code carries coordinates of the truck.
- No real logo, company lettering, brand colours or a person's name on the model or in the list (docs/07-brands-and-permissions.md). The board reads **Güggeli**, the menu board **Güggeli · Pommes**, nothing else.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments). Match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()` (the seeded RNG), so no other building changes its look.
- No change to the J dialog UI, to `landmarkEntries`, `sourcePos`, `filterLandmarks`, `gemeindenOf` or `GEMEINDEN`. No `prototype/strings.js` change (proper names only).
- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally, verify green. Never edit a test to make it pass. If a test still fails after 3 attempts, STOP and report.
- Run anything heavy (golden tests, world build, Playwright) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never `run_in_background`. Exit 137 means the memory cap was hit: stop and report, do not raise the cap. Without `systemd-run --user` (CI runner), run the same command without the prefix.
- Commands (from the repo root):
  - pipeline tests: `cd pipeline && ./.venv/bin/python -m pytest -q`
  - node tests: `node --test prototype/tests/*.test.mjs` (Node 20+)
  - browser tests: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py ../prototype/tests/test_food_truck.py -q -rs` (slow, foreground)
  - one-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs and before the rebuild.
- Never hand-edit `data/world_hochrhein.json`. Never commit a world built without `--dsm-heights cache`.

## Review Focus

- **Anchor key missing from the served world** (every CI run, and `main` until the rebuild): no model, no J row, no error. The browser tests key every count on `WORLD103` (Task 3).
- **Heading convention:** `box()`'s `w` runs along heading `rot` (`rotateY(-rot)`); heading 0 means the truck's length runs east–west and the hatch (local −z) faces north. Local offsets go through `R(ox, oz)` exactly as `plattformTower` does (`index.html:611`).
- **Solidity:** the car must stop at the truck, not drive through (Task 3, `__mm.sim`). The OBB covers body and cab (7.1 × 2.4 m).
- **Text stays out of `MESH`:** the boards go through `signs.add(...)`, never `push(...)`, so `wallRoleAt` and `applyStyle` never see a textured plane.
- **Rebuild side effects:** the rebuilt world may differ from `main`'s only by the new anchor and `params.built`; the guard in Task 4 stops on anything else.

---

## File map

- `pipeline/anchors.json`: the `foodTruck` anchor (Task 1).
- `pipeline/tests/test_anchors.py`, `pipeline/tests/test_golden.py`: anchor tests (Task 1).
- `prototype/landmarks.js`: the J entry (Task 2).
- `prototype/tests/landmarks.test.mjs`: node tests (Task 2).
- `prototype/index.html`: `foodTruck()` model and its placement (Task 3).
- `prototype/tests/test_jump.py`: `WORLD103`, row counts, the jump test (Task 3).
- `prototype/tests/test_food_truck.py`: new, count / wall role / solidity (Task 3).
- `data/world_hochrhein.json`: generated (Task 4).
- `docs/ai-notes/screenshots/2026-10-03-food-truck/hatch-side.png`: new (Task 5).
- `CHANGELOG.md`, `test-todo.md` (Task 6).

Line numbers are from `main` @ `1723a10`. Verify them with `grep -n` before editing.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Branch from `main` and check that #81 is there.**

```bash
git fetch origin && git checkout -b feature/103-food-truck-eiken origin/main
grep -q "landiTurm" pipeline/anchors.json && grep -q "WORLD81" prototype/tests/test_jump.py && grep -q "function siloTower" prototype/index.html && grep -q "LANDI-Turm" prototype/landmarks.js && echo "81-OK" || echo "STOP: #81 not merged"
```

If it prints `STOP`: do nothing else. Comment on the issue: "#103 needs #81 merged first (siloTower, landiTurm anchor, WORLD81 in test_jump.py)." Then end the run without a PR.

---

### Task 1: Pipeline — the `foodTruck` anchor

**Files:**
- Modify: `pipeline/anchors.json`
- Test: `pipeline/tests/test_anchors.py`, `pipeline/tests/test_golden.py`

**Interfaces:**
- Consumes: `anchors.resolve(spec, data, frame)` (a `game` entry passes `kind` and `heading_deg` → `rot` through; `pipeline/anchors.py:46-47`, `:58-59`). Unchanged.
- Produces: `world["anchors"]["landmarks"]["foodTruck"] = { x: 1758.5, z: 1986.5, kind: "foodTruck", h: None, rot: 0.0 }`.

- [ ] **Step 1: Write the failing tests.** Append to `pipeline/tests/test_anchors.py`:

```python
def test_game_landmark_passes_kind_and_heading_through():
    """#103: the food truck is a hand `game` anchor; kind and heading reach the world file."""
    spec = {"landmarks": {"foodTruck": {"game": [1758.5, 1986.5], "kind": "foodTruck", "heading_deg": 0}}}
    t = anchors.resolve(spec, OsmData(), F)["landmarks"]["foodTruck"]
    assert t["x"] == 1758.5 and t["z"] == 1986.5
    assert t["kind"] == "foodTruck" and t["h"] is None and t["rot"] == 0


def test_repo_anchors_place_the_food_truck_on_the_bahnhof_eiken_car_park():
    spec = anchors.load(Path(__file__).parents[1] / "anchors.json")
    t = spec["landmarks"]["foodTruck"]
    assert t["game"] == [1758.5, 1986.5] and t["kind"] == "foodTruck" and t["heading_deg"] == 0
```

(`Path`, `anchors`, `OsmData` and `F` are already imported / defined at the top of the file, `test_anchors.py:1-12`.)

Append to `pipeline/tests/test_golden.py`:

```python
def test_issue103_food_truck_anchor_stands_on_the_bahnhof_eiken_car_park(world):
    """#103: the food truck anchor lies inside the Bahnhof Eiken car park (parking way 210461003), on no building and
    off every road."""
    t = world["anchors"]["landmarks"]["foodTruck"]
    assert (t["x"], t["z"]) == (1758.5, 1986.5) and t["kind"] == "foodTruck" and t["rot"] == 0, t
    p = shapely.Point(t["x"], t["z"])
    lot = next(x for x in world["parking"] if x["id"] == 210461003)
    assert shapely.Polygon(lot["ring"]).contains(p), "the truck stands inside the car park"
    assert not any(shapely.Polygon(b["ring"]).contains(p) for b in world["buildings"]), "the truck stands on no building"
    roads = shapely.MultiLineString([r["pts"] for r in world["roads"] if len(r["pts"]) > 1])
    assert roads.distance(p) >= 5, roads.distance(p)
```

- [ ] **Step 2: Run and expect FAIL.**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_anchors.py -q
```

Expected: `test_game_landmark_passes_kind_and_heading_through` passes already (the pass-through exists), `test_repo_anchors_place_the_food_truck_on_the_bahnhof_eiken_car_park` fails with `KeyError: 'foodTruck'`.

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs -k issue103
```

Expected: FAIL with `KeyError: 'foodTruck'`, or SKIPPED without the extract.

- [ ] **Step 3: Add the anchor.** In `pipeline/anchors.json`, after the `landiTurm` line (`:5`), add:

```json
    "foodTruck":        { "game": [1758.5, 1986.5], "kind": "foodTruck", "heading_deg": 0, "src": "Güggeli food truck (#103): first guess, the centroid of the Bahnhof Eiken car park (OSM parking w210461003, 22 m off the Bahnhofstrasse); the user moves it later — edit game/heading_deg here and rebuild the world" },
```

Keep the file valid JSON (trailing commas, two-space indent, the aligned colon style of its neighbours).

- [ ] **Step 4: Run and expect PASS.**

```bash
cd pipeline && ./.venv/bin/python -m pytest -q
```

Expected: all green (golden tests skip without the extract, pass with it).

- [ ] **Step 5: Commit.**

```bash
git add pipeline/anchors.json pipeline/tests/test_anchors.py pipeline/tests/test_golden.py
git commit -m "feat(pipeline): food truck anchor on the Bahnhof Eiken car park (#103)"
```

---

### Task 2: Prototype — the `Güggeli-Foodtruck` J entry

**Files:**
- Modify: `prototype/landmarks.js`
- Test: `prototype/tests/landmarks.test.mjs`

**Interfaces:**
- Consumes: `landmarkEntries(info, anchors, buildings)` (`landmarks.js:49`), unchanged.
- Produces: `LANDMARK_INFO` with 25 entries; the Eiken block ends `…, 'LANDI-Turm', 'Güggeli-Foodtruck'`.

- [ ] **Step 1: Write the failing tests.** In `prototype/tests/landmarks.test.mjs`:

Change `:69-70` to:

```js
test('LANDMARK_INFO holds the 14 landmarks of #41, the 9 of #46, the LANDI tower of #81 and the food truck of #103', () => {
  assert.equal(LANDMARK_INFO.length, 25);
```

Change `:83` to:

```js
  assert.deepEqual(LANDMARK_INFO.filter(l => l.gemeinde === 'Eiken').map(l => l.name), ['DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm', 'Güggeli-Foodtruck']);
```

Append:

```js
test('#103 Güggeli-Foodtruck resolves from its anchor, sits last in Eiken and is found by "gugg", "food" and "GÜGGELI"', () => {
  const anchors = { dsmChimney: { x: 1065.2, z: 345.1 }, stationSisseln: { x: 1854.2, z: 685.8 }, landiTurm: { x: 1832.7, z: 627.7 }, foodTruck: { x: 1758.5, z: 1986.5 } };
  const e = landmarkEntries(LANDMARK_INFO, anchors, [{ id: '199241726', ring: [[1700, 1930], [1720, 1930], [1720, 1943], [1700, 1943]] }]);
  assert.deepEqual(e.map(x => x.n), ['DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm', 'Güggeli-Foodtruck']);
  assert.deepEqual(e.find(x => x.n === 'Güggeli-Foodtruck'), { n: 'Güggeli-Foodtruck', g: 'Eiken', x: 1758.5, z: 1986.5 });
  for (const q of ['gugg', 'food', 'GÜGGELI', 'truck']) assert.deepEqual(filterLandmarks(e, q, null).map(x => x.n), ['Güggeli-Foodtruck'], q);
  assert.deepEqual(landmarkEntries(LANDMARK_INFO, {}, []).map(x => x.n), [], 'nothing without anchors or buildings');
  assert.ok(!landmarkEntries(LANDMARK_INFO, { landiTurm: { x: 1832.7, z: 627.7 } }, []).some(x => x.n === 'Güggeli-Foodtruck'), 'skipped while the anchor is missing');
});
```

- [ ] **Step 2: Run and expect FAIL.**

```bash
node --test prototype/tests/*.test.mjs
```

Expected: the count test fails (24 ≠ 25), the Eiken-names assertion fails, the new test fails (no `Güggeli-Foodtruck`).

- [ ] **Step 3: Add the entry.** In `prototype/landmarks.js`, after the `LANDI-Turm` line (`:22`):

```js
  { name: 'Güggeli-Foodtruck', gemeinde: 'Eiken', anchor: 'foodTruck' },             // Bahnhof Eiken car park, a first guess (#103); the position lives in pipeline/anchors.json
```

Update the comment on `:5` to `// Gemeinden verified against OpenStreetMap on 2026-10-02/03 (#41, #46, #81, #103)`.

- [ ] **Step 4: Run and expect PASS.**

```bash
node --test prototype/tests/*.test.mjs
```

Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs
git commit -m "feat(prototype): Güggeli-Foodtruck in the J list under Eiken (#103)"
```

---

### Task 3: Prototype — the `foodTruck` model and the browser tests

**Files:**
- Modify: `prototype/index.html` (new `foodTruck()` after `siloTower`, `:604-610`; placement after the `landiTurm` line, `:838`)
- Modify: `prototype/tests/test_jump.py` (`:28-31`, new test after `:297`)
- Create: `prototype/tests/test_food_truck.py`

**Interfaces:**
- Consumes: `terrainH`, `box` (`:474`), `push` (`:472`), `colorize` (`:473`), `addOBB` (`:518`), `textTex` (`:322`), `col`, `signs`, `window.__mm.counts`, `L.anchors.landmarks.foodTruck = { x, z, rot }`.
- Produces: `foodTruck(x, z, rot)`; `window.__mm.counts.foodTruck === 1` when built; a `hall` wall on the hatch side; an OBB 7.1 × 2.4 m, height `b + 3`.

- [ ] **Step 1: Write the failing browser tests.**

In `prototype/tests/test_jump.py`, after `:29` (the `needs_world81` line) add:

```python
WORLD103 = "foodTruck" in _world_anchor_keys()          # world rebuilt with the #103 food truck anchor
needs_world103 = pytest.mark.skipif(not WORLD103, reason="world not rebuilt for #103 (Task 4 of docs/superpowers/plans/2026-10-03-food-truck-eiken.md)")
```

Change `:30-31` to:

```python
EIKEN_ROWS = ["DSM-Kamin", "Bahnhof Sisseln"] + (["Bahnhof Eiken"] if WORLD46 else []) + (["LANDI-Turm"] if WORLD81 else []) + (["Güggeli-Foodtruck"] if WORLD103 else [])
ALL_ROWS = (24 if WORLD46 else 17) + (1 if WORLD81 else 0) + (1 if WORLD103 else 0)   # landmarks shown + Random spot
```

After `test_landi_tower_is_listed_and_jumpable` (`:287-297`) add:

```python
@needs_world103
def test_food_truck_is_listed_and_jumpable(server):
    """#103: 'gugg' finds the Güggeli-Foodtruck (Eiken, Bahnhof Eiken car park); Enter puts the car on a road within 80 m."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("gugg")
        assert rows(page) == [{"n": "Güggeli-Foodtruck", "g": "Eiken"}, {"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        tx, tz = anchor("foodTruck")
        c = car(page)
        assert math.hypot(c["x"] - tx, c["z"] - tz) < 80
        b.close()
```

Create `prototype/tests/test_food_truck.py`:

```python
"""#103: the Güggeli food truck stands on the Bahnhof Eiken car park as a solid, painted van.
Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def _anchor():
    if not WORLD.exists():
        return None
    return json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"].get("foodTruck")


TRUCK = _anchor()
needs_truck = pytest.mark.skipif(TRUCK is None, reason="world not rebuilt for #103 (Task 4 of docs/superpowers/plans/2026-10-03-food-truck-eiken.md)")


def open_page(p, server):
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    return br, page


@needs_truck
def test_truck_is_built_once_and_its_hatch_side_is_painted(server):
    """The model counts itself, and a ray from 12 m north of the centre (heading 0: the hatch side) hits the painted
    'hall' body, not a textured sign and not nothing."""
    x, z = TRUCK["x"], TRUCK["z"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        assert page.evaluate("() => window.__mm.counts.foodTruck") == 1
        role = page.evaluate(f"() => window.__mm.wallRoleAt({x}, {z - 12}, {x}, {z})")
        br.close()
    assert role == "hall", role


@needs_truck
def test_truck_stops_the_car(server):
    """Driving east at the truck from 25 m west at 12 m/s for 3 s (36 m without an obstacle), the car must be stopped
    and never come out on the far side."""
    x, z = TRUCK["x"], TRUCK["z"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        r = page.evaluate(f"() => window.__mm.sim({x - 25}, {z}, 0, 12, 3)")
        br.close()
    assert r["x"] < x, r
```

- [ ] **Step 2: Run the node tests, then the quick part of the browser suite.** The new browser tests SKIP on `main`'s world (no `foodTruck` anchor yet); they go red-then-green in Task 4 Step 6. Run now to make sure nothing is broken syntactically:

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_food_truck.py -q -rs
```

Expected: 2 SKIPPED with "world not rebuilt for #103".

- [ ] **Step 3: Add the model.** In `prototype/index.html`, after `siloTower` (`:610`, the closing `}` before `function plattformTower`), insert:

```js
function foodTruck(x, z, rot) { // #103 Güggeli food truck: cream box body on four wheels, red cab in front (local +x), serving hatch and awning on the local -z side, hand-painted roof board; generic look, no logo (docs/07); solid
  const b = terrainH(x, z), c = Math.cos(rot), s = Math.sin(rot), R = (ox, oz) => [x + ox * c - oz * s, z + ox * s + oz * c], at = (ox, oz, y, w, h, d, cl, role = 'hall') => { const [px, pz] = R(ox, oz); box(w, h, d, px, y, pz, rot, col(cl), role, [4, 3], 0); };
  at(-0.75, 0, b + 0.6, 5.6, 2.3, 2.3, '#f3e9d2');                                   // body
  at(2.8, 0, b + 0.6, 1.5, 1.7, 2.2, '#c8302a'); at(2.95, 0, b + 1.6, 0.9, 0.55, 2.0, '#2a3340');   // cab, windscreen band
  at(0, 0, b + 0.3, 7.1, 0.3, 1.6, '#2b2b2b', 'stone');                                // chassis
  at(-0.75, -1.2, b + 1.6, 2.4, 1.1, 0.12, '#2a2a2a');                                // serving hatch
  at(-0.75, -1.75, b + 2.95, 2.8, 0.08, 1.2, '#c8302a');                              // awning over the hatch
  for (const ox of [-2.3, 2.3]) for (const oz of [-1.05, 1.05]) { const w = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12); w.rotateX(Math.PI / 2); w.rotateY(-rot); const [px, pz] = R(ox, oz); w.translate(px, b + 0.42, pz); colorize(w, col('#2b2b2b')); push('stone', w); }
  const board = new THREE.MeshLambertMaterial({ map: textTex('Güggeli', 1024, 288, '#f6c84a', '#7a1f12', 'italic 800 190px "Barlow Condensed", sans-serif', '#7a1f12') });
  for (const sd of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), board); const [px, pz] = R(-0.75, sd * 0.04); m.position.set(px, b + 3.45, pz); m.rotation.y = -rot + (sd < 0 ? Math.PI : 0); signs.add(m); }
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshLambertMaterial({ map: textTex('Güggeli · Pommes', 512, 128, '#2a2a2a', '#f5efe0', '700 72px "Barlow Condensed", sans-serif', '#f5efe0') })); const [px, pz] = R(1.1, -1.17); m.position.set(px, b + 2.5, pz); m.rotation.y = -rot + Math.PI; signs.add(m); }   // menu board beside the hatch, facing north
  addOBB(x, z, 7.1, 2.4, rot, b + 3);
  window.__mm.counts.foodTruck = 1;
}
```

Then in the `if (L) { … }` landmark block, after the `landiTurm` line (`:838`), add:

```js
    if (at('foodTruck')) foodTruck(at('foodTruck').x, at('foodTruck').z, at('foodTruck').rot || 0);
```

Check the board orientation against `stationSign` (`:725`): the `sd = 1` plane sits on the local +z side and faces +z, the `sd = -1` plane faces −z. If the menu board shows mirrored or faces the body in the screenshot (Task 5), flip the `+ Math.PI` on that one line; do not touch the others.

- [ ] **Step 4: Static checks.** The page must load with an empty console in the hand layout (no world) and with `main`'s world (no `foodTruck` anchor, so `foodTruck()` is never called):

```bash
node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_smoke.py -q -x
```

Expected: green. A syntax error in the new function shows up here as a page that never reaches `#worldstatus`.

- [ ] **Step 5: Commit and push.**

```bash
git add prototype/index.html prototype/tests/test_jump.py prototype/tests/test_food_truck.py
git commit -m "feat(ui): low-poly Güggeli food truck model placed from the foodTruck anchor (#103)"
git push -u origin feature/103-food-truck-eiken
```

---

### Task 4: Rebuild the world file (with measured heights), guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

**Interfaces:**
- Consumes: Task 1 (anchor). Tasks 2–3 do not depend on this task.

The branch is already pushed (Task 3), so the work is safe if this task stops.

- [ ] **Step 1: Cache check, and STOP if it fails.** The build needs the local caches; a CI runner has none:

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP`, skip to Task 5 (which then also stops, see there) and do none of the following: run the build, touch or commit `data/world_hochrhein.json`, let the build download tiles, attempt an `osmium` cut. State in the PR description: "World not rebuilt: pipeline caches missing on this machine. Run Task 4 of docs/superpowers/plans/2026-10-03-food-truck-eiken.md locally. Until then the Güggeli-Foodtruck is neither in the J list nor in the world."

- [ ] **Step 2: Golden tests first** (they must pass on the real extract, not skip):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected: all pass, no `SKIPPED`.

- [ ] **Step 3: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected in the log: `building heights from swissSURFACE3D: {...}`; the building count equal to `main`'s.

- [ ] **Step 4: Guard: the world may differ from `main` only by the new anchor and `params.built`.**

```bash
git fetch origin main
git show origin/main:data/world_hochrhein.json > /tmp/world_main.json
./pipeline/.venv/bin/python - <<'EOF'
import json
a = json.load(open("/tmp/world_main.json", encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
for w in (a, b): w["params"].pop("built", None)
t = b["anchors"]["landmarks"].pop("foodTruck")
assert (t["x"], t["z"]) == (1758.5, 1986.5) and t["kind"] == "foodTruck" and t["rot"] == 0, t
assert a == b, ["keys that differ:", [k for k in set(a) | set(b) if a.get(k) != b.get(k)]]
assert sum(1 for x in b["buildings"] if x.get("hsrc") == "dsm") > 1000        # measured heights kept
print("guard ok: foodTruck", t)
EOF
```

Expected: `guard ok: foodTruck {...}`.

If the guard fails: **STOP**, run `git checkout -- data/world_hochrhein.json`, and report the differing keys in the PR description. They may come from pipeline changes other issues merged without rebuilding `main`'s world; if so, leave the rebuild to the maintainer.

- [ ] **Step 5: Commit.**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild world with the food truck anchor (#103)"
```

- [ ] **Step 6: Browser tests against the rebuilt world** (foreground, slow):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py ../prototype/tests/test_food_truck.py -q -rs
```

Expected: everything passes, nothing is skipped for #103 (`test_food_truck_is_listed_and_jumpable`, `test_truck_is_built_once_and_its_hatch_side_is_painted`, `test_truck_stops_the_car`). The Eiken chip shows five rows.

---

### Task 5: Screenshot for a human

**Files:**
- Create: `docs/ai-notes/screenshots/2026-10-03-food-truck/hatch-side.png`

Only when Task 4 rebuilt the world. Otherwise write in the PR description: "No screenshot: the world was not rebuilt (Task 4)." and go to Task 6.

The look of the truck and whether the spot reads as "Eiken" are judgement calls; a person decides from the picture. Run this in the **foreground** (start `python3 -m http.server 8000` in the repo root first, or reuse `conftest.py`'s server fixture in a one-off pytest):

```python
import json, math
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("docs/ai-notes/screenshots/2026-10-03-food-truck"); OUT.mkdir(parents=True, exist_ok=True)
t = json.loads(Path("data/world_hochrhein.json").read_text(encoding="utf-8"))["anchors"]["landmarks"]["foodTruck"]
x, z = t["x"] - 6, t["z"] - 16                                       # car 16 m north of the hatch side, a little west
th = math.atan2(t["z"] - z, t["x"] - x)
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    page = br.new_page(viewport={"width": 960, "height": 540})
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto("http://127.0.0.1:8000/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    page.evaluate(f"() => window.__mm.place({x}, {z}, {th})")
    page.wait_for_timeout(8000)                                      # headless renders well under 1 fps; let the chase camera settle
    page.screenshot(path=str(OUT / "hatch-side.png"))
    br.close()
```

Look at the PNG: a cream van with a red cab, the dark hatch and the red awning facing the camera, the yellow **Güggeli** board readable on the roof, the menu board readable and not mirrored, the truck standing on the car park asphalt (not floating, not sunk), bay lines around it. Fix the one offending line in Task 3 Step 3 and retake if a board is mirrored or the truck floats.

**Commit:**

```bash
git add docs/ai-notes/screenshots/2026-10-03-food-truck/hatch-side.png
git commit -m "docs(screenshots): the Güggeli food truck on the Bahnhof Eiken car park for review (#103)"
```

---

### Task 6: Changelog, playtest note, full verification

**Files:**
- Modify: `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: Changelog.** Under `## [Unreleased]` → `### Added`, as the first bullet:

```markdown
- A food truck selling Güggeli now stands on the car park by Bahnhof Eiken: a cream van with a red cab, a serving hatch under an awning and a hand-painted yellow sign on the roof. **J** → `gugg` takes you there; it is listed under Eiken. You cannot drive through it. The spot is a first guess and may move.
```

- [ ] **Step 2: Playtest note.** Append to `test-todo.md`:

```markdown
## Güggeli-Foodtruck (#103)

- [ ] J → `gugg` → Güggeli-Foodtruck (Eiken). The car lands on the Bahnhofstrasse by Bahnhof Eiken; the truck stands on the car park south-east of the station, about 20 m off the road.
- [ ] Is this the right spot? If not, note where it should go (street / car park / square); moving it is one line in `pipeline/anchors.json` (`landmarks.foodTruck.game`, `heading_deg`) plus a world rebuild.
- [ ] Does it read as a food truck: cream body, red cab, dark hatch with the red awning on the north side, the yellow **Güggeli** board on the roof, the small menu board? Readable from the car? Too big, too small?
- [ ] Drive into it from each side: the car stops, no sinking, no driving through.
- [ ] Eiken chip in J: DSM-Kamin, Bahnhof Sisseln, Bahnhof Eiken, LANDI-Turm, Güggeli-Foodtruck.
```

- [ ] **Step 3: Full verification** (foreground):

```bash
cd pipeline && ./.venv/bin/python -m pytest -q
node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/ -q -rs
```

Expected: all green. The #103 browser tests run if Task 4 ran and skip with their reason otherwise.

- [ ] **Step 4: Commit and push.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(food-truck): changelog and playtest note for the Güggeli food truck (#103)"
git push
```

- [ ] **Step 5: PR.** Title `feat(world): Güggeli food truck on the Bahnhof Eiken car park (#103)`. The description states:
  - the spot (parking way `210461003`, (1758.5, 1986.5), heading 0) and that moving it is `pipeline/anchors.json` `landmarks.foodTruck` + a rebuild;
  - whether Task 4 ran (and the guard's output), or why not;
  - the screenshot (Task 5) inline, or why there is none;
  - the test runs and their skip reasons.
