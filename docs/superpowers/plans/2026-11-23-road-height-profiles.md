# Smoothed road height profiles (#1152) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every drivable road carries a smooth height profile (`zp`) built by the pipeline from the 2 m terrain along
its axis; the game lays the road ribbon on it and fits the terrain beside the road to it (cut or fill), so roads stop
undulating.

**Architecture:** Pipeline: one module `pipeline/road_profiles.py` (sample → Gaussian smooth → pin at junctions in
class-rank order → `zp` on the road), used as an idempotent retrofit CLI for the two shipped worlds, from
`osm.build_world(profile_cache=…)` and from `region._world` (editor worlds). Game: pure helpers in `world.js`
(`profileAt`, `roadFitAt`, `yieldWeight`, `fitRoad`, `patchH`), wired in `index.html`: ribbons on the profile, a new
`FIT_CELLS` map of 4 m terrain patches beside profiled roads, yield zones around the existing 1 m patches.

**Tech Stack:** Python 3.12 (numpy, scipy, rasterio, shapely, pyproj; all in `pipeline/requirements.txt`), vanilla JS
ES modules, `node --test`, Python Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-road-height-profiles-design.md`

**Lands before #1151.** Do not touch bridge, underpass or deck code beyond what is written here.

## Global Constraints

- TDD: failing test first for every pure function. Match the dense one-line style of `index.html` / `world.js`;
  comments start `// #1152:` (JS) or carry `#1152` in the docstring (Python).
- Python runs from `pipeline/` with its venv: `cd pipeline && .venv/bin/python -m pytest tests/test_road_profiles.py -q`
  (create the venv from `requirements-dev.txt` if missing). Jobs that may use > 1 GB run under
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …` where `systemd-run` exists.
- Targeted tests only (the full Playwright suite takes ~2 h): the files named in each task, in the foreground, never
  `run_in_background`. Playwright on the GPU browser when reachable:
  `PW_CDP_ENDPOINT=http://192.168.1.120:9223 pipeline/.venv/bin/python -m pytest tests/<file> -q`; without it, plain
  `pytest` (SwiftShader).
- Commit and push the branch after every task, before any slow verification.
- No new packages, no `package.json`, no `PIPELINE_VERSION` bump. Declare every new top-level `const` in `index.html`
  above its first use (TDZ: `terrainH` runs during `buildCuts`).
- Commit subjects end with `(#1152)`. CHANGELOG in German with real umlauts; everything else in English.

## File structure

| File | Change |
|---|---|
| `pipeline/road_profiles.py` | **new**: eligibility, sampling, smoothing, pinning, `apply_world`, `Raster`, `Sampler`, `sampler_for`, CLI |
| `pipeline/tests/test_road_profiles.py` | **new**: unit tests (synthetic samplers and a tiny GeoTIFF) |
| `pipeline/osm.py` | `build_world(profile_cache=None, dgm_dir=None)`, `build --profiles CACHE --dgm-dir DIR` |
| `pipeline/region.py` | `_world` passes `profile_cache=cache` |
| `pipeline/tests/test_region.py`, `test_region_real.py` | stub `terrain.swiss_tiles`; assert `zp` |
| `world.js` | `PROFILE_STEP`, `profileAt`, `roadProfileH`, `splitKept`/`layoutFromWorld` carry `zpFrom`/`zpLen`, `FIT`, `fitMargin`, `fitRoad`, `roadFitAt`, `yieldWeight`, `patchH` |
| `tests/world.test.mjs` | node tests for the above |
| `index.html` | ribbon on profile, `buildFit`, `FIT_CELLS` in `terrainH` and the ground mesh, `?noprofile=1`, debug hooks |
| `tests/test_road_profiles.py` | **new** Playwright: AC 7-11 + cost measurement |
| `data/world_hochrhein.json`, `data/world_ehrendingen.json` | retrofit output |
| `docs/11-pipeline-osm.md`, `data/README.md`, `CHANGELOG.md` | docs |

---

## Task 1: Profile core (pure Python)

**Files:** Create `pipeline/road_profiles.py`, `pipeline/tests/test_road_profiles.py`.

**Interfaces:**
```python
PROFILE_STEP = 4.0; SAMPLE_STEP = 2.0; GUARD = 5.0; JOIN = 0.5; FADE = 30.0
def eligible(road) -> bool
def sigma(road) -> float
def rank(road) -> int
def station_ts(length: float) -> np.ndarray          # 0, 4, 8, ..., and `length` if not a multiple
def smooth_all(roads, sample) -> list[np.ndarray]    # one batched sample() call; station heights, absolute
def pin(roads, smoothed) -> list[np.ndarray]         # same order as roads
def apply_world(world, sample, base) -> int          # sets zp (after "pts"), drops stale zp, adds SOURCE; returns count
```
`sample(x, z)` takes numpy arrays of game coordinates and returns absolute heights.

