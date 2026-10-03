# Südspange ESP Sisslerfeld Implementation Plan (#42)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Südspange (K295 junction → Sisslerstrasse Münchwilen, plus the Freiverlad access) is a drivable road with its real cross-sections, a cutting near the K295 and an underpass below the DSM tracks; the HUD calls it "Südspange".

**Architecture:** Built on #76 (rail decks, `meshH`, the 2 m cut patch, `cutDepth`). `pipeline/anchors.json` gets a `roads` section: pieces assembled from OSM ways (also dropped ones: track, construction, proposed) and hand points. A new `pipeline/world_extra_roads.py` turns them into ordinary MMW1 road entries (via `world_roads.build`), removes the OSM ribbons they replace, emits a new MMW1 key `grades` (road profile controls) and moves the rail inside a grade's band onto `railBridges` decks. The prototype adds grade cuts as a second cut source to #76's patch, so the graded road drapes onto its profile, and draws Baustelle/Fahrverbot signs from two new landmark kinds.

**Tech Stack:** Python 3.12 pipeline (pyosmium, shapely 2, pytest), buildless three.js prototype, Node 24 `node:test`, Playwright (Python) + pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-suedspange-design.md`

## Global Constraints

- **Landing order: #76 first.** This plan needs #76 (`docs/superpowers/plans/2026-10-03-rail-bridges-underpasses.md`) merged on `main`: `pipeline/world_rail.py`, the `railBridges` key, `meshH`, `CUT_CELLS`, `cutDepth`, `buildCuts`, `UNDERPASS`, `patchCells`, `pointAtLength`, `__mm.crossings`, `__mm.cutDepth`. Task 0 stops if it is not.
- Use TDD for every task: failing test first, watch it fail, minimal implementation, green. Never change a test to make it green (the one deliberate test change is #76's `LEVEL` list in Task 8, a behaviour change by design).
- Coordinates are game metres (x east, z south). OSM ids and points used here, exactly:
  - section 1: `w1417144102` (1528, 409) → (1198, 573); DSM tracks cross it at x 1229.6–1250.0, z ≈ 574;
  - section 2: `w222534467` from (1198.1, 572.7) to (954.2, 567.6), `w824663095`, `w118856572` from (953.4, 497.0) to (514.0, 498.0);
  - section 3: `w118856572` from (514.0, 498.0) to (511.1, 394.3), `w118856576`, hand point (353.4, 420.3);
  - section 4: `w52017693` (Geuerenstrasse, (32.8, 402.1) ↔ (353.4, 420.3));
  - Freiverlad: hand points (514.0, 498.0), (514.4, 748.6), then `w1417144101` to (625.4, 815.8);
  - replaced: `w118856572` (reused stretch only), `w52017693`; trimmed: `w183354680`;
  - grade controls: (1528, 409) cut 0, (1240, 574) cut 6.5, (1092, 573) cut 0; `hw` 9.5.
- Piece ids: -42001 sections 1–2 (n `Südspange`, tertiary, lanes 2, w 8.0), -42002 its path (cycleway, w 3.0, offset +7.5 = north of the westbound road), -42003 section 3 (n `Südspange`, unclassified, lanes 2, w 7.0), -42004 section 4 (n `Geuerenstrasse`, unclassified, lanes 2, w 7.0), -42005 Freiverlad (n `Zufahrt Freiverlad`, service, w 6.0).
- Game roads are appended **after** buildings, props and parking are built (`osm.build_world`): those layers must not change.
- Grade band = `hw + 24 m`: `BAND = 24.0` in `pipeline/world_extra_roads.py` and `GRADE_BAND = 24` in `prototype/world.js` must stay equal. The prototype's grade cut never reaches past it; rail inside it goes on a deck; `trim` clears roads inside it.
- Never commit the report's figures. Sign texts are German (in-world signage), no i18n strings.
- Memory-heavy commands (world build, golden tests, Playwright) run under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never `run_in_background`. Exit 137 = cap hit: stop and report, do not raise the cap. Without `systemd-run --user` (CI runner), run the bare command.
- No `osmium` cut: `pipeline/cache/osm/hochrhein.osm.pbf` (2026-10-01) holds every way listed above.
- Never hand-edit `data/world_hochrhein.json`; never commit a world built without `--dsm-heights`.
- Line numbers in `prototype/index.html` move with #76; find places by the quoted code, not by number.
- Commands: pipeline tests `cd pipeline && ./.venv/bin/python -m pytest -q`; node tests `node --test prototype/tests/*.test.mjs` (repo root); browser tests `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_suedspange.py -v` (slow, foreground).
- Commit after every task (Conventional Commits, explicit `git add <paths>`, never `-A`). Push the branch **before** long verification runs.

## Review Focus

- **No double roads:** the OSM Geuerenstrasse and the reused `w118856572` stretch are gone; `w118856572`'s leg north of (511, 394) stays.
- **Grades are relative:** the world file stores `[t, cut]`; heights come from the prototype's own uncut mesh (`meshH`), so the procedural fallback works too.
- **One cut mechanism:** grade cuts go through #76's `cutDepth`/`CUT_CELLS` patch; no second terrain edit, no road-height special case.
- **Patch border:** a grade's depth is 0 at `outer` (≤ `hw + 24`), and every cell within `outer` is patched, so no crack. Node test `gradeCells covers every point with a cut`.
- **Rail over the cut:** the DSM tracks inside the band are `railBridges` decks, so #76 keeps them at the uncut height and `railGap` stays < 0.3 m.
- **Other layers unchanged:** the rebuild guard (Task 9) allows differences only in `roads`, `junctions`, `grades`, `rail`, `railBridges`, `anchors`, `params.built`.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1:** `git fetch origin && git log --oneline -1 origin/main`, branch `feature/42-suedspange` from `origin/main`.
- [ ] **Step 2: #76 check.** `test -f pipeline/world_rail.py && grep -c -E "CUT_CELLS|function cutDepth|function buildCuts|function meshH" prototype/index.html && grep -c -E "export const UNDERPASS|export function patchCells|export function pointAtLength" prototype/world.js`. Expect the file and counts ≥ 4 and ≥ 3. Otherwise STOP and report "blocked: #76 (rail bridges and underpasses) is not merged; #42 builds on it". Do not implement #76's mechanism here.
- [ ] **Step 3:** `test -f pipeline/cache/osm/hochrhein.osm.pbf && echo PBF-OK || echo "no PBF: golden tests will skip, Task 9 will stop"`.

---

### Task 1: `world_extra_roads.assemble`

**Files:**
- Create: `pipeline/world_extra_roads.py`
- Test: `pipeline/tests/test_extra_roads.py`

**Interfaces:**
- Produces: `assemble(via: list[dict], lines: dict[int, LineString]) -> list[tuple[float, float]]`.

- [ ] **Step 1: Write the failing test**

```python
import pytest
import shapely

import world_extra_roads as X
from osm_read import Way

CLIP = shapely.box(-1000, -1000, 1000, 1000)
LINES = {1: shapely.LineString([(0, 0), (100, 0)]), 2: shapely.LineString([(100, 50), (100, 0)]),
         3: shapely.LineString([(0, 0), (0, -100), (-50, -100)])}


def test_assemble_turns_ways_and_drops_shared_vertices():
    assert X.assemble([{"osm": "w1"}, {"osm": "w2"}, {"game": [150, 50]}], LINES) == [(0, 0), (100, 0), (100, 50), (150, 50)]


def test_assemble_sub_range_runs_from_to():
    pts = X.assemble([{"osm": "w3", "from": [0, -50], "to": [-20, -100]}], LINES)
    assert pts == [pytest.approx((0, -50)), pytest.approx((0, -100)), pytest.approx((-20, -100))]


def test_assemble_rejects_far_points_and_missing_ways():
    with pytest.raises(ValueError):
        X.assemble([{"osm": "w1", "from": [50, 40]}], LINES)
    with pytest.raises(KeyError):
        X.assemble([{"osm": "w9"}], LINES)
```

- [ ] **Step 2:** `cd pipeline && ./.venv/bin/python -m pytest tests/test_extra_roads.py -q` → FAIL (module missing).
- [ ] **Step 3: Implement**

```python
"""Game-only roads from anchors.json (#42): the Südspange ESP Sisslerfeld, assembled from OSM ways the pipeline
otherwise drops (track, construction, proposed) and hand points, plus its grade (cutting, underpass)."""
from __future__ import annotations

import shapely
from shapely.ops import substring

import world_roads
from osm_read import Way

SNAP = 15.0            # m: a from/to/grade point must lie this close to its line
REPLACE_BUF = 1.0      # m: an OSM ribbon this close to a game road is the same road
BAND = 24.0            # m beyond hw: the prototype's grade cut never reaches further (GRADE_BAND in world.js)


def _way_id(ref: str) -> int:
    if not ref.startswith("w"):
        raise ValueError(f"extra roads: only ways can be reused, got {ref}")
    return int(ref[1:])


def _step_coords(step, lines):
    if "game" in step:
        return [tuple(float(v) for v in step["game"])]
    wid = _way_id(step["osm"])
    if wid not in lines:
        raise KeyError(f"extra roads: {step['osm']} is not in the extract")
    line = lines[wid]
    if "from" not in step and "to" not in step:
        return [tuple(p) for p in line.coords]
    for key in ("from", "to"):
        if key in step and line.distance(shapely.Point(step[key])) > SNAP:
            raise ValueError(f"extra roads: {step['osm']} {key} {step[key]} is not on the way")
    a = line.project(shapely.Point(step.get("from", line.coords[0])))
    b = line.project(shapely.Point(step.get("to", line.coords[-1])))
    coords = [tuple(p) for p in substring(line, min(a, b), max(a, b)).coords]
    return coords[::-1] if a > b else coords


def _dist(p, q) -> float:
    return shapely.Point(p).distance(shapely.Point(q))


def assemble(via, lines):
    """One piece's steps -> polyline. A whole way is turned around when its far end is nearer the polyline so far;
    a vertex shared by two steps appears once."""
    out = []
    for step in via:
        seg = _step_coords(step, lines)
        if out and len(seg) > 1 and "from" not in step and _dist(seg[-1], out[-1]) < _dist(seg[0], out[-1]):
            seg = seg[::-1]
        if out and _dist(seg[0], out[-1]) < 0.5:
            seg = seg[1:]
        out.extend(seg)
    return out
```

- [ ] **Step 4:** run the test → PASS.
- [ ] **Step 5:** `git add pipeline/world_extra_roads.py pipeline/tests/test_extra_roads.py && git commit -m "feat(pipeline): assemble game-only roads from OSM ways and hand points (#42)"`

---

### Task 2: `world_extra_roads.apply` — road entries, path, replace/trim, junctions, grades

**Files:**
- Modify: `pipeline/world_extra_roads.py`
- Test: `pipeline/tests/test_extra_roads.py`

**Interfaces:**
- Consumes: `world_roads.build(ways, nodes, way_nodes, clip) -> (roads, junctions)`, `world_roads._r`.
- Produces: `apply(spec_roads: dict, ways: list[Way], roads: list, junctions: list, clip) -> (roads, junctions, grades)`; `grades` entries `{"pts": [[x, z]], "hw": float, "ctl": [[t, cut]]}`.

- [ ] **Step 1: Write the failing tests** (append)

```python
PIECE = {"id": -1, "n": "Südspange", "tags": {"highway": "tertiary", "lanes": "2"}, "w": 8.0,
         "path": {"id": -2, "w": 3.0, "off": 7.5}, "via": [{"game": [200, 0]}, {"game": [0, 0]}]}


def test_empty_spec_changes_nothing():
    assert X.apply({}, [], [{"id": 1}], [[0, 0, 1]], CLIP) == ([{"id": 1}], [[0, 0, 1]], [])


def test_piece_becomes_a_marked_road_with_its_path_on_the_north():
    roads, junctions, grades = X.apply({"s": {"pieces": [PIECE]}}, [], [], [], CLIP)
    road = [r for r in roads if r["id"] == -1]
    path = [r for r in roads if r["id"] == -2]
    assert road and all(r["n"] == "Südspange" and r["w"] == 8.0 and r["cls"] == "tertiary" and r["mark"] == "centre"
                        for r in road)
    assert len(path) == 1 and path[0]["cls"] == "cycleway" and path[0]["w"] == 3.0 and path[0]["n"] == ""
    assert path[0]["mark"] == "none" and not path[0]["bridge"]
    assert all(z == pytest.approx(-7.5) for _, z in path[0]["pts"])          # westbound: north = smaller z
    assert sorted(j[:2] for j in junctions) == [[0.0, 0.0], [200.0, 0.0]] and all(j[2] == 4.3 for j in junctions)
    assert grades == []


def test_replace_removes_only_the_shared_stretch():
    old = [{"id": 5, "n": "", "cls": "service", "w": 4.0, "mark": "none", "bridge": False, "layer": 0,
            "pts": [[0, -100], [0, 0], [0, 100]]}]
    ways = [Way(5, {"highway": "service"}, shapely.LineString([(0, -100), (0, 0), (0, 100)]))]
    spec = {"s": {"pieces": [{"id": -3, "n": "S", "tags": {"highway": "unclassified", "lanes": "2"}, "w": 7.0,
                              "via": [{"osm": "w5", "from": [0, 0], "to": [0, 100]}]}], "replace": ["w5"]}}
    roads, _, _ = X.apply(spec, ways, old, [], CLIP)
    left = [shapely.LineString(r["pts"]) for r in roads if r["id"] == 5]
    assert len(left) == 1 and left[0].bounds[3] <= 0 and left[0].length > 95


GRADED = {"id": -1, "n": "S", "tags": {"highway": "tertiary"}, "w": 8.0, "via": [{"game": [0, 0]}, {"game": [300, 0]}]}


def test_grade_controls_are_projected_onto_the_piece():
    spec = {"s": {"pieces": [GRADED], "grade": {"piece": -1, "hw": 9.5, "ctl": [
        {"at": [50, 2], "cut": 0}, {"at": [150, 0], "cut": 6.5}, {"at": [250, -1], "cut": 0}]}}}
    _, _, grades = X.apply(spec, [], [], [], CLIP)
    assert grades == [{"pts": [[50.0, 0.0], [250.0, 0.0]], "hw": 9.5, "ctl": [[0.0, 0.0], [100.0, 6.5], [200.0, 0.0]]}]


@pytest.mark.parametrize("ctl", [
    [{"at": [50, 0], "cut": 1}, {"at": [250, 0], "cut": 0}],          # does not start on the terrain
    [{"at": [250, 0], "cut": 0}, {"at": [50, 0], "cut": 0}],          # runs backwards
    [{"at": [50, 0], "cut": 0}, {"at": [150, 40], "cut": 0}],         # off the piece
])
def test_bad_grades_are_rejected(ctl):
    with pytest.raises(ValueError):
        X.apply({"s": {"pieces": [GRADED], "grade": {"piece": -1, "hw": 9.5, "ctl": ctl}}}, [], [], [], CLIP)


def test_trim_clears_the_grade_band():
    other = {"id": 7, "n": "", "cls": "service", "w": 4.0, "mark": "none", "bridge": False, "layer": 0,
             "pts": [[100, 10], [100, 200]]}
    spec = {"s": {"pieces": [GRADED], "trim": ["w7"], "grade": {"piece": -1, "hw": 9.5, "ctl": [
        {"at": [50, 0], "cut": 0}, {"at": [150, 0], "cut": 6.5}, {"at": [250, 0], "cut": 0}]}}}
    roads, _, _ = X.apply(spec, [], [other], [], CLIP)
    left = [r for r in roads if r["id"] == 7]
    assert left and min(z for _, z in left[0]["pts"]) >= 9.5 + 24 - 0.5


def test_existing_junction_on_a_game_road_grows():
    _, junctions, _ = X.apply({"s": {"pieces": [GRADED]}}, [], [], [[100.0, 0.0, 3.05], [100.0, 50.0, 3.05]], CLIP)
    assert [100.0, 0.0, 4.3] in junctions and [100.0, 50.0, 3.05] in junctions
```

- [ ] **Step 2:** run → FAIL (`apply` missing).
- [ ] **Step 3: Implement** (append to `world_extra_roads.py`)

```python
def _piece_roads(piece, coords, clip):
    tags = {**piece["tags"], "name": piece.get("n", ""), "width": str(piece["w"])}
    roads, _ = world_roads.build([Way(piece["id"], tags, shapely.LineString(coords))], {}, {}, clip)
    if "path" in piece:
        p = piece["path"]
        off = shapely.LineString(coords).offset_curve(p["off"]).simplify(0.5, preserve_topology=False).intersection(clip)
        for part in getattr(off, "geoms", [off]):
            if not part.is_empty and part.length >= 1.0:
                roads.append({"id": p["id"], "n": "", "cls": "cycleway", "w": float(p["w"]), "mark": "none",
                              "bridge": False, "layer": 0, "pts": [world_roads._r(q) for q in part.coords]})
    return roads


def _carve(roads, ids, zone):
    out = []
    for r in roads:
        if r.get("id") not in ids:
            out.append(r)
            continue
        rest = shapely.LineString(r["pts"]).difference(zone)
        for part in getattr(rest, "geoms", [rest]):
            if not part.is_empty and part.length >= 1.0:
                out.append({**r, "pts": [world_roads._r(q) for q in part.coords]})
    return out


def _grade(g, coords):
    line = shapely.LineString(coords)
    ctl = []
    for c in g["ctl"]:
        p = shapely.Point(c["at"])
        if line.distance(p) > SNAP:
            raise ValueError(f"grade: {c['at']} is not on the piece")
        ctl.append((line.project(p), float(c["cut"])))
    ts = [t for t, _ in ctl]
    if len(ctl) < 2 or ts != sorted(ts) or len(set(ts)) != len(ts):
        raise ValueError("grade: controls must run along the piece")
    if ctl[0][1] != 0 or ctl[-1][1] != 0:
        raise ValueError("grade: the first and last cut must be 0")
    span = substring(line, ts[0], ts[-1])
    return {"pts": [world_roads._r(p) for p in span.coords], "hw": float(g["hw"]),
            "ctl": [[round(t - ts[0], 1), cut] for t, cut in ctl]}


def _widen(junctions, new):
    lines = [(shapely.LineString(r["pts"]), r["w"] / 2 + 0.3) for r in new if r["cls"] != "cycleway"]
    out = []
    for x, z, r in junctions:
        p = shapely.Point(x, z)
        out.append([x, z, max([r] + [rad for g, rad in lines if g.distance(p) <= REPLACE_BUF])])
    return out


def apply(spec, ways, roads, junctions, clip):
    """Append the game-only roads of anchors.json `roads` to the OSM roads; returns (roads, junctions, grades)."""
    if not spec:
        return roads, junctions, []
    lines = {w.id: w.line for w in ways if "highway" in w.tags}
    new, grades, ends = [], [], []
    for road in spec.values():
        built = [(p, assemble(p["via"], lines)) for p in road["pieces"]]
        game = shapely.MultiLineString([c for _, c in built])
        roads = _carve(roads, {_way_id(s) for s in road.get("replace", [])}, game.buffer(REPLACE_BUF))
        for piece, coords in built:
            new += _piece_roads(piece, coords, clip)
            ends += [[world_roads._r(p)[0], world_roads._r(p)[1], round(piece["w"] / 2 + 0.3, 2)] for p in (coords[0], coords[-1])]
        if "grade" in road:
            g = road["grade"]
            grades.append(_grade(g, next(c for p, c in built if p["id"] == g["piece"])))
            band = shapely.LineString(grades[-1]["pts"]).buffer(grades[-1]["hw"] + BAND)
            roads = _carve(roads, {_way_id(s) for s in road.get("trim", [])}, band)
    return roads + new, _widen(junctions, new) + ends, grades
```

Note: two pieces sharing an end each add a disc there; the duplicate is harmless (overlapping flat discs). If the `test_piece_becomes...` junction assertion trips on duplicates, de-duplicate `ends` by rounded position keeping the largest radius — do not change the test.

- [ ] **Step 4:** run `tests/test_extra_roads.py` → PASS; then the whole pipeline suite (`./.venv/bin/python -m pytest -q`) → green (golden tests may skip without the PBF).
- [ ] **Step 5:** `git add pipeline/world_extra_roads.py pipeline/tests/test_extra_roads.py && git commit -m "feat(pipeline): game-only road entries, replace/trim, junctions and grades (#42)"`

---

### Task 3: `world_extra_roads.deck_rail` — rail inside a grade band goes on a deck

**Files:**
- Modify: `pipeline/world_extra_roads.py`
- Test: `pipeline/tests/test_extra_roads.py`

**Interfaces:**
- Consumes: `grades` (Task 2); #76's `rail: list[list[[x, z]]]` and `railBridges: list[{"pts", "layer"}]`.
- Produces: `deck_rail(grades, rail, rail_bridges) -> (rail, rail_bridges)`; the parts of `rail` inside `hw + BAND` of a grade line become `{"pts": [...], "layer": 1}` entries appended to `rail_bridges`.

- [ ] **Step 1: Write the failing test** (append)

```python
def test_rail_in_the_grade_band_goes_on_a_deck():
    g = [{"pts": [[0, 0], [300, 0]], "hw": 9.5, "ctl": [[0, 0], [300, 0]]}]
    across, far, old = [[150, -100], [150, 100]], [[0, 200], [300, 200]], {"pts": [[1, 1], [2, 2]], "layer": 1}
    rail, decks = X.deck_rail(g, [across, far], [old])
    assert far in rail and decks[0] == old and len(decks) == 2
    (deck,) = decks[1:]
    assert deck["layer"] == 1
    assert sorted(z for _, z in deck["pts"]) == [pytest.approx(-33.5, abs=0.2), pytest.approx(33.5, abs=0.2)]
    stubs = sorted(r for r in rail if r != far)
    assert len(stubs) == 2 and all(abs(z) >= 33.0 for s in stubs for _, z in s)


def test_deck_rail_without_grades_changes_nothing():
    assert X.deck_rail([], [[[0, 0], [1, 0]]], []) == ([[[0, 0], [1, 0]]], [])
```

- [ ] **Step 2:** run → FAIL (`deck_rail` missing).
- [ ] **Step 3: Implement** (append)

```python
def _parts(geom):
    return [[world_roads._r(q) for q in g.coords] for g in getattr(geom, "geoms", [geom]) if not g.is_empty and g.length >= 1.0]


def deck_rail(grades, rail, rail_bridges):
    """#42: rail inside a grade's band goes on a deck (railBridges, layer 1), so #76 keeps it at the uncut height
    over the cutting. OSM has no bridge there yet: the underpass is under construction."""
    if not grades:
        return rail, rail_bridges
    band = shapely.union_all([shapely.LineString(g["pts"]).buffer(g["hw"] + BAND) for g in grades])
    kept, decks = [], list(rail_bridges)
    for pts in rail:
        line = shapely.LineString(pts)
        if not line.intersects(band):
            kept.append(pts)
            continue
        kept += _parts(line.difference(band))
        decks += [{"pts": p, "layer": 1} for p in _parts(line.intersection(band))]
    return kept, decks
```

- [ ] **Step 4:** run → PASS; pipeline suite → green.
- [ ] **Step 5:** `git add pipeline/world_extra_roads.py pipeline/tests/test_extra_roads.py && git commit -m "feat(pipeline): rail over a graded road goes on a deck (#42)"`

---

### Task 4: Wire into `osm.py`, the Südspange in `anchors.json`, golden test

**Files:**
- Modify: `pipeline/osm.py` (`build_world`, right after #76's `rail, rail_bridges = world_rail.build(data.ways, clip)`)
- Modify: `pipeline/anchors.json` (new `roads` object, four landmarks)
- Modify: `docs/11-pipeline-osm.md` (format block + a "Game-only roads (#42)" paragraph)
- Test: `pipeline/tests/test_golden.py`

**Interfaces:**
- Consumes: `world_extra_roads.apply` (Task 2), `deck_rail` (Task 3), `anchors_mod.resolve` (landmark `kind`, `game`, `heading_deg` already supported, `pipeline/anchors.py:56-61`).
- Produces: MMW1 `grades` key; road ids -42001…-42005; DSM tracks over the Südspange in `railBridges`; landmarks of kind `baustelle` and `fahrverbot`.

- [ ] **Step 1: Write the failing golden test** (append to `pipeline/tests/test_golden.py`; add `import math` at the top if missing)

```python
def _lines(world, rid):
    return shapely.MultiLineString([r["pts"] for r in world["roads"] if r["id"] == rid and len(r["pts"]) > 1])


def _off(line, pts, tol=2.0):
    return [p for p in pts if line.distance(shapely.Point(p)) > tol]


def test_suedspange_route(world):
    """#42: K295 junction -> DSM tracks -> field path -> DSM road -> field path -> Geuerenstrasse -> Sisslerstrasse."""
    s12, s3, s4, fv = (_lines(world, i) for i in (-42001, -42003, -42004, -42005))
    assert not _off(s12, [(1528, 409), (1441, 483), (1240, 574), (954.2, 567.6), (953.4, 497.0), (736, 502), (514, 498)])
    assert 1100 < s12.length < 1200, s12.length
    assert not _off(s3, [(514, 498), (511.1, 440), (450, 397), (353.4, 420.3)])
    assert not _off(s4, [(32.8, 402.1), (174.3, 410.2), (353.4, 420.3)])
    assert not _off(fv, [(514, 498), (514.4, 748.6), (625.4, 815.8)])
    by = lambda i: [r for r in world["roads"] if r["id"] == i]
    assert all(r["n"] == "Südspange" and r["w"] == 8.0 and r["cls"] == "tertiary" for r in by(-42001))
    assert all(r["n"] == "Südspange" and r["w"] == 7.0 for r in by(-42003))
    assert all(r["n"] == "Geuerenstrasse" and r["w"] == 7.0 for r in by(-42004))
    assert all(r["n"] == "Zufahrt Freiverlad" and r["w"] == 6.0 for r in by(-42005))
    path = _lines(world, -42002)
    assert all(r["w"] == 3.0 and r["cls"] == "cycleway" and r["n"] == "" for r in by(-42002))
    assert path.distance(shapely.Point(1075, 566.3)) < 1.5          # 7.5 m north of the E-W field-path leg


def test_suedspange_replaces_the_osm_ribbons(world):
    assert not [r for r in world["roads"] if r["id"] == 52017693]   # OSM Geuerenstrasse
    svc = _lines(world, 118856572)
    assert svc.distance(shapely.Point(736, 502)) > 3                 # reused DSM road stretch gone
    assert svc.distance(shapely.Point(512, 200)) < 2                 # its leg north to the Rhine stays
    dsm = _lines(world, 183354680)
    g = shapely.LineString(world["grades"][0]["pts"])
    assert dsm.is_empty or dsm.distance(g) >= 9.5 + 24 - 1
    assert any(abs(x - 514) < 1 and abs(z - 498) < 1 and r >= 4.3 for x, z, r in world["junctions"])


def test_suedspange_grade_decks_and_signs(world):
    (g,) = world["grades"]
    assert g["hw"] == 9.5 and math.dist(g["pts"][0], (1528, 409)) < 1
    (t0, c0), (t1, c1), (t2, c2) = g["ctl"]
    assert (t0, c0, c1, c2) == (0, 0, 6.5, 0) and 340 < t1 < 352 and 480 < t2 < 505
    band = shapely.LineString(g["pts"]).buffer(g["hw"] + 24 - 0.5)
    assert not [p for p in world["rail"] if shapely.LineString(p).intersects(band)]     # no track left in the cut
    decks = [b for b in world["railBridges"] if shapely.LineString(b["pts"]).distance(shapely.Point(1240, 574)) < 15]
    assert len(decks) >= 5 and all(b["layer"] == 1 for b in decks), decks
    kinds = [lm["kind"] for lm in world["anchors"]["landmarks"].values()]
    assert kinds.count("baustelle") == 2 and kinds.count("fahrverbot") == 2
```

- [ ] **Step 2:** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -k suedspange` → FAIL (`KeyError: 'grades'` / no -42001 roads). Without the PBF the tests SKIP: note it and continue.
- [ ] **Step 3: Wire `osm.py`.** `import world_extra_roads`; in `build_world`, right after `rail, rail_bridges = world_rail.build(data.ways, clip)`:

```python
    roads, junctions, grades = world_extra_roads.apply(spec.get("roads", {}), data.ways, roads, junctions, clip)
    rail, rail_bridges = world_extra_roads.deck_rail(grades, rail, rail_bridges)
```

Add `"grades": grades,` to the returned dict after `"junctions"`. Extend the summary log line with `grades {len(grades)}`.

- [ ] **Step 4: `anchors.json`.** Add to `landmarks`:

```json
    "suedspangeBaustelleOst":  { "game": [1513.2, 430.2], "kind": "baustelle",  "heading_deg": -40, "src": "#42: K295 junction, south shoulder, facing traffic from the K295" },
    "suedspangeBaustelleWest": { "game": [328.0, 424.5],  "kind": "baustelle",  "heading_deg": 180, "src": "#42: Geuerenstrasse before the field-path leg, facing eastbound traffic" },
    "suedspangeFahrverbotOst": { "game": [518.0, 480.0],  "kind": "fahrverbot", "heading_deg": 90,  "src": "#42: start of section 3 (bus/bike corridor), facing traffic from the south" },
    "suedspangeFahrverbotWest":{ "game": [343.0, 425.5],  "kind": "fahrverbot", "heading_deg": 180, "src": "#42: end of section 3 at the Geuerenstrasse, facing eastbound traffic" }
```

and a top-level `roads` object:

```json
  "roads": {
    "suedspange": {
      "src": "#42: kNP Südspange ESP Sisslerfeld, erläuternder Planungsbericht (Kanton Aargau, 2 May 2023), route traced from its text, OSM and swissALTI3D; cross-sections from its §3.5; figures not committed",
      "pieces": [
        { "id": -42001, "n": "Südspange", "tags": { "highway": "tertiary", "lanes": "2" }, "w": 8.0,
          "path": { "id": -42002, "w": 3.0, "off": 7.5 },
          "via": [ { "osm": "w1417144102" },
                   { "osm": "w222534467", "from": [1198.1, 572.7], "to": [954.2, 567.6] },
                   { "osm": "w824663095" },
                   { "osm": "w118856572", "from": [953.4, 497.0], "to": [514.0, 498.0] } ] },
        { "id": -42003, "n": "Südspange", "tags": { "highway": "unclassified", "lanes": "2" }, "w": 7.0,
          "via": [ { "osm": "w118856572", "from": [514.0, 498.0], "to": [511.1, 394.3] },
                   { "osm": "w118856576" }, { "game": [353.4, 420.3] } ] },
        { "id": -42004, "n": "Geuerenstrasse", "tags": { "highway": "unclassified", "lanes": "2" }, "w": 7.0,
          "via": [ { "osm": "w52017693" } ] },
        { "id": -42005, "n": "Zufahrt Freiverlad", "tags": { "highway": "service" }, "w": 6.0,
          "via": [ { "game": [514.0, 498.0] }, { "game": [514.4, 748.6] }, { "osm": "w1417144101" } ] }
      ],
      "replace": [ "w118856572", "w52017693" ],
      "trim": [ "w183354680" ],
      "grade": { "piece": -42001, "hw": 9.5, "ctl": [
        { "at": [1528.0, 409.0], "cut": 0 }, { "at": [1240.0, 574.0], "cut": 6.5 }, { "at": [1092.0, 573.0], "cut": 0 } ] }
    }
  }
```

- [ ] **Step 5:** golden tests again (Step 2 command) → PASS. Run the whole pipeline suite → green. If the path test fails on the side, check the sign of `off` against shapely's `offset_curve` (positive = left of travel = north for a westbound line in this frame) — fix the code, not the test.
- [ ] **Step 6: Docs.** In `docs/11-pipeline-osm.md` add `"grades": [{ pts: [[x, z], ...], hw, ctl: [[t, cut], ...] }],` to the format block after `junctions`, and a paragraph under Rules:

> **Game-only roads (#42).** `anchors.json` `roads` lists roads OSM lacks or tags as track/construction/proposed. Each piece is assembled from OSM ways (whole, or a `from`/`to` sub-range) and hand points and becomes ordinary road entries with a negative id; an optional `path` adds a cycleway ribbon at a fixed offset. `replace` removes the OSM ribbons a game road takes over (within 1 m), `trim` removes ways within `hw + 24 m` of a grade. A `grade` exports `grades[]`: the centreline of the graded stretch, a corridor half-width `hw` and controls `[t, cut]` (metres along it, metres below the uncut terrain; first and last cut 0). Rail within `hw + 24 m` of a grade moves to `railBridges` (layer 1), and the prototype cuts the grade into #76's terrain patch. Game roads are added after buildings, props and car parks, so those do not change. The Südspange ESP Sisslerfeld (Kanton Aargau, kNP 2023) is the first one.

- [ ] **Step 7:** `git add pipeline/osm.py pipeline/anchors.json pipeline/tests/test_golden.py docs/11-pipeline-osm.md && git commit -m "feat(pipeline): the Südspange ESP Sisslerfeld as game-only roads with a grade (#42)"`

---

### Task 5: Grade-cut helpers in `world.js`

**Files:**
- Modify: `prototype/world.js` (after #76's `triLerp`; `layoutFromWorld`)
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- Consumes: `nearestOnPolyline` (`{d, t}`, clamped to the ends), #76's `pointAtLength`, `UNDERPASS`, `patchCells`.
- Produces: `GRADE_BAND = 24`; `gradeProfile(g, h0) -> [[t, y]]`; `profileY(prof, t) -> y`; `gradeCut(g, h0, u = UNDERPASS) -> { pts, hw, prof, inner, outer }`; `gradeCutAt(gc, x, z, h0, u = UNDERPASS) -> depth ≥ 0`; `gradeCells(gc, G) -> [[i, j]]` (unique); `layoutFromWorld(w).grades` (default `[]`).

- [ ] **Step 1: Write the failing tests** (new import line)

```js
import { GRADE_BAND, gradeProfile, profileY, gradeCut, gradeCutAt, gradeCells } from '../world.js';

const GR = { pts: [[0, 0], [100, 0]], hw: 5, ctl: [[0, 0], [50, 4], [100, 0]] };

test('grade profile: control heights from the uncut terrain, linear between', () => {
  const prof = gradeProfile(GR, () => 10);
  assert.deepEqual(prof, [[0, 10], [50, 6], [100, 10]]);
  assert.equal(profileY(prof, 25), 8);
  assert.equal(profileY(prof, -5), 10);
  assert.equal(profileY(prof, 140), 10);
});

test('gradeCutAt: profile in the corridor, 1:2 bank beside it, 0 at outer and beyond the ends', () => {
  const flat = () => 10, gc = gradeCut(GR, flat);
  assert.equal(gc.inner, 6);
  assert.equal(gc.outer, 18);                                  // inner + 2 * (max centreline cut 4 + 2)
  assert.equal(gradeCutAt(gc, 50, 0, flat), 4);
  assert.equal(gradeCutAt(gc, 50, 6, flat), 4);
  assert.equal(gradeCutAt(gc, 50, 10, flat), 2);
  assert.equal(gradeCutAt(gc, 50, 16, flat), 0);
  assert.equal(gradeCutAt(gc, 25, 0, flat), 2);
  assert.equal(gradeCutAt(gc, 110, 0, flat), 0);
  const slope = (x, z) => 10 + Math.abs(z);                    // terrain rising beside the road
  const gs = gradeCut(GR, slope);
  assert.equal(gradeCutAt(gs, 50, 17, slope), 0.5);            // capped by the bank down to outer
  assert.equal(gradeCutAt(gs, 50, 18, slope), 0);
});

test('gradeCut never reaches past hw + GRADE_BAND', () => {
  const deep = { ...GR, ctl: [[0, 0], [50, 30], [100, 0]] };
  assert.equal(gradeCut(deep, () => 10).outer, 5 + GRADE_BAND);
});

test('gradeCells covers every point with a cut', () => {
  const G = { x0: -50, z0: -50, dx: 16, dz: 16, nx: 20, nz: 20 }, flat = () => 10, gc = gradeCut(GR, flat);
  const cells = new Set(gradeCells(gc, G).map(([i, j]) => i + ',' + j));
  assert.equal(cells.size, gradeCells(gc, G).length);          // unique
  for (let x = -30; x <= 130; x += 1) for (let z = -30; z <= 30; z += 1)
    if (gradeCutAt(gc, x, z, flat) > 0) assert.ok(cells.has(Math.floor((x - G.x0) / G.dx) + ',' + Math.floor((z - G.z0) / G.dz)), `${x},${z}`);
});

test('layoutFromWorld passes grades, default empty', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.deepEqual(layoutFromWorld(base).grades, []);
  const gr = [{ pts: [[0, 0], [1, 0]], hw: 9.5, ctl: [[0, 0], [1, 0]] }];
  assert.deepEqual(layoutFromWorld({ ...base, grades: gr }).grades, gr);
});
```

- [ ] **Step 2:** `node --test prototype/tests/world.test.mjs` → FAIL (not exported).
- [ ] **Step 3: Implement** in `world.js`, after #76's `triLerp`:

```js
// #42 grades: a stretch of road on its own vertical profile (the Südspange's cutting and underpass). g = { pts, hw,
// ctl: [[t, cut]] } from the world file; h0(x, z) = the uncut mesh. A grade is one more cut source for #76's patch:
// the ground comes down to the profile inside hw + margin, a 1:bank grass bank rises back beside it, and the depth is
// 0 at `outer` (never past hw + GRADE_BAND, which the pipeline's BAND mirrors), so the patch meets the coarse mesh.
export const GRADE_BAND = 24;
export function gradeProfile(g, h0) { return g.ctl.map(([t, cut]) => { const [x, z] = pointAtLength(g.pts, t); return [t, h0(x, z) - cut]; }); }
export function profileY(prof, t) {
  if (t <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const [t0, y0] = prof[i - 1], [t1, y1] = prof[i]; return y0 + (y1 - y0) * (t - t0) / ((t1 - t0) || 1); }
  return prof[prof.length - 1][1];
}
export function gradeCut(g, h0, u = UNDERPASS) {
  const prof = gradeProfile(g, h0), len = polylineLength(g.pts), inner = g.hw + u.margin;
  let max = 0;
  for (let t = 0; t <= len; t += 2) { const [x, z] = pointAtLength(g.pts, t); max = Math.max(max, h0(x, z) - profileY(prof, t)); }
  return { pts: g.pts, hw: g.hw, prof, inner, outer: Math.min(inner + u.bank * (max + 2), g.hw + GRADE_BAND) };
}
export function gradeCutAt(gc, x, z, h0, u = UNDERPASS) {
  const n = nearestOnPolyline(gc.pts, x, z);
  if (n.d >= gc.outer) return 0;
  const raw = h0(x, z) - profileY(gc.prof, n.t) - Math.max(0, n.d - gc.inner) / u.bank;
  return Math.max(0, Math.min(raw, (gc.outer - n.d) / u.bank));
}
export function gradeCells(gc, G) {
  const out = [], seen = new Set(), len = polylineLength(gc.pts), r = gc.outer;
  for (let t = 0; t <= len + 4; t += 4) {
    const [x, z] = pointAtLength(gc.pts, Math.min(t, len));
    for (const c of patchCells([x - r - 4, z - r - 4, x + r + 4, z + r + 4], G)) { const k = c[0] + ',' + c[1]; if (!seen.has(k)) { seen.add(k); out.push(c); } }
  }
  return out;
}
```

Then in `layoutFromWorld` add `grades: w.grades || [],` next to #76's `railBridges`. (`polylineLength` is already in `world.js`.)

- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` → all PASS. If `gradeCutAt(gs, 50, 17, slope)` is off by float noise, compare with a 1e-9 tolerance — do not change the expected values.
- [ ] **Step 5:** `git add prototype/world.js prototype/tests/world.test.mjs && git commit -m "feat(world): grade-cut helpers for #76's terrain patch (#42)"`

---

### Task 6: Grade cuts in the game (`index.html`), stand-in Playwright test

**Files:**
- Modify: `prototype/index.html` (the `./world.js` import; #76's `cutDepth` and `buildCuts`; the `__mm` hooks near `window.__mm.cutDepth`; `window.__mm.grassOverRoad`)
- Create: `prototype/tests/test_suedspange.py`

**Interfaces:**
- Consumes: Task 5 helpers; `L.grades`; #76's `meshH`, `CUTS`, `CUT_CELLS`, `CUT_N`, `TGRID`, `cutDepth`, `buildCuts`, `__mm.crossings`; Task 3's `deck_rail` (imported by the test).
- Produces: `GRADE_CUTS`; hooks `window.__mm.gradeAt(x, z) -> { profile: y | null, terrain, mesh }` and `window.__mm.grassOverRoad(n, only = null)` (optional road-name filter, default unchanged).

- [ ] **Step 1: Write the failing browser test** — a stand-in for section 1 injected at the real crossing, so it runs before the world rebuild:

```python
"""#42: Südspange — cutting, underpass under the DSM tracks, signs, HUD. Slow (Playwright): run in the foreground."""
import json
import math
import sys
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_street_labels import WORLD, needs_world, open_page

sys.path.insert(0, str(Path(__file__).parents[2] / "pipeline"))
import world_extra_roads  # noqa: E402

STANDIN = [[1330.0, 576.0], [1240.0, 574.0], [1092.0, 573.0]]       # t: 0, 90.0, 238.0
GRADE = {"pts": STANDIN, "hw": 9.5, "ctl": [[0, 0], [90.0, 6.5], [238.0, 0]]}


def standin_world():
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    w["roads"] = [r for r in w["roads"] if r["id"] > -42000]           # works before and after the rebuild
    w["roads"].append({"id": -42001, "n": "Südspange", "cls": "tertiary", "w": 8.0, "mark": "centre", "bridge": False,
                       "layer": 0, "pts": STANDIN})
    w["grades"] = [GRADE]
    w["rail"], w["railBridges"] = world_extra_roads.deck_rail(w["grades"], w["rail"], w.get("railBridges", []))
    return w


@needs_world
def test_standin_underpass(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, world=standin_world())
        page.wait_for_function("() => window.__mm.crossings && window.__mm.gradeAt", timeout=240000)
        at = page.evaluate("() => window.__mm.gradeAt(1240, 574)")
        xs = page.evaluate("() => window.__mm.crossings()")
        through = page.evaluate("() => window.__mm.sim(1300, 575.3, Math.PI, 12, 10)")
        grass = page.evaluate("() => window.__mm.grassOverRoad(400, 'Südspange')")
        br.close()
    assert abs(at["mesh"] - at["terrain"] - 6.5) < 0.3, at                       # the cut under the tracks
    assert at["profile"] is not None and abs(at["terrain"] - at["profile"]) < 0.3, at
    here = [c for c in xs if c["road"] == "Südspange"]
    assert len(here) >= 5, xs                                                     # five DSM spurs, all decks now
    assert all(c["clearance"] >= 4.45 and c["railGap"] < 0.3 for c in here), here
    assert through["x"] < 1150 and through["speed"] > 5 and not through["bridge"], through
    assert grass["done"] > 0 and grass["bad"] == 0, grass
```

- [ ] **Step 2:** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_suedspange.py -v -k standin` → FAIL (timeout on `__mm.gradeAt`).
- [ ] **Step 3: Implement.**
  1. Add `gradeCut, gradeCutAt, gradeCells, profileY` to the `./world.js` import (only what is used).
  2. Next to #76's `const CUT_N = 8, CUT_CELLS = new Map(), CUTS = [];` add `const GRADE_CUTS = [];`.
  3. #76's `cutDepth` takes the grade cuts too:

```js
function cutDepth(x, z) { let d = 0; for (const c of CUTS) if (Math.abs(x - c.x) < 200 && Math.abs(z - c.z) < 200) d = Math.max(d, cutDepthAt(c, x, z)); for (const gc of GRADE_CUTS) d = Math.max(d, gradeCutAt(gc, x, z, meshH)); return d; }
```

  4. In #76's `buildCuts()`, before the patch loop, add `for (const g of L.grades) GRADE_CUTS.push(gradeCut(g, meshH));`, and after the rail-cut patch loop patch the grade cells the same way (same body, so factor the per-cell fill into `function patchCell(i, j)` that #76's loop and this one both call — #76's loop body moves into it unchanged):

```js
  for (const gc of GRADE_CUTS) for (const [i, j] of gradeCells(gc, G)) patchCell(i, j);
```

     `patchCell` skips keys already in `CUT_CELLS`. Because `cutDepth` already includes the grades when the first patch is filled, a cell shared by a rail cut and a grade gets the max of both.
  5. Hooks, next to `window.__mm.cutDepth`:

```js
window.__mm.gradeAt = (x, z) => { let profile = null; for (const gc of GRADE_CUTS) { const n = nearestOnPolyline(gc.pts, x, z); if (n.d <= gc.inner) { profile = profileY(gc.prof, n.t); break; } } return { profile, terrain: terrainH(x, z), mesh: meshH(x, z) }; };
```

     and give `window.__mm.grassOverRoad` a second parameter `only = null` that keeps only `ROADS` with `r.n === only` when set (default behaviour unchanged).
- [ ] **Step 4:** Step 2's command → PASS. Then #76's `test_underpass.py` and `-k "smoke or street_labels"` on `test_smoke.py` / `test_street_labels.py` → no new failures (a test red on `main` too is not this task's).
- [ ] **Step 5:** `git add prototype/index.html prototype/tests/test_suedspange.py && git commit -m "feat(world): graded roads cut into #76's terrain patch (#42)"` and `git push -u origin feature/42-suedspange`.

---

### Task 7: Baustelle and Fahrverbot signs

**Files:**
- Modify: `prototype/index.html` (the OSM landmarks block `if (L) { // landmarks on their real positions`; sign builders next to the station-board/sign helpers; hook)
- Test: `prototype/tests/test_suedspange.py`

**Interfaces:**
- Consumes: `L.anchors.landmarks[*]` with `kind` `baustelle`/`fahrverbot`, `x`, `z`, `rot` (radians, the direction the sign face looks, `pipeline/anchors.py:60-61`); `makeTex`, the `signs` group.
- Produces: `window.__mm.roadSigns() -> [{ kind, x, z }]`.

- [ ] **Step 1: Write the failing test** (append)

```python
SIGNS = {"tBo": {"x": 1300.0, "z": 582.0, "kind": "baustelle", "h": None, "rot": 3.1},
         "tFo": {"x": 1200.0, "z": 581.0, "kind": "fahrverbot", "h": None, "rot": 0.0}}


@needs_world
def test_standin_signs(server):
    w = standin_world()
    w["anchors"]["landmarks"] = {k: v for k, v in w["anchors"]["landmarks"].items() if v["kind"] not in ("baustelle", "fahrverbot")}
    w["anchors"]["landmarks"].update(SIGNS)
    with sync_playwright() as p:
        br, page = open_page(p, server, world=w)
        page.wait_for_function("() => window.__mm.roadSigns", timeout=240000)
        signs = page.evaluate("() => window.__mm.roadSigns()")
        on_road = page.evaluate("() => { window.__mm.place(1300, 582); return window.__mm.roadDist(); }")
        br.close()
    assert sorted(s["kind"] for s in signs) == ["baustelle", "fahrverbot"], signs
    assert on_road > 0, on_road                                          # beside the road, not on it
```

- [ ] **Step 2:** run `-k standin_signs` → FAIL.
- [ ] **Step 3: Implement.** `const ROAD_SIGNS = [];` and two builders that each add a `THREE.Group` to `signs` at `(x, terrainH(x, z), z)` with `rotation.y = Math.PI / 2 - rot` (a plane faces +z; this turns its face to `(cos rot, sin rot)`), push `{ kind, x, z }` to `ROAD_SIGNS`, and add no OBB (no collision):
  - `baustelleSign(x, z, rot)`: grey pole (`CylinderGeometry(0.05, 0.05, 2.6)`), a 1.0 m triangle (`makeTex`: white fill, red border, a black worker glyph or the text "BAU"), a white plate 1.0 × 0.25 m reading "Baustelle", and two Leitbaken (0.25 × 1.0 × 0.1 m boxes, red-white diagonal stripes via `makeTex`) 1.2 m either side.
  - `fahrverbotSign(x, z, rot)`: pole, a 0.9 m disc (white, red ring), a white plate 1.2 × 0.4 m with two lines "ausgenommen Bus, Velo," / "Landwirtschaft, Notfall".
  - In the OSM landmarks block: `for (const s of Object.values(lm)) { if (s.kind === 'baustelle') baustelleSign(s.x, s.z, s.rot); else if (s.kind === 'fahrverbot') fahrverbotSign(s.x, s.z, s.rot); }`.
  - Hook: `window.__mm.roadSigns = () => ROAD_SIGNS.map(s => ({ ...s }));`
- [ ] **Step 4:** `-k standin` → all PASS.
- [ ] **Step 5:** `git add prototype/index.html prototype/tests/test_suedspange.py && git commit -m "feat(prototype): Baustelle and Fahrverbot signs from landmark kinds (#42)"` and push.

---

### Task 8: Browser tests for the real route (skip until the world has it), #76's level-crossing list

**Files:**
- Test: `prototype/tests/test_suedspange.py`
- Modify: `prototype/tests/test_underpass.py` (#76) — the `LEVEL` list

**Interfaces:**
- Consumes: the rebuilt world (road ids -42001…-42005, `grades`, decks), hooks from Tasks 6–7, `__mm.place`, `__mm.hud().road`, `__mm.ground`, `__mm.crossings`.

- [ ] **Step 1: Write the tests** (append). They skip on a world without the Südspange, so they are green before Task 9 and must pass after it.

```python
def real_world():
    w = json.loads(WORLD.read_text(encoding="utf-8")) if WORLD.exists() else {}
    return w if any(r["id"] == -42001 for r in w.get("roads", [])) else None


needs_suedspange = pytest.mark.skipif(real_world() is None, reason="world predates #42: rebuild it (plan Task 9)")


def midpoint(w, rid):
    a, b = max(((a, b) for r in w["roads"] if r["id"] == rid for a, b in zip(r["pts"], r["pts"][1:])), key=lambda s: math.dist(*s))
    return (a[0] + b[0]) / 2, (a[1] + b[1]) / 2


@needs_suedspange
def test_real_route_names_ground_and_underpass(server):
    w = real_world()
    pts = [r["pts"] for r in w["roads"] if r["id"] in (-42001, -42003, -42004, -42005)]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        page.wait_for_function("() => window.__mm.crossings && window.__mm.gradeAt && window.__mm.roadSigns", timeout=240000)
        names = {}
        for rid in (-42001, -42003, -42004, -42005):
            x, z = midpoint(w, rid)
            page.evaluate(f"() => window.__mm.place({x}, {z})")
            page.wait_for_timeout(500)
            names[rid] = page.evaluate("() => window.__mm.hud().road")
        steps = page.evaluate("""(lines) => { let worst = 0; for (const pts of lines) { let prev = null;
            for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
              for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, g = window.__mm.ground(x, z, 1e4);
                if (prev !== null) worst = Math.max(worst, Math.abs(g - prev)); prev = g; } } } return worst; }""", pts)
        at = page.evaluate("() => window.__mm.gradeAt(1240, 574)")
        xs = page.evaluate("() => window.__mm.crossings()")
        through = page.evaluate("() => window.__mm.sim(1300, 575.9, Math.PI + 0.026, 12, 10)")
        grass = page.evaluate("() => window.__mm.grassOverRoad(2000, 'Südspange')")
        signs = page.evaluate("() => window.__mm.roadSigns()")
        br.close()
    assert names == {-42001: "Südspange", -42003: "Südspange", -42004: "Geuerenstrasse", -42005: "Zufahrt Freiverlad"}, names
    assert steps < 0.6, steps
    assert abs(at["mesh"] - at["terrain"] - 6.5) < 0.3, at
    here = [c for c in xs if c["road"] == "Südspange"]
    assert len(here) >= 5 and all(c["clearance"] >= 4.45 and c["railGap"] < 0.3 for c in here), here
    assert through["x"] < 1150 and through["speed"] > 5 and not through["bridge"], through
    assert grass["done"] > 0 and grass["bad"] == 0, grass
    assert sorted(s["kind"] for s in signs) == ["baustelle", "baustelle", "fahrverbot", "fahrverbot"], signs
```

If `hud().road` lags one frame behind `place`, wait with `page.wait_for_function` on the expected name (as `test_street_labels.py` does) instead of the fixed timeout. If the `through` heading misses the road on the real geometry, compute it from the -42001 segment containing x = 1300 (`math.atan2(dz, dx)`) — do not loosen the thresholds.

- [ ] **Step 2: #76's level-crossing list.** In `prototype/tests/test_underpass.py` change `LEVEL = [(1857.6, 566.8), (1228.0, 564.0)]` to `LEVEL = [(1857.6, 566.8)]` with the comment `# (1228, 564), the DSM crossing, is in the Südspange cutting since #42: its tracks are on a deck` and the assertion `r["level"] == [0, 0]` to `r["level"] == [0]`. This is a deliberate behaviour change (spec, Interactions), not a test loosened to go green.
- [ ] **Step 3:** run `test_suedspange.py` → the real-route test SKIPS (world not rebuilt yet), the stand-in tests PASS; `test_underpass.py` → PASS.
- [ ] **Step 4:** `git add prototype/tests/test_suedspange.py prototype/tests/test_underpass.py && git commit -m "test(world): real Südspange route checks, skipped until the rebuild (#42)"` and push.

---

### Task 9: Rebuild the world file, guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

**Interfaces:**
- Consumes: Tasks 1–4 (pipeline). The branch is pushed (Task 8), so the work is safe if this task stops.

- [ ] **Step 1: Cache check, STOP if it fails.**

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

  On `STOP`, skip to Task 10 and do none of: run the build, touch or commit `data/world_hochrhein.json`, let the build download tiles, attempt an `osmium` cut. Say in the PR description: "World not rebuilt: pipeline caches missing on this machine. Run Task 9 of docs/superpowers/plans/2026-10-03-suedspange.md locally. Until then the Südspange is not in the game; the stand-in browser tests cover the mechanism."
- [ ] **Step 2: Golden tests** (must pass, not skip): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs`.
- [ ] **Step 3: Build** (foreground, a few minutes): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache`. Expect `grades 1` in the summary log.
- [ ] **Step 4: Guard: only roads, junctions, grades, rail, railBridges, anchors and `params.built` may differ from `main`.**

```bash
git fetch origin main
git show origin/main:data/world_hochrhein.json > /tmp/world_main.json
./pipeline/.venv/bin/python - <<'EOF'
import json
import shapely
a = json.load(open("/tmp/world_main.json", encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
for w in (a, b):
    w["params"].pop("built", None)
ra, rb = a.pop("roads"), b.pop("roads")
rail_a, rail_b = a.pop("rail"), b.pop("rail")
rbr_a, rbr_b = a.pop("railBridges", []), b.pop("railBridges")
grades = b.pop("grades")
for k in ("junctions", "anchors"):
    a.pop(k, None); b.pop(k, None)
a.pop("grades", None)
assert a == b, ["other keys differ:", [k for k in set(a) | set(b) if a.get(k) != b.get(k)]]
key = lambda r: json.dumps(r, sort_keys=True)
ids_gone = {json.loads(s)["id"] for s in {key(r) for r in ra} - {key(r) for r in rb}}
ids_new = {json.loads(s)["id"] for s in {key(r) for r in rb} - {key(r) for r in ra}}
assert ids_gone <= {118856572, 52017693, 183354680}, ids_gone
assert ids_new - {118856572, 183354680} == {-42001, -42002, -42003, -42004, -42005}, ids_new
band = shapely.LineString(grades[0]["pts"]).buffer(grades[0]["hw"] + 24 + 0.5)
moved = [p for p in rail_a if p not in rail_b]
assert all(shapely.LineString(p).intersects(band) for p in moved), "rail changed outside the Südspange band"
assert all(p in rbr_b for p in rbr_a), "#76 bridge pieces changed"
new_decks = [x for x in rbr_b if x not in rbr_a]
assert new_decks and all(shapely.LineString(x["pts"]).within(band) and x["layer"] == 1 for x in new_decks), new_decks
print("guard ok: replaced", sorted(ids_gone), "added", sorted(ids_new), "; decks +", len(new_decks), "; rail pieces split", len(moved))
EOF
```

  If the guard fails: STOP, `git checkout -- data/world_hochrhein.json`, report the differing keys/ids. They may be pipeline changes other issues made without rebuilding `main`'s world (or #76's world was never rebuilt — then `railBridges` holds #76's pieces too and the `rail`/`railBridges` asserts fail); say so in the PR and leave the rebuild to the maintainer.
- [ ] **Step 5:** browser tests: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_suedspange.py ../prototype/tests/test_underpass.py -v` → all PASS, none skipped. Paste the Südspange entries of `__mm.crossings()` into the PR.
- [ ] **Step 6:** `git add data/world_hochrhein.json && git commit -m "chore(data): rebuild the world with the Südspange (#42)"` and push.

---

### Task 10: Changelog, playtest note, full verification

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` → `Added`), `test-todo.md`

- [ ] **Step 1: Changelog** (player voice, under `### Added`):

  `- The new Südspange through the Sisslerfeld is open in the game, even though it is still being built: from the new junction on the Laufenburgerstrasse it drops into a cutting, passes under the DSM tracks and climbs onto the Sisslerfeld, then runs past the DSM plant to the Geuerenstrasse in Münchwilen. The branch to the new SBB Freiverlad is there too. Baustelle signs mark both ends, and the stretch for buses and bikes only has its Fahrverbot signs — you can still drive it.`
- [ ] **Step 2: `test-todo.md`** — a section "Südspange (#42)" with unchecked items: drive K295 → Sisslerstrasse end to end; the underpass looks right (decks over the road, no rails floating or sunk, deck tops not buried in the plateau); the cutting near the K295 reads as a cutting; DSM buildings and fences next to the cutting do not float or sink (the cut can reach 33.5 m from the road centreline); section boundaries match Abbildung 2 of the report (sections 1–2 13 m with the path, 3–4 7 m); signs face the traffic.
- [ ] **Step 3: Full verification** (foreground): `cd pipeline && ./.venv/bin/python -m pytest -q`; `node --test prototype/tests/*.test.mjs`; `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q` → no new failures against `main`.
- [ ] **Step 4:** `git add CHANGELOG.md test-todo.md && git commit -m "docs: changelog and playtest list for the Südspange (#42)"`, push, open the PR (`feat(world): Südspange ESP Sisslerfeld as a drivable road under construction`, body per the PR template, `Closes #42`).
