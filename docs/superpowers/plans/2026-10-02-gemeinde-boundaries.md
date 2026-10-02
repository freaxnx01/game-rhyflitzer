# Gemeinde Boundaries Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing **G** shows or hides the Gemeinde boundaries (OSM `admin_level=8`, e.g. Sisseln | Eiken) as a magenta strip on the ground and a dashed magenta line on the minimap (#48).

**Architecture:** A new pipeline module `pipeline/world_boundaries.py` makes two cheap pyosmium passes over the regional extract. The first collects the member ways of named `boundary=administrative` + `admin_level=8` relations, the second reads those ways as lines. It clips them to the map and `osm.py build` writes them as a new optional MMW1 field `boundaries`. The prototype passes the field through `layoutFromWorld` and draws one merged ribbon mesh in its own hidden `THREE.Group` plus a pre-rendered minimap overlay canvas. G flips both. The world file is rebuilt last, behind a guard.

**Tech Stack:** Python 3 + pyosmium + shapely (pipeline, pytest); vanilla JS + three.js in one buildless file `prototype/index.html`, pure helpers in `prototype/world.js` (`node --test`); Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-02-gemeinde-boundaries-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Run anything heavy (world build, golden tests, Playwright suite) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never `run_in_background`. Exit 137 means the memory cap was hit: stop and report, do not raise the cap, and shrink the input instead (regional/bbox extract, never a country file). If `systemd-run --user` is unavailable (CI runner), run the same command without the prefix. **No new `osmium` cut is needed or allowed for this issue:** the existing 3.7 MB `pipeline/cache/osm/hochrhein.osm.pbf` already holds the boundary relations.
- Data: only relations with `boundary=administrative`, `admin_level=8` and a non-empty `name`. Levels 2/4/6/7/9/10 are never their own lines.
- World field exactly: `"boundaries": [{"id": <way id>, "names": [<sorted names>], "pts": [[x, z], ...]}]`. One entry per clipped LineString part, parts < 5 m dropped, coordinates rounded to 0.1 m. The field is optional in the prototype (`[]` when missing).
- Key **G**, default off, not persisted. Toasts exactly: `Gemeinde boundaries on`, `Gemeinde boundaries off`, `Gemeinde boundaries: no data` (the last whenever there are no lines).
- Look: 3D strip 1.5 m wide (`hw` 0.75), colour `#ff3fb4`, opacity 0.85, `depthWrite: false`, polygon offset. Height = `max(terrainH, roadSurfH, water surface) + 0.25`. Minimap: `#ff3fb4`, 2 px, `setLineDash([6, 4])`.
- The boundary mesh is **not** part of `parts`/`MESH` (so `applyStyle` and the collision/surface code never see it) and is never registered as a surface.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments). Match the surrounding code and do not reformat neighbours. No framework, no bundler, no `package.json`, no build step.
- New prototype code must **not** call `rr()` or `rnd()` (the seeded RNG drives house colours and trees).
- UI strings in English, like the rest of the HUD.
- Commands: pipeline tests `cd pipeline && ./.venv/bin/python -m pytest -q`. Node tests `node --test prototype/tests/*.test.mjs` (from the repo root; the glob is needed on Node 24). Smoke `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_boundaries.py -q` (slow, several minutes, foreground).
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** long verification runs.
- Never hand-edit `data/world_hochrhein.json`.

## Review Focus

- A boundary way that leaves the map and comes back must give **two** entries with the same `id`, not one line jumping across the gap. Pinned in Task 1 (`test_build_splits_a_line_that_leaves_and_reenters`).
- The national border runs in the middle of the Rhine: the strip must lie **on** the water surface, not on the riverbed under it. Pinned in Task 4 (`test_boundary_lies_on_the_rhine_not_under_it`).
- **T** (graphic style) swaps every `MESH` material. The boundary strip must keep its magenta material and its visibility. Pinned in Task 4 (`test_g_toggles_the_boundaries`, T step).
- Toggling must never change physics: the ground height on the line is the same with G on and off. Pinned in Task 4 (`test_g_toggles_the_boundaries`, ground step).
- An old world file without `boundaries` and the hand-traced layout must not crash: G toasts `no data`. Pinned in Task 2 (node default `[]`) and Task 4 (`test_hand_layout_g_says_no_data`).

