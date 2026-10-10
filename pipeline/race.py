"""#179: automatic race of a generated world -- the start, five checkpoints and a finish on the road graph, with a par
time. Every leg is measured with the game's own A* (prototype/route.js, through route_matrix.mjs and Node), so a race
the pipeline accepts is drivable on the graph the game builds from the same roads."""
from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import shapely

import places

SAMPLED = places.MAJOR | {"unclassified", "residential"}
N_CPS = 5
LEG_MIN, LEG_MAX = 500.0, 1200.0   # m along the route
EDGE = 150.0           # m: race points keep this far from the frame edge
SAMPLE = 400.0         # m between candidate points along a road
MIN_GAP = 300.0        # m straight-line between any two race points
MAX_CANDIDATES = 60
MAX_EXPANSIONS = 20_000
PAR_KMH = 45.0         # open point in the spec: tune on two or three test worlds
MAX_SNAP = 60.0        # m: a candidate farther from the main road network is dropped
CP_KINDS = {"station", "place_of_worship", "school", "square"}
CP_RADIUS, STREET_RADIUS = 150.0, 30.0
BRIDGE = Path(__file__).with_name("route_matrix.mjs")


def inner_frame(clip):
    """The frame shrunk by EDGE: every race point but the start lies inside it, before and after snapping."""
    return clip.buffer(-EDGE, join_style="mitre")


def candidates(roads, named, clip) -> list[dict]:
    """Race points inside the inner frame: named places first, then every SAMPLE m along major, then minor roads;
    nearest the centre first within each group; at most MAX_CANDIDATES. -> [{x, z, name, major}]"""
    inner, c = inner_frame(clip), clip.centroid
    out = sorted(({"x": x, "z": z, "name": n, "major": False} for x, z, n in named if inner.covers(shapely.Point(x, z))),
                 key=lambda p: (math.hypot(p["x"] - c.x, p["z"] - c.y), p["name"]))
    sampled = []
    for r in roads:
        if r["cls"] in SAMPLED and len(r["pts"]) > 1:
            line, s = shapely.LineString(r["pts"]), SAMPLE / 2
            while s < line.length:
                p = line.interpolate(s)
                if inner.covers(p):
                    sampled.append({"x": round(p.x, 1), "z": round(p.y, 1), "name": None, "major": r["cls"] in places.MAJOR})
                s += SAMPLE
    sampled.sort(key=lambda p: (not p["major"], math.hypot(p["x"] - c.x, p["z"] - c.y), p["x"], p["z"]))
    return (out + sampled)[:MAX_CANDIDATES]


def route_lengths(roads, points, pairs, max_snap: float = MAX_SNAP):
    """Snap points to the game's main road network and measure each pair's A* route.
    -> (snaps: [{x, z, d} | None], lens: {(i, j): metres}); pairs without a route are left out."""
    node = shutil.which("node")
    if not node:
        raise RuntimeError("the race needs Node 22+ on PATH: it measures legs with the game's A* (prototype/route.js)")
    req = json.dumps({"roads": roads, "points": [list(p) for p in points], "pairs": [list(p) for p in pairs],
                      "maxSnap": max_snap})
    res = subprocess.run([node, str(BRIDGE)], input=req, capture_output=True, text=True, timeout=600)
    if res.returncode != 0:
        raise RuntimeError(f"route_matrix.mjs failed: {res.stderr.strip()[:500]}")
    out = json.loads(res.stdout)
    return out["snap"], {tuple(p): v for p, v in zip(pairs, out["len"]) if v is not None}


def on_course(snaps, inner) -> list[int]:
    """Indices of the points that reached the main network and -- the start aside -- stayed inside the inner frame:
    snapping moves a candidate by up to MAX_SNAP, which can carry it back over the margin."""
    return [i for i, s in enumerate(snaps)
            if s is not None and (i == 0 or inner.covers(shapely.Point(s["x"], s["z"])))]


def leg(lens, i, j):
    return lens.get((i, j), lens.get((j, i)))


