# Second region: Ehrendingen with the Wanderweg and Im Böndlern — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second, separate region, Ehrendingen AG. The player picks it on the start screen or with `?region=ehrendingen`. It has a race from Oberdorf to Im Böndlern, J targets for Im Böndlern and the Wanderweg, and a drivable gravel Wanderweg. Hochrhein stays the default and does not change.

**Spec:** `docs/superpowers/specs/2026-10-09-region-ehrendingen-design.md`

**Architecture:**

- `prototype/regions.js` (pure) holds a `REGIONS` table with data URLs, storage keys, string keys, villages, Gemeinden, landmarks and tree rules per region. `regionFromQuery` picks the region; a start-screen row reloads with `?region=`.
- `index.html` reads every Hochrhein-specific constant from `REGION`. The Hochrhein values are exactly today's constants.
- The pipeline is already parametric on the CLI. It gets the Ehrendingen bbox and origin constants, a new anchors file and one new feature: hiking-route member ways kept as drivable `trail` roads (`world_trails.py`).
- Tasks 1–7 are code and docs. They run anywhere, CI included, and are pushed before any data work. Tasks 8–10 build `data/world_ehrendingen.json` and `data/terrain_ehrendingen.mmh`. They are guarded and stop cleanly on CI.

**Tech stack:** Python 3 (pyosmium, shapely, pyproj, numpy, pytest) in `pipeline/`; vanilla JS ES modules in `prototype/`; Node `node:test`; Playwright (pytest).

## Global constraints