---

## File map

- `pipeline/world_boundaries.py` (new): `member_names`, `read`, `build`.
- `pipeline/tests/fixtures/boundaries.osm` (new), `pipeline/tests/test_boundaries.py` (new).
- `pipeline/osm.py` `build_world` (~L85-133): call the module, add `"boundaries"`. Log line ~L113.
- `pipeline/tests/test_golden.py`: append a golden test.
- `prototype/world.js` `layoutFromWorld` (~L64-68); `prototype/tests/world.test.mjs`.
- `prototype/index.html`: help ~L113 (after the `V` line), MESH merge ~L742, `HUD` ~L814, keydown ~L815, `__mm` hooks ~L856, minimap static ~L939-940, `drawMap` ~L956.
- `prototype/tests/test_boundaries.py` (new), `docs/11-pipeline-osm.md`, `CHANGELOG.md`, `data/world_hochrhein.json` (rebuilt, Task 5).

Line numbers are from `main` @ `eec9eef`. Verify them with `grep -n` before editing, because other issues land in parallel.

---

### Task 1: Pipeline module `world_boundaries.py`

**Files:**
- Create: `pipeline/world_boundaries.py`, `pipeline/tests/fixtures/boundaries.osm`
- Test: `pipeline/tests/test_boundaries.py`

**Interfaces:**
- Consumes: `geo.Frame`, `osm_read._to_game(frame, geom)` (existing, `pipeline/osm_read.py` ~L88).
- Produces: `world_boundaries.member_names(path: Path) -> dict[int, list[str]]`; `world_boundaries.read(path: Path, frame: geo.Frame) -> list[tuple[int, list[str], shapely.LineString]]` (game coordinates, sorted by way id); `world_boundaries.build(items, clip: shapely.Polygon, min_len: float = 5.0) -> list[dict]` with dicts `{"id": int, "names": list[str], "pts": list[[float, float]]}`.

- [ ] **Step 1: Fixture.** Create `pipeline/tests/fixtures/boundaries.osm`. Node 901 is the game origin. 902 is about 225 m east, 903 about 222 m north of 902 (game z negative), and 904 is north of 901.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="901" lat="47.5506" lon="7.9671"/>
  <node id="902" lat="47.5506" lon="7.9701"/>
  <node id="903" lat="47.5526" lon="7.9701"/>
  <node id="904" lat="47.5526" lon="7.9671"/>
  <way id="900"><nd ref="901"/><nd ref="902"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="2"/></way>
  <way id="920"><nd ref="902"/><nd ref="903"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="8"/></way>
  <way id="930"><nd ref="903"/><nd ref="904"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="9"/></way>
  <way id="940"><nd ref="904"/><nd ref="901"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="8"/></way>
  <relation id="910"><member type="way" ref="900" role="outer"/><member type="way" ref="920" role="outer"/><tag k="type" v="boundary"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="8"/><tag k="name" v="Beta"/></relation>
  <relation id="911"><member type="way" ref="900" role="outer"/><tag k="type" v="boundary"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="8"/><tag k="name" v="Alpha"/></relation>
  <relation id="912"><member type="way" ref="930" role="outer"/><tag k="type" v="boundary"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="9"/><tag k="name" v="Ortsteil"/></relation>
  <relation id="913"><member type="way" ref="940" role="outer"/><tag k="type" v="boundary"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="8"/></relation>
  <relation id="914"><member type="way" ref="900" role="outer"/><tag k="type" v="boundary"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="2"/><tag k="name" v="Land"/></relation>
</osm>
```

- [ ] **Step 2: Write the failing tests** in `pipeline/tests/test_boundaries.py`:

```python
"""#48: Gemeinde boundaries (admin_level 8 member ways) as lines."""
from pathlib import Path

import pytest
import shapely

import geo
import world_boundaries as wb

FIX = Path(__file__).parent / "fixtures" / "boundaries.osm"
FRAME = geo.Frame(*geo.DEFAULT_ORIGIN)


def test_member_names_keeps_named_level_8_only():
    # 900 is shared by Alpha and Beta (and the level-2 "Land", ignored); 930 is level 9; 940's relation has no name
    assert wb.member_names(FIX) == {900: ["Alpha", "Beta"], 920: ["Beta"]}


