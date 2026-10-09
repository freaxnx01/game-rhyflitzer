# Region editor phase 1 (follow-up): the automatic race — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every generated world (`region.build_world`, #166) gets an automatic race: the start, 5 checkpoints and a finish on the road graph, 500–1200 m apart along the route, preferring named places and main roads, 150 m off the frame edge, every leg checked drivable with the game's A\*, named after the nearest place or street, with a par time; when none fits the world stays free driving.

**Architecture:** `pipeline/race.py` picks candidate points (named J-list places, then samples every 400 m along main, then minor roads), asks a 20-line Node bridge (`pipeline/route_matrix.mjs`) to snap them to the game's road graph and measure the A\* route of every pair within 300–1200 m straight-line, then runs a bounded depth-first search for a 6-leg chain. `region.generated` writes it into `anchors` (`start`, `cps`, `finish`) and `region.race` (`par`, `len`) — the shape the game already reads (`L.anchors.cps`, `.finish`, `.start`).

**Tech Stack:** Python 3 + shapely (pytest); Node 20+ running `prototype/route.js` unchanged (no `package.json`).

**Spec:** `docs/superpowers/specs/2026-10-09-region-editor-design.md`, section 4 (Start, Race, Checkpoint names). Split off from #166 (plan `docs/superpowers/plans/2026-10-09-region-editor-phase1.md`) because phase 1 did not fit one issue body.

**A\* decision: share `route.js`, run by Node; no Python port.** The race must be drivable on the graph *the game* builds (`buildGraph`: shared-vertex nodes, `joinTouchingEnds` snapping, largest component only). A port would copy ~150 lines of that logic and drift; the bridge imports `route.js` as it is and answered 650 pairs in 0.7 s on the 2,616-road Hochrhein world (measured 2026-10-09). Cost: Node 20+ on the build host (already needed for `node --test`; the phase 3 container gets it).

## Global Constraints

- #166 is merged (`pipeline/region.py`, `places.py` with `start_point`, `named_places`, `MAJOR`; `tests/synth_osm.py`).
- TDD per task; never weaken an existing assertion. Tests: `cd pipeline && ./.venv/bin/python -m pytest -q`; `node --test prototype/tests/*.test.mjs` stays green; `prototype/route.js` is imported, never changed or copied.
- Anything touching the Swiss extract runs under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`; exit 137 = stop and report.
- No new packages; Conventional Commits with explicit paths. No CHANGELOG entry (the game does not load generated worlds before phase 2).
- Constants live in `race.py` only: `LEG_MIN/LEG_MAX` 500/1200, `EDGE` 150, `SAMPLE` 400, `MIN_GAP` 300, `MAX_CANDIDATES` 60, `PAR_KMH` 45 (open point: tune on 2–3 test worlds).

## Review Focus

- **No main road or too few legs:** `None`, the world builds for free driving (`test_build_without_a_major_road_is_free_driving`, #166's `test_empty_frame_still_builds_for_free_driving`).
- **Node missing:** a clear `RuntimeError`, not a silent race-less world (`test_route_lengths_without_node_says_why`).
- **Repeated or missing names:** "Checkpoint k", never two equal names (`test_names_fall_back_and_never_repeat`).
- **The start faces away from the first checkpoint:** turned round (`test_facing_turns_towards_the_first_checkpoint`).
- **Legs drivable in the game:** re-measured on real data (`test_race_legs_are_drivable_and_in_range`).

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1:** `git fetch origin && git checkout -b feature/<issue>-auto-race origin/main && test -f pipeline/region.py && node --version` (v20+). Stop if `region.py` is missing (#166 not merged).

---

### Task 1: The bridge and `race.py`

**Files:**
- Create: `pipeline/route_matrix.mjs`, `pipeline/race.py`
- Test: `pipeline/tests/test_race.py`

**Interfaces:**
- Consumes: `places.start_point`, `places.named_places`, `places.MAJOR`; world roads `{cls, n, bridge, pts}`; the J list `[{n, kind, x, z}]`.
- Produces: `race.build(roads, named_nodes, areas, clip, jl) -> {"start": [x, z, th], "cps": [{n, x, z}] * 5, "finish": {n, x, z}, "par": int, "len": float} | None`; `race.route_lengths(roads, points, pairs) -> (snaps, {(i, j): m})`; `race.chain`, `race.candidates`, `race.checkpoint_name`, `race.names`, `race.facing`, `race.par_seconds`, `race.leg`.

- [ ] **Step 1: Write the failing tests** — `pipeline/tests/test_race.py`:

```python
"""The automatic race -- leg search, candidates, names, par time, and the bridge to the game's A*."""
import math
import shutil

