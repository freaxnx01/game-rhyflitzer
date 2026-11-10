# Bus routes, stops and weekday timetable Implementation Plan (#682)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pipeline writes the chosen PostAuto lines' routes and kerb-side stops into the world file (`busRoutes`, from OSM) and their weekday timetable into `data/timetable_hochrhein.json` (from the Swiss GTFS).

**Architecture:** A new `pipeline/world_bus.py` reads `route=bus` relations in their own pass (the `world_boundaries.py` pattern), chains the member ways into one line, clips it and places the stops; `osm.build_world` adds `busRoutes` when `anchors.json` has a `bus` key. A new standalone `pipeline/timetable.py` streams the GTFS zip and cuts the trips of the world's lines on one reference weekday into a small `MMT1` JSON, linked to the world by UIC numbers.

**Tech Stack:** Python 3, pyosmium, shapely 2, stdlib `csv`/`zipfile`, pytest.

**Spec:** `docs/superpowers/specs/2026-11-05-bus-routes-timetable-design.md`

## Global Constraints

- Pipeline and data only. No game JS changes; `world.js` ignores the new key.
- No new dependencies (`pipeline/requirements.txt` stays as is). GTFS is read with stdlib `csv` + `zipfile`, row by row, never a whole table in memory.
- Any run against the real GTFS zip or the real extract on the agent box: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`. Exit 137 → run that step on odroid-plus-pve; never raise the cap.
- First line: `"bus": {"lines": ["133"]}` in `pipeline/anchors.json`. GTFS agency name: `PostAuto AG`.
- UIC rule: GTFS `ch:1:sloid:<N>` (stop id, or parent `Parentch:1:sloid:<N>`) → UIC string `str(8500000 + N)`.
- Stop kerb offset: `w/2 + 0.5` m right of travel (right normal in game coords = `(-dz, dx)`); stops farther than 30 m from the line are dropped.
- Coordinates rounded to 0.1 m, `rot` to 0.01 rad, `rot = atan2(dz, dx)` (props convention).
- Times: integer seconds after midnight of the service day (`"25:10:00"` → 90600).
- No `bus` key in an anchors file → no `busRoutes` key in its world (Ehrendingen and generated worlds unchanged).
- Attribution text: `opentransportdata.swiss` (terms: https://opentransportdata.swiss/en/terms-of-use/, clause 5.1).
- Sequencing: implement after #679 (`docs/superpowers/plans/2026-11-05-road-oneway-lanes.md`) is merged; both edit `docs/11-pipeline-osm.md` and regenerate `data/world_hochrhein.json`.

## Review Focus

- A closed roundabout way entered and left at intermediate nodes must be ridden in its drawing direction, never backwards (133 passes 4 per direction) → `test_chain_rides_closed_way_in_drawing_direction` (Task 2).
- A route whose clipped part comes back reversed from shapely must still run in travel direction, with `s` growing along it → `test_build_keeps_travel_direction_after_clip` (Task 2).
- A GTFS service removed by `calendar_dates` (holiday) on the reference date must not appear; one added only by `calendar_dates` must → `test_active_services_applies_calendar_dates` (Task 3).
- A same-named line of the same agency elsewhere in Switzerland (Neuchâtel 133) must not leak in → `test_cut_drops_trips_without_two_world_stops` (Task 3).
- Times after midnight (`24:03:00`) must stay > 86400, not wrap → `test_seconds_after_midnight` (Task 3).

---

## File Structure

- Create `pipeline/world_bus.py` - read route relations, chain ways, clip, place stops, build `busRoutes`.
- Create `pipeline/timetable.py` - CLI + functions that cut the GTFS into `MMT1`.
- Modify `pipeline/anchors.py` (add `bus_lines`), `pipeline/anchors.json` (add `bus`), `pipeline/osm.py` (call `world_bus`, emit key).
- Create `pipeline/tests/fixtures/bus.osm`, `pipeline/tests/test_bus.py`, `pipeline/tests/test_timetable.py`, `pipeline/tests/test_bus_golden.py`.
- Modify `docs/11-pipeline-osm.md`, `data/README.md`, `CREDITS.md`.
- Generated: `data/world_hochrhein.json` (rebuild), `data/timetable_hochrhein.json` (new).

---

### Task 1: Read the route relations (`world_bus.read`) and the `bus` anchors key

**Files:**
- Create: `pipeline/world_bus.py`
- Create: `pipeline/tests/fixtures/bus.osm`
- Modify: `pipeline/anchors.py` (after `trail_ids`, ~line 106)
- Test: `pipeline/tests/test_bus.py`

**Interfaces:**
- Produces:
  - `world_bus.Route` dataclass: `id: int, tags: dict, ways: list[int], stops: list[int], platforms: list[int]` (member ids in relation order; `ways` = way members with empty role; `stops` = node members with role in `STOP_ROLES = {"stop", "stop_entry_only", "stop_exit_only"}`; `platforms` = node members with role in `{"platform", "platform_entry_only", "platform_exit_only"}`).
  - `world_bus.BusData` dataclass: `routes: list[Route]` (sorted by id), `way_nodes: dict[int, list[int]]`, `node_xy: dict[int, tuple[float, float]]` (game x, z for every node of a member way and every stop/platform node), `node_tags: dict[int, dict]` (stop/platform nodes).
  - `world_bus.read(path: Path, frame: geo.Frame, lines: list[str]) -> BusData` - relations with `type=route`, `route=bus`, `ref in lines`.
  - `anchors.bus_lines(spec: dict) -> list[str]` - `spec.get("bus", {}).get("lines", [])`.

- [ ] **Step 1: Write the fixture** `pipeline/tests/fixtures/bus.osm` (style of `fixtures/boundaries.osm`): nodes 1-5 on a west-east line from `lat=47.5506 lon=7.9671` in steps of `+0.0013` lon (~100 m); way 11 = nodes 1,2; way 12 = nodes 3,2 (drawn against travel); way 13 = closed roundabout `junction=roundabout` with nodes 3,31,32,4,33,3 (31-33 small offsets around the 3-4 midpoint); way 14 = nodes 4,5; all ways `highway=primary`. Node 21 (`public_transport=stop_position`, `name=Alpha`, `uic_ref=8500001`) at node 1's position ± 0.00002; node 22 (`name=Beta`, no `uic_ref`); node 23 (`public_transport=platform`, `name=Gamma`, `uic_ref=8500002`). Relation 700: `type=route route=bus ref=133 name="Bus 133: A → B" from=A to=B`, members way 11,12,13,14 (role ""), node 21 role `stop`, node 22 role `stop`, node 23 role `platform`. Relation 701: same members, `ref=999`. Relation 702: `type=route route=train ref=133`.

- [ ] **Step 2: Write the failing tests**

```python
from pathlib import Path
import geo, anchors, world_bus as wb