def test_read_gives_game_lines_sorted_by_id():
    items = wb.read(FIX, FRAME)
    assert [(i, n) for i, n, _ in items] == [(900, ["Alpha", "Beta"]), (920, ["Beta"])]
    line900 = items[0][2]
    assert line900.coords[0] == pytest.approx((0, 0), abs=0.01)
    x1, z1 = line900.coords[-1]
    assert 220 < x1 < 230 and abs(z1) < 3                  # ~225 m east (LV95 grid is ~0.4° off true north: z ≈ -1.5)
    x2, z2 = items[1][2].coords[-1]
    assert 220 < x2 < 230 and -230 < z2 < -215             # ~222 m north = negative z


def test_build_clips_rounds_and_keeps_names():
    clip = shapely.box(0, 0, 100, 100)
    out = wb.build([(7, ["A", "B"], shapely.LineString([(-50, 50.04), (50.06, 50.04)]))], clip)
    assert out == [{"id": 7, "names": ["A", "B"], "pts": [[0.0, 50.0], [50.1, 50.0]]}]


def test_build_drops_parts_shorter_than_5_m_and_lines_outside():
    clip = shapely.box(0, 0, 100, 100)
    items = [(1, ["A"], shapely.LineString([(-10, 10), (4, 10)])),        # 4 m inside
             (2, ["A"], shapely.LineString([(200, 10), (300, 10)])),      # fully outside
             (3, ["A"], shapely.LineString([(-10, 0), (-10, 100)]))]      # touches nothing
    assert wb.build(items, clip) == []


def test_build_splits_a_line_that_leaves_and_reenters():
    clip = shapely.box(0, 0, 100, 100)
    line = shapely.LineString([(10, 50), (150, 50), (150, 60), (10, 60)])
    out = wb.build([(5, ["A"], line)], clip)
    assert [o["id"] for o in out] == [5, 5]
    assert sorted(o["pts"][0][1] for o in out) == [50.0, 60.0]
```

- [ ] **Step 3: Run them and expect FAIL** (`ModuleNotFoundError: No module named 'world_boundaries'`):
`cd pipeline && ./.venv/bin/python -m pytest tests/test_boundaries.py -q`

- [ ] **Step 4: Implement** `pipeline/world_boundaries.py`:

```python
"""Gemeinde boundaries (#48): member ways of OSM boundary=administrative + admin_level=8 relations, as lines.

Read apart from osm_read: in one pass pyosmium meets a relation only after its ways, and boundary ways carry no
highway/railway/waterway tag, so osm_read drops them. Lines, not areas: `osmium extract -s smart` completes only
multipolygon relations, so a Gemeinde reaching past the padded cut is incomplete and could not be assembled."""
from __future__ import annotations

from pathlib import Path

import osmium
import shapely
import shapely.wkb

from geo import Frame
from osm_read import _to_game

LEVEL = "8"
MIN_LEN = 5.0


def member_names(path: Path) -> dict[int, list[str]]:
    """way id -> sorted names of the named admin_level=8 relations it belongs to."""
    out: dict[int, set] = {}
    for r in osmium.FileProcessor(str(path), osmium.osm.RELATION):
        t = r.tags
        if t.get("boundary") != "administrative" or t.get("admin_level") != LEVEL or not t.get("name"):
            continue
        for m in r.members:
            if m.type == "w":
                out.setdefault(m.ref, set()).add(t["name"])
    return {k: sorted(v) for k, v in out.items()}


def read(path: Path, frame: Frame) -> list[tuple[int, list[str], shapely.LineString]]:
    """The member ways of member_names() as game-coordinate lines, sorted by way id."""
    names = member_names(path)
    fab = osmium.geom.WKBFactory()
    out = []
    for o in osmium.FileProcessor(str(path), osmium.osm.NODE | osmium.osm.WAY).with_locations():
        if not o.is_way() or o.id not in names:
            continue
        try:
            line = shapely.wkb.loads(fab.create_linestring(o))
        except (RuntimeError, osmium.InvalidLocationError):
            continue
        out.append((o.id, names[o.id], _to_game(frame, line)))
    return sorted(out, key=lambda t: t[0])