- [ ] **Step 1: Write the failing tests** `pipeline/tests/test_road_profiles.py`:
```python
"""#1152: smooth road height profiles."""
import numpy as np
import pytest

import road_profiles as R


def road(i, pts, cls="residential", **kw):
    return {"id": i, "n": "", "cls": cls, "w": 5.5, "mark": "none", "bridge": False, "layer": 0, "pts": pts, **kw}


def test_eligible_drive_and_trails_only():
    assert R.eligible(road(1, [[0, 0], [10, 0]], "service"))
    assert R.eligible(road(2, [[0, 0], [10, 0]], "track", trail=True))
    assert not R.eligible(road(3, [[0, 0], [10, 0]], "footway", bridge=True))
    assert not R.eligible(road(4, [[0, 0], [10, 0]], "primary", bridge=True))
    assert not R.eligible(road(5, [[0, 0], [10, 0]], "cycleway"))


def test_sigma_and_rank_by_class():
    assert R.sigma(road(1, [], "motorway")) == 15.0 and R.sigma(road(1, [], "primary")) == 8.0
    assert R.sigma(road(1, [], "residential")) == 4.0 and R.sigma(road(1, [], "track", trail=True)) == 4.0
    assert R.rank(road(1, [], "motorway")) < R.rank(road(1, [], "primary")) < R.rank(road(1, [], "service"))
    assert R.rank(road(1, [], "track", trail=True)) > R.rank(road(1, [], "service"))


def test_station_ts_ends_at_length():
    assert R.station_ts(8.0).tolist() == [0.0, 4.0, 8.0]
    assert R.station_ts(9.5).tolist() == [0.0, 4.0, 8.0, 9.5]


def bumpy(x, z):
    """2 % grade along x with 0.5 m bumps every 6 m (a 4 m period would vanish at the 2 m sampling)."""
    x = np.asarray(x, float)
    return 300.0 + 0.02 * x + 0.5 * np.sin(2 * np.pi * x / 6.0)


def test_smoothing_follows_the_grade_and_removes_bumps_ends_included():
    r = road(1, [[0.0, 0.0], [200.0, 0.0]], "primary")
    (h,) = R.smooth_all([r], bumpy)
    ts = R.station_ts(200.0)
    assert np.max(np.abs(h - (300.0 + 0.02 * ts))) < 0.05


def test_shared_end_t_join_and_crossing_match():
    flat = lambda x, z: 300.0 + 0.0 * np.asarray(x, float) + 0.01 * np.asarray(z, float) ** 2 / 10   # differs by road
    main = road(1, [[-100.0, 0.0], [100.0, 0.0]], "primary")
    side = road(2, [[0.0, 0.0], [0.0, 80.0]], "residential")          # T-join on main's interior
    cont = road(3, [[100.0, 0.0], [180.0, 40.0]], "residential")      # shares main's end
    cross = road(4, [[50.0, -60.0], [50.0, 60.0]], "service")         # crosses main at grade
    roads = [side, main, cont, cross]
    sm = R.smooth_all(roads, flat)
    out = R.pin(roads, sm)
    at = lambda k, t: float(np.interp(t, R.station_ts(R._line(roads[k]["pts"]).length), out[k]))
    assert at(0, 0.0) == pytest.approx(at(1, 100.0), abs=0.01)       # side end on main at x = 0
    assert at(2, 0.0) == pytest.approx(at(1, 200.0), abs=0.01)       # shared end
    assert at(3, 60.0) == pytest.approx(at(1, 150.0), abs=0.05)      # crossing at (50, 0)


def test_main_road_is_not_bent_by_a_minor_one():
    slope = lambda x, z: 300.0 + 0.05 * np.asarray(z, float)
    main = road(1, [[-100.0, 0.0], [100.0, 0.0]], "primary")
    side = road(2, [[0.0, 0.0], [0.0, 80.0]], "residential")
    sm = R.smooth_all([main, side], slope)
    out = R.pin([main, side], sm)
    assert np.allclose(out[0], sm[0])


def test_apply_world_sets_zp_after_pts_drops_stale_and_is_idempotent():
    w = {"sources": ["x"], "roads": [road(1, [[0.0, 0.0], [10.0, 0.0]], "service", modern=True),
                                     road(2, [[0.0, 5.0], [10.0, 5.0]], "footway", bridge=True, zp=[1, 2])]}
    n = R.apply_world(w, lambda x, z: 290.0 + 0.0 * np.asarray(x, float), 284.0)
    assert n == 1
    a, b = w["roads"]
    assert list(a)[list(a).index("pts") + 1] == "zp" and list(a)[-1] == "modern"
    assert a["zp"] == [6.0, 6.0, 6.0, 6.0]                          # stations 0, 4, 8, 10
    assert "zp" not in b
    assert w["sources"] == ["x", R.SOURCE]
    before = repr(w)
    R.apply_world(w, lambda x, z: 290.0 + 0.0 * np.asarray(x, float), 284.0)
    assert repr(w) == before
```

- [ ] **Step 2: Run, expect failure** (`ModuleNotFoundError: road_profiles`):
`cd pipeline && .venv/bin/python -m pytest tests/test_road_profiles.py -q`

- [ ] **Step 3: Implement** `pipeline/road_profiles.py` (core part; Task 2 adds `Raster`, `Sampler`, `sampler_for`, CLI):
```python
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

import math

import numpy as np
import shapely
from scipy.ndimage import gaussian_filter1d

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
    """(point on line, point on other) where `other` touches or crosses `line`: line ends within JOIN of other, and
    the intersection points (an overlap counts by its end points)."""
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
```

- [ ] **Step 4: Run, expect pass**: `cd pipeline && .venv/bin/python -m pytest tests/test_road_profiles.py -q`.
  If `test_shared_end_t_join_and_crossing_match` is off by more than its tolerance at the crossing, check `_hats`'
  `F_k` (two pins closer than `JOIN` must have been merged), not the tolerance.
- [ ] **Step 5: Commit** `feat(pipeline): smooth road height profiles, core (#1152)` and push.

## Task 2: Height source and retrofit CLI

**Files:** Modify `pipeline/road_profiles.py`, `pipeline/tests/test_road_profiles.py`.

**Interfaces:**
```python
class Raster:                      # Raster(dataset, crs) -> .sample(E, N) LV95 arrays -> heights, NaN outside/nodata
class Sampler:                     # Sampler(hdr, heights, e0, n0, rasters=()) -> __call__(x, z) absolute heights
def sampler_for(world, hdr, heights, cache, dgm_dir=None) -> Sampler
def main(argv=None) -> int         # --world --mmh --cache --dgm-dir
```