import pytest
import shapely

import race as R
from osm_read import NamedNode

needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node (20+) not on PATH")
CLIP = shapely.box(-1000, -1000, 1000, 1000)


def line_lens(n, step):
    """n points on a line `step` metres apart, every pair routed along the line."""
    return [(i * step, 0.0) for i in range(n)], {(i, j): (j - i) * step for i in range(n) for j in range(i + 1, n)}


def test_par_seconds():
    assert R.par_seconds(5000) == 400 and R.par_seconds(5001) == 401          # 45 km/h = 12.5 m/s


def test_chain_takes_legs_within_range():
    pos, lens = line_lens(7, 600.0)
    assert R.chain(lens, [0] * 7, pos) == [0, 1, 2, 3, 4, 5, 6]


def test_chain_prefers_higher_scores():
    pos, lens = line_lens(13, 300.0)               # legs of 600 or 900 m are possible, 300 is too short
    scores = [0] * 13
    scores[3] = 3                                  # 900 m from the start
    path = R.chain(lens, scores, pos)
    assert path[:2] == [0, 3] and len(path) == 7
    assert all(R.LEG_MIN <= R.leg(lens, a, b) <= R.LEG_MAX for a, b in zip(path, path[1:]))


def test_chain_none_when_no_leg_fits_or_points_crowd():
    pos, lens = line_lens(7, 200.0)
    assert R.chain({k: v for k, v in lens.items() if v < R.LEG_MIN}, [0] * 7, pos) is None
    crowd = [(0.0, 0.0), (600.0, 0.0), (100.0, 0.0)]   # 2 is 600 m by road from 1 but 100 m from the start
    assert R.chain({(0, 1): 600.0, (1, 2): 600.0}, [0, 0, 0], crowd, legs=2) is None


def test_candidates_named_first_inside_the_margin_and_capped():
    roads = [{"cls": "secondary", "pts": [[-1000, 0], [1000, 0]]}, {"cls": "service", "pts": [[0, -1000], [0, 1000]]}]
    out = R.candidates(roads, [(500, 500, "Kirche"), (950, 0, "Am Rand")], CLIP)
    assert out[0] == {"x": 500, "z": 500, "name": "Kirche", "major": False}
    assert all(abs(p["x"]) <= 850 and abs(p["z"]) <= 850 for p in out)        # 150 m off the frame edge
    assert {p["x"] for p in out[1:]} == {-800.0, -400.0, 0.0, 400.0, 800.0} and all(p["major"] for p in out[1:])
    many = [{"cls": "residential", "pts": [[-800, z], [800, z]]} for z in range(-800, 801, 20)]
    assert len(R.candidates(many, [], CLIP)) == R.MAX_CANDIDATES


def test_checkpoint_name_place_then_street_then_none():
    nodes = [NamedNode(1, {"amenity": "school", "name": "Schulhaus"}, 100.0, 0.0),
             NamedNode(2, {"railway": "station", "name": "Bahnhof"}, 0.0, 400.0)]
    roads = [{"n": "Dorfstrasse", "pts": [[-500, 600], [500, 600]]}, {"n": "", "pts": [[-500, 800], [500, 800]]}]
    assert R.checkpoint_name(0, 0, nodes, [], roads, CLIP) == "Schulhaus"
    assert R.checkpoint_name(0, 380, nodes, [], roads, CLIP) == "Bahnhof"
    assert R.checkpoint_name(0, 620, nodes, [], roads, CLIP) == "Dorfstrasse"
    assert R.checkpoint_name(0, 800, nodes, [], roads, CLIP) is None


def test_names_fall_back_and_never_repeat():
    picked = [{"name": "Kirche"}, {"name": None}, {"name": "Kirche"}, {"name": None}]
    pos = [(0, 0), (0, 0), (0, 500), (0, 0), (0, -900)]
    roads = [{"n": "Dorfstrasse", "pts": [[-900, 500], [900, 500]]}]
    assert R.names([0, 1, 2, 3, 4], picked, pos, [], [], roads, CLIP) == ["Kirche", "Dorfstrasse", "Checkpoint 3", "Checkpoint 4"]