FIX = Path(__file__).parent / "fixtures" / "bus.osm"
FRAME = geo.Frame(*geo.DEFAULT_ORIGIN)

def test_bus_lines_from_anchors():
    assert anchors.bus_lines({"bus": {"lines": ["133"]}}) == ["133"]
    assert anchors.bus_lines({}) == []

def test_read_keeps_bus_routes_of_the_chosen_lines():
    d = wb.read(FIX, FRAME, ["133"])
    assert [r.id for r in d.routes] == [700]
    r = d.routes[0]
    assert r.ways == [11, 12, 13, 14] and r.stops == [21, 22] and r.platforms == [23]
    assert d.way_nodes[13][0] == d.way_nodes[13][-1] == 3
    assert d.node_tags[21]["uic_ref"] == "8500001"
    x, z = d.node_xy[1]
    assert abs(x) < 0.5 and abs(z) < 0.5          # node 1 sits on the origin
```

- [ ] **Step 3: Run** `cd pipeline && python -m pytest tests/test_bus.py -v` - Expected: FAIL (`No module named 'world_bus'`).

- [ ] **Step 4: Implement** `anchors.bus_lines` and `world_bus.read`: a `osmium.FileProcessor(path, osmium.osm.RELATION)` pass collects the routes, then one `FileProcessor(path, NODE | WAY).with_locations()` pass fills `node_tags`/`node_xy` for wanted nodes and `way_nodes`/`node_xy` for wanted ways (skip invalid locations), converting with `frame.to_game(lon, lat)` to plain floats. Module docstring: "#682: PostAuto lines in the world file - route=bus relations of the chosen lines, chained, clipped, with their stops at the kerb. OSM only; the timetable is timetable.py."

- [ ] **Step 5: Run** the same command - Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pipeline/world_bus.py pipeline/anchors.py pipeline/tests/fixtures/bus.osm pipeline/tests/test_bus.py
git commit -m "feat(pipeline): read PostAuto route relations (#682)"
```

