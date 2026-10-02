import math

import pytest
import shapely

import world_parking as WK
from osm_read import Area, Way

CLIP = shapely.box(-1000, -1000, 1000, 1000)


def lot(i, geom, **tags):
    return Area(i, True, {"amenity": "parking", **tags}, geom)


def road(pts, w=6.0, bridge=False):
    return {"cls": "residential", "w": w, "bridge": bridge, "pts": pts}


def aisle(i, pts):
    return Way(i, {"highway": "service", "service": "parking_aisle"}, shapely.LineString(pts))


def build(areas, ways=(), buildings=(), roads=()):
    return WK.build(list(areas), list(ways), list(buildings), list(roads), CLIP)


@pytest.mark.parametrize("tags,kept", [
    ({"parking": "surface"}, True),
    ({}, True),
    ({"parking": "street_side"}, True),
    ({"parking": "lane"}, False),
    ({"parking": "underground"}, False),
    ({"parking": "multi-storey"}, False),
])
def test_selected(tags, kept):
    assert WK.selected({"amenity": "parking", **tags}) is kept


def test_skipped_kinds_are_counted_not_exported():
    out, stats = build([lot(1, shapely.box(0, 0, 20, 40), parking="underground")])
    assert out == [] and stats["skipped_underground"] == 1


def test_mapped_spaces_win_over_generated_bays():
    spaces = [Area(10 + k, True, {"amenity": "parking_space"}, shapely.box(2.5 * k, 0, 2.5 * k + 2.5, 5)) for k in range(4)]
    out, stats = build([lot(1, shapely.box(0, 0, 30, 40))] + spaces, [aisle(5, [(15, -10), (15, 50)])])
    assert out[0]["bays"] == 4 and stats["bays_mapped"] == 4 and "bays_aisle" not in stats


def test_aisle_gives_two_rows_inside_the_lot():
    (entry,), stats = build([lot(1, shapely.box(0, 0, 30, 40))], [aisle(5, [(15, -10), (15, 50)])])
    assert stats["bays_aisle"] == 2 * 16 == entry["bays"]          # 40 m / 2.5 m per side
    lot_poly = shapely.box(0, 0, 30, 40).buffer(0.2)
    for ax, az, bx, bz in entry["lines"]:
        assert lot_poly.contains(shapely.LineString([(ax, az), (bx, bz)]))


def test_aisle_band_stays_free_of_lines():
    (entry,), _ = build([lot(1, shapely.box(0, 0, 30, 40))], [aisle(5, [(15, -10), (15, 50)])])
    band = shapely.LineString([(15, -10), (15, 50)]).buffer(2.9)
    assert not any(band.intersects(shapely.LineString([(a, b), (c, d)])) for a, b, c, d in entry["lines"])


@pytest.mark.parametrize("width,rows,bays", [(2.5, 1, 6), (5, 1, 16), (12, 1, 16), (20, 2, 32)])
def test_rectangle_rule(width, rows, bays):
    (entry,), stats = build([lot(1, shapely.box(0, 0, 40, width))])
    assert entry["bays"] == bays and stats["bays_rect"] == bays


def test_parallel_strip_bays_are_six_metres_long():
    (entry,), _ = build([lot(1, shapely.box(0, 0, 40, 2.5))])
    across = sorted({round(a, 1) for a, b, c, d in entry["lines"] if a == c})    # lines across the strip (constant x)
    assert [round(q - p, 1) for p, q in zip(across, across[1:])] == [6.0] * (len(across) - 1)


def test_one_row_sits_on_the_side_away_from_the_road():
    (entry,), _ = build([lot(1, shapely.box(0, 0, 40, 12))], roads=[road([(-50, -8), (90, -8)])])
    zs = [z for a, b, c, d in entry["lines"] for z in (b, d)]
    assert min(zs) >= 12 - 5 - 0.05                                  # bays fill z 7..12, the aisle is next to the road


def test_building_and_road_remove_the_bays_they_touch():
    house = {"ring": [[0, 0], [10, 0], [10, 6], [0, 6]]}
    (entry,), stats = build([lot(1, shapely.box(0, 0, 40, 20))], buildings=[house])
    assert stats["dropped_building"] >= 4 and entry["bays"] < 32
    (entry,), stats = build([lot(1, shapely.box(0, 0, 40, 20))], roads=[road([(20, -10), (20, 30)], w=4)])
    assert stats["dropped_road"] >= 2 and entry["bays"] < 32


def test_capacity_caps_the_bays():
    (entry,), stats = build([lot(1, shapely.box(0, 0, 40, 20), capacity="4")])
    assert entry["bays"] == 4 and stats["dropped_capacity"] == 28


def test_capacity_that_is_not_a_number_is_ignored():
    (entry,), _ = build([lot(1, shapely.box(0, 0, 40, 20), capacity="ca. 30")])
    assert entry["bays"] == 32


def test_shared_edges_are_written_once():
    (entry,), _ = build([lot(1, shapely.box(0, 0, 40, 5))])
    keys = [tuple(sorted([(a, b), (c, d)])) for a, b, c, d in entry["lines"]]
    assert len(keys) == len(set(keys))
    assert len(entry["lines"]) == 16 + 1 + 16                        # 17 separators, 16 back edges, open fronts


def test_sign_only_with_a_name_inside_the_lot_near_the_road():
    (plain,), _ = build([lot(1, shapely.box(0, 0, 40, 12))], roads=[road([(-50, -8), (90, -8)])])
    assert "sign" not in plain and "name" not in plain
    (named,), _ = build([lot(1, shapely.box(0, 0, 40, 12), name="Hallenbad-Parkplatz")], roads=[road([(-50, -8), (90, -8)])])
    x, z, rot = named["sign"]
    assert named["name"] == "Hallenbad-Parkplatz"
    assert shapely.box(0, 0, 40, 12).contains(shapely.Point(x, z)) and z < 1.5
    assert abs(math.sin(rot)) < 1e-6                                  # turned along the east-west road


def test_named_lot_without_any_road_has_no_sign():
    (entry,), _ = build([lot(1, shapely.box(0, 0, 40, 12), name="P")])
    assert entry["name"] == "P" and "sign" not in entry


def test_lot_is_clipped_and_holes_are_kept():
    ring = shapely.box(990, 0, 1100, 40).difference(shapely.box(995, 10, 999, 20))
    (entry,), _ = build([lot(1, ring)])
    assert max(x for x, z in entry["ring"]) <= 1000 and len(entry["holes"]) == 1


def test_multipolygon_lot_gives_one_entry_per_part():
    geom = shapely.MultiPolygon([shapely.box(0, 0, 40, 5), shapely.box(0, 100, 40, 105)])
    out, stats = build([lot(1, geom)])
    assert [e["id"] for e in out] == [1, 1] and stats["lots"] == 2


def test_bays_against_a_wall_or_the_road_edge_are_kept():
    house = {"ring": [[0, 5], [40, 5], [40, 15], [0, 15]]}               # wall along the back of a 5 m bay strip
    (entry,), stats = build([lot(1, shapely.box(0, 0, 40, 5))], buildings=[house], roads=[road([(-50, -3), (90, -3)])])
    assert entry["bays"] == 16 and "dropped_building" not in stats and "dropped_road" not in stats
