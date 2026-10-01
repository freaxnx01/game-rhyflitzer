"""Buildings: OSM footprints along the main roads (and all big ones), height, roof type, palette."""
from __future__ import annotations

import math
import re
from collections import Counter

import shapely
from shapely.strtree import STRtree
from shapely.validation import make_valid

MAIN = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link"}
SKIP = {"roof", "carport", "construction", "ruins"}
FLOORS = {"house": 2, "detached": 2, "semidetached_house": 2, "residential": 2, "yes": 2, "terrace": 2,
          "apartments": 4, "farm": 1.5, "barn": 1.5, "commercial": 3, "retail": 3, "office": 3,
          "school": 3, "garage": 1, "garages": 1, "shed": 1}
FIXED = {"industrial": 9.0, "warehouse": 9.0, "church": 12.0, "chapel": 12.0}
FLOOR_H = 3.0
ROOF_SHARE = 0.8        # an OSM height includes the roof; walls get 80 %


def _num(s):
    m = re.match(r"\s*([0-9]+(?:[.,][0-9]+)?)", s or "")
    return float(m.group(1).replace(",", ".")) if m else None


def height(tags) -> float:
    h = _num(tags.get("height"))
    if h:
        return round(h * ROOF_SHARE, 2)
    lv = _num(tags.get("building:levels"))
    if lv:
        return lv * FLOOR_H
    b = tags.get("building", "yes")
    if b in FIXED:
        return FIXED[b]
    return FLOORS.get(b, 2) * FLOOR_H


def roof(poly):
    r = poly.minimum_rotated_rectangle
    c = list(r.exterior.coords)
    e1 = (c[1][0] - c[0][0], c[1][1] - c[0][1]); e2 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
    l1, l2 = math.hypot(*e1), math.hypot(*e2)
    long_edge, w, d = (e1, l1, l2) if l1 >= l2 else (e2, l2, l1)
    angle = math.atan2(long_edge[1], long_edge[0])
    cx, cz = r.centroid.x, r.centroid.y
    rect = [round(cx, 2), round(cz, 2), round(w, 2), round(d, 2), round(angle, 4)]
    fill = poly.area / r.area if r.area else 0
    return ("gable" if poly.area < 250 and fill > 0.85 else "flat"), rect


def _clean(geom):
    g = geom if geom.is_valid else make_valid(geom)
    if g.geom_type == "MultiPolygon":
        g = max(g.geoms, key=lambda p: p.area)
    if g.geom_type != "Polygon":
        return None
    g = shapely.Polygon(g.exterior)                  # holes dropped (spec)
    return g if g.is_valid and g.area > 0 and len(set(g.exterior.coords)) >= 3 else None


def build(areas, roads, clip, house_dist=30.0, big_area=1000.0, exclude_ids=frozenset(), industrial=(), keep_all=()):
    main = [shapely.LineString(r["pts"]) for r in roads if r["cls"] in MAIN and len(r["pts"]) >= 2]
    tree = STRtree(main) if main else None
    sites = shapely.unary_union(list(industrial)) if industrial else None
    quarters = shapely.unary_union(list(keep_all)) if keep_all else None   # areas where every house is kept, near a main road or not
    out, stats = [], Counter()
    for a in areas:
        t = a.tags
        if "building" not in t or t["building"] == "no":
            continue
        if t["building"] in SKIP:
            stats["skipped_type"] += 1
            continue
        if a.id in exclude_ids:
            stats["excluded_landmark"] += 1
            continue
        p = _clean(a.geom)
        if p is None:
            stats["degenerate"] += 1
            continue
        if p.area < 20:
            stats["too_small"] += 1
            continue
        if not clip.contains(p.centroid):
            continue
        near = tree is not None and len(tree.query(p, predicate="dwithin", distance=house_dist)) > 0
        in_quarter = not near and quarters is not None and quarters.contains(p.centroid)
        if not near and not in_quarter and (big_area <= 0 or p.area < big_area):
            continue
        kind, rect = roof(p)
        pal = "industrial" if sites is not None and sites.contains(p.centroid) else "village"
        ring = [[round(x, 1), round(z, 1)] for x, z in p.exterior.coords[:-1]]
        out.append({"id": a.id, "h": height(t), "roof": kind, "palette": pal, "rect": rect, "ring": ring})
        stats["kept_near" if near else "kept_area" if in_quarter else "kept_big"] += 1
    return out, dict(stats)
