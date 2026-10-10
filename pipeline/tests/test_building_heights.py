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


def test_roof_shape_from_the_ridge():
    """#43: the measured ridge decides flat vs. pitched on rectangular footprints under 1,000 m2; in the 0.6-1.5 m band
    the footprint heuristic keeps deciding."""
    assert BH.roof_shape("flat", 2.9, 0.89, 500) == "gable"        # Bodenackerstrasse 20a-20f: 36 x 13 m, pitched
    assert BH.roof_shape("gable", 0.1, 1.0, 208) == "flat"         # 16a-16c: the heuristic said gable, the roof is flat
    assert BH.roof_shape("flat", 0.1, 0.87, 395) == "flat"         # 8a-8f
    assert BH.roof_shape("flat", 2.9, 0.7, 500) == "flat"          # L-shaped: gable() would draw a box over the L
    assert BH.roof_shape("flat", 3.0, 0.87, 14689) == "flat"       # hall with rooftop plant
    assert BH.roof_shape("flat", 1.5, 0.85, 999.9) == "gable"      # thresholds are inclusive / exclusive as named
    assert BH.roof_shape("flat", 1.5, 0.85, 1000.0) == "flat"
    assert BH.roof_shape("gable", 1.0, 0.95, 100) == "gable"       # shallow ridge: heuristic keeps deciding
    assert BH.roof_shape("flat", 1.0, 0.95, 400) == "flat"
    assert BH.roof_shape("gable", 0.6, 0.95, 100) == "gable"
    assert BH.roof_shape("gable", 0.59, 0.95, 100) == "flat"


def test_measured_ridge_overrides_the_footprint_roof(tiles):
    """#43: a 'flat' footprint over a pitched surface becomes gable, a 'gable' footprint over a flat roof becomes flat;
    footprints without a measurement keep their roof."""
    b = [bld(6, 40, 0, 10, 8, "flat"), bld(7, -40, 0, 12, 10, "gable"), bld(8, 900, 900, 10, 8, "gable"),
         bld(9, 0, 60, 15, 12, "gable", h=12.0)]
    stats = BH.apply(b, FRAME, *tiles)
    assert b[0]["roof"] == "gable" and b[0]["rh"] >= 1.5 and b[0]["hsrc"] == "dsm"
    assert b[1]["roof"] == "flat" and b[1]["rh"] < 0.6 and b[1]["hsrc"] == "dsm"
    assert b[2]["roof"] == "gable" and "rh" not in b[2]            # outside the tiles
    assert b[3]["roof"] == "gable" and "rh" not in b[3]            # not built in 2020
    assert stats["ridge_gable"] == 1 and stats["ridge_flat"] == 1


def test_ridge_promoted_gable_gets_the_eaves_correction(tiles):
    """Review of #68: a footprint the ridge promotes to gable gets the same eaves/ridge as one the heuristic already
    called gable, over the same pitched surface (eaves 6 m, ridge 3.2 m)."""
    b = [bld(6, 40, 0, 10, 8, "flat"), bld(7, 40, 0, 10, 8, "gable")]
    BH.apply(b, FRAME, *tiles)
    assert b[0]["roof"] == b[1]["roof"] == "gable"
    assert (b[0]["h"], b[0]["rh"]) == (b[1]["h"], b[1]["rh"]), b


@pytest.fixture
def notched(tmp_path):
    """#34: outlines that take in open ground next to the roof (Bodenackerstrasse 6: 7.5 % of its samples are ground).
    North (z = 30): a 25 m flat roof whose outline has a 3.5 m strip of ground at its east end (15 % of the samples).
    South (z = -30): mostly ground, roof over the west 5 m only."""
    E0, N0 = round(FRAME.e0) - 100, round(FRAME.n0) + 100
    dtm = np.full((100, 100), 300.0)
    dsm = np.full((400, 400), 300.0)
    for r in range(400):
        for c in range(400):
            x, z = E0 + (c + 0.5) * 0.5 - FRAME.e0, FRAME.n0 - (N0 - (r + 0.5) * 0.5)
            if abs(x) <= 10 and abs(z - 30) <= 5 and x <= 6.5:
                dsm[r, c] = 325.0
            if abs(x) <= 10 and abs(z + 30) <= 5 and x <= -5.0:
                dsm[r, c] = 325.0
    return [tif(tmp_path / "dsm.tif", E0, N0, dsm, 0.5)], [tif(tmp_path / "dtm.tif", E0, N0, dtm, 2.0)]


def test_eaves_ignores_ground_inside_the_footprint():
    """#34: the eaves are the 10th percentile of the roof samples (>= NOT_BUILT over the ground); a lower wing still
    counts; a footprint that is mostly not roof keeps the old statistic over all samples."""
    assert BH.eaves(np.array([300.0] * 15 + [325.0] * 85), 300.0) == 325.0          # 15 % ground: ignored
    assert BH.eaves(np.array([302.0] * 15 + [325.0] * 85), 300.0) == 302.0          # a 2 m annex is roof
    assert BH.eaves(np.array([300.0] * 60 + [325.0] * 40), 300.0) == 300.0          # mostly ground: old statistic
    few = [300.0] * 3 + [325.0] * 5                                                  # under min_samples roof samples
    assert BH.eaves(np.array(few), 300.0) == pytest.approx(float(np.percentile(few, 10)))


def test_ground_inside_the_outline_does_not_lower_the_eaves(notched):
    """#34, Bodenackerstrasse 6 (22.8 m shipped, main roof 25.5 m): ground inside the outline pulled the 10th
    percentile down. Today the north block comes out h 2.5 and 'gable' (the ground strip reads as a 25 m ridge)."""
    b = [bld(10, 0, 30, 20, 10, "flat"), bld(11, 0, -30, 20, 10, "flat")]
    BH.apply(b, FRAME, *notched)
    assert b[0]["hsrc"] == "dsm" and b[0]["roof"] == "flat", b[0]
    assert b[0]["h"] == pytest.approx(25.0, abs=0.3) and b[0]["rh"] == pytest.approx(0.0, abs=0.3), b[0]
    assert b[1]["hsrc"] == "dsm" and b[1]["h"] == 2.5, b[1]                          # mostly ground: unchanged


def test_committed_world_has_bodenacker_6_at_its_measured_roof():
    """#34: the file the game loads, not just the pipeline, carries the fix (runs without the swisstopo cache)."""
    import json
    from pathlib import Path
    world = json.loads((Path(__file__).parents[2] / "data" / "world_hochrhein.json").read_text())
    tall = next(b for b in world["buildings"] if b["id"] == 171822634)
    assert tall["hsrc"] == "dsm" and tall["roof"] == "flat" and 24.5 <= tall["h"] <= 26.5, (tall["h"], tall["roof"])
    assert max(b["h"] for b in world["buildings"] if b.get("hsrc") == "dsm") <= 32.5
