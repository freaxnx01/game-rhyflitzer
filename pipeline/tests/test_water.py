import base64

import numpy as np
import pytest
import shapely

import world_water as Wt
from osm_read import Area, Way

CLIP = shapely.box(0, 0, 400, 400)


def test_area_water_clipped_and_valid():
    rhine = Area(1, False, {"natural": "water", "water": "river"}, shapely.box(-100, 150, 500, 250))
    polys = Wt.polygons([rhine], [], CLIP)
    assert len(polys) == 1 and polys[0].is_valid
    assert polys[0].bounds == (0.0, 150.0, 400.0, 250.0)


def test_invalid_ring_is_repaired_not_raised():
    bow = shapely.Polygon([(0, 0), (100, 100), (100, 0), (0, 100)])      # self-intersecting
    polys = Wt.polygons([Area(2, True, {"natural": "water"}, bow)], [], CLIP)
    assert all(p.is_valid for p in polys) and sum(p.area for p in polys) > 0


def test_centre_line_fallback_buffer():
    stream = Way(3, {"waterway": "stream"}, shapely.LineString([(0, 50), (400, 50)]))
    river = Way(4, {"waterway": "river", "width": "40"}, shapely.LineString([(0, 300), (400, 300)]))
    polys = Wt.polygons([], [stream, river], CLIP)
    widths = sorted(round(p.area / 400) for p in polys)
    assert widths == [3, 40]


def test_centre_line_inside_area_is_not_buffered_again():
    area = Area(1, False, {"natural": "water"}, shapely.box(0, 280, 400, 320))
    river = Way(4, {"waterway": "river"}, shapely.LineString([(0, 300), (400, 300)]))
    assert len(Wt.polygons([area], [river], CLIP)) == 1


def test_chunks_and_level():
    poly = shapely.box(0, 0, 1200, 100)
    parts = Wt.chunks([poly], 500)
    assert len(parts) == 3
    hdr = {"x0": 0.0, "z0": 0.0, "step": 10.0, "w": 121, "h": 11}
    heights = np.tile(np.linspace(0, 12, 121, dtype=np.float32), (11, 1))   # rises 1 m per 100 m east
    levels = [Wt.level(p, hdr, heights) for p in parts]
    assert levels[0] == pytest.approx(2.5, abs=0.3) and levels[2] == pytest.approx(11.0, abs=0.3)
    assert Wt.level(parts[0], None, None) == 0.0


def test_sdf_sign_and_clamp():
    s = Wt.sdf([shapely.box(100, 100, 200, 200)], (0, 0, 400, 400), step=10, clamp=120)
    a = np.frombuffer(base64.b64decode(s["data"]), dtype=np.int8).reshape(s["h"], s["w"])
    def at(x, z):
        return int(a[round((z - s["z0"]) / s["step"]), round((x - s["x0"]) / s["step"])])
    assert at(150, 150) == -50          # 50 m to the nearest outside pixel (the boundary at x = 100)
    assert 50 <= at(250, 150) <= 60     # boundary pixels count as outside, so 50..60 depending on the edge
    assert at(0, 0) == 120              # ~141 m away, clamped
