"""#530: flag the roads that did not exist in 1952 in an existing world file ("Sisseln 1952" layer).

Needs the buildings already flagged by `era_1952.py` (`modern`); the traced houses in `era.houses` (`era_traced.py`) count as old footprints. A road is hidden ("modern": true) if, on the Swiss
side (midpoint inside the CH outline; the German side stays as today), it is a motorway (`motorway*`), lies at least
INDUSTRIAL_SHARE inside the Sisslerfeld industrial site and is not a main road, or is a residential street
(`residential`, `living_street`, `service`) with no old Swiss building footprint within NEAR_OLD. The Fridolinsbruecke
is hidden on both banks. The Südspange (`-42001`, `-42003`) and its cycle path (`-42002`) are hidden by id as "late"
on either bank (#1150); the four building-site signs of its construction site get `modern` with them. Precedence:
bridge > late > motorway > industrial > empty.

A kept bridge also joins every road vertex within BRIDGE_SNAP of its ends, so the Holzbruecke keeps its Swiss approach.

Kept residential streets are then trimmed (`trim`). The old network is the largest Swiss connected component of the
kept roads that are neither candidates nor routable (built without any residential street); every other Swiss
component of those roads is an island that must be joined too. A kept interval that ends within BRIDGE_SNAP of a
kept bridge end is extended to the road point nearest that end, so the asphalt reaches the deck. A road end within
ENDPOINT_TOL of another road's segment without a shared vertex (a T-junction) is a junction too: the segment gets a node
at the projected point. An old footprint counts only for its nearest road (plus any road
within 1 m of that distance, within NEAR_OLD); a road with such footprints keeps the stretch from the first minus
TRIM_PAD to the last plus TRIM_PAD (a trim candidate). Each stretch, and every kept Swiss island the hiding cut off
from the main network, is joined to the old network by the cheapest route
(Dijkstra over road vertices and the cut points, cost = metres not yet kept), nearest first, through candidate,
residential and "empty" roads. An "empty" road keeps only the metres a route uses (the others stay hidden), an unused
one stays `modern`. A stretch with no route keeps its whole road. Written as `road["keep1952"] = [[a, b], ...]`
(metres along `pts`, only if at least MIN_TRIM is dropped). A kept residential street without a footprint of its own
(every footprint near it is nearer to another street) counts as an "empty" one: hidden unless a route uses it.

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
MIN_TRIM = 0.5  # m, a street that loses less than this in total is not written
RESIDENTIAL = ("residential", "living_street", "service")
MAIN_PREFIXES = ("motorway", "trunk", "primary", "secondary", "tertiary")
BRIDGE_NAME = "Fridolinsbrücke"
LATE_IDS = (-42001, -42002, -42003)  # #1150: the Südspange, built in the 2020s, and its cycle path
SUEDSPANGE_SIGNS = ("suedspangeBaustelleOst", "suedspangeBaustelleWest", "suedspangeFahrverbotOst", "suedspangeFahrverbotWest")  # #1150: the signs of its building site
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
    """Map road index -> "bridge" | "late" | "motorway" | "industrial" | "empty"; only hidden roads. Game frame."""
    old_tree = STRtree(_old_swiss_footprints(buildings, swiss))
    hidden = {}
    for i, road in enumerate(roads):
        line = LineString(road["pts"])
        if road.get("n") == BRIDGE_NAME:
            hidden[i] = "bridge"
        elif road.get("id") in LATE_IDS:
            hidden[i] = "late"
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


def _reconnect_plan(roads, hidden, swiss=None):
    """(restored road indices, islands): the "empty" roads that join every reachable cut-off kept component to the
    main one, and the kept road indices of each such component.

    With `swiss`, only the Swiss kept roads count: the main component is the one with the most of them and
    components without any are left alone (the German network is cut off at the hidden bridge, not by us).
    """
    kept = [i for i in range(len(roads)) if i not in hidden]
    node_sets = _node_sets(roads, hidden)
    comps = [(idx, nodes, _swiss_kept_count(roads, idx, swiss)) for idx, nodes in _components(node_sets, kept)]
    comps.sort(key=lambda c: (-c[2], min(c[0])))
    main_nodes = set(comps[0][1])
    index = _empty_index(node_sets, hidden)
    restored, islands = set(), []
    for idx, nodes, swiss_count in comps[1:]:
        if not swiss_count or nodes & main_nodes:
            continue
        chain = _shortest_chain(node_sets, index, nodes, main_nodes)
        if chain is None:
            continue
        restored.update(chain)
        islands.append(sorted(idx))
        main_nodes |= nodes.union(*(node_sets[i] for i in chain))
    return restored, islands


def reconnect(roads, hidden, swiss=None):
    """Indices of "empty" roads that would reconnect every reachable cut-off kept component (whole-road form)."""
    return _reconnect_plan(roads, hidden, swiss)[0]


def _arc_range(line, polygons):
    arcs = [line.project(Point(x, z)) for p in polygons for x, z in p.exterior.coords]
    return min(arcs), max(arcs)


def _assigned_footprints(roads, hidden, buildings, swiss):
    """Road index -> old footprints that count for it: each footprint serves its nearest kept road (and any road within
    1 m of that distance), within NEAR_OLD. Only Swiss residential, non-bridge roads are returned."""
    kept = [i for i in range(len(roads)) if i not in hidden]
    lines = [LineString(roads[i]["pts"]) for i in kept]
    tree = STRtree(lines)
    assigned = {}
    for poly in _old_swiss_footprints(buildings, swiss):
        near = tree.query(poly.buffer(NEAR_OLD), predicate="intersects")
        if not len(near):
            continue
        dists = {int(k): poly.distance(lines[k]) for k in near}
        nearest = min(dists.values())
        for k, d in sorted(dists.items()):
            road = roads[kept[k]]
            if d <= nearest + 1.0 and road["cls"] in RESIDENTIAL and not road.get("bridge") \
                    and swiss.contains(lines[k].interpolate(0.5, normalized=True)):
                assigned.setdefault(kept[k], []).append(poly)
    return assigned


def _house_stretches(roads, assigned):
    """Road index -> (a, b): the stretch of each trim candidate that its old footprints need (pad included)."""
    stretches = {}
    for i, polys in assigned.items():
        line = LineString(roads[i]["pts"])
        lo, hi = _arc_range(line, polys)
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


def _t_junctions(roads, active):
    """Road ends that lie within ENDPOINT_TOL of another active road's segment without sharing a vertex key there.

    Returns (inserts, aliases): `inserts[j]` = [(arc along j, end key)], the junction node a road in the graph gets at
    the projected point; `aliases[j]` = the same end keys, which join road j when it is outside the graph.
    """
    active = sorted(active)
    lines = [LineString(roads[i]["pts"]) for i in active]
    tree = STRtree(lines)
    inserts, aliases = {}, {}
    for i in active:
        for point, key in ((roads[i]["pts"][0], _vertex_keys(roads[i])[0]), (roads[i]["pts"][-1], _vertex_keys(roads[i])[-1])):
            end = Point(point)
            for k in sorted(int(n) for n in tree.query(end.buffer(ENDPOINT_TOL), predicate="intersects")):
                j = active[k]
                if j == i or key in _nodes(roads[j]) or lines[k].distance(end) > ENDPOINT_TOL:
                    continue
                inserts.setdefault(j, []).append((lines[k].project(end), key))
                aliases.setdefault(j, set()).add(key)
    return inserts, aliases


def _graph(roads, stretches, routable, inserts=None):
    """Node ids (deterministic), per-road point lists and the adjacency of the pieces of candidate/routable roads.

    `inserts` (from `_t_junctions`) adds junction nodes on a road's segments, splitting the edge there."""
    ids, points = {}, {}
    for i in sorted(set(stretches) | set(routable)):
        cuts = stretches.get(i, ())
        points[i] = [(arc, ids.setdefault(key, len(ids))) for arc, key in _road_points(i, roads[i], cuts)]
    for j in sorted(j for j in (inserts or ()) if j in points):
        for arc, key in inserts[j]:
            node = ids.setdefault(key, len(ids))
            if all(node != n for _, n in points[j]):
                points[j].append((arc, node))
        points[j].sort(key=lambda a: a[0])
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


