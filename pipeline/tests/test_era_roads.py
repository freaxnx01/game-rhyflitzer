"""#530: flag the roads that did not exist in 1952."""
import copy
import json

from shapely.geometry import box

import era_roads as R

SWISS = box(0, -1000, 1000, 1000)  # x < 0 is German
INDUSTRIAL = box(100, 100, 200, 200)
IND_LONLAT = {"type": "Polygon", "coordinates": [[[7.99, 47.55], [7.991, 47.55], [7.991, 47.551], [7.99, 47.551], [7.99, 47.55]]]}


def road(cls, pts, n="", bridge=False, id=1):
    return {"id": id, "n": n, "cls": cls, "w": 6.0, "mark": "none", "bridge": bridge, "layer": 0, "pts": [list(p) for p in pts]}


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


def near(got, expected, tol=0.5):
    assert len(got) == len(expected)
    for (a, b), (ea, eb) in zip(got, expected):
        assert abs(a - ea) < tol and abs(b - eb) < tol


def test_trim_DeadEndWithOldHouseNearStart_KeepsStartToHousePlusPad():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    roads = [main, long_street()]  # 200 m, starts on the main road
    got = R.trim(roads, {}, [house(140, 5)], SWISS)  # footprint spans 40..50 m along the street
    assert list(got) == [1]
    near(got[1], [(0, 50 + R.TRIM_PAD)])


def test_trim_GridOfStreets_KeepsOnlyShortestRouteToHouse():
    m1 = road("primary", [(100, -50), (100, 0), (100, 100), (100, 200), (100, 250)])
    m2 = road("primary", [(300, -50), (300, 0), (300, 100), (300, 200), (300, 250)])
    h = [road("residential", [(100, z), (200, z), (300, z)]) for z in (0, 100, 200)]
    v = [road("residential", [(200, 0), (200, 100)]), road("residential", [(200, 100), (200, 200)])]
    roads = [m1, m2, *h, *v, road("primary", [(100, -50), (300, -50)])]  # the main roads are one network
    hidden = {2: "empty", 4: "empty"}  # the outer streets have no old house
    got = R.trim(roads, hidden, [house(205, 105)], SWISS)
    assert sorted(got) == [3, 6]  # the lower vertical street (5) ends 7 m from the house, so the house is not its own
    near(got[3], [(95, 200)])  # the middle street keeps the house stretch plus the shorter (east) route
    near(got[6], [(0, 25)])


def test_trim_NoRouteToNetwork_FallsBackToWhole():
    hidden_a = road("residential", [(50, 0), (100, 0)])
    hidden_b = road("residential", [(300, 0), (350, 0)])
    roads = [hidden_a, hidden_b, long_street()]
    assert R.trim(roads, {0: "empty", 1: "empty"}, [house(140, 5)], SWISS) == {}


def test_trim_ChainThroughNeighbour_KeepsTheLink():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    b = road("residential", [(100, 0), (200, 0), (300, 0)])
    a = road("residential", [(200, 0), (200, 200)])  # joins B at its middle vertex, old house near its far end
    got = R.trim([main, b, a], {}, [house(120, 5), house(205, 170)], SWISS)
    near(got[1], [(0, 100)])  # B between the main road and A's junction stays, its far end goes
    near(got[2], [(0, 190)])


def test_trim_TwoIntervalsOnOneRoad():
    m1 = road("primary", [(100, -100), (100, 0), (100, 100)])
    m2 = road("primary", [(700, -100), (700, 0), (700, 100)])
    long = road("residential", [(100, 0), (300, 0), (500, 0), (700, 0)])  # house near its start
    side = road("residential", [(500, 0), (500, 200)])  # house far up; its shortest route runs along the long street's east end
    tie = road("primary", [(100, -100), (700, -100)])
    got = R.trim([m1, m2, long, side, tie], {}, [house(130, 5), house(505, 100)], SWISS)
    near(got[2], [(0, 50), (400, 600)])
    near(got[3], [(0, 120)])


def test_trim_MainRoadsAndGermanSideNeverTrimmed():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    tert = road("tertiary", [(100, 0), (300, 0)])
    german = road("residential", [(-300, 50), (-100, 50)])
    german_main = road("primary", [(-100, -100), (-100, 100)])
    roads = [main, tert, german, german_main]
    assert R.trim(roads, {}, [house(140, 5), house(-250, 55)], SWISS) == {}


def test_trim_CornerHouse_CountsForNearestRoadOnly():
    main = road("primary", [(100, -100), (100, 0), (100, 35), (100, 100)])
    a = road("residential", [(100, 0), (300, 0)])
    b = road("residential", [(100, 35), (300, 35)])
    got = R.trim([main, a, b], {}, [house(150, 5)], SWISS)  # footprint z 5..15: 5 m from A, 20 m from B
    assert list(got) == [1]
    near(got[1], [(0, 70)])


