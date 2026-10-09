import pytest
import shapely

import world_forests as WF
from osm_read import Area

CLIP = shapely.box(-1000, -1000, 1000, 1000)


def wood(i, geom, **tags):
    return Area(i, True, {"landuse": "forest", **tags}, geom)


def road(pts, w=6.0, bridge=False):
    return {"cls": "residential", "w": w, "bridge": bridge, "pts": pts}


def poly(entry):
    return shapely.Polygon(entry["ring"], entry.get("holes", []))


@pytest.mark.parametrize("tags,kept", [
    ({"landuse": "forest"}, True),
    ({"natural": "wood"}, True),
    ({"landuse": "forest", "leaf_type": "broadleaved"}, True),
    ({"natural": "scrub"}, False),
    ({"landuse": "orchard"}, False),
    ({"landuse": "meadow"}, False),
])
def test_selected(tags, kept):
    assert WF.selected(tags) is kept


def test_overlapping_woods_merge_into_one_part():
    out, stats = WF.build([wood(1, shapely.box(0, 0, 100, 100)), wood(2, shapely.box(50, 0, 150, 100)),
                           Area(3, True, {"natural": "wood"}, shapely.box(140, 0, 200, 100))], [], CLIP)
    assert len(out) == 1 and stats["areas"] == 3 and stats["parts"] == 1
    assert poly(out[0]).area == pytest.approx(200 * 100, abs=1)
    assert out[0]["ring"][0] != out[0]["ring"][-1]            # open ring
    assert all(round(v, 1) == v for p in out[0]["ring"] for v in p)


def test_road_cuts_a_corridor_of_half_width_plus_five_metres():
    out, _ = WF.build([wood(1, shapely.box(0, 0, 200, 200))], [road([(-50, 100), (250, 100)], w=6.0)], CLIP)
    assert len(out) == 2
    for p in out:
        assert shapely.LineString([(-50, 100), (250, 100)]).distance(poly(p)) == pytest.approx(3 + 5, abs=0.2)


def test_bridge_cuts_a_corridor_too():
    out, _ = WF.build([wood(1, shapely.box(0, 0, 200, 200))], [road([(100, -50), (100, 250)], w=9.0, bridge=True)], CLIP)
    assert len(out) == 2 and all(poly(p).bounds[0] >= 100 + 9.5 - 0.2 or poly(p).bounds[2] <= 100 - 9.5 + 0.2 for p in out)


def test_car_park_is_cut_out_with_three_metres():
    lot = Area(9, True, {"amenity": "parking", "parking": "surface"}, shapely.box(80, 80, 120, 120))
    out, _ = WF.build([wood(1, shapely.box(0, 0, 200, 200)), lot], [], CLIP)
    assert len(out) == 1 and len(out[0]["holes"]) == 1
    assert shapely.Polygon(out[0]["holes"][0]).area == pytest.approx(46 * 46, rel=0.05)
    assert WF.build([wood(1, shapely.box(0, 0, 200, 200)),
                     Area(9, True, {"amenity": "parking", "parking": "underground"}, shapely.box(80, 80, 120, 120))], [], CLIP)[0][0].get("holes") is None


def test_small_leftovers_and_tiny_holes_are_dropped():
    out, stats = WF.build([wood(1, shapely.box(0, 0, 20, 20)), wood(2, shapely.box(100, 100, 300, 300))], [], CLIP)
    assert len(out) == 1 and stats["dropped_small"] == 1 and poly(out[0]).bounds == (100, 100, 300, 300)
    clearing = shapely.Polygon([(150, 150), (160, 150), (160, 160), (150, 160)])        # 100 m2
    big_hole = shapely.box(200, 200, 260, 260)                                           # 3600 m2
    out, _ = WF.build([wood(3, shapely.box(100, 100, 300, 300).difference(clearing).difference(big_hole))], [], CLIP)
    assert len(out) == 1 and len(out[0]["holes"]) == 1 and shapely.Polygon(out[0]["holes"][0]).area == pytest.approx(3600, abs=1)


def test_clipped_simplified_and_sorted():
    jagged = shapely.Polygon([(0, 0), (100, 0), (100, 0.3), (200, 0.6), (200, 100), (0, 100)])   # near-collinear edge
    out, _ = WF.build([wood(1, jagged), wood(2, shapely.box(900, 900, 1200, 1200))], [], CLIP)
    assert [poly(p).bounds[0] for p in out] == [0.0, 900.0]                       # sorted by min x
    assert poly(out[1]).bounds[2:] == (1000.0, 1000.0)                            # clipped
    assert len(out[0]["ring"]) <= 5                                               # 1 m simplification removed the 0.3 m kink


def test_no_woods_gives_empty_list():
    assert WF.build([Area(1, True, {"building": "yes"}, shapely.box(0, 0, 10, 10))], [], CLIP) == ([], {})
