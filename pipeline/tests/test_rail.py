import shapely

import world_rail as RL
from osm_read import Way

CLIP = shapely.box(-1000, -1000, 1000, 1000)


def way(i, tags, pts):
    return Way(i, tags, shapely.LineString(pts))


def test_track_stays_rail_and_bridge_moves_to_rail_bridges():
    rail, bridges = RL.build([way(1, {"railway": "rail"}, [(0, 0), (100.04, 0)]),
                              way(2, {"railway": "rail", "bridge": "yes", "layer": "1"}, [(100.04, 0), (130, 0)])], CLIP)
    assert rail == [[[0.0, 0.0], [100.0, 0.0]]]
    assert bridges == [{"pts": [[100.0, 0.0], [130.0, 0.0]], "layer": 1}]


def test_missing_layer_on_a_bridge_is_1_and_explicit_layer_is_kept():
    _, bridges = RL.build([way(1, {"railway": "rail", "bridge": "viaduct"}, [(0, 0), (10, 0)]),
                           way(2, {"railway": "rail", "bridge": "yes", "layer": "2"}, [(0, 50), (10, 50)])], CLIP)
    assert sorted(b["layer"] for b in bridges) == [1, 2]


def test_bridge_pieces_sharing_an_endpoint_merge_per_layer():
    _, bridges = RL.build([way(1, {"railway": "rail", "bridge": "yes"}, [(0, 0), (16, 0)]),
                           way(2, {"railway": "rail", "bridge": "yes"}, [(16, 0), (34, 2)]),
                           way(3, {"railway": "rail", "bridge": "yes"}, [(0, 7), (34, 9)])], CLIP)
    assert len(bridges) == 2
    assert [[0.0, 0.0], [16.0, 0.0], [34.0, 2.0]] in [b["pts"] for b in bridges]


def test_non_rail_and_outside_ways_are_ignored():
    rail, bridges = RL.build([way(1, {"railway": "disused"}, [(0, 0), (10, 0)]),
                              way(2, {"highway": "primary"}, [(0, 0), (10, 0)]),
                              way(3, {"railway": "rail", "bridge": "yes"}, [(5000, 0), (5010, 0)])], CLIP)
    assert rail == [] and bridges == []


def test_bridge_no_is_a_track():
    rail, bridges = RL.build([way(1, {"railway": "rail", "bridge": "no"}, [(0, 0), (10, 0)])], CLIP)
    assert len(rail) == 1 and bridges == []