def _parts(g) -> list:
    if g.geom_type == "LineString":
        return [g]
    return [p for p in getattr(g, "geoms", []) if p.geom_type == "LineString"]


def build(items, clip, min_len: float = MIN_LEN) -> list[dict]:
    """Clip each line to the map; one entry per remaining part of at least min_len metres."""
    out = []
    for way_id, names, line in items:
        for part in _parts(line.intersection(clip)):
            if part.is_empty or part.length < min_len:
                continue
            out.append({"id": way_id, "names": list(names),
                        "pts": [[round(x, 1), round(z, 1)] for x, z in part.coords]})
    return out
```

- [ ] **Step 5: Run and expect PASS** (`5 passed`), then run the whole pipeline suite: `cd pipeline && ./.venv/bin/python -m pytest -q`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/world_boundaries.py pipeline/tests/fixtures/boundaries.osm pipeline/tests/test_boundaries.py
git commit -m "feat(pipeline): read Gemeinde boundaries from OSM admin_level 8 (#48)"
```

---

### Task 2: `boundaries` in the world file and in `layoutFromWorld`

**Files:**
- Modify: `pipeline/osm.py` (`build_world` ~L85-133, import block ~L24-35), `pipeline/tests/test_golden.py` (append), `prototype/world.js` (`layoutFromWorld` ~L64-68), `prototype/tests/world.test.mjs` (append), `docs/11-pipeline-osm.md`

**Interfaces:**
- Consumes: Task 1 `world_boundaries.read`, `world_boundaries.build`.
- Produces: world key `"boundaries"` (list as in Global Constraints); `layoutFromWorld(w).boundaries` (array, `[]` when the key is missing).

- [ ] **Step 1: Failing golden test** (append to `pipeline/tests/test_golden.py`; it skips without the local extract, like the rest of that file):

```python
def test_gemeinde_boundaries(world):
    b = world["boundaries"]
    assert 20 <= len(b) <= 40
    assert all(x["names"] and all(x["names"]) and len(x["pts"]) >= 2 for x in b)
    se = [x for x in b if x["id"] == 123001743]                  # Sisseln | Eiken
    assert se and all(x["names"] == ["Eiken", "Sisseln"] for x in se)
    line = shapely.MultiLineString([x["pts"] for x in se])
    assert line.distance(shapely.Point(3079.8, -274.3)) < 2     # where it crosses the Hauptstrasse
```

- [ ] **Step 2: Failing node test** (append to `prototype/tests/world.test.mjs`):

```js
test('layoutFromWorld passes boundaries and defaults to an empty list (#48)', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.deepEqual(layoutFromWorld(base).boundaries, []);
  const b = [{ id: 123001743, names: ['Eiken', 'Sisseln'], pts: [[0, 0], [10, 0]] }];
  assert.deepEqual(layoutFromWorld({ ...base, boundaries: b }).boundaries, b);
});
```

- [ ] **Step 3: Run and expect FAIL.** Node (`undefined` vs `[]`): `node --test prototype/tests/*.test.mjs`. Golden (`KeyError: 'boundaries'`, or SKIPPED without the extract): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs -k gemeinde`.

- [ ] **Step 4: Implement.**

In `pipeline/osm.py` add `import world_boundaries` to the module imports (alphabetical, after `import world_buildings`). In `build_world`, after the `rail = ...` statement:

```python
    boundaries = world_boundaries.build(world_boundaries.read(Path(pbf), frame), clip)
```

Extend the existing summary `log(...)` so it ends with `f"rail {len(rail)}, props {len(props)} {prop_stats}, boundaries {len(boundaries)}"`, and add the key to the returned dict right after `"props": props,`:

```python
        "boundaries": boundaries,
