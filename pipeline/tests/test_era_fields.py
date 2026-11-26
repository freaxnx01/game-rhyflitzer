import era_fields as F
import world_fields as W
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

SITE = box(0, 0, 400, 150)   # long axis along x

def test_strips_cover_the_site_and_stay_inside():
    s = F.strips(SITE)
    u = unary_union([p for _, p in s])
    assert abs(u.area - SITE.area) < 1.0 and u.difference(SITE.buffer(0.01)).is_empty

def test_strips_run_along_the_long_axis_with_widths_in_range():
    for _, p in F.strips(SITE):
        minx, minz, maxx, maxz = p.bounds
        assert maxz - minz <= F.STRIP_MAX + 0.01            # width across the long axis
        assert maxx - minx <= F.CROSS_MAX + 0.01

def test_strips_are_deterministic_and_use_era_kinds():
    a, b = F.strips(SITE), F.strips(SITE)
    assert [(k, p.wkt) for k, p in a] == [(k, p.wkt) for k, p in b]
    assert {k for k, _ in a} <= set(F.ERA_KINDS) and len({k for k, _ in a}) > 1

def test_layout_keeps_off_keep_out_and_insets_by_half_a_seam():
    road = LineString([(0, 75), (400, 75)]).buffer(4)
    out = F.layout(SITE, road)
    assert out and all(e["src"] == "era" and "dir" in e for e in out)
    for e in out:
        p = Polygon(e["ring"])
        assert not p.intersects(road)
        assert p.area >= W.MIN_AREA
        assert p.within(SITE.buffer(-W.SEAM / 2 + 0.05))

def test_layout_of_a_site_fully_kept_out_is_empty():
    assert F.layout(SITE, SITE.buffer(1)) == []


import copy
import json

from shapely.geometry import Point


def _ring(b):
    x0, z0, x1, z1 = b
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]


def _world_for_keep_out():
    return {
        "era": {"year": 1952},
        "roads": [
            {"pts": [[0, 10], [400, 10]], "w": 6},
            {"pts": [[0, 30], [400, 30]], "w": 6, "modern": True},
            {"pts": [[0, 50], [200, 50]], "w": 6, "keep1952": [[0, 50]]},
        ],
        "rail": [[[0, 70], [400, 70]]],
        "streams": [],
        "forests": [{"ring": _ring((300, 90, 340, 110))}],
        "water": [{"rings": [_ring((200, 90, 240, 110))]}],
        "fields": [{"ring": _ring((100, 90, 140, 110))}],
        "buildings": [{"ring": _ring((20, 90, 40, 110))}],
        "parking": [],
        "props": [],
        "anchors": {"landmarks": {}},
    }


def test_keep_out_holds_old_roads_kept_stretches_rail_forest_water_and_todays_fields():
    ko = F.keep_out_of(_world_for_keep_out())
    for p in [(200, 10), (25, 50), (200, 70), (320, 100), (220, 100), (120, 100), (30, 100)]:
        assert ko.contains(Point(p)), p
    for p in [(200, 30), (150, 50)]:
        assert not ko.contains(Point(p)), p


def _flag_world():
    lot = lambda x: {"ring": _ring((x, 10, x + 10, 20))}
    return {
        "parking": [lot(100), lot(900)],
        "props": [{"x": 50, "z": 50}, {"x": 900, "z": 50}],
        "anchors": {"landmarks": {
            "dsmChimney": {"x": 10, "z": 10}, "plattform": {"x": 20, "z": 20},
            "muenster": {"x": 900, "z": 900}, "noPos": {"name": "x"}}},
    }


def test_flag_site_marks_parking_props_and_landmarks_inside_only():
    w = _flag_world()
    counts = F.flag_site(w, SITE)
    assert counts == {"parking": 1, "props": 1, "landmarks": 1}
    assert w["parking"][0]["modern"] is True and "modern" not in w["parking"][1]
    assert w["props"][0]["modern"] is True and "modern" not in w["props"][1]
    lm = w["anchors"]["landmarks"]
    assert lm["dsmChimney"]["modern"] is True
    assert "modern" not in lm["plattform"] and "modern" not in lm["muenster"]


def test_flag_site_clears_a_stale_flag_outside():
    w = _flag_world()
    w["parking"][1]["modern"] = True
    F.flag_site(w, SITE)
    assert "modern" not in w["parking"][1]


def test_apply_is_idempotent_and_writes_era_fields():
    from geo import Frame
    from shapely.geometry import mapping
    frame = Frame(47.55, 7.95)
    w = _world_for_keep_out()
    w["origin"] = {"lat": 47.55, "lon": 7.95}
    corners = [(0, 0), (400, 0), (400, 150), (0, 150)]
    lonlat = {"type": "Polygon", "coordinates": [[list(map(float, frame.game_to_lonlat(x, z))) for x, z in corners + [corners[0]]]]}
    F.apply(w, lonlat)
    first = json.dumps(w, sort_keys=True)
    counts = F.apply(w, lonlat)
    assert json.dumps(w, sort_keys=True) == first
    assert w["era"]["year"] == 1952 and w["era"]["fields"] and counts["fields"] == len(w["era"]["fields"])
    corridor = LineString([(0, 10), (400, 10)]).buffer(3)
    assert not any(Polygon(e["ring"]).intersects(corridor) for e in w["era"]["fields"])


def test_flag_site_clears_a_stale_flag_on_a_kept_landmark():
    w = _flag_world()
    w["anchors"]["landmarks"]["plattform"]["modern"] = True
    F.flag_site(w, SITE)
    assert "modern" not in w["anchors"]["landmarks"]["plattform"]


def test_flag_site_leaves_a_road_owned_landmark_alone():
    w = _flag_world()
    w["anchors"]["landmarks"]["fridolinsbruecke"] = {"x": 900, "z": 900, "modern": True}
    F.flag_site(w, SITE)
    assert w["anchors"]["landmarks"]["fridolinsbruecke"]["modern"] is True


def test_flag_site_leaves_the_suedspange_signs_alone():
    w = _flag_world()
    lm = w["anchors"]["landmarks"]
    lm["suedspangeBaustelleOst"] = {"x": 900, "z": 50, "modern": True}    # outside the site, flagged by era_roads
    lm["suedspangeFahrverbotOst"] = {"x": 50, "z": 50}                    # inside the site, not flagged
    F.flag_site(w, SITE)
    assert lm["suedspangeBaustelleOst"]["modern"] is True
    assert "modern" not in lm["suedspangeFahrverbotOst"]
