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