def test_facing_turns_towards_the_first_checkpoint():
    assert R.facing(0.0, (0, 0), (100, 0)) == 0.0
    assert abs(R.facing(0.0, (0, 0), (-100, 0))) == pytest.approx(math.pi)


def test_build_without_a_major_road_is_free_driving():
    assert R.build([{"cls": "residential", "n": "", "bridge": False, "pts": [[-900, 0], [900, 0]]}], [], [], CLIP, []) is None


def test_route_lengths_without_node_says_why(monkeypatch):
    monkeypatch.setattr(R.shutil, "which", lambda name: None)
    with pytest.raises(RuntimeError, match="Node"):
        R.route_lengths([], [], [])


@needs_node
def test_route_lengths_uses_the_game_graph():
    roads = [{"cls": "residential", "n": "", "bridge": False, "pts": [[0, 0], [1000, 0]]},
             {"cls": "residential", "n": "", "bridge": False, "pts": [[1000, 0], [1000, 800]]}]
    snaps, lens = R.route_lengths(roads, [(0, 5), (1005, 800), (5000, 5000)], [(0, 1), (0, 2)])
    assert snaps[0] == {"x": 0, "z": 0, "d": 5} and snaps[2] is None
    assert lens == {(0, 1): pytest.approx(1800, abs=0.2)}
```

- [ ] **Step 2: Run** `./.venv/bin/python -m pytest -q tests/test_race.py` — Expected: FAIL (`No module named 'race'`).

- [ ] **Step 3: The bridge** — `pipeline/route_matrix.mjs`:

```js
#!/usr/bin/env node
// #166: the pipeline's bridge to the game's own A* (prototype/route.js), so "drivable" means drivable on the game's
// road graph: one A*, no Python port. Pure stdin -> stdout, no files.
// stdin:  {"roads": [world roads], "points": [[x, z], ...], "pairs": [[i, j], ...], "maxSnap": 60}
// stdout: {"snap": [{"x", "z", "d"} | null per point], "len": [route metres | null per pair]}
import { buildGraph, snapToGraph, findRoute } from '../prototype/route.js';

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const req = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const g = buildGraph(req.roads);
const snaps = req.points.map(([x, z]) => snapToGraph(g, x, z, req.maxSnap ?? 60));
const len = req.pairs.map(([i, j]) => {
  if (!snaps[i] || !snaps[j]) return null;
  const r = findRoute(g, snaps[i], [snaps[j]]);
  return r ? Math.round(r.len * 10) / 10 : null;
});
const r1 = (v) => Math.round(v * 10) / 10;
process.stdout.write(JSON.stringify({ snap: snaps.map((s) => (s ? { x: r1(s.x), z: r1(s.z), d: r1(s.d) } : null)), len }));
```

- [ ] **Step 4: Implement** — `pipeline/race.py`:

```python
"""Automatic race of a generated world: the start, five checkpoints and a finish on the road graph, with a par time.
Every leg is measured with the game's own A* (prototype/route.js, through route_matrix.mjs and Node), so a race the
pipeline accepts is drivable on the graph the game builds from the same roads."""
from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import shapely

import places

SAMPLED = places.MAJOR | {"unclassified", "residential"}
N_CPS = 5
LEG_MIN, LEG_MAX = 500.0, 1200.0   # m along the route
EDGE = 150.0           # m: race points keep this far from the frame edge
SAMPLE = 400.0         # m between candidate points along a road
MIN_GAP = 300.0        # m straight-line between any two race points
MAX_CANDIDATES = 60
MAX_EXPANSIONS = 20_000
PAR_KMH = 45.0         # open point in the spec: tune on two or three test worlds
MAX_SNAP = 60.0        # m: a candidate farther from the main road network is dropped
CP_KINDS = {"station", "place_of_worship", "school", "square"}
CP_RADIUS, STREET_RADIUS = 150.0, 30.0
BRIDGE = Path(__file__).with_name("route_matrix.mjs")


