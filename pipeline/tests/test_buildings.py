import math

import pytest
import shapely

import world_buildings as B
from osm_read import Area

CLIP = shapely.box(-1000, -1000, 1000, 1000)
MAIN = [{"cls": "tertiary", "pts": [[-500, 0], [500, 0]]}]


def house(i, x, z, w=12, d=9, tags=None):
    return Area(i, True, dict({"building": "house"}, **(tags or {})), shapely.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2))


@pytest.mark.parametrize("tags,h", [
    ({"building": "house", "height": "11"}, 11 * 0.8),
    ({"building": "house", "building:levels": "3"}, 9.0),
    ({"building": "house"}, 6.0),
    ({"building": "apartments"}, 12.0),
    ({"building": "industrial"}, 9.0),
    ({"building": "yes", "height": "12 m"}, 12 * 0.8),
])
def test_height(tags, h):
    assert B.height(tags) == pytest.approx(h)


def test_roof_rules_and_rect_angle():
    kind, rect = B.roof(shapely.box(0, 0, 12, 8))
    assert kind == "gable" and rect[2] == pytest.approx(12) and rect[3] == pytest.approx(8)
    assert math.isclose(math.cos(rect[4]) ** 2, 1, abs_tol=1e-6)    # long side along x
    rot = shapely.affinity.rotate(shapely.box(0, 0, 12, 8), 30, origin="center")
    assert abs(math.degrees(B.roof(rot)[1][4]) % 180 - 30) < 0.5
    assert B.roof(shapely.box(0, 0, 30, 20))[0] == "flat"              # 600 m2 > 250
    L = shapely.Polygon([(0, 0), (14, 0), (14, 4), (4, 4), (4, 14), (0, 14)])
    assert B.roof(L)[0] == "flat"                                     # not rectangular enough


def test_selection_distance_and_big():
    areas = [house(1, 0, 20), house(2, 0, 60),
             Area(3, True, {"building": "industrial"}, shapely.box(300, 300, 340, 340)),
             Area(4, True, {"building": "roof"}, shapely.box(0, 10, 10, 20)),
             Area(5, True, {"building": "house"}, shapely.box(0, 25, 3, 28)),       # 9 m2 < 20
             house(6, 5, 15)]
    bl, stats = B.build(areas, MAIN, CLIP, exclude_ids={6})
    assert sorted(b["id"] for b in bl) == [1, 3]
    assert stats["excluded_landmark"] == 1


def test_degenerate_footprints_are_skipped():
    bad = [Area(7, True, {"building": "house"}, shapely.Polygon([(0, 5), (10, 5), (10, 5)])),
           Area(8, True, {"building": "house"}, shapely.Polygon([(0, 0), (10, 10), (10, 0), (0, 10)]))]
    bl, stats = B.build(bad, MAIN, CLIP)
    assert stats["degenerate"] >= 1
    assert all(b["id"] != 7 for b in bl)


def test_industrial_palette():
    site = [shapely.box(-100, 0, 100, 100)]
    bl, _ = B.build([house(1, 0, 20)], MAIN, CLIP, industrial=site)
    assert bl[0]["palette"] == "industrial"


def test_keep_all_area_keeps_far_houses_but_not_sheds():
    far = [house(1, 0, 200), house(2, 400, 200), Area(3, True, {"building": "house"}, shapely.box(10, 190, 13, 193))]  # 9 m2 shed
    bl, stats = B.build(far, MAIN, CLIP, keep_all=[shapely.box(-50, 150, 50, 250)])
    assert [b["id"] for b in bl] == [1]
    assert stats["kept_area"] == 1
