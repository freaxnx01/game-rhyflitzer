"""#1035: the backfill marks public buildings with `use` in an existing world file."""
import copy
import json

import pytest

import geo
import osm_read

import backfill_building_uses as BU
from tests.test_backfill_streets import F, tiny_osm, world_dict


@pytest.mark.parametrize("tags,kind", [
    ({"building": "school"}, "school"),
    ({"amenity": "school"}, "school"),
    ({"building": "kindergarten"}, "kindergarten"),
    ({"amenity": "kindergarten"}, "kindergarten"),
    ({"building": "train_station"}, "station"),
    ({"railway": "station"}, "station"),
    ({"leisure": "sports_hall"}, "gym"),
    ({"building": "sports_hall"}, "gym"),
    ({"name": "Turnhalle"}, "gym"),
    ({"name": "Mehrzweckhalle"}, "gym"),
    ({"name": "Hallenbad Sissila"}, "pool"),
    ({"name": "Werkhof"}, "werkhof"),
    ({"name": "Bauamt Stein"}, "werkhof"),
])
def test_classify_known_kinds(tags, kind):
    assert BU.classify(tags) == kind


@pytest.mark.parametrize("tags", [
    {"leisure": "swimming_pool"},
    {"leisure": "sports_centre", "name": "Tennishalle"},
    {"name": "Hallenbad-Parkplatz"},
    {"name": "Bahnhofplatz"},
    {"name": "Ebner Gartenbau - Werkhof", "building": "retail"},
])
def test_classify_rejects_lookalikes(tags):
    assert BU.classify(tags) is None


def square(x0, z0, x1, z1):
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def way_nodes(base, ring):
    return [(base + i, x, z, {}) for i, (x, z) in enumerate(ring)]


def world_with_three():
    w = world_dict()
    w["buildings"] += [
        {"id": 3, "h": 6.0, "roof": "gable", "rect": [50.0, 0.0, 12.0, 9.0, 0.0],
         "ring": [[44.0, -4.5], [56.0, -4.5], [56.0, 4.5], [44.0, 4.5]]},
        {"id": 4, "h": 6.0, "roof": "gable", "rect": [90.0, 0.0, 12.0, 9.0, 0.0],
         "ring": [[84.0, -4.5], [96.0, -4.5], [96.0, 4.5], [84.0, 4.5]]},
    ]
    return w


def tiny_world_osm(tmp_path):
    nodes = (way_nodes(100, square(-12.0, -4.5, 0.0, 4.5))          # building 1: own tag
             + way_nodes(110, square(30.0, -30.0, 70.0, 30.0))      # school site holding building 3
             + [(120, 90.0, 0.0, {"railway": "station"})])           # node inside building 4 (osm_read keeps no kindergarten nodes)
    ways = [(1, [100, 101, 102, 103, 100], {"building": "school"}),
            (900, [110, 111, 112, 113, 110], {"amenity": "school"})]
    return tiny_osm(tmp_path / "tiny.osm", nodes=nodes, ways=ways)


def test_backfill_marks_own_tag_site_area_and_node(tmp_path):
    world = world_with_three()
    before = copy.deepcopy(world)
    stats = BU.backfill(world, osm_read.read(tiny_world_osm(tmp_path), F))
    uses = {b["id"]: b.get("use") for b in world["buildings"]}
    assert uses == {1: "school", 2: None, 3: "school", 4: "station"}
    assert stats == {"school": 2, "station": 1}
    for b, o in zip(world["buildings"], before["buildings"]):
        assert {k: v for k, v in b.items() if k != "use"} == o


def test_backfill_second_run_changes_nothing(tmp_path):
    world = world_with_three()
    data = osm_read.read(tiny_world_osm(tmp_path), F)
    BU.backfill(world, data)
    snapshot = copy.deepcopy(world)
    assert BU.backfill(world, data) == {}
    assert world == snapshot


def test_main_round_trips_the_file_except_use(tmp_path):
    pbf = tiny_world_osm(tmp_path)
    path = tmp_path / "world.json"
    path.write_text(json.dumps(world_with_three(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    assert BU.main(["--pbf", str(pbf), "--world", str(path)]) == 0
    after = json.loads(path.read_text(encoding="utf-8"))
    assert [b.get("use") for b in after["buildings"]] == ["school", None, "school", "station"]