def test_trim_RestoredRoad_KeepsOnlyTheRouteMetres():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    empty = road("residential", [(100, 0), (300, 0), (500, 0)])  # no old house: hidden, but the only link of the island
    island = road("primary", [(300, 0), (300, 100)])
    got = R.trim([main, empty, island], {1: "empty"}, [], SWISS)
    assert list(got) == [1]
    near(got[1], [(0, 200)])


def test_trim_UnusedEmptyRoad_IsNotListed():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    unused = road("residential", [(100, 50), (300, 50)])
    assert R.trim([main, unused], {1: "empty"}, [], SWISS) == {}


def test_trim_ChainedIslands_JoinedThroughTheFirstIsland():
    main = road("primary", [(100, -100), (100, 0), (100, 100)])
    link1 = road("residential", [(100, 0), (300, 0), (400, 0)])
    first = road("unclassified", [(300, 0), (500, 0)])
    link2 = road("residential", [(500, 0), (500, 100), (500, 300)])
    second = road("unclassified", [(500, 100), (700, 100)])
    got = R.trim([main, link1, first, link2, second], {1: "empty", 3: "empty"}, [], SWISS)
    near(got[1], [(0, 200)])
    near(got[3], [(0, 100)])  # the second island reaches the network over the first one


def test_trim_RouteThroughAJoinedIsland_BeatsALongEmptyRoad():
    main = road("primary", [(100, -100), (100, 0), (100, 300)])
    link = road("residential", [(100, 0), (300, 0), (400, 0)])
    island = road("unclassified", [(300, 0), (500, 0)])
    street = road("residential", [(500, 0), (900, 0)])  # old house near its far end
    long_empty = road("residential", [(900, 0), (900, 300), (100, 300)])
    got = R.trim([main, link, island, street, long_empty], {1: "empty", 4: "empty"}, [house(870, 5)], SWISS)
    assert 4 not in got
    assert R._plan([main, link, island, street, long_empty], {1: "empty", 4: "empty"}, [house(870, 5)], SWISS)[0][4] == []
    near(got[1], [(0, 200)])
    near(got[3], [(0, 390)])


def test_trim_ClusterOfMainRoads_StaysConnectedThroughAResidentialLink():
    main_a = road("primary", [(100, -100), (100, 0)])
    main_b = road("primary", [(100, 0), (100, 100)])
    link = road("residential", [(100, 0), (300, 0), (500, 0)])  # no old house, but the cluster's only link
    cluster = road("tertiary", [(300, -50), (300, 0), (300, 50)])
    got = R.trim([main_a, main_b, link, cluster], {}, [], SWISS)
    near(got[2], [(0, 200)])


def test_trim_BridgeApproach_ReachesThePointNearestTheBridgeEnd():
    main_a = road("primary", [(100, -100), (100, 0)])
    main_b = road("primary", [(100, 0), (100, 100)])
    street = road("residential", [(100, 0), (200, 0), (294.5, 0), (300, 0), (350, 0)])
    bridge = road("secondary", [(300, 3), (400, 3)], bridge=True)  # its end is 3 m off the street, beside vertex 294.5 too
    far_bank = road("primary", [(400, -100), (400, 3), (400, 100)])
    got = R.trim([main_a, main_b, street, bridge, far_bank], {}, [house(150, 5)], SWISS)
    near(got[2], [(0, 200)])  # not the 194.5 m of the snapped vertex


