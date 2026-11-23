# German Side of the Hochrhein Terrain from LGL DGM1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The German side of `data/terrain_hochrhein.mmh` (today 60 % flat no-data fill) gets real heights from LGL DGM1, every measured Swiss sample stays bit-identical, German lakes get real water levels, the backdrop rim follows, and LGL is credited.

**Architecture:** `pipeline/terrain.py` learns to download the LGL 2 km DGM1 tiles (`--lgl`), to align them to swissALTI3D by the median overlap offset, and to fill only the no-data cells (`0.0`) of an existing `.mmh` (`--overlay`). A retrofit `pipeline/relevel_water.py` re-levels water entries at the no-data level `0.0`. `pipeline/backdrop.py` is re-run. The game only gains a credit line.

**Tech Stack:** Python 3.12 (numpy, rasterio, pyproj, requests, shapely — all already in `pipeline/requirements.txt`), vanilla JS strings, `node --test`, pytest + Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-lgl-dgm1-german-terrain-design.md`

**Independent of #1152/#1151; lands in any order, rebuilt terrain after #1152 gives German roads profiles automatically.**

## Global Constraints

- DGM1 tile URL: `https://opengeodata.lgl-bw.de/data/dgm/dgm1_32_{E}_{N}_2_bw.zip`, `{E}`/`{N}` = south-west corner in km, 2 km tiles, **E odd, N even**. HTTP 404 = tile outside Baden-Württemberg (skip). Retry other failures, 3 tries. Each zip holds up to four 1 km `*.xyz` files (`x y z`, 1 m, pixel centres at `.50`, EPSG:25832, heights NHN/DHHN2016); border files are partial.
- For the Hochrhein grid exactly 12 tiles exist: `417 419 421 423 425 427` x `5266 5268` (~110 MB of zips).
- Attribution text, exactly: `Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0`. `.mmh` source string: `DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (resampled to 8 m)`.
- No-data marker in an `.mmh`: a sample exactly `0.0` (`terrain.py` fills with `base`, then subtracts `base`; `world_water.NODATA`, `world.js terrainHasData`).
- Swiss samples always win. In `--overlay` mode every sample that is not exactly `0.0` stays **bit-identical**.
- Shift = median of (swiss - dgm) over cells where both have data, rounded to 0.01 m (expected about +0.3 m). Header key `dgmShift`, written only when DGM1 data was used.
- Swiss-only builds (`region.py`, Ehrendingen, a `terrain.py` run without DGM1) must produce byte-identical output to today.
- Downloads go to `pipeline/cache/lgl_dgm1/` (gitignored cache dir like `cache/swissalti3d`); never commit them.
- On the shared agent box run the terrain/backdrop builds under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`; on a CI runner run them plainly.
- No new dependency. No change to the game's terrain code.
- CHANGELOG entry in German (real umlauts, `TZ=Europe/Zurich date '+%F %H:%M'`, 1-3 bold keywords); everything else in English.
- Browser verification runs in the foreground; commit and push before running it. Run only the Playwright files named here, not the full suite.
- Golden values that move because the data changed (Task 6) are re-measured and replaced; that is not "making a test green": the data under them changed. Any other failing test is a bug to fix in the implementation.

## Review Focus

- Bit-identity of Swiss samples in `--overlay` mode: `test_overlay_keeps_every_measured_sample_bit_identical` (Task 1) and the one-off check against the old file in Task 5.
- Swiss-only builds unchanged: `test_fill_holes_without_dgm_returns_swiss_unchanged` (Task 1) — no `dgmShift` key, no new source.
- Tile ids (odd E / even N): `test_dgm1_tiles_hochrhein_grid_is_the_30_candidates` (Task 2).
- A 404 tile is skipped, a transient error retried: `test_download_dgm1_skips_404_and_retries` (Task 2).
- Water retrofit touches only `level` of entries at exactly `0.0` plus one source line: `test_relevel_changes_only_zero_levels_and_is_idempotent` (Task 4).

---

### Task 1: Merge rule — DGM1 fills holes, shifted onto swissALTI3D

**Files:**
- Modify: `pipeline/terrain.py`
- Test: `pipeline/tests/test_terrain.py`

**Interfaces:**
- `NODATA = 0.0`
- `LGL_SOURCE = "DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (resampled to 8 m)"`
- `dgm_shift(swiss_abs: np.ndarray, dgm_abs: np.ndarray) -> float`
- `fill_holes(swiss_abs, dgm_abs) -> tuple[np.ndarray, float]` — swiss where finite, else `dgm + shift`; NaN where neither.
- `overlay(rel: np.ndarray, base: float, dgm_abs: np.ndarray) -> tuple[np.ndarray, float, int]` — fills only `rel == 0.0` cells; returns (heights relative to base, shift, filled count).
- `grid_transform(hdr: dict) -> Affine` — the LV95 transform of an `.mmh` header's grid.
- `paint(out: np.ndarray, src_ds, src_crs, dst_transform) -> bool` — module-level version of today's inner `paint`, fills NaN cells of `out`, returns whether it filled any.

- [ ] **Step 1: Write the failing tests** (append to `pipeline/tests/test_terrain.py`)

```python
NAN = np.nan


def test_dgm_shift_is_the_median_overlap_difference():
    swiss = np.array([[300.3, 301.3, NAN], [302.3, NAN, NAN]], np.float32)
    dgm = np.array([[300.0, 301.0, 290.0], [302.0, 280.0, NAN]], np.float32)
    assert terrain.dgm_shift(swiss, dgm) == 0.3


