"""#530: flag the roads that did not exist in 1952 in an existing world file ("Sisseln 1952" layer).

Needs the buildings already flagged by `era_1952.py` (`modern`). A road is hidden ("modern": true) if, on the Swiss
side (midpoint inside the CH outline; the German side stays as today), it is a motorway (`motorway*`), lies at least
INDUSTRIAL_SHARE inside the Sisslerfeld industrial site and is not a main road, or is a residential street
(`residential`, `living_street`, `service`) with no old Swiss building footprint within NEAR_OLD. The Fridolinsbruecke
is hidden on both banks. Precedence: bridge > motorway > industrial > empty.

A kept road that the hiding cuts off from the main kept network gets back the fewest "empty" roads that reconnect it
(shortest chain, BFS over road vertices snapped to ENDPOINT_TOL). A kept bridge also joins every road vertex within
BRIDGE_SNAP of its ends, so the Holzbruecke keeps its Swiss approach.

A kept residential street with old houses nearby (a trim candidate) is then trimmed (`trim`): it keeps the stretch from
its first old footprint minus TRIM_PAD to the last plus TRIM_PAD, and each such stretch is joined to the old network
(kept roads that are not candidates) by the shortest route through candidate roads (Dijkstra over road vertices and the
cut points, cost = metres not yet kept), nearest first. A stretch with no route keeps its whole road. Written as
`road["keep1952"] = [[a, b], ...]` (metres along `pts`, only if at least MIN_TRIM is dropped).

Sets `road["modern"] = True` (last key) and removes it from every other road; likewise `keep1952`; idempotent.

    python era_roads.py --world ../data/world_hochrhein.json
"""
from __future__ import annotations

import argparse
import heapq
import json
from collections import deque
from pathlib import Path

from shapely import STRtree
from shapely.geometry import LineString, Point, Polygon, shape

from era_1952 import _load_outline, _outline_to_game
from geo import Frame

NEAR_OLD = 25.0  # m, an old Swiss building footprint this close to a street makes it "lead to an old house"
INDUSTRIAL_SHARE = 0.5  # share of the road length inside the industrial site
ENDPOINT_TOL = 0.5  # m, vertices closer than this are the same junction
BRIDGE_SNAP = 15.0  # m, a kept bridge end joins any road vertex this close (bridges often end beside the road, not on it)
TRIM_PAD = 10.0  # m, a trimmed street runs this far past the old house it serves
MIN_TRIM = 0.5  # m, a trim that cuts less than this off both ends is not worth writing
RESIDENTIAL = ("residential", "living_street", "service")
MAIN_PREFIXES = ("motorway", "trunk", "primary", "secondary", "tertiary")
BRIDGE_NAME = "Fridolinsbrücke"
HERE = Path(__file__).parent


def _old_swiss_footprints(buildings, swiss):
    polys = [Polygon(b["ring"]) for b in buildings if not b.get("modern")]
    return [p for p in polys if swiss.contains(p.centroid)]


def _industrial_reason(line, cls, industrial):
    if cls.startswith(MAIN_PREFIXES) or line.length <= 0:
        return None
    return "industrial" if line.intersection(industrial).length / line.length >= INDUSTRIAL_SHARE else None


def _swiss_reason(line, road, industrial, old_tree):
    cls = road["cls"]
    if cls.startswith("motorway"):
        return "motorway"
    reason = _industrial_reason(line, cls, industrial)
    if reason:
        return reason
    if cls in RESIDENTIAL and not len(old_tree.query(line.buffer(NEAR_OLD), predicate="intersects")):
        return "empty"
    return None


def classify(roads, buildings, swiss, industrial):
    """Map road index -> "bridge" | "motorway" | "industrial" | "empty"; only hidden roads. Game frame."""
    old_tree = STRtree(_old_swiss_footprints(buildings, swiss))
    hidden = {}
    for i, road in enumerate(roads):
        line = LineString(road["pts"])
        if road.get("n") == BRIDGE_NAME:
            hidden[i] = "bridge"
        elif swiss.contains(line.interpolate(0.5, normalized=True)):
            reason = _swiss_reason(line, road, industrial, old_tree)
            if reason:
                hidden[i] = reason
    return hidden


