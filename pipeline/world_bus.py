"""#682: PostAuto lines in the world file - route=bus relations of the chosen lines, chained, clipped,
with their stops at the kerb. OSM only; the timetable is timetable.py.

Read apart from osm_read for the reason world_boundaries.py gives: in one pass pyosmium meets a relation
only after its members, so the member ways and stop nodes need a second pass."""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import osmium
import shapely

from geo import Frame

STOP_ROLES = {"stop", "stop_entry_only", "stop_exit_only"}
PLATFORM_ROLES = {"platform", "platform_entry_only", "platform_exit_only"}
KERB = 0.5                # m: a stop sits w/2 + KERB right of the road's centre line
MAX_STOP_OFF = 30.0       # m: a stop farther than this from its route's line is not on it
CUT_EPS = 0.01            # m: an endpoint moved by less than this was not clipped


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


def _attach(nxt) -> set:
    """Nodes where the next way can be joined: any node of a closed way, else its two ends."""
    if not nxt:
        return set()
    return set(nxt) if nxt[0] == nxt[-1] else {nxt[0], nxt[-1]}


def _oriented(ns, end, nxt):
    """The way's node run starting at `end`, or None when it does not attach there."""
    if ns[0] == ns[-1]:                                     # closed way: ride it in drawing direction
        if end not in ns:
            return None
        ring = ns[:-1]
        i = ring.index(end)
        ring = ring[i:] + ring[:i]
        exits = [k for k, n in enumerate(ring) if k and n in _attach(nxt)]
        return (ring + ring[:1])[:(exits[0] if exits else len(ring)) + 1]
    if ns[0] == end:
        return ns
    if ns[-1] == end:
        return ns[::-1]
    return None


def _start(ns, nxt):
    """A run's first way, reversed when only its own first node reaches the next way."""
    if ns[0] != ns[-1] and ns[0] in _attach(nxt) and ns[-1] not in _attach(nxt):
        return ns[::-1]
    return ns


def chain(ways: list[int], way_nodes: dict) -> list[list[int]]:
    """The member ways as node-id runs in travel order, one run per contiguous piece.
    Ways missing from the extract are skipped; a way that attaches nowhere starts a new run."""
    present = [w for w in ways if len(way_nodes.get(w, ())) >= 2]
    runs, run = [], []
    for i, way in enumerate(present):
        nodes = way_nodes[way]
        nxt = way_nodes[present[i + 1]] if i + 1 < len(present) else None
        if run:
            oriented = _oriented(nodes, run[-1], nxt)
            if oriented is not None:
                run.extend(oriented[1:])
                continue
            runs.append(run)
        run = list(_start(nodes, nxt))
    if run:
        runs.append(run)
    return runs


def _line(run, node_xy):
    pts = [node_xy[n] for n in run if n in node_xy]
    if len(pts) < 2:
        return None
    line = shapely.LineString(pts)
    return line if line.length > 0 else None


def _parts(geom) -> list:
    if geom.geom_type == "LineString":
        return [geom]
    return [p for p in getattr(geom, "geoms", []) if p.geom_type == "LineString"]


def _clipped(line, clip):
    """The longest part of the line inside the map, in travel direction; None when nothing is left."""
    if clip.covers(line):  # intersection() splits a line that doubles back at every overlap
        return line
    parts = [p for p in _parts(line.intersection(clip)) if not p.is_empty and p.length > 0]
    if not parts:
        return None
    part = max(parts, key=lambda p: p.length)
    if line.project(shapely.Point(part.coords[0])) > line.project(shapely.Point(part.coords[-1])):
        part = shapely.LineString(part.coords[::-1])
    return part


def _road_widths(roads):
    """An STRtree over the road centre lines plus their widths, to read `w` at a stop."""
    geoms, widths = [], []
    for road in roads:
        pts = road.get("pts") or []
        if len(pts) < 2:
            continue
        geoms.append(shapely.LineString(pts))
        widths.append(float(road["w"]))
    return shapely.STRtree(geoms), widths


def _stop(point, part, tree, widths):
    """A stop at the kerb on the right of travel: the projected point plus the right normal x (w/2 + KERB).
    The width is the nearest road's at the point *on the route*, so a platform node on a pavement does not
    pick up a side street."""
    s = part.project(shapely.Point(point))
    on = part.interpolate(s)
    if math.dist((on.x, on.y), point) > MAX_STOP_OFF:
        return None
    width = widths[tree.nearest(on)]
    before = part.interpolate(max(s - 1.0, 0.0))
    after = part.interpolate(min(s + 1.0, part.length))
    dx, dz = after.x - before.x, after.y - before.y
    step = math.hypot(dx, dz)
    dx, dz = dx / step, dz / step
    off = width / 2 + KERB
    return {"s": round(s, 1), "x": round(on.x - dz * off, 1), "z": round(on.y + dx * off, 1),
            "rot": round(math.atan2(dz, dx), 2)}


def _stops(route: Route, data: BusData, part, tree, widths, stats: Counter) -> list[dict]:
    out, seen = [], set()
    for node in route.stops + route.platforms:
        tags = data.node_tags.get(node, {})
        uic = tags.get("uic_ref")
        if not uic:
            stats["stop-no-uic"] += 1
            continue
        if uic in seen or node not in data.node_xy:
            continue
        seen.add(uic)
        placed = _stop(data.node_xy[node], part, tree, widths)
        if placed is None:
            stats["stop-off-line"] += 1
            continue
        out.append({"uic": uic, "name": tags.get("name", ""), **placed})
    return sorted(out, key=lambda s: s["s"])


def build(data: BusData, roads: list[dict], clip) -> tuple[list[dict], Counter]:
    """One busRoutes entry per route: the chained line clipped to the map, in travel direction,
    with its kerb-side stops. Of several pieces only the longest is kept (#682, A9)."""
    tree, widths = _road_widths(roads)
    stats: Counter = Counter()
    out = []
    for route in data.routes:
        lines = [line for line in (_line(run, data.node_xy) for run in chain(route.ways, data.way_nodes))
                 if line is not None]
        if len(lines) > 1:
            stats["gaps"] += len(lines) - 1
        line = max(lines, key=lambda l: l.length) if lines else None
        part = _clipped(line, clip) if line is not None else None
        if part is None:
            stats["outside"] += 1
            continue
        out.append({"id": route.id, "line": route.tags.get("ref", ""), "name": route.tags.get("name", ""),
                    "from": route.tags.get("from", ""), "to": route.tags.get("to", ""),
                    "pts": [[round(x, 1), round(z, 1)] for x, z in part.coords],
                    "len": round(part.length, 1),
                    "cut": [math.dist(part.coords[0], line.coords[0]) > CUT_EPS,
                            math.dist(part.coords[-1], line.coords[-1]) > CUT_EPS],
                    "stops": _stops(route, data, part, tree, widths, stats)})
    return out, stats
