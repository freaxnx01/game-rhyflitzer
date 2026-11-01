# Black Forest and Jura backdrop (#593) Implementation Plan

**Goal:** from the Plattform Sisslerfeld deck the Hotzenwald ridge shows as a hazy silhouette on the northern horizon
(and the Jura, the Rhine valley and the Dinkelberg all round), drawn from a coarse, non-drivable height grid outside
the play area.
Spec: `docs/superpowers/specs/2026-11-01-black-forest-backdrop-design.md`.

**Architecture:** `pipeline/backdrop.py` writes `data/backdrop_hochrhein.mmh` (MMH1, 250 m grid, Copernicus DEM
GLO-30, play area = NaN hole with a rim matched to the play-area .mmh). The pure module `backdrop.js` turns it into an
indexed mesh sorted far-to-near. `index.html` draws it with `depthTest: false` right after the sky, scaled about the
camera by 0.08 so it fits inside the far plane, with its own haze in the shader. The fetch is never awaited.

**Files**
- Create: `pipeline/backdrop.py`, `pipeline/tests/test_backdrop.py`, `data/backdrop_hochrhein.mmh` (generated),
  `backdrop.js`, `tests/backdrop.test.mjs`, `tests/test_backdrop.py`.
- Modify: `regions.js`, `tests/regions.test.mjs`, `index.html`, `strings.js`, `about.js`, `tests/about.test.mjs`,
  `data/README.md`, `CREDITS.md`, `docs/08-pipeline-terrain.md`, `CHANGELOG.md`.

**Global constraints**
- The game lives at the repo root; JS tests in `tests/*.test.mjs` (`node --test`), Playwright tests in `tests/*.py`,
  pipeline tests in `pipeline/tests/` (`cd pipeline && python -m pytest tests/test_backdrop.py`).
- Do not touch scene fog, `STYLES`, the camera far plane (`index.html:2246`), `terrain.py`, or the play-area
  `data/terrain_hochrhein.mmh` / `data/world_hochrhein.json`. The German bank inside the play area stays flat (spec D1).
