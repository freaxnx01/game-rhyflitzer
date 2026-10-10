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
    assert 200 < len(world["buildings"]) < 400   # measured 243 (2026-10-09): near-road, landmark and big buildings only, like Hochrhein
    assert len(world["anchors"]["cps"]) == 5


def test_size_budget(world, tmp_path):
    out = tmp_path / "w.json"
    osm.write_world(out, world)
    assert out.stat().st_size < 4_000_000


def test_forests(world):
    """#13: the second region's woods. Measured 2026-10-10: 53 parts, 4.13 km2, the largest 229 ha, 132 ha on the
    Lägern slope. A cut that loses a wood relation crossing its edge (osmium -s simple) shows up here as missing area."""
    f = world["forests"]
    assert 40 <= len(f) <= 70, len(f)
    polys = [shapely.Polygon(p["ring"], p.get("holes", [])) for p in f]
    assert 3.6e6 <= sum(p.area for p in polys) <= 4.6e6
    assert max(p.area for p in polys) >= 1.5e6
    assert sum(p.intersection(shapely.box(-845, 1199, 1155, 2065)).area for p in polys) >= 1.0e6   # around the LÄGERN label
    woods = shapely.unary_union(polys)
    for r in world["roads"]:          # whole outlines, not vertices: the 1 m simplification may pull a chord 1 m into the corridor
        if len(r["pts"]) > 1:
            assert woods.distance(shapely.LineString(r["pts"])) >= r["w"] / 2 + 4.0, r["id"]
