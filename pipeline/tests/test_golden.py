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
