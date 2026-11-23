"""#530: flag buildings newer than 1952 from the GWR register."""
import copy

from shapely.geometry import box

import era_1952 as E
from geo import Frame

SWISS = box(-1000, -1000, 1000, 1000)


def house(i, x, z, size=10.0, **extra):
    ring = [[x, z], [x + size, z], [x + size, z + size], [x, z + size]]
    return {"id": i, "h": 6.0, "roof": "gable", "palette": "village", "rect": [x, z, size, size, 0.0], "ring": ring, **extra}


def pt(x, z, year=None, period=None):
    return (x, z, year, period)


def classify(buildings, points):
    return E.classify(buildings, points, SWISS)


def test_register_year_decides():
    for year, expected in [(1931, "old"), (1975, "modern"), (1952, "old"), (1953, "modern")]:
        assert classify([house(1, 0, 0)], [pt(5, 5, year)]) == {1: expected}, year


def test_period_without_year():
    assert classify([house(1, 0, 0)], [pt(5, 5, None, 8011)]) == {1: "old"}
    assert classify([house(1, 0, 0)], [pt(5, 5, None, 8012)]) == {1: "old"}
    # 8013 alone is undecided: with no decided neighbour it falls to modern, with old neighbours it stays
    assert classify([house(1, 0, 0)], [pt(5, 5, None, 8013)]) == {1: "modern"}
    row = [house(1, 0, 0), house(2, 15, 0), house(3, 15, 15)]
    pts = [pt(5, 5, None, 8013), pt(20, 5, 1900), pt(20, 20, 1900)]
    assert classify(row, pts)[1] == "old"


def test_later_period_without_year_is_modern():
    assert classify([house(1, 0, 0)], [pt(5, 5, None, 8014)]) == {1: "modern"}


def test_any_old_point_wins():
    assert classify([house(1, 0, 0)], [pt(3, 3, 1980), pt(6, 6, 1900)]) == {1: "old"}


def test_point_within_match_pad_matches():
    assert classify([house(1, 0, 0)], [pt(11.5, 5, 1900)]) == {1: "old"}
    assert classify([house(1, 0, 0)], [pt(13, 5, 1900)]) == {1: "modern"}


def test_undecided_keeps_with_all_old_neighbours():
    old = [house(1, 0, 0), house(2, 0, 25)]
    pts = [pt(5, 5, 1900), pt(5, 30, 1920)]
    target = house(3, 15, 12, size=10.0)
    assert classify(old + [target], pts)[3] == "old"
    with_modern = old + [house(4, 30, 12), target]
    assert classify(with_modern, pts + [pt(35, 17, 1990)])[3] == "modern"
    assert classify([target], [])[3] == "modern"


def test_unmatched_shed_and_industrial_are_modern():
    old = [house(1, 0, 0), house(2, 0, 25)]
    pts = [pt(5, 5, 1900), pt(5, 30, 1920)]
    shed = house(3, 15, 12, size=6.0)
    assert classify(old + [shed], pts)[3] == "modern"
    hall = house(4, 15, 12, palette="industrial")
    assert classify(old + [hall], pts)[4] == "modern"


def test_german_side_untouched():
    swiss = box(-1000, -1000, 0, 1000)
    near_border = house(1, 5, 0)
    assert E.classify([near_border], [], swiss) == {1: "de"}


ORIGIN = {"lat": 47.5506, "lon": 7.9671}
FRAME = Frame(ORIGIN["lat"], ORIGIN["lon"])
OUTLINE_LV95 = box(FRAME.e0 - 1000, FRAME.n0 - 1000, FRAME.e0 + 1000, FRAME.n0 + 1000)


def test_apply_is_idempotent_and_keeps_the_rest():
    world = {"format": "MMW1", "origin": dict(ORIGIN), "sources": ["© OSM"], "params": {"a": 1},
             "buildings": [house(1, 0, 0, modern=True), house(2, 50, 0)], "rail": []}
    first = E.apply(world, [], OUTLINE_LV95)
    snapshot = copy.deepcopy(world)
    E.apply(world, [], OUTLINE_LV95)
    assert world == snapshot
    assert first == {"old": 0, "modern": 2, "de": 0}
    assert world["sources"] == ["© OSM", E.SOURCE_LINE]
    keys = list(world)
    assert keys[keys.index("sources") + 1] == "era" and world["era"] == {"year": 1952}
    assert world["params"] == {"a": 1} and world["rail"] == []
    assert all(b["modern"] is True for b in world["buildings"])


def test_apply_clears_stale_modern_on_old_and_german():
    world = {"origin": dict(ORIGIN), "sources": [],
             "buildings": [house(1, 0, 0, modern=True), house(2, 5000, 0, modern=True)]}
    rows = [{"E": FRAME.e0 + 5, "N": FRAME.n0 - 5, "year": 1900, "period": None}]
    counts = E.apply(world, rows, OUTLINE_LV95)
    assert counts == {"old": 1, "modern": 0, "de": 1}
    assert "modern" not in world["buildings"][0] and "modern" not in world["buildings"][1]


def test_apply_keeps_existing_era_keys():
    x = {"kind": "cereal"}
    world = {"origin": dict(ORIGIN), "sources": [], "buildings": [], "era": {"year": 1952, "fields": [x]}}
    E.apply(world, [], OUTLINE_LV95)
    assert world["era"]["fields"] == [x] and world["era"]["year"] == 1952


def test_apply_keeps_era_houses():
    h = house("sisseln-01", 0, 0)
    world = {"origin": dict(ORIGIN), "sources": [], "buildings": [], "era": {"year": 1952, "houses": [h]}}
    E.apply(world, [], OUTLINE_LV95)
    assert world["era"]["houses"] == [h] and world["era"]["year"] == 1952
