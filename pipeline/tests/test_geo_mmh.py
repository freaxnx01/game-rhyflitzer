import numpy as np
import pytest
from pyproj import Transformer

import geo
import mmh


def test_frame_origin_matches_terrain_header():
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    assert f.e0 == pytest.approx(2639781.3458206826, abs=1e-6)
    assert f.n0 == pytest.approx(1266787.080520644, abs=1e-6)


def test_to_game_axes():
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    x, z = f.to_game(geo.DEFAULT_ORIGIN[1], geo.DEFAULT_ORIGIN[0])
    assert (x, z) == pytest.approx((0.0, 0.0), abs=1e-6)
    x, z = f.to_game(geo.DEFAULT_ORIGIN[1] + 0.01, geo.DEFAULT_ORIGIN[0] + 0.01)
    assert x > 700 and z < -1000          # east is +x, north is -z


def test_to_game_vectorised_and_roundtrip():
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    lon = np.array([7.95, 7.99]); lat = np.array([47.55, 47.56])
    x, z = f.to_game(lon, lat)
    lo, la = f.game_to_lonlat(x, z)
    assert lo == pytest.approx(lon, abs=1e-7) and la == pytest.approx(lat, abs=1e-7)


def test_grid_for_default_matches_existing_mmh():
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    g = geo.grid_for(geo.DEFAULT_BBOX, f, 4.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (2362, 1130, -4692.0, -2416.0)


def test_pad_bbox_two_km():
    w, s, e, n = geo.pad_bbox(geo.DEFAULT_BBOX, 2000)
    assert w < 7.905 - 0.025 and e > 8.030 + 0.025
    assert s < 47.532 - 0.017 and n > 47.572 + 0.017


def test_mmh_roundtrip_and_sample(tmp_path):
    h = np.arange(12, dtype=np.float32).reshape(3, 4)
    hdr = {"format": "MMH1", "w": 4, "h": 3, "step": 2.0, "x0": 10.0, "z0": -4.0}
    p = tmp_path / "t.mmh"
    mmh.write_mmh(p, dict(hdr, min=0.0, max=11.0), h)
    hdr2, h2 = mmh.read_mmh(p)
    assert hdr2["w"] == 4 and np.array_equal(h2, h)
    assert mmh.sample(hdr2, h2, 10.0, -4.0) == pytest.approx(0.0)
    assert mmh.sample(hdr2, h2, 11.0, -4.0) == pytest.approx(0.5)      # halfway between col 0 and 1
    assert mmh.sample(hdr2, h2, 10.0, -2.0) == pytest.approx(4.0)      # one row south
    assert mmh.sample(hdr2, h2, -100.0, 100.0) == pytest.approx(8.0)   # clamped to the south-west corner
