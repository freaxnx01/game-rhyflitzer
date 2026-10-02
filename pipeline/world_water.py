"""Water: area polygons (the Rhine) with levels and a distance field; centre-line rivers and streams as lines."""
from __future__ import annotations

import base64
import re
import sys

import numpy as np
import shapely
from scipy.ndimage import distance_transform_edt
from shapely.validation import make_valid

import mmh

# terrain.py fills missing DEM with `base`, which is exactly 0.0 after subtracting base.
# Real measured heights are float32 values that are practically never exactly 0.0.
NODATA = 0.0
# default widths of centre-line water without a width tag (the Sissle is ~8-10 m wide)
LINE_WIDTH = {"river": 12.0, "canal": 10.0, "stream": 3.0}
FLAT_WIDTH = 30.0   # wider centre-line water (gaps in the Rhine area) is nearly level: a flat polygon, not a stream


def _polys(g):
    if g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g] if g.area > 1.0 else []
    return [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon" and p.area > 1.0]


def _width(tags, kind):
    m = re.match(r"\s*([0-9]+(?:[.,][0-9]+)?)", tags.get("width", ""))
    return float(m.group(1).replace(",", ".")) if m else LINE_WIDTH[kind]


def polygons(areas, ways, clip):
    """Area water (natural=water, riverbanks), clipped and repaired, plus centre lines wider than FLAT_WIDTH buffered
    where no area covers them. Narrower centre lines are streams()."""
    out = []
    for a in areas:
        t = a.tags
        if not (t.get("natural") == "water" or "water" in t or t.get("waterway") == "riverbank"):
            continue
        g = a.geom if a.geom.is_valid else make_valid(a.geom)
        if not a.geom.is_valid:
            print(f"world_water: repaired invalid water area {a.id}", file=sys.stderr)
        out += _polys(g.intersection(clip))
    covered = shapely.unary_union(out) if out else None
    for w in _lines(ways):
        width = _width(w.tags, w.tags["waterway"])
        if width <= FLAT_WIDTH:
            continue
        line = w.line if covered is None else w.line.difference(covered.buffer(1.0))
        if line.is_empty or line.length < 5:
            continue
        out += _polys(line.buffer(width / 2, cap_style="flat").intersection(clip))
    return out


def _lines(ways):
    return [w for w in ways if w.tags.get("waterway") in LINE_WIDTH and w.tags.get("tunnel", "no") == "no"]


def streams(areas, ways, clip):
    """Rivers, canals and streams mapped only as a centre line, as {name, w, pts} in flow direction (OSM draws
    waterways downstream). Parts inside area water and piped parts (tunnel/culvert) are left out. The prototype drapes
    them on the ground like a road, because a flat water level cannot follow a stream that falls 25 m across the map."""
    area = polygons(areas, ways, clip)
    covered = shapely.unary_union(area).buffer(1.0) if area else None
    out = []
    for w in _lines(ways):
        kind = w.tags["waterway"]
        if _width(w.tags, kind) > FLAT_WIDTH:
            continue
        line = w.line.intersection(clip)
        if covered is not None:
            line = line.difference(covered)
        parts = [line] if line.geom_type == "LineString" else [g for g in getattr(line, "geoms", []) if g.geom_type == "LineString"]
        for part in parts:
            if part.is_empty or part.length < 5:
                continue
            out.append({"name": w.tags.get("name", ""), "w": _width(w.tags, kind),
                        "pts": [[round(x, 1), round(z, 1)] for x, z in part.coords]})
    return out


def chunks(polys, size=500.0):
    out = []
    for p in polys:
        x0, z0, x1, z1 = p.bounds
        for gx in np.arange(np.floor(x0 / size) * size, x1, size):
            for gz in np.arange(np.floor(z0 / size) * size, z1, size):
                out += _polys(p.intersection(shapely.box(gx, gz, gx + size, gz + size)))
    return out


def level(poly, hdr, heights):
    """Water level in metres: median of valid (non-NODATA) grid samples inside poly.

    hdr None -> 0.0. Otherwise a float, or None when nothing valid was measured
    (the caller decides the fallback)."""
    if hdr is None:
        return 0.0
    x0, z0, x1, z1 = poly.bounds
    s = hdr["step"]
    xs = np.arange(np.ceil((x0 - hdr["x0"]) / s), np.floor((x1 - hdr["x0"]) / s) + 1, dtype=int)
    zs = np.arange(np.ceil((z0 - hdr["z0"]) / s), np.floor((z1 - hdr["z0"]) / s) + 1, dtype=int)
    xs = xs[(xs >= 0) & (xs < hdr["w"])]; zs = zs[(zs >= 0) & (zs < hdr["h"])]
    if len(xs) and len(zs):
        gx, gz = np.meshgrid(xs, zs)
        inside = shapely.contains_xy(poly, hdr["x0"] + gx * s, hdr["z0"] + gz * s)
        vals = heights[gz[inside], gx[inside]]
        vals = vals[vals != NODATA]
        if len(vals):
            return round(float(np.median(vals)), 2)
    px, pz = poly.representative_point().coords[0]
    if not (hdr["x0"] <= px <= hdr["x0"] + (hdr["w"] - 1) * s and hdr["z0"] <= pz <= hdr["z0"] + (hdr["h"] - 1) * s):
        return None
    v = mmh.sample(hdr, heights, px, pz)
    return None if v == NODATA else round(v, 2)


def sdf(polys, bounds, step=8.0, clamp=120):
    x0, z0, x1, z1 = bounds
    w = int(np.ceil((x1 - x0) / step)) + 1
    h = int(np.ceil((z1 - z0) / step)) + 1
    gx, gz = np.meshgrid(x0 + np.arange(w) * step, z0 + np.arange(h) * step)
    water = np.zeros((h, w), bool)
    if polys:
        water = shapely.contains_xy(shapely.unary_union(polys), gx, gz)
    if not water.any():
        d = np.full((h, w), clamp, dtype=float)
    elif water.all():
        d = np.full((h, w), -clamp, dtype=float)
    else:
        d = None
    if d is not None:
        data = d.astype(np.int8)
        return {"x0": float(x0), "z0": float(z0), "step": float(step), "w": w, "h": h,
                "data": base64.b64encode(data.tobytes()).decode()}
    outside = distance_transform_edt(~water) * step
    inside = distance_transform_edt(water) * step
    d = np.clip(np.where(water, -inside, outside), -clamp, clamp)
    data = np.round(d).astype(np.int8)
    return {"x0": float(x0), "z0": float(z0), "step": float(step), "w": w, "h": h,
            "data": base64.b64encode(data.tobytes()).decode()}


def to_json(polys, hdr, heights):
    out = []
    for whole in polys:
        fallback = level(whole, hdr, heights)
        if fallback is None:
            fallback = 0.0
        for p in chunks([whole]):
            lv = level(p, hdr, heights)
            rings = [[[round(x, 1), round(z, 1)] for x, z in p.exterior.coords[:-1]]]
            rings += [[[round(x, 1), round(z, 1)] for x, z in r.coords[:-1]] for r in p.interiors]
            out.append({"kind": "water", "level": fallback if lv is None else lv, "rings": rings})
    return out