def _nodes(road):
    """The junction keys of a road: every vertex, since ways also cross at interior vertices."""
    return {(round(x / ENDPOINT_TOL), round(z / ENDPOINT_TOL)) for x, z in road["pts"]}


def _node_sets(roads, hidden):
    """Junction keys per road index; a kept bridge's ends also count as the vertices of any road within BRIDGE_SNAP."""
    sets = [_nodes(r) for r in roads]
    vertices = [(x, z, key) for r in roads for (x, z), key in zip(r["pts"], _vertex_keys(r))]
    for i, road in enumerate(roads):
        if not road.get("bridge") or i in hidden:
            continue
        for ex, ez in (road["pts"][0], road["pts"][-1]):
            sets[i].update(key for x, z, key in vertices if (x - ex) ** 2 + (z - ez) ** 2 <= BRIDGE_SNAP ** 2)
    return sets


def _vertex_keys(road):
    return [(round(x / ENDPOINT_TOL), round(z / ENDPOINT_TOL)) for x, z in road["pts"]]


def _components(node_sets, kept):
    """Kept road indices grouped by shared vertices (union-find), each with its node set."""
    parent = {}

    def find(n):
        parent.setdefault(n, n)
        while parent[n] != n:
            parent[n] = parent[parent[n]]
            n = parent[n]
        return n

    for i in kept:
        first, *rest = node_sets[i]
        for n in rest:
            parent[find(n)] = find(first)
    groups = {}
    for i in kept:
        groups.setdefault(find(next(iter(node_sets[i]))), []).append(i)
    return [(idx, set().union(*(node_sets[i] for i in idx))) for idx in groups.values()]


def _empty_index(node_sets, hidden):
    """node -> the "empty" roads that have a vertex there."""
    index = {}
    for i, reason in hidden.items():
        if reason == "empty":
            for n in node_sets[i]:
                index.setdefault(n, []).append(i)
    return index


def _shortest_chain(node_sets, index, sources, targets):
    """Road indices of the fewest "empty" roads linking any source node to any target node, or None."""
    came = {n: None for n in sources}
    queue = deque(sorted(sources))
    while queue:
        node = queue.popleft()
        if node in targets:
            chain = []
            while came[node] is not None:
                node, road = came[node]
                chain.append(road)
            return chain
        for road in index.get(node, ()):
            for nxt in sorted(node_sets[road]):
                if nxt not in came:
                    came[nxt] = (node, road)
                    queue.append(nxt)
    return None


def _swiss_kept_count(roads, indices, swiss):
    if swiss is None:
        return len(indices)
    return sum(1 for i in indices if swiss.contains(LineString(roads[i]["pts"]).interpolate(0.5, normalized=True)))


def reconnect(roads, hidden, swiss=None):
    """Indices of "empty" roads to restore so that every reachable cut-off kept component joins the main one.

    With `swiss`, only the Swiss kept roads count: the main component is the one with the most of them and
    components without any are left alone (the German network is cut off at the hidden bridge, not by us).
    """
    kept = [i for i in range(len(roads)) if i not in hidden]
    node_sets = _node_sets(roads, hidden)
    comps = [(idx, nodes, _swiss_kept_count(roads, idx, swiss)) for idx, nodes in _components(node_sets, kept)]
    comps.sort(key=lambda c: (-c[2], min(c[0])))
    main_nodes = set(comps[0][1])
    index = _empty_index(node_sets, hidden)
    restored = set()
    for _, nodes, swiss_count in comps[1:]:
        if not swiss_count or nodes & main_nodes:
            continue
        chain = _shortest_chain(node_sets, index, nodes, main_nodes)
        if chain is None:
            continue
        restored.update(chain)
        main_nodes |= nodes.union(*(node_sets[i] for i in chain))
    return restored


