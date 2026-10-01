"""Street furniture (props): OSM nodes/areas -> {kind, x, z, rot}, kept off the driving surface."""
from __future__ import annotations

import math
from collections import Counter

import shapely
from shapely.strtree import STRtree

SKIP_HYDRANT = {"underground", "pipe"}          # a lid in the ground / a bare pipe, nothing to drive into
AREA_AMENITIES = ("bicycle_parking", "recycling")
ORIENTED = ("bench", "bike_rack")               # turned parallel to the nearest road


def classify(tags) -> str | None:
    if tags.get("emergency") == "fire_hydrant":
        return None if tags.get("fire_hydrant:type") in SKIP_HYDRANT else "hydrant"
    if tags.get("highway") == "street_lamp":
        return "lamp"
    amenity = tags.get("amenity")
    if amenity == "bench":
        return "bench"
    if amenity == "waste_basket":
        return "bin"
    if amenity == "bicycle_parking":
        return "bike_rack"
    if amenity == "recycling":
        if tags.get("recycling:glass_bottles") == "yes" or tags.get("recycling:glass") == "yes":
            return "glass_container"
        if tags.get("recycling:clothes") == "yes":
            return "clothes_container"
    return None


def _candidates(prop_nodes, areas):
    """(kind, x, z) per prop node and per qualifying area (its centroid); kind may be None."""
    out = [(classify(n.tags), n.x, n.z) for n in prop_nodes]
    for a in areas:
        if a.tags.get("amenity") not in AREA_AMENITIES:
            continue
        kind = classify(a.tags)
        if kind:
            centre = a.geom.centroid
            out.append((kind, centre.x, centre.y))
    return out


def _segments(roads):
    """One LineString per road segment, paired with its road, so distances use the real local direction."""
    segs = []
    for r in roads:
        pts = r["pts"]
        for i in range(len(pts) - 1):
            segs.append((shapely.LineString([pts[i], pts[i + 1]]), r))
    return segs


def _right_normal(seg):
    """Unit normal right of travel (x east, z south) and the segment's heading."""
    (ax, az), (bx, bz) = seg.coords
    dx, dz = bx - ax, bz - az
    length = math.hypot(dx, dz) or 1.0
    return -dz / length, dx / length, math.atan2(dz, dx)


def _side(seg, normal, x, z):
    """+1 right of the segment, -1 left; exactly on the centre line counts as right."""
    (ax, az), _ = seg.coords
    nx, nz = normal
    return 1.0 if (x - ax) * nx + (z - az) * nz >= 0 else -1.0


def _band(road, edge_gap):
    return road["w"] / 2 + edge_gap


def build(prop_nodes, areas, roads, clip, max_dist=15.0, edge_gap=0.6):
    """Props within max_dist of a drivable road edge, pushed out of every road band. Returns (props, stats)."""
    segs = _segments(roads)
    tree = STRtree([g for g, _ in segs]) if segs else None
    reach = max_dist + max((r["w"] / 2 + edge_gap for r in roads), default=0.0)
    stats, out = Counter(), []
    for kind, x, z in _candidates(prop_nodes, areas):
        if kind is None:
            stats["unclassified"] += 1
            continue
        point = shapely.Point(x, z)
        if not clip.contains(point):
            stats["out_of_bbox"] += 1
            continue
        near = [segs[i] for i in tree.query(point, predicate="dwithin", distance=reach)] if tree else []
        if any(g.distance(point) < _band(r, edge_gap) for g, r in near if r["bridge"]):
            stats["on_bridge"] += 1
            continue
        drive = [(g, r) for g, r in near if not r["bridge"]]
        if not drive or min(g.distance(point) - r["w"] / 2 for g, r in drive) > max_dist:
            stats["out_of_reach"] += 1
            continue
        # the road whose band reaches furthest over the prop (not the nearest centre line: a wide road next to a narrow
        # one can cover a prop that is outside the narrow road's band)
        seg, road = min(drive, key=lambda gr: gr[0].distance(point) - _band(gr[1], edge_gap))
        nx, nz, heading = _right_normal(seg)
        if seg.distance(point) < _band(road, edge_gap):
            foot = seg.interpolate(seg.project(point))
            offset = _side(seg, (nx, nz), x, z) * _band(road, edge_gap)
            x, z = foot.x + nx * offset, foot.y + nz * offset
            point = shapely.Point(x, z)
            stats["moved_to_edge"] += 1
        if any(g.distance(point) < _band(r, edge_gap) - 1e-6 for g, r in near):
            stats["still_on_road"] += 1
            continue
        rot = heading if kind in ORIENTED else 0.0
        out.append({"kind": kind, "x": round(x, 1), "z": round(z, 1), "rot": round(rot, 2)})
        stats["kept_" + kind] += 1
    return out, dict(stats)
