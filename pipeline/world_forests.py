"""Forests (#13): OSM landuse=forest / natural=wood -> merged wood outlines with the roads and car parks cut out.

The prototype places the trees itself (edge row + fill, seeded) and puts invisible walls along every edge, so the
export is outlines only: every road through a wood must therefore be a gap in the outline, bridges included."""
from __future__ import annotations

from collections import Counter

import shapely
from shapely.validation import make_valid

import world_parking

CORRIDOR = 5.0       # m beyond the road edge (w/2) kept free of wood, both sides, every exported road
PARKING_GAP = 3.0    # m around a car park lot
MIN_AREA = 500.0     # m2: smaller parts are hedges, smaller holes are not clearings
SIMPLIFY = 1.0       # m, topology-preserving


def selected(tags) -> bool:
    return tags.get("landuse") == "forest" or tags.get("natural") == "wood"


def _polys(g):
    if g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon" and not p.is_empty]


def _ring(coords):
    return [[round(x, 1), round(z, 1)] for x, z in list(coords)[:-1]]


def _entry(p, cut):
    """A small hole is kept when a road corridor or a car park made it: only natural clearings under MIN_AREA go."""
    entry = {"ring": _ring(p.exterior.coords)}
    holes = [_ring(i.coords) for i in p.interiors
             if shapely.Polygon(i).area >= MIN_AREA or (cut is not None and cut.intersects(shapely.Polygon(i)))]
    if holes:
        entry["holes"] = holes
    return entry


def build(areas, roads, clip):
    """Woods inside `clip`, merged, minus road corridors and car parks. Returns (forests, stats)."""
    stats = Counter()
    woods = []
    for a in areas:
        if not selected(a.tags):
            continue
        stats["areas"] += 1
        g = a.geom if a.geom.is_valid else make_valid(a.geom)
        woods += _polys(g.intersection(clip))
    if not woods:
        return [], dict(stats)
    merged = shapely.unary_union(woods)
    cuts = [shapely.LineString(r["pts"]).buffer(r["w"] / 2 + CORRIDOR) for r in roads if len(r["pts"]) > 1]
    # mitred: a car park gap stays the lot's rectangle (4 vertices, and `simplify` cannot shave its corners)
    cuts += [a.geom.buffer(PARKING_GAP, join_style="mitre") for a in areas if world_parking.selected(a.tags)]
    cut = shapely.unary_union(cuts) if cuts else None
    if cut is not None:
        merged = merged.difference(cut)
        shapely.prepare(cut)                 # _entry asks it once per hole
    kept = []
    for p in _polys(merged):
        if p.area < MIN_AREA:
            stats["dropped_small"] += 1
            continue
        s = p.simplify(SIMPLIFY, preserve_topology=True)
        kept += [q for q in _polys(s) if q.area >= MIN_AREA]
    kept.sort(key=lambda p: (p.bounds[0], p.bounds[1]))
    stats["parts"] = len(kept)
    stats["area_ha"] = round(sum(p.area for p in kept) / 1e4)
    return [_entry(p, cut) for p in kept], dict(stats)
