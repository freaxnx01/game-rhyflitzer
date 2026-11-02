"""#630: retrofit the DSM ridge cap into an existing world file.

The world files are not rebuilt for this (a CI runner has no OSM extract, and a full `osm.py build` would drag in
every OSM edit since the last stand, #557); this script caps the ridge of every gable whose DSM `rh` exceeds its
short side, keeps the ids listed in `--keep-ids` (churches, towers) and leaves the rest of the file byte-identical.
Idempotent: a capped ridge sits at 0.4 * short side, under the line.

    python cap_ridges.py --world ../data/world_hochrhein.json --keep-ids 390841597
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import building_heights


def cap_world(world: dict, keep_ids: set[int]) -> list[int]:
    """Cap the canopy ridges of every building not in `keep_ids`; touches nothing else. Returns the changed ids."""
    changed = []
    for b in world["buildings"]:
        if b["id"] not in keep_ids and building_heights.cap_ridge(b):
            changed.append(b["id"])
    return changed


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    ap.add_argument("--keep-ids", default="", help="comma list of building ids to keep (churches, towers)")
    a = ap.parse_args(argv)
    keep = {int(s) for s in a.keep_ids.split(",") if s.strip()}
    world = json.loads(a.world.read_text(encoding="utf-8"))
    changed = cap_world(world, keep)
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"cap_ridges: capped {len(changed)} buildings: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())