def test_dgm_shift_without_overlap_is_zero():
    assert terrain.dgm_shift(np.array([[NAN, 1.0]]), np.array([[2.0, NAN]])) == 0.0


def test_fill_holes_takes_swiss_first_and_shifts_dgm():
    swiss = np.array([[300.3, NAN, NAN]], np.float32)
    dgm = np.array([[300.0, 310.0, NAN]], np.float32)
    out, shift = terrain.fill_holes(swiss, dgm)
    assert shift == 0.3
    assert out[0, 0] == np.float32(300.3) and out[0, 1] == pytest.approx(310.3) and np.isnan(out[0, 2])


def test_fill_holes_without_dgm_returns_swiss_unchanged():
    swiss = np.array([[300.3, NAN]], np.float32)
    out, shift = terrain.fill_holes(swiss, np.full_like(swiss, NAN))
    assert shift == 0.0 and out[0, 0] == swiss[0, 0] and np.isnan(out[0, 1])


def test_overlay_keeps_every_measured_sample_bit_identical():
    rel = np.array([[0.0, 0.0, 12.345678], [-2.5, 7.1234567, 0.0]], np.float32)
    dgm = np.array([[310.0, NAN, 296.045678], [281.2, 290.8234567, 300.0]], np.float32)
    out, shift, n = terrain.overlay(rel, 284.0, dgm)
    assert shift == 0.3 and n == 2
    measured = rel != 0.0
    assert out[measured].tobytes() == rel[measured].tobytes()
    assert out[0, 0] == pytest.approx(310.0 + 0.3 - 284.0, abs=1e-4)
    assert out[0, 1] == 0.0                                   # no DGM1 there either: stays no-data
    assert out[1, 2] == pytest.approx(300.0 + 0.3 - 284.0, abs=1e-4)
    assert out.dtype == np.float32
```

Add `import pytest` at the top of the test file.

- [ ] **Step 2: Run them and see them fail**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_terrain.py -q`
Expected: FAIL, `AttributeError: module 'terrain' has no attribute 'dgm_shift'`.

- [ ] **Step 3: Implement**

In `pipeline/terrain.py`, under the constants:

```python
NODATA = 0.0                                     # a no-data sample in an .mmh: filled with base, then base subtracted
LGL_SOURCE = "DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (resampled to 8 m)"
```

New section before `# ---------- merge onto the game grid ----------`:

```python
# ---------- merge: swissALTI3D first, DGM1 shifted onto it (#1161) ----------

def dgm_shift(swiss_abs: np.ndarray, dgm_abs: np.ndarray) -> float:
    """Median of swiss - dgm where both have data (LN02 vs NHN plus model difference, ~+0.3 m on the Hochrhein)."""
    both = np.isfinite(swiss_abs) & np.isfinite(dgm_abs)
    if not both.any():
        return 0.0
    return round(float(np.median(swiss_abs[both].astype(np.float64) - dgm_abs[both])), 2)


def fill_holes(swiss_abs: np.ndarray, dgm_abs: np.ndarray):
    """Swiss heights where present, else DGM1 + shift; NaN where neither has data."""
    shift = dgm_shift(swiss_abs, dgm_abs)
    out = swiss_abs.copy()
    hole = np.isnan(out) & np.isfinite(dgm_abs)
    out[hole] = dgm_abs[hole] + shift
    return out, shift


def overlay(rel: np.ndarray, base: float, dgm_abs: np.ndarray):
    """Fill only the no-data samples (exactly 0.0) of an existing .mmh; every other sample stays bit-identical."""
    measured = rel != NODATA
    swiss_abs = np.where(measured, rel.astype(np.float64) + base, np.nan)
    shift = dgm_shift(swiss_abs, dgm_abs)
    out = rel.astype(np.float32, copy=True)
    fill = ~measured & np.isfinite(dgm_abs)
    out[fill] = (dgm_abs[fill].astype(np.float64) + shift - base).astype(np.float32)
    return out, shift, int(fill.sum())
```

Then lift the inner `paint` out of `sample()` and add `grid_transform`:

```python
def grid_transform(hdr: dict):
    s = hdr["step"]
    return from_origin(hdr["origin"]["E"] + hdr["x0"] - s / 2, hdr["origin"]["N"] - hdr["z0"] + s / 2, s, s)


def paint(out: np.ndarray, src_ds, src_crs, dst_transform) -> bool:
    """Reproject one tile onto the grid and fill the NaN cells of out with it; True if it filled any."""
    tmp = np.full(out.shape, np.nan, dtype=np.float32)
    reproject(source=rasterio.band(src_ds, 1), destination=tmp,
              src_transform=src_ds.transform, src_crs=src_crs, src_nodata=src_ds.nodata,
              dst_transform=dst_transform, dst_crs=LV95, dst_nodata=np.nan,
              resampling=Resampling.bilinear)
    hole = np.isnan(out) & ~np.isnan(tmp)
    out[hole] = tmp[hole]
    return bool(hole.any())
```

Rewrite `sample()` so Swiss tiles paint into `out`, DGM1 tiles into a separate `de`, then merge. Keep the transform arithmetic exactly as today (`from_origin(e0 + x0 - step / 2, n0 - znorth + step / 2, step, step)`) so Swiss-only output is byte-identical:

```python
    out = np.full((h, w), np.nan, dtype=np.float32)
    sources = []
    for p in swiss_tiles(bbox, cache / "swissalti3d"):
        with rasterio.open(p) as ds:
            if paint(out, ds, ds.crs or LV95, dst_transform) and "swissALTI3D (c) swisstopo" not in sources:
                sources.append("swissALTI3D (c) swisstopo")
    de = np.full((h, w), np.nan, dtype=np.float32)
    for ds, crs in german_datasets(dgm_dir):
        paint(de, ds, crs, dst_transform)
        ds.close()
    header = {... as today ...}
    if np.isfinite(de).any():
        out, shift = fill_holes(out, de)
        sources.append(LGL_SOURCE)
        header["dgmShift"] = shift
        log(f"DGM1 shifted by {shift:+.2f} m onto swissALTI3D")
    header["sources"] = sources
    return header, out
```

(`header` must still list `sources` in the same key position as today; build the dict with `"sources": sources` as now and append to the list in place, adding `dgmShift` after it.) Also fix the module docstring licence line to `DGM1: Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0`.

- [ ] **Step 4: Run the tests**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_terrain.py tests/test_region.py tests/test_geo_mmh.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/terrain.py pipeline/tests/test_terrain.py
git commit -m "feat(terrain): fill DGM1 holes shifted onto swissALTI3D (#1161)"
```

### Task 2: DGM1 tile ids and download

**Files:**
- Modify: `pipeline/terrain.py`
- Test: `pipeline/tests/test_terrain.py`

**Interfaces:**
- `DGM1_URL = "https://opengeodata.lgl-bw.de/data/dgm/dgm1_32_{}_2_bw.zip"`
- `dgm1_tiles(hdr: dict) -> list[str]` — ids `"E_N"` sorted by E then N, for a header with `origin.E/N`, `x0`, `z0`, `w`, `h`, `step`.
- `download_dgm1(ids: list[str], folder: Path, get=requests.get, tries: int = 3) -> list[str]` — unpacks each tile's `*.xyz` into `folder/dgm1_32_<id>_2_bw/`; returns the ids present afterwards.

- [ ] **Step 1: Write the failing tests**

```python
import io
import zipfile

HOCHRHEIN_HDR = {"w": 1186, "h": 1010, "step": 8.0, "x0": -4696.0, "z0": -2416.0,
                 "origin": {"E": 2639781.3458206826, "N": 1266787.080520644}}   # data/terrain_hochrhein.mmh, 2026-11-23


def test_dgm1_tiles_hochrhein_grid_is_the_30_candidates():
    ids = terrain.dgm1_tiles(HOCHRHEIN_HDR)
    assert len(ids) == 30
    assert ids[0] == "417_5260" and ids[-1] == "427_5268"
    assert {"417_5266", "419_5268", "427_5266"} <= set(ids)
    assert all(int(i.split("_")[0]) % 2 == 1 and int(i.split("_")[1]) % 2 == 0 for i in ids)


class Resp:
    def __init__(self, status, content=b""):
        self.status_code, self.content = status, content

    def raise_for_status(self):
        if self.status_code >= 400:
            raise terrain.requests.HTTPError(str(self.status_code))


def zip_bytes():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("dgm1_32_419_5266_2_bw/dgm1_32_419_5266_1_bw_2021.xyz", "419000.50 5266999.50 293.88\n")
        z.writestr("dgm1_32_419_5266_2_bw/GOVDATA-Datenlizenz_Deutschland.pdf", "pdf")
    return buf.getvalue()


def test_download_dgm1_skips_404_and_retries(tmp_path):
    calls = []

    def get(url, timeout):
        calls.append(url)
        if "421_5266" in url:
            return Resp(404)
        if "419_5266" in url and calls.count(url) == 1:
            raise terrain.requests.ConnectionError("timeout")
        return Resp(200, zip_bytes())

    have = terrain.download_dgm1(["419_5266", "421_5266"], tmp_path, get=get)
    assert have == ["419_5266"]
    files = sorted(p.name for p in (tmp_path / "dgm1_32_419_5266_2_bw").iterdir())
    assert files == ["dgm1_32_419_5266_1_bw_2021.xyz"]                 # only the xyz, no pdf
    n = len(calls)
    assert terrain.download_dgm1(["419_5266"], tmp_path, get=get) == ["419_5266"] and len(calls) == n   # cached
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_terrain.py -q -k "dgm1"`
Expected: FAIL, no attribute `dgm1_tiles`.

- [ ] **Step 3: Implement** (in the "Germany" section of `terrain.py`; add `import io, shutil, zipfile` and `from pyproj import CRS, Transformer`)

```python
DGM1_URL = "https://opengeodata.lgl-bw.de/data/dgm/dgm1_32_{}_2_bw.zip"   # 2 km tiles, south-west corner in km, E odd, N even
_LV95_TO_UTM32 = None


def dgm1_tiles(hdr: dict) -> list[str]:
    """Ids 'E_N' of the LGL DGM1 2 km tiles that touch the grid of an .mmh header (tiles outside BW 404 later)."""
    global _LV95_TO_UTM32
    _LV95_TO_UTM32 = _LV95_TO_UTM32 or Transformer.from_crs(LV95, ETRS_UTM32, always_xy=True)
    s = hdr["step"]
    xs = np.linspace(hdr["x0"], hdr["x0"] + (hdr["w"] - 1) * s, 20)
    zs = np.linspace(hdr["z0"], hdr["z0"] + (hdr["h"] - 1) * s, 20)
    X, Z = np.meshgrid(xs, zs)
    ue, un = _LV95_TO_UTM32.transform(hdr["origin"]["E"] + X.ravel(), hdr["origin"]["N"] - Z.ravel())
    emin, emax, nmin, nmax = ue.min() / 1000, ue.max() / 1000, un.min() / 1000, un.max() / 1000
    e0 = int(np.floor((emin - 1) / 2)) * 2 + 1
    n0 = int(np.floor(nmin / 2)) * 2
    return [f"{e}_{n}" for e in range(e0, int(np.floor(emax)) + 1, 2) for n in range(n0, int(np.floor(nmax)) + 1, 2)]