def _arc_range(line, polygons):
    arcs = [line.project(Point(x, z)) for p in polygons for x, z in p.exterior.coords]
    return min(arcs), max(arcs)


def _house_stretches(roads, hidden, restored, buildings, swiss):
    """Road index -> (a, b): the stretch of each trim candidate that its old footprints need (pad included)."""
    old_polys = _old_swiss_footprints(buildings, swiss)
    old_tree = STRtree(old_polys)
    stretches = {}
    for i, road in enumerate(roads):
        if i in hidden or i in restored or road["cls"] not in RESIDENTIAL or road.get("bridge"):
            continue
        line = LineString(road["pts"])
        if not swiss.contains(line.interpolate(0.5, normalized=True)):
            continue
        near = old_tree.query(line.buffer(NEAR_OLD), predicate="intersects")
        if len(near):
            lo, hi = _arc_range(line, [old_polys[k] for k in near])
            stretches[i] = (max(lo - TRIM_PAD, 0.0), min(hi + TRIM_PAD, line.length))
    return stretches


def _road_points(index, road, stretch):
    """[(arc, node key)] along a candidate road: its vertices plus the two cut points of its house stretch."""
    arcs, total = [], 0.0
    for k, ((x, z), key) in enumerate(zip(road["pts"], _vertex_keys(road))):
        if k:
            total += ((x - road["pts"][k - 1][0]) ** 2 + (z - road["pts"][k - 1][1]) ** 2) ** 0.5
        arcs.append((total, key))
    for cut in stretch:
        if all(abs(cut - arc) > 1e-6 for arc, _ in arcs):
            arcs.append((cut, ("cut", index, round(cut, 3))))
    arcs.sort(key=lambda a: a[0])
    return arcs


def _graph(roads, stretches):
    """Node ids (deterministic), per-road point lists and the adjacency of candidate road pieces."""
    ids, points, adjacency = {}, {}, []
    for i in sorted(stretches):
        points[i] = [(arc, ids.setdefault(key, len(ids))) for arc, key in _road_points(i, roads[i], stretches[i])]
    adjacency = [[] for _ in ids]
    for i, pts in points.items():
        for (s, u), (t, v) in zip(pts, pts[1:]):
            adjacency[u].append((v, i, s, t))
            adjacency[v].append((u, i, s, t))
    return ids, points, adjacency


def _overlap(intervals, s, t):
    return sum(max(0.0, min(t, b) - max(s, a)) for a, b in intervals)


def _add_interval(intervals, s, t):
    merged = []
    for a, b in sorted(intervals + [(s, t)]):
        if merged and a <= merged[-1][1] + 1e-6:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def _dijkstra(adjacency, sources, kept):
    """Cost = metres not yet kept; returns (dist, pred) over node ids."""
    dist = {n: 0.0 for n in sources}
    pred = {n: None for n in sources}
    heap = [(0.0, n) for n in sorted(sources)]
    heapq.heapify(heap)
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, road, s, t in adjacency[u]:
            cost = (t - s) - _overlap(kept[road], s, t)
            nd = d + (cost if cost > 1e-6 else 0.0)
            if nd < dist.get(v, float("inf")) - 1e-9:
                dist[v] = nd
                pred[v] = (u, road, s, t)
                heapq.heappush(heap, (nd, v))
    return dist, pred


def _best_node(dist, nodes):
    """(cost, node) of the cheapest reachable node in `nodes`, or None."""
    reached = [(dist[n], n) for n in nodes if n in dist]
    return min(reached) if reached else None


