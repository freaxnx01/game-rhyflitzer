"""#530: farm field strips for the "Sisseln 1952" layer (the Sisslerfeld industrial site was farmland then).

`strips` lays long narrow strips over a polygon: the polygon is rotated so its long axis runs along x, cut into bands
of STRIP_MIN..STRIP_MAX metres across, and each band into pieces of CROSS_MIN..CROSS_MAX metres along. A last band or
piece narrower than half the minimum merges into the previous one. Every strip gets a crop kind from ERA_KINDS,
drawn from a seeded RNG, so the same site always gives the same strips.

`layout` cuts the strips by a keep-out geometry, insets them by half a seam and returns entries shaped like
`world["fields"]` items with `src: "era"`.
"""
from __future__ import annotations

import random

from shapely import affinity
from shapely.geometry import box

from world_fields import MIN_AREA, SEAM, _entry, _polys, direction

STRIP_MIN = 18.0    # m, strip width across the long axis
STRIP_MAX = 40.0
CROSS_MIN = 120.0   # m, strip length along it
CROSS_MAX = 260.0
ERA_KINDS = ("cereal", "cereal", "cereal", "root", "meadow", "pasture", "bare")


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


def box(x0, z0, x1, z1):
    from shapely.geometry import box
    return box(x0, z0, x1, z1)


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
