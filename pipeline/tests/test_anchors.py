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