def _fetch(get, url: str, tries: int):
    """Bytes of url, None on 404 (outside Baden-Wuerttemberg); other errors retried, the last one raised."""
    for k in range(tries):
        try:
            r = get(url, timeout=300)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            if k == tries - 1:
                raise
            log(f"  retry {url}")


def _unpack_xyz(data: bytes, dst: Path) -> None:
    part = dst.with_name(dst.name + ".part")
    shutil.rmtree(part, ignore_errors=True)
    part.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for m in z.namelist():
            if m.lower().endswith(".xyz"):
                (part / Path(m).name).write_bytes(z.read(m))      # basename only: no paths from the archive
    part.rename(dst)


def download_dgm1(ids, folder: Path, get=requests.get, tries: int = 3) -> list[str]:
    """Download and unpack each DGM1 tile once into folder/dgm1_32_<id>_2_bw/; returns the ids present."""
    folder.mkdir(parents=True, exist_ok=True)
    have = []
    for tid in ids:
        dst = folder / f"dgm1_32_{tid}_2_bw"
        if not dst.is_dir():
            data = _fetch(get, DGM1_URL.format(tid), tries)
            if data is None:
                continue
            log(f"  DGM1 {tid}")
            _unpack_xyz(data, dst)
        have.append(tid)
    return have
```

Also make `german_datasets` skip anything under a `*.part` folder: `if any(part.endswith(".part") for part in p.parts): continue`.

- [ ] **Step 4: Run the tests**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_terrain.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/terrain.py pipeline/tests/test_terrain.py
git commit -m "feat(terrain): download LGL DGM1 tiles for a grid (#1161)"
```

### Task 3: `--overlay` and `--lgl` on the command line

**Files:**
- Modify: `pipeline/terrain.py`
- Test: `pipeline/tests/test_terrain.py`

**Interfaces:**
- `dgm_on_grid(hdr: dict, datasets) -> np.ndarray` — absolute DGM1 heights on an `.mmh` header's grid, NaN where none.
- `overlay_file(path: Path, dgm_dir: Path | None) -> tuple[dict, np.ndarray]`
- `grid_header(bbox, origin, step) -> dict` — `{x0, z0, w, h, step, origin: {E, N}}` for `dgm1_tiles` before a full build.
- CLI: `--overlay MMH` (fill only the no-data samples of that file), `--lgl` (download into `CACHE/lgl_dgm1` and use it as the DGM folder). `build(...)`'s signature stays as is (`test_default_step_is_8_m` fakes it).

- [ ] **Step 1: Write the failing test**

```python
import rasterio
from rasterio.transform import from_origin

from mmh import read_mmh, write_mmh


def test_overlay_cli_fills_holes_from_a_dgm_folder(tmp_path):
    E, N = 2639781.0, 1266787.0
    hdr = {"format": "MMH1", "w": 4, "h": 3, "step": 8.0, "x0": 0.0, "z0": 0.0,
           "origin": {"lat": 47.55, "lon": 7.97, "E": E, "N": N, "crs": "EPSG:2056"},
           "base": 284.0, "min": 0.0, "max": 9.0, "bbox": [7.9, 47.5, 8.0, 47.6], "sources": ["swissALTI3D (c) swisstopo"]}
    rel = np.array([[0, 0, 0, 0], [5, 6, 7, 8], [9, 9, 9, 9]], np.float32)
    src = tmp_path / "t.mmh"
    write_mmh(src, hdr, rel)
    dgm = tmp_path / "dgm"; dgm.mkdir()
    big = np.full((7, 8), 284.0 + 20.0 - 0.3, np.float32)            # 2-cell margin around the 4 x 3 grid
    big[3:5, 2:6] = 284.0 + rel[1:] - 0.3
    with rasterio.open(dgm / "d.tif", "w", driver="GTiff", width=8, height=7, count=1, dtype="float32", crs="EPSG:2056",
                       transform=from_origin(E - 4 - 16, N + 4 + 16, 8, 8), nodata=np.nan) as ds:
        ds.write(big, 1)
    out = tmp_path / "o.mmh"
    assert terrain.main(["--overlay", str(src), "--dgm-dir", str(dgm), "--out", str(out)]) == 0
    h2, r2 = read_mmh(out)
    assert r2[1:].tobytes() == rel[1:].tobytes()
    assert np.allclose(r2[0], 20.0, atol=1e-3)
    assert h2["dgmShift"] == 0.3
    assert h2["sources"] == ["swissALTI3D (c) swisstopo", terrain.LGL_SOURCE]
    assert (h2["w"], h2["h"], h2["x0"], h2["z0"], h2["base"]) == (4, 3, 0.0, 0.0, 284.0)
    assert h2["max"] == pytest.approx(20.0, abs=1e-3)
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_terrain.py -q -k overlay_cli`
Expected: FAIL, `unrecognized arguments: --overlay`.

- [ ] **Step 3: Implement**

