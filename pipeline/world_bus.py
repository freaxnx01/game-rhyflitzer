"""#682: PostAuto lines in the world file - route=bus relations of the chosen lines, chained, clipped,
with their stops at the kerb. OSM only; the timetable is timetable.py.

Read apart from osm_read for the reason world_boundaries.py gives: in one pass pyosmium meets a relation
only after its members, so the member ways and stop nodes need a second pass."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import osmium

from geo import Frame

STOP_ROLES = {"stop", "stop_entry_only", "stop_exit_only"}
PLATFORM_ROLES = {"platform", "platform_entry_only", "platform_exit_only"}


@dataclass
class Route:
    id: int
    tags: dict
    ways: list = field(default_factory=list)
    stops: list = field(default_factory=list)
    platforms: list = field(default_factory=list)


@dataclass
class BusData:
    routes: list = field(default_factory=list)
    way_nodes: dict = field(default_factory=dict)
    node_xy: dict = field(default_factory=dict)
    node_tags: dict = field(default_factory=dict)


def _routes(path: Path, lines: list[str]) -> list[Route]:
    out = []
    for r in osmium.FileProcessor(str(path), osmium.osm.RELATION):
        t = r.tags
        if t.get("type") != "route" or t.get("route") != "bus" or t.get("ref") not in lines:
            continue
        route = Route(r.id, dict(t))
        for m in r.members:
            if m.type == "w" and not m.role:
                route.ways.append(m.ref)
            elif m.type == "n" and m.role in STOP_ROLES:
                route.stops.append(m.ref)
            elif m.type == "n" and m.role in PLATFORM_ROLES:
                route.platforms.append(m.ref)
        out.append(route)
    return sorted(out, key=lambda r: r.id)


def read(path: Path, frame: Frame, lines: list[str]) -> BusData:
    """The type=route + route=bus relations whose ref is in lines, with their member ways' node runs
    (in drawing direction), every involved node's game position and the stop/platform nodes' tags."""
    routes = _routes(path, lines)
    want_ways = {w for r in routes for w in r.ways}
    want_nodes = {n for r in routes for n in r.stops + r.platforms}
    data = BusData(routes=routes)
    for o in osmium.FileProcessor(str(path), osmium.osm.NODE | osmium.osm.WAY).with_locations():
        if o.is_node():
            if o.id in want_nodes:
                data.node_tags[o.id] = dict(o.tags)
                data.node_xy[o.id] = _xy(frame, o.location)
            continue
        if o.id not in want_ways:
            continue
        nodes = []
        for n in o.nodes:
            nodes.append(n.ref)
            if n.ref not in data.node_xy and n.location.valid():
                data.node_xy[n.ref] = _xy(frame, n.location)
        data.way_nodes[o.id] = nodes
    return data


def _xy(frame: Frame, loc) -> tuple[float, float]:
    x, z = frame.to_game(loc.lon, loc.lat)
    return float(x), float(z)
