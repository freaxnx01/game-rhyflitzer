#!/usr/bin/env python3
"""#1151: bridge and underpass heights from swissTLM3D. Matches the committed CH-wide structures extract
(tlm_structures.json.gz) to a world's rail decks (`railBridges`) and road bridges (`roads` with `bridge`) and writes

    "tlm":      [[t, y], ...]            the deck profile: t = metres from the piece start (0.1), y = game height (0.01)
    "tlmUnder": [[x, z, y, kind], ...]   what passes under the deck: kind "road" | "rail", y = its game height

onto each matched piece. Pieces with no match get no key and keep today's heights in the game.

    python pipeline/world_tlm.py --world data/world_hochrhein.json --mmh data/terrain_hochrhein.mmh [--structures PATH]

Patches the world in place; running it twice gives the same file (stale keys are dropped first).
Data: swissTLM3D (c) swisstopo, Open Government Data.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import shapely
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

import mmh
import tlm_structures

SOURCE = "Bridge heights: swissTLM3D © swisstopo"
BRIDGE_KINDS = {"Bruecke", "Gedeckte Bruecke", "Bruecke mit Treppe", "Bruecke mit Galerie", "Steg"}
SAMPLE = 2.0          # m between the samples of a piece
MATCH_DIST = 8.0      # m: a sample matches an axis this near ...
MATCH_COS = 0.9       # ... that runs this parallel (|cos|)
MATCH_SHARE = 0.5     # a piece is matched when this share of its samples match
UNDER_DROP = 2.5      # m: a line this far below the deck axis passes under it
HERO_DIST = 15.0      # m: a piece this near a hero bridge landmark (index.html:1496-1497) never gets TLM
JOIN = 0.5            # m: pieces whose ends are this near belong to one chain (world.js bridgeChain)
END_SLACK = 3.0       # m: a sample may overshoot an axis end this far and still match
MARGIN = 100.0        # m: structures this far outside the road extent are not read
HEROES = ("holzbruecke", "fridolinsbruecke")
KEYS = ("tlm", "tlmUnder")


def _unit(a, b):
    d = math.hypot(b[0] - a[0], b[1] - a[1])
    return ((b[0] - a[0]) / d, (b[1] - a[1]) / d) if d else (0.0, 0.0)


def _direction(line: LineString, s: float):
    """Unit tangent of `line` at arc length s, taken over +-0.5 m (clamped at the ends)."""
    a = line.interpolate(max(s - 0.5, 0.0))
    b = line.interpolate(min(s + 0.5, line.length))
    return _unit((a.x, a.y), (b.x, b.y))


def _pieces(world: dict):
    for i, rb in enumerate(world.get("railBridges", [])):
        yield rb, "rail", rb["pts"]
    for r in world.get("roads", []):
        if r.get("bridge"):
            yield r, "road", r["pts"]


def _near_polyline(pts, x, z) -> float:
    return LineString(pts).distance(Point(x, z)) if len(pts) > 1 else math.inf


def _hero_ids(world: dict) -> set[int]:
    """ids (python `id`) of the pieces that are hero bridges: near a landmark, plus the chain of same-named generic
    roads touching them (mirrors index.html:1496-1497 and world.js bridgeChain, #78)."""
    marks = (world.get("anchors") or {}).get("landmarks") or {}
    pieces = list(_pieces(world))
    seeds = [k for k, (_, _, pts) in enumerate(pieces)
             if any(m in marks and _near_polyline(pts, marks[m]["x"], marks[m]["z"]) < HERO_DIST for m in HEROES)]
    chain = set(seeds)

    def ends(k):
        pts = pieces[k][2]
        return pts[0], pts[-1]

    def touches(k):
        return any(math.hypot(e[0] - q[0], e[1] - q[1]) <= JOIN for e in ends(k) for j in chain for q in ends(j))

    for seed in seeds:
        name = pieces[seed][0].get("n")
        if not name or pieces[seed][1] != "road":
            continue
        grew = True
        while grew:
            grew = False
            for k, (p, layer, _) in enumerate(pieces):
                if k in chain or layer != "road" or p.get("n") != name or not touches(k):
                    continue
                chain.add(k)
                grew = True
    return {id(pieces[k][0]) for k in chain}


def _lines(doc: dict, frame_e: float, frame_n: float, bounds):
    """Every TLM part in game coordinates: dicts {layer, kind, structure, line (3D)}, those meeting `bounds` only."""
    out = []
    for group, structure in (("structures", True), ("partners", False)):
        for f in doc.get(group, []):
            for part in f["p"]:
                pts = [(e - frame_e, frame_n - n, z) for e, n, z in part]
                if len(pts) < 2:
                    continue
                xs, zs = [p[0] for p in pts], [p[1] for p in pts]
                if max(xs) < bounds[0] or min(xs) > bounds[2] or max(zs) < bounds[1] or min(zs) > bounds[3]:
                    continue
                out.append({"layer": f["l"], "kind": f["k"], "structure": structure, "line": LineString(pts)})
    return out


def _sample_distances(length: float):
    n = int(length // SAMPLE)
    ds = [i * SAMPLE for i in range(n + 1)]
    if length - ds[-1] > 1e-6:
        ds.append(length)
    return ds


def _match_sample(piece: LineString, s: float, axes, tree: STRtree):
    """(axis index, TLM z) of the nearest parallel bridge axis within MATCH_DIST of the sample, or None. A sample past
    the end of an axis does not match it: an axis covering 40 % of a piece must not match 60 % of it."""
    p = piece.interpolate(s)
    u = _direction(piece, s)
    best = None
    for k in tree.query(p.buffer(MATCH_DIST)):
        axis = axes[k]
        d = axis.project(p)
        q = axis.interpolate(d)
        dist = p.distance(q)
        if dist > MATCH_DIST:
            continue
        v = _direction(axis, d)
        if abs(u[0] * v[0] + u[1] * v[1]) < MATCH_COS:
            continue
        if d <= 0.0 or d >= axis.length:
            out = (p.x - q.x) * v[0] + (p.y - q.y) * v[1]
            if (out if d > 0 else -out) > END_SLACK:
                continue
        if best is None or dist < best[0]:
            best = (dist, k, q.z)
    return None if best is None else (best[1], best[2])


def _under(piece: LineString, matched_axes, all_lines, all_tree: STRtree, base: float) -> list:
    reach = piece.buffer(MATCH_DIST)
    found = set()
    for axis in matched_axes:
        for k in all_tree.query(axis):
            other = all_lines[k]
            if other["line"] is axis or not axis.crosses(other["line"]):
                continue
            for x, z in shapely.get_coordinates(axis.intersection(other["line"])):
                pt = Point(x, z)
                if not reach.contains(pt):
                    continue
                z_deck = axis.interpolate(axis.project(pt)).z
                z_other = other["line"].interpolate(other["line"].project(pt)).z
                if z_deck - z_other >= UNDER_DROP:
                    found.add((round(float(x), 1), round(float(z), 1), round(float(z_other) - base, 2), other["layer"]))
    return [list(f) for f in sorted(found)]


def apply(world: dict, doc: dict, base: float) -> dict:
    """Write tlm / tlmUnder onto the world's matched rail decks and road bridges; stats {rail, road, under}."""
    for piece, _, _ in _pieces(world):
        for key in KEYS:
            piece.pop(key, None)
    world["sources"] = [s for s in world.get("sources", []) if s != SOURCE]
    stats = {"rail": 0, "road": 0, "under": 0}
    pieces = [p for p in _pieces(world) if len(p[2]) > 1]
    if not pieces:
        return stats
    xs = [pt[0] for _, _, pts in pieces for pt in pts] + [pt[0] for r in world.get("roads", []) for pt in r["pts"]]
    zs = [pt[1] for _, _, pts in pieces for pt in pts] + [pt[1] for r in world.get("roads", []) for pt in r["pts"]]
    bounds = (min(xs) - MARGIN, min(zs) - MARGIN, max(xs) + MARGIN, max(zs) + MARGIN)
    all_lines = _lines(doc, world["origin"]["E"], world["origin"]["N"], bounds)
    if not all_lines:
        return stats
    all_tree = STRtree([ln["line"] for ln in all_lines])
    bridge_axes = {}
    for layer in ("rail", "road"):
        axes = [ln["line"] for ln in all_lines if ln["structure"] and ln["layer"] == layer and ln["kind"] in BRIDGE_KINDS]
        bridge_axes[layer] = (axes, STRtree(axes) if axes else None)
    hero = _hero_ids(world)
    for piece, layer, pts in pieces:
        axes, tree = bridge_axes[layer]
        line = LineString(pts)
        if tree is None or line.length == 0 or id(piece) in hero:
            continue
        samples = _sample_distances(line.length)
        hits = [(s, _match_sample(line, s, axes, tree)) for s in samples]
        hits = [(s, m) for s, m in hits if m is not None]
        if len(hits) < MATCH_SHARE * len(samples):
            continue
        piece["tlm"] = [[round(s, 1), round(z - base, 2)] for s, (_, z) in hits]
        under = _under(line, [axes[k] for k in sorted({m[0] for _, m in hits})], all_lines, all_tree, base)
        if under:
            piece["tlmUnder"] = under
        stats[layer] += 1
        stats["under"] += len(under)
    if stats["rail"] or stats["road"]:
        world["sources"].append(SOURCE)
    return stats


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    ap.add_argument("--mmh", required=True, type=Path, help="the world's terrain (its base: game y = Z - base)")
    ap.add_argument("--structures", type=Path, default=tlm_structures.DEFAULT)
    a = ap.parse_args(argv)
    doc = tlm_structures.load(a.structures)
    if doc is None:
        print(f"world_tlm: {a.structures} not found", file=sys.stderr)
        return 2
    hdr, _ = mmh.read_mmh(a.mmh)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    stats = apply(world, doc, hdr["base"])
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"world_tlm: {stats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
