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


PIECE = {"id": -1, "n": "Südspange", "tags": {"highway": "tertiary", "lanes": "2"}, "w": 8.0,
         "path": {"id": -2, "w": 3.0, "off": 7.5}, "via": [{"game": [200, 0]}, {"game": [0, 0]}]}


def test_empty_spec_changes_nothing():
    assert X.apply({}, [], [{"id": 1}], [[0, 0, 1]], CLIP) == ([{"id": 1}], [[0, 0, 1]], [])


def test_piece_becomes_a_marked_road_with_its_path_on_the_north():
    roads, junctions, grades = X.apply({"s": {"pieces": [PIECE]}}, [], [], [], CLIP)
    road = [r for r in roads if r["id"] == -1]
    path = [r for r in roads if r["id"] == -2]
    assert road and all(r["n"] == "Südspange" and r["w"] == 8.0 and r["cls"] == "tertiary" and r["mark"] == "centre"
                        for r in road)
    assert len(path) == 1 and path[0]["cls"] == "cycleway" and path[0]["w"] == 3.0 and path[0]["n"] == ""
    assert path[0]["mark"] == "none" and not path[0]["bridge"]
    assert all(z == pytest.approx(-7.5) for _, z in path[0]["pts"])          # westbound: north = smaller z
    assert sorted(j[:2] for j in junctions) == [[0.0, 0.0], [200.0, 0.0]] and all(j[2] == 4.3 for j in junctions)
    assert grades == []


def test_replace_removes_only_the_shared_stretch():
    old = [{"id": 5, "n": "", "cls": "service", "w": 4.0, "mark": "none", "bridge": False, "layer": 0,
            "pts": [[0, -100], [0, 0], [0, 100]]}]
    ways = [Way(5, {"highway": "service"}, shapely.LineString([(0, -100), (0, 0), (0, 100)]))]
    spec = {"s": {"pieces": [{"id": -3, "n": "S", "tags": {"highway": "unclassified", "lanes": "2"}, "w": 7.0,
                              "via": [{"osm": "w5", "from": [0, 0], "to": [0, 100]}]}], "replace": ["w5"]}}
    roads, _, _ = X.apply(spec, ways, old, [], CLIP)
    left = [shapely.LineString(r["pts"]) for r in roads if r["id"] == 5]
    assert len(left) == 1 and left[0].bounds[3] <= 0 and left[0].length > 95


GRADED = {"id": -1, "n": "S", "tags": {"highway": "tertiary"}, "w": 8.0, "via": [{"game": [0, 0]}, {"game": [300, 0]}]}


def test_grade_controls_are_projected_onto_the_piece():
    spec = {"s": {"pieces": [GRADED], "grade": {"piece": -1, "hw": 9.5, "ctl": [
        {"at": [50, 2], "cut": 0}, {"at": [150, 0], "cut": 6.5}, {"at": [250, -1], "cut": 0}]}}}
    _, _, grades = X.apply(spec, [], [], [], CLIP)
    assert grades == [{"pts": [[50.0, 0.0], [250.0, 0.0]], "hw": 9.5, "ctl": [[0.0, 0.0], [100.0, 6.5], [200.0, 0.0]]}]


@pytest.mark.parametrize("ctl", [
    [{"at": [50, 0], "cut": 1}, {"at": [250, 0], "cut": 0}],          # does not start on the terrain
    [{"at": [250, 0], "cut": 0}, {"at": [50, 0], "cut": 0}],          # runs backwards
    [{"at": [50, 0], "cut": 0}, {"at": [150, 40], "cut": 0}],         # off the piece
])
def test_bad_grades_are_rejected(ctl):
    with pytest.raises(ValueError):
        X.apply({"s": {"pieces": [GRADED], "grade": {"piece": -1, "hw": 9.5, "ctl": ctl}}}, [], [], [], CLIP)


def test_trim_clears_the_grade_band():
    other = {"id": 7, "n": "", "cls": "service", "w": 4.0, "mark": "none", "bridge": False, "layer": 0,
             "pts": [[100, 10], [100, 200]]}
    spec = {"s": {"pieces": [GRADED], "trim": ["w7"], "grade": {"piece": -1, "hw": 9.5, "ctl": [
        {"at": [50, 0], "cut": 0}, {"at": [150, 0], "cut": 6.5}, {"at": [250, 0], "cut": 0}]}}}
    roads, _, _ = X.apply(spec, [], [other], [], CLIP)
    left = [r for r in roads if r["id"] == 7]
    assert left and min(z for _, z in left[0]["pts"]) >= 9.5 + 24 - 0.5


def test_existing_junction_on_a_game_road_grows():
    _, junctions, _ = X.apply({"s": {"pieces": [GRADED]}}, [], [], [[100.0, 0.0, 3.05], [100.0, 50.0, 3.05]], CLIP)
    assert [100.0, 0.0, 4.3] in junctions and [100.0, 50.0, 3.05] in junctions


def test_rail_in_the_grade_band_goes_on_a_deck():
    g = [{"pts": [[0, 0], [300, 0]], "hw": 9.5, "ctl": [[0, 0], [300, 0]]}]
    across, far, old = [[150, -100], [150, 100]], [[0, 200], [300, 200]], {"pts": [[1, 1], [2, 2]], "layer": 1}
    rail, decks = X.deck_rail(g, [across, far], [old])
    assert far in rail and decks[0] == old and len(decks) == 2
    (deck,) = decks[1:]
    assert deck["layer"] == 1
    assert sorted(z for _, z in deck["pts"]) == [pytest.approx(-33.5, abs=0.2), pytest.approx(33.5, abs=0.2)]
    stubs = sorted(r for r in rail if r != far)
    assert len(stubs) == 2 and all(abs(z) >= 33.0 for s in stubs for _, z in s)


def test_deck_rail_without_grades_changes_nothing():
    assert X.deck_rail([], [[[0, 0], [1, 0]]], []) == ([[[0, 0], [1, 0]]], [])
