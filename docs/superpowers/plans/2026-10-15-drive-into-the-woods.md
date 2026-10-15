# Drive into the woods Implementation Plan (#211)

**Goal:** The car can drive into an OSM wood and between its trees: the edge walls are gone, every forest trunk blocks like a post, and the forest floor is slower than grass.

**Architecture:** Two pure helpers in `prototype/world.js` (`forestCollider`, `floorDrag` + `FOREST_FLOOR`), node-tested. `prototype/index.html` drops the forest edge-wall loop, registers one trunk collider per `window.__FOREST` tree in the existing `OBB_GRID` after the placement loop, adds the floor drag in `stepCar`, and exposes `__mm.inWood`. `collide()` is unchanged. Spec: `docs/superpowers/specs/2026-10-15-drive-into-the-woods-design.md`.

## Global Constraints

- Buildless; no new packages, no world rebuild (works on the committed `data/world_hochrhein.json`).
- Re-find code by the quoted anchor lines, not by line number (numbers are from `main` @ `3cd240c`).
- In `prototype/index.html` never put a `//` comment in the middle of a one-line statement; only after the closing `;` at the end of a line.
- Collision reads the **position list** (`FOREST_TREES` / `window.__FOREST`), never mesh geometry (#323).
- No linear scan over all trees per frame: trunks go into `OBB_GRID` (32 m cells, `gridQuery` in `collide()`).
- Never loosen an assertion to make a test pass; if a test fails three times, stop and report.
- Browser tests in the foreground, capped, one file at a time: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest <file> -q -p no:cacheprovider`. If `pipeline/.venv` is missing use `python3 -m pytest`. Commit and push **before** running them.
- CHANGELOG entry hand-written, player-facing, English, under `## [Unreleased]` / `### Changed`, with the `` `YYYY-MM-DD HH:MM` `` prefix the other entries use. Never `git cliff -o`.

**Affected test files (for CI selection, `prototype/tests/test-map.json` rule a picks changed test files):**
`prototype/tests/world.test.mjs` (node), `prototype/tests/test_tree_collision.py`, `prototype/tests/test_smoke.py`, `prototype/tests/test_region.py`. Also run unchanged: `prototype/tests/test_pontoon.py`, `prototype/tests/test_heli.py`, `prototype/tests/test_hideout.py`. No `test-map.json` change: `index.html` / `world.js` have no mapping and the four edited test files are selected by rule a.

---

### Task 1: `forestCollider` and `floorDrag` in world.js (node test first)

**Files:** Modify `prototype/world.js`, `prototype/tests/world.test.mjs`.

**Interfaces:**
- `forestCollider(x, z, h, base) -> { ...treeCollider(x, z, h, base), forest: true }`
- `FOREST_FLOOR = { drag: 0.4 }`
- `floorDrag(inWood, roadD) -> number` — `FOREST_FLOOR.drag` when `inWood && roadD > 0`, else `0`.

- [ ] **Step 1: failing test.** In `prototype/tests/world.test.mjs` add `forestCollider, FOREST_FLOOR, floorDrag` to the `from '../world.js'` import list, then append:

```js
test('forestCollider_ForestTree_IsTheTrunkCircleFlaggedForest', () => {
  const o = forestCollider(100, -50, 10, 4), t = treeCollider(100, -50, 10, 4);
  assert.equal(o.forest, true);
  for (const k of ['x', 'z', 'hw', 'hd', 'c', 's', 'h', 'circle', 'low']) assert.equal(o[k], t[k], k);
});

test('floorDrag_InsideAWoodOffTheRoad_IsTheForestDrag', () => {
  assert.equal(floorDrag(true, 3), FOREST_FLOOR.drag);
});

test('floorDrag_OnARoadThroughAWood_IsZero', () => {
  assert.equal(floorDrag(true, 0), 0);
  assert.equal(floorDrag(true, -1), 0);
});

test('floorDrag_OutsideAWood_IsZero', () => {
  assert.equal(floorDrag(false, 50), 0);
});

test('FOREST_FLOOR_RhyflitzerCruise_RoughlyHalvesOnTheForestFloor', () => {   // v = (accel - 0.6) / (accel / top + drag), Rhyflitzer drive table
  const cruise = (drag) => (16 - 0.6) / (16 / 60 + drag);
  const road = cruise(0.12), wood = cruise(0.12 + FOREST_FLOOR.drag);
  assert.ok(road > 38 && road < 42, road);
  assert.ok(wood > 17 && wood < 23, wood);
});
```

- [ ] **Step 2: run, expect FAIL** (`forestCollider` not exported): `node --test prototype/tests/world.test.mjs`
- [ ] **Step 3: implement.** In `prototype/world.js`, directly below `export function treeCollider(...)`:

```js
// #211: an OSM forest tree is solid at the trunk exactly like a scattered tree (#131); `forest` keeps #100's pontoon exception in collide()
export function forestCollider(x, z, h, base) { return { ...treeCollider(x, z, h, base), forest: true }; }

// #211: the forest floor rolls heavier than grass or asphalt; added to stepCar's rolling drag. Roads through a wood stay road.
export const FOREST_FLOOR = { drag: 0.4 };
export function floorDrag(inWood, roadD) { return inWood && roadD > 0 ? FOREST_FLOOR.drag : 0; }
```

- [ ] **Step 4: run, expect PASS:** `node --test prototype/tests/*.test.mjs` (the whole node suite).
- [ ] **Step 5: commit** `feat(world): forest trunk collider and forest-floor drag helpers (#211)`.

---

### Task 2: trunks instead of edge walls, slower forest floor (index.html)

**Files:** Modify `prototype/index.html`.

- [ ] **Step 1: import.** In the `from './world.js'` import line add `forestCollider, floorDrag` after `treeCollider`. In the `from './hideout.js'` import line remove `segmentInHideout` (its only caller is the wall loop removed below; the export and its node tests in `hideout.js` stay).
- [ ] **Step 2: replace the edge walls with trunk colliders.** Anchor (inside `if (L && WOODS.length) {`):

```js
    for (const e of edges) if (!(HIDE && segmentInHideout(e.x0, e.z0, e.x1, e.z1))) addSolid({ x: e.mx + e.nx * 1.2, z: e.mz + e.nz * 1.2, hw: (e.len + 0.6) / 2, hd: 1.2, c: Math.cos(e.rot), s: Math.sin(e.rot), h: lidGround(e.mx, e.mz) + 1.6, forest: true });   // solid, not a building: off the minimap; #201: on the hill over the cave
    window.__mm.counts.forest = { polys: WOODS.length, edge: placed.edge.length, fill: placed.fill.length, thinned: placed.thinned, trees: FOREST_TREES.length, walls: edges.length };
```

becomes

```js
    for (const [x, z, h] of FOREST_TREES) addSolid(forestCollider(x, z, h, lidGround(x, z)));   // #211: after the placement loop, so free() above never sees a trunk; not in OBB, so off the minimap
    window.__mm.counts.forest = { polys: WOODS.length, edge: placed.edge.length, fill: placed.fill.length, thinned: placed.thinned, trees: FOREST_TREES.length, solid: FOREST_TREES.length };
```

- [ ] **Step 3: update the comment block above `const FOREST_TREES = [];`** (it explains why there were walls). Replace the four comment lines starting `// #13: the real woods -- edge row + fill` with:

```js
  // #13: the real woods -- edge row + fill from the OSM outlines, through the same filters as the scatter.
  // #211: no edge walls any more; every forest tree is solid at the trunk (#131 circle), registered after the loop so free() keeps the density.
```

  And in the line above `for (const [x, z, h] of TREES) addSolid(treeCollider(...))` replace `// The OSM forest trees (#13) are a separate list below, stopped by edge walls instead of a collider each.` with `// The OSM forest trees (#13) are a separate list below with the same trunk collider (#211).`

- [ ] **Step 4: forest-floor drag in `stepCar`.** Anchor:

```js
vf -= vf * ((wet ? UW.drag : 0.12) + (dead ? WRECK.coast : 0)) * dt + Math.sign(vf) * 0.6 * dt;
```

becomes

```js
vf -= vf * ((wet ? UW.drag : 0.12 + floorDrag(FOREST.inside(P.x, P.z), roadDist(P.x, P.z))) + (dead ? WRECK.coast : 0)) * dt + Math.sign(vf) * 0.6 * dt;
```

  (`FOREST.inside` answers false in the hand layout and under every region without woods, so nothing changes there.)

- [ ] **Step 5: test hooks.** Next to `window.__mm.treeTrunkR = treeTrunkR;` add:

```js
window.__mm.inWood = (x, z) => FOREST.inside(x, z);   // #211: read-only, the 8 m forest mask the floor drag uses
window.__mm.roadDistAt = (x, z) => roadDist(x, z);   // #211: read-only; __mm.roadDist reads the car's own position
```

- [ ] **Step 6: minimap comment.** `window.__mm.mapBoxes` keeps its code; change its trailing comment `(#13: no forest walls)` to `(#211: no forest trunks)`.
- [ ] **Step 7:** load `http://localhost:8000/prototype/index.html` (`python3 -m http.server 8000` from the repo root) only if a quick console check is needed; the browser tests in Task 3 are the gate.
- [ ] **Step 8: commit** `feat(world): drive into the woods between solid trunks (#211)`.

---

### Task 3: browser tests

**Files:** Modify `prototype/tests/test_tree_collision.py`, `prototype/tests/test_smoke.py`, `prototype/tests/test_region.py`.

- [ ] **Step 1: `test_tree_collision.py` — forest trunks are solid.** Add after `APPROACH_JS`:

```python
# #211: the same two probes over the OSM forest trees (window.__FOREST); stride 37 spreads them over the map
ISOLATED_FOREST_JS = ISOLATED_JS.replace("window.__TREES", "window.__FOREST").replace("i += 7", "i += 37")
APPROACH_FOREST_JS = APPROACH_JS.replace("window.__TREES", "window.__FOREST")
```

and the tests:

```python
@needs_world
def test_pushAt_besideAForestTrunk_pushesTheCarOut(server):
    """#211: a forest tree blocks like a scattered tree: a car resting 0.5 m east of its centre is pushed straight east."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        trees = page.evaluate(ISOLATED_FOREST_JS, 50)
        pushes = page.evaluate("(ts) => ts.map(([x, z]) => window.__mm.pushAt(x + 0.5, z, window.__mm.probe(x, z).terrain + 0.5))", trees)
        b.close()
    assert len(trees) >= 20, len(trees)
    bad = [(t, d) for t, d in zip(trees, pushes) if abs(d["dx"] - (rc + t[3] - 0.5)) > 0.05 or abs(d["dz"]) > 0.05]
    assert bad == [], bad[:5]


@needs_world
def test_sim_driveAtAForestTree_stopsInFrontOfTheTrunk(server):
    """#211: full gas straight at a forest tree from 25 m west: the car stops with its circle on the trunk."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        tree = page.evaluate(APPROACH_FOREST_JS, rc)
        assert tree is not None
        x, z, h, rt = tree
        r = page.evaluate(f"() => window.__mm.sim({x - 25}, {z}, 0, 0, 5)")
        b.close()
    assert r["x"] < x - rt - rc + 0.3, (r, tree, rc)
    assert r["x"] > x - rt - rc - 1, (r, tree, rc)
    assert abs(r["z"] - z) < 0.5, (r, tree)
```

  If `APPROACH_FOREST_JS` finds a tree whose approach crosses a slope that stalls the car (second assert fails on a real slope, not a collider), extend the JS filter with a flatness check (`Math.abs(window.__mm.probe(x - 25, z).terrain - window.__mm.probe(x, z).terrain) < 2`) — do not loosen the asserts.

- [ ] **Step 2: `test_tree_collision.py` — forest floor is slower.** Add:

```python
# a flat, trunk-free 40 m line heading +x: every 1 m point clear of colliders (pushAt), terrain within 0.6 m of the start,
# and either all inside a wood (wood=true) or all outside every wood and off the roads (wood=false)
FLAT_LINE_JS = """([wood, rc]) => {
  const T = wood ? window.__FOREST : window.__TREES;
  for (let i = 0; i < T.length; i += 11) {
    const [tx, tz] = T[i], x0 = tx + 3 + rc, z = tz, y0 = window.__mm.probe(x0, z).terrain; let ok = true;
    for (let d = 0; d <= 40 && ok; d += 1) {
      const x = x0 + d, pr = window.__mm.probe(x, z), push = window.__mm.pushAt(x, z, pr.terrain + 0.5);
      ok = pr.water === null && !pr.bridge && Math.abs(pr.terrain - y0) < 0.6 && Math.hypot(push.dx, push.dz) < 0.01
        && window.__mm.inWood(x, z) === wood && (wood || window.__mm.roadDistAt(x, z) > 3);
    }
    if (ok) return [x0, z];
  }
  return null;
}"""


@needs_world
def test_forest_floor_is_slower(server):
    """#211: coasting 1 s from 30 m/s, the forest floor brakes the car far more than open grass."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        wood, grass = page.evaluate(FLAT_LINE_JS, [True, rc]), page.evaluate(FLAT_LINE_JS, [False, rc])
        assert wood is not None and grass is not None, (wood, grass)
        in_wood = page.evaluate(f"() => window.__mm.sim({wood[0]}, {wood[1]}, 0, 30, 1, [])")
        on_grass = page.evaluate(f"() => window.__mm.sim({grass[0]}, {grass[1]}, 0, 30, 1, [])")
        b.close()
    assert in_wood["speed"] < 21, in_wood
    assert on_grass["speed"] > 24, on_grass
```

  `window.__mm.roadDist` already exists but reads the car's own position (`() => roadDist(P.x, P.z)`), so leave it alone and add the hook in Task 2 Step 5 (see there).

- [ ] **Step 3: `test_smoke.py::test_forest_loaded`.** Replace `f["walls"] >= 5000` with `f["solid"] == f["trees"]` and add `assert "walls" not in f, f`.
- [ ] **Step 4: `test_smoke.py` — replace `test_forest_edge_blocks_the_car`** with a gap test. Keep `_forest_approach` as is. New test:

```python
GAP_JS = """([sx, sz, th, rc]) => {
  const ux = Math.cos(th), uz = Math.sin(th), px = -uz, pz = ux;
  for (let off = -20; off <= 20; off += 1) {
    const ox = sx + px * off, oz = sz + pz * off; let clear = true;
    for (let d = 0; d <= 60 && clear; d += 0.5) {
      const x = ox + ux * d, z = oz + uz * d, push = window.__mm.pushAt(x, z, window.__mm.probe(x, z).terrain + 0.5);
      clear = Math.hypot(push.dx, push.dz) < 0.01 && window.__mm.probe(x, z).water === null;
    }
    if (clear) return [ox, oz];
  }
  return null;
}"""


@pytest.mark.skipif(not world_forests(), reason="world file predates #13: rebuild it with pipeline/osm.py build")
def test_forest_edge_lets_the_car_in(server):
    """#211: no wall at the wood edge. Driving straight at a wood from 25 m out (from rest, gas held 3 s) through a gap
    between edge trees, the car ends inside the wood, more than 30 m from where it started."""
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    sx, sz, th, ring = _forest_approach(world)
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.counts.forest && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        rc = page.evaluate("() => { const v = window.__mm.vehicle(); return v.collision.r * v.scale; }")
        start = page.evaluate(GAP_JS, [sx, sz, th, rc])
        assert start is not None, "no trunk-free 60 m line through this wood edge"
        r = page.evaluate(f"() => window.__mm.sim({start[0]}, {start[1]}, {th}, 0, 3)")
        inside = page.evaluate(f"() => window.__mm.inWood({r['x']}, {r['z']})")
        br.close()
    assert inside, r
    assert math.hypot(r["x"] - start[0], r["z"] - start[1]) > 30, (r, start)
```

  The 60 m clear line covers the 25 m run-up plus ~35 m into the wood; the 3 s run covers ~45 m (forest drag included), so the car ends inside the wood without having touched a trunk. If `_forest_approach`'s wood is thinner than 35 m along the line, make `_forest_approach` also require `_in_wood` at 5, 15, 25 and 35 m inside (a filter, not a loosened assert).

- [ ] **Step 5: `test_smoke.py` — rename `test_forest_walls_stay_off_the_minimap` to `test_forest_trees_stay_off_the_minimap`**, docstring „#211: the forest trunks are solid for the car but are not buildings, so the static minimap (which paints every OBB) must draw exactly as many rectangles with the woods as without them." and replace `with_woods["forest"]["walls"] >= 5000` with `with_woods["forest"]["solid"] >= 20000`.
- [ ] **Step 6: `test_region.py::test_ehrendingen_has_its_osm_woods`.** Docstring „(edge walls included)" → „(trunks solid)"; replace `f["walls"] > 1000` with `f["solid"] == f["trees"]`.
- [ ] **Step 7: grep for leftovers:** `grep -rn '"walls"\]\|\.walls\b' prototype/tests/*.py | grep -i forest` must be empty.
- [ ] **Step 8: commit and push**, then run in the foreground, one file at a time (capped command from the Global Constraints): `node --test prototype/tests/*.test.mjs`, `test_tree_collision.py`, `test_smoke.py -k forest`, `test_region.py -k woods`, `test_pontoon.py`, `test_heli.py`, `test_hideout.py`. All green.
- [ ] **Step 9: commit** `test(world): forest trunks, gaps and forest floor (#211)` (if Step 8 needed fixes, commit those first).

---

### Task 4: docs

**Files:** Modify `docs/11-pipeline-osm.md`, `CHANGELOG.md`, `test-todo.md`.

- [ ] **Step 1:** In `docs/11-pipeline-osm.md`, **Forests (#13)** paragraph, replace „and puts invisible 1.6 m walls along every edge, so the car cannot enter a wood but drives every road through one." with „Every forest tree is solid at the trunk like a scattered tree (#131, #211), so the car drives into a wood and between its trees, on a slower forest floor, and drives every road through one."
- [ ] **Step 2:** `CHANGELOG.md` under `## [Unreleased]` add a `### Changed` section (above `### Fixed`, below `### Added`) if missing, with: ``- `YYYY-MM-DD HH:MM` You can now **drive into the woods** and **between the trees**: the invisible wall at the forest edge is gone, every trunk stops the car like a post, and the **forest floor** is slower than the road.`` (current UTC-local time as the other entries).
- [ ] **Step 3:** `test-todo.md`: replace line „- [ ] No trees or forest edge walls in the trench, the tunnel or the cavern." with „- [ ] No trees in the trench, the tunnel or the cavern." and add a section at the top of the open sections:

```markdown
## Drive into the woods (#211)

- [ ] Drive off-road into the Sisslerwald: no wall at the edge, the car rolls in between the trees and is clearly slower than on grass.
- [ ] Hit a forest trunk: the car stops at it, the damage bar rises, the crash sound plays (both tree styles).
- [ ] Squeeze through a narrow gap between two trunks: passes where it looks wide enough, stops where it doesn't.
- [ ] Roads through a wood: full speed, no bumps.
- [ ] Pontoon bridge ends in the woods: the car drives on and off.
- [ ] Helicopter low over a wood: stays above the crowns, no jitter. Chase camera inside a wood: no annoying zoom jumps.
```

- [ ] **Step 4: commit** `docs(world): drive into the woods (#211)`.