```

In `prototype/world.js` `layoutFromWorld`, add `boundaries: w.boundaries || []` to the returned object, right after `streams: w.streams || [],`.

In `docs/11-pipeline-osm.md`:
- add `- \`world_boundaries.py\`: Gemeinde boundaries (OSM admin_level 8) as lines.` to the module list after `world_props.py`;
- add the line `  "boundaries": [{ id, names: [a, b], pts: [[x, z], ...] }],` to the MMW1 block after `"props"`;
- add this paragraph after the **House numbers (#12)** paragraph:

```markdown
**Gemeinde boundaries (#48).** `world_boundaries.py` reads the relations `boundary=administrative` + `admin_level=8` that have a `name`, which covers Swiss and German Gemeinden alike (Ortsteile at level 9/10 are left out). It exports their member **ways** as lines, so a border shared by two Gemeinden appears once with both `names` (sorted; one name when the other side is outside the data). Lines, not areas: `osmium extract -s smart` completes only multipolygon relations, so Gemeinden reaching past the padded cut are incomplete. The lines are clipped to the map, parts under 5 m are dropped, and coordinates are rounded to 0.1 m. The national border in the Rhine is included, because it is a Gemeinde border too. Real extract: 28 lines, about 16.5 KB; Sisseln | Eiken is way 123001743. The prototype draws them only while **G** is on.
```

- [ ] **Step 5: Run and expect PASS.** Run `node --test prototype/tests/*.test.mjs`, the full pipeline suite `cd pipeline && ./.venv/bin/python -m pytest -q`, and the golden file as in Step 3. It must pass where `pipeline/cache/osm/hochrhein.osm.pbf` exists and skip otherwise.

- [ ] **Step 6: Commit**

```bash
git add pipeline/osm.py pipeline/tests/test_golden.py prototype/world.js prototype/tests/world.test.mjs docs/11-pipeline-osm.md
git commit -m "feat(pipeline): write Gemeinde boundaries into the world file (#48)"
```

---

### Task 3: Draw the boundaries and toggle them with G

**Files:**
- Modify: `prototype/index.html`
- Test: `prototype/tests/test_boundaries.py` (new; Task 4 adds more cases)

**Interfaces:**
- Consumes: `L.boundaries` (Task 2). Existing functions in `index.html`: `ribbonGeo(src, hw, y, tileLen, onTerrain, hFn)`, `mergeGeometries`, `terrainH`, `roadSurfH`, `riverDist`, `waterSurface`, `WATER.levelAt`, `REAL`, `toast`, `MX`/`MZ`, `mapC`, `drawMap`.
- Produces: `HUD.bounds: boolean`; `BOUNDS: THREE.Group`; `boundaryY(x, z): number`; `toggleBounds()`; `mapBounds` canvas; hooks `window.__mm.boundaries() -> { on, lines, verts, groupVisible, color }`, `window.__mm.boundaryY(x, z) -> number`, and `bounds` in `window.__mm.hud()`.

- [ ] **Step 1: Failing test.** Create `prototype/tests/test_boundaries.py`:

```python
"""#48: Gemeinde boundaries, toggled with G (3D strip + minimap overlay). Slow (Playwright): run in the foreground.
The tests patch `boundaries` into the served world, so they do not depend on the world rebuild (Task 5)."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
LAND = {"id": 1, "names": ["Eiken", "Sisseln"], "pts": [[1500, 300], [1700, 360], [1900, 420]]}   # near the real Sisseln | Eiken border


def open_page(p, server, block_world=False, world=None, block_mmh=True):
    """world: a dict served instead of the file. Returns (browser, page, page errors)."""
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    if block_mmh:
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    elif world is not None:
        body = json.dumps(world, ensure_ascii=False)
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=200, content_type="application/json", body=body))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errs


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames (a headless renderer can be slower than 1 fps)."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=120000)


def rhine_point(w):
    rh = next(x for x in w["water"] if x["name"] == "Rhein" and len(x["rings"][0]) > 20)
    ring = rh["rings"][0]
    return sum(q[0] for q in ring) / len(ring), sum(q[1] for q in ring) / len(ring)


def with_boundaries(w):
    x, z = rhine_point(w)
    return {**w, "boundaries": [LAND, {"id": 2, "names": ["Bad Säckingen", "Sisseln"], "pts": [[x, z - 150], [x, z + 150]]}]}


STATE = "() => window.__mm.boundaries()"


@needs_world
def test_g_toggles_the_boundaries(server):
    w = with_boundaries(json.loads(WORLD.read_text(encoding="utf-8")))
    x, z = LAND["pts"][1]
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, world=w)
        s = page.evaluate(STATE)
        assert s["lines"] == 2 and s["verts"] > 0 and not s["on"] and not s["groupVisible"]
        assert page.evaluate("() => window.__mm.hud().bounds") is False
        g0 = page.evaluate("([x, z]) => window.__mm.ground(x, z, 1e4)", [x, z])
        page.keyboard.press("KeyG")
        s = page.evaluate(STATE)
        assert s["on"] and s["groupVisible"] and page.evaluate("() => window.__mm.hud().bounds") is True
        assert "Gemeinde boundaries on" in page.inner_text("#toast")
        assert page.evaluate("([x, z]) => window.__mm.ground(x, z, 1e4)", [x, z]) == g0      # physics untouched
        page.keyboard.press("KeyT")                                                            # style swap keeps the strip
        s = page.evaluate(STATE)
        assert s["groupVisible"] and s["color"] == "ff3fb4"
        page.keyboard.press("KeyG")
        s = page.evaluate(STATE)
        assert not s["on"] and not s["groupVisible"]
        assert "Gemeinde boundaries off" in page.inner_text("#toast")
        assert errs == []
        b.close()
```

- [ ] **Step 2: Run and expect FAIL** (`TypeError: window.__mm.boundaries is not a function`):
`cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_boundaries.py -q`

- [ ] **Step 3: Implement** in `prototype/index.html` (check each anchor with `grep -n` first):

a) Right **after** the line `for (const role in parts) { const g = mergeGeometries(parts[role], false); ... MESH[role] = m; }` (~L742). By then every road surface is registered, so `roadSurfH` is complete:

