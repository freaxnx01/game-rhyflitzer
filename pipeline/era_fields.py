"""#530: farm field strips for the "Sisseln 1952" layer (the Sisslerfeld industrial site was farmland then).

`strips` lays long narrow strips over a polygon: the polygon is rotated so its long axis runs along x, cut into bands
of STRIP_MIN..STRIP_MAX metres across, and each band into pieces of CROSS_MIN..CROSS_MAX metres along. A last band or
piece narrower than half the minimum merges into the previous one. Every strip gets a crop kind from ERA_KINDS,
drawn from a seeded RNG, so the same site always gives the same strips.

`layout` cuts the strips by a keep-out geometry, insets them by half a seam and returns entries shaped like
`world["fields"]` items with `src: "era"`.

`keep_out_of` is what stays visible in 1952 (old roads and their kept stretches, rail, streams, forest, water, today's
fields, old buildings and car parks). `flag_site` sets `modern: true` on the car parks, props and DSM landmarks inside the
site (`plattform` is never flagged). `apply` does both and writes `world["era"]["fields"]`; run it after `era_1952.py`
and `era_roads.py`:

    python era_fields.py --world ../data/world_hochrhein.json
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import substring, unary_union

from era_roads import SUEDSPANGE_SIGNS, _to_game
from geo import Frame
from world_fields import FIELD_GAP, MIN_AREA, PARKING_GAP, RAIL_GAP, SEAM, STREAM_GAP, _entry, _polys, direction

STRIP_MIN = 18.0    # m, strip width across the long axis
STRIP_MAX = 40.0
CROSS_MIN = 120.0   # m, strip length along it
CROSS_MAX = 260.0
ERA_KINDS = ("cereal", "cereal", "cereal", "root", "meadow", "pasture", "bare")
KEEP_LANDMARKS = ("plattform",)  # stays visible in 1952
ROAD_LANDMARKS = ("fridolinsbruecke", *SUEDSPANGE_SIGNS)  # flagged by era_roads (their roads are hidden), not by the site
HERE = Path(__file__).parent
FOREST_WATER_GAP = 2.0  # m around forest and water


def _edges(lo, hi, size_min, size_max, rng):
    """Cut points from lo to hi; a remainder under size_min / 2 is absorbed by the previous piece."""
    edges = [lo]
    while hi - edges[-1] > 1e-9:
        nxt = edges[-1] + rng.uniform(size_min, size_max)
        if hi - nxt < size_min / 2:
            nxt = hi
        edges.append(min(nxt, hi))
    return edges


def strips(site, seed=1952):
    """Uncut (kind, polygon) strips covering `site`."""
    rng = random.Random(seed)
    centre = site.centroid
    angle = direction(site)
    flat = affinity.rotate(site, -angle, origin=centre, use_radians=True)
    minx, minz, maxx, maxz = flat.bounds
    out = []
    zs = _edges(minz, maxz, STRIP_MIN, STRIP_MAX, rng)
    for z0, z1 in zip(zs, zs[1:]):
        xs = _edges(minx, maxx, CROSS_MIN, CROSS_MAX, rng)
        for x0, x1 in zip(xs, xs[1:]):
            piece = flat.intersection(box(x0, z0, x1, z1))
            for part in _polys(piece):
                kind = ERA_KINDS[rng.randrange(len(ERA_KINDS))]
                out.append((kind, affinity.rotate(part, angle, origin=centre, use_radians=True)))
    return out


def layout(site, keep_out):
    """Field entries for `site` minus `keep_out` (a geometry or None), each inset by SEAM / 2."""
    kept = []
    for kind, strip in strips(site):
        free = strip if keep_out is None else strip.difference(keep_out)
        for part in _polys(free.buffer(-SEAM / 2)):
            if part.area >= MIN_AREA:
                kept.append((kind, part))
    kept.sort(key=lambda t: (t[1].bounds[0], t[1].bounds[1]))
    return [_entry(kind, part, "era", keep_out) for kind, part in kept]


def _road_parts(road):
    line = LineString(road["pts"])
    if "keep1952" not in road:
        return [line]
    return [substring(line, a, min(b, line.length)) for a, b in road["keep1952"]]


def keep_out_of(world):
    """What stays visible in 1952: geometry the strips must not cover."""
    cuts = []
    for road in world["roads"]:
        if road.get("modern"):
            continue
        cuts += [part.buffer(road["w"] / 2 + FIELD_GAP) for part in _road_parts(road) if part.length > 0]
    cuts += [LineString(pts).buffer(RAIL_GAP) for pts in world.get("rail", []) if len(pts) > 1]
    cuts += [LineString(s["pts"]).buffer(s["w"] / 2 + STREAM_GAP) for s in world.get("streams", []) if len(s["pts"]) > 1]
    cuts += [Polygon(f["ring"]).buffer(FOREST_WATER_GAP) for f in world.get("forests", [])]
    cuts += [Polygon(w["rings"][0]).buffer(FOREST_WATER_GAP) for w in world.get("water", [])]
    cuts += [Polygon(f["ring"]).buffer(SEAM) for f in world.get("fields", [])]
    for key in ("buildings", "parking"):
        cuts += [Polygon(i["ring"]).buffer(PARKING_GAP) for i in world.get(key, []) if not i.get("modern")]
    return unary_union(cuts)


def _set_flag(item, inside):
    item.pop("modern", None)
    if inside:
        item["modern"] = True
    return inside


def flag_site(world, site):
    """Flag car parks, props and DSM landmarks inside `site` as `modern`; clear the flag elsewhere."""
    counts = {"parking": 0, "props": 0, "landmarks": 0}
    for lot in world.get("parking", []):
        counts["parking"] += _set_flag(lot, site.contains(Polygon(lot["ring"]).centroid))
    for prop in world.get("props", []):
        counts["props"] += _set_flag(prop, site.contains(Point(prop["x"], prop["z"])))
    for name, lm in world.get("anchors", {}).get("landmarks", {}).items():
        if name in ROAD_LANDMARKS or "x" not in lm or "z" not in lm:
            continue
        if name in KEEP_LANDMARKS:
            lm.pop("modern", None)
            continue
        counts["landmarks"] += _set_flag(lm, site.contains(Point(lm["x"], lm["z"])))
    return counts


def apply(world, industrial_lonlat):
    """Retrofit `world` in place; returns the flag counts plus `fields`."""
    if "era" not in world:
        raise ValueError("world has no `era`: run era_1952.py first")
    frame = Frame(world["origin"]["lat"], world["origin"]["lon"])
    site = _to_game(industrial_lonlat, frame)
    counts = flag_site(world, site)
    world["era"]["fields"] = layout(site, keep_out_of(world))
    counts["fields"] = len(world["era"]["fields"])
    return counts


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    ap.add_argument("--industrial", type=Path, default=HERE / "industrial_sisslerfeld.geojson")
    a = ap.parse_args(argv)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    geo = json.loads(a.industrial.read_text(encoding="utf-8"))
    geometry = geo["features"][0]["geometry"] if geo.get("type") == "FeatureCollection" else geo.get("geometry", geo)
    counts = apply(world, geometry)
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"era_fields: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
