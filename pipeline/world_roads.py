"""Roads: which OSM ways become drivable ribbons, how wide, which Swiss markings."""
from __future__ import annotations

import math
import re

import shapely

MAIN = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
        "secondary", "secondary_link", "tertiary", "tertiary_link"}
DRIVE = MAIN | {"unclassified", "residential", "living_street", "pedestrian", "service"}
FOOT = {"footway", "path", "cycleway", "steps"}
NO_SERVICE = {"driveway", "parking_aisle", "drive-through"}
WIDTH = {"motorway": 14, "motorway_link": 7, "trunk": 9, "trunk_link": 7, "primary": 9, "primary_link": 7,
         "secondary": 8, "secondary_link": 6, "tertiary": 7, "tertiary_link": 6, "unclassified": 5.5,
         "residential": 5.5, "living_street": 5, "pedestrian": 5, "service": 4}
SPLIT_MIN = 20.0          # m: shorter solid/broken pieces are merged into their neighbour


def _bridge(tags) -> bool:
    return tags.get("bridge", "no") != "no"


def keep(tags) -> bool:
    hw = tags.get("highway")
    if tags.get("tunnel", "no") != "no":
        return False
    if hw in FOOT:
        return _bridge(tags)
    if hw == "service" and tags.get("service") in NO_SERVICE:
        return False
    return hw in DRIVE


def width(tags) -> float:
    m = re.match(r"\s*([0-9]+(?:[.,][0-9]+)?)", tags.get("width", ""))
    if m:
        return float(m.group(1).replace(",", "."))
    hw = tags.get("highway")
    if hw in FOOT:
        return 3.0
    return float(WIDTH.get(hw, 5.5))


def _lane(tags, side) -> bool:
    return tags.get(f"cycleway:{side}") == "lane"


def marking(tags) -> str:
    hw = tags.get("highway")
    if hw in ("motorway", "motorway_link", "trunk"):
        return "motorway"
    both = tags.get("cycleway") == "lane" or tags.get("cycleway:both") == "lane" or (_lane(tags, "left") and _lane(tags, "right"))
    if both and tags.get("lane_markings") == "no":
        return "cycle"
    if _lane(tags, "left") and not both:
        return "cycle-left"
    if _lane(tags, "right") and not both:
        return "cycle-right"
    if both:
        return "cycle"
    lanes = tags.get("lanes")
    main = hw in MAIN
    if tags.get("lane_markings") == "no" or not (main or (lanes and lanes.isdigit() and int(lanes) >= 2)):
        return "none"
    return "centre-solid" if tags.get("overtaking") == "no" else "centre"


def _radius(a, b, c) -> float:
    ab = math.dist(a, b); bc = math.dist(b, c); ca = math.dist(c, a)
    cross = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    return math.inf if cross < 1e-9 else ab * bc * ca / (2 * cross)


def solid_mask(coords, radius: float = 150.0) -> list[bool]:
    n = len(coords)
    m = [False] * n
    for i in range(1, n - 1):
        m[i] = _radius(coords[i - 1], coords[i], coords[i + 1]) < radius
    if n > 2:
        m[0], m[-1] = m[1], m[-2]
    return m


def _pieces(coords, mask):
    """Split a polyline where the mask changes; pieces shorter than SPLIT_MIN join the previous one."""
    out = [[coords[0]]]; flags = [mask[0]]
    for i in range(1, len(coords)):
        out[-1].append(coords[i])
        if i < len(coords) - 1 and mask[i] != flags[-1]:
            out.append([coords[i]]); flags.append(mask[i])
    merged = [(out[0], flags[0])]
    for pts, f in zip(out[1:], flags[1:]):
        if shapely.LineString(pts).length < SPLIT_MIN or f == merged[-1][1]:
            merged[-1] = (merged[-1][0] + pts[1:], merged[-1][1])
        else:
            merged.append((pts, f))
    return merged


def _r(p):
    return [round(float(p[0]), 1), round(float(p[1]), 1)]


def build(ways, nodes, way_nodes, clip):
    roads, widest = [], {}
    for w in ways:
        t = w.tags
        if "highway" not in t or not keep(t):
            continue
        wd = width(t)
        for nid in way_nodes.get(w.id, []):
            if nid in nodes:
                widest[nid] = max(widest.get(nid, 0.0), wd)
        line = w.line.simplify(0.5, preserve_topology=False).intersection(clip)
        parts = [line] if line.geom_type == "LineString" else list(getattr(line, "geoms", []))
        base = marking(t)
        for part in parts:
            if part.is_empty or part.length < 1.0:
                continue
            coords = list(part.coords)
            pieces = [(coords, False)]
            if base == "centre":
                pieces = _pieces(coords, solid_mask(coords))
            for pts, solid in pieces:
                roads.append({"id": w.id, "n": t.get("name", ""), "cls": t["highway"], "w": wd,
                              "mark": "centre-solid" if solid else base,
                              "bridge": t.get("bridge", "no") != "no",
                              "layer": int(t.get("layer", "0")) if t.get("layer", "0").lstrip("-").isdigit() else 0,
                              "pts": [_r(p) for p in pts]})
    cx0, cz0, cx1, cz1 = clip.bounds
    junctions = [[round(float(x), 1), round(float(z), 1), round(widest[n] / 2 + 0.3, 2)]
                 for n, (x, z) in sorted(nodes.items()) if n in widest and cx0 <= x <= cx1 and cz0 <= z <= cz1]
    return roads, junctions
