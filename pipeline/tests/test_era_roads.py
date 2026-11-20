"""#530: flag the roads that did not exist in 1952."""
import copy
import json

from shapely.geometry import box

import era_roads as R

SWISS = box(0, -1000, 1000, 1000)  # x < 0 is German
INDUSTRIAL = box(100, 100, 200, 200)


def road(cls, pts, n="", bridge=False):
    return {"id": 1, "n": n, "cls": cls, "w": 6.0, "mark": "none", "bridge": bridge, "layer": 0, "pts": [list(p) for p in pts]}


def house(x, z, modern=False, size=10.0):
    b = {"id": 1, "h": 6.0, "roof": "gable", "palette": "village", "ring": [[x, z], [x + size, z], [x + size, z + size], [x, z + size]]}
    if modern:
        b["modern"] = True
    return b


def classify(roads, buildings=(), industrial=None):
    return R.classify(list(roads), list(buildings), SWISS, industrial if industrial is not None else box(5000, 5000, 5001, 5001))


def test_motorway_on_swiss_side_is_modern():
    roads = [road("motorway", [(100, 0), (300, 0)]), road("motorway_link", [(100, 50), (300, 50)]),
             road("motorway", [(-300, 0), (-100, 0)])]
    assert classify(roads) == {0: "motorway", 1: "motorway"}


def test_fridolinsbruecke_is_modern_on_both_banks():
    roads = [road("primary", [(100, 0), (300, 0)], n="Fridolinsbrücke"), road("primary", [(-300, 0), (-100, 0)], n="Fridolinsbrücke"),
             road("primary", [(100, 90), (300, 90)], n="Hauptstrasse")]
    assert classify(roads) == {0: "bridge", 1: "bridge"}


def test_minor_road_in_industrial_site_is_modern():
    roads = [road("service", [(100, 150), (160, 150), (160, 150.1), (200, 150)]),  # fully inside, longer
             road("service", [(140, 150), (240, 150)]),  # 60 % inside
             road("service", [(160, 150), (260, 150)]),  # 40 % inside
             road("primary", [(110, 120), (190, 120)])]
    got = classify(roads, [house(500, 500)], INDUSTRIAL)
    assert got[0] == "industrial"
    assert got[1] == "industrial"
    assert got.get(2) != "industrial"
    assert 3 not in got


def test_residential_without_old_house_is_modern():
    r = [road("residential", [(100, 0), (150, 0)])]
    assert classify(r, [house(100, 5, modern=True)]) == {0: "empty"}
    assert classify(r, [house(100, 20)]) == {}  # footprint 20 m away
    assert classify(r, [house(100, 30)]) == {0: "empty"}
    assert classify(r, [house(-100, 5)]) == {0: "empty"}  # German house does not count


def test_main_and_unclassified_roads_stay_without_houses():
    roads = [road("tertiary", [(100, 0), (150, 0)]), road("unclassified", [(100, 50), (150, 50)])]
    assert classify(roads) == {}


def test_reconnect_restores_access_to_isolated_old_street():
    a = road("primary", [(100, 0), (200, 0)])
    b = road("residential", [(200, 0), (200, 100)])
    c = road("residential", [(200, 100), (300, 100)])
    roads = [a, b, c]
    buildings = [house(250, 105)]
    hidden = classify(roads, buildings)
    assert hidden == {1: "empty"}
    assert R.reconnect(roads, hidden) == {1}
    c2 = road("residential", [(300, 100), (200, 0)])  # touches A's end directly
    c2["pts"] = [[200, 0], [300, 100]]
    roads2 = [a, b, c2]
    hidden2 = classify(roads2, buildings)
    assert R.reconnect(roads2, hidden2) == set()


def test_reconnect_ignores_a_cut_off_german_network():
    german = road("primary", [(-300, 0), (-100, 0), (-100, 10), (-90, 10)])
    german2 = road("primary", [(-100, 0), (-100, -50)])
    swiss_a = road("primary", [(100, 0), (200, 0)])
    link = road("residential", [(-90, 10), (100, 0)])
    roads = [german, german2, swiss_a, link]
    hidden = {3: "empty"}
    assert R.reconnect(roads, hidden, SWISS) == set()


def test_reconnect_joins_a_kept_bridge_to_the_network_through_an_empty_road():
    a = road("primary", [(100, 0), (200, 0)])
    b = road("residential", [(200, 0), (200, 100)])
    bridge = road("secondary", [(200, 111), (200, 300)], bridge=True)  # its end is 11 m from B's far end, no shared vertex
    roads = [a, b, bridge]
    assert R.reconnect(roads, {1: "empty"}) == {1}


def test_reconnect_leaves_a_bridge_alone_that_is_already_joined():
    a = road("primary", [(100, 0), (200, 0)])
    bridge = road("secondary", [(200, 10), (200, 300)], bridge=True)
    assert R.reconnect([a, bridge], {}) == set()


