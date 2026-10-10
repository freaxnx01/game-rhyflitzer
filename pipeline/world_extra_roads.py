"""Game-only roads from anchors.json (#42): the Südspange ESP Sisslerfeld, assembled from OSM ways the pipeline
otherwise drops (track, construction, proposed) and hand points, plus its grade (cutting, underpass)."""
from __future__ import annotations

import shapely
from shapely.ops import substring

import world_roads
from osm_read import Way

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


def _piece_roads(piece, coords, clip):
    tags = {**piece["tags"], "name": piece.get("n", ""), "width": str(piece["w"])}
    roads, _ = world_roads.build([Way(piece["id"], tags, shapely.LineString(coords))], {}, {}, clip)
    if "path" in piece:
        p = piece["path"]
        off = shapely.LineString(coords).offset_curve(p["off"]).simplify(0.5, preserve_topology=False).intersection(clip)
        for part in getattr(off, "geoms", [off]):
            if not part.is_empty and part.length >= 1.0:
                roads.append({"id": p["id"], "n": "", "cls": "cycleway", "w": float(p["w"]), "mark": "none",
                              "bridge": False, "layer": 0, "pts": [world_roads._r(q) for q in part.coords]})
    return roads


def _carve(roads, ids, zone):
    out = []
    for r in roads:
        if r.get("id") not in ids:
            out.append(r)
            continue
        rest = shapely.LineString(r["pts"]).difference(zone)
        for part in getattr(rest, "geoms", [rest]):
            if not part.is_empty and part.length >= 1.0:
                out.append({**r, "pts": [world_roads._r(q) for q in part.coords]})
    return out


def _grade(g, coords):
    line = shapely.LineString(coords)
    ctl = []
    for c in g["ctl"]:
        p = shapely.Point(c["at"])
        if line.distance(p) > SNAP:
            raise ValueError(f"grade: {c['at']} is not on the piece")
        ctl.append((line.project(p), float(c["cut"])))
    ts = [t for t, _ in ctl]
    if len(ctl) < 2 or ts != sorted(ts) or len(set(ts)) != len(ts):
        raise ValueError("grade: controls must run along the piece")
    if ctl[0][1] != 0 or ctl[-1][1] != 0:
        raise ValueError("grade: the first and last cut must be 0")
    span = substring(line, ts[0], ts[-1])
    return {"pts": [world_roads._r(p) for p in span.coords], "hw": float(g["hw"]),
            "ctl": [[round(t - ts[0], 1), cut] for t, cut in ctl]}


def _widen(junctions, new):
    lines = [(shapely.LineString(r["pts"]), r["w"] / 2 + 0.3) for r in new if r["cls"] != "cycleway"]
    out = []
    for x, z, r in junctions:
        p = shapely.Point(x, z)
        out.append([x, z, max([r] + [rad for g, rad in lines if g.distance(p) <= REPLACE_BUF])])
    return out


def apply(spec, ways, roads, junctions, clip):
    """Append the game-only roads of anchors.json `roads` to the OSM roads; returns (roads, junctions, grades)."""
    if not spec:
        return roads, junctions, []
    lines = {w.id: w.line for w in ways if "highway" in w.tags}
    new, grades, ends = [], [], []
    for road in spec.values():
        built = [(p, assemble(p["via"], lines)) for p in road["pieces"]]
        game = shapely.MultiLineString([c for _, c in built])
        roads = _carve(roads, {_way_id(s) for s in road.get("replace", [])}, game.buffer(REPLACE_BUF))
        for piece, coords in built:
            new += _piece_roads(piece, coords, clip)
            ends += [[*world_roads._r(p), round(piece["w"] / 2 + 0.3, 2)] for p in (coords[0], coords[-1])]
        if "grade" in road:
            g = road["grade"]
            grades.append(_grade(g, next(c for p, c in built if p["id"] == g["piece"])))
            band = shapely.LineString(grades[-1]["pts"]).buffer(grades[-1]["hw"] + BAND)
            roads = _carve(roads, {_way_id(s) for s in road.get("trim", [])}, band)
    return roads + new, _widen(junctions, new) + ends, grades


def _parts(geom):
    return [[world_roads._r(q) for q in g.coords] for g in getattr(geom, "geoms", [geom]) if not g.is_empty and g.length >= 1.0]


def deck_rail(grades, rail, rail_bridges):
    """#42: rail inside a grade's band goes on a deck (railBridges, layer 1), so #76 keeps it at the uncut height
    over the cutting. OSM has no bridge there yet: the underpass is under construction."""
    if not grades:
        return rail, rail_bridges
    band = shapely.union_all([shapely.LineString(g["pts"]).buffer(g["hw"] + BAND) for g in grades])
    kept, decks = [], list(rail_bridges)
    for pts in rail:
        line = shapely.LineString(pts)
        if not line.intersects(band):
            kept.append(pts)
            continue
        kept += _parts(line.difference(band))
        decks += [{"pts": p, "layer": 1} for p in _parts(line.intersection(band))]
    return kept, decks