- [ ] **Step 1: Failing tests** (append):
```python
import rasterio
from rasterio.transform import from_origin

import terrain


def mmh_flat(value, base=284.0):
    hdr = {"w": 11, "h": 11, "step": 8.0, "x0": -40.0, "z0": -40.0, "base": base, "sources": ["swissALTI3D (c) swisstopo"]}
    return hdr, np.full((11, 11), value - base, dtype=np.float32)


def tif(path, value, e0=2600000.0, n0=1200000.0, size=50, res=2.0):
    a = np.full((size, size), value, dtype=np.float32)
    a[0, 0] = -9999.0
    with rasterio.open(path, "w", driver="GTiff", height=size, width=size, count=1, dtype="float32", crs=terrain.LV95,
                       transform=from_origin(e0, n0, res, res), nodata=-9999.0) as ds:
        ds.write(a, 1)
    return path


def test_sampler_prefers_the_raster_and_falls_back_to_the_mmh(tmp_path):
    hdr, h = mmh_flat(290.0)
    with rasterio.open(tif(tmp_path / "a.tif", 291.0)) as ds:
        s = R.Sampler(hdr, h, 2600000.0, 1200000.0, [R.Raster(ds, ds.crs)])
    # game (x, z) = (E - e0, n0 - N): the tile spans x 0..100, z 0..100
    got = s(np.array([20.0, 20.0, -30.0]), np.array([20.0, 0.5, -30.0]))
    assert got[0] == pytest.approx(291.0)            # inside the tile
    assert got[2] == pytest.approx(290.0)            # outside: the .mmh
    assert got[1] == pytest.approx(291.0, abs=1e-3)  # edge row: clamped to the tile, not a seam


def test_guard_takes_the_mmh_for_a_cliff_sample(tmp_path):
    hdr, h = mmh_flat(290.0)
    with rasterio.open(tif(tmp_path / "a.tif", 296.0)) as ds:
        s = R.Sampler(hdr, h, 2600000.0, 1200000.0, [R.Raster(ds, ds.crs)])
    assert s(np.array([20.0]), np.array([20.0]))[0] == pytest.approx(290.0)


def test_dgm1_only_when_the_terrain_has_it(tmp_path, monkeypatch):
    monkeypatch.setattr(R.terrain, "swiss_tiles", lambda *a, **k: [])
    seen = []
    monkeypatch.setattr(R.terrain, "german_datasets", lambda d: seen.append(d) or [])
    w = {"bbox": [7.9, 47.5, 8.0, 47.6], "origin": {"E": 2600000.0, "N": 1200000.0}}
    hdr, h = mmh_flat(290.0)
    R.sampler_for(w, hdr, h, tmp_path, tmp_path)
    assert seen == []
    hdr["sources"].append("DGM1 Datengrundlage: LGL, www.lgl-bw.de (dl-de/by-2-0)")
    R.sampler_for(w, hdr, h, tmp_path, tmp_path)
    assert seen == [tmp_path]
```

- [ ] **Step 2: Run, expect failure** (`AttributeError: Sampler`).
- [ ] **Step 3: Implement** (append to `road_profiles.py`; add `import argparse, json`, `from pathlib import Path`,
  `import rasterio`, `from pyproj import CRS, Transformer`, `import mmh`, `import terrain` at the top):
```python
class Raster:
    """One elevation raster in memory. sample(E, N) in LV95 -> bilinear heights between pixel centres, clamped to the
    raster's own edge (no seam between tiles), NaN outside it or at nodata."""
    def __init__(self, ds, crs):
        self.a = ds.read(1).astype(np.float32)
        if ds.nodata is not None:
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
```
- [ ] **Step 4: Run, expect pass**: `cd pipeline && .venv/bin/python -m pytest tests/test_road_profiles.py -q`.
- [ ] **Step 5: Commit** `feat(pipeline): road profile height source and retrofit CLI (#1152)` and push.

## Task 3: Pipeline-wide wiring (C3)

**Files:** Modify `pipeline/osm.py`, `pipeline/region.py`, `pipeline/tests/test_region.py`,
`pipeline/tests/test_region_real.py`.

- [ ] **Step 1: Failing test** in `pipeline/tests/test_region.py`: in `build_synth`, next to the `terrain.sample`
  stub, add `mp.setattr(region.terrain, "swiss_tiles", lambda *a, **k: [])` (nothing is downloaded), and add:
```python
def test_drivable_roads_get_a_profile(built):
    _, world, _, _ = built
    import road_profiles
    roads = [r for r in world["roads"] if road_profiles.eligible(r)]
    assert roads and all("zp" in r for r in roads)
    assert all(0.0 <= v <= 18.1 for r in roads for v in r["zp"])   # flat 412.6 over base 412, the 430 corner at most
    assert all("zp" not in r for r in world["roads"] if not road_profiles.eligible(r))
    assert road_profiles.SOURCE in world["sources"]
```
  Add the same `swiss_tiles` stub in `test_region_real.py`'s fixture.
- [ ] **Step 2: Run, expect failure**: `cd pipeline && .venv/bin/python -m pytest tests/test_region.py -q -k profile`.
- [ ] **Step 3: Implement.**
  `osm.py`: `import road_profiles`; `build_world(..., fields_geojson=None, profile_cache=None, dgm_dir=None)`;
  assign the returned dict to `world`, then before returning:
```python
    if profile_cache:   # #1152: smooth road height profiles from the 2 m terrain (needs the .mmh: base and fallback)
        if hdr is None:
            raise ValueError("road profiles need the terrain (.mmh)")
        n = road_profiles.apply_world(world, road_profiles.sampler_for(world, hdr, heights, profile_cache, dgm_dir), hdr["base"])
        log(f"road profiles {n}")
    return world
```
  `build` subcommand: `b.add_argument("--profiles", default=None, metavar="CACHE", help="#1152: smooth road height
  profiles from swissALTI3D 2 m tiles in CACHE/swissalti3d (needs --mmh)")` and `b.add_argument("--dgm-dir",
  default=None, help="LGL DGM1 folder, used for profiles only if the .mmh lists DGM1")`; `cmd_build` passes
  `profile_cache=a.profiles, dgm_dir=a.dgm_dir`.
  `region.py` `_world`: pass `profile_cache=cache` to `osm.build_world`.
- [ ] **Step 4: Run**: `cd pipeline && .venv/bin/python -m pytest tests/test_region.py tests/test_road_profiles.py
  tests/test_world_cli.py -q` (and `tests/test_region_real.py` where its extract exists) → pass. Then
  `cd service && ../pipeline/.venv/bin/python -m pytest -q` → pass (service tests stub `build_world`).
- [ ] **Step 5: Commit** `feat(pipeline): road profiles in osm.py build and editor worlds (#1152)` and push.

## Task 4: Game helpers in `world.js`

**Files:** Modify `world.js`, `tests/world.test.mjs`.