```python
def dgm_on_grid(hdr: dict, datasets) -> np.ndarray:
    out = np.full((hdr["h"], hdr["w"]), np.nan, dtype=np.float32)
    t = grid_transform(hdr)
    for ds, crs in datasets:
        paint(out, ds, crs, t)
        ds.close()
    return out


def overlay_file(path: Path, dgm_dir: Path | None):
    """#1161: the .mmh at path with its no-data samples filled from DGM1; every measured sample unchanged."""
    hdr, rel = read_mmh(path)
    out, shift, n = overlay(np.array(rel), hdr["base"], dgm_on_grid(hdr, german_datasets(dgm_dir)))
    log(f"overlay: {n} no-data samples filled from DGM1, shift {shift:+.2f} m, "
        f"{float((out == NODATA).mean()):.1%} of the grid still no-data")
    sources = [s for s in hdr.get("sources", []) if s != LGL_SOURCE] + [LGL_SOURCE]
    return {**hdr, "sources": sources, "dgmShift": shift, "min": float(out.min()), "max": float(out.max())}, out


def grid_header(bbox, origin, step) -> dict:
    frame = Frame(*origin)
    return {**grid_for(bbox, frame, step), "step": step, "origin": {"E": frame.e0, "N": frame.n0}}


def lgl_folder(hdr: dict, cache: Path) -> Path:
    folder = cache / "lgl_dgm1"
    have = download_dgm1(dgm1_tiles(hdr), folder)
    log(f"LGL DGM1: {len(have)} tiles in {folder}")
    return folder
```

`read_mmh` must be imported: `from mmh import read_mmh, write_mmh`. In `main()`:

```python
    ap.add_argument("--lgl", action="store_true", help="#1161: download the LGL DGM1 tiles for the grid into CACHE/lgl_dgm1 and use them")
    ap.add_argument("--overlay", type=Path, default=None,
                    help="#1161: fill only the no-data samples of this .mmh with DGM1; every other sample stays bit-identical")
    a = ap.parse_args(argv)
    if a.overlay:
        dgm = lgl_folder(read_mmh(a.overlay)[0], a.cache) if a.lgl else a.dgm_dir
        header, heights = overlay_file(a.overlay, dgm)
    else:
        dgm = lgl_folder(grid_header(tuple(a.bbox), tuple(a.origin), a.step), a.cache) if a.lgl else a.dgm_dir
        header, heights = build(tuple(a.bbox), tuple(a.origin), a.step, a.base, a.cache, dgm)
    write_mmh(a.out, header, heights)
    return 0
```

Update the module docstring's Usage with `python terrain.py --overlay ../data/terrain_hochrhein.mmh --lgl --out ../data/terrain_hochrhein.mmh`.

- [ ] **Step 4: Run the tests**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_terrain.py tests/test_region.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/terrain.py pipeline/tests/test_terrain.py
git commit -m "feat(terrain): --overlay and --lgl fill an existing .mmh from DGM1 (#1161)"
```

### Task 4: German water levels follow the terrain

**Files:**
- Modify: `pipeline/world_water.py`, `pipeline/osm.py:165-167`
- Create: `pipeline/relevel_water.py`
- Test: `pipeline/tests/test_water.py`, `pipeline/tests/test_relevel_water.py`

**Interfaces:**
- `world_water.LGL_LEVEL_SOURCE = "Water levels (German side): DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0"`
- `world_water.sources(hdr: dict | None) -> list[str]`
- `relevel_water.relevel(world: dict, hdr: dict, heights) -> list[int]` (indices of changed water entries)
- `relevel_water.main(argv) -> int`, CLI `--world PATH --mmh PATH`, patches in place, idempotent.

- [ ] **Step 1: Write the failing tests**

In `pipeline/tests/test_water.py`:

```python
def test_sources_name_lgl_only_when_the_terrain_has_it():
    assert Wt.sources(None) == []
    assert Wt.sources({"sources": ["swissALTI3D (c) swisstopo"]}) == ["Water levels: swissALTI3D © swisstopo"]
    assert Wt.sources({"sources": ["swissALTI3D (c) swisstopo", "DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (resampled to 8 m)"]}) \
        == ["Water levels: swissALTI3D © swisstopo", Wt.LGL_LEVEL_SOURCE]
```

New `pipeline/tests/test_relevel_water.py`:

```python
"""#1161: retrofit water levels from the new terrain into a world file."""
import json

import numpy as np

import relevel_water as RW
import world_water as Wt
from mmh import write_mmh

HDR = {"format": "MMH1", "w": 6, "h": 6, "step": 8.0, "x0": 0.0, "z0": 0.0, "origin": {"E": 0, "N": 0},
       "base": 284.0, "min": 0.0, "max": 95.0, "sources": ["swissALTI3D (c) swisstopo"]}


def heights():
    h = np.full((6, 6), 95.0, np.float32)
    h[:, 3:] = 5.5                                            # the "Swiss" half
    return h


def sq(x, level):
    return {"kind": "water", "level": level, "rings": [[[x, 0], [x + 16, 0], [x + 16, 40], [x, 40]]], "name": "x"}


def world():
    return {"sources": ["© OpenStreetMap contributors, ODbL", "Water levels: swissALTI3D © swisstopo", "Fields: x"],
            "water": [sq(0, 0.0), sq(24, 5.5), sq(24, 0.0)], "other": [1]}


def test_relevel_changes_only_zero_levels_and_is_idempotent():
    w = world()
    assert RW.relevel(w, HDR, heights()) == [0, 2]
    assert [x["level"] for x in w["water"]] == [95.0, 5.5, 5.5]
    assert w["other"] == [1]
    assert RW.relevel(w, HDR, heights()) == []