def _join_targets(roads, stretches, routable, solid, island_keys, network_keys, inserts=None):
    """Kept intervals per candidate/routable/island road: house stretches plus, nearest first, the cheapest route of each
    target (house stretch or cut-off island) to the old network; routable roads start with nothing kept and the roads
    of an island (`solid`) are fully kept, so a joined island carries later routes at no cost."""
    ids, points, adjacency = _graph(roads, stretches, routable | solid, inserts)
    sources = {n for key, n in ids.items() if key in network_keys}
    kept = {i: [stretches[i]] if i in stretches else [(0.0, points[i][-1][0])] if i in solid else [] for i in points}
    targets = [("road", i, [n for arc, n in points[i] if stretches[i][0] - 1e-6 <= arc <= stretches[i][1] + 1e-6])
               for i in sorted(stretches)]
    targets += [("island", None, [ids[k] for k in sorted(keys) if k in ids]) for keys in island_keys]
    open_targets = set(range(len(targets)))
    while open_targets:
        dist, pred = _dijkstra(adjacency, sources, kept)
        best = {t: _best_node(dist, targets[t][2]) for t in sorted(open_targets)}
        for t in [t for t, b in best.items() if b is None]:  # no route at all: a house street stays whole
            if targets[t][0] == "road":
                i = targets[t][1]
                kept[i] = [(0.0, points[i][-1][0])]
            open_targets.discard(t)
        open_targets = {t for t in open_targets if best[t][0] > 1e-6}
        if not open_targets:
            break
        _, _, node = min((best[t][0], t, best[t][1]) for t in open_targets)
        while pred[node] is not None:
            node, road, s, t = pred[node]
            kept[road] = _add_interval(kept[road], s, t)
    return kept


