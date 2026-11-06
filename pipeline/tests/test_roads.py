import math

import pytest
import shapely

import world_roads as R
from osm_read import Way


@pytest.mark.parametrize("tags,ok", [
    ({"highway": "tertiary"}, True),
    ({"highway": "residential"}, True),
    ({"highway": "service"}, True),
    ({"highway": "service", "service": "driveway"}, False),
    ({"highway": "service", "service": "parking_aisle"}, False),
    ({"highway": "track"}, False),
    ({"highway": "footway"}, False),
    ({"highway": "footway", "bridge": "yes"}, True),
    ({"highway": "pedestrian", "bridge": "covered"}, True),   # the Holzbruecke
    ({"highway": "path", "bridge": "no"}, False),
    ({"highway": "primary", "tunnel": "yes"}, False),
    ({"highway": "proposed"}, False),
])
def test_keep(tags, ok):
    assert R.keep(tags) is ok


def test_width_tag_and_defaults():
    assert R.width({"highway": "tertiary", "width": "7.5"}) == 7.5
    assert R.width({"highway": "tertiary", "width": "7,5 m"}) == 7.5
    assert R.width({"highway": "motorway"}) == 14
    assert R.width({"highway": "residential"}) == 5.5
    assert R.width({"highway": "footway", "bridge": "yes"}) == 3
    assert R.width({"highway": "tertiary", "width": "banana"}) == 7


@pytest.mark.parametrize("tags,mark", [
    ({"highway": "tertiary", "cycleway": "lane", "lane_markings": "no"}, "cycle"),
    ({"highway": "tertiary", "cycleway:both": "lane", "lane_markings": "no"}, "cycle"),
    ({"highway": "tertiary", "cycleway:right": "lane", "lanes": "2"}, "cycle-right"),
    ({"highway": "tertiary", "lanes": "2", "cycleway:both": "no"}, "centre"),
    ({"highway": "primary"}, "centre"),
    ({"highway": "residential"}, "none"),
    ({"highway": "motorway"}, "motorway"),
    ({"highway": "tertiary", "lanes": "2", "overtaking": "no"}, "centre-solid"),
])
def test_marking(tags, mark):
    assert R.marking(tags) == mark


def test_solid_mask_on_tight_bend():
    straight = [(0, 0), (50, 0), (100, 0)]
    assert R.solid_mask(straight) == [False, False, False]
    r = 60.0                                   # quarter circle, radius 60 m < 150 m
    arc = [(r * math.sin(a), r - r * math.cos(a)) for a in [i * math.pi / 16 for i in range(9)]]
    assert all(R.solid_mask(arc)[1:-1])


def test_build_splits_at_solid_change_and_finds_junctions():
    r = 60.0
    arc = [(100 + r * math.sin(a), r - r * math.cos(a)) for a in [i * math.pi / 16 for i in range(9)]]
    pts = [(0, 0), (50, 0), (100, 0)] + arc[1:]
    ways = [Way(1, {"highway": "tertiary", "lanes": "2", "name": "Hauptstrasse"}, shapely.LineString(pts)),
            Way(2, {"highway": "residential"}, shapely.LineString([(50, 0), (50, 80)])),
            Way(3, {"highway": "track"}, shapely.LineString([(0, 0), (0, 50)]))]
    nodes = {7: (50.0, 0.0)}
    way_nodes = {1: [1, 7] + list(range(100, 100 + len(pts) - 2)), 2: [7, 8], 3: [1, 9]}
    roads, junctions = R.build(ways, nodes, way_nodes, shapely.box(-1000, -1000, 1000, 1000))
    marks = [r["mark"] for r in roads if r["id"] == 1]
    assert marks[0] == "centre" and "centre-solid" in marks
    assert all(r["id"] != 3 for r in roads)             # track dropped
    assert junctions == [[50.0, 0.0, pytest.approx(3.8)]]  # tertiary 7 m -> 3.5 + 0.3
    assert all(isinstance(v, float) for r in roads for p in r["pts"] for v in p)


def test_build_clips_to_bbox():
    ways = [Way(1, {"highway": "primary"}, shapely.LineString([(-50, 0), (50, 0)]))]
    roads, _ = R.build(ways, {}, {1: [1, 2]}, shapely.box(0, -10, 100, 10))
    assert roads[0]["pts"][0] == [0.0, 0.0]


def test_junction_needs_two_kept_ways():
    """A node shared by one kept road and a track (not kept) is no junction; osm_read counts uses over all highway ways."""
    ways = [Way(1, {"highway": "tertiary"}, shapely.LineString([(0, 0), (100, 0)])),
            Way(2, {"highway": "residential"}, shapely.LineString([(50, 0), (50, 80)])),
            Way(3, {"highway": "track"}, shapely.LineString([(0, 0), (0, 50)])),
            Way(4, {"highway": "service", "service": "driveway"}, shapely.LineString([(100, 0), (100, 30)]))]
    nodes = {1: (0.0, 0.0), 7: (50.0, 0.0), 2: (100.0, 0.0)}      # all three are shared over *all* highway ways
    way_nodes = {1: [1, 7, 2], 2: [7, 8], 3: [1, 9], 4: [2, 10]}
    _, junctions = R.build(ways, nodes, way_nodes, shapely.box(-1000, -1000, 1000, 1000))
    assert junctions == [[50.0, 0.0, pytest.approx(3.8)]]


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
