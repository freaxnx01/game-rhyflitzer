# oneway and lanes per road (#679) Implementation Plan

**Goal:** `world_roads.build` writes `oneway` (travel-direction normalised) and `lanes` per road piece; docs and world files updated.

**Spec:** `docs/superpowers/specs/2026-11-05-road-oneway-lanes-design.md`

## Global Constraints

- Python in `pipeline/`, TDD, tests via `cd pipeline && python -m pytest`. No Playwright, no game code change.
- Keys are optional: emitted only when known. `MMW1` unchanged.
- Never hand-edit `data/world_*.json`; regenerate with the pipeline or leave to the maintainer.
- Memory-heavy pbf work (the rebuild in Task 3) runs under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.

## Files

- Modify: `pipeline/world_roads.py`, `pipeline/tests/test_roads.py`, `pipeline/tests/test_golden.py`, `docs/11-pipeline-osm.md`
- Regenerate: `data/world_hochrhein.json`, `data/world_ehrendingen.json` (Task 3)

### Task 1: `oneway_dir` and `lane_count` (TDD)

**Interfaces:** `oneway_dir(tags) -> int` (1 forward, -1 reversed, 0 not one-way); `lane_count(tags) -> int | None`.

- [ ] **Step 1: Write the failing tests** (append to `pipeline/tests/test_roads.py`)

```python
@pytest.mark.parametrize("tags,d", [
    ({"highway": "tertiary"}, 0),
    ({"highway": "tertiary", "oneway": "yes"}, 1),
    ({"highway": "tertiary", "oneway": "true"}, 1),
    ({"highway": "tertiary", "oneway": "1"}, 1),
    ({"highway": "tertiary", "oneway": "-1"}, -1),
    ({"highway": "tertiary", "oneway": "reverse"}, -1),
    ({"highway": "tertiary", "oneway": "no"}, 0),
    ({"highway": "tertiary", "oneway": "reversible"}, 0),
    ({"highway": "tertiary", "oneway": "alternating"}, 0),
    ({"highway": "primary", "junction": "roundabout"}, 1),
    ({"highway": "primary", "junction": "circular"}, 1),
    ({"highway": "primary", "junction": "roundabout", "oneway": "no"}, 0),
    ({"highway": "motorway"}, 1),
    ({"highway": "motorway_link"}, 1),
    ({"highway": "motorway", "oneway": "no"}, 0),
    ({"highway": "trunk"}, 0),
])
def test_oneway_dir(tags, d):
    assert R.oneway_dir(tags) == d


@pytest.mark.parametrize("tags,n", [
    ({"highway": "tertiary"}, None),
    ({"highway": "tertiary", "lanes": "2"}, 2),
    ({"highway": "tertiary", "lanes": "1"}, 1),
    ({"highway": "tertiary", "lanes": "0"}, None),
    ({"highway": "tertiary", "lanes": "2;3"}, None),
    ({"highway": "tertiary", "lanes": "many"}, None),
])
def test_lane_count(tags, n):
    assert R.lane_count(tags) == n
```

- [ ] **Step 2:** run `cd pipeline && python -m pytest tests/test_roads.py -k "oneway_dir or lane_count"`; expect AttributeError.
- [ ] **Step 3: Implement** in `pipeline/world_roads.py`, after `marking()`:

```python
IMPLICIT_ONEWAY = ("motorway", "motorway_link")


def oneway_dir(tags) -> int:
    """1 = one-way along the way, -1 = one-way against it (oneway=-1), 0 = two-way or not a plain one-way (#679).
    OSM defaults apply when the tag is absent: roundabouts and motorways are one-way."""
    value = tags.get("oneway")
    if value in ("yes", "true", "1"):
        return 1
    if value in ("-1", "reverse"):
        return -1
    if value is not None:
        return 0
    if tags.get("junction") in ("roundabout", "circular") or tags.get("highway") in IMPLICIT_ONEWAY:
        return 1
    return 0


def lane_count(tags):
    """The OSM `lanes` tag as an int (total for a two-way road, per carriageway for a one-way one), else None (#679)."""
    value = tags.get("lanes", "")
    return int(value) if value.isdigit() and int(value) >= 1 else None
```

- [ ] **Step 4:** the same pytest command passes. **Step 5:** commit `feat(pipeline): oneway_dir and lane_count (#679)`.

### Task 2: `build` writes the keys (TDD)

- [ ] **Step 1: Write the failing tests** (append to `pipeline/tests/test_roads.py`)

