"""#530: hand-traced houses of 1946-1952 that are gone today ("Sisseln 1952" layer).

`era_traced_sisseln.json` holds the footprints in LV95 (traced from the Siegfried map and SWISSIMAGE HIST 1946,
tracing references only, no imagery is stored). `house` turns one entry into a building shaped like `world["buildings"]`
items in the game frame: default two storeys (`H`), gable roof, village palette, `rect` from
`world_buildings.roof`. `apply` writes them to `world["era"]["houses"]` (last key of `era`, replaced on every run) and
adds the source line; run it after `era_1952.py` and before `era_roads.py`, so the roads count these houses:

    python era_traced.py --world ../data/world_hochrhein.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon

from geo import Frame
from world_buildings import roof

H = 6.0   # m, two storeys
SOURCE_LINE = "Historic houses: traced from the Siegfried map and SWISSIMAGE HIST 1946 © swisstopo"
HERE = Path(__file__).parent


def house(entry, frame):
    """One traced entry (LV95 ring) as a building in the game frame."""
    e, n = np.array(entry["ring"], float).T
    x, z = frame.lv95_to_game(e, n)
    ring = [[round(float(a), 2), round(float(b), 2)] for a, b in zip(x, z)]
    return {"id": entry["id"], "h": H, "roof": "gable", "palette": "village",
            "rect": roof(Polygon(ring))[1], "ring": ring}


def apply(world, traced):
    """Retrofit `world` in place; returns the number of houses."""
    if "era" not in world:
        raise ValueError("world has no `era`: run era_1952.py first")
    frame = Frame(world["origin"]["lat"], world["origin"]["lon"])
    houses = [house(e, frame) for e in traced["houses"]]
    world["era"].pop("houses", None)
    world["era"]["houses"] = houses
    if SOURCE_LINE not in world["sources"]:
        world["sources"].append(SOURCE_LINE)
    return len(houses)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    ap.add_argument("--traced", type=Path, default=HERE / "era_traced_sisseln.json")
    a = ap.parse_args(argv)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    traced = json.loads(a.traced.read_text(encoding="utf-8"))
    count = apply(world, traced)
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"era_traced: {count} houses")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
