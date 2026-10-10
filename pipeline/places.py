"""#166: generated places of a world from OSM -- start point, village names, the J list, the world's name."""
from __future__ import annotations

import math
from collections import Counter

import shapely

MAJOR = {"primary", "secondary", "tertiary"}
PLACE_R = {"city": 700, "town": 550, "village": 450, "hamlet": 300}   # village-sign radius (prototype VILLAGES r)
CENTRES = ("city", "town", "village")                                   # J list: every village or town centre
J_KINDS = ("station", "townhall", "place_of_worship", "school", "attraction", "viewpoint", "stadium", "square")
J_MAX = 15
SAME_PLACE = 150.0     # m: the same name this close is one place (a church node and its building)
RAYS, RAY_LEN = 8, 20_000.0
SECOND_NAME_MIN = 3    # of 9 samples: a second Gemeinde this present makes the name "A · B"


def kind_of(tags) -> str | None:
    if tags.get("railway") == "station":
        return "station"
    if tags.get("amenity") in ("townhall", "place_of_worship", "school"):
        return tags["amenity"]
    if tags.get("tourism") in ("attraction", "viewpoint"):
        return tags["tourism"]
    if tags.get("leisure") == "stadium":
        return "stadium"
    return "square" if tags.get("place") == "square" else None


def _inside(clip, x, z) -> bool:
    return bool(clip.covers(shapely.Point(x, z)))


def start_point(roads, clip):
    """(x, z, th) on the primary/secondary/tertiary road nearest the frame centre, th along the road; None without."""
    c, best = clip.centroid, None
    for r in roads:
        if r["cls"] in MAJOR and len(r["pts"]) > 1:
            line = shapely.LineString(r["pts"])
            s = line.project(c)
            d = line.interpolate(s).distance(c)
            if best is None or d < best[0]:
                best = (d, line, s)
    if best is None:
        return None
    _, line, s = best
    p, a, b = line.interpolate(s), line.interpolate(max(0.0, s - 1.0)), line.interpolate(min(line.length, s + 1.0))
    return round(p.x, 1), round(p.y, 1), round(math.atan2(b.y - a.y, b.x - a.x), 5)


def villages(named_nodes, clip) -> list[dict]:
    """place=city/town/village/hamlet nodes in the frame -> [{t, x, z, r}], west to east."""
    out = [{"t": n.tags["name"].upper(), "x": round(n.x, 1), "z": round(n.z, 1), "r": PLACE_R[n.tags["place"]]}
           for n in named_nodes if n.tags.get("place") in PLACE_R and n.tags.get("name") and _inside(clip, n.x, n.z)]
    return sorted(out, key=lambda v: (v["x"], v["z"], v["t"]))


def named_places(named_nodes, areas, clip, kinds) -> list:
    """(kind, name, x, z) of every named node or area of the given kinds inside the frame, nodes first."""
    out = [(kind_of(n.tags), n.tags["name"], n.x, n.z) for n in named_nodes
           if kind_of(n.tags) in kinds and n.tags.get("name") and _inside(clip, n.x, n.z)]
    for a in areas:
        if kind_of(a.tags) in kinds and a.tags.get("name"):
            p = a.geom.representative_point()
            if _inside(clip, p.x, p.y):
                out.append((kind_of(a.tags), a.tags["name"], p.x, p.y))
    return out


def jlist(named_nodes, areas, clip, limit: int = J_MAX) -> list[dict]:
    """Every village/town centre (west to east), then J_KINDS in that order, each kind by name; one entry per place;
    at most `limit`. -> [{n, kind, x, z}]"""
    centres = sorted((n.x, n.z, n.tags["name"]) for n in named_nodes
                     if n.tags.get("place") in CENTRES and n.tags.get("name") and _inside(clip, n.x, n.z))
    picked = [{"n": name, "kind": "village", "x": round(x, 1), "z": round(z, 1)} for x, z, name in centres]
    rank = {k: i for i, k in enumerate(J_KINDS)}
    for k, name, x, z in sorted(named_places(named_nodes, areas, clip, set(J_KINDS)), key=lambda c: (rank[c[0]], *c[1:])):
        if not any(p["n"] == name and math.hypot(p["x"] - x, p["z"] - z) < SAME_PLACE for p in picked):
            picked.append({"n": name, "kind": k, "x": round(x, 1), "z": round(z, 1)})
    return picked[:limit]


def gemeinde_at(x, z, lines) -> str | None:
    """Cast RAYS rays; the first boundary line each crosses names the Gemeinden on both sides; the one name all hits
    share is the Gemeinde around the point. lines: [(names, LineString)]. None with fewer than two hits."""
    sets, here = [], shapely.Point(x, z)
    for k in range(RAYS):
        a = 2 * math.pi * k / RAYS
        ray = shapely.LineString([(x, z), (x + math.cos(a) * RAY_LEN, z + math.sin(a) * RAY_LEN)])
        hits = [(here.distance(ray.intersection(line)), names) for names, line in lines if ray.intersects(line)]
        if hits:
            sets.append(set(min(hits, key=lambda h: h[0])[1]))
    common = set.intersection(*sets) if len(sets) >= 2 else set()
    return next(iter(common)) if len(common) == 1 else None


def world_name(lines, clip) -> str | None:
    """The Gemeinde at the frame centre; "A · B" when a second one holds SECOND_NAME_MIN of 9 sample points."""
    x0, z0, x1, z1 = clip.bounds
    names = [gemeinde_at(x0 + (x1 - x0) * fx, z0 + (z1 - z0) * fz, lines) for fz in (0.25, 0.5, 0.75) for fx in (0.25, 0.5, 0.75)]
    centre = names[4] or next((n for n in names if n), None)
    others = Counter(n for n in names if n and n != centre)
    if centre and others:
        second, count = sorted(others.items(), key=lambda kv: (-kv[1], kv[0]))[0]
        if count >= SECOND_NAME_MIN:
            return f"{centre} · {second}"
    return centre
