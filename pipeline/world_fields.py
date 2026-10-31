"""#506: farm fields. Cantonal Nutzungsflächen (crop per parcel, EPSG:2056 GeoJSON from fields_ch.py) first, OSM
landuse=farmland|meadow|orchard|vineyard where the cantonal data has nothing (the German bank, gaps). Every parcel keeps
off roads, rail and car parks in here, so the game can never draw a field under a road (#290)."""
import math
from collections import Counter

import numpy as np
import shapely
from shapely.validation import make_valid

import world_parking

FIELD_GAP = 1.0      # m beyond the road's half width
RAIL_GAP = 3.0       # m either side of a track centre line
PARKING_GAP = 3.0    # m around a car park lot
SEAM = 1.5           # m of grass between neighbouring parcels (each parcel inset by half)
SIMPLIFY = 1.0       # m, topology-preserving
MIN_AREA = 300.0     # m2
OSM_GAP = 2.0        # m: OSM fields keep this far off any cantonal parcel

KINDS = ("cereal", "maize", "rapeseed", "root", "fallow", "bare", "meadow", "meadowDry", "pasture", "orchard", "vine")
# lnf_code (MGDM 153.1 "Nutzungsflächen") -> kind. Exact codes first, then the hundreds' fallbacks.
KIND_BY_CODE = {
    **{c: "cereal" for c in range(501, 517)}, 508: "maize", 521: "maize", 527: "rapeseed",
    **{c: "root" for c in (522, 523, 528, 531, 536, *range(540, 552))},
    **{c: "fallow" for c in range(556, 560)}, 598: "bare",
    611: "meadowDry", 616: "pasture", 617: "pasture",
    701: "vine", 717: "vine", **{c: "orchard" for c in range(702, 706)},
}
FALLBACK_BY_HUNDRED = {5: "bare", 6: "meadow", 7: "orchard"}
OSM_FARMLAND = ("cereal", "cereal", "maize", "bare", "rapeseed")
OSM_KINDS = {"meadow": "meadow", "orchard": "orchard", "vineyard": "vine"}


def kind_of(code):
    try:
        code = int(code)
    except (TypeError, ValueError):
        return None
    return KIND_BY_CODE.get(code) or FALLBACK_BY_HUNDRED.get(code // 100)


def osm_kind(tags, id):
    lu = tags.get("landuse")
    if lu == "farmland":
        return OSM_FARMLAND[int(id) % len(OSM_FARMLAND)]
    return OSM_KINDS.get(lu)


def direction(p):
    """The long side of the minimum rotated rectangle, as an angle in the game frame folded to [0, pi)."""
    box = shapely.minimum_rotated_rectangle(p)
    pts = list(box.exterior.coords)[:4]
    (ax, az), (bx, bz), (cx, cz) = pts[0], pts[1], pts[2]
    if math.hypot(bx - ax, bz - az) < math.hypot(cx - bx, cz - bz):
        ax, az, bx, bz = bx, bz, cx, cz
    return round(math.atan2(bz - az, bx - ax) % math.pi, 2)


def _polys(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon" and not p.is_empty]


def _ring(coords):
    return [[round(x, 1), round(z, 1)] for x, z in list(coords)[:-1]]


def _to_game(frame, geom):
    def f(xy):
        x, z = frame.lv95_to_game(xy[:, 0], xy[:, 1])
        return np.column_stack([x, z])
    return shapely.transform(geom, f)


def _lwb(features, clip, frame, stats):
    out = []
    for ft in features or []:
        p = ft.get("properties") or {}
        if p.get("ist_ueberlagernd"):
            stats["dropped_overlay"] += 1
            continue
        kind = kind_of(p.get("lnf_code"))
        if kind is None:
            stats["dropped_code"] += 1
            continue
        g = shapely.geometry.shape(ft["geometry"])
        g = _to_game(frame, g if g.is_valid else make_valid(g)).intersection(clip)
        if g.is_empty:
            continue
        stats["lwb"] += 1
        out.append((kind, g, "lwb"))
    return out


def _osm(areas, clip, taken, stats):
    out = []
    for a in areas:
        kind = osm_kind(a.tags, a.id)
        if kind is None:
            continue
        g = a.geom if a.geom.is_valid else make_valid(a.geom)
        g = g.intersection(clip)
        if taken is not None:
            g = g.difference(taken)
        if g.is_empty:
            continue
        stats["osm"] += 1
        out.append((kind, g, "osm"))
    return out


def _cuts(areas, roads, rail):
    cuts = [shapely.LineString(r["pts"]).buffer(r["w"] / 2 + FIELD_GAP) for r in roads if len(r["pts"]) > 1]
    cuts += [shapely.LineString(line).buffer(RAIL_GAP) for line in rail if len(line) > 1]
    cuts += [a.geom.buffer(PARKING_GAP, join_style="mitre") for a in areas if world_parking.selected(a.tags)]
    return shapely.unary_union(cuts) if cuts else None


def _entry(kind, p, src):
    e = {"kind": kind, "ring": _ring(p.exterior.coords)}
    holes = [_ring(i.coords) for i in p.interiors if shapely.Polygon(i).area >= MIN_AREA]
    if holes:
        e["holes"] = holes
    e["dir"] = direction(p)
    e["src"] = src
    return e


def build(features, areas, roads, rail, clip, frame):
    """Fields inside `clip`: cantonal parcels, then OSM where they leave room; minus corridors; inset by SEAM/2."""
    stats = Counter()
    parcels = _lwb(features, clip, frame, stats)
    taken = shapely.unary_union([g for _, g, _ in parcels]).buffer(OSM_GAP) if parcels else None
    parcels += _osm(areas, clip, taken, stats)
    if not parcels:
        return [], {}
    cut = _cuts(areas, roads, rail)
    if cut is not None:
        shapely.prepare(cut)
    kept = []
    # #290: simplify BEFORE the corridor cut. Douglas-Peucker can bulge an edge up to SIMPLIFY metres outside the
    # polygon, so simplifying after the cut would push the road-facing edge back into the FIELD_GAP = 1 m corridor
    # (measured on the real Hochrhein data: 98 fields touching a road). After the cut only operations that never
    # expand follow (difference, erosion), so no field can end up under a road footprint.
    for kind, g, src in parcels:
        for p in _polys(g):
            s = p.simplify(SIMPLIFY, preserve_topology=True)
            for q in _polys(s):
                if q.area < MIN_AREA:
                    stats["dropped_small"] += 1
                    continue
                if cut is not None:
                    q = q.difference(cut)
                q = q.buffer(-SEAM / 2)
                for r in _polys(q):
                    if r.area < MIN_AREA:
                        stats["dropped_small"] += 1
                        continue
                    kept.append((kind, r, src))
    kept.sort(key=lambda t: (t[1].bounds[0], t[1].bounds[1]))
    stats["parts"] = len(kept)
    stats["area_ha"] = round(sum(q.area for _, q, _ in kept) / 1e4)
    return [_entry(k, q, s) for k, q, s in kept], dict(stats)
