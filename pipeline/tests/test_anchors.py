import json
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


ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
SPEC = ROOT / "pipeline" / "anchors.json"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="data/world_hochrhein.json not present")
STATIONS = ("stationSisseln", "stationStein")
STATION_CPS = {"Bahnhof Sisseln": "stationSisseln", "Bahnhof Stein-Säckingen": "stationStein"}


def _world():
    return json.loads(WORLD.read_text(encoding="utf-8"))


def _nearest_on_polylines(lines, x, z):
    """(distance, qx, qz, segment angle) of the closest point on any of the polylines."""
    best = None
    for line in lines:
        for (ax, az), (bx, bz) in zip(line, line[1:]):
            dx, dz = bx - ax, bz - az
            length2 = dx * dx + dz * dz
            if not length2:
                continue
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / length2))
            qx, qz = ax + t * dx, az + t * dz
            d = math.hypot(x - qx, z - qz)
            if best is None or d < best[0]:
                best = (d, qx, qz, math.atan2(dz, dx))
    return best


@needs_world
@pytest.mark.parametrize("key", STATIONS)
def test_station_stands_beside_the_track_facing_it(key):
    world = _world()
    lm = world["anchors"]["landmarks"][key]
    d, qx, qz, angle = _nearest_on_polylines(world["rail"], lm["x"], lm["z"])
    assert 10.5 <= d <= 14.0, f"{key} is {d:.1f} m from the nearest rail"
    off = (lm["rot"] - angle + math.pi / 2) % math.pi - math.pi / 2          # modulo 180 deg
    assert abs(off) < math.radians(3), f"{key} is {math.degrees(off):.1f} deg off the track direction"
    side = (-math.sin(lm["rot"]), math.cos(lm["rot"]))                        # local +z: the platform strip
    assert (qx - lm["x"]) * side[0] + (qz - lm["z"]) * side[1] > 0, f"{key}: the platform faces away from the track"


@needs_world
def test_world_anchors_are_baked_from_the_spec():
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    baked = _world()["anchors"]
    for key in STATIONS:
        entry, lm = spec["landmarks"][key], baked["landmarks"][key]
        assert (lm["x"], lm["z"]) == tuple(entry["game"]), key
        assert lm["rot"] == pytest.approx(math.radians(entry["heading_deg"])), key
    assert [(c["n"], c["x"], c["z"]) for c in baked["cps"]] == [(c["n"], *c["game"]) for c in spec["cps"]]


@needs_world
def test_station_checkpoints_are_at_the_station_on_a_road():
    world = _world()
    drivable = [r["pts"] for r in world["roads"] if not r["bridge"] and r["cls"] != "motorway"]
    for name, key in STATION_CPS.items():
        cp = next(c for c in world["anchors"]["cps"] if c["n"] == name)
        lm = world["anchors"]["landmarks"][key]
        assert math.hypot(cp["x"] - lm["x"], cp["z"] - lm["z"]) <= 15, name
        assert _nearest_on_polylines(drivable, cp["x"], cp["z"])[0] <= 2.5, name


EHR = Path(__file__).parents[1] / "anchors_ehrendingen.json"


def test_ehrendingen_anchors_resolve_without_osm_data():
    spec = anchors.load(EHR)
    out = anchors.resolve(spec, OsmData(), geo.Frame(*geo.EHRENDINGEN_ORIGIN))
    b = out["landmarks"]["boendlern"]
    assert (b["x"], b["z"]) == pytest.approx((-149.5, -1464.9), abs=0.5)
    w = out["landmarks"]["wanderweg"]
    assert (w["x"], w["z"]) == pytest.approx(tuple(float(v) for v in geo.Frame(*geo.EHRENDINGEN_ORIGIN).to_game(8.35081, 47.49498)), abs=0.2)   # roughly (671, -28)
    assert "gemeindehausUnterdorf" in out["landmarks"]
    assert len(out["cps"]) == 5 and out["finish"]["n"] == "Im Böndlern"
    assert out["start"][2] == pytest.approx(math.radians(270))
    assert {lb["t"] for lb in out["labels"]} == {"UNTEREHRENDINGEN", "OBEREHRENDINGEN", "IM BÖNDLERN", "LÄGERN"}
    assert anchors.trail_ids(spec) == {28183399, 685318985, 685318986, 28183458, 702208313, 347967817, 702208308, 702208309}   # Hofrain / Steinbuckweg tracks
    assert anchors.keep_ids(spec) == {114544595, 114544599, 102158022, 178797165, 102165202, 178797287}
    assert "jumpRamp" not in spec["landmarks"]