def candidates(roads, named, clip) -> list[dict]:
    """Race points inside the frame shrunk by EDGE: named places first, then every SAMPLE m along major, then minor
    roads; nearest the centre first within each group; at most MAX_CANDIDATES. -> [{x, z, name, major}]"""
    inner, c = clip.buffer(-EDGE, join_style="mitre"), clip.centroid
    out = sorted(({"x": x, "z": z, "name": n, "major": False} for x, z, n in named if inner.covers(shapely.Point(x, z))),
                 key=lambda p: (math.hypot(p["x"] - c.x, p["z"] - c.y), p["name"]))
    sampled = []
    for r in roads:
        if r["cls"] in SAMPLED and len(r["pts"]) > 1:
            line, s = shapely.LineString(r["pts"]), SAMPLE / 2
            while s < line.length:
                p = line.interpolate(s)
                if inner.covers(p):
                    sampled.append({"x": round(p.x, 1), "z": round(p.y, 1), "name": None, "major": r["cls"] in places.MAJOR})
                s += SAMPLE
    sampled.sort(key=lambda p: (not p["major"], math.hypot(p["x"] - c.x, p["z"] - c.y), p["x"], p["z"]))
    return (out + sampled)[:MAX_CANDIDATES]


def route_lengths(roads, points, pairs, max_snap: float = MAX_SNAP):
    """Snap points to the game's main road network and measure each pair's A* route.
    -> (snaps: [{x, z, d} | None], lens: {(i, j): metres}); pairs without a route are left out."""
    node = shutil.which("node")
    if not node:
        raise RuntimeError("the race needs Node 20+ on PATH: it measures legs with the game's A* (prototype/route.js)")
    req = json.dumps({"roads": roads, "points": [list(p) for p in points], "pairs": [list(p) for p in pairs], "maxSnap": max_snap})
    res = subprocess.run([node, str(BRIDGE)], input=req, capture_output=True, text=True, timeout=600)
    if res.returncode != 0:
        raise RuntimeError(f"route_matrix.mjs failed: {res.stderr.strip()[:500]}")
    out = json.loads(res.stdout)
    return out["snap"], {tuple(p): v for p, v in zip(pairs, out["len"]) if v is not None}


def leg(lens, i, j):
    return lens.get((i, j), lens.get((j, i)))


def chain(lens, scores, pos, legs: int = N_CPS + 1):
    """Depth-first search for a path 0 -> ... of `legs` legs, every leg's route within LEG_MIN..LEG_MAX, no point within
    MIN_GAP (straight) of an earlier one; higher scores first, then lower index. -> indices or None."""
    n = len(pos)
    nbrs = {i: sorted((j for j in range(n) if j != i and (v := leg(lens, i, j)) is not None and LEG_MIN <= v <= LEG_MAX),
                      key=lambda j: (-scores[j], j)) for i in range(n)}
    path, budget = [0], [MAX_EXPANSIONS]

    def dfs() -> bool:
        if len(path) == legs + 1:
            return True
        for j in nbrs[path[-1]]:
            budget[0] -= 1
            if budget[0] < 0:
                return False
            if j in path or any(math.dist(pos[j], pos[k]) < MIN_GAP for k in path):
                continue
            path.append(j)
            if dfs():
                return True
            path.pop()
        return False

    return list(path) if dfs() else None


def par_seconds(length_m: float, kmh: float = PAR_KMH) -> int:
    return math.ceil(length_m / (kmh / 3.6))


def checkpoint_name(x, z, named_nodes, areas, roads, clip) -> str | None:
    """The nearest station, church, school or square within CP_RADIUS, else the nearest named street within
    STREET_RADIUS, else None."""
    near = [(math.hypot(px - x, pz - z), name) for _, name, px, pz in places.named_places(named_nodes, areas, clip, CP_KINDS)]
    near = [h for h in near if h[0] <= CP_RADIUS]
    if not near:
        p = shapely.Point(x, z)
        near = [(shapely.LineString(r["pts"]).distance(p), r["n"]) for r in roads if r.get("n") and len(r["pts"]) > 1]
        near = [h for h in near if h[0] <= STREET_RADIUS]
    return min(near)[1] if near else None


