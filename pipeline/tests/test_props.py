import math

import pytest
import shapely

import world_props as WP
from osm_read import Area, PropNode

CLIP = shapely.box(-1000, -1000, 1000, 1000)
ROAD = {"cls": "residential", "w": 6.0, "bridge": False, "pts": [[-200, 0], [200, 0]]}


@pytest.mark.parametrize("tags,kind", [
    ({"highway": "street_lamp"}, "lamp"),
    ({"emergency": "fire_hydrant"}, "hydrant"),
    ({"emergency": "fire_hydrant", "fire_hydrant:type": "pillar"}, "hydrant"),
    ({"emergency": "fire_hydrant", "fire_hydrant:type": "underground"}, None),
    ({"emergency": "fire_hydrant", "fire_hydrant:type": "pipe"}, None),
    ({"amenity": "bench"}, "bench"),
    ({"amenity": "waste_basket"}, "bin"),
    ({"amenity": "bicycle_parking"}, "bike_rack"),
    ({"amenity": "recycling", "recycling:glass_bottles": "yes"}, "glass_container"),
    ({"amenity": "recycling", "recycling:glass": "yes", "recycling:clothes": "yes"}, "glass_container"),
    ({"amenity": "recycling", "recycling:clothes": "yes"}, "clothes_container"),
    ({"amenity": "recycling", "recycling:paper": "yes"}, None),
    ({"amenity": "parking"}, None),
])
def test_classify(tags, kind):
    assert WP.classify(tags) == kind


def node(i, x, z, **tags):
    return PropNode(i, tags, float(x), float(z))


def test_reach_filter_uses_road_edge():
    props, stats = WP.build([node(1, 0, 3 + 14.9, highway="street_lamp"), node(2, 0, 3 + 15.2, highway="street_lamp")],
                            [], [ROAD], CLIP)
    assert [p["x"] for p in props] == [0.0] and stats["out_of_reach"] == 1


def test_lamp_on_centre_line_moves_to_right_edge():
    props, stats = WP.build([node(1, 50, 0, highway="street_lamp")], [], [ROAD], CLIP)
    # road runs +x; right-hand side is +z (south)
    assert props[0]["z"] == pytest.approx(3.6) and props[0]["x"] == pytest.approx(50)
    assert stats["moved_to_edge"] == 1


def test_prop_inside_band_moves_to_its_own_side():
    props, _ = WP.build([node(1, 50, -2.0, emergency="fire_hydrant")], [], [ROAD], CLIP)
    assert props[0]["z"] == pytest.approx(-3.6)


def test_junction_prop_still_on_a_road_is_dropped():
    cross = {"cls": "residential", "w": 6.0, "bridge": False, "pts": [[0, -200], [0, 200]]}
    props, stats = WP.build([node(1, 0.5, 0.5, highway="street_lamp")], [], [ROAD, cross], CLIP)
    assert props == [] and stats["still_on_road"] == 1


def test_prop_on_bridge_band_is_dropped():
    bridge = {"cls": "tertiary", "w": 7.0, "bridge": True, "pts": [[300, -50], [300, 50]]}
    props, stats = WP.build([node(1, 301, 0, highway="street_lamp")], [], [ROAD, bridge], CLIP)
    assert props == [] and stats["on_bridge"] == 1


def test_bench_parallel_to_road_and_area_centroid():
    diag = {"cls": "residential", "w": 6.0, "bridge": False, "pts": [[0, 0], [100, 100]]}
    rack = Area(9, True, {"amenity": "bicycle_parking"}, shapely.box(40, 50, 44, 52))
    props, _ = WP.build([node(1, 50, 58, amenity="bench")], [rack], [diag], CLIP)
    bench = next(p for p in props if p["kind"] == "bench")
    assert math.isclose(abs(math.cos(bench["rot"] - math.pi / 4)), 1, abs_tol=0.02)
    assert any(p["kind"] == "bike_rack" for p in props)


def test_rounding_and_clip():
    props, _ = WP.build([node(1, 10.04, 5.06, amenity="waste_basket"), node(2, 5000, 0, amenity="waste_basket")],
                        [], [ROAD], CLIP)
    assert props == [{"kind": "bin", "x": 10.0, "z": 5.1, "rot": 0.0}]


def test_band_of_a_wider_road_counts_even_if_a_narrow_road_is_nearer():
    """Real extract: a lamp 3.6 m from a narrow road's centre line (outside its band) but 3.9 m from a 8 m road's centre
    line (inside that band) was left in the lane, because only the nearest centre line was looked at."""
    narrow = {"cls": "service", "w": 3.0, "bridge": False, "pts": [[-200, 0], [200, 0]]}
    wide = {"cls": "primary", "w": 8.0, "bridge": False, "pts": [[-200, 7.5], [200, 7.5]]}
    props, _ = WP.build([node(1, 50, 3.6, highway="street_lamp")], [], [narrow, wide], CLIP)
    for p in props:
        assert abs(p["z"] - 7.5) >= 4.0 + 0.6 - 1e-6 and abs(p["z"]) >= 1.5 + 0.6 - 1e-6, p
