"""#530: flag the Swiss buildings newer than 1952 in an existing world file ("Sisseln 1952" layer).

The GWR register (cached by `gwr_ch.py fetch`, never fetched here) gives a build year or period per building point.
A building is "old" if a point inside its footprint (+ MATCH_PAD) has year <= cutoff, or no year but period 8011/8012.
It is "modern" if it has points and none is old and none is ambiguous (period 8013 without a year). The rest is
undecided: industrial and unmatched sheds are modern; any other stays only if it has decided neighbours within
NEIGHBOUR_R and all of them are old. Buildings with the centroid outside the CH outline are "de" and never flagged.

Writes `building["modern"] = True` and `world["era"] = {"year": 1952}` (right after `sources`); idempotent.

    python era_1952.py --world ../data/world_hochrhein.json --gwr cache/gwr/hochrhein.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from shapely import STRtree
from shapely.geometry import MultiPolygon, Point, Polygon, shape

from geo import Frame

MATCH_PAD = 2.0  # m buffer around the footprint within which a register point belongs to it
SHED_AREA = 60.0  # m2, an unmatched building below this is a shed or garage
NEIGHBOUR_R = 30.0  # m radius around the centroid for the neighbour rule
OLD_PERIODS = (8011, 8012)  # before 1919, 1919-1945
AMBIGUOUS_PERIOD = 8013  # 1946-1960, straddles the cutoff
SOURCE_LINE = "Building ages: GWR © BFS"
HERE = Path(__file__).parent


def _point_verdict(year, period, cutoff):
    """'old', 'modern' or 'ambiguous' for one register point."""
    if year is not None:
        return "old" if year <= cutoff else "modern"
    if period in OLD_PERIODS:
        return "old"
    return "ambiguous" if period == AMBIGUOUS_PERIOD else "modern"  # later periods (8014+) or no data: newer


def _matched_verdict(verdicts):
    if "old" in verdicts:
        return "old"
    if verdicts and "ambiguous" not in verdicts:
        return "modern"
    return None


def _decide_matched(footprints, gwr_xz, cutoff):
    """(verdict per footprint index with a decisive match, indices with any match at all)."""
    if not gwr_xz:
        return {}, set()
    tree = STRtree([Point(x, z) for x, z, _, _ in gwr_xz])
    decided, matched = {}, set()
    for i, fp in footprints.items():
        hits = tree.query(fp.buffer(MATCH_PAD), predicate="contains")
        if not len(hits):
            continue
        matched.add(i)
        verdict = _matched_verdict([_point_verdict(gwr_xz[j][2], gwr_xz[j][3], cutoff) for j in hits])
        if verdict:
            decided[i] = verdict
    return decided, matched


def _undecided_verdict(building, fp, matched, neighbours):
    if building.get("palette") == "industrial":
        return "modern"
    if not matched and fp.area < SHED_AREA:
        return "modern"
    if neighbours and all(v == "old" for v in neighbours):
        return "old"
    return "modern"


def classify(buildings, gwr_xz, swiss, cutoff=1952):
    """Map building id -> "old" | "modern" | "de". Everything is in the game frame."""
    footprints = {i: Polygon(b["ring"]) for i, b in enumerate(buildings)}
    result = {}
    swiss_idx = []
    for i, b in enumerate(buildings):
        if swiss.contains(footprints[i].centroid):
            swiss_idx.append(i)
        else:
            result[b["id"]] = "de"
    swiss_fps = {i: footprints[i] for i in swiss_idx}
    decided, matched = _decide_matched(swiss_fps, gwr_xz, cutoff)
    verdict_by_index = dict(decided)
    if verdict_by_index:
        keys = list(verdict_by_index)
        tree = STRtree([footprints[i] for i in keys])
    for i in swiss_idx:
        if i in decided:
            continue
        neighbours = []
        if verdict_by_index:
            circle = footprints[i].centroid.buffer(NEIGHBOUR_R)
            neighbours = [verdict_by_index[keys[j]] for j in tree.query(circle, predicate="intersects")]
        result[buildings[i]["id"]] = _undecided_verdict(buildings[i], footprints[i], i in matched, neighbours)
    for i, v in decided.items():
        result[buildings[i]["id"]] = v
    return result


def _outline_to_game(outline_lv95, frame):
    def ring(coords):
        e, n = np.array(coords).T
        x, z = frame.lv95_to_game(e, n)
        return list(zip(x.tolist(), z.tolist()))
    polys = [outline_lv95] if isinstance(outline_lv95, Polygon) else list(outline_lv95.geoms)
    out = [Polygon(ring(p.exterior.coords), [ring(h.coords) for h in p.interiors]) for p in polys]
    return out[0] if len(out) == 1 else MultiPolygon(out)


def _insert_after(world, after, key, value):
    """Rebuild `world` in key order with `key` directly after `after`; returns nothing, mutates in place."""
    items = [(k, v) for k, v in world.items() if k != key]
    world.clear()
    for k, v in items:
        world[k] = v
        if k == after:
            world[key] = value
    if key not in world:
        world[key] = value


def apply(world, gwr_rows, outline_lv95):
    """Retrofit `world` in place; returns the counts per class."""
    frame = Frame(world["origin"]["lat"], world["origin"]["lon"])
    swiss = _outline_to_game(outline_lv95, frame)
    pts = gwr_rows
    if pts:
        x, z = frame.lv95_to_game(np.array([r["E"] for r in pts], float), np.array([r["N"] for r in pts], float))
        gwr_xz = [(float(a), float(b), r.get("year"), r.get("period")) for a, b, r in zip(x, z, pts)]
    else:
        gwr_xz = []
    verdicts = classify(world["buildings"], gwr_xz, swiss)
    counts = {"old": 0, "modern": 0, "de": 0}
    for b in world["buildings"]:
        v = verdicts[b["id"]]
        counts[v] += 1
        if v == "modern":
            b["modern"] = True
        else:
            b.pop("modern", None)
    if SOURCE_LINE not in world["sources"]:
        world["sources"].append(SOURCE_LINE)
    _insert_after(world, "sources", "era", {**world.get("era", {}), "year": 1952})
    return counts


def _load_outline(path):
    return shape(json.loads(Path(path).read_text(encoding="utf-8"))["geometry"])


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    ap.add_argument("--gwr", required=True, type=Path, help="the cached GWR extract (gwr_ch.py fetch)")
    ap.add_argument("--outline", type=Path, default=HERE / "ch_outline.geojson")
    a = ap.parse_args(argv)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    rows = json.loads(a.gwr.read_text(encoding="utf-8"))["rows"]
    counts = apply(world, rows, _load_outline(a.outline))
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"era_1952: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
