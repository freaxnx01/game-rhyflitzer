"""#127: the Ehrendingen world from its own extract (skips until pipeline/cache/osm/ehrendingen.osm.pbf exists)."""
from pathlib import Path

import pytest
import shapely

import geo
import osm

PBF = Path(__file__).parents[1] / "cache" / "osm" / "ehrendingen.osm.pbf"
MMH = Path(__file__).parents[2] / "data" / "terrain_ehrendingen.mmh"
ANCHORS = Path(__file__).parents[1] / "anchors_ehrendingen.json"
pytestmark = pytest.mark.skipif(not PBF.exists(), reason="Ehrendingen extract not present (plan Task 9)")


@pytest.fixture(scope="module")
def world():
    return osm.build_world(PBF, MMH if MMH.exists() else None, geo.EHRENDINGEN_BBOX, geo.EHRENDINGEN_ORIGIN,
                           30.0, 1000.0, ANCHORS)


def test_box_and_boendlern(world):
    assert world["bbox"] == list(geo.EHRENDINGEN_BBOX)
    assert any(r["id"] == 54804175 for r in world["roads"])


def test_wanderweg_is_a_trail_road(world):
    w = world["anchors"]["landmarks"]["wanderweg"]
    trails = [r for r in world["roads"] if r.get("trail")]
    assert trails
    near = shapely.MultiLineString([r["pts"] for r in trails if len(r["pts"]) > 1]).distance(shapely.Point(w["x"], w["z"]))
    assert near < 30


def test_kept_buildings_and_counts(world):
    ids = {b["id"] for b in world["buildings"]}
    assert {114544595, 114544599, 102158022, 178797165, 102165202, 178797287} <= ids
    assert 400 < len(world["buildings"]) < 2500
    assert len(world["anchors"]["cps"]) == 5


def test_size_budget(world, tmp_path):
    out = tmp_path / "w.json"
    osm.write_world(out, world)
    assert out.stat().st_size < 4_000_000
