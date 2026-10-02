"""Car parks (#40): OSM parking areas -> asphalt outline + painted bay lines, all in game metres."""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

import shapely
from shapely.ops import nearest_points
from shapely.strtree import STRtree

KINDS = {"surface", None, "street_side"}   # parking=* values drawn; None = no parking tag
BAY_W, BAY_D, PARALLEL_L = 2.5, 5.0, 6.0     # m: perpendicular bay width/depth, parallel bay length
AISLE_HALF = 3.0                             # m: half an aisle, bays start this far from its centre line
PARALLEL_MAX, STRIP_MAX, ONE_ROW_MAX = 3.5, 7.0, 16.0
FRONT_REACH = 20.0                           # m: roads this close decide which side of a mapped space is open
OVERLAP = 0.5                                # m²: a bay overlapping a house, road or accepted bay by more is dropped


@dataclass
class Bay:
    """Four corners; when `front` is True the edge corners[0] -> corners[1] is the open side (no line)."""
    corners: tuple
    front: bool

    @property
    def poly(self):
        return shapely.Polygon(self.corners)


def selected(tags) -> bool:
    return tags.get("amenity") == "parking" and tags.get("parking") in KINDS


def _polygons(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    return [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon" and not g.is_empty]


def _unit(a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz)
    return (dx / length, dz / length, length) if length else (0.0, 0.0, 0.0)


def _row(a, b, normal, depth, width):
    """Bays side by side along a -> b, front edge on that line, `depth` deep towards `normal`, centred on the line."""
    ux, uz, length = _unit(a, b)
    n = int(length // width)
    if n == 0:
        return []
    nx, nz = normal
    start = (length - n * width) / 2
    out = []
    for i in range(n):
        t0, t1 = start + i * width, start + (i + 1) * width
        f0 = (a[0] + ux * t0, a[1] + uz * t0)
        f1 = (a[0] + ux * t1, a[1] + uz * t1)
        out.append(Bay((f0, f1, (f1[0] + nx * depth, f1[1] + nz * depth), (f0[0] + nx * depth, f0[1] + nz * depth)), True))
    return out


def _shift(a, b, normal, d):
    nx, nz = normal
    return (a[0] + nx * d, a[1] + nz * d), (b[0] + nx * d, b[1] + nz * d)


def _aisle_bays(lot, aisles):
    """Rows of perpendicular bays on both sides of every aisle piece inside the lot."""
    out = []
    for line in aisles:
        piece = line.intersection(lot)
        for part in getattr(piece, "geoms", [piece]):
            if part.geom_type != "LineString":
                continue
            pts = list(part.coords)
            for a, b in zip(pts, pts[1:]):
                ux, uz, _ = _unit(a, b)
                for nx, nz in ((-uz, ux), (uz, -ux)):
                    fa, fb = _shift(a, b, (nx, nz), AISLE_HALF)
                    out += _row(fa, fb, (nx, nz), BAY_D, BAY_W)
    return out


def _rect_bays(lot, road_geom):
    """Bays from the lot's minimum rotated rectangle: parallel strip, bay strip, one row or two rows."""
    c = list(lot.minimum_rotated_rectangle.exterior.coords)[:4]
    if len(c) < 4:
        return []
    if math.dist(c[0], c[1]) < math.dist(c[1], c[2]):
        c = c[1:] + c[:1]
    sides = [(c[0], c[1], c[3]), (c[3], c[2], c[0])]          # (a, b, a point across the short side)
    if road_geom is not None:
        sides.sort(key=lambda s: shapely.LineString(s[:2]).distance(road_geom))
    (a, b, across), (fa, fb, _) = sides
    w = math.dist(a, across)
    inward = ((across[0] - a[0]) / w, (across[1] - a[1]) / w)
    if w < PARALLEL_MAX:
        return _row(a, b, inward, w, PARALLEL_L)
    if w < STRIP_MAX:
        return _row(a, b, inward, w, BAY_W)
    outward_far = inward                                        # from the far side's inner line back out to it
    rows = []
    fa_in, fb_in = _shift(fa, fb, (-inward[0], -inward[1]), BAY_D)
    rows += _row(fa_in, fb_in, outward_far, BAY_D, BAY_W)
    if w >= ONE_ROW_MAX:
        a_in, b_in = _shift(a, b, inward, BAY_D)
        rows += _row(a_in, b_in, (-inward[0], -inward[1]), BAY_D, BAY_W)
    return rows


def _mapped_bays(spaces, ref):
    """Mapped parking spaces as bays; the edge nearest `ref` (aisles/roads) is the open front, if there is a ref."""
    out = []
    for g in spaces:
        c = list(g.minimum_rotated_rectangle.exterior.coords)[:4]
        if len(c) < 4 or shapely.Polygon(c).area < 1.0:
            continue
        if ref is None:
            out.append(Bay(tuple(c), False))
            continue
        k = min(range(4), key=lambda i: shapely.Point((c[i][0] + c[(i + 1) % 4][0]) / 2,
                                                      (c[i][1] + c[(i + 1) % 4][1]) / 2).distance(ref))
        out.append(Bay(tuple(c[k:] + c[:k]), True))
    return out


def _capacity(tags):
    m = re.match(r"\s*([0-9]+)\s*$", tags.get("capacity", ""))
    return int(m.group(1)) if m else None


def _lines(bays):
    """Bay edges without the open fronts; an edge shared by two bays is written once."""
    seen, out = set(), []
    for bay in bays:
        c = bay.corners
        for i in range(1 if bay.front else 0, 4):
            p, q = c[i], c[(i + 1) % 4]
            p, q = (round(p[0], 1), round(p[1], 1)), (round(q[0], 1), round(q[1], 1))
            key = (p, q) if p <= q else (q, p)
            if p == q or key in seen:
                continue
            seen.add(key)
            out.append([p[0], p[1], q[0], q[1]])
    return out


def _sign(lot, road_lines):
    """Point on the lot's outline nearest a road, 1 m inside the lot, turned along that road."""
    if not road_lines:
        return None
    seg = min(road_lines, key=lambda s: s.distance(lot))
    p, _ = nearest_points(lot.exterior, seg)
    inner = lot.representative_point()
    ux, uz, _ = _unit((p.x, p.y), (inner.x, inner.y))
    (ax, az), (bx, bz) = seg.coords[0], seg.coords[-1]
    return [round(p.x + ux, 1), round(p.y + uz, 1), round(math.atan2(bz - az, bx - ax), 2)]


def _round_ring(ring):
    return [[round(x, 1), round(z, 1)] for x, z in list(ring.coords)[:-1]]


def build(areas, ways, buildings, roads, clip):
    """Car parks inside `clip` with their bay lines. Returns (parking, stats)."""
    stats = Counter()
    spaces = [a.geom for a in areas if a.tags.get("amenity") == "parking_space"]
    space_tree = STRtree(spaces) if spaces else None
    aisles = [w.line for w in ways if w.tags.get("service") == "parking_aisle"]
    aisle_tree = STRtree(aisles) if aisles else None
    houses = [shapely.Polygon(b["ring"]) for b in buildings if len(b.get("ring") or []) >= 3]
    house_tree = STRtree(houses) if houses else None
    segs = [shapely.LineString([p, q]) for r in roads if not r["bridge"] for p, q in zip(r["pts"], r["pts"][1:])]
    bands = [shapely.LineString([p, q]).buffer(r["w"] / 2) for r in roads for p, q in zip(r["pts"], r["pts"][1:])]
    seg_tree = STRtree(segs) if segs else None
    band_tree = STRtree(bands) if bands else None
    out = []
    for area in areas:
        if area.tags.get("amenity") != "parking":
            continue
        if not selected(area.tags):
            stats["skipped_" + area.tags.get("parking", "other")] += 1
            continue
        for lot in _polygons(area.geom.intersection(clip)):
            entry = _lot(area, lot, stats, spaces, space_tree, aisles, aisle_tree, houses, house_tree,
                         segs, seg_tree, bands, band_tree)
            out.append(entry)
    return out, dict(stats)


def _near(tree, items, geom, dist):
    return [items[i] for i in tree.query(geom, predicate="dwithin", distance=dist)] if tree is not None else []


def _lot(area, lot, stats, spaces, space_tree, aisles, aisle_tree, houses, house_tree, segs, seg_tree, bands, band_tree):
    stats["lots"] += 1
    near_roads = _near(seg_tree, segs, lot, FRONT_REACH)
    lot_aisles = _near(aisle_tree, aisles, lot, 0.0)
    mapped = [g for g in _near(space_tree, spaces, lot, 0.0) if lot.contains(g.centroid)]
    ref_parts = lot_aisles + near_roads
    ref = shapely.union_all(ref_parts) if ref_parts else None
    if mapped:
        bays, kind = _mapped_bays(mapped, ref), "mapped"
    elif lot_aisles:
        bays, kind = _aisle_bays(lot, lot_aisles), "aisle"
    else:
        road_geom = shapely.union_all(near_roads) if near_roads else None
        bays, kind = _rect_bays(lot, road_geom), "rect"
    kept = _filter(bays, lot, kind != "mapped", lot_aisles, houses, house_tree, bands, band_tree, stats)
    cap = _capacity(area.tags)
    if cap is not None and len(kept) > cap:
        centre = lot.centroid
        stats["dropped_capacity"] += len(kept) - cap
        kept = sorted(kept, key=lambda b: b.poly.centroid.distance(centre))[:cap]
    stats["bays_" + kind] += len(kept)
    entry = {"id": area.id}
    if area.tags.get("name"):
        entry["name"] = area.tags["name"]
    entry["ring"] = _round_ring(lot.exterior)
    if lot.interiors:
        entry["holes"] = [_round_ring(r) for r in lot.interiors]
    entry["bays"] = len(kept)
    entry["lines"] = _lines(kept)
    sign = _sign(lot, near_roads) if area.tags.get("name") else None
    if sign:
        entry["sign"] = sign
    return entry


def _filter(bays, lot, generated, lot_aisles, houses, house_tree, bands, band_tree, stats):
    inside = lot.buffer(0.1)
    aisle_band = shapely.union_all([a.buffer(AISLE_HALF - 0.2) for a in lot_aisles]) if lot_aisles else None
    kept, accepted = [], []
    for bay in bays:
        poly = bay.poly
        if generated and not inside.contains(poly):
            stats["dropped_outside"] += 1
            continue
        if generated and aisle_band is not None and poly.intersection(aisle_band).area > OVERLAP:
            stats["dropped_aisle"] += 1
            continue
        if any(poly.intersection(h).area > OVERLAP for h in _near(house_tree, houses, poly, 0.0)):
            stats["dropped_building"] += 1
            continue
        if any(poly.intersection(b).area > OVERLAP for b in _near(band_tree, bands, poly, 0.0)):
            stats["dropped_road"] += 1
            continue
        if generated and any(poly.intersection(o).area > OVERLAP for o in accepted):
            stats["dropped_overlap"] += 1
            continue
        kept.append(bay)
        accepted.append(poly)
    return kept
