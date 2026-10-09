"""#127: listed ways (Hofrain / Steinbuckweg) become drivable gravel trails."""
from pathlib import Path

import shapely

import anchors
import geo
import osm_read
import world_roads

FIX = Path(__file__).parent / "fixtures" / "trails.osm"
FRAME = geo.Frame(*geo.EHRENDINGEN_ORIGIN)
CLIP = shapely.box(-5000, -5000, 5000, 5000)


def _roads(trail_ids):
    data = osm_read.read(FIX, FRAME)
    roads, _ = world_roads.build(data.ways, data.nodes, data.way_nodes, CLIP, trail_ids=trail_ids)
    return {r["id"]: r for r in roads}


def test_trail_ways_are_kept_as_gravel_trails():
    roads = _roads({10, 11, 12})
    assert set(roads) == {10, 11}                                 # 12 is a tunnel, 13 is not listed
    for r in roads.values():
        assert r["trail"] is True and r["w"] == 3.0 and r["mark"] == "none"


def test_without_trail_ids_tracks_and_paths_stay_dropped():
    assert _roads(frozenset()) == {}


def test_trail_ids_from_spec():
    assert anchors.trail_ids({"trails": ["w28183399", "w28183458"]}) == {28183399, 28183458}
    assert anchors.trail_ids({}) == set()
