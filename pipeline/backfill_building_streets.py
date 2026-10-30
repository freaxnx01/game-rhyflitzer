"""#557: patch the street (`st`) of every numbered building into an existing world file, from a cached OSM extract.

The world files are not rebuilt for this (a full `osm.py build` would drag in new swissSURFACE3D heights and every
OSM edit since the last stand); this script only adds `st` where OSM has a street and leaves the rest of the file
byte-identical. Idempotent: buildings that already carry `st` are left alone.

    python backfill_building_streets.py --pbf cache/osm/hochrhein.osm.pbf --world ../data/world_hochrhein.json
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import shapely

import geo
import osm_read
import world_buildings


def backfill(world: dict, data: osm_read.OsmData) -> dict:
    """Add `st` to every numbered building OSM has a street for; touches nothing else. Returns the counts."""
    own = {a.id: a.tags.get("addr:street", "").strip() for a in data.areas}
    numbered = [b for b in world["buildings"] if b.get("addr")]
    polys = [shapely.Polygon(b["ring"]) for b in numbered]
    stats = Counter()
    for b, nodes in zip(numbered, world_buildings.nodes_per_polygon(polys, data.addr_nodes)):
        street = own.get(b["id"]) or world_buildings._pick_street(n.street for n in nodes)
        if street and "st" not in b:
            b["st"] = street
            stats["own" if own.get(b["id"]) else "nodes"] += 1
    return {k: stats[k] for k in ("own", "nodes")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pbf", required=True, type=Path, help="a cached OSM extract (.osm.pbf or .osm)")
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    a = ap.parse_args(argv)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    frame = geo.Frame(world["origin"]["lat"], world["origin"]["lon"])
    print(f"backfill: reading {a.pbf} for address nodes and building streets", flush=True)
    stats = backfill(world, osm_read.read(a.pbf, frame))
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with_st = sum(1 for b in world["buildings"] if "st" in b)
    print(f"backfill: st added for {stats['own']} buildings from their own tag, {stats['nodes']} from address nodes; "
          f"{with_st} numbered buildings now carry st")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