**Interfaces:**
```js
export const PROFILE_STEP = 4;
export function profileAt(zp, len, t)                  // linear between stations k*4 (k < n-1) and len (last)
export function roadProfileH(r, t)                     // profileAt(r.zp, r.zpLen, (r.zpFrom || 0) + t)
export const FIT = { bank: 2, maxBank: 12, eps: 0.01, ramp: 16 };
export function fitMargin(n, cell = MESH_CELL)         // cell / n * SQRT2 + 0.5
export function fitRoad(r, h0, margin)                 // { pts, hw, cum, h(t), outer }
export function roadFitAt(cands, x, z, m, margin)      // cands: iterable of { f, i } (segment i of fit road f) -> delta
export function yieldWeight(cells, G, x, z, ramp = FIT.ramp)  // 0 in/next to a yield cell, 1 beyond one more ramp
export function patchH(p, n, u, v)                     // height in an n x n patch at cell fractions u, v (mesh split)
```
`layoutFromWorld` sets `zpLen` (the original road's length) and `zpFrom` (0, or the piece start for `keep1952`
pieces) on every road with `zp`.

- [ ] **Step 1: Failing tests** (append to `tests/world.test.mjs`; import the new names in a new import line):
```js
import { PROFILE_STEP, profileAt, roadProfileH, FIT, fitMargin, fitRoad, roadFitAt, yieldWeight, patchH } from '../world.js';

test('#1152 profileAt: stations every 4 m, the last at the full length', () => {
  assert.equal(PROFILE_STEP, 4);
  const zp = [0, 4, 8, 9.5];                       // len 9.5: stations 0, 4, 8, 9.5
  assert.equal(profileAt(zp, 9.5, 2), 2);
  assert.equal(profileAt(zp, 9.5, 8.75), 8.75);
  assert.equal(profileAt(zp, 9.5, -3), 0);
  assert.equal(profileAt(zp, 9.5, 20), 9.5);
  assert.equal(profileAt([5], 0.5, 0.2), 5);
});

test('#1152 layoutFromWorld: a keep1952 piece reads its own stretch of the profile', () => {
  const w = { roads: [{ id: 1, cls: 'residential', w: 5.5, pts: [[0, 0], [20, 0]], zp: [0, 4, 8, 12, 16, 20], keep1952: [[8, 20]] }], junctions: [], water: [], buildings: [], rail: [] };
  const L = layoutFromWorld(w), kept = L.roads.find((r) => !r.modern);
  assert.equal(kept.zpFrom, 8); assert.equal(kept.zpLen, 20);
  assert.equal(roadProfileH(kept, 2), 10);
  const plain = layoutFromWorld({ ...w, roads: [{ ...w.roads[0], keep1952: undefined }] }).roads[0];
  assert.equal(plain.zpFrom, 0); assert.equal(plain.zpLen, 20);
  assert.equal(layoutFromWorld({ ...w, roads: [{ id: 2, cls: 'service', w: 4, pts: [[0, 0], [5, 0]] }] }).roads[0].zpLen, undefined);
});

const FLAT_ROAD = { pts: [[0, 0], [100, 0]], w: 6, zp: Array.from({ length: 26 }, () => 10), zpFrom: 0, zpLen: 100 };
const cands = (f) => f.pts.slice(0, -1).map((_, i) => ({ f, i }));

test('#1152 roadFitAt: profile within the margin, 1:2 bank, 0 beyond outer', () => {
  const m = 12, mg = fitMargin(4), f = fitRoad(FLAT_ROAD, () => m, mg);
  assert.ok(Math.abs(mg - (4 * Math.SQRT2 + 0.5)) < 1e-9);
  assert.equal(f.hw, 3);
  assert.ok(Math.abs(f.outer - (3 + mg + Math.min(FIT.bank * 2.5, FIT.maxBank))) < 1e-9);
  assert.equal(roadFitAt(cands(f), 50, 0, m, mg), -2);                       // cut to the profile on the axis
  assert.equal(roadFitAt(cands(f), 50, 3 + mg, m, mg), -2);                  // and to the margin's edge
  assert.ok(Math.abs(roadFitAt(cands(f), 50, 3 + mg + 2, m, mg) - -1) < 1e-9); // 1:2 bank: 1 m back up after 2 m
  assert.equal(roadFitAt(cands(f), 50, f.outer + 1, m, mg), 0);
  assert.equal(roadFitAt(cands(fitRoad(FLAT_ROAD, () => 9, mg)), 50, 0, 9, mg), 1);   // fill as well
});

test('#1152 roadFitAt: the change is capped so it reaches 0 at outer', () => {
  const mg = fitMargin(4), f = fitRoad(FLAT_ROAD, () => 40, mg), d = f.outer - 0.5;
  assert.ok(Math.abs(roadFitAt(cands(f), 50, d, 40, mg)) <= 0.5 / FIT.bank + 1e-9);
});

test('#1152 yieldWeight: 0 in and next to a yield cell, ramps to 1', () => {
  const G = { x0: 0, z0: 0, dx: 16, dz: 16, nx: 100, nz: 100 }, cells = new Set(['10,10']);
  assert.equal(yieldWeight(cells, G, 168, 168), 0);
  assert.equal(yieldWeight(cells, G, 176 + 15, 168), 0);       // the ring cell
  assert.ok(Math.abs(yieldWeight(cells, G, 176 + 16 + 8, 168) - 0.5) < 1e-9);
  assert.equal(yieldWeight(cells, G, 176 + 16 + 16, 168), 1);
  assert.equal(yieldWeight(new Set(), G, 5, 5), 1);
});

test('#1152 patchH: the mesh split of an n x n patch', () => {
  const p = new Float32Array(25).map((_, k) => k);             // n = 4, row-major (n + 1)^2
  assert.equal(patchH(p, 4, 0, 0), 0);
  assert.equal(patchH(p, 4, 1, 1), 24);
  assert.equal(patchH(p, 4, 0.125, 0), 0.5);
});
```
- [ ] **Step 2: Run, expect failure**: `node --test tests/world.test.mjs`.
- [ ] **Step 3: Implement** in `world.js`.
  `splitKept`: `const add = …` pushes `{ ...rest, pts, ...(r.zp ? { zpFrom: a, zpLen: total } : {}) }` (keep the
  `modern` flag as today). `layoutFromWorld`: after `flatMap(splitKept)`, a road with `zp` and no `zpLen` gets
  `zpFrom: 0, zpLen: polylineLength(r.pts)`. Next to the grade code (`world.js:525`):
