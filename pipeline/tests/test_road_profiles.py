"""#1152: smooth road height profiles."""
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

import road_profiles as R
import terrain


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


def mmh_flat(value, base=284.0):
    hdr = {"w": 11, "h": 11, "step": 8.0, "x0": -40.0, "z0": -40.0, "base": base, "sources": ["swissALTI3D (c) swisstopo"]}
    return hdr, np.full((11, 11), value - base, dtype=np.float32)


def tif(path, value, e0=2600000.0, n0=1200000.0, size=50, res=2.0):
    a = np.full((size, size), value, dtype=np.float32)
    a[0, 0] = -9999.0
    with rasterio.open(path, "w", driver="GTiff", height=size, width=size, count=1, dtype="float32", crs=terrain.LV95,
                       transform=from_origin(e0, n0, res, res), nodata=-9999.0) as ds:
        ds.write(a, 1)
    return path


def test_sampler_prefers_the_raster_and_falls_back_to_the_mmh(tmp_path):
    hdr, h = mmh_flat(290.0)
    with rasterio.open(tif(tmp_path / "a.tif", 291.0)) as ds:
        s = R.Sampler(hdr, h, 2600000.0, 1200000.0, [R.Raster(ds, ds.crs)])
    # game (x, z) = (E - e0, n0 - N): the tile spans x 0..100, z 0..100
    got = s(np.array([20.0, 20.0, -30.0]), np.array([20.0, 0.5, -30.0]))
    assert got[0] == pytest.approx(291.0)            # inside the tile
    assert got[2] == pytest.approx(290.0)            # outside: the .mmh
    assert got[1] == pytest.approx(291.0, abs=1e-3)  # edge row: clamped to the tile, not a seam


def test_guard_takes_the_mmh_for_a_cliff_sample(tmp_path):
    hdr, h = mmh_flat(290.0)
    with rasterio.open(tif(tmp_path / "a.tif", 296.0)) as ds:
        s = R.Sampler(hdr, h, 2600000.0, 1200000.0, [R.Raster(ds, ds.crs)])
    assert s(np.array([20.0]), np.array([20.0]))[0] == pytest.approx(290.0)


def test_dgm1_only_when_the_terrain_has_it(tmp_path, monkeypatch):
    monkeypatch.setattr(R.terrain, "swiss_tiles", lambda *a, **k: [])
    seen = []
    monkeypatch.setattr(R.terrain, "german_datasets", lambda d: seen.append(d) or [])
    w = {"bbox": [7.9, 47.5, 8.0, 47.6], "origin": {"E": 2600000.0, "N": 1200000.0}}
    hdr, h = mmh_flat(290.0)
    R.sampler_for(w, hdr, h, tmp_path, tmp_path)
    assert seen == []
    hdr["sources"].append("DGM1 Datengrundlage: LGL, www.lgl-bw.de (dl-de/by-2-0)")
    R.sampler_for(w, hdr, h, tmp_path, tmp_path)
    assert seen == [tmp_path]