- **Memory:** every pipeline command that reads an extract, a raster or builds a world runs as `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`. Exit 137 means the cap was hit. **Never raise the cap**: move that step to odroid-plus-pve.
- **Never run `osmium extract` on agent-dev or on a CI runner.** The cut runs on odroid-plus-pve only (Task 9).
- **Never hand-edit** anything in `data/`. Never touch `data/world_hochrhein.json`, `data/terrain_hochrhein.mmh`, `pipeline/anchors.json` or `geo.DEFAULT_*`: Hochrhein is out of scope (issue #19 owns those).
- **Playwright runs in the foreground**, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/<file> -q -p no:cacheprovider`. Never `run_in_background`; give the call a long timeout. Run only the browser test files this plan names, not the ~2 h full suite.
- **Commit and push the branch at the end of Task 7**, before any data task.
- **Branch:** `feature/127-region-ehrendingen`. PR title `feat(pipeline): new region Ehrendingen with the Wanderweg and Im Böndlern`, body `Closes #127`.
- **Tests:** never weaken an existing assertion. Existing tests must pass unchanged. This change adds parameters with defaults and never changes a Hochrhein value.
- **Strings:** every new UI string exists in `en` and `de` (Swiss spelling, no ß, capitalised `Du`). `strings.test.mjs` enforces parity.
- **Paths:** `cd pipeline` commands use `./.venv/bin/python`. Without a venv: `python -m venv .venv && ./.venv/bin/pip install -r requirements.txt -r requirements-dev.txt`.

## File structure

| File | Change |
|---|---|
| `pipeline/geo.py` | `EHRENDINGEN_BBOX`, `EHRENDINGEN_ORIGIN`, `EHRENDINGEN_BASE` |
| `pipeline/world_trails.py` (new) | `member_ways(path, relation_ids)` |
| `pipeline/world_roads.py` | `build(..., trail_ids=frozenset())`: trail ways kept as `trail` roads |
| `pipeline/anchors.py` | `trail_ids(spec)` |
| `pipeline/osm.py` | wire trails into `build_world` |
| `pipeline/anchors_ehrendingen.json` (new) | landmarks, race, labels, kept buildings, trails |
| `pipeline/tests/test_geo_mmh.py`, `test_trails.py` (new), `test_anchors.py`, `test_golden_ehrendingen.py` (new), `fixtures/trails.osm` (new) | tests |
| `prototype/regions.js` (new) | `REGIONS`, `DEFAULT_REGION`, `regionFromQuery`, `regionSearch` |
| `prototype/landmarks.js` | `gemeinden` parameter; `GEMEINDEN_EHRENDINGEN`, `LANDMARK_INFO_EHRENDINGEN` |
| `prototype/world.js` | `VILLAGES_EHRENDINGEN`; `layoutFromWorld` gives trails `tex: 'gravel'` |
| `prototype/strings.js` | `region`, `regionMissing`, `introEhrendingen`, `finishedEhrendingen`, `blurbOsmEhrendingen`; `mode`/`map` take the region name |
| `prototype/index.html` | read everything region-specific from `REGION`; region row; fallback; trails drawn as gravel |
| `prototype/tests/regions.test.mjs` (new), `landmarks.test.mjs`, `world.test.mjs`, `test_region.py` (new) | tests |
| `CHANGELOG.md`, `test-todo.md`, `data/README.md`, `docs/11-pipeline-osm.md`, `README.md` | docs |

---

### Task 1: Ehrendingen region constants

**Files:** Modify `pipeline/geo.py`, `pipeline/tests/test_geo_mmh.py`

- [ ] **Step 1: Write the failing test.** Append to `pipeline/tests/test_geo_mmh.py`:

```python
def test_grid_for_ehrendingen():
    f = geo.Frame(*geo.EHRENDINGEN_ORIGIN)
    g = geo.grid_for(geo.EHRENDINGEN_BBOX, f, 4.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (844, 1095, -1528.0, -2268.0)


def test_ehrendingen_places_inside_the_box():
    f = geo.Frame(*geo.EHRENDINGEN_ORIGIN)
    w, s, e, n = geo.EHRENDINGEN_BBOX
    for lon, lat in [(8.34014, 47.50799), (8.3438, 47.4914), (8.3437, 47.4795)]:   # Böndlern, Unter Eich, Lägern
        assert w < lon < e and s < lat < n
    x, z = f.to_game(8.34014, 47.50799)
    assert float(x) == pytest.approx(-149.5, abs=0.5) and float(z) == pytest.approx(-1464.9, abs=0.5)
```

- [ ] **Step 2: Run it and see it fail.** `cd pipeline && ./.venv/bin/python -m pytest tests/test_geo_mmh.py -q` gives `AttributeError: module 'geo' has no attribute 'EHRENDINGEN_ORIGIN'`.

- [ ] **Step 3: Implement.** In `pipeline/geo.py`, below `DEFAULT_ORIGIN`:

```python
# #127: a second, separate region (not adjacent to the Hochrhein): Ehrendingen AG, the Gemeinde (r1684300) plus margin
EHRENDINGEN_BBOX = (8.322, 47.476, 8.366, 47.515)   # lon/lat: Höhtal/Lägern ... Im Böndlern
EHRENDINGEN_ORIGIN = (47.4948, 8.3419)              # lat, lon: place node Ehrendingen n240060931, rounded
EHRENDINGEN_BASE = 405.0                            # m a.s.l. that becomes 0: about the Surb at Im Böndlern
```

- [ ] **Step 4: Run it and see it pass.** Same command, all green.

- [ ] **Step 5: Commit.** `git add pipeline/geo.py pipeline/tests/test_geo_mmh.py && git commit -m "feat(pipeline): Ehrendingen region constants (#127)"`

### Task 2: Hiking trails as drivable roads

**Files:**

- Create `pipeline/world_trails.py`, `pipeline/tests/test_trails.py`, `pipeline/tests/fixtures/trails.osm`
- Modify `pipeline/world_roads.py`, `pipeline/anchors.py`, `pipeline/osm.py`

**Interfaces:**

- `world_trails.member_ways(path: Path, relation_ids: set[int]) -> set[int]`
- `world_roads.build(ways, nodes, way_nodes, clip, trail_ids=frozenset())`
- `anchors.trail_ids(spec) -> set[int]`

- [ ] **Step 1: Write the fixture** `pipeline/tests/fixtures/trails.osm`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="47.4948" lon="8.3419"/>
  <node id="2" lat="47.4948" lon="8.3449"/>
  <node id="3" lat="47.4968" lon="8.3449"/>
  <node id="4" lat="47.4968" lon="8.3419"/>
  <way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="track"/></way>
  <way id="11"><nd ref="2"/><nd ref="3"/><tag k="highway" v="path"/></way>
  <way id="12"><nd ref="3"/><nd ref="4"/><tag k="highway" v="path"/><tag k="tunnel" v="yes"/></way>
  <way id="13"><nd ref="4"/><nd ref="1"/><tag k="highway" v="track"/></way>
  <relation id="100"><member type="way" ref="10" role=""/><member type="way" ref="11" role=""/><member type="way" ref="12" role=""/><tag k="type" v="route"/><tag k="route" v="hiking"/></relation>
  <relation id="101"><member type="way" ref="13" role=""/><tag k="type" v="route"/><tag k="route" v="hiking"/></relation>
  <relation id="102"><member type="way" ref="13" role=""/><tag k="type" v="route"/><tag k="route" v="bicycle"/></relation>
</osm>
```

- [ ] **Step 2: Write the failing tests** `pipeline/tests/test_trails.py`:

```python
"""#127: member ways of listed route=hiking relations become drivable gravel trails."""
from pathlib import Path

import shapely

import anchors
import geo
import osm_read
import world_roads
import world_trails

FIX = Path(__file__).parent / "fixtures" / "trails.osm"
FRAME = geo.Frame(*geo.EHRENDINGEN_ORIGIN)
CLIP = shapely.box(-5000, -5000, 5000, 5000)


def test_member_ways_only_listed_hiking_relations():
    assert world_trails.member_ways(FIX, {100}) == {10, 11, 12}
    assert world_trails.member_ways(FIX, {101}) == {13}
    assert world_trails.member_ways(FIX, {102}) == set()          # not a hiking route
    assert world_trails.member_ways(FIX, set()) == set()


def _roads(trail_ids):
    data = osm_read.read(FIX, FRAME)
    roads, _ = world_roads.build(data.ways, data.nodes, data.way_nodes, CLIP, trail_ids=trail_ids)
    return {r["id"]: r for r in roads}


def test_trail_ways_are_kept_as_gravel_trails():
    roads = _roads({10, 11, 12})
    assert set(roads) == {10, 11}                                 # 12 is a tunnel, 13 is not a trail
    for r in roads.values():
        assert r["trail"] is True and r["w"] == 3.0 and r["mark"] == "none"


def test_without_trail_ids_tracks_and_paths_stay_dropped():
    assert _roads(frozenset()) == {}


def test_trail_ids_from_spec():
    assert anchors.trail_ids({"trails": ["r5185510", "r5185484"]}) == {5185510, 5185484}
    assert anchors.trail_ids({}) == set()
```

- [ ] **Step 3: Run them and see them fail.** `cd pipeline && ./.venv/bin/python -m pytest tests/test_trails.py -q` gives `ModuleNotFoundError: No module named 'world_trails'`.

- [ ] **Step 4: Implement `pipeline/world_trails.py`:**

```python
"""Hiking trails (#127): the member ways of chosen OSM route=hiking relations, kept as drivable gravel trails.

Read apart from osm_read, like world_boundaries: in one pass pyosmium meets a relation only after its ways."""
from __future__ import annotations

from pathlib import Path

import osmium


def member_ways(path: Path, relation_ids: set[int]) -> set[int]:
    """Way ids of the route=hiking relations in relation_ids."""
    if not relation_ids:
        return set()
    out: set[int] = set()
    for r in osmium.FileProcessor(str(path), osmium.osm.RELATION):
        if r.id in relation_ids and r.tags.get("route") == "hiking":
            out.update(m.ref for m in r.members if m.type == "w")
    return out
```

- [ ] **Step 5: Implement in `pipeline/world_roads.py`.** Add `TRAIL_WIDTH = 3.0` next to `SPLIT_MIN`. Change `build`:

```python
def build(ways, nodes, way_nodes, clip, trail_ids=frozenset()):
    """... (keep the docstring) ... trail_ids (#127): hiking-route member ways kept as 3 m gravel trails, tunnels excepted."""
    roads, widest, uses = [], {}, {}
    for w in ways:
        t = w.tags
        trail = w.id in trail_ids and "highway" in t and t.get("tunnel", "no") == "no" and not keep(t)
        if "highway" not in t or not (keep(t) or trail):
            continue
        wd = TRAIL_WIDTH if trail else width(t)
```

In the same loop, set `base = "none" if trail else marking(t)`. Add `**({"trail": True} if trail else {})` to the road dict, after `"layer"`. Hochrhein roads get no new key, so their JSON is unchanged.

- [ ] **Step 6: Implement `anchors.trail_ids`** in `pipeline/anchors.py`, after `keep_ids`:

```python
def trail_ids(spec) -> set:
    """Hiking route relations whose member ways become drivable trails (#127)."""
    return {_osm_ref(s)[1] for s in spec.get("trails", [])}
```

- [ ] **Step 7: Wire it in `pipeline/osm.py` `build_world`.** Add `import world_trails` to the imports. Replace the `roads, junctions = world_roads.build(...)` line. `spec` is loaded one line above, so move `spec = anchors_mod.load(anchors_path)` above it if needed:

```python
    trails = world_trails.member_ways(Path(pbf), anchors_mod.trail_ids(spec))
    roads, junctions = world_roads.build(data.ways, data.nodes, data.way_nodes, clip, trail_ids=trails)
```

Add `trails {len([r for r in roads if r.get('trail')])}` to the summary `log(...)`.

- [ ] **Step 8: Run the new and the existing pipeline tests.** `cd pipeline && ./.venv/bin/python -m pytest -q`. All green; the Hochrhein golden tests skip or pass unchanged.

- [ ] **Step 9: Commit.** `git add pipeline/world_trails.py pipeline/world_roads.py pipeline/anchors.py pipeline/osm.py pipeline/tests/test_trails.py pipeline/tests/fixtures/trails.osm && git commit -m "feat(pipeline): hiking-route member ways as drivable trails (#127)"`

### Task 3: Ehrendingen anchors and golden test

**Files:** Create `pipeline/anchors_ehrendingen.json`, `pipeline/tests/test_golden_ehrendingen.py`; modify `pipeline/tests/test_anchors.py`

- [ ] **Step 1: Write the failing test.** Append to `pipeline/tests/test_anchors.py`:

```python
EHR = Path(__file__).parents[1] / "anchors_ehrendingen.json"


def test_ehrendingen_anchors_resolve_without_osm_data():
    spec = anchors.load(EHR)
    out = anchors.resolve(spec, OsmData(), geo.Frame(*geo.EHRENDINGEN_ORIGIN))
    b = out["landmarks"]["boendlern"]
    assert (b["x"], b["z"]) == pytest.approx((-149.5, -1464.9), abs=0.5)
    w = out["landmarks"]["wanderweg"]
    assert (w["x"], w["z"]) == pytest.approx((147.5, 376.4), abs=2)
    assert "gemeindehausUnterdorf" in out["landmarks"]
    assert len(out["cps"]) == 5 and out["finish"]["n"] == "Im Böndlern"
    assert out["start"][2] == pytest.approx(math.radians(270))
    assert {lb["t"] for lb in out["labels"]} == {"UNTEREHRENDINGEN", "OBEREHRENDINGEN", "IM BÖNDLERN", "LÄGERN"}
    assert anchors.trail_ids(spec) == {5185510, 5185484, 5185509}
    assert anchors.keep_ids(spec) == {114544595, 114544599, 102158022, 178797165, 102165202, 178797287}
    assert "jumpRamp" not in spec["landmarks"]
```

- [ ] **Step 2: Run it and see it fail** (`FileNotFoundError`): `cd pipeline && ./.venv/bin/python -m pytest tests/test_anchors.py -q`

- [ ] **Step 3: Create `pipeline/anchors_ehrendingen.json`:**

```json
{
  "landmarks": {
    "boendlern":             { "lonlat": [8.34014, 47.50799], "kind": "poi", "src": "Im Böndlern: service road w54804175 'Böndlern' by the ARA (Böndlern 2-7), #127" },
    "wanderweg":             { "lonlat": [8.3438, 47.4914], "kind": "poi", "src": "Unter Eich, where the yellow Wanderweg routes r5185484, r5185509 and r5185510 meet (#127, spec A3)" },
    "gemeindehausUnterdorf": { "lonlat": [8.35008, 47.50105], "kind": "poi", "src": "townhall node n323236524 (not a named node in osm_read)" }
  },
  "start": { "lonlat": [8.33993, 47.49417], "heading_deg": 270, "src": "bus stop Ehrendingen Post n323236548, facing north" },
  "cps": [
    { "n": "Höhtal", "lonlat": [8.33574, 47.48765] },
    { "n": "Breitwies", "lonlat": [8.33846, 47.49123] },
    { "n": "Schulhaus Lägernbreite", "lonlat": [8.34302, 47.49251] },
    { "n": "Kapelle St. Anna", "lonlat": [8.34877, 47.50153] },
    { "n": "Tiefenwaag", "lonlat": [8.34621, 47.50565] }
  ],
  "finish": { "n": "Im Böndlern", "lonlat": [8.34014, 47.50799] },
  "labels": [
    { "t": "UNTEREHRENDINGEN", "lonlat": [8.3470583, 47.5037138] },
    { "t": "OBEREHRENDINGEN", "lonlat": [8.3422279, 47.4936534] },
    { "t": "IM BÖNDLERN", "lonlat": [8.34014, 47.50840] },
    { "t": "LÄGERN", "lonlat": [8.3437, 47.4795] }
  ],
  "areas": { "industrial": [] },
  "exclude_buildings": [],
  "keep_buildings": [ "w114544595", "w114544599", "w102158022", "w178797165", "w102165202", "w178797287" ],
  "trails": [ "r5185510", "r5185484", "r5185509" ]
}
```

Check while writing it: `wanderweg`'s expected position in the test (147.5, 376.4 ±2) is `Frame(*EHRENDINGEN_ORIGIN).to_game(8.3438, 47.4914)`. If that disagrees by more than 2 m, fix the **test constant** to the computed value, never the lonlat. It is a coordinate pin, not behaviour.

- [ ] **Step 4: Run it and see it pass.**

- [ ] **Step 5: Write the golden test** `pipeline/tests/test_golden_ehrendingen.py`. It skips until Task 9 has made the extract:

```python
"""#127: the Ehrendingen world from its own extract (skips until pipeline/cache/osm/ehrendingen.osm.pbf exists)."""
from pathlib import Path

import pytest
import shapely

import geo
import osm

PBF = Path(__file__).parents[1] / "cache" / "osm" / "ehrendingen.osm.pbf"
MMH = Path(__file__).parents[2] / "data" / "terrain_ehrendingen.mmh"
ANCHORS = Path(__file__).parents[1] / "anchors_ehrendingen.json"
pytestmark = pytest.mark.skipif(not PBF.exists(), reason="Ehrendingen extract not present (plan Task 9)")


@pytest.fixture(scope="module")
def world():
    return osm.build_world(PBF, MMH if MMH.exists() else None, geo.EHRENDINGEN_BBOX, geo.EHRENDINGEN_ORIGIN,
                           30.0, 1000.0, ANCHORS)


def test_box_and_boendlern(world):
    assert world["bbox"] == list(geo.EHRENDINGEN_BBOX)
    assert any(r["id"] == 54804175 for r in world["roads"])


def test_wanderweg_is_a_trail_road(world):
    w = world["anchors"]["landmarks"]["wanderweg"]
    trails = [r for r in world["roads"] if r.get("trail")]
    assert trails
    near = shapely.MultiLineString([r["pts"] for r in trails if len(r["pts"]) > 1]).distance(shapely.Point(w["x"], w["z"]))
    assert near < 30


def test_kept_buildings_and_counts(world):
    ids = {b["id"] for b in world["buildings"]}
    assert {114544595, 114544599, 102158022, 178797165, 102165202, 178797287} <= ids
    assert 400 < len(world["buildings"]) < 2500
    assert len(world["anchors"]["cps"]) == 5


def test_size_budget(world, tmp_path):
    out = tmp_path / "w.json"
    osm.write_world(out, world)
    assert out.stat().st_size < 4_000_000
```

- [ ] **Step 6: Run the pipeline suite.** `cd pipeline && ./.venv/bin/python -m pytest -q`: green, with `test_golden_ehrendingen` skipped.

- [ ] **Step 7: Commit.** `git add pipeline/anchors_ehrendingen.json pipeline/tests/test_anchors.py pipeline/tests/test_golden_ehrendingen.py && git commit -m "feat(pipeline): Ehrendingen anchors, race and trails (#127)"`

### Task 4: Region-aware landmarks, villages, trails and strings (pure modules)

**Files:** Modify `prototype/landmarks.js`, `prototype/world.js`, `prototype/strings.js`, `prototype/tests/landmarks.test.mjs`, `prototype/tests/world.test.mjs`

- [ ] **Step 1: Write the failing tests.** Append to `prototype/tests/landmarks.test.mjs`, and extend its import with `GEMEINDEN_EHRENDINGEN, LANDMARK_INFO_EHRENDINGEN`:

```js
test('landmarkEntries and gemeindenOf take the region Gemeinden (#127)', () => {
  const info = [{ name: 'Im Böndlern', gemeinde: 'Ehrendingen', anchor: 'boendlern' }];
  const e = landmarkEntries(info, { boendlern: { x: -149.5, z: -1464.9 } }, [], GEMEINDEN_EHRENDINGEN);
  assert.deepEqual(e, [{ n: 'Im Böndlern', g: 'Ehrendingen', x: -149.5, z: -1464.9 }]);
  assert.deepEqual(gemeindenOf(e, GEMEINDEN_EHRENDINGEN), ['Ehrendingen']);
  assert.deepEqual(gemeindenOf(e), []);                       // default stays the Hochrhein list
});

test('the Ehrendingen J list has Im Böndlern and the Wanderweg, all in Ehrendingen, no ramp (#127)', () => {
  const names = LANDMARK_INFO_EHRENDINGEN.map(i => i.name);
  assert.ok(names.includes('Im Böndlern') && names.includes('Wanderweg'));
  assert.ok(LANDMARK_INFO_EHRENDINGEN.every(i => i.gemeinde === 'Ehrendingen' && !i.ramp));
  assert.deepEqual(GEMEINDEN_EHRENDINGEN, ['Ehrendingen']);
});
```

Append to `prototype/tests/world.test.mjs`, and add `VILLAGES_EHRENDINGEN` to its import:

```js
test('layoutFromWorld draws trail roads as gravel (#127)', () => {
  const w = { roads: [{ cls: 'track', trail: true, pts: [[0, 0], [10, 0]], w: 3 }, { cls: 'residential', pts: [[0, 0], [10, 0]], w: 5.5 }],
              junctions: [], water: [], buildings: [], rail: [], anchors: {}, bbox: [], waterSdf: null };
  assert.deepEqual(layoutFromWorld(w).roads.map(r => r.tex), ['gravel', 'road']);
});

test('Ehrendingen has its own village names (#127)', () => {
  assert.deepEqual(VILLAGES_EHRENDINGEN.map(v => v.t), ['UNTEREHRENDINGEN', 'OBEREHRENDINGEN']);
});
```

- [ ] **Step 2: Run them and see them fail.** `node --test prototype/tests/landmarks.test.mjs prototype/tests/world.test.mjs`

- [ ] **Step 3: Implement `landmarks.js`.**
  - Change the signatures to `landmarkEntries(info, anchors, buildings, gemeinden = GEMEINDEN)` and `gemeindenOf(entries, gemeinden = GEMEINDEN)`. Use `gemeinden` instead of `GEMEINDEN` inside both.
  - Add after `LANDMARK_INFO`:

```js
// #127: the second region. Positions from the Ehrendingen world (pipeline/anchors_ehrendingen.json, kept buildings).
export const GEMEINDEN_EHRENDINGEN = ['Ehrendingen'];
export const LANDMARK_INFO_EHRENDINGEN = [
  { name: 'Im Böndlern', gemeinde: 'Ehrendingen', anchor: 'boendlern' },
  { name: 'ARA Ehrendingen', gemeinde: 'Ehrendingen', building: 178797287 },
  { name: 'Wanderweg', gemeinde: 'Ehrendingen', anchor: 'wanderweg' },              // Unter Eich on the yellow Wanderweg (spec A3)
  { name: 'Kath. Kirche Ehrendingen', gemeinde: 'Ehrendingen', building: 114544595 },
  { name: 'Reformierte Kirche Ehrendingen', gemeinde: 'Ehrendingen', building: 114544599 },
  { name: 'Kapelle St. Anna', gemeinde: 'Ehrendingen', building: 102158022 },
  { name: 'Mehrzweckhalle Lägernbreite', gemeinde: 'Ehrendingen', building: 178797165 },
  { name: 'Gemeindehaus Unterdorf', gemeinde: 'Ehrendingen', anchor: 'gemeindehausUnterdorf' },
];
```

- [ ] **Step 4: Implement `world.js`.**
  - In `layoutFromWorld`, change the `tex` expression to `r.trail ? 'gravel' : r.cls === 'motorway' || r.cls === 'motorway_link' ? 'motorway' : 'road'`.
  - After `VILLAGES`:

```js
// #127: Ehrendingen's village names, place nodes converted with geo.Frame(*EHRENDINGEN_ORIGIN).to_game on 2026-10-09
export const VILLAGES_EHRENDINGEN = [
  { t: 'UNTEREHRENDINGEN', x: 377.2, z: -995.5, r: 450 },   // node 102311519
  { t: 'OBEREHRENDINGEN', x: 26.2, z: 127.2, r: 450 },      // node 102311797
];
```

- [ ] **Step 5: Implement `strings.js`.**
  - In `en`, change `mode: (r) => \`Time trial · ${r}\`` and `map: (r) => \`Map · ${r} ·\``. In `de`: `mode: (r) => \`Zeitfahren · ${r}\``, `map: (r) => \`Karte · ${r} ·\``.
  - Add in `en`:

```js
  region: 'Region',
  regionMissing: (n) => `No data for ${n} yet — showing Hochrhein`,
  introEhrendingen: 'Oberdorf → Höhtal → Lägernbreite → St. Anna → Tiefenwaag. Five checkpoints in any order, then the finish Im Böndlern. The Wanderweg is for hikers. Nobody told the timer.',
  finishedEhrendingen: 'Im Böndlern reached. Retry for a better line, or take the Wanderweg next time.',
  blurbOsmEhrendingen: 'Roads, the Wanderweg, houses and the Surb from OpenStreetMap, terrain from swisstopo. Timer starts when you move.',
```

  - and in `de`:

```js
  region: 'Region',
  regionMissing: (n) => `Für ${n} gibt es noch keine Daten — Du siehst den Hochrhein`,
  introEhrendingen: 'Oberdorf → Höhtal → Lägernbreite → St. Anna → Tiefenwaag. Fünf Checkpoints in beliebiger Reihenfolge, dann das Ziel Im Böndlern. Der Wanderweg ist für Wanderer. Das hat der Stoppuhr niemand gesagt.',
  finishedEhrendingen: 'Im Böndlern erreicht. Nochmals für eine bessere Linie, oder nimm nächstes Mal den Wanderweg.',
  blurbOsmEhrendingen: 'Strassen, Wanderweg, Häuser und die Surb aus OpenStreetMap, Gelände von swisstopo. Die Zeit läuft, sobald Du fährst.',
```

- [ ] **Step 6: Run all Node tests.** `node --test prototype/tests/*.test.mjs`: all green, including `strings.test.mjs` parity and arity.

- [ ] **Step 7: Commit.** `git commit -am "feat(ui): region-aware landmarks, villages, trail texture and strings (#127)"`

### Task 5: `regions.js` — the region table and URL helpers

**Files:** Create `prototype/regions.js`, `prototype/tests/regions.test.mjs`

**Interfaces:** `REGIONS`, `DEFAULT_REGION = 'hochrhein'`, `regionFromQuery(search) -> id`, `regionSearch(search, id) -> string` (`''` or `'?…'`)

- [ ] **Step 1: Write the failing test** `prototype/tests/regions.test.mjs`:

```js
// #127: the region table and its URL helpers. Pure: no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, DEFAULT_REGION, regionFromQuery, regionSearch } from '../regions.js';
import { STRINGS } from '../strings.js';
import { VILLAGES } from '../world.js';
import { GEMEINDEN, LANDMARK_INFO } from '../landmarks.js';

test('regionFromQuery: default, case-insensitive, unknown falls back', () => {
  assert.equal(DEFAULT_REGION, 'hochrhein');
  assert.equal(regionFromQuery(''), 'hochrhein');
  assert.equal(regionFromQuery('?region=ehrendingen'), 'ehrendingen');
  assert.equal(regionFromQuery('?vehicle=delorean&region=Ehrendingen'), 'ehrendingen');
  assert.equal(regionFromQuery('?region=atlantis'), 'hochrhein');
});

test('regionSearch keeps other parameters and drops region for the default', () => {
  assert.equal(regionSearch('?vehicle=delorean&debug', 'ehrendingen'), '?vehicle=delorean&debug=&region=ehrendingen');
  assert.equal(regionSearch('?region=ehrendingen&vehicle=delorean', 'hochrhein'), '?vehicle=delorean');
  assert.equal(regionSearch('?region=ehrendingen', 'hochrhein'), '');
});

test('Hochrhein keeps exactly today\'s values', () => {
  const h = REGIONS.hochrhein;
  assert.equal(h.world, '../data/world_hochrhein.json');
  assert.equal(h.terrain, '../data/terrain_hochrhein.mmh');
  assert.equal(h.idbKey, 'terrain');
  assert.equal(h.bestKey, 'mm.best2');
  assert.deepEqual(h.treeBox, [-3100, 3100, -1800, 1900]);
  assert.equal(h.forestAbove, 18);
  assert.equal(h.handFallback, true);
  assert.equal(h.villages, VILLAGES); assert.equal(h.gemeinden, GEMEINDEN); assert.equal(h.landmarks, LANDMARK_INFO);
  assert.deepEqual(h.strings, { intro: 'intro', finished: 'finishedText', blurb: 'blurbOsm' });
});

test('every region is complete and its string keys exist', () => {
  for (const [id, r] of Object.entries(REGIONS)) {
    assert.equal(r.id, id);
    for (const k of ['name', 'world', 'terrain', 'idbKey', 'bestKey', 'villages', 'gemeinden', 'landmarks', 'treeBox', 'forestAbove']) assert.ok(r[k] !== undefined, `${id}.${k}`);
    for (const key of Object.values(r.strings)) { assert.ok(key in STRINGS.en, key); assert.ok(key in STRINGS.de, key); }
  }
  assert.notEqual(REGIONS.ehrendingen.idbKey, REGIONS.hochrhein.idbKey);
  assert.notEqual(REGIONS.ehrendingen.bestKey, REGIONS.hochrhein.bestKey);
  assert.equal(REGIONS.ehrendingen.handFallback, false);
});
```

- [ ] **Step 2: Run it and see it fail.** `node --test prototype/tests/regions.test.mjs`

- [ ] **Step 3: Implement `prototype/regions.js`:**

```js
// #127: the playable regions. Pure: no DOM, no three.js. Hochrhein is the default and keeps today's values exactly.
import { VILLAGES, VILLAGES_EHRENDINGEN } from './world.js';
import { GEMEINDEN, LANDMARK_INFO, GEMEINDEN_EHRENDINGEN, LANDMARK_INFO_EHRENDINGEN } from './landmarks.js';

export const DEFAULT_REGION = 'hochrhein';
export const REGIONS = {
  hochrhein: {
    id: 'hochrhein', name: 'Hochrhein', world: '../data/world_hochrhein.json', terrain: '../data/terrain_hochrhein.mmh',
    idbKey: 'terrain', bestKey: 'mm.best2', strings: { intro: 'intro', finished: 'finishedText', blurb: 'blurbOsm' },
    villages: VILLAGES, gemeinden: GEMEINDEN, landmarks: LANDMARK_INFO,
    treeBox: [-3100, 3100, -1800, 1900], forestAbove: 18, handFallback: true,
  },
  ehrendingen: {
    id: 'ehrendingen', name: 'Ehrendingen', world: '../data/world_ehrendingen.json', terrain: '../data/terrain_ehrendingen.mmh',
    idbKey: 'terrain:ehrendingen', bestKey: 'mm.best2.ehrendingen',
    strings: { intro: 'introEhrendingen', finished: 'finishedEhrendingen', blurb: 'blurbOsmEhrendingen' },
    villages: VILLAGES_EHRENDINGEN, gemeinden: GEMEINDEN_EHRENDINGEN, landmarks: LANDMARK_INFO_EHRENDINGEN,
    treeBox: [-1520, 1840, -2225, 2065], forestAbove: 90, handFallback: false,   // box = pipeline geo.EHRENDINGEN_BBOX in game metres; +90 m ≈ 495 m a.s.l. (spec A6)
  },
};

export function regionFromQuery(search) {
  const id = (new URLSearchParams(search).get('region') || '').toLowerCase();
  return id in REGIONS ? id : DEFAULT_REGION;
}

export function regionSearch(search, id) {
  const p = new URLSearchParams(search);
  p.delete('region');
  if (id !== DEFAULT_REGION) p.set('region', id);
  const s = p.toString();
  return s ? `?${s}` : '';
}
```

- [ ] **Step 4: Run all Node tests.** `node --test prototype/tests/*.test.mjs`: green.

- [ ] **Step 5: Commit.** `git add prototype/regions.js prototype/tests/regions.test.mjs && git commit -m "feat(ui): region table and ?region= helpers (#127)"`

### Task 6: Wire the region into the game and add the start-screen choice

**Files:** Modify `prototype/index.html`; create `prototype/tests/test_region.py`

Line numbers are from `main` @ `ac0214e`; match on the quoted text.

- [ ] **Step 1: Write the failing browser test** `prototype/tests/test_region.py`:

```python
"""#127: a second region, chosen with ?region= or on the start screen. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
EHR_WORLD = ROOT / "data" / "world_ehrendingen.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_ehr = pytest.mark.skipif(not EHR_WORLD.exists(), reason="Ehrendingen world not built (plan Task 10)")


def boot(p, server, query="", block=()):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    for pat in block:
        page.route(pat, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def test_default_is_hochrhein_and_marked(server):
    with sync_playwright() as p:
        b, page = boot(p, server)
        assert page.evaluate("() => window.__mm.region") == "hochrhein"
        assert page.get_attribute("#region-hochrhein", "aria-pressed") == "true"
        assert page.get_attribute("#region-ehrendingen", "aria-pressed") == "false"
        b.close()


def test_choosing_ehrendingen_reloads_with_the_parameter_and_keeps_vehicle(server):
    with sync_playwright() as p:
        b, page = boot(p, server, "?vehicle=delorean", block=["**/data/world_ehrendingen.json"])
        with page.expect_navigation():
            page.click("#region-ehrendingen")
        assert "region=ehrendingen" in page.url and "vehicle=delorean" in page.url
        b.close()


def test_missing_region_data_falls_back_to_hochrhein(server):
    with sync_playwright() as p:
        b, page = boot(p, server, "?region=ehrendingen", block=["**/data/world_ehrendingen.json"])
        assert page.evaluate("() => window.__mm.region") == "hochrhein"
        page.wait_for_function("() => /Ehrendingen/.test(document.body.innerText)", timeout=10000)   # the regionMissing toast
        b.close()


@needs_ehr
def test_ehrendingen_loads_and_j_reaches_boendlern_and_the_wanderweg(server):
    lm = json.loads(EHR_WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"]
    with sync_playwright() as p:
        b, page = boot(p, server, "?region=ehrendingen")
        assert page.evaluate("() => [window.__mm.region, window.__mm.layout]") == ["ehrendingen", "osm"]
        page.click("#startbtn")
        for query, key, on_trail in [("böndlern", "boendlern", False), ("wanderweg", "wanderweg", True)]:
            page.keyboard.press("KeyJ"); page.keyboard.type(query); page.keyboard.press("Enter")
            c = page.evaluate("() => window.__mm.car()")
            assert math.hypot(c["x"] - lm[key]["x"], c["z"] - lm[key]["z"]) < 80
            if on_trail:
                assert page.evaluate("() => window.__mm.onTrail()")
        b.close()
```

If `__mm.car()` returns a different shape, follow `test_jump.py`'s `car(page)` usage and adapt the field names (not the thresholds).

- [ ] **Step 2: Run it and see it fail.** `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_region.py -q -p no:cacheprovider`. Expected: `__mm.region` is undefined and `#region-hochrhein` is missing; the `needs_ehr` test is skipped.

- [ ] **Step 3: Pick the region and load its files.**
  - Import: `import { REGIONS, regionFromQuery, regionSearch } from './regions.js';` (the region carries its villages, Gemeinden and landmarks; drop `LANDMARK_INFO` from the landmarks import if it becomes unused).
  - Replace the terrain line (`:409`) and the world line (`:411`) with:

```js
// #127: the region (?region=, start-screen row). A non-default region without its world file falls back to the default.
let REGION = REGIONS[regionFromQuery(location.search)], REGION_FALLBACK = null;
let WORLD = await fetch(REGION.world).then(r => r.ok ? r.json() : null).catch(() => null);
if (!WORLD && !REGION.handFallback) { REGION_FALLBACK = REGION.name; REGION = REGIONS.hochrhein; WORLD = await fetch(REGION.world).then(r => r.ok ? r.json() : null).catch(() => null); }
const REAL = await (async () => { let buf = await idbGet(REGION.idbKey); if (!buf) { REAL_SRC = 'bundled'; buf = await fetch(REGION.terrain).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); } if (!buf) return null; try { return parseMMH(buf); } catch (e) { return null; } })();
```

The world now loads before the terrain. Both are awaited before `L` is built, so the order does not matter to the code below. Keep the comment lines above them, with "data/world_hochrhein.json" changed to "the region's world file".

  - In `idbSet('terrain', …)` (`:1452`) and `idbSet('terrain', null)` (`:1453`), use `REGION.idbKey`.
  - Best time (`:1386`, `:1397`): `'mm.best2'` → `REGION.bestKey`.
  - After `window.__mm = { … }` (`:470`), add `window.__mm.region = REGION.id;`.

- [ ] **Step 4: Region-specific constants.**
  - `VILLAGES` at `:1058`, `:1062`, `:1250` → `REGION.villages`.
  - `:1238`: `landmarkEntries(REGION.landmarks, L.anchors.landmarks, L.buildings, REGION.gemeinden)`.
  - `:1427`: `gemeindenOf(JUMP_ENTRIES, REGION.gemeinden)`.
  - Trees, `:1027`: `SW = L ? (L.anchors.areas.sisselnWald || null) : [1960, -520, 2500, -300]`. In `:1029`:
    - `const sisselnWald = !!SW && tx > SW[0] …`;
    - `const [bx0, bx1, bz0, bz1] = REGION.treeBox;` before the loop, with `tx = rr(bx0, bx1), tz = rr(bz0, bz1)`;
    - `th > REGION.forestAbove` in place of `th > 18`.

    For Hochrhein the values are identical, so the random sequence and the trees do not change.
  - Ramp, `:577`: after it, add `else if (L) RAMP = null;   // #127: a region without a Sprungschanze anchor has no ramp`. Guard the users:
    - `groundH` (`:563`): `if (RAMP && x >= RAMP.x0 …)`;
    - `rampMesh();` (`:1010`) → `if (RAMP) rampMesh();`;
    - `__mm.ramp` → `() => RAMP && ({ … })`;
    - `__mm.rampGap` → return `0` when `!RAMP`;
    - `jumpToRamp` → `if (!RAMP) return;` first.
  - Made-up terrain, `baseH` (`:498`): after the `if (REAL) …` line, add `if (L && !REGION.handFallback) return 0;   // #127: the made-up hills are the Rhine valley; elsewhere flat until the .mmh loads`.

- [ ] **Step 5: Strings.**
  - `renderOverlay` (`:1400`): `tr(done ? REGION.strings.finished : REGION.strings.intro)`.
  - Blurb (`:1449`): `tr(L ? REGION.strings.blurb : 'blurbHand')`.
  - HTML `:101` and `:167`: drop `data-i18n="mode"`/`data-i18n="map"`, and give the elements `id="modetext"`/`id="maptext"`. In `applyStaticStrings` add `$('modetext').textContent = tr('mode', REGION.name); $('maptext').textContent = tr('map', REGION.name);`. If `$` is not yet defined there, use `document.getElementById`.
  - At the end of boot (after the start placement, `:1529`): `if (REGION_FALLBACK) toast(tr('regionMissing', REGION_FALLBACK), TOAST_S.event);`

- [ ] **Step 6: Trails drawn as gravel.**
  - Road ribbon (`:884`): the role becomes `r.tex === 'motorway' ? 'motorway' : r.tex === 'gravel' ? 'gravel' : L ? 'roadOsm' : 'road'`.
  - Minimap (`:1464`): `g.strokeStyle = r.n === 'A3' ? '#b05050' : r.trail ? '#c9bda6' : '#8d96a3';`
  - Debug hook for the test: `window.__mm.onTrail = () => { const n = nearestRoad(P.x, P.z); return !!(n && n.r.trail); };`. Use whatever nearest-road helper `snapRoad`/`roadDist` is built on (`ROAD_GRID` + `nearestOnPolyline`). Read the code and reuse it; do not write a second spatial index.

  If the `gravel` role has no material in one of the two graphic styles (`:1191` has a flat colour; check the textured style's material map), add it there with `TEX.gravel`.

- [ ] **Step 7: The region row.** CSS, next to `.terrainrow` (`:70`):

```css
.regionrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:10px 0}
.regionrow .btn[aria-pressed="true"]{outline:3px solid var(--sun, #f2c14e)}
```

(Use the accent token the other active buttons use, if one exists.) Markup after the `.row` with Start/Style (`:197-200`):

```html
    <div class="regionrow">
      <span data-i18n="region">Region</span>
      <button id="region-hochrhein" class="btn small" type="button" aria-pressed="true">Hochrhein</button>
      <button id="region-ehrendingen" class="btn small" type="button" aria-pressed="false">Ehrendingen</button>
    </div>
```

Script, near the other overlay handlers:

```js
for (const id of Object.keys(REGIONS)) { const b = $('region-' + id); b.setAttribute('aria-pressed', String(id === REGION.id)); b.onclick = () => { if (id !== REGION.id) location.search = regionSearch(location.search, id); }; }
```

Clicking the active region does nothing. On a fallback the Hochrhein button is the pressed one, which is what is loaded.

- [ ] **Step 8: Run the region test and the affected existing tests.**
  - `… -m pytest prototype/tests/test_region.py -q -p no:cacheprovider`: green (the data test skips).
  - `node --test prototype/tests/*.test.mjs`: green.
  - `… -m pytest prototype/tests/test_i18n.py prototype/tests/test_jump.py prototype/tests/test_village_names.py prototype/tests/test_smoke.py prototype/tests/test_tree_collision.py -q -p no:cacheprovider`: green, unchanged. If `test_i18n.py` reads the `mode`/`map` text through `data-i18n`, it must still find "Hochrhein" in the rendered text; adapt only a selector, never an expected string.

- [ ] **Step 9: Commit.** `git add prototype/index.html prototype/tests/test_region.py && git commit -m "feat(ui): choose the region on the start screen or with ?region= (#127)"`

### Task 7: Docs, changelog, playtest list, push

**Files:** `CHANGELOG.md`, `test-todo.md`, `data/README.md`, `docs/11-pipeline-osm.md`, `README.md`

- [ ] **Step 1: CHANGELOG** under `## [Unreleased]` → `### Added` (English, player-facing):

```markdown
- A second place to race: **Ehrendingen**, near Baden. Pick it on the start screen (or add `?region=ehrendingen` to the address). The race starts at the post office in Oberdorf, runs through five checkpoints and ends Im Böndlern by the Surb. The yellow Wanderweg to Unter Eich is gravel you can drive — it is meant for hikers, but nobody told the timer. **J** takes you to Im Böndlern, the Wanderweg, both churches, Kapelle St. Anna and more. Each place keeps its own best time; the Hochrhein stays the default.
```

- [ ] **Step 2: `test-todo.md`:** add a section "#127 Ehrendingen" with these checks:
  - pick Ehrendingen on the start screen and back;
  - race Oberdorf → Im Böndlern;
  - drive the Wanderweg to Unter Eich;
  - Oberehrendingen is a village, not a forest;
  - fly (F) up to the Lägern;
  - the Hochrhein is unchanged (record, trees, Sprungschanze).
- [ ] **Step 3: `data/README.md`:** add rows for `world_ehrendingen.json` and `terrain_ehrendingen.mmh` with the same sources and licences as the Hochrhein rows. **`docs/11-pipeline-osm.md`:** a section "Second region: Ehrendingen (#127)" with the exact commands of Tasks 9–10, the `trails` key, and that the cut runs on odroid-plus-pve. **`README.md`:** in "Status", one line that a second region, Ehrendingen, is available via the start screen.
- [ ] **Step 4: Commit and push.** `git add -A CHANGELOG.md test-todo.md data/README.md docs/11-pipeline-osm.md README.md && git commit -m "docs: the Ehrendingen region (#127)" && git push -u origin feature/127-region-ehrendingen`. Open the PR as draft now.

### Task 8: Data preconditions (guarded — stop here on CI)

- [ ] **Step 1: Check.** Every one of these must hold, otherwise stop:
  - `ls ~/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/cache/osm/switzerland-latest.osm.pbf` (the cached 2026-09-29 copy) exists;
  - `pipeline/.venv` exists;
  - you are on the maintainer's box or odroid, not a CI runner (`$CI` unset);
  - you can reach odroid-plus-pve, or `pipeline/cache/osm/ehrendingen.osm.pbf` already exists.
- [ ] **Step 2: If any fails, stop.** Put in the PR description: "Data not built: <which precondition>. Code is complete; without the data, `?region=ehrendingen` falls back to the Hochrhein with a toast. Run Tasks 9–10 of docs/superpowers/plans/2026-10-09-region-ehrendingen.md locally: the OSM cut runs on odroid-plus-pve, terrain and world on the agent box under the 2 GB cap." Mark the PR ready and end.

### Task 9: OSM cut on odroid-plus-pve (heavy: never on agent-dev)

`osmium extract -s smart` on the Swiss file peaked at 3.58 GB (docs/11). The peak comes from the planet-wide ID bitmaps, not from the bbox size, so it runs on odroid-plus-pve.

- [ ] **Step 1: Print the commands on the agent box (cheap).** `cd pipeline && ./.venv/bin/python osm.py cut --pbf-dir <dir with only switzerland-latest.osm.pbf> --out cache/osm/ehrendingen.osm.pbf --bbox 8.322 47.476 8.366 47.515 --dry-run`. Use a directory holding **only** the Swiss file (symlink it), so the German file is not cut too.
- [ ] **Step 2: Run on odroid-plus-pve.** In a throwaway LXC with osmium-tool and pyosmium, copy `pipeline/osm.py`, `pipeline/geo.py` and the cached `switzerland-latest.osm.pbf` (the 2026-09-29 copy, not a fresh download). Run the printed `osmium extract` and `osmium merge` commands. Copy the resulting `ehrendingen.osm.pbf` (expect ~1–3 MB) back into `pipeline/cache/osm/`.
- [ ] **Step 3: Golden test.** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden_ehrendingen.py -q`: green. Exit 137 → run Tasks 9–10 in the odroid LXC instead (copy `pipeline/`, the caches and `data/`); never raise the cap.

### Task 10: Terrain and world build (guarded)

- [ ] **Step 1: Terrain** (swissALTI3D via the free STAC API, ~20 tiles):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python terrain.py \
  --bbox 8.322 47.476 8.366 47.515 --origin 47.4948 8.3419 --step 4 --base 405 --out ../data/terrain_ehrendingen.mmh
```

Check the header: `w 844`, `h 1095`, `min` between −15 and +5 (otherwise set `--base` to the Surb level the log shows, update `EHRENDINGEN_BASE` to match, and rebuild), and `max` around +440 (Lägern).

- [ ] **Step 2: World** (swissSURFACE3D building heights, ~20 tiles into the shared cache):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build \
  --pbf cache/osm/ehrendingen.osm.pbf --mmh ../data/terrain_ehrendingen.mmh --bbox 8.322 47.476 8.366 47.515 \
  --origin 47.4948 8.3419 --anchors anchors_ehrendingen.json --out ../data/world_ehrendingen.json --dsm-heights cache
```

The log must show `trails` > 0 and no `anchors: … not found`. Size guard: world < 4 MB, `.mmh` < 4 MB.

- [ ] **Step 3: Golden and browser tests with the data.**
  - `cd pipeline && ./.venv/bin/python -m pytest tests/test_golden_ehrendingen.py -q`: green.
  - `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_region.py -q -p no:cacheprovider`: all four green, the data test included.
- [ ] **Step 4: Check that the snapped race points are on roads.** Load `?region=ehrendingen` in Playwright and compare `__mm` checkpoints with the anchors. Each one snapped within 60 m (`snapRoad`); a checkpoint left unsnapped means its lonlat is off a drivable road, so move that one anchor onto the nearest street and rebuild.
- [ ] **Step 5: Commit and push.** `git add data/world_ehrendingen.json data/terrain_ehrendingen.mmh && git commit -m "chore(data): build the Ehrendingen region (#127)" && git push`. Mark the PR ready.