def chain(lens, scores, pos, legs: int = N_CPS + 1):
    """Depth-first search for a path 0 -> ... of `legs` legs, every leg's route within LEG_MIN..LEG_MAX, no point within
    MIN_GAP (straight) of an earlier one; higher scores first, then lower index. -> indices or None."""
    n = len(pos)
    nbrs = {i: sorted((j for j in range(n) if j != i and (v := leg(lens, i, j)) is not None and LEG_MIN <= v <= LEG_MAX),
                      key=lambda j: (-scores[j], j)) for i in range(n)}
    path, budget = [0], [MAX_EXPANSIONS]

    def dfs() -> bool:
        if len(path) == legs + 1:
            return True
        for j in nbrs[path[-1]]:
            budget[0] -= 1
            if budget[0] < 0:
                return False
            if j in path or any(math.dist(pos[j], pos[k]) < MIN_GAP for k in path):
                continue
            path.append(j)
            if dfs():
                return True
            path.pop()
        return False

    return list(path) if dfs() else None


def par_seconds(length_m: float, kmh: float = PAR_KMH) -> int:
    return math.ceil(length_m / (kmh / 3.6))


def checkpoint_name(x, z, named_nodes, areas, roads, clip) -> str | None:
    """The nearest station, church, school or square within CP_RADIUS, else the nearest named street within
    STREET_RADIUS, else None."""
    near = [(math.hypot(px - x, pz - z), name) for _, name, px, pz in places.named_places(named_nodes, areas, clip, CP_KINDS)]
    near = [h for h in near if h[0] <= CP_RADIUS]
    if not near:
        p = shapely.Point(x, z)
        near = [(shapely.LineString(r["pts"]).distance(p), r["n"]) for r in roads if r.get("n") and len(r["pts"]) > 1]
        near = [h for h in near if h[0] <= STREET_RADIUS]
    return min(near)[1] if near else None


def names(path, picked, pos, named_nodes, areas, roads, clip) -> list[str]:
    """A candidate's own name, else checkpoint_name, else "Checkpoint k"; never the same name twice."""
    out = []
    for k, (idx, c) in enumerate(zip(path[1:], picked), start=1):
        n = c["name"] or checkpoint_name(*pos[idx], named_nodes, areas, roads, clip)
        out.append(n if n and n not in out else f"Checkpoint {k}")
    return out


def facing(th, start, first) -> float:
    """The road heading at the start, turned round when it points away from the first checkpoint."""
    if math.cos(th) * (first[0] - start[0]) + math.sin(th) * (first[1] - start[1]) < 0:
        return math.atan2(-math.sin(th), -math.cos(th))
    return th


def build(roads, named_nodes, areas, clip, jl):
    """The race, or None (no start, no fitting chain: the world stays free driving).
    -> {start: [x, z, th], cps: [{n, x, z}] * 5, finish: {n, x, z}, par: s, len: m}"""
    st = places.start_point(roads, clip)
    if st is None:
        return None
    cands = candidates(roads, [(e["x"], e["z"], e["n"]) for e in jl if e["kind"] != "village"], clip)
    points = [(st[0], st[1])] + [(p["x"], p["z"]) for p in cands]
    pairs = [(i, j) for i in range(len(points)) for j in range(i + 1, len(points))
             if MIN_GAP <= math.dist(points[i], points[j]) <= LEG_MAX]
    snaps, lens = route_lengths(roads, points, pairs)
    ok = on_course(snaps, inner_frame(clip))
    if not ok or ok[0] != 0:
        return None
    remap = {old: new for new, old in enumerate(ok)}
    pos = [(snaps[i]["x"], snaps[i]["z"]) for i in ok]
    scores = [0] + [2 * bool(cands[i - 1]["name"]) + cands[i - 1]["major"] for i in ok[1:]]
    sub = {(remap[i], remap[j]): v for (i, j), v in lens.items() if i in remap and j in remap}
    path = chain(sub, scores, pos)
    if path is None:
        return None
    total = sum(leg(sub, a, b) for a, b in zip(path, path[1:]))
    nm = names(path, [cands[ok[i] - 1] for i in path[1:]], pos, named_nodes, areas, roads, clip)
    pts = [{"n": nm[k], "x": pos[i][0], "z": pos[i][1]} for k, i in enumerate(path[1:])]
    return {"start": [pos[0][0], pos[0][1], round(facing(st[2], pos[0], pos[path[1]]), 5)], "cps": pts[:N_CPS],
            "finish": pts[N_CPS], "par": par_seconds(total), "len": round(total, 1)}
