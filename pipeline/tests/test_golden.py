from pathlib import Path

import numpy as np
import pytest
import shapely

import geo
import osm

PBF = Path(__file__).parents[1] / "cache" / "osm" / "hochrhein.osm.pbf"
MMH = Path(__file__).parents[2] / "data" / "terrain_hochrhein.mmh"
pytestmark = pytest.mark.skipif(not PBF.exists(), reason="regional extract not present (see Task 3)")


@pytest.fixture(scope="module")
def world():
    return osm.build_world(PBF, MMH if MMH.exists() else None, geo.DEFAULT_BBOX, geo.DEFAULT_ORIGIN,
                           30.0, 1000.0, Path(__file__).parents[1] / "anchors.json")


def haupt(world):
    return shapely.MultiLineString([r["pts"] for r in world["roads"] if r["n"] == "Hauptstrasse"
                                    and r["cls"] == "tertiary" and len(r["pts"]) > 1])


def test_hauptstrasse_line(world):
    h = haupt(world)
    assert h.distance(shapely.Point(1830, -287)) < 2
    assert h.distance(shapely.Point(1983, -297)) < 2
    east = [p for line in h.geoms for p in line.coords if p[0] > 2900]
    assert any(p[1] > -300 for p in east)          # bends south-east east of x = 2900


def test_climb_markings(world):
    climb = [r for r in world["roads"] if r["id"] in (1239353959, 122368066)]
    assert climb and all(r["mark"] in ("centre", "centre-solid", "cycle-left", "cycle-right") for r in climb)
    village = [r for r in world["roads"] if r["id"] == 1239353383]
    assert village and village[0]["mark"] == "cycle"


def test_counts_and_size(world, tmp_path):
    assert 1500 < len(world["buildings"]) < 2600
    assert any(b["palette"] == "industrial" for b in world["buildings"])
    assert all(b["id"] != 806132044 for b in world["buildings"])
    assert any(r["id"] == 85692214 and r["bridge"] for r in world["roads"])   # Holzbruecke kept
    assert world["water"] and all(w["rings"] for w in world["water"])
    p = tmp_path / "w.json"
    osm.write_world(p, world)
    assert p.stat().st_size < 6e6
    assert "dsmChimney" in world["anchors"]["landmarks"]


def test_hallenbad_on_its_osm_footprint(world):
    """Playtest 2026-10-01: the Hallenbad Sissila stood 245 m west of its real spot (hand-traced anchor). It sits on the
    OSM footprint (w170395848, Bodenackerstrasse 2) with the footprint's size, and that footprint is not also drawn as a
    generic building."""
    hb = world["anchors"]["landmarks"]["hallenbad"]
    assert abs(hb["x"] - 1968) < 5 and abs(hb["z"] + 374) < 5, hb
    assert hb["size"] == [42.7, 47.1], hb
    assert all(b["id"] != 170395848 for b in world["buildings"])


def test_props(world):
    from collections import Counter
    c = Counter(p["kind"] for p in world["props"])
    assert 1500 <= c["lamp"] <= 2100
    assert 150 <= c["hydrant"] <= 450
    assert 150 <= c["bench"] <= 320
    assert 100 <= c["bin"] <= 220
    lines = [(shapely.LineString(r["pts"]), r["w"]) for r in world["roads"] if len(r["pts"]) > 1]
    tree = shapely.STRtree([g for g, _ in lines])
    for p in world["props"]:
        if p["kind"] not in ("lamp", "hydrant"):
            continue
        pt = shapely.Point(p["x"], p["z"])
        for i in tree.query(pt, predicate="dwithin", distance=10):
            g, w = lines[i]
            assert g.distance(pt) >= w / 2 + 0.5, p


def test_sissle_is_a_stream_line(world):
    """Playtest 2026-10-02: the Sissle was invisible from the bridge over it (flat 500 m water chunks on a stream that
    falls 25 m). It is exported as a line in flow direction, ending at the Rhine."""
    import math
    sissle = [s for s in world["streams"] if s["name"] == "Sissle"]
    assert sissle and sum(sum(math.dist(a, b) for a, b in zip(s["pts"], s["pts"][1:])) for s in sissle) > 3000
    assert all(s["w"] == 12.0 for s in sissle)


def test_rhine_water_is_named(world):
    names = {w["name"] for w in world["water"]}
    assert "Rhein" in names


