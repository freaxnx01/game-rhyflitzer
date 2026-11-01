"""#593: the horizon backdrop grid around the play area."""
import math

import numpy as np
import pytest

import backdrop
import mmh

PLAY = {"x0": -400.0, "z0": -300.0, "w": 101, "h": 76, "step": 8.0, "base": 284.0,
        "origin": {"lat": 47.5506, "lon": 7.9671}}          # play extent x -400..400, z -300..300


def flat_play(v=5.0):
    return np.full((PLAY["h"], PLAY["w"]), v, np.float32)


def test_grid_covers_play_area_plus_pad_on_whole_steps():
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    assert g["hole"] == [-400.0, -300.0, 400.0, 300.0]
    assert g["x0"] % 250 == 0 and g["z0"] % 250 == 0
    assert g["x0"] <= -1400 and g["z0"] <= -1300
    assert g["x0"] + (g["w"] - 1) * 250 >= 1400 and g["z0"] + (g["h"] - 1) * 250 >= 1300


def test_deep_hole_is_nan_rim_takes_play_height_outside_takes_dem():
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    out = backdrop.heights(g, PLAY, flat_play(5.0), lambda X, Z: np.full(X.shape, 700.0), base=284.0)
    xs, zs, deep, rim = backdrop.hole_masks(g)
    assert out.dtype == np.float32 and out.shape == (g["h"], g["w"])
    assert deep.any() and np.isnan(out[deep]).all()
    assert rim.any() and np.allclose(out[rim], 5.0)
    outside = ~(deep | rim)
    assert np.allclose(out[outside], 700.0 - 284.0)


def test_every_rim_sample_touches_an_outside_sample():
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    _, _, deep, rim = backdrop.hole_masks(g)
    outside = ~(deep | rim)
    for j, i in zip(*np.nonzero(rim)):
        assert outside[max(j - 1, 0):j + 2, max(i - 1, 0):i + 2].any()


def test_header_marks_the_backdrop_and_carries_sources():
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    out = backdrop.heights(g, PLAY, flat_play(), lambda X, Z: 284.0 + X * 0.01, base=284.0)
    hdr = backdrop.header(g, PLAY, out, [7.8, 47.4, 8.1, 47.7], [backdrop.SOURCE])
    assert hdr["kind"] == "backdrop" and hdr["hole"] == g["hole"] and hdr["base"] == 284.0
    assert hdr["w"] == g["w"] and hdr["h"] == g["h"] and hdr["step"] == 250.0
    assert math.isfinite(hdr["min"]) and math.isfinite(hdr["max"]) and hdr["min"] < hdr["max"]
    assert "Copernicus" in hdr["sources"][0]


def test_written_file_round_trips(tmp_path):
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    out = backdrop.heights(g, PLAY, flat_play(), lambda X, Z: np.full(X.shape, 600.0), base=284.0)
    p = tmp_path / "b.mmh"
    mmh.write_mmh(p, backdrop.header(g, PLAY, out, [0, 0, 1, 1], [backdrop.SOURCE]), out)
    hdr, h = mmh.read_mmh(p)
    assert hdr["kind"] == "backdrop"
    assert np.array_equal(np.isnan(h), np.isnan(out))


def test_copernicus_tiles_cover_the_bbox():
    names = [t[0] for t in backdrop.copernicus_tiles(7.66, 47.33, 8.27, 47.74)]
    assert names == ["N47_00_E007_00", "N47_00_E008_00"]
    assert backdrop.copernicus_tiles(7.9, 46.9, 7.95, 47.1)[0][0] == "N46_00_E007_00"
    assert backdrop.COPERNICUS_URL.format(t="N47_00_E008_00").startswith("https://copernicus-dem-30m.s3.amazonaws.com/")


def test_fill_seams_closes_a_one_pixel_seam_and_refuses_a_missing_tile():
    m = np.arange(100, dtype=np.float32).reshape(10, 10); m[:, 5] = np.nan
    out = backdrop.fill_seams(m)
    assert not np.isnan(out).any() and out[3, 5] in (m[3, 4], m[3, 6])
    m[:, :5] = np.nan
    with pytest.raises(RuntimeError):
        backdrop.fill_seams(m)
