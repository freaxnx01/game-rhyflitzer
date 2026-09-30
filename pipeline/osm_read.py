"""One pyosmium pass over a regional extract -> plain records in game coordinates."""
from __future__ import annotations

import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import osmium
import shapely
import shapely.wkb

from geo import Frame

AREA_KEYS = ("building", "natural", "man_made", "landuse", "amenity", "water")
NODE_KEYS = ("man_made", "junction", "tourism")


def _is_named_node(tags) -> bool:
    if any(k in tags for k in NODE_KEYS):
        return True
    if tags.get("railway") in ("station", "halt"):
        return True
    return tags.get("highway") == "traffic_signals"


@dataclass
class Way:
    id: int
    tags: dict
    line: shapely.LineString


@dataclass
class Area:
    id: int
    from_way: bool
    tags: dict
    geom: shapely.Geometry


@dataclass
class NamedNode:
    id: int
    tags: dict
    x: float
    z: float


@dataclass
class OsmData:
    ways: list = field(default_factory=list)
    areas: list = field(default_factory=list)
    nodes: dict = field(default_factory=dict)
    named_nodes: list = field(default_factory=list)
    way_nodes: dict = field(default_factory=dict)
    skipped: Counter = field(default_factory=Counter)


def _to_game(frame: Frame, geom):
    def f(xy):
        x, z = frame.to_game(xy[:, 0], xy[:, 1])
        return np.column_stack([x, z])
    return shapely.transform(geom, f)


def read(path: Path, frame: Frame) -> OsmData:
    fab = osmium.geom.WKBFactory()
    out = OsmData()
    uses = Counter()
    locs: dict = {}
    fp = (osmium.FileProcessor(str(path))
          .with_locations()
          .with_areas(osmium.filter.KeyFilter(*AREA_KEYS)))
    for o in fp:
        if o.is_node():
            if _is_named_node(o.tags):
                x, z = frame.to_game(o.location.lon, o.location.lat)
                out.named_nodes.append(NamedNode(o.id, dict(o.tags), float(x), float(z)))
        elif o.is_way():
            tags = dict(o.tags)
            if not any(k in tags for k in ("highway", "railway", "waterway")):
                continue
            try:
                line = shapely.wkb.loads(fab.create_linestring(o))
            except (RuntimeError, osmium.InvalidLocationError):
                out.skipped["way-geometry"] += 1
                continue
            out.ways.append(Way(o.id, tags, _to_game(frame, line)))
            if "highway" in tags:
                ids = [n.ref for n in o.nodes]
                out.way_nodes[o.id] = ids
                uses.update(set(ids))
                # keep locations per node ref: the linestring drops duplicate vertices
                for n in o.nodes:
                    if n.location.valid():
                        locs[n.ref] = (n.location.lon, n.location.lat)
        elif o.is_area():
            try:
                geom = shapely.wkb.loads(fab.create_multipolygon(o))
            except (RuntimeError, osmium.InvalidLocationError):
                out.skipped["area-geometry"] += 1
                continue
            g = _to_game(frame, geom)
            if len(g.geoms) == 1:
                g = g.geoms[0]
            out.areas.append(Area(o.orig_id(), o.from_way(), dict(o.tags), g))
    shared = {nid for nid, c in uses.items() if c >= 2}
    for nid, c in uses.items():
        if c >= 2 and nid in locs:
            x, z = frame.to_game(*locs[nid])
            out.nodes[nid] = (float(x), float(z))
    if out.skipped:
        print(f"osm_read: skipped {dict(out.skipped)}", file=sys.stderr)
    return out