```js
// Gemeinde boundaries (#48, OSM admin_level 8): a magenta strip on the ground, the road or the water, hidden until G; its own group outside MESH, so applyStyle and the collision code never see it
const boundaryY = (x, z) => Math.max(terrainH(x, z), roadSurfH(x, z), waterSurface(riverDist(x, z), L && REAL ? WATER.levelAt(x, z) : 0) ?? -Infinity) + 0.25;
const BOUNDS = new THREE.Group(); BOUNDS.visible = false; scene.add(BOUNDS);
if (L && L.boundaries.length) BOUNDS.add(new THREE.Mesh(mergeGeometries(L.boundaries.map(b => ribbonGeo(b.pts, 0.75, 0, 4, false, p => boundaryY(p[0], p[1]))), false), new THREE.MeshBasicMaterial({ color: 0xff3fb4, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
```

b) `HUD` (~L814): add `bounds: false` after `carHidden: false`, i.e. `const HUD = { carHidden: false, bounds: false, blinker: null, ...`. Also extend its comment: `// HUD state (#20): car hidden (V), turn signal (Q/E), odometer total persisted per browser; Gemeinde boundaries (G, #48)`.

c) In the `keydown` listener (~L815), insert right after the `KeyV` clause `if (e.code === 'KeyV') { ... }`:

```js
 if (e.code === 'KeyG') toggleBounds();
```

and on the line right after the listener statement:

```js
// G (#48): Gemeinde boundaries on/off, in 3D and on the minimap; "no data" in the hand layout or with a world file built before #48
function toggleBounds() { HUD.bounds = !HUD.bounds; BOUNDS.visible = HUD.bounds; toast(!L || !L.boundaries.length ? 'Gemeinde boundaries: no data' : 'Gemeinde boundaries ' + (HUD.bounds ? 'on' : 'off')); }
```

d) Hooks (~L856): in the `window.__mm.hud` object add `bounds: HUD.bounds` after `carVisible: car.visible`, and below the `window.__mm.hud = ...` line add:

```js
window.__mm.boundaries = () => ({ on: HUD.bounds, lines: L ? L.boundaries.length : 0, verts: BOUNDS.children[0]?.geometry.attributes.position.count || 0, groupVisible: BOUNDS.visible, color: BOUNDS.children[0]?.material.color.getHexString() || '' });
window.__mm.boundaryY = (x, z) => boundaryY(x, z);
```

e) Help (~L113), right after `<kbd>V</kbd><span>show / hide the car</span>`:

```html
      <kbd>G</kbd><span>show / hide the Gemeinde boundaries</span>
```

- [ ] **Step 4: Run and expect PASS** (same command as Step 2, `1 passed`), then `node --test prototype/tests/*.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_boundaries.py
git commit -m "feat(prototype): G shows the Gemeinde boundaries (#48)"
```

---

### Task 4: Minimap overlay, Rhine height, hand layout, changelog