def names(path, picked, pos, named_nodes, areas, roads, clip) -> list[str]:
    """A candidate's own name, else checkpoint_name, else "Checkpoint k"; never the same name twice."""
    out = []
    for k, (idx, c) in enumerate(zip(path[1:], picked), start=1):
        n = c["name"] or checkpoint_name(*pos[idx], named_nodes, areas, roads, clip)
        out.append(n if n and n not in out else f"Checkpoint {k}")
    return out


def facing(th, start, first) -> float:
    """The road heading at the start, turned round when it points away from the first checkpoint."""
    if math.cos(th) * (first[0] - start[0]) + math.sin(th) * (first[1] - start[1]) < 0:
        return math.atan2(-math.sin(th), -math.cos(th))
    return th


def build(roads, named_nodes, areas, clip, jl):
    """The race, or None (no start, no fitting chain: the world stays free driving).
    -> {start: [x, z, th], cps: [{n, x, z}] * 5, finish: {n, x, z}, par: s, len: m}"""
    st = places.start_point(roads, clip)
    if st is None:
        return None
    cands = candidates(roads, [(e["x"], e["z"], e["n"]) for e in jl if e["kind"] != "village"], clip)
    points = [(st[0], st[1])] + [(p["x"], p["z"]) for p in cands]
    pairs = [(i, j) for i in range(len(points)) for j in range(i + 1, len(points)) if MIN_GAP <= math.dist(points[i], points[j]) <= LEG_MAX]
    snaps, lens = route_lengths(roads, points, pairs)
    ok = [i for i, s in enumerate(snaps) if s is not None]
    if not ok or ok[0] != 0:
        return None
    remap = {old: new for new, old in enumerate(ok)}
    pos = [(snaps[i]["x"], snaps[i]["z"]) for i in ok]
    scores = [0] + [2 * bool(cands[i - 1]["name"]) + cands[i - 1]["major"] for i in ok[1:]]
    sub = {(remap[i], remap[j]): v for (i, j), v in lens.items() if i in remap and j in remap}
    path = chain(sub, scores, pos)
    if path is None:
        return None
    total = sum(leg(sub, a, b) for a, b in zip(path, path[1:]))
    nm = names(path, [cands[ok[i] - 1] for i in path[1:]], pos, named_nodes, areas, roads, clip)
    pts = [{"n": nm[k], "x": pos[i][0], "z": pos[i][1]} for k, i in enumerate(path[1:])]
    return {"start": [pos[0][0], pos[0][1], round(facing(st[2], pos[0], pos[path[1]]), 5)], "cps": pts[:N_CPS],
            "finish": pts[N_CPS], "par": par_seconds(total), "len": round(total, 1)}
