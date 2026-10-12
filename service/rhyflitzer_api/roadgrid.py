"""#168: the road index behind GET /api/preview: metres of primary/secondary/tertiary road (places.MAJOR, #166) per
500 m LV95 cell, rebuilt by the worker when the Swiss extract changes. `osmium tags-filter` streams the 0.55 GB
extract into a small file and pyosmium reads that: no cut, well under 1 GB."""
from __future__ import annotations

import logging
import math
import subprocess
from collections import Counter
from pathlib import Path

import osmium
from pyproj import Transformer

import places

from . import logs
from .store import CELL

log = logging.getLogger("rhyflitzer.worker")
PIECE = 250.0            # a segment is cut into pieces of at most this length; each counts for its midpoint's cell
RETRY_SECONDS = 3600.0
TO_LV95 = Transformer.from_crs(4326, 2056, always_xy=True)


def cells_of_way(points) -> Counter:
    """Metres of one way per (cx, cy) cell, from its LV95 points."""
    out: Counter = Counter()
    for (e0, n0), (e1, n1) in zip(points, points[1:]):
        length = math.hypot(e1 - e0, n1 - n0)
        pieces = max(1, math.ceil(length / PIECE))
        for i in range(pieces):
            mid = (i + 0.5) / pieces
            out[(math.floor((e0 + (e1 - e0) * mid) / CELL), math.floor((n0 + (n1 - n0) * mid) / CELL))] += length / pieces
    return out


def build(extract: Path, work_dir: Path, run=subprocess.run) -> Counter:
    """The whole index from the extract; the filtered file is removed again."""
    work_dir.mkdir(parents=True, exist_ok=True)
    major = work_dir / "major-roads.pbf"
    try:
        run(["osmium", "tags-filter", "--overwrite", "-o", str(major), str(extract),
             "w/highway=" + ",".join(sorted(places.MAJOR))], check=True)
        cells: Counter = Counter()
        for way in osmium.FileProcessor(str(major), osmium.osm.NODE | osmium.osm.WAY).with_locations():
            if way.is_way() and way.tags.get("highway") in places.MAJOR:
                cells.update(cells_of_way([TO_LV95.transform(n.lon, n.lat) for n in way.nodes if n.location.valid()]))
        return cells
    finally:
        major.unlink(missing_ok=True)


def run_due(store, settings, now: float, build=build) -> None:
    """Rebuilds the index when the extract is newer than the one it was built from; a failure is retried hourly."""
    if not settings.extract_path.exists():
        return
    stamp = str(settings.extract_path.stat().st_mtime_ns)
    tried = store.kv_get("roadgrid_tried")
    if store.kv_get("roadgrid_for") == stamp or (tried and now - float(tried) < RETRY_SECONDS):
        return
    store.kv_set("roadgrid_tried", str(now))
    log.info("Building the road index for the preview from the extract")
    try:
        cells = build(settings.extract_path, settings.cache_dir / "roadgrid")
    except (OSError, subprocess.CalledProcessError):
        log.exception("Building the road index failed; the preview answers raceOk null until the next try")
        return
    store.replace_roadgrid([(cx, cy, round(m)) for (cx, cy), m in cells.items()])
    store.kv_set("roadgrid_for", stamp)
    log.info("The road index is ready: %d cells", len(cells), extra=logs.fields(cells=len(cells)))
