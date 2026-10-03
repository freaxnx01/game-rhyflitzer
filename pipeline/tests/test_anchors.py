import math
from pathlib import Path

import shapely
import pytest

import anchors
import geo
from osm_read import Area, NamedNode, OsmData

F = geo.Frame(*geo.DEFAULT_ORIGIN)


def test_resolve_osm_area_lonlat_and_cps():
    data = OsmData(areas=[Area(806132044, True, {"man_made": "chimney"}, shapely.box(1060, 340, 1070, 350))],
                   named_nodes=[NamedNode(20, {"man_made": "chimney"}, 5.0, 6.0)])
    spec = {"landmarks": {"c": {"osm": "w806132044", "h": 140, "kind": "chimney"},
                          "n": {"osm": "n20"},
                          "o": {"lonlat": [7.9671, 47.5506]}},
            "start": {"lonlat": [7.9671, 47.5506], "heading_deg": 180},
            "cps": [{"n": "A", "lonlat": [7.9671, 47.5506]}],
            "finish": {"n": "F", "lonlat": [7.9671, 47.5506]},
            "labels": [{"t": "X", "lonlat": [7.9671, 47.5506]}],
            "areas": {"industrial": ["w806132044"], "sisselnWald": {"lonlat_box": [7.9671, 47.5506, 7.9681, 47.5516]},
                      "g": {"game_box": [1, 2, 3, 4]}},
            "exclude_buildings": ["w806132044"]}
    r = anchors.resolve(spec, data, F)
    assert r["landmarks"]["c"]["x"] == pytest.approx(1065) and r["landmarks"]["c"]["h"] == 140
    assert r["landmarks"]["n"]["x"] == 5.0
    assert r["landmarks"]["o"]["x"] == pytest.approx(0, abs=0.01)
    assert r["start"][2] == pytest.approx(3.14159, abs=1e-4)       # 180 deg: heading west
    assert r["cps"][0]["n"] == "A" and r["finish"]["n"] == "F"
    box = r["areas"]["sisselnWald"]
    assert box[0] < box[2] and box[1] < box[3]                      # x0 < x1, z0 < z1 (north -> smaller z)
    assert r["areas"]["g"] == [1.0, 2.0, 3.0, 4.0]
    assert anchors.exclude_ids(spec) == {806132044}


def test_missing_osm_id_is_reported_not_crashing(capsys):
    r = anchors.resolve({"landmarks": {"gone": {"osm": "w1"}}}, OsmData(), F)
    assert "gone" not in r["landmarks"]
    assert "w1" in capsys.readouterr().err


def test_landmark_area_keeps_its_house_number():
    data = OsmData(areas=[Area(170395848, True, {"building": "civic", "addr:housenumber": "2", "name": "Hallenbad"}, shapely.box(0, 0, 40, 40)),
                          Area(806132044, True, {"man_made": "chimney"}, shapely.box(100, 100, 110, 110))])
    r = anchors.resolve({"landmarks": {"hb": {"osm": "w170395848"}, "c": {"osm": "w806132044"}, "g": {"game": [1, 2]}}}, data, F)
    assert r["landmarks"]["hb"]["addr"] == "2"
    assert "addr" not in r["landmarks"]["c"] and "addr" not in r["landmarks"]["g"]


def test_keep_all_building_boxes():
    import anchors as A
    spec = {"areas": {"q": {"game_box": [0, 0, 10, 10], "keep_all_buildings": True}, "w": {"game_box": [5, 5, 6, 6]}}}
    assert [b.bounds for b in A.keep_all_boxes(spec, {"areas": {"q": [0.0, 0.0, 10.0, 10.0], "w": [5.0, 5.0, 6.0, 6.0]}})] == [(0.0, 0.0, 10.0, 10.0)]


def test_keep_ids():
    assert anchors.keep_ids({"keep_buildings": ["w390621357", "w25835477"]}) == {390621357, 25835477}
    assert anchors.keep_ids({}) == set()


def test_osm_landmark_passes_size_heading_and_house_number_through():
    """#81: the LANDI tower anchor carries measured height, footprint size, heading and the OSM house number."""
    data = OsmData(areas=[Area(197688923, True, {"building": "commercial", "addr:housenumber": "19.1"}, shapely.box(1826, 621, 1839, 634))])
    spec = {"landmarks": {"landiTurm": {"osm": "w197688923", "h": 56, "kind": "silo", "heading_deg": 82.2, "size": [35.4, 12.6]}}}
    t = anchors.resolve(spec, data, F)["landmarks"]["landiTurm"]
    assert t["x"] == pytest.approx(1832.5) and t["z"] == pytest.approx(627.5)
    assert t["h"] == 56 and t["kind"] == "silo" and t["addr"] == "19.1"
    assert t["size"] == [35.4, 12.6]
    assert t["rot"] == pytest.approx(math.radians(82.2))


def test_repo_anchors_place_the_landi_tower_and_exclude_its_footprint():
    spec = anchors.load(Path(__file__).parents[1] / "anchors.json")
    t = spec["landmarks"]["landiTurm"]
    assert t["osm"] == "w197688923" and t["h"] == 56 and t["kind"] == "silo"
    assert t["size"] == [35.4, 12.6] and t["heading_deg"] == 82.2
    assert 197688923 in anchors.exclude_ids(spec)