def test_house_numbers_from_osm(world):
    """#12: numbers come from OSM only -- the way's own tag or address nodes inside the footprint."""
    by_id = {b["id"]: b for b in world["buildings"]}
    assert by_id[155482787]["addr"] == "438"             # own tag, Hauptstrasse 438
    assert by_id[171822862]["addr"] == "5"               # one node inside, Bodenackerstrasse 5
    assert by_id[171822634]["addr"] == "6a–6d"      # Bodenackerstrasse 6: four entrance nodes
    assert world["anchors"]["landmarks"]["hallenbad"]["addr"] == "2"
    n = sum(1 for b in world["buildings"] if "addr" in b)
    assert 1100 <= n <= 1400, n
    assert all("street" not in b for b in world["buildings"])


@pytest.fixture(scope="module")
def world_dsm():
    tiles = list((Path(__file__).parents[1] / "cache" / "swisssurface3d").glob("*.tif"))
    if len(tiles) < 10:
        pytest.skip("run osm.py build --dsm-heights once to fetch swissSURFACE3D")
    return osm.build_world(PBF, MMH if MMH.exists() else None, geo.DEFAULT_BBOX, geo.DEFAULT_ORIGIN,
                           30.0, 1000.0, Path(__file__).parents[1] / "anchors.json", "cache")


def test_building_heights_from_the_surface(world_dsm):
    """#17: on the Swiss side most houses get a measured height instead of the 6 m default."""
    import statistics
    ch = [b for b in world_dsm["buildings"] if b["ring"][0][1] > -600 or b["ring"][0][0] > 0]   # roughly south of the Rhine
    dsm = [b for b in world_dsm["buildings"] if b.get("hsrc") == "dsm"]
    assert len(dsm) >= 0.6 * len(ch), (len(dsm), len(ch))
    hs = [b["h"] for b in dsm]
    assert 3.0 <= statistics.median(hs) <= 12.0 and max(hs) < 80


def test_bodenacker_quarter_heights(world_dsm):
    """Playtest 2026-10-02 / #34: Bodenackerstrasse 6 (w171822634) has 8 storeys, main roof about 25.5 m over the
    ground, and is the tallest building in Sisseln; w1326045746 (apartments) is missing from the 2020 surface and keeps
    its OSM/default height instead of a 2.5 m shed."""
    by_id = {b["id"]: b for b in world_dsm["buildings"]}
    tall = by_id[171822634]
    # #34: the main roof is at 25.4-25.6 m over the ground (rooftop plant to 27.8 m); ground inside the outline pulled the
    # old 10th percentile down to 22.8 m
    assert tall.get("hsrc") == "dsm" and tall["roof"] == "flat" and 24.5 <= tall["h"] <= 26.5, (tall["h"], tall["roof"])
    new = by_id[1326045746]
    assert "hsrc" not in new and new["h"] == 12.0, new["h"]


def test_bodenacker_6_is_the_tallest_in_sisseln(world_dsm):
    """#34: no building inside Sisseln's boundary is taller than Bodenackerstrasse 6, and the eaves fix pushes nothing
    region-wide above the tallest measured building (32.5 m, w155170807)."""
    from shapely.ops import polygonize, unary_union
    lines = [shapely.LineString(b["pts"]) for b in world_dsm["boundaries"] if "Sisseln" in b["names"]]
    sisseln = max(polygonize(unary_union(lines)), key=lambda p: p.area)
    by_id = {b["id"]: b for b in world_dsm["buildings"]}
    tall = by_id[171822634]
    inside = [b for b in world_dsm["buildings"] if sisseln.contains(shapely.Point(b["rect"][0], b["rect"][1]))]
    assert len(inside) > 100 and tall in inside
    taller = [(b["id"], b["h"]) for b in inside if b is not tall and b["h"] >= tall["h"]]
    assert not taller, taller
    assert max(b["h"] for b in world_dsm["buildings"] if b.get("hsrc") == "dsm") <= 32.5


BODENACKER_FLAT = {512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913, 171822799}
BODENACKER_GABLE = {171822943, 171822937, 171822949, 171822938, 171822933, 171822934, 171822932}


