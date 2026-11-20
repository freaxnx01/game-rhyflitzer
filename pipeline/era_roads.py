"""#530: flag the roads that did not exist in 1952 in an existing world file ("Sisseln 1952" layer).

Needs the buildings already flagged by `era_1952.py` (`modern`). A road is hidden ("modern": true) if, on the Swiss
side (midpoint inside the CH outline; the German side stays as today), it is a motorway (`motorway*`), lies at least
INDUSTRIAL_SHARE inside the Sisslerfeld industrial site and is not a main road, or is a residential street
(`residential`, `living_street`, `service`) with no old Swiss building footprint within NEAR_OLD. The Fridolinsbruecke
is hidden on both banks. Precedence: bridge > motorway > industrial > empty.

A kept road that the hiding cuts off from the main kept network gets back the fewest "empty" roads that reconnect it
(shortest chain, BFS over road vertices snapped to ENDPOINT_TOL). A kept bridge also joins every road vertex within
BRIDGE_SNAP of its ends, so the Holzbruecke keeps its Swiss approach.

A kept residential street with old houses nearby is then trimmed to the stretch those houses need (`trim`): from the
first old footprint minus TRIM_PAD to the last plus TRIM_PAD along the street, whole on each side whose end touches the
kept network. Cut-off pieces get their trimmed roads back at full length. Written as `road["keep1952"] = [a, b]`
(metres along `pts`).

Sets `road["modern"] = True` (last key) and removes it from every other road; likewise `keep1952`; idempotent.

    python era_roads.py --world ../data/world_hochrhein.json
"""
from __future__ import annotations

import argparse
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


def _end_keys(road):
    keys = _vertex_keys(road)
    return keys[0], keys[-1]


def _arc_range(line, polygons):
    arcs = [line.project(Point(x, z)) for p in polygons for x, z in p.exterior.coords]
    return min(arcs), max(arcs)


def _wanted_stretch(i, roads, node_sets, others, line, old_polys, old_tree):
    """(a, b) the road needs, or None if it stays whole (no old house, no or both ends on the kept network)."""
    near = old_tree.query(line.buffer(NEAR_OLD), predicate="intersects")
    if not len(near):
        return None
    first, last = _end_keys(roads[i])
    start_joined = any(first in node_sets[j] for j in others if j != i)
    end_joined = any(last in node_sets[j] for j in others if j != i)
    if start_joined == end_joined:
        return None
    lo, hi = _arc_range(line, [old_polys[k] for k in near])
    a, b = (0.0, min(hi + TRIM_PAD, line.length)) if start_joined else (max(lo - TRIM_PAD, 0.0), line.length)
    return (a, b) if a + (line.length - b) >= MIN_TRIM else None


def _stretch_nodes(road, a, b):
    line = LineString(road["pts"])
    return {key for (x, z), key in zip(road["pts"], _vertex_keys(road)) if a - 1e-6 <= line.project(Point(x, z)) <= b + 1e-6}


def _cut_off_trimmed(roads, hidden, node_sets, wanted, swiss, base_main):
    """Trimmed roads to restore: those in or touching a Swiss group the trimming cut off from the main kept component."""
    kept = [i for i in range(len(roads)) if i not in hidden]
    pieces = [(_stretch_nodes(roads[i], *wanted[i]) if i in wanted else node_sets[i]) for i in range(len(roads))]
    comps = [(idx, nodes, _swiss_kept_count(roads, idx, swiss)) for idx, nodes in _components(pieces, kept)]
    comps.sort(key=lambda c: (-c[2], min(c[0])))
    restore = set()
    for idx, nodes, swiss_count in comps[1:]:
        if not swiss_count or not base_main.intersection(idx):
            continue
        neighbours = {i for i in wanted if i not in idx and node_sets[i] & nodes}
        restore.update(neighbours or (i for i in idx if i in wanted))
    return restore


def trim(roads, hidden, buildings, swiss, restored=frozenset()):
    """Road index -> (a, b) metres along `pts` that a kept residential Swiss street keeps in 1952.

    The street keeps the stretch from its first old footprint minus TRIM_PAD to its last plus TRIM_PAD, whole on a side
    whose end vertex touches another kept road. A street with no or both ends on the kept network stays whole. Where the
    trimming cuts a Swiss group off the main kept component, the trimmed roads that join it (else its own) come back whole (repeated
    until stable; the set only shrinks). Restored roads, bridges, main roads and the German side are never trimmed.
    """
    node_sets = _node_sets(roads, hidden)
    kept = [i for i in range(len(roads)) if i not in hidden]
    old_polys = _old_swiss_footprints(buildings, swiss)
    old_tree = STRtree(old_polys)
    wanted = {}
    for i in kept:
        road = roads[i]
        if road["cls"] not in RESIDENTIAL or road.get("bridge") or i in restored:
            continue
        line = LineString(road["pts"])
        if not swiss.contains(line.interpolate(0.5, normalized=True)):
            continue
        stretch = _wanted_stretch(i, roads, node_sets, kept, line, old_polys, old_tree)
        if stretch:
            wanted[i] = stretch
    base_comps = sorted(((idx, _swiss_kept_count(roads, idx, swiss)) for idx, _ in _components(node_sets, kept)),
                        key=lambda c: (-c[1], min(c[0])))
    base_main = set(base_comps[0][0]) if base_comps else set()
    while True:
        back = _cut_off_trimmed(roads, hidden, node_sets, wanted, swiss, base_main)
        if not back:
            return wanted
        for i in back:
            del wanted[i]


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
            road["keep1952"] = [round(v, 1) for v in trimmed[i]]
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