```

- [ ] **Step 5: Run** — Expected: 11 passed; `node --test prototype/tests/*.test.mjs` green.

- [ ] **Step 6: Commit** — `git add pipeline/route_matrix.mjs pipeline/race.py pipeline/tests/test_race.py && git commit -m "feat(pipeline): automatic race measured with the game's A*"`

---

### Task 2: The race in every generated world

**Files:**
- Modify: `pipeline/region.py` (`generated`), `pipeline/tests/test_region.py`, `docs/11-pipeline-osm.md`
- Create: `pipeline/tests/test_region_real.py`

- [ ] **Step 1: Tests** — in `pipeline/tests/test_region.py`: add `import math` and `import shutil`; first lines of the `built` fixture:

```python
    if shutil.which("node") is None:
        pytest.skip("node (20+) not on PATH: the race measures legs with the game's A*")
```

In `test_name_villages_jlist_start` the last line becomes `assert r["forestAbove"] is None`; in `test_meta` move `meta["race"]` from `is False` to `is True`. New test:

```python
def test_race_in_the_world_file(built):
    _, world, _, _ = built
    a, race = world["anchors"], world["region"]["race"]
    pts = [a["start"][:2]] + [[c["x"], c["z"]] for c in a["cps"] + [a["finish"]]]
    assert len(a["cps"]) == 5 and len({c["n"] for c in a["cps"] + [a["finish"]]}) == 6
    x0, x1, z0, z1 = world["region"]["treeBox"]
    assert all(x0 + 149 <= x <= x1 - 149 and z0 + 149 <= z <= z1 - 149 for x, z in pts[1:])     # 150 m off the edge
    assert all(math.dist(p, q) >= 300 for i, p in enumerate(pts) for q in pts[i + 1:])
    assert 2500 <= race["len"] <= 7200 and race["par"] == math.ceil(race["len"] / 12.5)
```

`pipeline/tests/test_region_real.py` (skips without the cached Ehrendingen extract or Node):

```python
"""build_world on real OSM -- the cached Ehrendingen extract (#127, 1.9 MB, not committed). Terrain is faked flat,
nothing is downloaded; skipped where the extract or Node is missing (CI)."""
import json
import shutil
from pathlib import Path

import pytest
import shapely

import race
import region
from tests.test_region import flat_terrain

PBF = Path(__file__).parents[1] / "cache" / "osm" / "ehrendingen.osm.pbf"
RECT = (2666500.0, 1257750.0, 2670000.0, 1261750.0)     # 3.5 x 4 km: Ehrendingen, the Lägern slope in the south
pytestmark = [pytest.mark.skipif(not PBF.exists(), reason="cache/osm/ehrendingen.osm.pbf not present"),
              pytest.mark.skipif(shutil.which("node") is None, reason="node (20+) not on PATH")]


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    mp.setattr(region.terrain, "build", flat_terrain)
    files = region.build_world(RECT, tmp_path_factory.mktemp("real"), pbf=PBF, dsm=False)
    mp.undo()
    return json.loads(files["world"].read_text("utf-8"))


def test_name_and_places(world):
    r = world["region"]
    assert r["name"] == "Ehrendingen" and any(v["t"] == "EHRENDINGEN" for v in r["villages"])
    assert {"Ehrendingen", "Kath. Kirche", "Reformierte Kirche Ehrendingen"} <= {e["n"] for e in r["jlist"]}


def test_race_legs_are_drivable_and_in_range(world):
    a = world["anchors"]
    pts = [tuple(a["start"][:2])] + [(c["x"], c["z"]) for c in a["cps"] + [a["finish"]]]
    _, lens = race.route_lengths(world["roads"], pts, list(zip(range(6), range(1, 7))))
    assert len(a["cps"]) == 5 and len(lens) == 6
    assert all(race.LEG_MIN <= v <= race.LEG_MAX for v in lens.values())


def test_forests_match_the_smart_cut(world):
    area = sum(shapely.Polygon(f["ring"]).area for f in world["forests"])
    assert 30 <= len(world["forests"]) <= 60 and 4.0e6 <= area <= 6.0e6       # 44 parts, 4.97 km2 on 2026-10-09
```

- [ ] **Step 2: Run** — Expected: `test_race_in_the_world_file` and `test_race_legs_are_drivable_and_in_range` FAIL (`cps` empty).

- [ ] **Step 3: Implement** — `pipeline/region.py`: `import race`; in `generated`, after `start = …`/`world["anchors"] = …`:

```python
    rc = race.build(world["roads"], data.named_nodes, data.areas, clip, jl)
    if rc:
        world["anchors"].update(start=rc["start"], cps=rc["cps"], finish=rc["finish"])
```

and `"race": {"par": rc["par"], "len": rc["len"]} if rc else None` in the `region` block; the final log line reports `race yes/no`.

- [ ] **Step 4: Run** the whole suite — Expected: all pass.

- [ ] **Step 5: Docs** — `docs/11-pipeline-osm.md`, the #166 section: the race rules and constants (above), the A\* decision, "Node 20+ needed", remove "no race until the follow-up".

- [ ] **Step 6: Commit** — `git add pipeline/region.py pipeline/tests/test_region.py pipeline/tests/test_region_real.py docs/11-pipeline-osm.md && git commit -m "feat(pipeline): generated worlds get an automatic race"`

---

### Task 3: Real check (guarded), PR

- [ ] **Step 1:** `git push -u origin HEAD`. If the Swiss extract, osmium-tool and `systemd-run --user` are present, build `--lv95 2666500 1257750 2670000 1261750` exactly as in #166's Task 6 and print `w['anchors']['start']`, the checkpoint names, `w['region']['race']`. Prototype result 2026-10-09: 5.1 km, par 409 s, Schulhaus Brüel · Kapelle · Freienwilerstrasse · Kantonsstrasse · Checkpoint 5 · Badenerstrasse. Else say why in the PR.
- [ ] **Step 2:** Full suite + `node --test prototype/tests/*.test.mjs`; PR with the numbers, the A\* decision and "no CHANGELOG entry".
