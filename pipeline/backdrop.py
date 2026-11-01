#!/usr/bin/env python3
"""Map Madness pipeline: the horizon backdrop (#593).

A coarse height grid around the play area -- Hotzenwald, Dinkelberg, Jura, the Rhine valley -- that the game draws
as a hazy, non-drivable silhouette behind the world. Same MMH1 format as terrain.py; extra header fields
`kind: "backdrop"` and `hole` (the play-area extent [x0, z0, x1, z1] in game metres).

Source: Copernicus DEM GLO-30 (anonymous COG range reads from the AWS Open Data bucket).
Licence notice (adapted data): produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence
and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

    python backdrop.py --terrain ../data/terrain_hochrhein.mmh --out ../data/backdrop_hochrhein.mmh
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import mmh

STEP = 250.0
PAD = 18000.0
SOURCE = "Copernicus DEM GLO-30 (c) DLR e.V. 2010-2014, Airbus Defence and Space GmbH 2014-2018, EU/ESA"


def play_extent(play_hdr) -> list[float]:
    x1 = play_hdr["x0"] + (play_hdr["w"] - 1) * play_hdr["step"]
    z1 = play_hdr["z0"] + (play_hdr["h"] - 1) * play_hdr["step"]
    return [float(play_hdr["x0"]), float(play_hdr["z0"]), float(x1), float(z1)]


def grid(play_hdr, step: float = STEP, pad: float = PAD) -> dict:
    hx0, hz0, hx1, hz1 = play_extent(play_hdr)
    x0 = math.floor((hx0 - pad) / step) * step
    z0 = math.floor((hz0 - pad) / step) * step
    x1 = math.ceil((hx1 + pad) / step) * step
    z1 = math.ceil((hz1 + pad) / step) * step
    return {"x0": float(x0), "z0": float(z0), "w": int(round((x1 - x0) / step)) + 1,
            "h": int(round((z1 - z0) / step)) + 1, "step": float(step), "hole": [hx0, hz0, hx1, hz1]}


def hole_masks(g):
    xs = g["x0"] + np.arange(g["w"]) * g["step"]
    zs = g["z0"] + np.arange(g["h"]) * g["step"]
    hx0, hz0, hx1, hz1 = g["hole"]
    inside = ((zs[:, None] >= hz0) & (zs[:, None] <= hz1)) & ((xs[None, :] >= hx0) & (xs[None, :] <= hx1))
    padded = np.pad(inside, 1, constant_values=False)
    deep = inside.copy()
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            deep &= padded[1 + dj:1 + dj + inside.shape[0], 1 + di:1 + di + inside.shape[1]]
    return xs, zs, deep, inside & ~deep


def heights(g, play_hdr, play_h, dem_at, base: float) -> np.ndarray:
    xs, zs, deep, rim = hole_masks(g)
    X, Z = np.meshgrid(xs, zs)
    out = np.asarray(dem_at(X, Z), dtype=np.float64) - base
    for j, i in zip(*np.nonzero(rim)):
        out[j, i] = mmh.sample(play_hdr, play_h, float(X[j, i]), float(Z[j, i]))
    out[deep] = np.nan
    return out.astype(np.float32)


def header(g, play_hdr, out, bbox, sources) -> dict:
    return {"w": g["w"], "h": g["h"], "step": g["step"], "x0": g["x0"], "z0": g["z0"],
            "origin": play_hdr["origin"], "base": play_hdr["base"],
            "min": float(np.nanmin(out)), "max": float(np.nanmax(out)), "bbox": [float(v) for v in bbox],
            "hole": g["hole"], "kind": "backdrop", "sources": list(sources)}


COPERNICUS_URL = ("https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{t}_DEM/"
                  "Copernicus_DSM_COG_10_{t}_DEM.tif")
ARC2 = 1.0 / 1800.0          # overview level 0 of the 1" COGs: 2 arc seconds


def copernicus_tiles(w, s, e, n):
    out = []
    for lat in range(math.floor(s), math.floor(n) + 1):
        for lon in range(math.floor(w), math.floor(e) + 1):
            ns, ew = ("N" if lat >= 0 else "S"), ("E" if lon >= 0 else "W")
            out.append((f"{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00", lon, lat))
    return out


def lonlat_bbox(frame, g, margin=0.02):
    xs = [g["x0"], g["x0"] + (g["w"] - 1) * g["step"]]
    zs = [g["z0"], g["z0"] + (g["h"] - 1) * g["step"]]
    lon, lat = frame.game_to_lonlat(np.array([x for x in xs for _ in zs]), np.array([z for _ in xs for z in zs]))
    return (float(lon.min()) - margin, float(lat.min()) - margin, float(lon.max()) + margin, float(lat.max()) + margin)


def read_mosaic(bbox, cache: Path) -> np.ndarray:
    w, s, e, n = bbox
    path = Path(cache) / "copernicus" / f"glo30_2s_{w:.3f}_{s:.3f}_{e:.3f}_{n:.3f}.npy"
    if path.exists():
        return np.load(path)
    import rasterio
    from rasterio.windows import from_bounds
    rows, cols = int(math.ceil((n - s) / ARC2)), int(math.ceil((e - w) / ARC2))
    mosaic = np.full((rows, cols), np.nan, np.float32)
    for name, lon0, lat0 in copernicus_tiles(w, s, e, n):
        iw, is_, ie, in_ = max(w, lon0), max(s, lat0), min(e, lon0 + 1), min(n, lat0 + 1)
        with rasterio.open("/vsicurl/" + COPERNICUS_URL.format(t=name), overview_level=0) as ds:
            a = ds.read(1, window=from_bounds(iw, is_, ie, in_, ds.transform).round_offsets().round_lengths())
        r0, c0 = int(round((n - in_) / ARC2)), int(round((iw - w) / ARC2))
        a = a[:rows - r0, :cols - c0]
        mosaic[r0:r0 + a.shape[0], c0:c0 + a.shape[1]] = a
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, mosaic)
    return mosaic


def fill_seams(mosaic: np.ndarray) -> np.ndarray:
    """Tile windows are rounded to whole pixels, which can leave a 1-pixel seam; a missing tile is an error.

    A seam is a thin strip (well under a quarter of the mosaic); a missing tile covers one tile's share of the
    bbox, which for this two-tile mosaic is around 44-56% -- 25% separates the two.
    """
    from scipy.ndimage import distance_transform_edt
    gaps = np.isnan(mosaic)
    if gaps.mean() > 0.25:
        raise RuntimeError(f"Copernicus mosaic is {gaps.mean():.1%} empty: a tile failed to read")
    if not gaps.any():
        return mosaic
    idx = distance_transform_edt(gaps, return_distances=False, return_indices=True)
    return mosaic[tuple(idx)]


def copernicus_dem(frame, g, cache: Path):
    from scipy.ndimage import map_coordinates, uniform_filter
    w, s, e, n = bbox = lonlat_bbox(frame, g)
    lat_m = 111_320.0 * ARC2
    lon_m = lat_m * math.cos(math.radians((s + n) / 2))
    mosaic = fill_seams(read_mosaic(bbox, cache))
    smooth = uniform_filter(mosaic, size=(max(1, round(g["step"] / lat_m)), max(1, round(g["step"] / lon_m))))

    def dem_at(X, Z):
        lon, lat = frame.game_to_lonlat(X, Z)
        return map_coordinates(smooth, [(n - np.asarray(lat)) / ARC2, (np.asarray(lon) - w) / ARC2], order=1, mode="nearest")
    return dem_at, bbox


def main(argv=None):
    from geo import Frame
    ap = argparse.ArgumentParser(description="horizon backdrop (#593) from Copernicus DEM GLO-30")
    ap.add_argument("--terrain", type=Path, default=Path("../data/terrain_hochrhein.mmh"))
    ap.add_argument("--out", type=Path, default=Path("../data/backdrop_hochrhein.mmh"))
    ap.add_argument("--step", type=float, default=STEP)
    ap.add_argument("--pad", type=float, default=PAD)
    ap.add_argument("--cache", type=Path, default=Path("cache"))
    a = ap.parse_args(argv)
    play_hdr, play_h = mmh.read_mmh(a.terrain)
    frame = Frame(play_hdr["origin"]["lat"], play_hdr["origin"]["lon"])
    g = grid(play_hdr, a.step, a.pad)
    dem_at, bbox = copernicus_dem(frame, g, a.cache)
    out = heights(g, play_hdr, play_h, dem_at, play_hdr["base"])
    mmh.write_mmh(a.out, header(g, play_hdr, out, bbox, [SOURCE]), out)


if __name__ == "__main__":
    main()
