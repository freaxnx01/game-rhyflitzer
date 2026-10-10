"""#166: any Swiss rectangle -> world.json + terrain.mmh + meta.json, with generated start, J list, villages, forests
and name; nothing hand-made. Called by `osm.py world` and, in phase 3, by the API service. OSM-derived: ODbL."""
from __future__ import annotations

import datetime as dt
import json
import math
import sys
import tempfile
from pathlib import Path

import numpy as np
import shapely

import frame as frame_mod
import geo
import mmh
import osm
import osm_cut
import osm_read
import places
import terrain
import world_boundaries

PIPELINE_VERSION = "1"
PAD = 1000.0                       # m of OSM around the frame (roads and woods at the edge, Gemeinde lines)
STEP = 4.0                         # m terrain grid
TILE_CACHE_BYTES = 2_000_000_000   # per tile cache (TILE_CACHES), kept after a build, oldest deleted first
TILE_CACHES = ("swissalti3d", "swisssurface3d")
ODBL = ("Contains information from OpenStreetMap (c) OpenStreetMap contributors, made available under the "
        "Open Database License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/")


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def game_box(rect, fr: geo.Frame) -> tuple[float, float, float, float]:
    """LV95 rectangle -> game (x0, z0, x1, z1); z grows south, so the north edge is z0."""
    x0, z1 = fr.lv95_to_game(rect[0], rect[1])
    x1, z0 = fr.lv95_to_game(rect[2], rect[3])
    return round(float(x0), 1), round(float(z0), 1), round(float(x1), 1), round(float(z1), 1)


def rebase(header: dict, heights: np.ndarray):
    """Heights relative to the frame's lowest point (whole metres), so the valley floor sits near 0. Cells without
    data (NaN: the grid edge reaching past the Swiss border) are left out of the lowest point and set to 0."""
    holes = np.isnan(heights)
    if holes.all():
        raise ValueError("no terrain data in the frame")
    low = float(math.floor(float(np.nanmin(heights))))
    out = heights - low
    if holes.any():
        log(f"{holes.mean():.1%} of the terrain grid has no data (outside Switzerland) -> set to the lowest point")
        out[holes] = 0.0
    return {**header, "base": header.get("base", 0.0) + low, "min": float(out.min()), "max": float(out.max())}, out


def prune_tiles(folder, max_bytes: float) -> int:
    """Delete the oldest .tif tiles until at most max_bytes remain; returns how many went."""
    files = sorted(Path(folder).glob("*.tif"), key=lambda p: (p.stat().st_mtime, p.name))
    total, removed = sum(p.stat().st_size for p in files), 0
    for p in files:
        if total <= max_bytes:
            break
        total -= p.stat().st_size
        p.unlink()
        removed += 1
    return removed


def fallback_name(jl, clip, rect) -> str:
    """No Gemeinde lines: the nearest village or town centre, else the frame's LV95 kilometres."""
    c = clip.centroid
    centres = [e for e in jl if e["kind"] == "village"]
    if centres:
        return min(centres, key=lambda e: (math.hypot(e["x"] - c.x, e["z"] - c.y), e["n"]))["n"]
    return f"Region {int(rect[0]) // 1000}/{int(rect[1]) // 1000}"


def generated(world: dict, data, lines, clip, rect, wid: str) -> dict:
    """Fill the world's anchors, forests and `region` block from OSM; returns the region block."""
    jl = places.jlist(data.named_nodes, data.areas, clip)
    name = places.world_name(lines, clip) or fallback_name(jl, clip, rect)
    vill = places.villages(data.named_nodes, clip)
    start = places.start_point(world["roads"], clip)
    world["anchors"] = {"landmarks": {}, "cps": [], "areas": {}, "labels": [{"t": v["t"], "x": v["x"], "z": v["z"]} for v in vill],
                        **({"start": list(start)} if start else {})}
    x0, z0, x1, z1 = clip.bounds
    world["region"] = {"id": wid, "name": name, "gemeinden": [name], "villages": vill,
                       "jlist": [{**e, "g": name} for e in jl], "treeBox": [x0, x1, z0, z1], "forestAbove": None,
                       "race": None}   # filled by the automatic race (follow-up, race.py)
    return world["region"]