```js
// #1152: a road's smooth height profile (zp, pipeline/road_profiles.py): heights every PROFILE_STEP m along the road, the
// last at its full length; a 1952 piece reads it from zpFrom on (splitKept), so zpLen is always the whole road's length
export const PROFILE_STEP = 4;
export function profileAt(zp, len, t) {
  const n = zp.length; if (n === 1 || t <= 0) return zp[0]; if (t >= len) return zp[n - 1];
  const k = Math.min(Math.floor(t / PROFILE_STEP), n - 2), s0 = k * PROFILE_STEP, s1 = k === n - 2 ? len : s0 + PROFILE_STEP;
  return zp[k] + (zp[k + 1] - zp[k]) * (t - s0) / ((s1 - s0) || 1);
}
export function roadProfileH(r, t) { return profileAt(r.zp, r.zpLen, (r.zpFrom || 0) + t); }
// #1152: the terrain beside a profiled road is fitted to it, #42's grade cut generalised to cut and fill: flat at the
// profile within hw + margin (margin = one patch sub-cell diagonal + 0.5, so no drawn triangle reaching the carriageway
// rises over it), then a 1:bank bank back to the mesh, the change capped so it is 0 at `outer`
export const FIT = { bank: 2, maxBank: 12, eps: 0.01, ramp: 16 };
export function fitMargin(n, cell = MESH_CELL) { return cell / n * Math.SQRT2 + 0.5; }
export function fitRoad(r, h0, margin) {
  const pts = dropRepeats(r.pts), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1], h = (t) => roadProfileH(r, t); let maxGap = 0;
  for (let t = 0; t <= len + 2; t += 4) { const s = Math.min(t, len), [x, z] = pointAtLength(pts, s); maxGap = Math.max(maxGap, Math.abs(h(s) - h0(x, z))); }
  const hw = r.w / 2; return { pts, hw, cum, h, outer: hw + margin + Math.min(FIT.bank * (maxGap + 0.5), FIT.maxBank) };
}
export function roadFitAt(cands, x, z, m, margin) {
  let best = null;
  for (const { f, i } of cands) {
    const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0, d = Math.hypot(x - ax - u * dx, z - az - u * dz);
    if (d >= f.outer) continue; const gap = d - (f.hw + margin);
    if (!best || gap < best.gap) best = { f, d, gap, t: f.cum[i] + u * Math.sqrt(L2) };
  }
  if (!best) return 0;
  const { f, d, gap, t } = best, y = f.h(t), slack = Math.max(0, gap) / FIT.bank, cap = (f.outer - d) / FIT.bank;
  const delta = Math.max(y - slack, Math.min(y + slack, m)) - m;
  return Math.max(-cap, Math.min(cap, delta));
}
// #1152: where the game already patches the terrain at 1 m (cuts, grades, banks, pads, the cave) profile and fit step back:
// 0 inside those cells and the ring around them, rising to 1 over `ramp` m, so a fitted cell never borders a 1 m one
export function yieldWeight(cells, G, x, z, ramp = FIT.ramp) {
  if (!cells.size) return 1;
  const ci = Math.floor((x - G.x0) / G.dx), cj = Math.floor((z - G.z0) / G.dz), r = 1 + Math.ceil(ramp / G.dx); let best = Infinity;
  for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
    if (!cells.has(i + ',' + j)) continue;
    const x0 = G.x0 + i * G.dx, z0 = G.z0 + j * G.dz, ex = Math.max(0, x0 - x, x - x0 - G.dx), ez = Math.max(0, z0 - z, z - z0 - G.dz);
    best = Math.min(best, Math.hypot(ex, ez));
  }
  return Math.max(0, Math.min(1, (best - G.dx) / ramp));
}
// height inside an n x n patch (row-major (n + 1)^2 heights) at cell fractions u, v, with the ground mesh's own split
export function patchH(p, n, u, v) {
  const sx = u * n, sz = v * n, a = Math.min(Math.floor(sx), n - 1), b = Math.min(Math.floor(sz), n - 1), W = n + 1;
  return triLerp(p[b * W + a], p[(b + 1) * W + a], p[(b + 1) * W + a + 1], p[b * W + a + 1], sx - a, sz - b);
}
```
  (`triLerp`, `dropRepeats`, `pointAtLength`, `MESH_CELL` are already in `world.js`; `patchH` sits below `triLerp`.)
- [ ] **Step 4: Run, expect pass**: `node --test tests/world.test.mjs tests/worlds.test.mjs`.
- [ ] **Step 5: Commit** `feat(world): road profile and terrain fit helpers (#1152)` and push.

## Task 5: Wire it into `index.html`

**Files:** Modify `index.html`.

- [ ] **Step 1: Imports.** Add `PROFILE_STEP, roadProfileH, FIT, fitMargin, fitRoad, roadFitAt, yieldWeight, patchH` to
  the big `./world.js` import (`index.html:1029`; `PROFILE_STEP` only if used).
- [ ] **Step 2: Declarations next to `CUT_CELLS`** (`index.html:1597`, above `terrainH`, so `terrainH` never meets a
  TDZ during `buildCuts`):
```js
// #1152: terrain fitted to the road profiles, FIT_N x FIT_N patches per 16 m cell (key 'i,j' -> heights, row-major (FIT_N+1)^2)
const NO_PROFILE = new URLSearchParams(location.search).get('noprofile') === '1';   // A/B for the cost measurement
const FIT_N = 4, FIT_MARGIN = fitMargin(FIT_N), FIT_CELLS = new Map(), FIT_GRID = makeGrid(32), FIT_ROADS = [], YIELD_CELLS = new Set();
const FIT_STATS = { roads: 0, cells: 0, triangles: 0, ms: 0 };
```
- [ ] **Step 3: `terrainH`** reads the fit after the cut patches: replace the body's patch lookup with
```js
  if ((CUT_CELLS.size || FIT_CELLS.size) && fx >= 0 && fz >= 0 && fx <= G.nx && fz <= G.nz) {
    const i = Math.min(Math.floor(fx), G.nx - 1), j = Math.min(Math.floor(fz), G.nz - 1), key = i + ',' + j, p = CUT_CELLS.get(key);
    if (p) return patchH(p, CUT_N, fx - i, fz - j);
    const q = FIT_CELLS.get(key); if (q) return patchH(q, FIT_N, fx - i, fz - j);
  }
  return meshH(x, z);
```
  (`patchH(p, CUT_N, …)` is the same arithmetic as the current inline `triLerp` code.)
