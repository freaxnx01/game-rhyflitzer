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


def test_grid_for_core_matches_the_first_mmh():
    """The pre-#47 region (CORE_BBOX) at 4 m is the grid of the first published .mmh."""
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    g = geo.grid_for(geo.CORE_BBOX, f, 4.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (2362, 1130, -4692.0, -2416.0)


def test_grid_for_region_south_to_schupfart():
    """#47: south edge 47.500 at the 8 m terrain step."""
    f = geo.Frame(*geo.DEFAULT_ORIGIN)
    g = geo.grid_for(geo.DEFAULT_BBOX, f, 8.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (1186, 1010, -4696.0, -2416.0)


def test_region_contains_the_core_and_the_airfield():
    w, s, e, n = geo.DEFAULT_BBOX
    assert (w, e, n) == (geo.CORE_BBOX[0], geo.CORE_BBOX[2], geo.CORE_BBOX[3])   # only the south edge moved
    assert s == 47.500 and s < geo.CORE_BBOX[1]
    for lon, lat in [(7.9458, 47.5079), (7.9541, 47.5102)]:                      # Flugplatz Schupfart r2782819 bounds
        assert w < lon < e and s < lat < n


def test_pad_bbox_two_km():
    w, s, e, n = geo.pad_bbox(geo.DEFAULT_BBOX, 2000)
    assert w < 7.905 - 0.025 and e > 8.030 + 0.025
    assert s < 47.500 - 0.017 and n > 47.572 + 0.017


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


def test_grid_for_ehrendingen():
    f = geo.Frame(*geo.EHRENDINGEN_ORIGIN)
    g = geo.grid_for(geo.EHRENDINGEN_BBOX, f, 4.0)
    assert (g["w"], g["h"], g["x0"], g["z0"]) == (844, 1095, -1528.0, -2268.0)


def test_ehrendingen_places_inside_the_box():
    f = geo.Frame(*geo.EHRENDINGEN_ORIGIN)
    w, s, e, n = geo.EHRENDINGEN_BBOX
    for lon, lat in [(8.34014, 47.50799), (8.35081, 47.49498), (8.3437, 47.4795)]:   # Böndlern, Wanderweg junction, Lägern
        assert w < lon < e and s < lat < n
    x, z = f.to_game(8.34014, 47.50799)
    assert float(x) == pytest.approx(-149.5, abs=0.5) and float(z) == pytest.approx(-1464.9, abs=0.5)