def test_apply_is_idempotent_and_byte_stable():
    world = {"origin": {"lat": 47.5506, "lon": 7.9671},
             "roads": [road("motorway", [(100, 0), (300, 0)]), road("primary", [(100, 90), (300, 90)])],
             "buildings": []}
    outline = SWISS_LV95()
    ind = {"type": "Polygon", "coordinates": [[[7.99, 47.55], [7.991, 47.55], [7.991, 47.551], [7.99, 47.551], [7.99, 47.55]]]}
    w1 = copy.deepcopy(world)
    R.apply(w1, outline, ind)
    w2 = copy.deepcopy(w1)
    R.apply(w2, outline, ind)
    dump = lambda w: json.dumps(w, ensure_ascii=False, separators=(",", ":"))
    assert dump(w1) == dump(w2)
    assert list(w1["roads"][0])[-1] == "modern"
    w1["roads"][1]["modern"] = True  # stale flag from an older run
    R.apply(w1, outline, ind)
    assert "modern" not in w1["roads"][1]


def SWISS_LV95():
    from geo import Frame
    fr = Frame(47.5506, 7.9671)
    return box(fr.e0 + 0, fr.n0 - 1000, fr.e0 + 1000, fr.n0 + 1000)


def long_street(pts=((100, 0), (300, 0)), cls="residential"):
    return road(cls, pts)


def test_trim_DeadEndWithOldHouseNearStart_KeepsStartToHousePlusPad():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    street = long_street()  # 200 m, starts on the main road
    roads = [main, street]
    got = R.trim(roads, {}, [house(140, 5)], SWISS)  # footprint spans 40..50 m along the street
    assert list(got) == [1]
    a, b = got[1]
    assert a == 0
    assert abs(b - (50 + R.TRIM_PAD)) < 0.5


def test_trim_BothEndsOnKeptNetwork_KeepsWhole():
    roads = [road("primary", [(100, -100), (100, 0), (100, 100)]), road("primary", [(300, -100), (300, 0), (300, 100)]), long_street()]
    assert R.trim(roads, {}, [house(140, 5)], SWISS) == {}


def test_trim_NoConnectedEnd_FallsBackToWhole():
    hidden_a = road("residential", [(50, 0), (100, 0)])
    hidden_b = road("residential", [(300, 0), (350, 0)])
    roads = [hidden_a, hidden_b, long_street()]
    assert R.trim(roads, {0: "empty", 1: "empty"}, [house(140, 5)], SWISS) == {}


def test_trim_ChainCutOff_RestoresFull():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    b = road("residential", [(100, 0), (200, 0), (300, 0)])  # old house near the main-road end
    a = road("residential", [(200, 0), (400, 0)])  # joins B at B's middle vertex, old house near its far end
    roads = [main, b, a]
    got = R.trim(roads, {}, [house(120, 5), house(370, 5)], SWISS)
    assert 1 not in got  # B comes back full, otherwise A's stretch hangs in the air
    assert got[2][0] == 0  # A keeps its link to B


def test_trim_MainRoadsAndGermanSideNeverTrimmed():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    tert = road("tertiary", [(100, 0), (300, 0)])
    german = road("residential", [(-300, 50), (-100, 50)])
    german_main = road("primary", [(-100, -100), (-100, 100)])
    roads = [main, tert, german, german_main]
    assert R.trim(roads, {}, [house(140, 5), house(-250, 55)], SWISS) == {}


def test_trim_RestoredRoadIsNeverTrimmed():
    roads = [road("primary", [(100, -100), (100, 0), (100, 100)]), long_street()]
    assert R.trim(roads, {}, [house(140, 5)], SWISS, restored={1}) == {}


def test_apply_Idempotent_WithKeep1952():
    from geo import Frame
    fr = Frame(47.5506, 7.9671)
    ind = {"type": "Polygon", "coordinates": [[[7.99, 47.55], [7.991, 47.55], [7.991, 47.551], [7.99, 47.551], [7.99, 47.55]]]}
    world = {"origin": {"lat": 47.5506, "lon": 7.9671},
             "roads": [road("primary", [(100, -100), (100, 0), (100, 100)]), long_street()],
             "buildings": [house(140, 5)]}
    outline = SWISS_LV95()
    R.apply(world, outline, ind)
    first = json.dumps(world, ensure_ascii=False, separators=(",", ":"))
    assert world["roads"][1]["keep1952"][0] == 0
    assert "modern" not in world["roads"][1]
    counts = R.apply(world, outline, ind)
    assert json.dumps(world, ensure_ascii=False, separators=(",", ":")) == first
    assert counts["trimmed"] == 1
    assert not any("keep1952" in r and "modern" in r for r in world["roads"])
