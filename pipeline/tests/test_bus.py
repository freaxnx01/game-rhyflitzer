"""#682: PostAuto route relations, chained and clipped, with their stops at the kerb."""
import json
from pathlib import Path

import shapely

import anchors
import geo
import osm
import world_bus as wb

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


def test_build_keeps_a_route_that_doubles_back_whole():
    # line 133 runs out and back on the same street: shapely's intersection splits such a line at every overlap
    d = _data([(0, 0), (1000, 0), (500, 0), (500, 300)], [], {})
    (r,), _ = wb.build(d, ROAD, shapely.box(-10, -500, 2000, 500))
    assert r["cut"] == [False, False] and r["len"] == 1800.0


def test_build_drops_stops_far_off_the_line_and_routes_outside():
    d = _data([(0, 0), (1000, 0)], [21], {21: ((500, 40), {"name": "A", "uic_ref": "8500001"})})
    (r,), stats = wb.build(d, ROAD, shapely.box(-10, -500, 2000, 500))
    assert r["stops"] == [] and stats["stop-off-line"] == 1
    out, stats = wb.build(d, ROAD, shapely.box(5000, 5000, 6000, 6000))
    assert out == [] and stats["outside"] == 1


def test_build_drops_stops_beyond_the_map_edge():
    # #767: Ritanne's stop node lies 10.7 m past the east edge and used to snap onto the clipped line's end
    d = _data([(0, 0), (1000, 0)], [21, 22],
              {21: ((790, 3), {"name": "In", "uic_ref": "8500001"}),
               22: ((810, 3), {"name": "Out", "uic_ref": "8500002"})})
    (r,), stats = wb.build(d, ROAD, shapely.box(-10, -50, 800, 50))
    assert r["cut"] == [False, True]
    assert [s["uic"] for s in r["stops"]] == ["8500001"] and stats["stop-outside"] == 1


def test_build_keeps_one_route_per_line_and_in_map_stops():
    # #767: two OSM variants of 143 per direction are the same line inside the map; the lowest id is kept
    routes = [wb.Route(700, {"ref": "143"}, [1], [21], []), wb.Route(701, {"ref": "143"}, [1], [21], []),
              wb.Route(702, {"ref": "133"}, [1], [21], [])]
    d = wb.BusData(routes=routes, way_nodes={1: [0, 1]},
                   node_xy={0: (0, 0), 1: (1000, 0), 21: (200, 0)},
                   node_tags={21: {"name": "A", "uic_ref": "8500001"}})
    out, stats = wb.build(d, ROAD, shapely.box(-10, -500, 2000, 500))
    assert [r["id"] for r in out] == [700, 702] and stats["duplicate-variant"] == 1


def test_build_world_emits_bus_routes_only_with_the_anchors_key(tmp_path):
    spec = tmp_path / "a.json"
    spec.write_text(json.dumps({"bus": {"lines": ["133"]}}))
    bbox = (7.9660, 47.5495, 7.9760, 47.5520)
    w = osm.build_world(FIX, None, bbox, geo.DEFAULT_ORIGIN, 30.0, 1000.0, spec)
    assert [r["id"] for r in w["busRoutes"]] == [700]
    spec.write_text("{}")
    assert "busRoutes" not in osm.build_world(FIX, None, bbox, geo.DEFAULT_ORIGIN, 30.0, 1000.0, spec)
