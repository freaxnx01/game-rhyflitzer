"""#166: cut one frame from the Swiss extract within 2 GB. `-s smart` / `complete_ways` exceed it; `-s simple` (~1.9 GB)
loses big woods and lakes. So: 1. extract -s simple; 2. tags-filter -R: every forest/wood/water relation, no members
(~50 MB); 3. getid -r: those with a member way in the cut plus the cut's broken closed forest/water ways, complete
(~0.9 GB); 4. merge 1 + 3."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import osmium

RELATION_FILTERS = ["r/landuse=forest", "r/natural=wood,water", "r/water"]


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def is_area_of_interest(tags) -> bool:
    return tags.get("landuse") == "forest" or tags.get("natural") in ("wood", "water") or "water" in tags


def extract_cmd(extract, bbox, out) -> list[str]:
    b = ",".join(f"{v:.6f}" for v in bbox)
    return ["osmium", "extract", "-b", b, "-s", "simple", "--overwrite", "-o", str(out), str(extract)]


def relations_cmd(extract, out) -> list[str]:
    return ["osmium", "tags-filter", "-R", "--overwrite", "-o", str(out), str(extract), *RELATION_FILTERS]


def getid_cmd(extract, id_file, out) -> list[str]:
    return ["osmium", "getid", "-r", "--overwrite", "-i", str(id_file), "-o", str(out), str(extract)]


def merge_cmd(parts, out) -> list[str]:
    return ["osmium", "merge", "--overwrite", *map(str, parts), "-o", str(out)]


def incomplete_ids(cut_pbf, relations_pbf) -> list[str]:
    """r<id> for every area relation with a member way in the cut; w<id> for every closed area way in the cut that
    lost nodes at the cut edge. Sorted, relations first."""
    ways, broken = set(), set()
    for o in osmium.FileProcessor(str(cut_pbf), osmium.osm.NODE | osmium.osm.WAY).with_locations():
        if not o.is_way():
            continue
        ways.add(o.id)
        if is_area_of_interest(o.tags) and o.nodes[0].ref == o.nodes[-1].ref and not all(n.location.valid() for n in o.nodes):
            broken.add(o.id)
    rels = {o.id for o in osmium.FileProcessor(str(relations_pbf), osmium.osm.RELATION)
            if any(m.type == "w" and m.ref in ways for m in o.members)}
    return [f"r{i}" for i in sorted(rels)] + [f"w{i}" for i in sorted(broken)]


def _run(cmd) -> None:
    log("$ " + " ".join(cmd))
    subprocess.run(cmd, check=True)


def cut(extract, bbox, out, workdir) -> Path:
    """The frame's regional .osm.pbf at `out`; temporary files go to `workdir`."""
    work = Path(workdir)
    part, rels, ids, full = work / "simple.osm.pbf", work / "arearels.osm.pbf", work / "ids.txt", work / "complete.osm.pbf"
    log(f"cutting {bbox} from {extract}")
    _run(extract_cmd(extract, bbox, part))
    _run(relations_cmd(extract, rels))
    wanted = incomplete_ids(part, rels)
    if wanted:
        ids.write_text("\n".join(wanted) + "\n", encoding="utf-8")
        _run(getid_cmd(extract, ids, full))
        _run(merge_cmd([part, full], out))
    else:
        shutil.copyfile(part, out)
    log(f"cut {out} ({Path(out).stat().st_size / 1e6:.1f} MB), {len(wanted)} areas completed")
    return Path(out)