---

### Task 2: Chain, clip and place stops (`world_bus.chain`, `world_bus.build`), wire into `osm.build_world`

**Files:**
- Modify: `pipeline/world_bus.py`, `pipeline/osm.py:126` (after props) and the returned dict (~line 175), `pipeline/anchors.json`
- Test: `pipeline/tests/test_bus.py`

**Interfaces:**
- Consumes: `BusData`, `Route`, `anchors.bus_lines` (Task 1).
- Produces:
  - `world_bus.chain(ways: list[int], way_nodes: dict[int, list[int]]) -> list[list[int]]` - node-id runs, one per contiguous piece, in travel order.
  - `world_bus.build(data: BusData, roads: list[dict], clip: shapely.Polygon) -> tuple[list[dict], Counter]` - the `busRoutes` entries (format below) and stats (`gaps`, `outside`, `stop-no-uic`, `stop-off-line`).
  - Entry: `{"id", "line", "name", "from", "to", "pts", "len", "cut": [bool, bool], "stops": [{"uic", "name", "s", "x", "z", "rot"}]}`; `pts` in travel direction; stops sorted by `s`.
  - `osm.build_world(...)` result gains `"busRoutes"` only when `anchors.bus_lines(spec)` is non-empty.

- [ ] **Step 1: Write the failing tests** (game-coordinate dicts, no OSM):

