import pytest
import shapely

import world_extra_roads as X
from osm_read import Way

CLIP = shapely.box(-1000, -1000, 1000, 1000)
LINES = {1: shapely.LineString([(0, 0), (100, 0)]), 2: shapely.LineString([(100, 50), (100, 0)]),
         3: shapely.LineString([(0, 0), (0, -100), (-50, -100)])}


def test_assemble_turns_ways_and_drops_shared_vertices():
    assert X.assemble([{"osm": "w1"}, {"osm": "w2"}, {"game": [150, 50]}], LINES) == [(0, 0), (100, 0), (100, 50), (150, 50)]


def test_assemble_sub_range_runs_from_to():
    pts = X.assemble([{"osm": "w3", "from": [0, -50], "to": [-20, -100]}], LINES)
    assert pts == [pytest.approx((0, -50)), pytest.approx((0, -100)), pytest.approx((-20, -100))]


def test_assemble_rejects_far_points_and_missing_ways():
    with pytest.raises(ValueError):
        X.assemble([{"osm": "w1", "from": [50, 40]}], LINES)
    with pytest.raises(KeyError):
        X.assemble([{"osm": "w9"}], LINES)
