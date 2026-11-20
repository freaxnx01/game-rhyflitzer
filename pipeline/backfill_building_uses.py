"""#1035: patch `use` (school, kindergarten, station, gym, pool, werkhof) onto the public buildings of an existing world file,
from a cached OSM extract, so the delivery mode can prefer them as targets.

Like the street backfill, the world file is not rebuilt; only `use` is added and the rest stays byte-identical.
A building's kind comes from its own tags, else from the smallest classified area (a school site) around its centre,
else from a classified node (e.g. an `amenity=kindergarten` point) inside its footprint. Idempotent: buildings that
already carry `use` are left alone.

    python backfill_building_uses.py --pbf cache/osm/hochrhein.osm.pbf --world ../data/world_hochrhein.json
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import shapely
from shapely.strtree import STRtree

import geo
import osm_read

TAG_KINDS = (
    (("building", "amenity"), {"school": "school", "kindergarten": "kindergarten", "train_station": "station"}),
    (("railway",), {"station": "station"}),
    (("leisure", "building"), {"sports_hall": "gym"}),
)
NAME_KINDS = (
    (re.compile(r"werkhof|bauamt|bauhof", re.I), "werkhof"),
    (re.compile(r"hallenbad", re.I), "pool"),
    (re.compile(r"turnhalle|mehrzweckhalle|sporthalle", re.I), "gym"),
    (re.compile(r"bahnhof(?!s?platz)", re.I), "station"),
)
NOT_BY_NAME_BUILDINGS = ("retail", "commercial")


def classify(tags: dict) -> str | None:
    """The public-building kind of an OSM tag set, or None."""
    for keys, kinds in TAG_KINDS:
        for key in keys:
            if tags.get(key) in kinds:
                return kinds[tags[key]]
    name = tags.get("name", "")
    if not name or "parkplatz" in name.lower() or tags.get("building") in NOT_BY_NAME_BUILDINGS:
        return None
    return next((kind for rx, kind in NAME_KINDS if rx.search(name)), None)


def _site_kind(areas: list, centre: shapely.Point) -> str | None:
    """The kind of the smallest classified area containing the point."""
    hits = [(a.geom.area, kind) for a, kind in areas if a.geom.contains(centre)]
    return min(hits)[1] if hits else None


def _node_kinds(polys: list, nodes: list) -> list:
    """The classified node kinds inside each footprint."""
    out = [[] for _ in polys]
    classified = [(n, classify(n.tags)) for n in nodes]
    classified = [(n, k) for n, k in classified if k]
    if not polys or not classified:
        return out
    pts = [shapely.Point(n.x, n.z) for n, _ in classified]
    for ni, pi in zip(*STRtree(polys).query(pts, predicate="within")):
        out[int(pi)].append(classified[int(ni)][1])
    return out


def backfill(world: dict, data: osm_read.OsmData) -> dict:
    """Add `use` to the public buildings that lack it; touches nothing else. Returns the counts per kind."""
    classified = [(a, classify(a.tags)) for a in data.areas]
    classified = [(a, k) for a, k in classified if k]
    own = {a.id: k for a, k in classified if a.from_way}
    todo = [b for b in world["buildings"] if "use" not in b]
    polys = [shapely.Polygon(b["ring"]) for b in todo]
    node_kinds = _node_kinds(polys, data.named_nodes + data.prop_nodes)
    stats = Counter()
    for b, kinds in zip(todo, node_kinds):
        kind = own.get(b["id"]) or _site_kind(classified, shapely.Point(b["rect"][0], b["rect"][1])) \
            or (kinds[0] if kinds else None)
        if kind:
            b["use"] = kind
            stats[kind] += 1
    return dict(stats)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pbf", required=True, type=Path, help="a cached OSM extract (.osm.pbf or .osm)")
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    a = ap.parse_args(argv)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    frame = geo.Frame(world["origin"]["lat"], world["origin"]["lon"])
    print(f"backfill: reading {a.pbf} for public buildings", flush=True)
    stats = backfill(world, osm_read.read(a.pbf, frame))
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"backfill: use added for {sum(stats.values())} buildings: {dict(sorted(stats.items()))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
