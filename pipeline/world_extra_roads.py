"""Game-only roads from anchors.json (#42): the Südspange ESP Sisslerfeld, assembled from OSM ways the pipeline
otherwise drops (track, construction, proposed) and hand points, plus its grade (cutting, underpass)."""
from __future__ import annotations

import shapely
from shapely.ops import substring

SNAP = 15.0            # m: a from/to/grade point must lie this close to its line
REPLACE_BUF = 1.0      # m: an OSM ribbon this close to a game road is the same road
BAND = 24.0            # m beyond hw: the prototype's grade cut never reaches further (GRADE_BAND in world.js)


def _way_id(ref: str) -> int:
    if not ref.startswith("w"):
        raise ValueError(f"extra roads: only ways can be reused, got {ref}")
    return int(ref[1:])


def _step_coords(step, lines):
    if "game" in step:
        return [tuple(float(v) for v in step["game"])]
    wid = _way_id(step["osm"])
    if wid not in lines:
        raise KeyError(f"extra roads: {step['osm']} is not in the extract")
    line = lines[wid]
    if "from" not in step and "to" not in step:
        return [tuple(p) for p in line.coords]
    for key in ("from", "to"):
        if key in step and line.distance(shapely.Point(step[key])) > SNAP:
            raise ValueError(f"extra roads: {step['osm']} {key} {step[key]} is not on the way")
    a = line.project(shapely.Point(step.get("from", line.coords[0])))
    b = line.project(shapely.Point(step.get("to", line.coords[-1])))
    coords = [tuple(p) for p in substring(line, min(a, b), max(a, b)).coords]
    return coords[::-1] if a > b else coords


def _dist(p, q) -> float:
    return shapely.Point(p).distance(shapely.Point(q))


def assemble(via, lines):
    """One piece's steps -> polyline. A whole way is turned around when its far end is nearer the polyline so far;
    a vertex shared by two steps appears once."""
    out = []
    for step in via:
        seg = _step_coords(step, lines)
        if out and len(seg) > 1 and "from" not in step and _dist(seg[-1], out[-1]) < _dist(seg[0], out[-1]):
            seg = seg[::-1]
        if out and _dist(seg[0], out[-1]) < 0.5:
            seg = seg[1:]
        out.extend(seg)
    return out