- Never weaken an existing test. `tests/test_fields.py` (#290/#506, roads above grass and fields) runs unchanged.
- Data work: on agent-dev wrap the pipeline run in
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`; on a CI runner run it directly. It reads about
  20 MB by HTTP range requests and needs well under 1 GB.
- Run only this plan's tests: `node --test tests/*.test.mjs`, then in the foreground
  `pytest tests/test_backdrop.py tests/test_fields.py tests/test_about.py -x`. Commit and push the branch before the
  Playwright run. No full Playwright suite.
- Copernicus notice, verbatim, wherever the full notice is required:
  `produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved`

---

## Task 1: pipeline grid, hole and heights (pure, TDD)

**Files:** create `pipeline/backdrop.py`, `pipeline/tests/test_backdrop.py`.

**Interfaces**
- `grid(play_hdr, step=250.0, pad=18000.0) -> dict` with `x0, z0, w, h, step, hole=[px0, pz0, px1, pz1]`.
- `hole_masks(g) -> (xs, zs, deep, rim)`; `deep`: inside the hole and all 8 neighbours inside; `rim`: inside, not deep.
- `heights(g, play_hdr, play_h, dem_at, base) -> float32 (h, w)`; `dem_at(X, Z)` takes game-frame arrays and returns
  metres a.s.l.; deep = NaN, rim = play-area .mmh sample, rest = DEM - base.
- `header(g, play_hdr, out, bbox, sources) -> dict`.

- [ ] **Step 1: Write the failing test** `pipeline/tests/test_backdrop.py`:

```python
"""#593: the horizon backdrop grid around the play area."""
import math

import numpy as np
import pytest

import backdrop
import mmh

PLAY = {"x0": -400.0, "z0": -300.0, "w": 101, "h": 76, "step": 8.0, "base": 284.0,
        "origin": {"lat": 47.5506, "lon": 7.9671}}          # play extent x -400..400, z -300..300


def flat_play(v=5.0):
    return np.full((PLAY["h"], PLAY["w"]), v, np.float32)


def test_grid_covers_play_area_plus_pad_on_whole_steps():
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    assert g["hole"] == [-400.0, -300.0, 400.0, 300.0]
    assert g["x0"] % 250 == 0 and g["z0"] % 250 == 0
    assert g["x0"] <= -1400 and g["z0"] <= -1300
    assert g["x0"] + (g["w"] - 1) * 250 >= 1400 and g["z0"] + (g["h"] - 1) * 250 >= 1300


def test_deep_hole_is_nan_rim_takes_play_height_outside_takes_dem():
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    out = backdrop.heights(g, PLAY, flat_play(5.0), lambda X, Z: np.full(X.shape, 700.0), base=284.0)
    xs, zs, deep, rim = backdrop.hole_masks(g)
    assert out.dtype == np.float32 and out.shape == (g["h"], g["w"])
    assert deep.any() and np.isnan(out[deep]).all()
    assert rim.any() and np.allclose(out[rim], 5.0)
    outside = ~(deep | rim)
    assert np.allclose(out[outside], 700.0 - 284.0)


def test_every_rim_sample_touches_an_outside_sample():
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    _, _, deep, rim = backdrop.hole_masks(g)
    outside = ~(deep | rim)
    for j, i in zip(*np.nonzero(rim)):
        assert outside[max(j - 1, 0):j + 2, max(i - 1, 0):i + 2].any()


def test_header_marks_the_backdrop_and_carries_sources():
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    out = backdrop.heights(g, PLAY, flat_play(), lambda X, Z: 284.0 + X * 0.01, base=284.0)
    hdr = backdrop.header(g, PLAY, out, [7.8, 47.4, 8.1, 47.7], [backdrop.SOURCE])
    assert hdr["kind"] == "backdrop" and hdr["hole"] == g["hole"] and hdr["base"] == 284.0
    assert hdr["w"] == g["w"] and hdr["h"] == g["h"] and hdr["step"] == 250.0
    assert math.isfinite(hdr["min"]) and math.isfinite(hdr["max"]) and hdr["min"] < hdr["max"]
    assert "Copernicus" in hdr["sources"][0]


def test_written_file_round_trips(tmp_path):
    g = backdrop.grid(PLAY, step=250.0, pad=1000.0)
    out = backdrop.heights(g, PLAY, flat_play(), lambda X, Z: np.full(X.shape, 600.0), base=284.0)
    p = tmp_path / "b.mmh"
    mmh.write_mmh(p, backdrop.header(g, PLAY, out, [0, 0, 1, 1], [backdrop.SOURCE]), out)
    hdr, h = mmh.read_mmh(p)
    assert hdr["kind"] == "backdrop"
    assert np.array_equal(np.isnan(h), np.isnan(out))
```

- [ ] **Step 2: Run it, expect failure** — `cd pipeline && python -m pytest tests/test_backdrop.py -x` → `ModuleNotFoundError: backdrop`.

- [ ] **Step 3: Implement** `pipeline/backdrop.py` (the Copernicus reader comes in Task 2; keep functions small):

```python
#!/usr/bin/env python3
"""Map Madness pipeline: the horizon backdrop (#593).

A coarse height grid around the play area -- Hotzenwald, Dinkelberg, Jura, the Rhine valley -- that the game draws
as a hazy, non-drivable silhouette behind the world. Same MMH1 format as terrain.py; extra header fields
`kind: "backdrop"` and `hole` (the play-area extent [x0, z0, x1, z1] in game metres).

Source: Copernicus DEM GLO-30 (anonymous COG range reads from the AWS Open Data bucket).
Licence notice (adapted data): produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence
and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

    python backdrop.py --terrain ../data/terrain_hochrhein.mmh --out ../data/backdrop_hochrhein.mmh
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import mmh

STEP = 250.0
PAD = 18000.0
SOURCE = "Copernicus DEM GLO-30 (c) DLR e.V. 2010-2014, Airbus Defence and Space GmbH 2014-2018, EU/ESA"


def play_extent(play_hdr) -> list[float]:
    x1 = play_hdr["x0"] + (play_hdr["w"] - 1) * play_hdr["step"]
    z1 = play_hdr["z0"] + (play_hdr["h"] - 1) * play_hdr["step"]
    return [float(play_hdr["x0"]), float(play_hdr["z0"]), float(x1), float(z1)]


def grid(play_hdr, step: float = STEP, pad: float = PAD) -> dict:
    hx0, hz0, hx1, hz1 = play_extent(play_hdr)
    x0 = math.floor((hx0 - pad) / step) * step
    z0 = math.floor((hz0 - pad) / step) * step
    x1 = math.ceil((hx1 + pad) / step) * step
    z1 = math.ceil((hz1 + pad) / step) * step
    return {"x0": float(x0), "z0": float(z0), "w": int(round((x1 - x0) / step)) + 1,
            "h": int(round((z1 - z0) / step)) + 1, "step": float(step), "hole": [hx0, hz0, hx1, hz1]}


def hole_masks(g):
    xs = g["x0"] + np.arange(g["w"]) * g["step"]
    zs = g["z0"] + np.arange(g["h"]) * g["step"]
    hx0, hz0, hx1, hz1 = g["hole"]
    inside = ((zs[:, None] >= hz0) & (zs[:, None] <= hz1)) & ((xs[None, :] >= hx0) & (xs[None, :] <= hx1))
    padded = np.pad(inside, 1, constant_values=False)
    deep = inside.copy()
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            deep &= padded[1 + dj:1 + dj + inside.shape[0], 1 + di:1 + di + inside.shape[1]]
    return xs, zs, deep, inside & ~deep


def heights(g, play_hdr, play_h, dem_at, base: float) -> np.ndarray:
    xs, zs, deep, rim = hole_masks(g)
    X, Z = np.meshgrid(xs, zs)
    out = np.asarray(dem_at(X, Z), dtype=np.float64) - base
    for j, i in zip(*np.nonzero(rim)):
        out[j, i] = mmh.sample(play_hdr, play_h, float(X[j, i]), float(Z[j, i]))
    out[deep] = np.nan
    return out.astype(np.float32)


def header(g, play_hdr, out, bbox, sources) -> dict:
    return {"w": g["w"], "h": g["h"], "step": g["step"], "x0": g["x0"], "z0": g["z0"],
            "origin": play_hdr["origin"], "base": play_hdr["base"],
            "min": float(np.nanmin(out)), "max": float(np.nanmax(out)), "bbox": [float(v) for v in bbox],
            "hole": g["hole"], "kind": "backdrop", "sources": list(sources)}
```

- [ ] **Step 4: Run** `cd pipeline && python -m pytest tests/test_backdrop.py -x` → all pass.
- [ ] **Step 5: Commit** `feat(pipeline): backdrop grid around the play area (#593)`.

## Task 2: Copernicus reader, CLI, generate the data file

**Files:** modify `pipeline/backdrop.py`, `pipeline/tests/test_backdrop.py`; create `data/backdrop_hochrhein.mmh`.

**Interfaces**
- `copernicus_tiles(w, s, e, n) -> list[(name, lon0, lat0)]`, names like `N47_00_E007_00`.
- `copernicus_dem(frame, g, cache: Path) -> dem_at(X, Z)` (reads overview level 0 = 2", box-filters to the 250 m
  footprint, bilinear sampling).
- `main(argv=None)`.

- [ ] **Step 1: Write the failing test** (append to `pipeline/tests/test_backdrop.py`; offline):

```python
def test_copernicus_tiles_cover_the_bbox():
    names = [t[0] for t in backdrop.copernicus_tiles(7.66, 47.33, 8.27, 47.74)]
    assert names == ["N47_00_E007_00", "N47_00_E008_00"]
    assert backdrop.copernicus_tiles(7.9, 46.9, 7.95, 47.1)[0][0] == "N46_00_E007_00"
    assert backdrop.COPERNICUS_URL.format(t="N47_00_E008_00").startswith("https://copernicus-dem-30m.s3.amazonaws.com/")


def test_fill_seams_closes_a_one_pixel_seam_and_refuses_a_missing_tile():
    m = np.arange(100, dtype=np.float32).reshape(10, 10); m[:, 5] = np.nan
    out = backdrop.fill_seams(m)
    assert not np.isnan(out).any() and out[3, 5] in (m[3, 4], m[3, 6])
    m[:, :5] = np.nan
    with pytest.raises(RuntimeError):
        backdrop.fill_seams(m)
```

- [ ] **Step 2: Run, expect failure** (`AttributeError: copernicus_tiles`).

- [ ] **Step 3: Implement** (append to `pipeline/backdrop.py`):

```python
COPERNICUS_URL = ("https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{t}_DEM/"
                  "Copernicus_DSM_COG_10_{t}_DEM.tif")
ARC2 = 1.0 / 1800.0          # overview level 0 of the 1" COGs: 2 arc seconds


def copernicus_tiles(w, s, e, n):
    out = []
    for lat in range(math.floor(s), math.floor(n) + 1):
        for lon in range(math.floor(w), math.floor(e) + 1):
            ns, ew = ("N" if lat >= 0 else "S"), ("E" if lon >= 0 else "W")
            out.append((f"{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00", lon, lat))
    return out


def lonlat_bbox(frame, g, margin=0.02):
    xs = [g["x0"], g["x0"] + (g["w"] - 1) * g["step"]]
    zs = [g["z0"], g["z0"] + (g["h"] - 1) * g["step"]]
    lon, lat = frame.game_to_lonlat(np.array([x for x in xs for _ in zs]), np.array([z for _ in xs for z in zs]))
    return (float(lon.min()) - margin, float(lat.min()) - margin, float(lon.max()) + margin, float(lat.max()) + margin)


def read_mosaic(bbox, cache: Path) -> np.ndarray:
    w, s, e, n = bbox
    path = Path(cache) / "copernicus" / f"glo30_2s_{w:.3f}_{s:.3f}_{e:.3f}_{n:.3f}.npy"
    if path.exists():
        return np.load(path)
    import rasterio
    from rasterio.windows import from_bounds
    rows, cols = int(math.ceil((n - s) / ARC2)), int(math.ceil((e - w) / ARC2))
    mosaic = np.full((rows, cols), np.nan, np.float32)
    for name, lon0, lat0 in copernicus_tiles(w, s, e, n):
        iw, is_, ie, in_ = max(w, lon0), max(s, lat0), min(e, lon0 + 1), min(n, lat0 + 1)
        with rasterio.open("/vsicurl/" + COPERNICUS_URL.format(t=name), overview_level=0) as ds:
            a = ds.read(1, window=from_bounds(iw, is_, ie, in_, ds.transform).round_offsets().round_lengths())
        r0, c0 = int(round((n - in_) / ARC2)), int(round((iw - w) / ARC2))
        a = a[:rows - r0, :cols - c0]
        mosaic[r0:r0 + a.shape[0], c0:c0 + a.shape[1]] = a
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, mosaic)
    return mosaic


def fill_seams(mosaic: np.ndarray) -> np.ndarray:
    """Tile windows are rounded to whole pixels, which can leave a 1-pixel seam; a missing tile is an error."""
    from scipy.ndimage import distance_transform_edt
    gaps = np.isnan(mosaic)
    if gaps.mean() > 0.01:
        raise RuntimeError(f"Copernicus mosaic is {gaps.mean():.1%} empty: a tile failed to read")
    if not gaps.any():
        return mosaic
    idx = distance_transform_edt(gaps, return_distances=False, return_indices=True)
    return mosaic[tuple(idx)]


def copernicus_dem(frame, g, cache: Path):
    from scipy.ndimage import map_coordinates, uniform_filter
    w, s, e, n = bbox = lonlat_bbox(frame, g)
    lat_m = 111_320.0 * ARC2
    lon_m = lat_m * math.cos(math.radians((s + n) / 2))
    mosaic = fill_seams(read_mosaic(bbox, cache))
    smooth = uniform_filter(mosaic, size=(max(1, round(g["step"] / lat_m)), max(1, round(g["step"] / lon_m))))

    def dem_at(X, Z):
        lon, lat = frame.game_to_lonlat(X, Z)
        return map_coordinates(smooth, [(n - np.asarray(lat)) / ARC2, (np.asarray(lon) - w) / ARC2], order=1, mode="nearest")
    return dem_at, bbox


def main(argv=None):
    from geo import Frame
    ap = argparse.ArgumentParser(description="horizon backdrop (#593) from Copernicus DEM GLO-30")
    ap.add_argument("--terrain", type=Path, default=Path("../data/terrain_hochrhein.mmh"))
    ap.add_argument("--out", type=Path, default=Path("../data/backdrop_hochrhein.mmh"))
    ap.add_argument("--step", type=float, default=STEP)
    ap.add_argument("--pad", type=float, default=PAD)
    ap.add_argument("--cache", type=Path, default=Path("cache"))
    a = ap.parse_args(argv)
    play_hdr, play_h = mmh.read_mmh(a.terrain)
    frame = Frame(play_hdr["origin"]["lat"], play_hdr["origin"]["lon"])
    g = grid(play_hdr, a.step, a.pad)
    dem_at, bbox = copernicus_dem(frame, g, a.cache)
    out = heights(g, play_hdr, play_h, dem_at, play_hdr["base"])
    mmh.write_mmh(a.out, header(g, play_hdr, out, bbox, [SOURCE]), out)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run** the pipeline tests (all of `tests/test_backdrop.py` pass), then generate the file:
  `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 .venv/bin/python backdrop.py`
  (CI runner: `python backdrop.py`). Expect `wrote ../data/backdrop_hochrhein.mmh (0.1 MB)`, about 183 × 178 samples,
  heights roughly -60 .. 1100 m above base. `cache/` is already git-ignored; check with `git status` that only the
  `.mmh` is new. If the bucket is unreachable, stop and report: do not substitute another DEM.
- [ ] **Step 5: Commit** `feat(data): horizon backdrop from Copernicus DEM GLO-30 (#593)` (code + `data/backdrop_hochrhein.mmh`).

## Task 3: `backdrop.js` mesh, haze, horizon (pure, TDD)

**Files:** create `backdrop.js`, `tests/backdrop.test.mjs`.

**Interfaces**
- `BACKDROP_SCALE = 0.08`, `CURVE_R`, `HAZE = { min: 0.45, max: 0.88, d0: 2000, len: 8000 }`, `TINT_STOPS`.
- `hazeAt(d)`, `curveDrop(d)`, `backdropVisible({ surface, underwater, cave })`.
- `heightAt(hdr, data, x, z)` bilinear, NaN outside the grid or next to the hole.
- `backdropMesh(hdr, data, rgbOf) -> { position, tint, index, tris }`; `rgbOf(hex) -> [r, g, b]`.
- `horizon(hdr, data, eye, azDeg) -> { elev, dist }` (degrees, metres; azimuth 0 = north = -z, clockwise).

- [ ] **Step 1: Write the failing test** `tests/backdrop.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { BACKDROP_SCALE, HAZE, hazeAt, curveDrop, backdropVisible, heightAt, backdropMesh, horizon } from '../backdrop.js';
import { parseMmh } from '../worlds.js';

const FILE = new URL('../data/backdrop_hochrhein.mmh', import.meta.url);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// 4 x 4 grid, 100 m steps, one NaN sample in the middle
const tiny = () => {
  const hdr = { w: 4, h: 4, step: 100, x0: 0, z0: 0, hole: [100, 100, 100, 100] };
  const data = new Float32Array(16).map((_, k) => k);
  data[5] = NaN;
  return { hdr, data };
};

test('hazeAt: floor up to 2 km, rises with distance, stays below max', () => {
  assert.equal(hazeAt(0), HAZE.min);
  assert.equal(hazeAt(2000), HAZE.min);
  assert.ok(Math.abs(hazeAt(3000) - 0.5) < 0.02);
  assert.ok(hazeAt(20000) > 0.8 && hazeAt(20000) < HAZE.max);
  assert.ok(hazeAt(9000) > hazeAt(5000));
});

test('curveDrop: about 6.8 m at 10 km (refraction k = 0.13)', () => {
  assert.ok(Math.abs(curveDrop(10000) - 6.83) < 0.05);
});

test('backdropVisible: surface only, never underwater or in the cave', () => {
  assert.equal(backdropVisible({ surface: true, underwater: false, cave: false }), true);
  assert.equal(backdropVisible({ surface: true, underwater: true, cave: false }), false);
  assert.equal(backdropVisible({ surface: true, underwater: false, cave: true }), false);
  assert.equal(backdropVisible({ surface: false, underwater: false, cave: false }), false);
});

test('heightAt: bilinear inside, NaN next to a hole sample and outside', () => {
  const { hdr, data } = tiny();
  assert.equal(heightAt(hdr, data, 250, 250), (10 + 11 + 14 + 15) / 4);
  assert.ok(Number.isNaN(heightAt(hdr, data, 50, 50)));
  assert.ok(Number.isNaN(heightAt(hdr, data, -10, 50)));
});

test('backdropMesh: skips quads touching NaN, faces up, far quads first', () => {
  const { hdr, data } = tiny();
  const m = backdropMesh(hdr, data, hex);
  assert.equal(m.tris, 2 * (9 - 4));
  assert.equal(m.index.length, m.tris * 3);
  for (const k of m.index) assert.notEqual(k, 5);
  const p = (k) => [m.position[k * 3], m.position[k * 3 + 1], m.position[k * 3 + 2]];
  const [a, b, c] = [p(m.index[0]), p(m.index[1]), p(m.index[2])];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  assert.ok(u[2] * v[0] - u[0] * v[2] > 0, 'normal y > 0');
  const r = (t) => { const q = [0, 1, 2].map((n) => p(m.index[t * 3 + n])); return Math.hypot((q[0][0] + q[1][0] + q[2][0]) / 3 - 100, (q[0][2] + q[1][2] + q[2][2]) / 3 - 100); };
  assert.ok(r(0) > r(m.tris - 1), 'triangle centroids: farthest from the hole centre first');
  assert.equal(m.tint.length, m.position.length);
});

test('shipped backdrop: small, Copernicus, under the triangle budget', { skip: !existsSync(FILE) }, () => {
  assert.ok(statSync(FILE).size <= 200_000);
  const { hdr, data } = parseMmh(readFileSync(FILE));
  assert.equal(hdr.kind, 'backdrop');
  assert.ok(hdr.sources.some((s) => s.includes('Copernicus')));
  const m = backdropMesh(hdr, data, hex);
  assert.ok(m.tris > 40_000 && m.tris <= 70_000, String(m.tris));
  // from any corner of the play area to any corner of the grid, scaled, stays inside the 4200 m far plane
  const [hx0, hz0, hx1, hz1] = hdr.hole, gx1 = hdr.x0 + (hdr.w - 1) * hdr.step, gz1 = hdr.z0 + (hdr.h - 1) * hdr.step;
  let far = 0;
  for (const [cx, cz] of [[hx0, hz0], [hx0, hz1], [hx1, hz0], [hx1, hz1]]) for (const [gx, gz] of [[hdr.x0, hdr.z0], [hdr.x0, gz1], [gx1, hdr.z0], [gx1, gz1]]) far = Math.max(far, Math.hypot(gx - cx, gz - cz));
  assert.ok(far * BACKDROP_SCALE < 4000, String(far));
});

test('shipped backdrop: the Hotzenwald ridge stands 3.5-6.5 deg over the deck, 2.8-6 km north', { skip: !existsSync(FILE) }, () => {
  const { hdr, data } = parseMmh(readFileSync(FILE));
  const eye = { x: 304.8, y: 47.6, z: 427.1 };   // Plattform deck eye, metres above base 284
  const best = [-15, -10, -5, 0, 5, 10, 15].map((az) => horizon(hdr, data, eye, az)).reduce((p, q) => (q.elev > p.elev ? q : p));
  assert.ok(best.elev >= 3.5 && best.elev <= 6.5, JSON.stringify(best));
  assert.ok(best.dist >= 2800 && best.dist <= 6000, JSON.stringify(best));
});
```

- [ ] **Step 2: Run, expect failure** — `node --test tests/backdrop.test.mjs` → cannot find `../backdrop.js`.

- [ ] **Step 3: Implement** `backdrop.js`:

```js
// backdrop.js (#593): the horizon backdrop -- Hotzenwald, Dinkelberg, Jura and the Rhine valley around the play
// area, from data/backdrop_<region>.mmh (pipeline/backdrop.py). Pure: no DOM, no three.js, so node --test imports it.

export const BACKDROP_SCALE = 0.08;               // drawn scaled about the camera: angles stay, 45 km fit inside far 4200 m
export const CURVE_R = 6371000 / (1 - 0.13);      // earth radius with standard refraction
export const HAZE = Object.freeze({ min: 0.45, max: 0.88, d0: 2000, len: 8000 });
// the ground palette (index.html groundCol: lo, mid, hi) and a dark Black Forest green for the high ground
export const TINT_STOPS = Object.freeze([[0, '#6f8a4a'], [120, '#5d7a40'], [350, '#3f5a35'], [800, '#34482e']]);

export const hazeAt = (d) => HAZE.min + (HAZE.max - HAZE.min) * (1 - Math.exp(-Math.max(d - HAZE.d0, 0) / HAZE.len));
export const curveDrop = (d) => d * d / (2 * CURVE_R);
export const backdropVisible = (s) => s.surface && !s.underwater && !s.cave;

export function heightAt(hdr, data, x, z) {
  const fx = (x - hdr.x0) / hdr.step, fz = (z - hdr.z0) / hdr.step;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= hdr.w - 1 || j >= hdr.h - 1) return NaN;
  const tx = fx - i, tz = fz - j, k = j * hdr.w + i;
  const a = data[k], b = data[k + 1], c = data[k + hdr.w], d = data[k + hdr.w + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;   // NaN propagates
}

function tintAt(stops, y) {
  let n = 1;
  while (n < stops.length - 1 && y > stops[n][0]) n++;
  const [h0, c0] = stops[n - 1], [h1, c1] = stops[n];
  const t = Math.min(1, Math.max(0, (y - h0) / (h1 - h0)));
  return c0.map((v, q) => v + (c1[q] - v) * t);
}

function vertices(hdr, data, stops) {
  const n = hdr.w * hdr.h, position = new Float32Array(n * 3), tint = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const y = Number.isFinite(data[k]) ? data[k] : 0;
    position.set([hdr.x0 + (k % hdr.w) * hdr.step, y, hdr.z0 + Math.floor(k / hdr.w) * hdr.step], k * 3);
    tint.set(tintAt(stops, y), k * 3);
  }
  return { position, tint };
}

function sortedQuads(hdr, data) {
  const [hx0, hz0, hx1, hz1] = hdr.hole, cx = (hx0 + hx1) / 2, cz = (hz0 + hz1) / 2, quads = [];
  for (let j = 0; j < hdr.h - 1; j++) for (let i = 0; i < hdr.w - 1; i++) {
    const a = j * hdr.w + i, b = a + 1, c = a + hdr.w, d = c + 1;
    if (![a, b, c, d].every((k) => Number.isFinite(data[k]))) continue;
    quads.push({ a, b, c, d, r: Math.hypot(hdr.x0 + (i + 0.5) * hdr.step - cx, hdr.z0 + (j + 0.5) * hdr.step - cz) });
  }
  return quads.sort((p, q) => q.r - p.r);   // painter's order: far first, the rim last
}

export function backdropMesh(hdr, data, rgbOf) {
  const { position, tint } = vertices(hdr, data, TINT_STOPS.map(([h, c]) => [h, rgbOf(c)]));
  const quads = sortedQuads(hdr, data), index = new Uint32Array(quads.length * 6);
  quads.forEach((q, n) => index.set([q.a, q.c, q.b, q.b, q.c, q.d], n * 6));   // counter-clockwise from above: normal up
  return { position, tint, index, tris: quads.length * 2 };
}

export function horizon(hdr, data, eye, azDeg) {
  const sx = Math.sin(azDeg * Math.PI / 180), sz = -Math.cos(azDeg * Math.PI / 180);
  let best = { elev: -90, dist: 0 };
  for (let r = 300; r < 40000; r += hdr.step / 4) {
    const y = heightAt(hdr, data, eye.x + sx * r, eye.z + sz * r);
    if (!Number.isFinite(y)) continue;
    const elev = Math.atan2(y - curveDrop(r) - eye.y, r) * 180 / Math.PI;
    if (elev > best.elev) best = { elev, dist: r };
  }
  return best;
}
```

- [ ] **Step 4: Run** `node --test tests/backdrop.test.mjs` → all pass, including the two shipped-file tests (Task 2's
  file is in place; if the ridge test misses its band, print `best` and check the file, do not widen the band).
- [ ] **Step 5: Commit** `feat(world): backdrop mesh, haze and horizon helpers (#593)`.

## Task 4: region entry

**Files:** modify `regions.js`, `tests/regions.test.mjs`.

- [ ] **Step 1: Write the failing test** (add to `tests/regions.test.mjs`):

```js
test('#593: only Hochrhein has a horizon backdrop', () => {
  assert.equal(REGIONS.hochrhein.backdrop, './data/backdrop_hochrhein.mmh');
  assert.equal(REGIONS.ehrendingen.backdrop, undefined);
});
```
  (Use the file's existing import of `REGIONS`; add it to the import list if it is not there.)
- [ ] **Step 2: Run** `node --test tests/regions.test.mjs` → fails.
- [ ] **Step 3: Implement**: in `regions.js` hochrhein, after `terrain: './data/terrain_hochrhein.mmh',` add
  `backdrop: './data/backdrop_hochrhein.mmh',   // #593: Hotzenwald, Jura, Rhine valley on the horizon`.
- [ ] **Step 4: Run** → passes. **Step 5: Commit** `feat(world): Hochrhein region names its backdrop (#593)`.

## Task 5: draw it in the game

**Files:** modify `index.html`.

No new unit test here (three.js glue); Task 7's Playwright test covers it. Steps:

- [ ] **Step 1: Import** — add `import { BACKDROP_SCALE, CURVE_R, HAZE, backdropMesh, backdropVisible } from './backdrop.js';`
  next to the other root-module imports near `index.html:596`.

- [ ] **Step 2: Sky first** — right after `const sky = new THREE.Mesh(...); scene.add(sky);` (`index.html:2257`) add
  `sky.renderOrder = -2;   // #593: the sky, then the backdrop (-1), then the world`.

- [ ] **Step 3: State, material, builder** — after the sky line add:

```js
// #593: the horizon backdrop. Drawn right after the sky with no depth test, so every world mesh covers it; scaled
// about the camera (camTail) so 45 km fit inside the far plane with every angle unchanged.
const BACKDROP = { mesh: null, hdr: null, ms: 0, tris: 0, bytes: 0 };
const backdropMat = () => new THREE.ShaderMaterial({ fog: false, depthTest: false, depthWrite: false,
  uniforms: { camPos: { value: new THREE.Vector3() }, hazeCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(-0.55, 0.62, -0.56).normalize() },
    hMin: { value: HAZE.min }, hMax: { value: HAZE.max }, d0: { value: HAZE.d0 }, len: { value: HAZE.len }, curveR: { value: CURVE_R } },
  vertexShader: 'attribute vec3 tint; uniform vec3 camPos; uniform float curveR; varying float vD; varying vec3 vN; varying vec3 vC; void main(){ vec3 p = position; float d = length(p.xz - camPos.xz); p.y -= d * d / (2.0 * curveR); vD = d; vN = normal; vC = tint; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: 'uniform vec3 hazeCol; uniform vec3 sunDir; uniform float hMin, hMax, d0, len; varying float vD; varying vec3 vN; varying vec3 vC; void main(){ float h = hMin + (hMax - hMin) * (1.0 - exp(-max(vD - d0, 0.0) / len)); float lit = 0.72 + 0.28 * max(dot(normalize(vN), sunDir), 0.0); gl_FragColor = vec4(mix(vC * lit, hazeCol, h), 1.0); }' });
function buildBackdrop(mmh, bytes) {
  const t0 = performance.now(), m = backdropMesh(mmh.hdr, mmh.data, (hex) => { const c = col(hex); return [c.r, c.g, c.b]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.position, 3)); g.setAttribute('tint', new THREE.BufferAttribute(m.tint, 3)); g.setIndex(new THREE.BufferAttribute(m.index, 1)); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, backdropMat()); mesh.renderOrder = -1; mesh.frustumCulled = false; mesh.raycast = () => {}; mesh.name = 'backdrop';
  (LEVELS.isSurface() ? scene : surfaceRoot).add(mesh);   // below ground the surface lives in surfaceRoot (LEVELS.onChange)
  Object.assign(BACKDROP, { mesh, hdr: mmh.hdr, tris: m.tris, bytes, ms: performance.now() - t0 });
  renderStatus();
}
```
  `surfaceRoot` is declared later (`index.html:2853`); `buildBackdrop` runs only after the world is built (Step 5), so the
  reference is safe. `col` is `(h) => new THREE.Color(h)` (`index.html:697`), the same colour path as the sky, so the
  tints and the haze colour match the sky band they fade into.

- [ ] **Step 4: Follow the camera** — at the end of `camTail()` (`index.html:4187`) add:

```js
  if (BACKDROP.mesh) { const m = BACKDROP.mesh, s = BACKDROP_SCALE; m.visible = backdropVisible({ surface: LEVELS.isSurface(), underwater: UWS.on, cave: CAVE_MODE.on }); m.scale.setScalar(s); m.position.copy(camera.position).multiplyScalar(1 - s); m.material.uniforms.camPos.value.copy(camera.position); m.material.uniforms.hazeCol.value.copy(skyMat.uniforms.hor.value); }   // #593
```
  The shader works in the mesh's own (unscaled, real game metres) coordinates, so `camPos` is the real camera position.

- [ ] **Step 5: Load without waiting** — on the line before the top-level `requestAnimationFrame(loop);` (`index.html:4778`) add:

```js
if (REGION.backdrop && !GEN) fetch(REGION.backdrop).then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => { if (buf) buildBackdrop(parseMMH(buf), buf.byteLength); }).catch(() => {});   // #593: never awaited, startup does not wait for the horizon
```

- [ ] **Step 6: Debug hook** — next to the other `window.__mm.*` hooks:
  `window.__mm.backdrop = () => ({ loaded: !!BACKDROP.mesh, visible: !!BACKDROP.mesh && BACKDROP.mesh.visible && !!BACKDROP.mesh.parent && BACKDROP.mesh.parent === scene, tris: BACKDROP.tris, bytes: BACKDROP.bytes, ms: BACKDROP.ms, scale: BACKDROP.mesh ? BACKDROP.mesh.scale.x : 0 });`

- [ ] **Step 7: Status line** — in `renderStatus()` (`index.html:4469`) append the horizon source to the terrain line
  when the backdrop is loaded:
  `$('mmhstatus').textContent = (REAL ? tr('terrainMeasured', ...unchanged...) : tr('terrainMadeUp')) + (BACKDROP.hdr ? ' · ' + tr('horizonSource') : '');`
  (Task 6 adds the string.)

- [ ] **Step 8: Smoke-check** with `node --test tests/*.test.mjs` (nothing breaks) and commit
  `feat(world): draw the Black Forest and Jura on the horizon (#593)`.

## Task 6: credits

**Files:** modify `strings.js`, `about.js`, `tests/about.test.mjs`, `index.html`, `data/README.md`, `CREDITS.md`,
`docs/08-pipeline-terrain.md`.

- [ ] **Step 1: Write the failing test** — in `tests/about.test.mjs` add `'copernicus'` to the sorted key list in the
  first test and add
  `assert.equal(ABOUT_LINKS.copernicus, 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM');`.
- [ ] **Step 2: Run** `node --test tests/about.test.mjs` → fails.
- [ ] **Step 3: Implement**
  - `about.js` `ABOUT_LINKS`: after `agis` add
    `copernicus: 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',   // #593: the horizon backdrop`.
  - `strings.js` en (next to `aboutAgis`):
    `aboutCopernicus: 'Horizon (Black Forest, Jura): produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',`
    and `horizonSource: 'Horizon: Copernicus DEM GLO-30',`.
    de: `aboutCopernicus: 'Horizont (Schwarzwald, Jura): produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',`
    and `horizonSource: 'Horizont: Copernicus DEM GLO-30',` (the notice itself stays verbatim English: it is a licence text).
  - `index.html:518`: after the `agis` link add `<br><a data-link="copernicus" data-i18n="aboutCopernicus"></a>`.
  - `data/README.md`: a table row
    `| backdrop_hochrhein.mmh | Horizon backdrop around the play area: Hotzenwald, Dinkelberg, Jura, Rhine valley (format MMH1 with kind "backdrop", 250 m, play area = NaN hole; pipeline/backdrop.py) | Copernicus DEM GLO-30, free licence. Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. |`
  - `CREDITS.md`: `- Copernicus DEM GLO-30 (https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM), free licence: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved`
  - `docs/08-pipeline-terrain.md`: a section "Horizon backdrop (#593)" with the run command
    (`python backdrop.py`, defaults `--terrain ../data/terrain_hochrhein.mmh --out ../data/backdrop_hochrhein.mmh --step 250 --pad 18000`),
    the source URL pattern, what the hole and rim are, that the German bank inside the play area stays flat (a DTM
    is needed there, see the follow-up), and the Copernicus line under "Attribution".
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` → all pass (the en/de parity test in `tests/strings.test.mjs`
  must see both new keys in both languages).
- [ ] **Step 5: Commit** `docs(credits): Copernicus DEM for the horizon backdrop (#593)`.

## Task 7: Playwright check and changelog

**Files:** create `tests/test_backdrop.py`; modify `CHANGELOG.md`.

- [ ] **Step 1: Write the test** `tests/test_backdrop.py`:

```python
"""#593: the horizon backdrop loads after start, stays cheap, and hides under water."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_smoke import ARGS, WORLD, MMH

BACKDROP = Path(__file__).resolve().parent.parent / "data" / "backdrop_hochrhein.mmh"

needs_data = pytest.mark.skipif(not (WORLD.exists() and MMH.exists() and BACKDROP.exists()),
                                reason="run pipeline/backdrop.py first (docs/08-pipeline-terrain.md)")


@needs_data
def test_backdrop_loads_cheap_and_is_visible_on_the_surface(server):
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.backdrop && window.__mm.backdrop().loaded", timeout=240000)
        b = page.evaluate("() => window.__mm.backdrop()")
        status = page.evaluate("() => document.querySelector('#mmhstatus').textContent")
        br.close()
    print(b, status)
    assert b["visible"] and b["scale"] == pytest.approx(0.08)
    assert 40000 < b["tris"] <= 70000 and b["bytes"] <= 200000, b
    assert b["ms"] < 250, b                      # one indexed mesh, no terrain lookups
    assert "Copernicus" in status, status
```
  If the existing tests have a cheap hook to dive (`window.__mm.underwater` exists, `index.html:3958`) and a way to
  enter the water used by another test, add a second assertion that `backdrop().visible` is false while
  `underwater().on` is true; otherwise rely on the `backdropVisible` unit test.
- [ ] **Step 2: Commit and push the branch first**, then run in the foreground:
  `pytest tests/test_backdrop.py tests/test_fields.py tests/test_about.py -x`. All green; `test_fields.py` unchanged.
- [ ] **Step 3: CHANGELOG** — under `## [Unreleased]` → `### Added`, newest first, timestamp from
  `TZ=Europe/Zurich date '+%F %H:%M'`:
  ``- `YYYY-MM-DD HH:MM` From the Plattform deck you now see the **Hotzenwald** rising behind Bad Säckingen and Murg, and the **Jura** and the Rhine valley all round: a hazy **horizon** from the Copernicus height model.``
- [ ] **Step 4: Commit** `docs(changelog): horizon backdrop (#593)` and push. In the PR body include two screenshots
  from the deck (north, Original style and Smooth style) for the maintainer's visual check.
