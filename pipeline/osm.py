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
import shlex
import subprocess
import sys
from pathlib import Path

import geo


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


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cut", help="cut a region from Geofabrik extracts (heavy, one-off)")
    c.add_argument("--pbf-dir", required=True, help="folder with *.osm.pbf country extracts")
    c.add_argument("--out", required=True)
    c.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), default=geo.DEFAULT_BBOX)
    c.add_argument("--pad", type=float, default=2000.0, help="padding around the bbox in metres")
    c.add_argument("--dry-run", action="store_true", help="print the osmium commands only")
    a = ap.parse_args(argv)
    if a.cmd == "cut":
        return cmd_cut(a)
    return 2


if __name__ == "__main__":
    sys.exit(main())
