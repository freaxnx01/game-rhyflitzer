"""Building heights from swissSURFACE3D minus swissALTI3D (#17)."""
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

import building_heights as BH
import geo

FRAME = geo.Frame(*geo.DEFAULT_ORIGIN)


def tif(path, E0, N0, data, res):
    with rasterio.open(path, "w", driver="GTiff", width=data.shape[1], height=data.shape[0], count=1, dtype="float32",
                       crs="EPSG:2056", transform=from_origin(E0, N0, res, res)) as ds:
        ds.write(data.astype("float32"), 1)
    return path


def bld(i, cx, cz, w, d, roof, h=6.0):
    ring = [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]
    return {"id": i, "h": h, "roof": roof, "palette": "village", "rect": [cx, cz, w, d, 0.0], "ring": ring}


@pytest.fixture
def tiles(tmp_path):
    E0, N0 = round(FRAME.e0) - 100, round(FRAME.n0) + 100          # a 200 m tile around the origin
    dtm = np.full((100, 100), 300.0)                                 # 2 m terrain at 300 m
    dsm = np.full((400, 400), 300.0)                                 # 0.5 m surface
    def put(cx, cz, w, d, f):                                        # write roof heights over a footprint (game coords)
        for r in range(400):
            for c in range(400):
                E, N = E0 + (c + 0.5) * 0.5, N0 - (r + 0.5) * 0.5
                x, z = E - FRAME.e0, FRAME.n0 - N
                if abs(x - cx) <= w / 2 and abs(z - cz) <= d / 2:
                    dsm[r, c] = 300.0 + f(x - cx, z - cz)
    put(-40, 0, 12, 10, lambda u, v: 9.0)                            # flat roof, 9 m
    put(40, 0, 10, 8, lambda u, v: 6.0 + 3.2 * (1 - abs(v) / 4))   # gable: eaves 6 m, ridge 3.2 m (= 0.4 * 8)
    return [tif(tmp_path / "dsm.tif", E0, N0, dsm, 0.5)], [tif(tmp_path / "dtm.tif", E0, N0, dtm, 2.0)]


def test_flat_and_gable_heights_from_the_surface(tiles):
    b = [bld(1, -40, 0, 12, 10, "flat"), bld(2, 40, 0, 10, 8, "gable"), bld(3, 900, 900, 10, 8, "gable")]
    stats = BH.apply(b, FRAME, *tiles)
    assert b[0]["h"] == pytest.approx(9.0, abs=0.3) and b[0]["hsrc"] == "dsm" and b[0]["rh"] == pytest.approx(0, abs=0.3)
    # gable: eaves from the low edge of the roof, ridge from the top (measured, not 0.4 * width)
    assert b[1]["h"] == pytest.approx(6.0, abs=0.9) and b[1]["rh"] == pytest.approx(3.2, abs=0.9) and b[1]["hsrc"] == "dsm"
    assert b[2]["h"] == 6.0 and "hsrc" not in b[2]                                # outside the tiles: unchanged
    assert stats["dsm"] == 2 and stats["no_data"] == 1


def test_heights_are_clamped(tiles):
    b = [bld(4, -40, 0, 12, 10, "flat")]
    BH.apply(b, FRAME, *tiles, max_h=5.0)
    assert b[0]["h"] == 5.0


def test_footprint_without_a_building_keeps_its_height(tiles):
    """Playtest 2026-10-02: w1326045746 (apartments) was built after the 2020 surface was flown; bare ground there must
    not become a 2.5 m shed."""
    b = [bld(5, 0, 60, 15, 12, "flat", h=12.0)]
    stats = BH.apply(b, FRAME, *tiles)
    assert b[0]["h"] == 12.0 and "hsrc" not in b[0] and "rh" not in b[0]
    assert stats["not_built"] == 1
