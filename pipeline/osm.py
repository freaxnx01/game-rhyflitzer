#!/usr/bin/env python3
"""Map Madness pipeline, step 2: the world from OpenStreetMap.

    cut    one-off per region, heavy: osmium extract (strategy smart) from Geofabrik country
           extracts, padded bbox, merged into one small regional .osm.pbf. Needs several GB of
           free memory (osmium's ID bitmaps span the whole planet ID range); run it on
           odroid-plus-pve, not on the agent box. See docs/11-pipeline-osm.md.
    build  light: regional .osm.pbf (+ optional .mmh) -> data/world_<region>.json (MMW1)

Never uses the public Overpass API.
Licence: data (c) OpenStreetMap contributors, ODbL. The world file is a derivative database.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import shlex
import subprocess
import sys
from pathlib import Path

import shapely

import anchors as anchors_mod
import geo
import mmh
import osm_read
import world_buildings
import world_props
import world_roads
import world_water


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def cut_commands(pbfs, bbox, out: Path, workdir: Path) -> list[list[str]]:
    b = ",".join(f"{v:.6f}" for v in bbox)
    parts, cmds = [], []
    for p in pbfs:
        part = Path(workdir) / (Path(p).name.replace(".osm.pbf", "") + ".cut.osm.pbf")
        cmds.append(["osmium", "extract", "-b", b, "-s", "smart", "--overwrite", "-o", str(part), str(p)])
        parts.append(str(part))
    cmds.append(["osmium", "merge", "--overwrite", *parts, "-o", str(out)])
    return cmds


def _available_gb() -> float:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) / 1e6
    except OSError:
        pass
    return float("inf")


def cmd_cut(a) -> int:
    pbfs = sorted(Path(a.pbf_dir).expanduser().glob("*.osm.pbf"))
    pbfs = [p for p in pbfs if not p.name.endswith(".cut.osm.pbf")]
    if not pbfs:
        log(f"no .osm.pbf files in {a.pbf_dir}")
        return 1
    out = Path(a.out)
    cmds = cut_commands(pbfs, geo.pad_bbox(tuple(a.bbox), a.pad), out, out.parent)
    if a.dry_run:
        for c in cmds:
            print(shlex.join(c))
        return 0
    if _available_gb() < 3:
        log(f"warning: only {_available_gb():.1f} GB available; osmium extract -s smart may need more. "
            "Run the cut on odroid-plus-pve (docs/11-pipeline-osm.md).")
    out.parent.mkdir(parents=True, exist_ok=True)
    for c in cmds:
        log("$ " + shlex.join(c))
        subprocess.run(c, check=True)
    log(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")
    return 0


def build_world(pbf, mmh_path, bbox, origin, house_dist, big_area, anchors_path) -> dict:
    frame = geo.Frame(*origin)
    xs, zs = frame.to_game([bbox[0], bbox[2]], [bbox[3], bbox[1]])
    clip = shapely.box(float(xs[0]), float(zs[0]), float(xs[1]), float(zs[1]))
    log(f"reading {pbf}")
    data = osm_read.read(Path(pbf), frame)
    hdr = heights = None
    if mmh_path:
        hdr, heights = mmh.read_mmh(mmh_path)
    spec = anchors_mod.load(anchors_path)
    roads, junctions = world_roads.build(data.ways, data.nodes, data.way_nodes, clip)
    polys = world_water.polygons(data.areas, data.ways, clip)
    ind_ids = set(anchors_mod.industrial_ids(spec))
    sites = [a.geom for a in data.areas if a.id in ind_ids]
    resolved = anchors_mod.resolve(spec, data, frame)
    buildings, stats = world_buildings.build(data.areas, roads, clip, house_dist, big_area,
                                             anchors_mod.exclude_ids(spec), sites,
                                             anchors_mod.keep_all_boxes(spec, resolved))
    props, prop_stats = world_props.build(data.prop_nodes, data.areas, roads, clip)
    rail = [[[round(x, 1), round(z, 1)] for x, z in w.line.intersection(clip).coords]
            for w in data.ways if w.tags.get("railway") == "rail" and w.line.intersects(clip)
            and w.line.intersection(clip).geom_type == "LineString"]
    log(f"roads {len(roads)}, junctions {len(junctions)}, water {len(polys)}, buildings {len(buildings)} {stats}, "
        f"rail {len(rail)}, props {len(props)} {prop_stats}")
    return {
        "format": "MMW1",
        "origin": {"lat": origin[0], "lon": origin[1], "E": frame.e0, "N": frame.n0, "crs": "EPSG:2056"},
        "bbox": list(bbox),
        "sources": ["\u00a9 OpenStreetMap contributors, ODbL"]
                   + (["Water levels: swissALTI3D \u00a9 swisstopo"] if hdr else []),
        "params": {"houseDist": house_dist, "bigBuildingArea": big_area,
                   "built": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                   "pbf": Path(pbf).name},
        "roads": roads,
        "junctions": junctions,
        "water": world_water.to_json(polys, hdr, heights),
        "waterSdf": world_water.sdf(polys, clip.bounds),
        "buildings": buildings,
        "rail": rail,
        "props": props,
        "anchors": resolved,
    }


def write_world(path: Path, world: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"wrote {path} ({path.stat().st_size / 1e6:.1f} MB)")


def cmd_build(a) -> int:
    world = build_world(a.pbf, a.mmh, tuple(a.bbox), tuple(a.origin), a.house_dist, a.big_building_area, a.anchors)
    write_world(a.out, world)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cut", help="cut a region from Geofabrik extracts (heavy, one-off)")
    c.add_argument("--pbf-dir", required=True, help="folder with *.osm.pbf country extracts")
    c.add_argument("--out", required=True)
    c.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), default=geo.DEFAULT_BBOX)
    c.add_argument("--pad", type=float, default=2000.0, help="padding around the bbox in metres")
    c.add_argument("--dry-run", action="store_true", help="print the osmium commands only")
    b = sub.add_parser("build", help="regional .osm.pbf -> world JSON (light)")
    b.add_argument("--pbf", required=True)
    b.add_argument("--mmh", default=None, help="measured terrain, for water levels")
    b.add_argument("--out", default="../data/world_hochrhein.json")
    b.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), default=geo.DEFAULT_BBOX)
    b.add_argument("--origin", nargs=2, type=float, metavar=("LAT", "LON"), default=geo.DEFAULT_ORIGIN)
    b.add_argument("--house-dist", type=float, default=30.0)
    b.add_argument("--big-building-area", type=float, default=1000.0)
    b.add_argument("--anchors", default=str(Path(__file__).with_name("anchors.json")))
    a = ap.parse_args(argv)
    if a.cmd == "cut":
        return cmd_cut(a)
    if a.cmd == "build":
        return cmd_build(a)
    return 2


if __name__ == "__main__":
    sys.exit(main())