```python
import math, shapely

def test_chain_orients_ways_by_shared_nodes():
    wn = {1: [10, 11], 2: [12, 11], 3: [12, 13]}          # 2 drawn against travel
    assert wb.chain([1, 2, 3], wn) == [[10, 11, 12, 13]]

def test_chain_rides_closed_way_in_drawing_direction():
    wn = {1: [10, 11], 2: [11, 20, 21, 22, 23, 11], 3: [22, 30]}
    assert wb.chain([1, 2, 3], wn) == [[10, 11, 20, 21, 22, 30]]
    wn[2] = [11, 23, 22, 21, 20, 11]                        # drawn the other way round
    assert wb.chain([1, 2, 3], wn) == [[10, 11, 23, 22, 30]]

def test_chain_splits_at_a_way_that_does_not_attach():
    wn = {1: [10, 11], 2: [50, 51], 3: [51, 52]}
    assert wb.chain([1, 2, 3], wn) == [[10, 11], [50, 51, 52]]

def test_chain_skips_ways_missing_from_the_extract():
    assert wb.chain([1, 9, 2], {1: [10, 11], 2: [11, 12]}) == [[10, 11, 12]]

def _data(xy, stops, tags):
    r = wb.Route(700, {"ref": "133", "name": "Bus 133", "from": "A", "to": "B"}, [1], list(stops), [])
    return wb.BusData(routes=[r], way_nodes={1: list(range(len(xy)))},
                      node_xy={**{i: p for i, p in enumerate(xy)}, **{n: tags[n][0] for n in stops}},
                      node_tags={n: tags[n][1] for n in stops})

ROAD = [{"id": 1, "w": 8.0, "pts": [[0, 0], [1000, 0]]}]

def test_build_places_stops_at_the_right_kerb():
    d = _data([(0, 0), (1000, 0)], [21, 22],
              {21: ((200, 0), {"name": "A", "uic_ref": "8500001"}), 22: ((600, 0), {"name": "B"})})
    out, stats = wb.build(d, ROAD, shapely.box(-10, -500, 2000, 500))
    (r,) = out
    assert r["cut"] == [False, False] and r["len"] == 1000.0
    (s,) = r["stops"]                                       # B has no uic_ref
    assert s["uic"] == "8500001" and s["s"] == 200.0
    assert (s["x"], s["z"]) == (200.0, 4.5)                 # heading east: right = +z (south), w/2 + 0.5
    assert s["rot"] == 0.0 and stats["stop-no-uic"] == 1

def test_build_clips_to_the_map_and_flags_the_cut():
    d = _data([(-500, 0), (1000, 0)], [], {})
    (r,), _ = wb.build(d, ROAD, shapely.box(0, -50, 2000, 50))
    assert r["cut"] == [True, False] and r["pts"][0] == [0.0, 0.0]

def test_build_keeps_travel_direction_after_clip():
    d = _data([(1000, 0), (0, 0), (0, 300)], [21],
              {21: ((500, 0), {"name": "A", "uic_ref": "8500001"})})
    (r,), _ = wb.build(d, ROAD, shapely.box(-10, -50, 2000, 50))
    assert r["pts"][0] == [1000.0, 0.0] and r["cut"] == [False, True]
    assert r["stops"][0]["z"] == -4.5 and r["stops"][0]["s"] == 500.0   # heading west: right = -z

def test_build_drops_stops_far_off_the_line_and_routes_outside():
    d = _data([(0, 0), (1000, 0)], [21], {21: ((500, 40), {"name": "A", "uic_ref": "8500001"})})
    (r,), stats = wb.build(d, ROAD, shapely.box(-10, -500, 2000, 500))
    assert r["stops"] == [] and stats["stop-off-line"] == 1
    out, stats = wb.build(d, ROAD, shapely.box(5000, 5000, 6000, 6000))
    assert out == [] and stats["outside"] == 1

def test_build_world_emits_bus_routes_only_with_the_anchors_key(tmp_path):
    import json, osm
    spec = tmp_path / "a.json"; spec.write_text(json.dumps({"bus": {"lines": ["133"]}}))
    bbox = (7.9660, 47.5495, 7.9760, 47.5520)
    w = osm.build_world(FIX, None, bbox, geo.DEFAULT_ORIGIN, 30.0, 1000.0, spec)
    assert [r["id"] for r in w["busRoutes"]] == [700]
    spec.write_text("{}")
    assert "busRoutes" not in osm.build_world(FIX, None, bbox, geo.DEFAULT_ORIGIN, 30.0, 1000.0, spec)
```

- [ ] **Step 2: Run** `cd pipeline && python -m pytest tests/test_bus.py -v` - Expected: the new tests FAIL (`chain`/`build` missing). If `test_build_world_emits...` fails for a reason unrelated to bus (the fixture lacking something `build_world` needs), extend the fixture minimally; do not change `build_world`'s other steps.

- [ ] **Step 3: Implement `world_bus.chain`.** This algorithm is pinned:

```python
def _attach(nxt):
    """Nodes where the next way can be joined: any node of a closed way, else its two ends."""
    if not nxt:
        return set()
    return set(nxt) if nxt[0] == nxt[-1] else {nxt[0], nxt[-1]}

def _oriented(ns, end, nxt):
    """The way's node run starting at `end`, or None when it does not attach there."""
    if ns[0] == ns[-1]:                                     # closed way: ride it in drawing direction
        if end not in ns:
            return None
        ring = ns[:-1]
        i = ring.index(end)
        ring = ring[i:] + ring[:i]
        exits = [k for k, n in enumerate(ring) if k and n in _attach(nxt)]
        return (ring + ring[:1])[:(exits[0] if exits else len(ring)) + 1]
    if ns[0] == end:
        return ns
    if ns[-1] == end:
        return ns[::-1]
    return None

def _start(ns, nxt):
    if ns[0] != ns[-1] and ns[0] in _attach(nxt) and ns[-1] not in _attach(nxt):
        return ns[::-1]
    return ns
```

`chain` iterates the ways present in `way_nodes` (≥ 2 nodes), extends the current run with `run[1:]` when `_oriented` attaches, otherwise closes the run and starts a new one with `_start`.