def test_relevel_leaves_zero_where_the_terrain_has_no_data():
    w = world()
    assert RW.relevel(w, HDR, np.zeros((6, 6), np.float32)) == []
    assert [x["level"] for x in w["water"]] == [0.0, 5.5, 0.0]


def test_main_patches_in_place_adds_the_source_once(tmp_path):
    wp, mp = tmp_path / "w.json", tmp_path / "t.mmh"
    wp.write_text(json.dumps(world(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_mmh(mp, HDR, heights())
    assert RW.main(["--world", str(wp), "--mmh", str(mp)]) == 0
    first = wp.read_text(encoding="utf-8")
    w = json.loads(first)
    assert w["sources"] == ["© OpenStreetMap contributors, ODbL", "Water levels: swissALTI3D © swisstopo",
                            Wt.LGL_LEVEL_SOURCE, "Fields: x"]
    assert RW.main(["--world", str(wp), "--mmh", str(mp)]) == 0 and wp.read_text(encoding="utf-8") == first
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_water.py tests/test_relevel_water.py -q`
Expected: FAIL (`sources` missing, `relevel_water` not found).

- [ ] **Step 3: Implement**

`pipeline/world_water.py`, after `NODATA`:

```python
SWISS_LEVEL_SOURCE = "Water levels: swissALTI3D © swisstopo"
LGL_LEVEL_SOURCE = "Water levels (German side): DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0"


def sources(hdr) -> list[str]:
    """World-file source lines for the water levels measured from this terrain header (#1161)."""
    if not hdr:
        return []
    lgl = any("LGL" in s for s in hdr.get("sources", []))
    return [SWISS_LEVEL_SOURCE] + ([LGL_LEVEL_SOURCE] if lgl else [])
```

`pipeline/osm.py`: replace `+ (["Water levels: swissALTI3D © swisstopo"] if hdr else [])` with `+ world_water.sources(hdr)`.

`pipeline/relevel_water.py`:

```python
"""#1161: retrofit water levels into an existing world file after the terrain gained DGM1 on the German side.

Not a rebuild (a CI runner has no OSM extract, and `osm.py build` would drag in every OSM edit since the last stand,
see cap_ridges.py): every water entry whose level is exactly 0.0 -- the fallback for no measured terrain -- is
measured again with world_water.level on its own rings; nothing else in the file changes except one source line.
Idempotent.

    python relevel_water.py --world ../data/world_hochrhein.json --mmh ../data/terrain_hochrhein.mmh
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import shapely

import mmh
import world_water


def relevel(world: dict, hdr: dict, heights) -> list[int]:
    """Level every water entry at exactly 0.0 from the terrain where it has data; returns the changed indices."""
    changed = []
    for i, w in enumerate(world["water"]):
        if w["level"] != 0.0:
            continue
        lv = world_water.level(shapely.Polygon(w["rings"][0], w["rings"][1:]), hdr, heights)
        if lv is None or lv == 0.0:
            continue
        w["level"] = lv
        changed.append(i)
    return changed


def add_source(world: dict) -> None:
    src = world["sources"]
    if world_water.LGL_LEVEL_SOURCE in src:
        return
    at = src.index(world_water.SWISS_LEVEL_SOURCE) + 1 if world_water.SWISS_LEVEL_SOURCE in src else len(src)
    src.insert(at, world_water.LGL_LEVEL_SOURCE)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--world", required=True, type=Path, help="the world json to patch in place")
    ap.add_argument("--mmh", required=True, type=Path, help="the terrain with DGM1")
    a = ap.parse_args(argv)
    hdr, heights = mmh.read_mmh(a.mmh)
    world = json.loads(a.world.read_text(encoding="utf-8"))
    changed = relevel(world, hdr, heights)
    if changed:
        add_source(world)
    a.world.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"relevel_water: {len(changed)} water entries: " + ", ".join(
        f"{world['water'][i]['name'] or '-'} {world['water'][i]['level']}" for i in changed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Note the test world in `test_main_patches_in_place_adds_the_source_once` relies on `add_source` running only when something changed; the second run changes nothing and the source is already there, so the bytes are identical.

- [ ] **Step 4: Run the tests**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_water.py tests/test_relevel_water.py tests/test_cap_ridges.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/world_water.py pipeline/osm.py pipeline/relevel_water.py pipeline/tests/test_water.py pipeline/tests/test_relevel_water.py
git commit -m "feat(world): re-level German water from the DGM1 terrain (#1161)"
```

### Task 5: Build the data — terrain, water, backdrop

**Files:**
- Modify (generated): `data/terrain_hochrhein.mmh`, `data/world_hochrhein.json`, `data/backdrop_hochrhein.mmh`
- Create: `pipeline/tests/test_terrain_shipped.py`

- [ ] **Step 1: Write the shipped-file test** (`pipeline/tests/test_terrain_shipped.py`)

```python
"""#1161: the shipped Hochrhein terrain has DGM1 on the German side."""
import json
from pathlib import Path

import numpy as np
import pytest
import shapely

from mmh import read_mmh

ROOT = Path(__file__).parents[2]
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
WORLD = ROOT / "data" / "world_hochrhein.json"
pytestmark = pytest.mark.skipif(not MMH.exists(), reason="no shipped terrain")


def german_mask(hdr):
    ch = shapely.geometry.shape(json.loads((ROOT / "pipeline" / "ch_outline.geojson").read_text())["geometry"])
    xs = hdr["x0"] + np.arange(hdr["w"]) * hdr["step"]
    zs = hdr["z0"] + np.arange(hdr["h"]) * hdr["step"]
    X, Z = np.meshgrid(xs, zs)
    return ~shapely.contains_xy(ch, hdr["origin"]["E"] + X, hdr["origin"]["N"] - Z)


def test_german_side_is_measured_and_lgl_credited():
    hdr, h = read_mmh(MMH)
    assert float((h[german_mask(hdr)] == 0.0).mean()) < 0.01        # was 0.601 before #1161
    assert "swissALTI3D (c) swisstopo" in hdr["sources"]
    assert "DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (resampled to 8 m)" in hdr["sources"]
    assert 0.1 <= hdr["dgmShift"] <= 0.5
    assert (hdr["w"], hdr["h"], hdr["step"], hdr["x0"], hdr["z0"], hdr["base"]) == (1186, 1010, 8.0, -4696.0, -2416.0, 284.0)


@pytest.mark.skipif(not WORLD.exists(), reason="no shipped world")
def test_bergsee_has_its_real_level():
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    berg = [x["level"] for x in w["water"] if x["name"] == "Bergsee"]
    assert berg and all(lv > 50 for lv in berg), berg
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_terrain_shipped.py -q`
Expected: FAIL (`0.601 < 0.01`, Bergsee `[0.0, 0.0]`).

- [ ] **Step 3: Keep a copy of the old terrain for the one-off checks**

```bash
OLD=$(mktemp -d)
cp data/terrain_hochrhein.mmh "$OLD/old.mmh"
```

- [ ] **Step 4: Overlay DGM1** (~110 MB download into `pipeline/cache/lgl_dgm1/`; prefix with the `systemd-run` cap on the agent box)

```bash
cd pipeline
./.venv/bin/python terrain.py --overlay ../data/terrain_hochrhein.mmh --lgl --out ../data/terrain_hochrhein.mmh
```

Expected log: `LGL DGM1: 12 tiles`, `shift +0.2x..+0.3x m`, still-no-data well under 1 %.

- [ ] **Step 5: One-off checks against the old file** (AC 1 and 4; do not commit this script, write it into `$OLD`)

```python
# $OLD/check.py, run: ./.venv/bin/python -I $OLD/check.py $OLD/old.mmh ../data/terrain_hochrhein.mmh  (from pipeline/, with sys.path set to pipeline/)
import sys; sys.path.insert(0, ".")
import numpy as np
from mmh import read_mmh
h0, a = read_mmh(sys.argv[1]); h1, b = read_mmh(sys.argv[2])
m = a != 0.0
assert a[m].tobytes() == b[m].tobytes(), "measured samples changed"
filled = (a == 0.0) & (b != 0.0)
steps = []
for dj, di in ((0, 1), (1, 0), (0, -1), (-1, 0)):
    s = np.roll(np.roll(m, dj, 0), di, 1)                 # neighbour was measured
    sb = np.roll(np.roll(b, dj, 0), di, 1)
    edge = filled & s
    steps.append(np.abs(b[edge] - sb[edge]))
st = np.concatenate(steps)
print("bit-identical: yes; filled", int(filled.sum()), "seam cells", st.size, "median |step|", float(np.median(st)), "p95", float(np.percentile(st, 95)))
assert np.median(st) < 0.5
```

Record the printed numbers for the commit message.

- [ ] **Step 6: Re-level the water and rebuild the backdrop**

```bash
./.venv/bin/python relevel_water.py --world ../data/world_hochrhein.json --mmh ../data/terrain_hochrhein.mmh
./.venv/bin/python backdrop.py
git diff --stat ../data
```

Expected: `relevel_water` names Bergsee, Dreiweiher, Gnädig-Frauenweiher, Rothenbächle (and any other German 0.0 entries); `git diff` on the world file shows only `level` values and the one source line.

- [ ] **Step 7: Run the tests**

Run: `cd pipeline && ./.venv/bin/python -m pytest -q` and `node --test tests/backdrop.test.mjs`
Expected: PASS (the golden tests skip without the OSM extract).

- [ ] **Step 8: Commit and push, remove the temp dir**

```bash
rm -rf "$OLD"
git add data/terrain_hochrhein.mmh data/world_hochrhein.json data/backdrop_hochrhein.mmh pipeline/tests/test_terrain_shipped.py
git commit -m "feat(world): German side of the Hochrhein terrain from LGL DGM1 (#1161)" -m "<shift, filled cells, seam median/p95, re-levelled water entries>"
git push
```

### Task 6: Re-measure the goldens that pinned the German no-data

**Files:**
- Modify: `tests/world.test.mjs` (test `roadUnderpassConditions_Hochrhein_TwoNoDataSitesAndLohgerbeOnly`), `tests/test_road_underpass.py` (`NO_TERRAIN`, `EXPECTED`, `SEATS[25976772]`)

The two German #1044 sites, w25976772 (Wallbacher Straße over w331388063 at (-2882.8, -238.0)) and w28810416 (Feldstraße over w319322059 at (-3530.7, -1955.9)), now have terrain data. Under #1044's existing rules (`index.html:1702-1711`) each either gets a cut or is dropped as capped. Nothing in `world.js`/`index.html` changes; only the pinned numbers move.

- [ ] **Step 1: Run the node test and read the new values**

Run: `node --test tests/world.test.mjs 2>&1 | grep -A20 roadUnderpassConditions`
Expected: FAIL at the `noData` assertion (now `[]`), possibly at `wet` (new entries with their water level).

- [ ] **Step 2: Update the node test with the measured values**

Rename it to `roadUnderpassConditions_Hochrhein_AllMeasuredLohgerbeAndNewWet`, assert `noData` is `[]`, and extend `want` with the measured `[bridgeId, level]` pairs of any new wet sites (two decimals, as the existing ones). Add a comment `// #1161: the German sites have DGM1 data now`.

- [ ] **Step 3: Run the Playwright file and read the new site outcomes** (commit and push first)

Run: `cd pipeline && ./.venv/bin/python -m pytest ../tests/test_road_underpass.py -q -x 2>&1 | tail -30`
Read for each German site whether it is now a cut (counted in `EXPECTED`) or capped (console warning `road underpass at ...: capped`, belongs in `DROPPED`), and the new deck seat heights of w25976772.

- [ ] **Step 4: Update `tests/test_road_underpass.py`**

- `NO_TERRAIN` and `test_no_cut_where_the_terrain_has_no_data` (lines 114-130): the condition it pins (no data at these two sites) no longer exists. Delete the test and `NO_TERRAIN`; say so in the commit body. Each site's new behaviour is covered by `EXPECTED` or `DROPPED` below.
- A site that now cuts: `EXPECTED += 1`.
- A site that is capped: add it to `DROPPED` with its crossing point and a comment naming the cap.
- `SEATS[25976772]`: the measured pair, comment `# #1161, DGM1`.

- [ ] **Step 5: Run the affected browser tests**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../tests/test_road_underpass.py ../tests/test_jump.py -k "underpass or bergsee" ../tests/test_backdrop.py -q`
Expected: PASS. If `test_bergsee_jump_lands_on_the_lake_road_facing_the_lake` fails, find the cause (systematic-debugging); do not loosen it.

- [ ] **Step 6: Commit and push**

```bash
git add tests/world.test.mjs tests/test_road_underpass.py
git commit -m "test(world): German underpass sites have DGM1 terrain now (#1161)"
git push
```

### Task 7: Credits, docs, changelog

**Files:**
- Modify: `strings.js` (en near line 569, de near line 1443), `index.html:826`, `about.js` (ABOUT_LINKS), `tests/about.test.mjs`, `README.md:109`, `data/README.md` (terrain row), `docs/08-pipeline-terrain.md`, `docs/11-pipeline-osm.md:362`, `CHANGELOG.md`

- [ ] **Step 1: Write the failing test** — in `tests/about.test.mjs`, add `'lgl'` to the sorted key list (between `'leaflet'` and `'midtown'`) and:

```js
  assert.equal(ABOUT_LINKS.lgl, 'https://www.lgl-bw.de/Produkte/Open-Data/');
```

Run: `node --test tests/about.test.mjs` — Expected: FAIL.

- [ ] **Step 2: Implement**

- `about.js` ABOUT_LINKS, after `swisstopo`: `lgl: 'https://www.lgl-bw.de/Produkte/Open-Data/',   // #1161: DGM1 terrain of the German bank`
- `strings.js` en, after `aboutSwisstopo`: `aboutLgl: 'Terrain of the German bank: DGM1, Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (resampled to 8 m)',`
- `strings.js` de, after `aboutSwisstopo`: `aboutLgl: 'Gelände deutsches Rheinufer: DGM1, Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (auf 8 m umgerechnet)',`
- `index.html:826`, after the swisstopo link: `<br><a data-link="lgl" data-i18n="aboutLgl"></a>`
- `README.md:109`: `- Datenquelle: LGL, www.lgl-bw.de, [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0)`
- `data/README.md`, `terrain_hochrhein.mmh` row: `swissALTI3D © swisstopo (free geodata, attribution required). German side: DGM1, Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0, resampled to 8 m and shifted by the header's dgmShift onto swissALTI3D (#1161).` In the `world_hochrhein.json` row, after "Water levels: swissALTI3D © swisstopo.", add "German water levels: DGM1, Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0." Under the `backdrop_hochrhein.mmh` row nothing changes.
- `docs/08-pipeline-terrain.md`: replace "German tiles (manual download)" with the `--lgl` download (URL pattern, 2 km tiles E odd / N even, 404 outside BW, EPSG:25832, NHN DHHN2016), the `--overlay` command, the shift rule and the measured Hochrhein shift; replace the known limit "The German side stays flat at the base height until DGM1 tiles are added." with "Swiss samples win; DGM1 fills the rest, shifted by the median overlap offset (`dgmShift`, ~+0.3 m: LN02 vs NHN)."; drop the backdrop sentence "The German bank inside the play area stays flat (a DTM is needed there ...)" in favour of "The German bank inside the play area uses DGM1 (#1161)."
- `docs/11-pipeline-osm.md:362`: replace the "German side is flat ..." limit with one sentence on `relevel_water.py` (what it does and the command).
- `CHANGELOG.md` under `## [Unreleased]` / `### Added` (create `### Added` if missing), timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `<timestamp>` **Bad Säckingen** und der **Hotzenwald**-Hang haben jetzt echtes Gelände aus dem **DGM1** des LGL Baden-Württemberg statt einer flachen Ebene; der Bergsee liegt auf seiner richtigen Höhe.
```

- [ ] **Step 3: Run the tests**

Run: `node --test tests/about.test.mjs tests/strings.test.mjs` and `cd pipeline && ./.venv/bin/python -m pytest ../tests/test_about.py -q`
Expected: PASS.

- [ ] **Step 4: Commit and push**

```bash
git add strings.js index.html about.js tests/about.test.mjs README.md data/README.md docs/08-pipeline-terrain.md docs/11-pipeline-osm.md CHANGELOG.md
git commit -m "docs(world): credit LGL DGM1 for the German terrain (#1161)"
git push
```