def _plan(roads, hidden, buildings, swiss):
    """(kept intervals per candidate or routable road, routable road indices).

    Candidates are kept Swiss residential roads with an old footprint for which they are the nearest road; kept
    residential roads without one are routable like the "empty" ones. Kept intervals are in metres along `pts`.
    """
    assigned = _assigned_footprints(roads, hidden, buildings, swiss)
    stretches = _house_stretches(roads, assigned)
    routable = {i for i, reason in hidden.items() if reason == "empty"}
    routable |= {i for i, r in enumerate(roads) if i not in hidden and i not in stretches and _is_residential(r, swiss)}
    node_sets = _node_sets(roads, hidden)
    active = [i for i in range(len(roads)) if i not in hidden or i in routable]
    inserts, aliases = _t_junctions(roads, active)
    for j, keys in aliases.items():
        node_sets[j] |= keys
    fixed = [i for i in range(len(roads)) if i not in hidden and i not in stretches and i not in routable]
    comps = [(idx, nodes, _swiss_kept_count(roads, idx, swiss)) for idx, nodes in _components(node_sets, fixed)]
    comps.sort(key=lambda c: (-c[2], min(c[0])))
    network_keys = set(comps[0][1]) if comps and comps[0][2] else set()
    islands = [c for c in comps[1:] if c[2]] if network_keys else []  # German pieces are left alone
    solid = {i for idx, _, _ in islands for i in idx}
    kept = _join_targets(roads, stretches, routable, solid, [nodes for _, nodes, _ in islands], network_keys, inserts)
    kept = {i: iv for i, iv in kept.items() if i not in solid}
    _reach_bridges(roads, hidden, kept)
    return kept, routable


def _reach_bridges(roads, hidden, kept):
    """Extend a kept interval that ends within BRIDGE_SNAP of a kept bridge end to the road point nearest that end:
    the route counted the bridge as joined at the snapped vertex, but the asphalt has to reach the deck."""
    ends = [Point(*p) for i, r in enumerate(roads) if r.get("bridge") and i not in hidden for p in (r["pts"][0], r["pts"][-1])]
    for i, intervals in kept.items():
        line = LineString(roads[i]["pts"])
        for end in ends:
            if line.distance(end) > BRIDGE_SNAP:
                continue
            reach = line.project(end)
            for k, (a, b) in enumerate(intervals):
                if b < reach and line.interpolate(b).distance(end) <= BRIDGE_SNAP:
                    intervals[k] = (a, reach)
                elif a > reach and line.interpolate(a).distance(end) <= BRIDGE_SNAP:
                    intervals[k] = (reach, b)
            kept[i] = _merge(intervals)