- [ ] **Step 4: Implement `world_bus.build`.** Per route: lines from `chain` (skip zero length); more than one → `stats["gaps"] += n - 1` and keep the longest; `line.intersection(clip)` → keep the longest `LineString` part (none → `stats["outside"] += 1`, skip); reverse the part if `line.project(start) > line.project(end)`; `cut = [start moved > 0.01 m, end moved > 0.01 m]`. Stops: `route.stops` then `route.platforms` whose `uic_ref` is not yet taken, dedup by `uic_ref`, no `uic_ref` → `stop-no-uic`; `s = part.project(P)`, distance > 30 → `stop-off-line`; heading from `part.interpolate(max(s-1, 0))` to `interpolate(min(s+1, len))`; `w` = width of the nearest road in `roads` (`shapely.STRtree` over `LineString(r["pts"])`); kerb point = on-line point + right normal `(-dz, dx)` × `(w/2 + 0.5)`. Round per Global Constraints; `len` rounded to 0.1; `name`/`from`/`to` from the relation tags (missing → `""`).

- [ ] **Step 5: Wire into `osm.build_world`** after the props line: `lines = anchors_mod.bus_lines(spec)`; when non-empty, `bus_routes, bus_stats = world_bus.build(world_bus.read(Path(pbf), frame, lines), roads, clip)` and log `bus routes {n} {stats}`; add `**({"busRoutes": bus_routes} if lines else {})` at the end of the returned dict. Add `"bus": {"lines": ["133"]}` to `pipeline/anchors.json`.

- [ ] **Step 6: Run** `cd pipeline && python -m pytest -q` - Expected: all PASS (the golden tests skip without the extract; when it is present they must stay green).

- [ ] **Step 7: Commit**

```bash
git add pipeline/world_bus.py pipeline/osm.py pipeline/anchors.json pipeline/tests/test_bus.py pipeline/tests/fixtures/bus.osm
git commit -m "feat(pipeline): bus routes and kerb-side stops in the world file (#682)"
```

---

### Task 3: Cut the weekday timetable from GTFS (`pipeline/timetable.py`)

**Files:**
- Create: `pipeline/timetable.py`
- Test: `pipeline/tests/test_timetable.py`

**Interfaces:**
- Consumes: the world file's `busRoutes` (Task 2 format).
- Produces:
  - `timetable.uic_of(stop_id: str, parent: str = "") -> str | None` (SLOID rule; parent tried first).
  - `timetable.seconds(hms: str) -> int`.
  - `timetable.active_services(gtfs: zipfile.ZipFile, services: set[str], day: datetime.date) -> set[str]` (calendar + calendar_dates: type 1 adds, type 2 removes, else the weekday flag within start/end).
  - `timetable.cut(gtfs_path: Path, routes: list[dict], day: datetime.date, agency: str = "PostAuto AG") -> dict` - the `MMT1` dict of the spec.
  - CLI: `python timetable.py --gtfs ZIP --world WORLD_JSON --date YYYY-MM-DD --out OUT_JSON [--agency "PostAuto AG"]`; exit 2 with a message for a Saturday/Sunday `--date` or a world without `busRoutes`.