def roads_off_main(world, swiss):
    """Indices of Swiss roads with kept metres (a whole kept road or a keep1952 interval) not joined to the main kept network.

    Pieces join when their geometries lie within 0.6 m (so a T-junction without a shared vertex counts); a kept bridge
    end also joins every piece within BRIDGE_SNAP. The main network is the component with the most Swiss pieces.
    """
    from shapely import STRtree
    from shapely.geometry import Point
    from shapely.ops import substring
    pieces, geoms = [], []
    for index, road_ in enumerate(world["roads"]):
        if road_.get("modern"):
            continue
        line = R.LineString(road_["pts"])
        mid = line.interpolate(0.5, normalized=True)
        for a, b in road_.get("keep1952") or [[0.0, line.length]]:
            if b - a > 1e-6:
                pieces.append((swiss.contains(mid), index, bool(road_.get("bridge")), line))
                geoms.append(substring(line, a, b))
    tree = STRtree(geoms)
    parent = list(range(len(pieces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i, geom in enumerate(geoms):
        for j in tree.query(geom.buffer(0.6), predicate="intersects"):
            if geom.distance(geoms[int(j)]) <= 0.6:
                parent[find(i)] = find(int(j))
        if pieces[i][2]:
            line = pieces[i][3]
            for end in (Point(line.coords[0]), Point(line.coords[-1])):
                for j in tree.query(end.buffer(R.BRIDGE_SNAP), predicate="intersects"):
                    parent[find(i)] = find(int(j))
    count = {}
    for i, piece in enumerate(pieces):
        if piece[0]:
            count[find(i)] = count.get(find(i), 0) + 1
    main = max(count, key=lambda root: (count[root], -root)) if count else None
    return {pieces[i][1] for i in range(len(pieces)) if pieces[i][0] and find(i) != main}


def pre_trim(world, swiss, industrial_lonlat):
    """The world as the pipeline flagged it before the trim: classify plus whole-road reconnect."""
    before = copy.deepcopy(world)
    ind = R._to_game(industrial_lonlat, R.Frame(world["origin"]["lat"], world["origin"]["lon"]))
    hidden = R.classify(before["roads"], before["buildings"], swiss, ind)
    for i in R.reconnect(before["roads"], hidden, swiss):
        del hidden[i]
    for i in hidden:
        before["roads"][i]["modern"] = True
    return before


def test_trim_TJunctionWithoutSharedVertex_StillRoutes():
    main = road("primary", [(100, -100), (100, 100)])  # no vertex where the link ends
    link = road("service", [(100.14, 0), (200, 0)])
    street = road("residential", [(200, 0), (500, 0)])  # old house near its far end
    got = R.trim([main, link, street], {1: "empty"}, [house(470, 5)], SWISS)
    near(got[2], [(0, 290)])
    kept, _ = R._plan([main, link, street], {1: "empty"}, [house(470, 5)], SWISS)
    assert kept[1] == [(0.0, kept[1][0][1])] and kept[1][0][1] > 99


def test_trim_NetworkEndOnAStreetSegment_StartsTheRouteThere():
    main_a = road("primary", [(100, -100), (100, 0)])
    main_b = road("primary", [(100, -100), (300, -100), (300.1, -0.2)])  # its end touches the street mid-segment
    street = road("residential", [(100, 0), (500, 0)])  # old house near its far end
    got = R.trim([main_a, main_b, street], {}, [house(470, 5)], SWISS)
    near(got[2], [(200, 390)])


def test_apply_ClusterBehindResidentialLink_IsNotCutOff():
    ind = {"type": "Polygon", "coordinates": [[[7.99, 47.55], [7.991, 47.55], [7.991, 47.551], [7.99, 47.551], [7.99, 47.55]]]}
    world = {"origin": {"lat": 47.5506, "lon": 7.9671},
             "roads": [road("primary", [(100, -100), (100, 0)]), road("primary", [(100, 0), (100, 100)]),
                       road("residential", [(100, 0), (300, 0), (500, 0)]),
                       road("tertiary", [(300, -50), (300, 0), (300, 50)])],
             "buildings": [house(150, 5)]}
    swiss = R._outline_to_game(SWISS_LV95(), R.Frame(47.5506, 7.9671))
    before = pre_trim(world, swiss, ind)
    R.apply(world, SWISS_LV95(), ind)
    assert roads_off_main(world, swiss) <= roads_off_main(before, swiss)


def test_apply_RoutedEmptyRoadKeepsRoute_UnusedResidentialIsHidden():
    ind = {"type": "Polygon", "coordinates": [[[7.99, 47.55], [7.991, 47.55], [7.991, 47.551], [7.99, 47.551], [7.99, 47.55]]]}
    world = {"origin": {"lat": 47.5506, "lon": 7.9671},
             "roads": [road("primary", [(100, -100), (100, 0), (100, 50), (100, 100)]),
                       road("residential", [(100, 0), (300, 0), (500, 0)]),  # no old house: empty, but the island's only link
                       road("primary", [(300, 0), (300, 100)]),  # the island
                       road("residential", [(100, 50), (250, 50)]),  # old house on it
                       road("residential", [(100, 70), (250, 70)])],  # house within 25 m, but nearer to the street above
             "buildings": [house(150, 45)]}
    outline = SWISS_LV95()
    counts = R.apply(world, outline, ind)
    first = json.dumps(world, ensure_ascii=False, separators=(",", ":"))
    roads_ = world["roads"]
    assert roads_[1]["keep1952"] == [[0.0, 200.0]] and "modern" not in roads_[1]
    assert roads_[3]["keep1952"] == [[0.0, 70.0]] and "modern" not in roads_[3]
    assert roads_[4]["modern"] is True and "keep1952" not in roads_[4]
    assert (counts["restored"], counts["trimmed"], counts["empty"]) == (1, 2, 1)
    assert R.apply(world, outline, ind) == counts
    assert json.dumps(world, ensure_ascii=False, separators=(",", ":")) == first
    assert not any("keep1952" in r and "modern" in r for r in roads_)


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
    assert world["roads"][1]["keep1952"][0][0] == 0
    assert "modern" not in world["roads"][1]
    counts = R.apply(world, outline, ind)
    assert json.dumps(world, ensure_ascii=False, separators=(",", ":")) == first
    assert counts["trimmed"] == 1
    assert not any("keep1952" in r and "modern" in r for r in world["roads"])


def test_apply_FridolinsbrueckeHidden_FlagsItsLandmarkAnchor():
    ind = {"type": "Polygon", "coordinates": [[[7.99, 47.55], [7.991, 47.55], [7.991, 47.551], [7.99, 47.551], [7.99, 47.55]]]}
    world = {"origin": {"lat": 47.5506, "lon": 7.9671},
             "roads": [road("primary", [(100, 0), (300, 0)]), road("secondary", [(300, 10), (300, 200)], n="Fridolinsbrücke", bridge=True)],
             "buildings": [], "anchors": {"landmarks": {"fridolinsbruecke": {"x": 300, "z": 100}, "muenster": {"x": 5, "z": 5}}}}
    R.apply(world, SWISS_LV95(), ind)
    lms = world["anchors"]["landmarks"]
    assert lms["fridolinsbruecke"]["modern"] is True and "modern" not in lms["muenster"]
    world["roads"][1]["n"] = "Other"
    R.apply(world, SWISS_LV95(), ind)
    assert "modern" not in world["anchors"]["landmarks"]["fridolinsbruecke"]


def test_traced_house_keeps_residential_street():
    ind = {"type": "Polygon", "coordinates": [[[7.99, 47.55], [7.991, 47.55], [7.991, 47.551], [7.99, 47.551], [7.99, 47.55]]]}
    world = {"origin": {"lat": 47.5506, "lon": 7.9671},
             "roads": [road("primary", [(100, -100), (100, 0), (100, 100)]), road("residential", [(100, 50), (300, 50)])],
             "buildings": [], "era": {"year": 1952}}
    R.apply(world, SWISS_LV95(), ind)
    assert world["roads"][1]["modern"] is True
    world["era"]["houses"] = [house(150, 45)]
    R.apply(world, SWISS_LV95(), ind)
    assert "modern" not in world["roads"][1]


def test_late_ids_are_modern_on_either_side_whatever_their_class():
    roads = [road("tertiary", [(100, 0), (300, 0)], n="Südspange", id=-42001),
             road("cycleway", [(100, 10), (300, 10)], id=-42002),
             road("unclassified", [(-300, 0), (-100, 0)], n="Südspange", id=-42003),
             road("unclassified", [(100, 90), (300, 90)], n="Geuerenstrasse", id=-42004)]
    assert classify(roads) == {0: "late", 1: "late", 2: "late"}


def test_late_beats_motorway_and_industrial():
    roads = [road("motorway", [(100, 0), (300, 0)], id=-42001), road("service", [(120, 150), (180, 150)], id=-42003)]
    assert classify(roads, industrial=INDUSTRIAL) == {0: "late", 1: "late"}


def _sign_world(late=True):
    lm = {name: {"x": 500.0, "z": 0.0, "kind": "baustelle", "h": None, "rot": 0.0} for name in R.SUEDSPANGE_SIGNS}
    lm["muenster"] = {"x": 600.0, "z": 0.0, "kind": "church", "h": None, "rot": 0.0}
    return {"origin": {"lat": 47.5506, "lon": 7.9671},
            "roads": [road("tertiary", [(100, 0), (300, 0)], id=-42001 if late else 7)],
            "buildings": [], "anchors": {"landmarks": lm}}


def test_apply_flags_the_suedspange_signs_and_counts_late():
    w = _sign_world()
    counts = R.apply(w, SWISS_LV95(), IND_LONLAT)
    assert counts["late"] == 1
    lm = w["anchors"]["landmarks"]
    assert all(lm[n]["modern"] is True and list(lm[n])[-1] == "modern" for n in R.SUEDSPANGE_SIGNS)
    assert "modern" not in lm["muenster"]


def test_apply_clears_a_stale_sign_flag_when_no_late_road_is_hidden():
    w = _sign_world(late=False)
    for n in R.SUEDSPANGE_SIGNS:
        w["anchors"]["landmarks"][n]["modern"] = True
    R.apply(w, SWISS_LV95(), IND_LONLAT)
    assert all("modern" not in w["anchors"]["landmarks"][n] for n in R.SUEDSPANGE_SIGNS)
