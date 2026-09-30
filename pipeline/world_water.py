"""Water: area polygons (the Rhine), buffered centre lines where no area exists, levels, distance field."""
from __future__ import annotations

import base64
import re
import sys

import numpy as np
import shapely
from scipy.ndimage import distance_transform_edt
from shapely.validation import make_valid

LINE_WIDTH = {"river": 20.0, "canal": 10.0, "stream": 3.0}


def _polys(g):
    if g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon" and p.area > 1.0]


def _width(tags, kind):
    m = re.match(r"\s*([0-9]+(?:[.,][0-9]+)?)", tags.get("width", ""))
    return float(m.group(1).replace(",", ".")) if m else LINE_WIDTH[kind]


def polygons(areas, ways, clip):
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
    for w in ways:
        kind = w.tags.get("waterway")
        if kind not in LINE_WIDTH or w.tags.get("tunnel", "no") != "no":
            continue
        line = w.line if covered is None else w.line.difference(covered.buffer(1.0))
        if line.is_empty or line.length < 5:
            continue
        out += _polys(line.buffer(_width(w.tags, kind) / 2, cap_style="flat").intersection(clip))
    return out


def chunks(polys, size=500.0):
    out = []
    for p in polys:
        x0, z0, x1, z1 = p.bounds
        for gx in np.arange(np.floor(x0 / size) * size, x1, size):
            for gz in np.arange(np.floor(z0 / size) * size, z1, size):
                out += _polys(p.intersection(shapely.box(gx, gz, gx + size, gz + size)))
    return out


def level(poly, hdr, heights) -> float:
    if hdr is None:
        return 0.0
    x0, z0, x1, z1 = poly.bounds
    s = hdr["step"]
    xs = np.arange(np.ceil((x0 - hdr["x0"]) / s), np.floor((x1 - hdr["x0"]) / s) + 1, dtype=int)
    zs = np.arange(np.ceil((z0 - hdr["z0"]) / s), np.floor((z1 - hdr["z0"]) / s) + 1, dtype=int)
    xs = xs[(xs >= 0) & (xs < hdr["w"])]; zs = zs[(zs >= 0) & (zs < hdr["h"])]
    if not len(xs) or not len(zs):
        return 0.0
    gx, gz = np.meshgrid(xs, zs)
    inside = shapely.contains_xy(poly, hdr["x0"] + gx * s, hdr["z0"] + gz * s)
    vals = heights[gz[inside], gx[inside]]
    return round(float(np.median(vals)), 2) if len(vals) else 0.0


def sdf(polys, bounds, step=8.0, clamp=120):
    x0, z0, x1, z1 = bounds
    w = int(np.ceil((x1 - x0) / step)) + 1
    h = int(np.ceil((z1 - z0) / step)) + 1
    gx, gz = np.meshgrid(x0 + np.arange(w) * step, z0 + np.arange(h) * step)
    water = np.zeros((h, w), bool)
    if polys:
        water = shapely.contains_xy(shapely.unary_union(polys), gx, gz)
    outside = distance_transform_edt(~water) * step
    inside = distance_transform_edt(water) * step
    d = np.clip(np.where(water, -inside, outside), -clamp, clamp)
    data = np.round(d).astype(np.int8)
    return {"x0": float(x0), "z0": float(z0), "step": float(step), "w": w, "h": h,
            "data": base64.b64encode(data.tobytes()).decode()}


def to_json(polys, hdr, heights):
    out = []
    for p in chunks(polys):
        rings = [[[round(x, 1), round(z, 1)] for x, z in p.exterior.coords[:-1]]]
        rings += [[[round(x, 1), round(z, 1)] for x, z in r.coords[:-1]] for r in p.interiors]
        out.append({"kind": "water", "level": level(p, hdr, heights), "rings": rings})
    return out