- [ ] **Step 1: Write the failing tests.** A helper `_zip(tmp_path)` writes a GTFS zip with `zipfile` from small CSV strings:
  - `agency.txt`: `801,PostAuto AG` and `999,Other AG`.
  - `routes.txt`: `R1` (801, short `133`), `R2` (801, short `133`, the "Neuchâtel" twin), `R3` (999, short `133`).
  - `stops.txt`: parents `Parentch:1:sloid:1`, `Parentch:1:sloid:2`, `Parentch:1:sloid:3`; quays `ch:1:sloid:1:0:11` (parent 1), `ch:1:sloid:2:0:21`, `ch:1:sloid:3:0:31`, `ch:1:sloid:9:0:91` (outside), `ch:1:sloid:77:0:1` (Neuchâtel); names `X, Eins`, `X, Zwei`, `X, Drei`, `Y, Neun`, `N, Sieben`.
  - `calendar.txt` (header `service_id,monday,...,sunday,start_date,end_date`): `TU` = Tuesday only, `WD` = Mon-Fri, `HOL` = Mon-Fri, `FRI` = Friday only, `SAT` = Saturday only; all 20251214-20261212. `calendar_dates.txt`: `HOL,20261110,2` (removed on the test Tuesday), `XTRA,20261110,1` (added only there).
  - `trips.txt` (`route_id,service_id,trip_id,trip_headsign,direction_id`): `t1` R1/TU to Drei dir 0 (calls 9 → 1 → 2 → 3, first call outside), `t2` R1/WD dir 1 (3 → 2 → 1, departs `24:03:00` at 3), `t3` R1/HOL, `t4` R1/XTRA (1 → 2), `t5` R2/WD (77 → 1, only one world stop), `t6` R3/WD (1 → 2, other agency), `t7` R1/FRI, `t8` R1/SAT.
  - `stop_times.txt`, `feed_info.txt` (`feed_version=20261104`, start `20251214`, end `20261212`).
  - World routes: `[{"id": 700, "line": "133", "stops": [{"uic": "8500001"}, {"uic": "8500002"}, {"uic": "8500003"}]}, {"id": 701, "line": "133", "stops": [{"uic": "8500003"}, {"uic": "8500002"}, {"uic": "8500001"}]}]`.

```python
DAY = dt.date(2026, 11, 10)   # a Tuesday

def test_uic_of_uses_the_sloid_number():
    assert timetable.uic_of("ch:1:sloid:72418:0:780957", "Parentch:1:sloid:72418") == "8572418"
    assert timetable.uic_of("ch:1:sloid:583") == "8500583"
    assert timetable.uic_of("8014466") is None

def test_seconds_after_midnight():
    assert timetable.seconds("05:52:00") == 21120 and timetable.seconds("24:03:00") == 86580

def test_active_services_applies_calendar_dates(tmp_path):
    with zipfile.ZipFile(_zip(tmp_path)) as z:
        assert timetable.active_services(z, {"TU", "WD", "HOL", "XTRA", "FRI", "SAT"}, DAY) == {"TU", "WD", "XTRA"}

def test_cut_drops_trips_without_two_world_stops(tmp_path):
    out = timetable.cut(_zip(tmp_path), ROUTES, DAY)
    ids = [(t["route"], [c[0] for c in t["calls"]]) for t in out["trips"]]
    assert ids == [(700, ["8500001", "8500002", "8500003"]), (700, ["8500001", "8500002"]),
                   (701, ["8500003", "8500002", "8500001"])]      # sorted by first departure; t3/t5/t6/t7/t8 gone

def test_cut_marks_trips_beyond_the_map_and_writes_meta(tmp_path):
    out = timetable.cut(_zip(tmp_path), ROUTES, DAY)
    t1 = out["trips"][0]
    assert t1["fromOutside"] is True and t1["toOutside"] is False and t1["line"] == "133" and t1["to"] == "X, Drei"
    assert out["format"] == "MMT1" and out["source"] == "opentransportdata.swiss" and out["day"] == "2026-11-10"
    assert out["feed"]["version"] == "20261104" and out["feed"]["from"] == "2025-12-14"
    assert out["stops"]["8500002"] == "X, Zwei"
    assert out["trips"][-1]["calls"][0][2] == 86580

def test_cli_refuses_a_weekend_date(tmp_path):
    world = tmp_path / "w.json"; world.write_text(json.dumps({"busRoutes": ROUTES}))
    assert timetable.main(["--gtfs", str(_zip(tmp_path)), "--world", str(world), "--date", "2026-11-14",
                           "--out", str(tmp_path / "t.json")]) == 2
```

Choose the `stop_times` departure times so the expected sort order above holds (t1 earliest, t4 next, t2 last at `24:03:00`).

- [ ] **Step 2: Run** `cd pipeline && python -m pytest tests/test_timetable.py -v` - Expected: FAIL (`No module named 'timetable'`).

