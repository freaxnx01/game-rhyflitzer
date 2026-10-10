"""The automatic race -- leg search, candidates, names, par time, and the bridge to the game's A*."""
import math

import pytest
import shapely

import race as R
from osm_read import NamedNode

CLIP = shapely.box(-1000, -1000, 1000, 1000)


def bridge_works() -> bool:
    """Whether the Node on PATH can run route_matrix.mjs. prototype/route.js is an ES module in a .js file with no
    package.json, which Node only recognises as one from v22 (the prototype's own `node --test` needs the same)."""
    try:
        R.route_lengths([{"cls": "residential", "n": "", "bridge": False, "pts": [[0, 0], [10, 0]]}], [], [])
    except RuntimeError:
        return False
    return True


needs_node = pytest.mark.skipif(not bridge_works(), reason="no Node 22+ on PATH that can import prototype/route.js")


def line_lens(n, step):
    """n points on a line `step` metres apart, every pair routed along the line."""
    return [(i * step, 0.0) for i in range(n)], {(i, j): (j - i) * step for i in range(n) for j in range(i + 1, n)}


def test_par_seconds():
    assert R.par_seconds(5000) == 400 and R.par_seconds(5001) == 401          # 45 km/h = 12.5 m/s


def test_chain_takes_legs_within_range():
    pos, lens = line_lens(7, 600.0)
    assert R.chain(lens, [0] * 7, pos) == [0, 1, 2, 3, 4, 5, 6]


def test_chain_prefers_higher_scores():
    pos, lens = line_lens(13, 300.0)               # legs of 600 or 900 m are possible, 300 is too short
    scores = [0] * 13
    scores[3] = 3                                  # 900 m from the start
    path = R.chain(lens, scores, pos)
    assert path[:2] == [0, 3] and len(path) == 7
    assert all(R.LEG_MIN <= R.leg(lens, a, b) <= R.LEG_MAX for a, b in zip(path, path[1:]))


def test_chain_none_when_no_leg_fits_or_points_crowd():
    pos, lens = line_lens(7, 200.0)
    assert R.chain({k: v for k, v in lens.items() if v < R.LEG_MIN}, [0] * 7, pos) is None
    crowd = [(0.0, 0.0), (600.0, 0.0), (100.0, 0.0)]   # 2 is 600 m by road from 1 but 100 m from the start
    assert R.chain({(0, 1): 600.0, (1, 2): 600.0}, [0, 0, 0], crowd, legs=2) is None


def test_candidates_named_first_inside_the_margin_and_capped():
    roads = [{"cls": "secondary", "pts": [[-1000, 0], [1000, 0]]}, {"cls": "service", "pts": [[0, -1000], [0, 1000]]}]
    out = R.candidates(roads, [(500, 500, "Kirche"), (950, 0, "Am Rand")], CLIP)
    assert out[0] == {"x": 500, "z": 500, "name": "Kirche", "major": False}
    assert all(abs(p["x"]) <= 850 and abs(p["z"]) <= 850 for p in out)        # 150 m off the frame edge
    assert {p["x"] for p in out[1:]} == {-800.0, -400.0, 0.0, 400.0, 800.0} and all(p["major"] for p in out[1:])
    many = [{"cls": "residential", "pts": [[-800, z], [800, z]]} for z in range(-800, 801, 20)]
    assert len(R.candidates(many, [], CLIP)) == R.MAX_CANDIDATES


def test_checkpoint_name_place_then_street_then_none():
    nodes = [NamedNode(1, {"amenity": "school", "name": "Schulhaus"}, 100.0, 0.0),
             NamedNode(2, {"railway": "station", "name": "Bahnhof"}, 0.0, 400.0)]
    roads = [{"n": "Dorfstrasse", "pts": [[-500, 600], [500, 600]]}, {"n": "", "pts": [[-500, 800], [500, 800]]}]
    assert R.checkpoint_name(0, 0, nodes, [], roads, CLIP) == "Schulhaus"
    assert R.checkpoint_name(0, 380, nodes, [], roads, CLIP) == "Bahnhof"
    assert R.checkpoint_name(0, 620, nodes, [], roads, CLIP) == "Dorfstrasse"
    assert R.checkpoint_name(0, 800, nodes, [], roads, CLIP) is None


def test_names_fall_back_and_never_repeat():
    picked = [{"name": "Kirche"}, {"name": None}, {"name": "Kirche"}, {"name": None}]
    pos = [(0, 0), (0, 0), (0, 500), (0, 0), (0, -900)]
    roads = [{"n": "Dorfstrasse", "pts": [[-900, 500], [900, 500]]}]
    assert R.names([0, 1, 2, 3, 4], picked, pos, [], [], roads, CLIP) == ["Kirche", "Dorfstrasse", "Checkpoint 3", "Checkpoint 4"]


def test_facing_turns_towards_the_first_checkpoint():
    assert R.facing(0.0, (0, 0), (100, 0)) == 0.0
    assert abs(R.facing(0.0, (0, 0), (-100, 0))) == pytest.approx(math.pi)