def _join_stretches(roads, stretches, network_keys):
    """Kept intervals per candidate road: house stretches plus, nearest first, the shortest route of each to the network."""
    ids, points, adjacency = _graph(roads, stretches)
    sources = {n for key, n in ids.items() if key in network_keys}
    kept = {i: [stretches[i]] for i in stretches}
    stretch_nodes = {i: [n for arc, n in points[i] if stretches[i][0] - 1e-6 <= arc <= stretches[i][1] + 1e-6] for i in stretches}
    unjoined = set(stretches)
    while unjoined:
        dist, pred = _dijkstra(adjacency, sources, kept)
        best = {i: _best_node(dist, stretch_nodes[i]) for i in sorted(unjoined)}
        for i in [i for i, b in best.items() if b is None]:  # no route at all: the whole road stays
            kept[i] = [(0.0, points[i][-1][0])]
            unjoined.discard(i)
        unjoined = {i for i in unjoined if best[i][0] > 1e-6}
        if not unjoined:
            break
        pick = min((best[i][0], i, best[i][1]) for i in unjoined)
        node = pick[2]
        while pred[node] is not None:
            node, road, s, t = pred[node]
            kept[road] = _add_interval(kept[road], s, t)
    return kept


def trim(roads, hidden, buildings, swiss, restored=frozenset()):
    """Road index -> [(a, b), ...] metres along `pts` that a kept residential Swiss street keeps in 1952.

    Candidates keep their house stretch (first old footprint minus TRIM_PAD to the last plus TRIM_PAD); each stretch is
    then joined to the old network (kept roads that are not candidates) by the shortest route through candidate
    roads, nearest stretch first. A stretch with no route keeps its whole road. Whatever is not kept is dropped; a
    road that loses less than MIN_TRIM is not listed.
    """
    stretches = _house_stretches(roads, hidden, restored, buildings, swiss)
    node_sets = _node_sets(roads, hidden)
    network_keys = set().union(*(node_sets[i] for i in range(len(roads)) if i not in hidden and i not in stretches))
    kept = _join_stretches(roads, stretches, network_keys)
    result = {}
    for i, intervals in kept.items():
        length = LineString(roads[i]["pts"]).length
        if length - sum(b - a for a, b in intervals) >= MIN_TRIM:
            result[i] = intervals
    return result


def _to_game(geometry, frame):
    geom = shape(geometry) if isinstance(geometry, dict) else geometry
    ring = [tuple(map(float, frame.to_game(x, y))) for x, y in geom.exterior.coords]
    return Polygon(ring)


def apply(world, outline_lv95, industrial_lonlat):
    """Retrofit `world` in place; returns the counts per reason (after the reconnect) plus `restored` and `trimmed`."""
    frame = Frame(world["origin"]["lat"], world["origin"]["lon"])
    swiss = _outline_to_game(outline_lv95, frame)
    industrial = _to_game(industrial_lonlat, frame)
    roads = world["roads"]
    hidden = classify(roads, world["buildings"], swiss, industrial)
    restored = reconnect(roads, hidden, swiss)
    for i in restored:
        del hidden[i]
    trimmed = trim(roads, hidden, world["buildings"], swiss, restored)
    for i, road in enumerate(roads):
        road.pop("modern", None)
        road.pop("keep1952", None)
        if i in hidden:
            road["modern"] = True
        elif i in trimmed:
            road["keep1952"] = [[round(a, 1), round(b, 1)] for a, b in trimmed[i]]
    counts = {k: sum(1 for v in hidden.values() if v == k) for k in ("motorway", "bridge", "industrial", "empty")}
    counts["restored"] = len(restored)
    counts["trimmed"] = len(trimmed)
    return counts


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    ap.add_argument("--outline", type=Path, default=HERE / "ch_outline.geojson")
    ap.add_argument("--industrial", type=Path, default=HERE / "industrial_sisslerfeld.geojson")
    a = ap.parse_args(argv)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    industrial = json.loads(a.industrial.read_text(encoding="utf-8"))["geometry"]
    counts = apply(world, _load_outline(a.outline), industrial)
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"era_roads: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