- [ ] **Step 3: Implement `timetable.py`.** Read every table with a generator over `csv.reader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig"))` and a header → index map (no `DictReader` on `stop_times.txt`; 42 M rows). Order: agency ids → routes (`route_short_name` in the world's lines) → stops (`uic_of` on `parent_station`/`stop_id`; keep a `stop_id → uic` map for every SLOID stop, and `uic → stop_name` for world uics, name of the parent if present) → trips of those routes → `active_services` for `day` → stream `stop_times`, per active trip keep in-map calls `(stop_sequence, uic, arr, dep)` and the min/max `stop_sequence` overall → keep trips with ≥ 2 in-map calls → assign each to the first world route of its line whose stop-uic list contains the call uics as an ordered subsequence (none → drop, count `unmatched`) → `fromOutside = min in-map seq > min seq`, `toOutside = max in-map seq < max seq` → sort by first call's departure. Also compute the trip set for Monday-Friday of `day`'s week from `calendar.txt`/`calendar_dates.txt` (no extra `stop_times` pass) and log each line whose set differs from `day`'s. Log counts to stderr (logging rule: "cutting … from …", then "wrote N trips …"). Module docstring states the memory cap command and the source/terms. `main(argv) -> int` with argparse; `cut` result written compact (`separators=(",", ":")`, `ensure_ascii=False`).

- [ ] **Step 4: Run** `cd pipeline && python -m pytest tests/test_timetable.py -v` - Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/timetable.py pipeline/tests/test_timetable.py
git commit -m "feat(pipeline): weekday timetable cut from the Swiss GTFS (#682)"
```

---

### Task 4: Golden and data tests, docs, attribution

**Files:**
- Create: `pipeline/tests/test_bus_golden.py`
- Modify: `docs/11-pipeline-osm.md` (module list ~line 15-27, schema block ~line 103-125, a new "**Bus routes and timetable (#682).**" rules paragraph after "Farm fields"), `data/README.md` (table), `CREDITS.md`

**Interfaces:**
- Consumes: `osm.build_world` with `busRoutes` (Task 2), `data/timetable_hochrhein.json` (Task 5) when present.

- [ ] **Step 1: Write the tests** (they skip, not fail, without their inputs):

```python
PBF = Path(__file__).parents[1] / "cache" / "osm" / "hochrhein.osm.pbf"
DATA = Path(__file__).parents[2] / "data"

@pytest.fixture(scope="module")
def routes():
    if not PBF.exists():
        pytest.skip("regional extract not present")
    w = osm.build_world(PBF, None, geo.DEFAULT_BBOX, geo.DEFAULT_ORIGIN, 30.0, 1000.0,
                        Path(__file__).parents[1] / "anchors.json")
    return {r["id"]: r for r in w["busRoutes"]}

def test_line_133_routes(routes):
    assert sorted(routes) == [11533940, 11533941]
    for r in routes.values():
        assert r["line"] == "133" and r["cut"] == [False, False] and 7000 < r["len"] < 14000
        assert len(r["stops"]) == 11
    assert routes[11533940]["stops"][0]["uic"] == "8500583" and routes[11533940]["stops"][-1]["uic"] == "8572748"
    assert routes[11533941]["stops"][0]["uic"] == "8572748" and routes[11533941]["stops"][-1]["uic"] == "8500583"

def test_line_133_stops_at_the_right_kerb(routes):
    for r in routes.values():
        line = shapely.LineString(r["pts"])
        for s in r["stops"]:
            p = line.interpolate(s["s"])
            dx, dz = math.cos(s["rot"]), math.sin(s["rot"])
            side = (s["x"] - p.x) * -dz + (s["z"] - p.y) * dx          # > 0: right of travel
            assert side > 0 and 2.0 < math.hypot(s["x"] - p.x, s["z"] - p.y) < 8.0

def test_timetable_matches_the_world():
    tt, wf = DATA / "timetable_hochrhein.json", DATA / "world_hochrhein.json"
    if not tt.exists():
        pytest.skip("timetable not generated yet")
    t, w = json.loads(tt.read_text(encoding="utf-8")), json.loads(wf.read_text(encoding="utf-8"))
    stops = {r["id"]: [s["uic"] for s in r["stops"]] for r in w["busRoutes"]}
    trips = [x for x in t["trips"] if x["line"] == "133"]
    assert len(trips) == 14 and sorted(Counter(x["route"] for x in trips).values()) == [7, 7]
    for x in trips:
        assert len(x["calls"]) == 11 and all(c[0] in stops[x["route"]] for c in x["calls"])
        times = [v for c in x["calls"] for v in c[1:]]
        assert times == sorted(times)
```

(The 14 / 7 / 11 numbers are the measured values for feed 20261104 on 2026-11-10; a later feed may change them - update them with the regenerated file, never loosen to `>= 1`.)

- [ ] **Step 2: Run** `cd pipeline && python -m pytest tests/test_bus_golden.py -v` - Expected: PASS where the extract is present, SKIP otherwise. If `test_line_133_*` fails with the real extract, debug `chain` (most likely a roundabout entry) - do not change the expected values, they are measured.

- [ ] **Step 3: Docs.** `docs/11-pipeline-osm.md`: add `world_bus.py` and `timetable.py` to the module list; add `"busRoutes": [{ id, line, name, from, to, pts, len, cut, stops: [{ uic, name, s, x, z, rot }] }]` to the schema block; the rules paragraph covers: selection by `anchors.json` `bus.lines`, chaining and roundabouts, clip/`cut`, kerb placement (`w/2 + 0.5` m right of travel), the UIC link, the `MMT1` timetable format, the weekday rule (`--date`, calendar + calendar_dates), the hand download from the dataset page into `pipeline/cache/gtfs/`, the 2 GB cap command, and the once-per-timetable-year refresh with the terms' clause 5.2 noted. `data/README.md`: a `timetable_hochrhein.json` row ("Weekday timetable of the PostAuto lines in `busRoutes` (format `MMT1`)", source "Timetable data: opentransportdata.swiss ([terms of use](https://opentransportdata.swiss/en/terms-of-use/)), GTFS feed version in the file"), and "bus routes and stops" in the world row's content list. `CREDITS.md`: `- Fahrplandaten (GTFS) © opentransportdata.swiss (https://opentransportdata.swiss), Nutzungsbedingungen https://opentransportdata.swiss/en/terms-of-use/, Quellenangabe Pflicht`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/tests/test_bus_golden.py docs/11-pipeline-osm.md data/README.md CREDITS.md
git commit -m "docs(pipeline): bus routes, timetable and opentransportdata.swiss credit (#682)"
```

---

### Task 5: Regenerate the data (needs local caches; maintainer if the runner has none)

**Files:**
- Generated: `data/world_hochrhein.json`, `data/timetable_hochrhein.json`

The CI runner has neither `pipeline/cache/osm/hochrhein.osm.pbf`, the swisstopo/LWB caches nor the GTFS zip. If any is missing, skip this task and say so in the PR body (spec A13); the data test then skips.

- [ ] **Step 1: Rebuild the world** (agent box, capped):

```bash
cd pipeline
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build \
    --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json \
    --fields cache/lwb/hochrhein.geojson --dsm-heights cache
```

Expected: log line `bus routes 2 {...}` with no `gaps`/`outside`, and `stop-no-uic`/`stop-off-line` absent or 0.

- [ ] **Step 2: Download the GTFS** by hand from https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020 (the newest `gtfs_fp2026_<date>.zip`, ~290 MB, no key) into `pipeline/cache/gtfs/`.

- [ ] **Step 3: Cut the timetable** (pick a Tuesday outside school holidays and public holidays):

```bash
cd pipeline
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python timetable.py \
    --gtfs cache/gtfs/gtfs_fp2026_<date>.zip --world ../data/world_hochrhein.json \
    --date 2026-11-10 --out ../data/timetable_hochrhein.json
```

Expected: `wrote 14 trips`, no `unmatched`, no Monday-Friday difference for line 133. Exit 137 → run this step on odroid-plus-pve.

- [ ] **Step 4: Run** `cd pipeline && python -m pytest -q` - Expected: all PASS, `test_timetable_matches_the_world` no longer skipped.

- [ ] **Step 5: Commit**

```bash
git add data/world_hochrhein.json data/timetable_hochrhein.json
git commit -m "chore(data): rebuild world with bus line 133, add the weekday timetable (#682)"
```
