#!/usr/bin/env python3
"""Map Madness pipeline, step 1: terrain.

Builds one game heightmap from official elevation models on both sides of the Rhine:

  * Switzerland: swisstopo swissALTI3D (2 m GeoTIFF tiles, downloaded automatically via the STAC API)
  * Baden-Wuerttemberg: LGL DGM1 (1 m, downloaded manually from the LGL Open GeoData portal
    into a folder; GeoTIFF, ASC or XYZ are accepted)

Output: a single .mmh file (Map Madness Heightmap) the game loads directly.

    MMH1 | uint32 header_len | header JSON (UTF-8) | float32 LE heights, row-major

Row 0 is the northern edge, column 0 the western edge. Heights are metres relative to
`base` (default: the Rhine water level at Sisseln), so the valley floor sits near 0.

Game coordinates: x = east, z = south, in metres, origin at `--origin` (lat/lon).

Usage:
    python terrain.py --out ../data/terrain_hochrhein.mmh
    python terrain.py --bbox 7.90 47.53 8.03 47.58 --step 4 --dgm-dir ~/geodata/lgl_dgm1

Licences (attribution required in the game credits):
    swissALTI3D: (c) swisstopo
    DGM1: Datengrundlage: LGL, www.lgl-bw.de (dl-de/by-2-0)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import requests
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from pyproj import CRS

from geo import DEFAULT_BBOX, DEFAULT_ORIGIN, Frame, grid_for
from mmh import write_mmh

STAC_ITEMS = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items"
LV95 = CRS.from_epsg(2056)      # Swiss grid, metric; used as the game's working frame
ETRS_UTM32 = CRS.from_epsg(25832)  # LGL data

# Defaults: the prototype's region and origin live in geo.py (shared with the OSM step).
DEFAULT_BASE = 284.0                             # m above sea level, Rhine water level near Sisseln (approx.)


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------- Switzerland: swissALTI3D via STAC ----------

def swiss_tiles(bbox, cache: Path, gsd: float = 2.0) -> list[Path]:
    cache.mkdir(parents=True, exist_ok=True)
    params = {"bbox": ",".join(f"{v:.6f}" for v in bbox), "limit": 100}
    items, url = [], STAC_ITEMS
    while url:
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        items += data.get("features", [])
        url = next((l["href"] for l in data.get("links", []) if l.get("rel") == "next"), None)
        params = None  # the next link already carries the query
    # several survey years per tile: keep the newest per tile id
    newest: dict[str, tuple[str, str]] = {}
    for it in items:
        for asset in it.get("assets", {}).values():
            href = asset.get("href", "")
            if not href.endswith(".tif") or asset.get("gsd", asset.get("eo:gsd")) not in (gsd, None):
                continue
            if f"_{gsd:g}_" not in Path(href).name:
                continue
            # name pattern: swissalti3d_<year>_<E>-<N>_<gsd>_2056_5728.tif
            parts = Path(href).stem.split("_")
            tile_id, year = parts[2], parts[1]
            if tile_id not in newest or year > newest[tile_id][0]:
                newest[tile_id] = (year, href)
    log(f"swissALTI3D: {len(newest)} tiles at {gsd:g} m")
    paths = []
    for _, href in sorted(newest.values()):
        dst = cache / Path(href).name
        if not dst.exists():
            log(f"  download {dst.name}")
            with requests.get(href, stream=True, timeout=300) as r:
                r.raise_for_status()
                tmp = dst.with_suffix(".part")
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                tmp.rename(dst)
        paths.append(dst)
    return paths


# ---------- Germany: LGL DGM1 from a local folder ----------

def xyz_to_dataset(path: Path, crs: CRS):
    """Read a regular-grid XYZ file (x y z per line) into an in-memory raster."""
    arr = np.loadtxt(path, dtype=np.float64)
    xs, ys = np.unique(arr[:, 0]), np.unique(arr[:, 1])
    res = float(np.median(np.diff(xs)))
    grid = np.full((len(ys), len(xs)), np.nan, dtype=np.float32)
    ci = np.rint((arr[:, 0] - xs[0]) / res).astype(int)
    ri = np.rint((ys[-1] - arr[:, 1]) / res).astype(int)
    grid[ri, ci] = arr[:, 2]
    transform = from_origin(xs[0] - res / 2, ys[-1] + res / 2, res, res)
    mem = MemoryFile()
    ds = mem.open(driver="GTiff", height=grid.shape[0], width=grid.shape[1], count=1,
                  dtype="float32", crs=crs, transform=transform, nodata=np.nan)
    ds.write(grid, 1)
    return ds


def german_datasets(folder: Path | None):
    if not folder:
        return []
    folder = folder.expanduser()
    if not folder.is_dir():
        log(f"DGM folder not found: {folder} (German side stays empty)")
        return []
    out = []
    for p in sorted(folder.rglob("*")):
        suf = p.suffix.lower()
        if suf in (".tif", ".tiff", ".asc"):
            ds = rasterio.open(p)
            if ds.crs is None:
                log(f"  {p.name}: no CRS, assuming EPSG:25832")
            out.append((ds, ds.crs or ETRS_UTM32))
        elif suf == ".xyz":
            out.append((xyz_to_dataset(p, ETRS_UTM32), ETRS_UTM32))
    log(f"LGL DGM1: {len(out)} tiles from {folder}")
    return out


# ---------- merge onto the game grid ----------

def build(bbox, origin, step, base, cache: Path, dgm_dir: Path | None):
    frame = Frame(*origin)
    e0, n0 = frame.e0, frame.n0
    g = grid_for(bbox, frame, step)
    x0, znorth, w, h = g["x0"], g["z0"], g["w"], g["h"]
    dst_transform = from_origin(e0 + x0 - step / 2, n0 - znorth + step / 2, step, step)
    log(f"grid {w} x {h} at {step:g} m ({(w - 1) * step / 1000:.1f} x {(h - 1) * step / 1000:.1f} km)")

    out = np.full((h, w), np.nan, dtype=np.float32)
    sources = []

    def paint(src_ds, src_crs, label):
        tmp = np.full((h, w), np.nan, dtype=np.float32)
        reproject(source=rasterio.band(src_ds, 1), destination=tmp,
                  src_transform=src_ds.transform, src_crs=src_crs, src_nodata=src_ds.nodata,
                  dst_transform=dst_transform, dst_crs=LV95, dst_nodata=np.nan,
                  resampling=Resampling.bilinear)
        hole = np.isnan(out) & ~np.isnan(tmp)
        out[hole] = tmp[hole]
        if hole.any() and label not in sources:
            sources.append(label)

    for p in swiss_tiles(bbox, cache / "swissalti3d"):
        with rasterio.open(p) as ds:
            paint(ds, ds.crs or LV95, "swissALTI3D (c) swisstopo")
    for ds, crs in german_datasets(dgm_dir):
        paint(ds, crs, "DGM1 Datengrundlage: LGL, www.lgl-bw.de (dl-de/by-2-0)")
        ds.close()

    missing = float(np.isnan(out).mean())
    if missing > 0:
        log(f"{missing:.1%} of the grid has no data (outside Switzerland without DGM1 tiles?) -> filled with base")
        out[np.isnan(out)] = base
    out -= base

    header = {
        "format": "MMH1", "w": w, "h": h, "step": step,
        "x0": float(x0), "z0": float(znorth),          # game coords of sample [0,0] (north-west corner)
        "origin": {"lat": origin[0], "lon": origin[1], "E": e0, "N": n0, "crs": "EPSG:2056"},
        "base": base, "min": float(out.min()), "max": float(out.max()),
        "bbox": list(bbox), "sources": sources,
    }
    return header, out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), default=DEFAULT_BBOX, help="lon/lat bounding box")
    ap.add_argument("--origin", nargs=2, type=float, metavar=("LAT", "LON"), default=DEFAULT_ORIGIN, help="game origin")
    ap.add_argument("--step", type=float, default=4.0, help="grid spacing in metres (default 4)")
    ap.add_argument("--base", type=float, default=DEFAULT_BASE, help="height that becomes 0 in the game (m a.s.l.)")
    ap.add_argument("--dgm-dir", type=Path, default=None, help="folder with LGL DGM1 tiles (German side)")
    ap.add_argument("--cache", type=Path, default=Path("cache"), help="download cache")
    ap.add_argument("--out", type=Path, default=Path("terrain_hochrhein.mmh"))
    a = ap.parse_args(argv)
    header, heights = build(tuple(a.bbox), tuple(a.origin), a.step, a.base, a.cache, a.dgm_dir)
    write_mmh(a.out, header, heights)
    return 0


if __name__ == "__main__":
    sys.exit(main())