**Files:**
- Modify: `prototype/index.html` (minimap static ~L939-940, `drawMap` ~L956), `CHANGELOG.md`
- Test: `prototype/tests/test_boundaries.py` (append)

**Interfaces:**
- Consumes: Task 3 `HUD.bounds`, `boundaryY`, hooks; existing `window.__mm.worldToMap(x, z) -> [px, py]` and `window.__mm.probe(x, z) -> { terrain, water, bridge }`.
- Produces: `mapBounds` canvas drawn by `drawMap` while `HUD.bounds`.

- [ ] **Step 1: Failing tests** (append to `prototype/tests/test_boundaries.py`):

```python
MAGENTA_JS = """([x, z]) => { const [px, py] = window.__mm.worldToMap(x, z), d = document.getElementById('map').getContext('2d').getImageData(Math.round(px) - 3, Math.round(py) - 3, 7, 7).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 120 && d[i + 2] > 120) n++; return n; }"""


@needs_world
def test_minimap_shows_the_line_only_while_on(server):
    w = with_boundaries(json.loads(WORLD.read_text(encoding="utf-8")))
    mid = LAND["pts"][1]
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, world=w)
        wait_frames(page); assert page.evaluate(MAGENTA_JS, mid) == 0
        page.keyboard.press("KeyG"); wait_frames(page); assert page.evaluate(MAGENTA_JS, mid) > 0
        page.keyboard.press("KeyG"); wait_frames(page); assert page.evaluate(MAGENTA_JS, mid) == 0
        assert errs == []
        b.close()


@needs_world
def test_boundary_lies_on_the_rhine_not_under_it(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    x, z = rhine_point(w)
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, world=with_boundaries(w), block_mmh=False)   # real terrain: real water levels
        water = page.evaluate("([x, z]) => window.__mm.probe(x, z).water", [x, z])
        assert water is not None
        assert page.evaluate("([x, z]) => window.__mm.boundaryY(x, z)", [x, z]) >= water + 0.2
        b.close()


def test_hand_layout_g_says_no_data(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, block_world=True)
        page.keyboard.press("KeyG")
        s = page.evaluate("() => window.__mm.boundaries()")
        assert s["on"] and s["lines"] == 0 and s["verts"] == 0
        assert "no data" in page.inner_text("#toast")
        page.keyboard.press("F1")
        assert "Gemeinde boundaries" in page.inner_text("#help")
        wait_frames(page)
        assert errs == []
        b.close()
```

- [ ] **Step 2: Run and expect FAIL.** `test_minimap_shows_the_line_only_while_on` fails (`0 > 0`); the other two already pass with Task 3. Run:
`cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_boundaries.py -q`
If `test_boundary_lies_on_the_rhine_not_under_it` fails, fix `boundaryY` (Task 3a) and do not relax the test.

- [ ] **Step 3: Implement** in `prototype/index.html`:

a) Right after the line that draws `mapStatic` (the `{ const g = mapStatic.getContext('2d'); ... }` block, ~L940):

```js
// #48: the Gemeinde boundaries as a dashed overlay, pre-rendered like mapStatic and drawn over it only while G is on
const mapBounds = document.createElement('canvas'); mapBounds.width = mapC.width; mapBounds.height = mapC.height;
if (L) { const g = mapBounds.getContext('2d'); g.strokeStyle = '#ff3fb4'; g.lineWidth = 2; g.lineCap = 'round'; g.setLineDash([6, 4]); for (const b of L.boundaries) { g.beginPath(); b.pts.forEach(([x, z], i) => i ? g.lineTo(MX(x), MZ(z)) : g.moveTo(MX(x), MZ(z))); g.stroke(); } }
```

b) In `drawMap` (~L956), directly after `mg.drawImage(mapStatic, v.ox - w / 2 / v.z, v.oy - h / 2 / v.z, w / v.z, h / v.z, 0, 0, w, h);` insert:

```js
 if (HUD.bounds) mg.drawImage(mapBounds, v.ox - w / 2 / v.z, v.oy - h / 2 / v.z, w / v.z, h / v.z, 0, 0, w, h);
```

c) `CHANGELOG.md`, add as the first bullet under `## [Unreleased]` → `### Added`:

```markdown
- Press **G** to show the Gemeinde boundaries: a magenta line on the ground and a dashed one on the minimap show where Sisseln ends and Eiken begins, and every other village border on the map, the one in the middle of the Rhine included. Press **G** again to hide them.
```

- [ ] **Step 4: Run and expect PASS** (same command, `4 passed`).

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_boundaries.py CHANGELOG.md
git commit -m "feat(prototype): Gemeinde boundaries on the minimap (#48)"
```

---

### Task 5: Rebuild the world file (with measured heights), guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

**Interfaces:**
- Consumes: Tasks 1-2 (pipeline). The prototype tasks do not depend on this task.

**Push the branch first** (`git push -u origin HEAD`), so the work is safe if this step stops.

- [ ] **Step 1: Cache check, and STOP if it fails.** The build needs the local caches, and a CI runner usually has none of them:

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP`: do **not** run the build, do **not** touch or commit `data/world_hochrhein.json`, do not let the build download tiles, and do not attempt an `osmium` cut. Skip to Task 6 and state in the PR description: "World not rebuilt: pipeline caches missing on this machine. Run Task 5 of docs/superpowers/plans/2026-10-02-gemeinde-boundaries.md locally." Never commit a world built without `--dsm-heights`.

- [ ] **Step 2: Golden tests first** (they must pass on the real extract, not skip):
`cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs`
Expected: all pass, with no `SKIPPED`.

- [ ] **Step 3: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected in the log: `building heights from swissSURFACE3D: {... 'dsm': 16xx ...}`, and the summary line ends with `boundaries 28` (± a few).

- [ ] **Step 4: Guard: the world may differ from `main` only by the new key.**

```bash
git fetch origin main && OLD=$(mktemp) && git show origin/main:data/world_hochrhein.json > "$OLD"
OLD="$OLD" ./pipeline/.venv/bin/python - <<'EOF'
import json, os
a = json.load(open(os.environ["OLD"], encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
for w in (a, b): w["params"].pop("built", None)
bnd = b.pop("boundaries")
assert a == b, [k for k in a if a[k] != b.get(k)]
assert sum(1 for x in a["buildings"] if x.get("hsrc") == "dsm") > 1500        # measured heights kept
assert 20 <= len(bnd) <= 40, len(bnd)
assert any(x["id"] == 123001743 and x["names"] == ["Eiken", "Sisseln"] for x in bnd)
print("guard ok:", len(bnd), "boundary lines")
EOF
ls -l "$OLD" data/world_hochrhein.json
```

Expected: `guard ok: 28 boundary lines`, and the new file is about 17 KB larger. If the guard fails: **STOP**, run `git checkout -- data/world_hochrhein.json`, and report the differing keys. If they are keys other issues added to the pipeline without rebuilding `main`'s world file, say so in the PR and leave the rebuild to the maintainer.

- [ ] **Step 5: Commit**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild world with Gemeinde boundaries (#48)"
```

---

### Task 6: Full verification

**Files:** none changed (unless a check fails).

- [ ] **Step 1: Push, then run every suite in the foreground:**

```bash
git push
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q
cd .. && node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q
```

Expected: all green. Existing tests are unchanged, and data-dependent tests skip only where the data files are missing, exactly as before.

- [ ] **Step 2: RNG check.** `git diff origin/main -- prototype/index.html | grep -n "rr(\|rnd()"` prints nothing.

- [ ] **Step 3: Manual playtest** (`python3 -m http.server 8000` at the repo root, then open `http://localhost:8000/prototype/index.html`). The console must be empty. Press G and check that:
  - a magenta strip crosses the Hauptstrasse at the east end of Sisseln (about x 3080, z −274), the Laufenburgerstrasse (about 1527, 408) and the Bahnhofstrasse (about 1867, 396);
  - it lies on the Rhine surface along the national border;
  - the minimap shows dashed magenta lines at every zoom.

  Press G again: everything is gone. T keeps the strip, and V/C/J still work. The hand layout (world file blocked or missing) toasts `Gemeinde boundaries: no data`.

- [ ] **Step 4: PR description** says:
  - G is the new key (and that #39's debug mode must not reuse it);
  - only `admin_level=8` is drawn;
  - lines, not areas, and why;
  - whether Task 5 ran, or why not.
