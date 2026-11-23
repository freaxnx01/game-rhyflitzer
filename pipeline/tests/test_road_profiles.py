"""#1152: smooth road height profiles."""
import numpy as np
import pytest

import road_profiles as R


def road(i, pts, cls="residential", **kw):
    return {"id": i, "n": "", "cls": cls, "w": 5.5, "mark": "none", "bridge": False, "layer": 0, "pts": pts, **kw}


def test_eligible_drive_and_trails_only():
    assert R.eligible(road(1, [[0, 0], [10, 0]], "service"))
    assert R.eligible(road(2, [[0, 0], [10, 0]], "track", trail=True))
    assert not R.eligible(road(3, [[0, 0], [10, 0]], "footway", bridge=True))
    assert not R.eligible(road(4, [[0, 0], [10, 0]], "primary", bridge=True))
    assert not R.eligible(road(5, [[0, 0], [10, 0]], "cycleway"))


def test_sigma_and_rank_by_class():
    assert R.sigma(road(1, [], "motorway")) == 15.0 and R.sigma(road(1, [], "primary")) == 8.0
    assert R.sigma(road(1, [], "residential")) == 4.0 and R.sigma(road(1, [], "track", trail=True)) == 4.0
    assert R.rank(road(1, [], "motorway")) < R.rank(road(1, [], "primary")) < R.rank(road(1, [], "service"))
    assert R.rank(road(1, [], "track", trail=True)) > R.rank(road(1, [], "service"))


def test_station_ts_ends_at_length():
    assert R.station_ts(8.0).tolist() == [0.0, 4.0, 8.0]
    assert R.station_ts(9.5).tolist() == [0.0, 4.0, 8.0, 9.5]


def bumpy(x, z):
    """2 % grade along x with 0.5 m bumps every 6 m (a 4 m period would vanish at the 2 m sampling)."""
    x = np.asarray(x, float)
    return 300.0 + 0.02 * x + 0.5 * np.sin(2 * np.pi * x / 6.0)


def test_smoothing_follows_the_grade_and_removes_bumps_ends_included():
    r = road(1, [[0.0, 0.0], [200.0, 0.0]], "primary")
    (h,) = R.smooth_all([r], bumpy)
    ts = R.station_ts(200.0)
    assert np.max(np.abs(h - (300.0 + 0.02 * ts))) < 0.05


def test_shared_end_t_join_and_crossing_match():
    flat = lambda x, z: 300.0 + 0.0 * np.asarray(x, float) + 0.01 * np.asarray(z, float) ** 2 / 10   # differs by road
    main = road(1, [[-100.0, 0.0], [100.0, 0.0]], "primary")
    side = road(2, [[0.0, 0.0], [0.0, 80.0]], "residential")          # T-join on main's interior
    cont = road(3, [[100.0, 0.0], [180.0, 40.0]], "residential")      # shares main's end
    cross = road(4, [[50.0, -60.0], [50.0, 60.0]], "service")         # crosses main at grade
    roads = [side, main, cont, cross]
    sm = R.smooth_all(roads, flat)
    out = R.pin(roads, sm)
    at = lambda k, t: float(np.interp(t, R.station_ts(R._line(roads[k]["pts"]).length), out[k]))
    assert at(0, 0.0) == pytest.approx(at(1, 100.0), abs=0.01)       # side end on main at x = 0
    assert at(2, 0.0) == pytest.approx(at(1, 200.0), abs=0.01)       # shared end
    assert at(3, 60.0) == pytest.approx(at(1, 150.0), abs=0.05)      # crossing at (50, 0)


def test_main_road_is_not_bent_by_a_minor_one():
    slope = lambda x, z: 300.0 + 0.05 * np.asarray(z, float)
    main = road(1, [[-100.0, 0.0], [100.0, 0.0]], "primary")
    side = road(2, [[0.0, 0.0], [0.0, 80.0]], "residential")
    sm = R.smooth_all([main, side], slope)
    out = R.pin([main, side], sm)
    assert np.allclose(out[0], sm[0])


def test_apply_world_sets_zp_after_pts_drops_stale_and_is_idempotent():
    w = {"sources": ["x"], "roads": [road(1, [[0.0, 0.0], [10.0, 0.0]], "service", modern=True),
                                     road(2, [[0.0, 5.0], [10.0, 5.0]], "footway", bridge=True, zp=[1, 2])]}
    n = R.apply_world(w, lambda x, z: 290.0 + 0.0 * np.asarray(x, float), 284.0)
    assert n == 1
    a, b = w["roads"]
    assert list(a)[list(a).index("pts") + 1] == "zp" and list(a)[-1] == "modern"
    assert a["zp"] == [6.0, 6.0, 6.0, 6.0]                          # stations 0, 4, 8, 10
    assert "zp" not in b
    assert w["sources"] == ["x", R.SOURCE]
    before = repr(w)
    R.apply_world(w, lambda x, z: 290.0 + 0.0 * np.asarray(x, float), 284.0)
    assert repr(w) == before