- [ ] **Step 4: `buildFit` after `if (L) buildCuts();`** (`index.html:1735`):
```js
// #1152: every profiled road's fit, in FIT_N patches; cells the 1 m patches own (and the cave) yield
function profileWeight(x, z) { return yieldWeight(YIELD_CELLS, TGRID, x, z); }
function fitDelta(x, z) { const c = gridQuery(FIT_GRID, x, z, 0); if (!c.size) return 0; const w = profileWeight(x, z); return w ? w * roadFitAt(c, x, z, meshH(x, z), FIT_MARGIN) : 0; }
function buildFit() {
  const t0 = performance.now(), G = TGRID, W = FIT_N + 1, seen = new Set();
  for (const key of CUT_CELLS.keys()) YIELD_CELLS.add(key);
  if (HIDE) for (const c of HIDE.cuts) for (const [i, j] of patchCells(cutBounds(c, c.u), G)) YIELD_CELLS.add(i + ',' + j);
  for (const r of L.roads) { if (!r.zp || r.bridge) continue; const f = fitRoad(r, meshH, FIT_MARGIN); FIT_ROADS.push(f); for (let i = 0; i < f.pts.length - 1; i++) gridAddSegment(FIT_GRID, ...f.pts[i], ...f.pts[i + 1], f.outer, { f, i }); }
  for (const f of FIT_ROADS) for (const [i, j] of gradeCells(f, G)) {   // gradeCells reads only pts and outer
    const key = i + ',' + j; if (seen.has(key) || YIELD_CELLS.has(key)) continue; seen.add(key);
    const p = new Float32Array(W * W); let moved = false;
    for (let b = 0; b < W; b++) for (let k = 0; k < W; k++) { const x = G.x0 + (i + k / FIT_N) * G.dx, z = G.z0 + (j + b / FIT_N) * G.dz, d = fitDelta(x, z); p[b * W + k] = meshH(x, z) + d; if (Math.abs(d) > FIT.eps) moved = true; }
    if (moved) FIT_CELLS.set(key, p);
  }
  Object.assign(FIT_STATS, { roads: FIT_ROADS.length, cells: FIT_CELLS.size, triangles: FIT_CELLS.size * (2 * FIT_N * FIT_N - 2), ms: performance.now() - t0 });
}
if (L && !NO_PROFILE) buildFit();
```
- [ ] **Step 5: Ground mesh** (`index.html:2659-2681`): the coarse-index filter drops `FIT_CELLS` too
  (`if (CUT_CELLS.size || FIT_CELLS.size) { … if (!CUT_CELLS.has(key) && !FIT_CELLS.has(key)) keep.push(…) }`), and
  after the `CUT_CELLS` loop:
```js
  for (const key of FIT_CELLS.keys()) {   // #1152: the fitted cells, FIT_N x FIT_N, heights from terrainH (the fit)
    const [i, j] = key.split(',').map(Number), p = new THREE.PlaneGeometry(TGRID.dx, TGRID.dz, FIT_N, FIT_N);
    p.rotateX(-Math.PI / 2); p.translate(TGRID.x0 + (i + 0.5) * TGRID.dx, 0, TGRID.z0 + (j + 0.5) * TGRID.dz);
    const q = p.attributes.position, uv = p.attributes.uv, cArr = new Float32Array(q.count * 3);
    for (let v = 0; v < q.count; v++) { const x = q.getX(v), z = q.getZ(v), { h, c } = groundVertex(x, z); q.setY(v, h); uv.setXY(v, (x - TGRID.x0) / 20, (TGRID.z0 + GD - z) / 20); cArr[v * 3] = c.r; cArr[v * 3 + 1] = c.g; cArr[v * 3 + 2] = c.b; }
    p.setAttribute('color', new THREE.BufferAttribute(cArr, 3)); p.computeVertexNormals(); parts.grass.push(p);
  }
```
  (Same body as the `CUT_CELLS` loop: extract a shared `patchGeo(i, j, n)` helper used by both instead of copying.)
- [ ] **Step 6: Ribbons on the profile.** `ribbonGeo(src, hw, y, tileLen = 8, onTerrain = false, hFn = null, liftOn = null)`:
  the lift uses `liftOn` when given: `const liftAt = liftOn ? (p) => liftOn(p) + y : hAt;` and
  `ribbonLift(left, right, hl, hr, liftAt)`. `ribbon(...)` forwards `hFn, liftOn` as two new trailing parameters.
  Every existing call is unchanged. Above the road loop (`index.html:2712`):
```js
// #1152: a profiled road's height at p: its profile at the nearest point, blended to the draped terrain in yield zones
function roadHeightFn(r) { const pts = dropRepeats(r.pts); return (p) => { const n = nearestOnPolyline(pts, p[0], p[1]), w = profileWeight(p[0], p[1]), y = roadProfileH(r, n.t); return w >= 1 ? y : w * y + (1 - w) * terrainH(p[0], p[1]); }; }
const groundAt = (p) => terrainH(p[0], p[1]);
```
  and in the loop pass `r.zp && L && !NO_PROFILE ? roadHeightFn(r) : null, r.zp && L && !NO_PROFILE ? groundAt : null`
  as the two new arguments of `ribbon(...)` (onTerrain stays `true`, so the strip is resampled at 4 m and lifted over
  `terrainH`).
