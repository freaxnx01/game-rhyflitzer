"""Hand-maintained anchors (landmarks, race points, labels) -> game coordinates.

Heading convention: heading_deg is a compass-free game angle: 0 = +x (east), 90 = +z (south),
180 = west. It becomes the prototype's `th` (radians, atan2(dz, dx)).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import shapely


def load(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _osm_ref(s: str):
    return s[0], int(s[1:])


def _index(data):
    idx = {}
    for a in data.areas:
        idx[("r" if not a.from_way else "w", a.id)] = a.geom.centroid
    for w in data.ways:
        idx.setdefault(("w", w.id), w.line.interpolate(0.5, normalized=True))
    for n in data.named_nodes:
        idx[("n", n.id)] = (n.x, n.z)
    return idx


def _pos(entry, idx, frame):
    if "osm" in entry:
        p = idx.get(_osm_ref(entry["osm"]))
        if p is None:
            print(f"anchors: {entry['osm']} not found in the extract", file=sys.stderr)
            return None
        return (p[0], p[1]) if isinstance(p, tuple) else (p.x, p.y)
    if "game" in entry:
        return float(entry["game"][0]), float(entry["game"][1])
    x, z = frame.to_game(*entry["lonlat"])
    return float(x), float(z)


def resolve(spec, data, frame) -> dict:
    idx = _index(data)
    out = {"landmarks": {}, "cps": [], "labels": [], "areas": {}}
    for name, e in spec.get("landmarks", {}).items():
        p = _pos(e, idx, frame)
        if p is None:
            continue
        out["landmarks"][name] = {"x": round(p[0], 1), "z": round(p[1], 1), "kind": e.get("kind", ""),
                                  "h": e.get("h"), "rot": math.radians(e.get("heading_deg", 0))}
        if "size" in e:
            out["landmarks"][name]["size"] = [float(v) for v in e["size"]]
    if "start" in spec:
        p = _pos(spec["start"], idx, frame)
        if p:
            out["start"] = [round(p[0], 1), round(p[1], 1), round(math.radians(spec["start"].get("heading_deg", 0)), 5)]
    for c in spec.get("cps", []):
        p = _pos(c, idx, frame)
        if p:
            out["cps"].append({"n": c["n"], "x": round(p[0], 1), "z": round(p[1], 1)})
    if "finish" in spec:
        p = _pos(spec["finish"], idx, frame)
        if p:
            out["finish"] = {"n": spec["finish"]["n"], "x": round(p[0], 1), "z": round(p[1], 1)}
    for lb in spec.get("labels", []):
        p = _pos(lb, idx, frame)
        if p:
            out["labels"].append({"t": lb["t"], "x": round(p[0], 1), "z": round(p[1], 1)})
    for name, a in spec.get("areas", {}).items():
        if isinstance(a, dict) and "game_box" in a:
            out["areas"][name] = [float(v) for v in a["game_box"]]
        elif isinstance(a, dict) and "lonlat_box" in a:
            w, s, e, n = a["lonlat_box"]
            x0, z1 = frame.to_game(w, s); x1, z0 = frame.to_game(e, n)
            out["areas"][name] = [round(float(x0), 1), round(float(z0), 1), round(float(x1), 1), round(float(z1), 1)]
    return out


def exclude_ids(spec) -> set:
    return {_osm_ref(s)[1] for s in spec.get("exclude_buildings", [])}


def industrial_ids(spec) -> list:
    return [_osm_ref(s)[1] for s in spec.get("areas", {}).get("industrial", [])]


def keep_all_boxes(spec, resolved) -> list:
    """Areas flagged keep_all_buildings, as game-frame boxes (from the resolved anchors)."""
    return [shapely.box(*resolved["areas"][name]) for name, a in spec.get("areas", {}).items()
            if isinstance(a, dict) and a.get("keep_all_buildings") and name in resolved["areas"]]
