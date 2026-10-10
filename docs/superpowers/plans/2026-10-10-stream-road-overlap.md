# Streams cut where they touch a road (#229) — implementation plan

**Goal:** no stream ribbon lies on a carriageway; the canal beside the Hauptstrasse stops showing as water on the road.
**Spec:** `docs/superpowers/specs/2026-10-10-stream-road-overlap-design.md`.
**LOCAL ONLY for Tasks 3 and 4:** they need the main checkout's `pipeline/cache/` (OSM cut, swisstopo tiles) to rebuild `data/world_hochrhein.json`; the `ai-implement` runner has no caches. Tasks 1 and 2 are pure Python and could run anywhere, but ship as one PR with the rebuilt world: do not add `ai-implement`. Coordinate with #47 (it also rebuilds this file): rebase on its merge and rebuild after it.

## Global constraints

- Memory: world builds and the golden tests run as `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`. Exit 137: stop and report.
- Never hand-edit `data/world_hochrhein.json`; rebuild it with `osm.py build`. Never run `osm.py cut` / `osmium extract`.
- Worktree: `ln -s /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/cache pipeline/cache` and the same for `pipeline/.venv`; run Python as `./.venv/bin/python` from `pipeline/`.
- Branch `fix/229-stream-road-overlap`; PR title `fix(world): cut streams where they would lie on a road (#229)`, body `Closes #229`.
- No change to `prototype/` is needed. Never loosen an existing assertion.

### Task 1: Failing unit tests

**Files:** modify `pipeline/tests/test_water.py` (append).

- [ ] **Step 1:** append (the file already imports `shapely`, `Wt`, `Way`, `CLIP = shapely.box(0, 0, 400, 400)`):

```python
ROAD = shapely.LineString([(0, 100), (400, 100)])


def _road(cls="primary", bridge=False, w=9.0):
    return {"pts": [list(c) for c in ROAD.coords], "w": w, "cls": cls, "bridge": bridge}


def test_canal_beside_a_road_is_cut_away_where_its_ribbon_would_touch_the_road():
    """#229: an untagged canal is 10 m wide; 6 m from a 9 m road its ribbon lay on the carriageway."""
    canal = Way(7, {"waterway": "canal"}, shapely.LineString([(0, 106), (400, 106)]))
    assert Wt.streams([], [canal], CLIP, roads=[_road()]) == []
    assert len(Wt.streams([], [canal], CLIP)) == 1                         # no roads given: unchanged


def test_canal_crossing_a_road_is_cut_at_the_crossing_only():
    canal = Way(8, {"waterway": "canal"}, shapely.LineString([(200, 0), (200, 400)]))
    st = Wt.streams([], [canal], CLIP, roads=[_road()])
    assert len(st) == 2
    for s in st:
        assert all(abs(z - 100) >= 4.5 + 5.0 - 1e-6 for _, z in s["pts"])


def test_bridges_and_footpaths_do_not_cut_a_stream():
    canal = Way(9, {"waterway": "canal"}, shapely.LineString([(0, 106), (400, 106)]))
    for road in (_road(bridge=True), _road(cls="footway", w=2.0), _road(cls="path", w=1.0)):
        assert len(Wt.streams([], [canal], CLIP, roads=[road])) == 1
```

