"""Railway: track polylines for the ribbon, and the bridge pieces (#76) the prototype lifts onto rail decks."""
from __future__ import annotations

import shapely


def is_bridge(tags) -> bool:
    return tags.get("bridge", "no") != "no"


def layer(tags) -> int:
    v = tags.get("layer", "")
    return int(v) if v.lstrip("-").isdigit() else (1 if is_bridge(tags) else 0)


def _pts(line):
    return [[round(x, 1), round(z, 1)] for x, z in line.coords]


def _clipped(line, clip):
    """The way inside the clip, or None when it misses the clip or falls apart into several pieces (as before #76)."""
    if not line.intersects(clip):
        return None
    part = line.intersection(clip)
    return part if part.geom_type == "LineString" else None


def build(ways, clip):
    rail, decks = [], {}
    for w in ways:
        if w.tags.get("railway") != "rail":
            continue
        part = _clipped(w.line, clip)
        if part is None:
            continue
        if is_bridge(w.tags):
            decks.setdefault(layer(w.tags), []).append(part)
        else:
            rail.append(_pts(part))
    bridges = []
    for lay, parts in sorted(decks.items()):
        merged = shapely.line_merge(shapely.MultiLineString(parts))
        for g in getattr(merged, "geoms", [merged]):
            bridges.append({"pts": _pts(g), "layer": lay})
    bridges.sort(key=lambda b: (b["layer"], b["pts"][0]))
    return rail, bridges