- [ ] **Step 7: Debug hooks** next to `window.__mm.renderInfo` (`index.html:5967`):
```js
window.__mm.roadFit = () => ({ ...FIT_STATS, n: FIT_N, noProfile: NO_PROFILE });   // #1152: cost of the terrain fit
window.__mm.roadTop = (x, z) => roadTopH(x, z); window.__mm.roadSurf = (x, z) => roadSurfH(x, z); window.__mm.terrainAt = (x, z) => terrainH(x, z);
window.__mm.profileW = (x, z) => profileWeight(x, z); window.__mm.fitKeys = () => [...FIT_CELLS.keys()];
window.__mm.profiled = () => L ? L.roads.filter((r) => r.zp && !r.bridge).map((r) => ({ id: r.id, cls: r.cls, w: r.w, pts: r.pts, zp: r.zp, zpFrom: r.zpFrom || 0, zpLen: r.zpLen })) : [];
```
- [ ] **Step 8: Smoke check** (fast): `node --test tests/world.test.mjs` passes; serve with `python3 -m http.server`,
  load `index.html` once headless (any existing quick Playwright file that loads Hochrhein, e.g.
  `tests/test_world.py -k load` if present) and confirm an empty console. The shipped worlds have no `zp` yet, so
  nothing changes visually until Task 6.
- [ ] **Step 9: Commit** `feat(world): lay roads on their profile and fit the terrain (#1152)` and push.

## Task 6: Retrofit the shipped worlds (C3)

**Files:** Modify `data/world_hochrhein.json`, `data/world_ehrendingen.json`.

- [ ] **Step 1:** Downloads swissALTI3D 2 m tiles (about 100 tiles, ~1 MB each) into `pipeline/cache/swissalti3d`
  (git-ignored). From `pipeline/`:
```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 .venv/bin/python road_profiles.py \
  --world ../data/world_hochrhein.json --mmh ../data/terrain_hochrhein.mmh --cache cache
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 .venv/bin/python road_profiles.py \
  --world ../data/world_ehrendingen.json --mmh ../data/terrain_ehrendingen.mmh --cache cache
```
  (Without `systemd-run`, e.g. on a CI runner, run the same command plainly.) Exit 137 = the 2 GB cap: report it, do
  not raise the cap.
- [ ] **Step 2: Verify** with a short script: only `zp` keys and one sources line differ from `git show HEAD:<file>`
  (load both, pop `zp` from every road and the new source, compare equal); size growth under 1 MB for Hochrhein;
  re-running the command leaves the file byte-identical. Report the profiled road counts.
- [ ] **Step 3: Commit** `data: road height profiles for Hochrhein and Ehrendingen (#1152)` and push.

## Task 7: Playwright acceptance and cost measurement

**Files:** Create `tests/test_road_profiles.py`.

- [ ] **Step 1: Write the test file** (helpers `run`/`ARGS` as in `tests/test_road_underpass.py`; one page load per
  test function, all checks inside one `page.evaluate`, so SwiftShader does not time out):
```python
"""#1152: roads lie on their smooth profile and the terrain is fitted to them. Slow (Playwright): run in the foreground."""
import statistics
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
DATA = ROOT / "data"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
pytestmark = pytest.mark.skipif(not (DATA / "world_hochrhein.json").exists(), reason="no world file")
PHONE = {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True}

CHECKS = """async () => {
  const W = await import('./world.js'), mm = window.__mm, out = { onProfile: [], wave: [], covered: 0, sampled: 0, crack: 0 };
  for (const r of mm.profiled()) {
    const len = W.polylineLength(r.pts), motorway = r.cls === 'motorway', hw = r.w / 2, ys = [];
    for (let t = 0; t <= len; t += 4) {
      const [x, z] = W.pointAtLength(r.pts, t); if (mm.profileW(x, z) < 1) { ys.push(null); continue; }
      const y = W.profileAt(r.zp, r.zpLen, r.zpFrom + t), top = mm.roadTop(x, z); out.onProfile.push(Math.abs(top - (y + 0.04))); ys.push(top);
      if (t % 20 === 0) { const a = W.pointAtLength(r.pts, Math.min(len, t + 0.5)), dx = a[0] - x, dz = a[1] - z, l = Math.hypot(dx, dz) || 1;
        for (let s = -hw + 0.3; s <= hw - 0.3; s += 1) { const px = x - dz / l * s, pz = z + dx / l * s, rs = mm.roadSurf(px, pz); if (rs === -Infinity) continue; out.sampled++; if (mm.terrainAt(px, pz) > rs + 1e-3) out.covered++; } }
    }
    if (motorway) for (let k = 2; k < ys.length; k++) if (ys[k] !== null && ys[k - 1] !== null && ys[k - 2] !== null) out.wave.push(Math.abs(ys[k] - 2 * ys[k - 1] + ys[k - 2]));
  }
  const keys = mm.fitKeys(), G = 16, e = 1e-4;
  for (let n = 0; n < keys.length; n += 50) { const [i, j] = keys[n].split(',').map(Number);
    for (let s = 0; s <= 16; s += 1) for (const [x, z, ox, oz] of [[i, j + s / 16, 1, 0], [i + 1, j + s / 16, 1, 0], [i + s / 16, j, 0, 1], [i + s / 16, j + 1, 0, 1]]) {
      const bx = mm.gridX0 + x * G, bz = mm.gridZ0 + z * G, a = mm.terrainAt(bx - ox * e, bz - oz * e), b = mm.terrainAt(bx + ox * e, bz + oz * e); out.crack = Math.max(out.crack, Math.abs(a - b)); } }
  return { ...out, fit: mm.roadFit() };
}"""


def load(p, server, query="", throttle=None, ctx=None):
    b = p.chromium.launch(args=ARGS); c = b.new_context(**(ctx or {})); page = c.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    if throttle:
        c.new_cdp_session(page).send("Emulation.setCPUThrottlingRate", {"rate": throttle})
    page.goto(f"{server}/index.html{query}")
    page.wait_for_selector("#mmhstatus.real", timeout=600000)
    page.wait_for_function("() => window.__mm && window.__mm.roadFit && window.__mm.sim", timeout=600000)
    load_ms = page.evaluate("() => performance.now()")
    return b, page, errors, load_ms


def pct(v, q):
    v = sorted(v); return v[min(len(v) - 1, int(q * (len(v) - 1)))]


def test_roads_on_profile_smooth_uncovered_and_no_cracks(server):
    with sync_playwright() as p:
        b, page, errors, _ = load(p, server)
        r = page.evaluate(CHECKS); b.close()
    assert errors == [], errors
    assert r["fit"]["roads"] > 3000 and r["fit"]["cells"] > 0
    assert pct(r["onProfile"], 0.99) <= 0.05                       # AC 7
    assert pct(r["wave"], 0.99) <= 0.10                            # AC 8 (2nd difference over 8 m on the A3)
    assert r["covered"] == 0, f"{r['covered']} of {r['sampled']}"  # AC 9
    assert r["crack"] <= 0.01                                      # AC 10


def test_noprofile_is_the_old_drape(server):
    with sync_playwright() as p:
        b, page, errors, _ = load(p, server, "?noprofile=1")
        fit = page.evaluate("() => window.__mm.roadFit()"); b.close()
    assert errors == [] and fit["cells"] == 0 and fit["noProfile"]     # AC 11 (a world without zp takes this path)


def measure(p, server, query):
    b, page, errors, load_ms = load(p, server, query, throttle=4, ctx=PHONE)
    page.click("#startbtn", timeout=180000)
    start = page.evaluate("() => window.__mm.frameMs(120)")
    tris = page.evaluate("() => window.__mm.renderInfo().triangles")
    page.evaluate("() => window.__mm.place(A3_X, A3_Z)")               # see Step 2
    a3 = page.evaluate("() => window.__mm.frameMs(120)")
    fit = page.evaluate("() => window.__mm.roadFit()"); b.close()
    assert errors == [], errors
    return {"load_ms": load_ms, "start_ms": start, "a3_ms": a3, "tris": tris, **fit}


def test_cost_within_budget(server):
    with sync_playwright() as p:
        base, new = measure(p, server, "?noprofile=1"), measure(p, server, "")
    print("\n#1152 cost", {"noprofile": base, "profile": new})
    assert new["triangles"] <= 2_000_000
    assert new["load_ms"] - base["load_ms"] <= 3000 and new["load_ms"] <= 1.15 * base["load_ms"]
    assert new["start_ms"] <= 1.15 * base["start_ms"] and new["a3_ms"] <= 1.15 * base["a3_ms"]
```
- [ ] **Step 2: Fill the gaps in the sketch.** Expose `window.__mm.gridX0 = TGRID.x0; window.__mm.gridZ0 = TGRID.z0`
  with the Task 5 hooks. Replace `A3_X, A3_Z` with an A3 point: take the midpoint of the longest `motorway` road from
  `__mm.profiled()` and use the existing placement hook the other tests use to put the car there (see how
  `tests/test_road_underpass.py` / `tests/test_jump.py` place the car; use the same call).
  Measure load time as navigation start to the ready predicate (`performance.now()` at that point is exactly that).