- [ ] **Step 2:** run, expect FAIL (`streams()` has no `roads` argument: `TypeError`):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_water.py -q
```

### Task 2: Cut the streams

**Files:** modify `pipeline/world_water.py`, `pipeline/osm.py`.

- [ ] **Step 1:** in `pipeline/world_water.py` add above `def streams(`:

```python
NOT_A_CARRIAGEWAY = ("footway", "path", "steps", "cycleway")


def _cut_from_roads(line, width, roads):
    """The line without the parts where a ribbon of `width` would touch a road (road half width + ribbon half width from
    the road's centre line). Bridges and footpaths do not count: the water runs under the first, beside the second."""
    near = [shapely.LineString(r["pts"]).buffer(r["w"] / 2 + width / 2) for r in roads
            if not r["bridge"] and r["cls"] not in NOT_A_CARRIAGEWAY and len(r["pts"]) > 1]
    near = [b for b in near if b.intersects(line)]
    return line.difference(shapely.unary_union(near)) if near else line
```

- [ ] **Step 2:** change the signature `def streams(areas, ways, clip):` to `def streams(areas, ways, clip, roads=()):` and extend its docstring by one sentence: `Where a ribbon of its width would touch a road (roads: world road dicts), the line is cut away.` In the body, after the line `line = w.line.intersection(clip)` and the `if covered is not None:` block (before `parts = ...`), add:

```python
        if roads:
            line = _cut_from_roads(line, _width(w.tags, kind), roads)
```

- [ ] **Step 3:** in `pipeline/osm.py` find `"streams": world_water.streams(data.ways` — the exact text is `"streams": world_water.streams(data.areas, data.ways, clip),` — and change it to `"streams": world_water.streams(data.areas, data.ways, clip, roads),`. (`roads` is the final road list defined earlier in `build_world`; if the name differs at that point, use the variable that feeds `"roads": roads,` two lines above.)

- [ ] **Step 4:** run the pipeline tests that do not need the cache; expect PASS: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_water.py tests/test_anchors.py -q`.

### Task 3: Golden test and the rebuilt world (local only)

**Files:** modify `pipeline/tests/test_golden.py`; regenerate `data/world_hochrhein.json`.

- [ ] **Step 1:** append to `pipeline/tests/test_golden.py` (it has the `world` fixture, `shapely`; add `import shapely` if missing):

```python
def test_issue229_no_stream_ribbon_lies_on_a_road(world):
    """#229: the canal beside the Hauptstrasse was a 10 m ribbon over the carriageway edge."""
    flat = ("footway", "path", "steps", "cycleway")
    roads = [(shapely.LineString(r["pts"]), r["w"]) for r in world["roads"] if not r["bridge"] and r["cls"] not in flat and len(r["pts"]) > 1]
    for s in world["streams"]:
        ribbon = shapely.LineString(s["pts"]).buffer(s["w"] / 2, cap_style="flat")
        for line, w in roads:
            assert ribbon.intersection(line.buffer(w / 2)).area <= 1.0, (s["name"], s["w"])
```

- [ ] **Step 2:** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -k "issue229 or sissle"` : PASS (the Sissle test still sees > 3000 m of stream: if it fails, the cut removed too much: report the lengths, do not edit the test).

- [ ] **Step 3: rebuild the world** with the exact `osm.py build` command used for the committed file (docs/11-pipeline-osm.md, the build block; arguments `--pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --anchors anchors.json --dsm-heights cache`), capped as above. Then check the diff is limited to `streams`:

```bash
git diff --stat -- ../data/world_hochrhein.json
python3 - <<'PY'
import json, subprocess
old = json.loads(subprocess.check_output(['git', 'show', 'HEAD:data/world_hochrhein.json']))
new = json.load(open('../data/world_hochrhein.json'))
print('keys changed:', [k for k in new if new[k] != old[k]])
print('streams', len(old['streams']), '->', len(new['streams']))
PY
```

Expected: `keys changed: ['streams']` and slightly more or fewer streams (pieces). Any other key changed: STOP and report (the rebuild is not reproducing the committed file; do not commit it).

### Task 4: Verify in the game, changelog

- [ ] **Step 1:** `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_underwater.py prototype/tests/test_smoke.py -q` (foreground, `timeout` 600 s): pass. (Streams feed `streamH`/`streamNameAt`; nothing else reads them.)
- [ ] **Step 2 (manual, once):** serve, press **F3**, jump to the Hauptstrasse near x 248, z 1280 (`__mm.sim(248.5, 1280.5, 1.82, 0, 0)` in the console) and look south: no water on the road or verge.
- [ ] **Step 3:** `CHANGELOG.md` `[Unreleased]` → `### Fixed`: `- No more water on the Hauptstrasse: brooks and canals that ran beside a road were drawn as wide as a river and lay over the road edge. They now stop where they would touch a road.`
- [ ] **Step 4:** `git diff --stat` lists `pipeline/world_water.py`, `pipeline/osm.py`, `pipeline/tests/test_water.py`, `pipeline/tests/test_golden.py`, `data/world_hochrhein.json`, `CHANGELOG.md`. Commit, push, open the PR.
