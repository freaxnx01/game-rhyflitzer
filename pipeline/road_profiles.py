"""#1152: a smooth height profile per drivable road, from the 2 m terrain along its axis.

Each eligible road gets `zp`: heights in game metres (absolute minus the terrain's base) every PROFILE_STEP m of arc
length along `pts`, the last at the road's full length, rounded to 0.01 m. Source per point: swissALTI3D 2 m tiles,
LGL DGM1 only if the .mmh was built with it, else the .mmh; a point more than GUARD m off the .mmh takes the .mmh.
Smoothed with a Gaussian by class, then pinned at shared ends, T-joins and at-grade crossings in class-rank order.

Retrofit (idempotent, like cap_ridges.py; a CI runner has no OSM extract):
    python road_profiles.py --world ../data/world_hochrhein.json --mmh ../data/terrain_hochrhein.mmh --cache cache

Licence: swissALTI3D (c) swisstopo.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
import shapely
from pyproj import CRS, Transformer
from scipy.ndimage import gaussian_filter1d

import mmh
import terrain
import world_roads

PROFILE_STEP = 4.0      # m between stored stations (the game's ribbon resamples at 4 m too)
SAMPLE_STEP = 2.0       # m between terrain samples (the swissALTI3D grid)
GUARD = 5.0             # m: a sample this far off the .mmh is a cliff/seam artefact, the .mmh wins
JOIN = 0.5              # m: an end this close to another road joins it
FADE = 30.0             # m: how far a pin's correction reaches
SIGMA_FAST, SIGMA_MAIN, SIGMA_MINOR = 15.0, 8.0, 4.0
FAST = {"motorway", "trunk"}
RANK = ("motorway", "trunk", "motorway_link", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
        "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "pedestrian", "service")
SOURCE = "Road heights: swissALTI3D © swisstopo"


def eligible(road) -> bool:
    return not road.get("bridge") and (road["cls"] in world_roads.DRIVE or bool(road.get("trail")))


def sigma(road) -> float:
    if road.get("trail"):
        return SIGMA_MINOR
    if road["cls"] in FAST:
        return SIGMA_FAST
    return SIGMA_MAIN if road["cls"] in world_roads.MAIN else SIGMA_MINOR


def rank(road) -> int:
    return RANK.index(road["cls"]) if road["cls"] in RANK and not road.get("trail") else len(RANK)


def station_ts(length: float) -> np.ndarray:
    n = int(math.floor(length / PROFILE_STEP + 1e-9))
    ts = [k * PROFILE_STEP for k in range(n + 1)]
    if length - ts[-1] > 1e-6:
        ts.append(length)
    return np.array(ts, dtype=float)


def _line(pts) -> shapely.LineString:
    """The polyline without consecutive repeats (same length as the game's polylineLength)."""
    out = [tuple(pts[0])]
    for p in pts[1:]:
        if tuple(p) != out[-1]:
            out.append(tuple(p))
    return shapely.LineString(out)


def _along(line, ts) -> np.ndarray:
    """Points at arc lengths ts; before 0 and past the end along the first / last segment's direction."""
    c, L = np.asarray(line.coords), line.length
    pts = shapely.get_coordinates(shapely.line_interpolate_point(line, np.clip(ts, 0.0, L)))
    d0 = (c[1] - c[0]) / np.linalg.norm(c[1] - c[0]); d1 = (c[-1] - c[-2]) / np.linalg.norm(c[-1] - c[-2])
    pts[ts < 0] = c[0] + np.outer(ts[ts < 0], d0)
    pts[ts > L] = c[-1] + np.outer(ts[ts > L] - L, d1)
    return pts


def smooth_all(roads, sample) -> list[np.ndarray]:
    """Station heights per road: the source every SAMPLE_STEP m, extended 3 sigma past both ends, Gaussian-smoothed.
    One batched sample() call for all roads."""
    plans = []
    for r in roads:
        line, sig = _line(r["pts"]), sigma(r)
        ts = np.arange(-3 * sig, line.length + 3 * sig + SAMPLE_STEP / 2, SAMPLE_STEP)
        plans.append((line, sig, ts, _along(line, ts)))
    allp = np.concatenate([p for *_, p in plans]) if plans else np.zeros((0, 2))
    h = np.asarray(sample(allp[:, 0], allp[:, 1]), dtype=float)
    out, k = [], 0
    for line, sig, ts, p in plans:
        sm = gaussian_filter1d(h[k:k + len(p)], sig / SAMPLE_STEP, mode="nearest")
        out.append(np.interp(station_ts(line.length), ts, sm))
        k += len(p)
    return out


def _hats(ts, pins) -> np.ndarray:
    """Sum of d * max(0, 1 - |t - tk| / Fk), Fk = min(FADE, gap to the neighbouring pins): every pin is met exactly."""
    out = np.zeros_like(ts)
    for k, (tk, d) in enumerate(pins):
        gaps = [abs(tk - pins[j][0]) for j in (k - 1, k + 1) if 0 <= j < len(pins)]
        f = min([FADE] + gaps)
        out += d * np.clip(1.0 - np.abs(ts - tk) / f, 0.0, None)
    return out


def _contacts(line, other):
    """(point on line) where `other` touches or crosses `line`: line ends within JOIN of other, and the intersection
    points (an overlap counts by its end points)."""
    out = []
    for end in (line.coords[0], line.coords[-1]):
        p = shapely.Point(end)
        if other.distance(p) <= JOIN:
            out.append(p)
    for g in getattr(line.intersection(other), "geoms", [line.intersection(other)]):
        if not g.is_empty:
            out += [shapely.Point(c) for c in (g.coords if g.geom_type == "Point" else (g.coords[0], g.coords[-1]))]
    return out


def pin(roads, smoothed) -> list[np.ndarray]:
    """Rank order (motorway first, trails last, ties by id): a road takes the finished roads' heights wherever it
    touches or crosses them at the same layer, as hat corrections over FADE m."""
    lines = [_line(r["pts"]) for r in roads]
    tree = shapely.STRtree(lines)
    order = sorted(range(len(roads)), key=lambda i: (rank(roads[i]), roads[i]["id"], i))
    out: dict[int, np.ndarray] = {}
    for i in order:
        line, ts = lines[i], station_ts(lines[i].length)
        pins = []
        for j in tree.query(line.buffer(JOIN)):
            j = int(j)
            if j not in out or roads[j].get("layer", 0) != roads[i].get("layer", 0):
                continue
            tj = station_ts(lines[j].length)
            for p in _contacts(line, lines[j]):
                t = line.project(p)
                target = float(np.interp(lines[j].project(p), tj, out[j]))
                pins.append((t, target - float(np.interp(t, ts, smoothed[i]))))
        uniq = []
        for t, d in sorted(pins):
            if not uniq or t - uniq[-1][0] > JOIN:
                uniq.append((t, d))
        out[i] = smoothed[i] + _hats(ts, uniq)
    return [out[i] for i in range(len(roads))]


def _with_zp(road, zp) -> None:
    items = [(k, v) for k, v in road.items() if k != "zp"]
    road.clear()
    for k, v in items:
        road[k] = v
        if k == "pts" and zp is not None:
            road["zp"] = zp


def apply_world(world, sample, base) -> int:
    """Set `zp` on every eligible road (right after `pts`), drop it from the rest, add the sources line. Idempotent."""
    roads = [r for r in world["roads"] if eligible(r)]
    for r in world["roads"]:
        if not eligible(r):
            _with_zp(r, None)
    for r, h in zip(roads, pin(roads, smooth_all(roads, sample))):
        _with_zp(r, [round(float(v) - base, 2) for v in h])
    if roads and SOURCE not in world["sources"]:
        world["sources"].append(SOURCE)
    return len(roads)


class Raster:
    """One elevation raster in memory. sample(E, N) in LV95 -> bilinear heights between pixel centres, clamped to the
    raster's own edge (no seam between tiles), NaN outside it or at nodata."""

    def __init__(self, ds, crs):
        self.a = ds.read(1).astype(np.float32)
        if ds.nodata is not None and not np.isnan(ds.nodata):
            self.a[self.a == ds.nodata] = np.nan
        self.inv = ~ds.transform
        src = None if crs is None else CRS.from_user_input(crs.to_wkt() if hasattr(crs, "to_wkt") else crs)
        self.to = None if src is None or src.equals(terrain.LV95) else Transformer.from_crs(terrain.LV95, src, always_xy=True)

    def sample(self, E, N):
        E, N = np.asarray(E, float), np.asarray(N, float)
        if self.to is not None:
            E, N = self.to.transform(E, N)
        c, r = self.inv * (E, N)
        c, r = np.asarray(c) - 0.5, np.asarray(r) - 0.5
        h, w = self.a.shape
        ok = (c >= -0.5) & (r >= -0.5) & (c <= w - 0.5) & (r <= h - 0.5)
        out = np.full(c.shape, np.nan)
        i = np.clip(np.floor(c[ok]).astype(int), 0, w - 2); j = np.clip(np.floor(r[ok]).astype(int), 0, h - 2)
        tx = np.clip(c[ok] - i, 0, 1); tz = np.clip(r[ok] - j, 0, 1); a = self.a
        out[ok] = (a[j, i] * (1 - tx) + a[j, i + 1] * tx) * (1 - tz) + (a[j + 1, i] * (1 - tx) + a[j + 1, i + 1] * tx) * tz
        return out


def _mmh_abs(hdr, heights, x, z):
    """The .mmh bilinear (as the game's realH) plus its base: absolute heights."""
    fx, fz = (x - hdr["x0"]) / hdr["step"], (z - hdr["z0"]) / hdr["step"]
    i = np.clip(np.floor(fx).astype(int), 0, hdr["w"] - 2); j = np.clip(np.floor(fz).astype(int), 0, hdr["h"] - 2)
    tx, tz = np.clip(fx - i, 0, 1), np.clip(fz - j, 0, 1); H = heights
    v = (H[j, i] + (H[j, i + 1] - H[j, i]) * tx) * (1 - tz) + (H[j + 1, i] + (H[j + 1, i + 1] - H[j + 1, i]) * tx) * tz
    return v + hdr["base"]


class Sampler:
    """Absolute heights at game (x, z): the rasters in order, then the .mmh; a sample more than GUARD m off the .mmh
    takes the .mmh (the profile must sit on the terrain the game draws)."""

    def __init__(self, hdr, heights, e0, n0, rasters=()):
        self.hdr, self.heights, self.e0, self.n0, self.rasters = hdr, heights, e0, n0, list(rasters)

    def __call__(self, x, z):
        x, z = np.asarray(x, float), np.asarray(z, float)
        m = _mmh_abs(self.hdr, self.heights, x, z)
        E, N, h = self.e0 + x, self.n0 - z, np.full(x.shape, np.nan)
        for r in self.rasters:
            hole = np.isnan(h)
            if not hole.any():
                break
            h[hole] = r.sample(E[hole], N[hole])
        bad = np.isnan(h) | (np.abs(h - m) > GUARD)
        h[bad] = m[bad]
        return h


def sampler_for(world, hdr, heights, cache, dgm_dir=None) -> Sampler:
    """swissALTI3D 2 m tiles for the world's bbox (the terrain step's cache); DGM1 only if the .mmh lists it."""
    rasters = []
    for p in terrain.swiss_tiles(tuple(world["bbox"]), Path(cache) / "swissalti3d"):
        with rasterio.open(p) as ds:
            rasters.append(Raster(ds, ds.crs or terrain.LV95))
    if dgm_dir and any("DGM1" in s for s in hdr.get("sources", [])):
        for ds, crs in terrain.german_datasets(Path(dgm_dir)):
            rasters.append(Raster(ds, crs))
            ds.close()
    return Sampler(hdr, heights, world["origin"]["E"], world["origin"]["N"], rasters)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    ap.add_argument("--mmh", required=True, type=Path, help="the world's terrain (base, fallback heights)")
    ap.add_argument("--cache", type=Path, default=Path("cache"), help="swisstopo tile cache (swissalti3d/)")
    ap.add_argument("--dgm-dir", type=Path, default=None, help="LGL DGM1 folder; used only if the .mmh lists DGM1")
    a = ap.parse_args(argv)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    hdr, heights = mmh.read_mmh(a.mmh)
    n = apply_world(world, sampler_for(world, hdr, heights, a.cache, a.dgm_dir), hdr["base"])
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"road_profiles: {n} roads profiled in {a.world}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