- [ ] **Step 3: Run** the two fast tests first:
  `PW_CDP_ENDPOINT=http://192.168.1.120:9223 pipeline/.venv/bin/python -m pytest tests/test_road_profiles.py -q -k "profile and not cost" -s`.
  A failing AC 9 (`covered`) means the fit margin is too small or a cell was skipped: check `FIT_MARGIN` and the
  `moved` threshold, not the test. A failing AC 7 near junctions means two strips overlap there; restrict the AC 7
  sample to points where only one profiled road's strip covers the axis (`roadSurf` equals its own ribbon), and say so
  in the PR.
- [ ] **Step 4: Cost gate (C2).** Run `test_cost_within_budget -s` with `FIT_N = 4`, then once with `FIT_N = 8`.
  Keep `FIT_N = 8` only if it passes every budget; else keep 4. If `FIT_N = 4` fails a budget: **stop**, commit what
  exists, and report the measured table in the PR and the issue instead of shipping (do not loosen the budgets).
  Put the measured table (both runs) in the PR body.
- [ ] **Step 5: Commit** `test(world): road profile acceptance and cost (#1152)` and push.

## Task 8: Height goldens that move by design

**Files:** Possibly `tests/test_bridge_ends.py`, `tests/test_road_underpass.py`, `tests/test_jump.py`,
`tests/test_pontoon.py`, `tests/test_suedspange.py`, `tests/test_hideout.py`.

- [ ] **Step 1:** Run those six files (foreground, GPU browser). The Südspange (#42) and hideout sit in yield zones and
  should not change; road-underpass cuts yield too.
- [ ] **Step 2:** For each failure, show it is the profile: rerun the failing check with `?noprofile=1` added to the
  page URL; if it passes there, the value moved by design. Only then update the expected value, with a comment
  `# #1152: road on its profile` and the old value. A failure that also happens with `?noprofile=1` is a real
  regression: fix the code, not the test.
- [ ] **Step 3: Commit** `test: road-profile height goldens (#1152)` and push.

## Task 9: Docs and changelog

**Files:** `docs/11-pipeline-osm.md`, `data/README.md`, `CHANGELOG.md`.

- [ ] **Step 1:** `docs/11-pipeline-osm.md`: a **Road height profiles (#1152)** paragraph next to the other retrofit
  steps: what `zp` is (stations, base, rounding), eligibility, source order and guard, sigma per class, pinning,
  the CLI, `osm.py build --profiles`, that `region.build_world` always does it, and that gallery worlds need a re-queue
  (`service/README.md`). Add `zp` to the road key list of the world format section.
- [ ] **Step 2:** `data/README.md`: in the `world_hochrhein.json` and `world_ehrendingen.json` rows add "Road heights
  (`zp`): swissALTI3D © swisstopo", plus one sentence on `zp` below the table.
- [ ] **Step 3:** `CHANGELOG.md` under `## [Unreleased]` → `### Fixed` (create the heading if missing), newest first,
  timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:
  `` - `<timestamp>` **Strassen** wellen nicht mehr: jede Strasse hat jetzt ein eigenes, **glattes Höhenprofil** aus dem 2-m-Gelände von swisstopo, und das Gelände am Strassenrand ist daran angepasst. Am deutlichsten auf der **A3**. ``
- [ ] **Step 4: Commit** `docs: road height profiles (#1152)` and push.

## After merge (operator, not the implementing agent)

- Re-queue the pinned gallery worlds (`service/README.md`, "Rebuild gallery worlds after a pipeline fix").
- On a real phone: open Hochrhein with `?debug`, read the frame-rate line at the start view and on the A3, with and
  without `?noprofile=1`.
- Optional: re-run the A3 probe against swissTLM3D (the issue's comment numbers) and post the new median / 95 % /
  waviness.