```python
BIG = shapely.box(-1000, -1000, 1000, 1000)


def _build(tags, pts=((0, 0), (50, 0), (100, 0))):
    roads, _ = R.build([Way(1, tags, shapely.LineString(pts))], {}, {}, BIG)
    return roads


def test_build_writes_oneway_and_lanes():
    r = _build({"highway": "tertiary", "oneway": "yes", "lanes": "2"})[0]
    assert r["oneway"] is True and r["lanes"] == 2
    assert r["pts"][0] == [0.0, 0.0] and r["pts"][-1] == [100.0, 0.0]


def test_build_omits_keys_when_unknown():
    r = _build({"highway": "tertiary"})[0]
    assert "oneway" not in r and "lanes" not in r


def test_build_reverses_pts_for_oneway_minus_one():
    r = _build({"highway": "tertiary", "oneway": "-1"})[0]
    assert r["oneway"] is True
    assert r["pts"][0] == [100.0, 0.0] and r["pts"][-1] == [0.0, 0.0]


def test_build_keeps_direction_through_clip():
    ways = [Way(1, {"highway": "tertiary", "oneway": "yes"}, shapely.LineString([(-50, 0), (50, 0), (150, 0)]))]
    roads, _ = R.build(ways, {}, {}, shapely.box(0, -10, 100, 10))
    assert roads[0]["pts"][0][0] < roads[0]["pts"][-1][0]


def test_build_roundabout_is_oneway_without_tag():
    assert _build({"highway": "primary", "junction": "roundabout", "lanes": "2"})[0]["oneway"] is True


def test_build_split_pieces_all_carry_keys():
    r = 60.0
    arc = [(100 + r * math.sin(a), r - r * math.cos(a)) for a in [i * math.pi / 16 for i in range(9)]]
    pts = [(0, 0), (50, 0), (100, 0)] + arc[1:]
    roads = _build({"highway": "tertiary", "lanes": "2", "oneway": "yes"}, pts)
    assert len(roads) >= 2 and all(p["oneway"] is True and p["lanes"] == 2 for p in roads)


def test_build_trail_has_no_keys():
    ways = [Way(5, {"highway": "track", "oneway": "yes", "lanes": "2"}, shapely.LineString([(0, 0), (50, 0)]))]
    roads, _ = R.build(ways, {}, {}, BIG, trail_ids=frozenset({5}))
    assert roads and "oneway" not in roads[0] and "lanes" not in roads[0]
```

- [ ] **Step 2:** run `python -m pytest tests/test_roads.py`; the new build tests fail. (If `test_build_keeps_direction_through_clip` already passes, shapely keeps direction; keep it as a guard. If it fails after Step 3, orient each clipped piece along the original line with `shapely.line_locate_point` and reverse when its start lies farther along than its end.)
- [ ] **Step 3: Implement** in `build` (`pipeline/world_roads.py`). Before the `for part in parts` loop add:

```python
        direction = 0 if trail else oneway_dir(t)
        lanes = None if trail else lane_count(t)
```

and make the `for pts, solid in pieces:` body read:

```python
            for pts, solid in pieces:
                ordered = pts[::-1] if direction < 0 else pts
                roads.append({"id": w.id, "n": t.get("name", ""), "cls": t["highway"], "w": wd,
                              "mark": "centre-solid" if solid else base,
                              "bridge": t.get("bridge", "no") != "no",
                              "layer": int(t.get("layer", "0")) if t.get("layer", "0").lstrip("-").isdigit() else 0,
                              **({"trail": True} if trail else {}),
                              **({"oneway": True} if direction else {}),
                              **({"lanes": lanes} if lanes else {}),
                              "pts": [_r(p) for p in ordered]})
```

- [ ] **Step 4:** `cd pipeline && python -m pytest` passes in full (golden tests skip without the extract). **Step 5:** commit `feat(pipeline): write oneway and lanes per road (#679)`.

### Task 3: Golden assertion, docs, regenerate worlds

- [ ] **Step 1:** in `pipeline/tests/test_golden.py` append (uses the existing `world` fixture, skipped without the extract):

```python
def test_roundabout_has_oneway_and_lanes(world):
    ring = [r for r in world["roads"] if r["id"] == 672824132]
    assert ring and all(r["oneway"] is True and r["lanes"] == 2 for r in ring)
```

- [ ] **Step 2:** `docs/11-pipeline-osm.md`: change the `roads` schema line (line 72) to `[{ id, n, cls, w, mark, bridge, layer, oneway?, lanes?, pts: [[x, z], ...] }]` and add a short section "oneway and lanes (#679)" stating: optional keys; `oneway: true` means `pts` runs in the travel direction (`oneway=-1` reversed at build); implicit one-way for roundabout/circular, motorway, motorway_link, an explicit other value wins; `lanes` is the OSM total (per carriageway on one-way roads), absent when unknown.
- [ ] **Step 3:** if `pipeline/cache/osm/hochrhein.osm.pbf` exists (gitignored; the main checkout's `pipeline/cache/osm/` holds it), regenerate both worlds with the same commands as the last world commit (`pipeline/osm.py` `cmd_build`/`cmd_world`, see `docs/11-pipeline-osm.md`), under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Check `git diff --stat data/` shows only road changes with the new keys and run `cd pipeline && python -m pytest`. If no extract is available, skip and say so in the PR body.
- [ ] **Step 4:** commit `feat(world): regenerate worlds with oneway and lanes (#679)`, or `docs(pipeline): document oneway and lanes (#679)` when the worlds were skipped.