def test_build_without_a_major_road_is_free_driving():
    assert R.build([{"cls": "residential", "n": "", "bridge": False, "pts": [[-900, 0], [900, 0]]}], [], [], CLIP, []) is None


def test_route_lengths_without_node_says_why(monkeypatch):
    monkeypatch.setattr(R.shutil, "which", lambda name: None)
    with pytest.raises(RuntimeError, match="Node"):
        R.route_lengths([], [], [])


def test_route_lengths_turns_a_garbled_or_hung_node_into_runtime_error(monkeypatch):
    """bridge_works() and callers only catch RuntimeError: a Node that prints a banner instead of JSON, or hangs, must
    not escape as JSONDecodeError or TimeoutExpired (it would error test collection instead of skipping)."""
    monkeypatch.setattr(R.shutil, "which", lambda name: "/usr/bin/node")
    monkeypatch.setattr(R.subprocess, "run", lambda *a, **k: R.subprocess.CompletedProcess(a, 0, "Warning: banner\n", ""))
    with pytest.raises(RuntimeError, match="not JSON"):
        R.route_lengths([], [], [])

    def hang(*a, **k):
        raise R.subprocess.TimeoutExpired("node", 600)
    monkeypatch.setattr(R.subprocess, "run", hang)
    with pytest.raises(RuntimeError, match="timed out"):
        R.route_lengths([], [], [])


@needs_node
def test_route_lengths_uses_the_game_graph():
    roads = [{"cls": "residential", "n": "", "bridge": False, "pts": [[0, 0], [1000, 0]]},
             {"cls": "residential", "n": "", "bridge": False, "pts": [[1000, 0], [1000, 800]]}]
    snaps, lens = R.route_lengths(roads, [(0, 5), (1005, 800), (5000, 5000)], [(0, 1), (0, 2)])
    assert snaps[0] == {"x": 0, "z": 0, "d": 5} and snaps[2] is None
    assert lens == {(0, 1): pytest.approx(1800, abs=0.2)}


def test_on_course_drops_points_that_snapped_out_of_the_frame():
    """Snapping moves a candidate up to MAX_SNAP, so the margin is checked again on the snapped point."""
    inner = R.inner_frame(CLIP)
    assert inner.bounds == (-850.0, -850.0, 850.0, 850.0)
    snaps = [{"x": 0, "z": 0, "d": 1}, None, {"x": 0, "z": -860, "d": 45}, {"x": 800, "z": 0, "d": 2}]
    assert R.on_course(snaps, inner) == [0, 3]
    assert R.on_course([{"x": 0, "z": -990, "d": 5}], inner) == [0]          # the start itself may sit near the edge


def test_candidates_skip_bridges():
    """The game's snapRoad never snaps onto a bridge, so a candidate sampled on one would be moved off it."""
    roads = [{"cls": "secondary", "bridge": True, "pts": [[-1000, 0], [1000, 0]]}]
    assert R.candidates(roads, [], CLIP) == []


def test_game_snap_matches_the_games_snaproad():
    """prototype/index.html snapRoad: nearest road that is neither a bridge nor a motorway, within 60 m, else stay."""
    roads = [{"cls": "secondary", "bridge": True, "pts": [[-50, 0], [50, 0]]},
             {"cls": "service", "bridge": False, "pts": [[-50, 40], [50, 40]]},
             {"cls": "motorway", "bridge": False, "pts": [[-50, -10], [50, -10]]},
             {"cls": "residential", "bridge": False, "pts": [[500, -100], [500, 100]]}]
    lines = R.game_snap_lines(roads)
    assert R.game_snap(lines, 0, 0) == pytest.approx((0, 40))                # off the bridge, onto the yard road
    assert R.game_snap(lines, 490, 7) == pytest.approx((500, 7))
    assert R.game_snap(lines, 300, 300) == (300, 300)                        # nothing within 60 m: stays


def test_kept_by_game_drops_points_the_game_would_move():
    """The reviewer's case: a checkpoint certified mid-bridge, a service road 40 m away -- the game would move it there."""
    roads = [{"cls": "secondary", "bridge": True, "pts": [[-50, 0], [50, 0]]},
             {"cls": "service", "bridge": False, "pts": [[-50, 40], [50, 40]]},
             {"cls": "secondary", "bridge": False, "pts": [[300, -500], [300, 500]]},
             {"cls": "secondary", "bridge": True, "pts": [[600, -50], [600, 50]]}]
    snaps = [{"x": 300, "z": 0, "d": 2}, {"x": 0, "z": 0, "d": 1}, None, {"x": 600, "z": 0, "d": 3}]
    assert R.kept_by_game(snaps, R.game_snap_lines(roads)) == [snaps[0], None, None, snaps[3]]   # a lone bridge stays


def test_names_collects_the_named_places_once(monkeypatch):
    calls, real = [], R.places.named_places
    monkeypatch.setattr(R.places, "named_places", lambda *a: calls.append(1) or real(*a))
    R.names([0, 1, 2, 3], [{"name": None}] * 3, [(0, 0), (0, 0), (0, 500), (0, -900)], [], [], [], CLIP)
    assert len(calls) == 1