def _merge(intervals):
    merged = []
    for a, b in sorted(intervals):
        if merged and a <= merged[-1][1] + 1e-6:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def _is_residential(road, swiss):
    if road["cls"] not in RESIDENTIAL or road.get("bridge"):
        return False
    return swiss.contains(LineString(road["pts"]).interpolate(0.5, normalized=True))


def _kept_length(intervals):
    return sum(b - a for a, b in intervals)


def trim(roads, hidden, buildings, swiss):
    """Road index -> [(a, b), ...] metres along `pts` that a candidate or routed "empty" road keeps in 1952.

    Candidates keep their house stretch (first old footprint minus TRIM_PAD to the last plus TRIM_PAD; a footprint
    counts for its nearest road only); each stretch, and every kept island that `reconnect` would have joined, is
    joined to the old network by the cheapest route (cost = metres not yet kept) through candidate, residential
    and "empty" roads, nearest first. An "empty" road keeps only the metres a route uses. A stretch with no route keeps
    its whole road. Roads that lose less than MIN_TRIM, and roads with nothing kept, are not listed.
    """
    return _listed(roads, _plan(roads, hidden, buildings, swiss)[0])


def _listed(roads, kept):
    """The kept intervals that `trim` reports: roads that keep something and lose at least MIN_TRIM."""
    result = {}
    for i, intervals in kept.items():
        length = LineString(roads[i]["pts"]).length
        if _kept_length(intervals) > 1e-3 and length - _kept_length(intervals) >= MIN_TRIM:
            result[i] = intervals
    return result


def _rounded(intervals):
    """Intervals at 0.1 m; ones that touch after rounding are merged so they stay disjoint."""
    merged = []
    for a, b in intervals:
        a, b = round(a, 1), round(b, 1)
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return merged


def _to_game(geometry, frame):
    geom = shape(geometry) if isinstance(geometry, dict) else geometry
    ring = [tuple(map(float, frame.to_game(x, y))) for x, y in geom.exterior.coords]
    return Polygon(ring)


def apply(world, outline_lv95, industrial_lonlat):
    """Retrofit `world` in place; returns the counts per reason plus `restored` (empty roads kept for a route) and `trimmed`."""
    frame = Frame(world["origin"]["lat"], world["origin"]["lon"])
    swiss = _outline_to_game(outline_lv95, frame)
    industrial = _to_game(industrial_lonlat, frame)
    roads = world["roads"]
    footprints = world["buildings"] + world.get("era", {}).get("houses", [])  # traced houses of 1952 count as old
    hidden = classify(roads, footprints, swiss, industrial)
    kept, routable = _plan(roads, hidden, footprints, swiss)
    restored = 0
    for i in sorted(routable):
        if _kept_length(kept[i]) > 1e-3:
            restored += hidden.pop(i, None) == "empty"
        else:
            hidden[i] = "empty"
    trimmed = _listed(roads, kept)  # the same filter `trim` applies, on the plan computed once above
    for i, road in enumerate(roads):
        road.pop("modern", None)
        road.pop("keep1952", None)
        if i in hidden:
            road["modern"] = True
        elif i in trimmed:
            road["keep1952"] = _rounded(trimmed[i])
    bridge = world.get("anchors", {}).get("landmarks", {}).get("fridolinsbruecke")
    if bridge is not None:
        bridge.pop("modern", None)
        if any(roads[i].get("n") == BRIDGE_NAME for i in hidden):
            bridge["modern"] = True  # the landmark goes with its road: its viewpoints are not offered in 1952
    late = any(reason == "late" for reason in hidden.values())
    for name in SUEDSPANGE_SIGNS:
        sign = world.get("anchors", {}).get("landmarks", {}).get(name)
        if sign is None:
            continue
        sign.pop("modern", None)
        if late:
            sign["modern"] = True  # #1150: the building-site signs go with their road
    counts = {k: sum(1 for v in hidden.values() if v == k) for k in ("motorway", "bridge", "late", "industrial", "empty")}
    counts["restored"] = restored
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
