"""Building heights from swisstopo surface data (#17): swissSURFACE3D (roofs, 0.5 m) minus swissALTI3D (ground, 2 m).

Most OSM houses carry no height, so the world used a default (house 6 m). Each footprint (a little shrunk, so walls and
roof overhangs don't count) is read from the surface model: the eaves height `h` is the low edge of the roof (10th
percentile) and the ridge height `rh` the rise from there to the top (95th percentile), both over the ground under the
centre. A flat roof has rh ~ 0. The roof shape follows the ridge (#43): rh >= 1.5 m on a rectangular footprint under
1,000 m2 is a gable, rh < 0.6 m is flat, in between the footprint heuristic decides. Measured rather than modelled: many houses here have shallow roofs, which a fixed
0.4 * width gable got badly wrong. A footprint whose roof top is under 2 m was not built yet when the surface was
flown (2020) and keeps its height. Swiss side only; buildings outside the tiles keep their height.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import rasterio
import shapely
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds

SHRINK = 0.75      # m: stay off walls and roof overhangs
MIN_H = 2.5
NOT_BUILT = 2.0    # m: roof top under this = not built yet when the surface was flown (2020); keep the OSM height

RIDGE_GABLE = 1.5         # m: a ridge this high on a rectangular footprint is a pitched roof (#43)
RIDGE_FLAT = 0.6          # m: under this the roof is flat (the prototype's cut, index.html osmBuilding)
RECT_FILL = 0.85          # footprint share of its rotated rectangle; inclusive here, world_buildings.roof() uses > 0.85
GABLE_MAX_AREA = 1000.0   # m2: the pipeline's big-building threshold; a bigger hall keeps a flat roof


def roof_shape(kind, rh, fill, area):
    """Roof from the measured ridge (#43). A ridge of at least RIDGE_GABLE on a footprint that fills RECT_FILL of its
    rectangle and is under GABLE_MAX_AREA is a gable; a ridge under RIDGE_FLAT is flat; between the two the footprint
    heuristic's `kind` stays (a shallow roof and a parapet measure alike)."""
    if rh >= RIDGE_GABLE and fill >= RECT_FILL and area < GABLE_MAX_AREA:
        return "gable"
    if rh < RIDGE_FLAT:
        return "flat"
    return kind


def _open(paths):
    out = []
    for p in paths:
        ds = rasterio.open(p)
        out.append((shapely.box(*ds.bounds), ds))
    return out


def _tile(tiles, pt):
    return next((ds for box, ds in tiles if box.contains(pt)), None)


def apply(buildings, frame, dsm_paths, dtm_paths, min_samples=8, max_h=150.0):
    """Set b["h"] (eaves), b["rh"] (ridge), b["hsrc"] = "dsm" and b["roof"] from the ridge (#43) where the surface data
    covers the footprint. Returns stats."""
    dsm, dtm = _open(dsm_paths), _open(dtm_paths)
    stats = Counter()
    try:
        for b in buildings:
            poly = shapely.Polygon([(x + frame.e0, frame.n0 - z) for x, z in b["ring"]])
            c = poly.centroid
            ds, gs = _tile(dsm, c), _tile(dtm, c)
            if ds is None or gs is None:
                stats["no_data"] += 1
                continue
            inner = poly.buffer(-SHRINK)
            if inner.is_empty:
                inner = poly
            win = from_bounds(*inner.bounds, transform=ds.transform).round_offsets().round_lengths()
            if win.width < 1 or win.height < 1:
                stats["no_data"] += 1
                continue
            arr = ds.read(1, window=win, boundless=True, fill_value=np.nan).astype("float64")
            mask = geometry_mask([inner], out_shape=arr.shape, transform=ds.window_transform(win), invert=True)
            ground = float(next(gs.sample([(c.x, c.y)]))[0])
            vals = arr[mask]
            vals = vals[np.isfinite(vals) & (vals > ground - 5)]
            if len(vals) < min_samples:
                stats["no_data"] += 1
                continue
            lo, hi = (float(v) for v in np.percentile(vals, [10, 95]))
            if hi - ground < NOT_BUILT:
                stats["not_built"] += 1
                continue
            # the shrink cut off the lowest strip of a pitched roof: continue its slope out to the wall line
            half = min(b["rect"][2], b["rect"][3]) / 2
            lo_pitched = lo - (hi - lo) * SHRINK / (half - SHRINK) if half > SHRINK + 1 else lo
            # the roof shape comes first (#43), judged on the ridge a pitched roof would have, so a footprint the ridge
            # promotes to gable gets the same eaves as one the heuristic already called gable (review of #68)
            shape = roof_shape(b["roof"], round(max(0.0, hi - lo_pitched), 1), poly.area / (b["rect"][2] * b["rect"][3]), poly.area)
            if shape != b["roof"]:
                stats["ridge_" + shape] += 1
                b["roof"] = shape
            if b["roof"] == "gable":
                lo = lo_pitched
            b["h"] = round(float(np.clip(lo - ground, MIN_H, max_h)), 1)
            b["rh"] = round(max(0.0, hi - lo), 1)
            b["hsrc"] = "dsm"
            stats["dsm"] += 1
    finally:
        for _, ds in dsm + dtm:
            ds.close()
    return stats