def _iso(ts=None) -> str:
    t = dt.datetime.fromtimestamp(ts, dt.timezone.utc) if ts else dt.datetime.now(dt.timezone.utc)
    return t.isoformat(timespec="seconds")


def meta(rect, region, world, header, src) -> dict:
    return {"format": "MMR1", "id": region["id"], "pipelineVersion": PIPELINE_VERSION, "name": region["name"],
            "bbox": {"lv95": list(rect), "lonlat": list(frame_mod.lonlat_bbox(rect))},
            "origin": world["origin"], "base": header["base"], "built": _iso(),
            "extract": {"file": Path(src).name, "modified": _iso(Path(src).stat().st_mtime)},
            "race": region["race"] is not None,
            "counts": {k: len(world[k]) for k in ("roads", "buildings", "forests")}
                      | {"villages": len(region["villages"]), "jlist": len(region["jlist"])},
            "sources": world["sources"], "license": ODBL, "lastPlayed": None}


def _terrain(bbox, org, cache: Path, out: Path) -> dict:
    header, heights = rebase(*terrain.sample(bbox, org, STEP, cache, None))
    mmh.write_mmh(out, header, heights)
    return header


def _world(pbf, out_dir: Path, rect, cache: Path, dsm: bool, step):
    org = frame_mod.origin(rect)
    fr = geo.Frame(*org)
    box = game_box(rect, fr)
    header = _terrain(frame_mod.lonlat_bbox(rect), org, cache, out_dir / "terrain.mmh")
    step("world")
    data = osm_read.read(Path(pbf), fr)
    boundary_items = world_boundaries.read(Path(pbf), fr)
    world = osm.build_world(pbf, out_dir / "terrain.mmh", frame_mod.lonlat_bbox(rect), org, 30.0, 1000.0, None,
                            cache if dsm else None, clip_box=box, data=data, boundary_items=boundary_items)
    world["sources"] += ["Terrain: swissALTI3D © swisstopo"] + (["Building heights: swissSURFACE3D © swisstopo"] if dsm else [])
    lines = [(names, line) for _, names, line in boundary_items]
    return world, data, lines, shapely.box(*box), header


def build_world(rect, out_dir, *, extract=None, pbf=None, cache=Path("cache"), dsm: bool = True,
                progress=None, tile_cache_bytes: float = TILE_CACHE_BYTES) -> dict:
    """Build the LV95 rectangle (snapped and checked here) into out_dir from `extract` (cut here) or `pbf` (already
    cut). progress(step): cutting, terrain, world, places, done. Raises frame.FrameError for a refused frame."""
    if (extract is None) == (pbf is None):
        raise ValueError("give exactly one of extract= (cut it) or pbf= (already cut)")
    rect = frame_mod.snap(*rect)
    frame_mod.check(rect)
    step, out_dir, cache = progress or (lambda s: None), Path(out_dir), Path(cache)
    out_dir.mkdir(parents=True, exist_ok=True)
    wid = frame_mod.world_id(rect, PIPELINE_VERSION)
    log(f"building world {wid}: LV95 {rect}")
    with tempfile.TemporaryDirectory(dir=out_dir) as tmp:
        if extract is not None:
            step("cutting")
            pbf = osm_cut.cut(extract, frame_mod.lonlat_bbox(rect, PAD), Path(tmp) / "cut.osm.pbf", tmp)
        step("terrain")
        world, data, lines, clip, header = _world(pbf, out_dir, rect, cache, dsm, step)
        step("places")
        region = generated(world, data, lines, clip, rect, wid)
        osm.write_world(out_dir / "world.json", world)
        doc = meta(rect, region, world, header, extract if extract is not None else pbf)
        (out_dir / "meta.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    for name in TILE_CACHES:
        log(f"pruned {prune_tiles(cache / name, tile_cache_bytes)} {name} tiles")
    log(f"world {wid} '{region['name']}' built: {len(region['jlist'])} J places, {len(region['villages'])} villages")
    step("done")
    return {"world": out_dir / "world.json", "terrain": out_dir / "terrain.mmh", "meta": out_dir / "meta.json"}