def test_bodenacker_row_houses_roof_from_the_ridge(world_dsm):
    """#43 (player, 2026-10-02): Bodenackerstrasse 3, 4, 7, 8, 11, 13, 15, 16, 17 have flat roofs, 10, 12, 14, 18, 20, 21
    pitched ones. The footprint heuristic said flat for every 36 x 13 m block; the measured ridge decides now."""
    by_id = {b["id"]: b for b in world_dsm["buildings"]}
    assert by_id[171822908]["roof"] == "flat" and by_id[171822908]["rh"] < 0.6          # 8a–8f
    assert by_id[171822934]["roof"] == "gable" and by_id[171822934]["rh"] >= 1.5        # 20a–20f
    assert by_id[171822799]["roof"] == "flat" and by_id[171822799]["addr"] == "16a–16c"  # the three-house row
    assert {i: by_id[i]["roof"] for i in BODENACKER_FLAT} == dict.fromkeys(BODENACKER_FLAT, "flat")
    assert {i: by_id[i]["roof"] for i in BODENACKER_GABLE} == dict.fromkeys(BODENACKER_GABLE, "gable")
    assert all(by_id[i]["h"] >= 6.0 for i in BODENACKER_FLAT | BODENACKER_GABLE)        # eaves untouched (#34 is separate)


def test_parking(world):
    """#40: the Hallenbad car parks are exported with bay lines; capacity caps the bays; underground lots are skipped."""
    by_id = {}
    for p in world["parking"]:
        by_id.setdefault(p["id"], []).append(p)
    hb = by_id[26648737][0]
    assert hb["name"] == "Hallenbad-Parkplatz" and hb["bays"] >= 20 and len(hb["lines"]) >= 40 and "sign" in hb
    assert 1 <= by_id[282853090][0]["bays"] <= 18
    assert by_id[290671997][0]["bays"] >= 20
    assert 250 <= len(world["parking"]) <= 400
    houses = shapely.STRtree([shapely.Polygon(b["ring"]).buffer(-0.3) for b in world["buildings"]])   # a line along a wall is fine
    for p in world["parking"]:
        for ax, az, bx, bz in p["lines"]:
            seg = shapely.LineString([(ax, az), (bx, bz)])
            assert not any(houses.geometries[i].intersection(seg).length > 0.5 for i in houses.query(seg)), p["id"]


KEPT_46 = {390621357, 25835477, 92036948, 25049518, 199241726, 171822808, 171822721}


def test_issue46_landmark_buildings_are_kept(world):
    """#46: named landmark buildings far from main roads are kept by id (anchors.json keep_buildings); the
    Kursaal building and the Aqualon Therme were already in the world and stay."""
    ids = {b["id"] for b in world["buildings"]}
    assert KEPT_46 <= ids, KEPT_46 - ids
    assert {91592556, 92039355} <= ids


def test_gemeinde_boundaries(world):
    """#48: admin_level 8 member ways as lines, with both Gemeinde names."""
    b = world["boundaries"]
    assert 20 <= len(b) <= 40
    assert all(x["names"] and all(x["names"]) and len(x["pts"]) >= 2 for x in b)
    se = [x for x in b if x["id"] == 123001743]                  # Sisseln | Eiken
    assert se and all(x["names"] == ["Eiken", "Sisseln"] for x in se)
    line = shapely.MultiLineString([x["pts"] for x in se])
    assert line.distance(shapely.Point(3079.8, -274.3)) < 2      # where it crosses the Hauptstrasse


def test_issue81_landi_tower_anchor(world):
    """#81: the LANDI silo tower (Sisslerstrasse 19.1, Eiken, w197688923) is an anchor with its measured height, and its
    footprint is not also drawn as a generic building."""
    t = world["anchors"]["landmarks"]["landiTurm"]
    assert abs(t["x"] - 1832.7) < 2 and abs(t["z"] - 627.7) < 2, t
    assert t["h"] == 56 and t["kind"] == "silo" and t["size"] == [35.4, 12.6] and t["addr"] == "19.1", t
    assert abs(t["rot"] - 1.4346) < 1e-3, t
    assert all(b["id"] != 197688923 for b in world["buildings"])


def test_rail_bridges_over_laufenburgerstrasse(world):
    """#76: both tracks cross Laufenburgerstrasse (Sisseln) on bridges (OSM w35583301, w1496246793, layer 1)."""
    near = [b for b in world["railBridges"] if shapely.LineString(b["pts"]).distance(shapely.Point(1569.7, 625)) < 6]
    assert len(near) == 2 and all(b["layer"] == 1 for b in near), near
    assert 8 <= len(world["railBridges"]) <= 18
    # no bridge piece left in rail; compare segments, since plain track between two bridges has only bridge end points
    seg = lambda line: {frozenset((tuple(a), tuple(b))) for a, b in zip(line, line[1:])}
    bridge_segs = set().union(*(seg(b["pts"]) for b in world["railBridges"]))
    assert not any(seg(line) & bridge_segs for line in world["rail"])
