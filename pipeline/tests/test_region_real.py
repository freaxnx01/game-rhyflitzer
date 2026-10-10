"""#179: build_world on real OSM -- the cached Ehrendingen extract (#127, 1.9 MB, not committed). Terrain is faked
flat, nothing is downloaded; skipped where the extract or a Node that runs the game's A* is missing (CI)."""
import json
from pathlib import Path

import pytest
import shapely

import race
import region
from tests.test_race import bridge_works
from tests.test_region import flat_terrain

PBF = Path(__file__).parents[1] / "cache" / "osm" / "ehrendingen.osm.pbf"
RECT = (2666500.0, 1257750.0, 2670000.0, 1261750.0)     # 3.5 x 4 km: Ehrendingen, the Lägern slope in the south
pytestmark = [pytest.mark.skipif(not PBF.exists(), reason="cache/osm/ehrendingen.osm.pbf not present"),
              pytest.mark.skipif(not bridge_works(), reason="no Node 22+ on PATH that runs the game's A*")]


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    mp.setattr(region.terrain, "sample", lambda b, o, s, c, d: flat_terrain(b, o, s, 0.0, c, d))
    files = region.build_world(RECT, tmp_path_factory.mktemp("real"), pbf=PBF, dsm=False)
    mp.undo()
    return json.loads(files["world"].read_text("utf-8"))


def test_name_and_places(world):
    r = world["region"]
    # the documented osmium cut gives "Ehrendingen"; a cut with more complete admin_level=8 lines adds Wettingen, the
    # neighbour across the Lägern in the south of the frame -- any other second Gemeinde is wrong
    assert r["name"] in {"Ehrendingen", "Ehrendingen · Wettingen"} and any(v["t"] == "EHRENDINGEN" for v in r["villages"])
    assert {"Ehrendingen", "Kath. Kirche", "Reformierte Kirche Ehrendingen"} <= {e["n"] for e in r["jlist"]}


def test_race_legs_are_drivable_and_in_range(world):
    a = world["anchors"]
    pts = [tuple(a["start"][:2])] + [(c["x"], c["z"]) for c in a["cps"] + [a["finish"]]]
    _, lens = race.route_lengths(world["roads"], pts, list(zip(range(6), range(1, 7))))
    assert len(a["cps"]) == 5 and len(lens) == 6
    assert all(race.LEG_MIN <= v <= race.LEG_MAX for v in lens.values())


def test_forests_match_the_smart_cut(world):
    area = sum(shapely.Polygon(f["ring"]).area for f in world["forests"])
    assert 30 <= len(world["forests"]) <= 60 and 4.0e6 <= area <= 6.0e6       # 44 parts, 4.97 km2 on 2026-10-09
