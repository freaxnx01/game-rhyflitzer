"""Gemeinde boundaries (#48): member ways of OSM boundary=administrative + admin_level=8 relations, as lines.

Read apart from osm_read: in one pass pyosmium meets a relation only after its ways, and boundary ways carry no
highway/railway/waterway tag, so osm_read drops them. Lines, not areas: `osmium extract -s smart` completes only
multipolygon relations, so a Gemeinde reaching past the padded cut is incomplete and could not be assembled."""
from __future__ import annotations

from pathlib import Path

import osmium
import shapely
import shapely.wkb

from geo import Frame
from osm_read import _to_game

LEVEL = "8"
MIN_LEN = 5.0


def member_names(path: Path) -> dict[int, list[str]]:
    """way id -> sorted names of the named admin_level=8 relations it belongs to."""
    out: dict[int, set] = {}
    for r in osmium.FileProcessor(str(path), osmium.osm.RELATION):
        t = r.tags
        if t.get("boundary") != "administrative" or t.get("admin_level") != LEVEL or not t.get("name"):
            continue
        for m in r.members:
            if m.type == "w":
                out.setdefault(m.ref, set()).add(t["name"])
    return {k: sorted(v) for k, v in out.items()}


def read(path: Path, frame: Frame) -> list[tuple[int, list[str], shapely.LineString]]:
    """The member ways of member_names() as game-coordinate lines, sorted by way id."""
    names = member_names(path)
    fab = osmium.geom.WKBFactory()
    out = []
    for o in osmium.FileProcessor(str(path), osmium.osm.NODE | osmium.osm.WAY).with_locations():
        if not o.is_way() or o.id not in names:
            continue
        try:
            line = shapely.wkb.loads(fab.create_linestring(o))
        except (RuntimeError, osmium.InvalidLocationError):
            continue
        out.append((o.id, names[o.id], _to_game(frame, line)))
    return sorted(out, key=lambda t: t[0])


def _parts(g) -> list:
    if g.geom_type == "LineString":
        return [g]
    return [p for p in getattr(g, "geoms", []) if p.geom_type == "LineString"]


def build(items, clip, min_len: float = MIN_LEN) -> list[dict]:
    """Clip each line to the map; one entry per remaining part of at least min_len metres."""
    out = []
    for way_id, names, line in items:
        for part in _parts(line.intersection(clip)):
            if part.is_empty or part.length < min_len:
                continue
            out.append({"id": way_id, "names": list(names),
                        "pts": [[round(x, 1), round(z, 1)] for x, z in part.coords]})
    return out
