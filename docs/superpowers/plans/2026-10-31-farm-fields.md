# Farm Fields on the Swiss Side Implementation Plan (#506)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real agricultural parcels on the Swiss side of the Hochrhein world (and OSM fields on the German bank), coloured by crop, with furrows along the parcel and a grass seam between parcels — from the Kanton Aargau "Landwirtschaftliche Nutzungsflächen" (geodienste.ch WFS, anonymous, free use with attribution), fetched by a new pipeline step, built into `data/world_hochrhein.json` and drawn as draped meshes that can never lie under a road.

**Architecture:** `pipeline/fields_ch.py` fetches the WFS GeoJSON into `cache/lwb/` (offline builds stay offline). `pipeline/world_fields.py` maps `lnf_code` → kind, converts LV95 → game frame, subtracts road/rail/car-park corridors, insets each parcel by 0.75 m, simplifies, computes the furrow direction and emits `fields: [{kind, ring, holes?, dir, src}]`; OSM `landuse` areas fill only where the cantonal data has nothing. In the game, `fieldMeshes()` triangulates each parcel (`ShapeUtils.triangulateShape` + `subdivideTris(…, 16)`), drapes it at `terrainH + 0.02`, lifts it over terrain folds with a new pure `meshLift` (the #290 lattice idea for triangles), colours it per kind with a hashed jitter and maps per-parcel UVs along `dir` onto `TEX.field` (furrows) or the new `TEX.meadow`. Credits, data README, docs and CHANGELOG name the source.

**Tech Stack:** Python 3 pipeline (shapely 2, pyproj, requests, pytest), three.js 0.170 buildless, Node test runner (`node --test`), Playwright (Python) + pytest.

**Spec:** `docs/superpowers/specs/2026-10-31-farm-fields-design.md` (data source verification, kind table, palette, assumptions).

**Model routing:** Tasks 1–5, 7–9 default model. Task 6 (textures, palette check against SWISSIMAGE) is graphics: Fable if available, otherwise default.

## Global Constraints

- **No network inside `build_world` or any test.** The WFS fetch is only `fields_ch.py fetch`; tests mock `requests`.
- **Fields keep off roads in the pipeline** (`w/2 + 1 m`), rail (3 m) and car parks (3 m). Never rely on render order, `polygonOffset` or a lift to keep a field under a road. `test_grass_and_fields_stay_below_the_road` limits stay exactly as they are (`worst < 0.01`, `marksBelow == 0`, `done >= 2000/200`, `marksSeen > 5`, ≥ 15 spots); the `green` list only grows.
- **No new `rr()`/`rnd()` calls at build time** (#439: the seeded hand layout shifts). Jitter comes from a hash of the field index. The existing 40-rectangle loop keeps running and only skips its `push`.
- Memory rule on the agent box: every node/Python/browser command under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …`; exit 137/143 means shrink the job, never raise the cap.
- Browser tests in the foreground only; commit and push the branch before running them. Run only the targeted tests named below, never the full suite. Use the GPU browser when `PW_CDP_ENDPOINT` is set (conftest does this).
- `data/world_hochrhein.json` is rebuilt and committed in this PR; the raw GeoJSON under `cache/lwb/` is not (gitignored).
- Commits: Conventional Commits, English, ending with the session's `Co-Authored-By` line. CHANGELOG entry hand-written, player voice, under `## [Unreleased]` → `### Added`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.

## Review Focus

1. **Corridor subtraction is complete**: roads (`osm_roads + game_roads`, bridges included — a field under a bridge deck is wrong too), rail, car parks. Verified on the real file by the test in Task 3 Step 6.
2. **`meshLift` lifts, never lowers**, and uses the same triangle rule as the drawn mesh (the triangles handed to `trisHeightAt` are the ones pushed to the geometry).
3. **Kinds table** matches the spec; overlays (`ist_ueberlagernd`), 8xx and 9xx are dropped; farm identifiers never reach the world file.
4. **Attribution** in all five places (About tab both languages, `CREDITS.md`, `data/README.md`, `docs/`, `sources` list).
5. Budget numbers in the PR body: world file size delta, `counts.fields` (n, tris), world build time before/after (stopwatch on `#worldstatus`, osm world, GPU browser, one run each).

---

## File Structure

| Path | Responsibility |
|---|---|
| `pipeline/fields_ch.py` (new) | WFS fetch with paging and cache; `lv95_bbox`, `wfs_url`, `fetch`, CLI. |
| `pipeline/world_fields.py` (new) | `KIND_BY_CODE`, `kind_of`, `osm_kind`, `build(features, areas, roads, rail, clip, frame)`. |
| `pipeline/osm.py` (modify) | `build_world(..., fields_geojson=None)`, call after rail, `"fields"` key, `sources` line, `--fields` arg. |
| `pipeline/tests/test_fields.py` (new) | Unit tests for both modules (synthetic data, mocked requests) + a real-file check (skipped without the file). |
| `prototype/world.js` (modify) | `FIELD_KINDS`, `fieldUV`, `meshLift`; `layoutFromWorld` gains `fields`. |
| `prototype/tests/world.test.mjs` (modify) | Node tests for the three. |
| `prototype/index.html` (modify) | `TEX.meadow`, `fieldMeshes()`, rectangle loop gate, role tables, `BEAM_ROLES`, hooks, Credits link. |
| `prototype/about.js`, `prototype/strings.js` (modify) | `ABOUT_LINKS.agis`, `aboutAgis` en/de. |
| `prototype/tests/test_fields.py` (new) | Playwright: fields present, draped over terrain, none on the Geuerenstrasse. |
| `prototype/tests/test_smoke.py` (modify) | nothing but the `green` list lives in index.html; test file unchanged — re-run it. |
| `data/world_hochrhein.json`, `data/README.md`, `CREDITS.md`, `docs/02-data-sources.md`, `docs/11-pipeline-osm.md`, `CHANGELOG.md` | Data and attribution. |

---

### Task 1: `fields_ch.py` — fetch the cantonal parcels (offline-testable)

**Files:**
- Create: `pipeline/fields_ch.py`
- Test: `pipeline/tests/test_fields.py`

**Interfaces:**
- `lv95_bbox(bbox, pad=100.0) -> (emin, nmin, emax, nmax)`; `bbox` is lon/lat `(W, S, E, N)` like `geo.DEFAULT_BBOX`.
- `wfs_url(lv95, count=5000, start=0, hits=False) -> str` — one GetFeature URL (`SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:nutzungsflaechen&SRSNAME=EPSG:2056&BBOX=…,EPSG:2056&OUTPUTFORMAT=geojson&COUNT=…&STARTINDEX=…`, or `RESULTTYPE=hits`).
- `fetch(bbox, out: Path, session=None, count=5000) -> int` — number of features written; skips when `out` exists; writes `out.with_suffix('.part')` then renames; pages until a page returns fewer than `count`.

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_fields.py
import json
from pathlib import Path

import pytest
import shapely

import fields_ch as FC
import world_fields as WFI
from geo import Frame, DEFAULT_BBOX
from osm_read import Area

BASE = "https://geodienste.ch/db/lwb_nutzungsflaechen_v2_0/deu"


def test_lv95_bbox_covers_the_world_bbox():
    emin, nmin, emax, nmax = FC.lv95_bbox(DEFAULT_BBOX, pad=0)
    assert 2635100 < emin < 2635200 and 2644400 < emax < 2644600      # measured 2026-10-31
    assert 1261100 < nmin < 1261200 and 1269100 < nmax < 1269300
    e2, n2, e3, n3 = FC.lv95_bbox(DEFAULT_BBOX, pad=100)
    assert e2 == pytest.approx(emin - 100) and n3 == pytest.approx(nmax + 100)


def test_wfs_url_pages_and_counts():
    u = FC.wfs_url((1, 2, 3, 4), count=50, start=100)
    assert u.startswith(BASE + "?") and "TYPENAMES=ms:nutzungsflaechen" in u and "SRSNAME=EPSG:2056" in u
    assert "BBOX=1,2,3,4,EPSG:2056" in u and "OUTPUTFORMAT=geojson" in u and "COUNT=50" in u and "STARTINDEX=100" in u
    assert "RESULTTYPE=hits" in FC.wfs_url((1, 2, 3, 4), hits=True)


class _Resp:
    def __init__(self, body): self.body = body
    def raise_for_status(self): pass
    def json(self): return self.body


class _Session:
    def __init__(self, pages): self.pages = pages; self.urls = []
    def get(self, url, timeout=None):
        self.urls.append(url); return _Resp(self.pages.pop(0))


def _fc(n):
    return {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"lnf_code": 513}, "geometry": None} for _ in range(n)]}


def test_fetch_pages_until_a_short_page_and_caches(tmp_path):
    out = tmp_path / "lwb" / "x.geojson"
    s = _Session([_fc(2), _fc(2), _fc(1)])
    assert FC.fetch(DEFAULT_BBOX, out, session=s, count=2) == 5
    assert [("STARTINDEX=%d" % i in u) for i, u in zip((0, 2, 4), s.urls)] == [True, True, True]
    assert len(json.loads(out.read_text())["features"]) == 5 and not out.with_suffix(".part").exists()
    s2 = _Session([])
    assert FC.fetch(DEFAULT_BBOX, out, session=s2) == 5 and s2.urls == []        # cache hit: no request
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest tests/test_fields.py -q`
Expected: FAIL — `ModuleNotFoundError: fields_ch` (and `world_fields`; create an empty `world_fields.py` for now so the import of Task 1 can be run, or write Task 2's module first — either order is fine).

- [ ] **Step 3: Implement**

```python
# pipeline/fields_ch.py
"""#506: the cantons' Landwirtschaftliche Nutzungsflächen (crop per parcel) from the geodienste.ch WFS.

Kanton Aargau: frei erhältlich, Open Data, "Freie Nutzung. Quellenangabe ist Pflicht." Attribution:
"Landwirtschaftliche Nutzungsflächen © Kanton Aargau, geodienste.ch". Fetched into cache/lwb/ (gitignored) by

    python pipeline/fields_ch.py fetch --out cache/lwb/hochrhein.geojson

and read by `osm.py build --fields cache/lwb/hochrhein.geojson`. Never called from build_world (offline builds)."""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlencode

import geo

BASE = "https://geodienste.ch/db/lwb_nutzungsflaechen_v2_0/deu"
TYPENAME = "ms:nutzungsflaechen"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def lv95_bbox(bbox, pad=100.0):
    """lon/lat (W, S, E, N) -> LV95 (emin, nmin, emax, nmax) around all four corners, padded."""
    corners = [geo._TO_LV95.transform(x, y) for x in (bbox[0], bbox[2]) for y in (bbox[1], bbox[3])]
    return (min(c[0] for c in corners) - pad, min(c[1] for c in corners) - pad,
            max(c[0] for c in corners) + pad, max(c[1] for c in corners) + pad)


def wfs_url(lv95, count=5000, start=0, hits=False):
    q = {"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature", "TYPENAMES": TYPENAME,
         "SRSNAME": "EPSG:2056", "BBOX": "%s,%s,%s,%s,EPSG:2056" % tuple(lv95)}
    if hits:
        q["RESULTTYPE"] = "hits"
    else:
        q.update({"OUTPUTFORMAT": "geojson", "COUNT": count, "STARTINDEX": start})
    return BASE + "?" + urlencode(q, safe=":,")


def fetch(bbox, out, session=None, count=5000):
    out = Path(out)
    if out.exists():
        n = len(json.loads(out.read_text(encoding="utf-8"))["features"])
        log(f"fields: {out} exists ({n} features), not fetching")
        return n
    if session is None:
        import requests
        session = requests.Session()
    lv95 = lv95_bbox(bbox)
    feats, start = [], 0
    log(f"fields: fetching Nutzungsflächen for LV95 {tuple(round(v) for v in lv95)} from geodienste.ch")
    while True:
        r = session.get(wfs_url(lv95, count, start), timeout=300)
        r.raise_for_status()
        page = r.json()["features"]
        feats += page
        log(f"fields: page at {start}: {len(page)} features")
        if len(page) < count:
            break
        start += len(page)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part")
    tmp.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    tmp.rename(out)
    log(f"fields: wrote {len(feats)} features to {out}")
    return len(feats)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download the parcels for a lon/lat bbox (anonymous WFS, ~7 MB for the Hochrhein)")
    f.add_argument("--out", required=True)
    f.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), default=geo.DEFAULT_BBOX)
    a = ap.parse_args(argv)
    fetch(tuple(a.bbox), a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the same command. Expected: the three `fields_ch` tests PASS (Task 2's tests are not written yet).

- [ ] **Step 5: Commit**

```bash
git add pipeline/fields_ch.py pipeline/tests/test_fields.py
git commit -m "feat(pipeline): fetch the cantonal Nutzungsflächen from geodienste.ch (#506)"
```

---

### Task 2: `world_fields.py` — kinds, corridors, seam, direction, OSM fallback

**Files:**
- Create: `pipeline/world_fields.py`
- Test: `pipeline/tests/test_fields.py` (append)

**Interfaces:**
- `KINDS = ("cereal", "maize", "rapeseed", "root", "fallow", "bare", "meadow", "meadowDry", "pasture", "orchard", "vine")`
- `kind_of(code: int) -> str | None` — table from the spec; `None` for 8xx/9xx/unknown.
- `osm_kind(tags, id) -> str | None` — `meadow`→`meadow`, `orchard`→`orchard`, `vineyard`→`vine`, `farmland`→`("cereal","cereal","maize","bare","rapeseed")[id % 5]`, else `None`.
- `direction(p) -> float` — long-side angle of `shapely.minimum_rotated_rectangle(p)` in game frame radians, folded to `[0, π)`, rounded 0.01.
- `build(features, areas, roads, rail, clip, frame) -> (fields, stats)`; `features` = GeoJSON feature dicts (EPSG:2056) or `None`/`[]`; `areas` = `osm_read.Area` list; `roads` = road dicts `{w, pts, …}`; `rail` = `[[[x, z], …], …]`; `clip` = shapely box in game coords; `frame` = `geo.Frame`.
- Constants: `FIELD_GAP = 1.0`, `RAIL_GAP = 3.0`, `PARKING_GAP = 3.0`, `SEAM = 1.5`, `SIMPLIFY = 1.0`, `MIN_AREA = 300.0`, `OSM_GAP = 2.0`.

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_fields.py`:

```python
FRAME = Frame(47.5506, 7.9671)          # the Hochrhein origin: e0 2639781.3458, n0 1266787.0805
CLIP = shapely.box(-2000, -2000, 2000, 2000)


def lwb(code, ring_game, overlay=False, kanton="AG"):
    """A WFS feature in EPSG:2056 from a ring given in game metres."""
    coords = [[FRAME.e0 + x, FRAME.n0 - z] for x, z in ring_game] + [[FRAME.e0 + ring_game[0][0], FRAME.n0 - ring_game[0][1]]]
    return {"type": "Feature", "properties": {"lnf_code": code, "nutzung": "x", "ist_ueberlagernd": overlay,
                                              "flaeche_m2": 1, "bezugsjahr": 2025, "kanton": kanton,
                                              "identifikator_be": "secret", "nutzungsidentifikator": "secret"},
            "geometry": {"type": "MultiPolygon", "coordinates": [[coords]]}}


def rect(x0, z0, x1, z1):
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]


def road(pts, w=6.0):
    return {"cls": "residential", "w": w, "bridge": False, "pts": pts}


def poly(entry):
    return shapely.Polygon(entry["ring"], entry.get("holes", []))


@pytest.mark.parametrize("code,kind", [
    (513, "cereal"), (502, "cereal"), (516, "cereal"), (508, "maize"), (521, "maize"), (527, "rapeseed"),
    (522, "root"), (528, "root"), (531, "root"), (556, "fallow"), (559, "fallow"), (598, "bare"), (599, "bare"),
    (601, "meadow"), (613, "meadow"), (693, "meadow"), (611, "meadowDry"), (616, "pasture"), (617, "pasture"),
    (702, "orchard"), (704, "orchard"), (701, "vine"), (717, "vine"), (852, None), (902, None), (903, None), (951, None), (42, None),
])
def test_kind_of(code, kind):
    assert WFI.kind_of(code) == kind
    if kind is not None:
        assert kind in WFI.KINDS


def test_osm_kind_is_deterministic_and_only_for_fields():
    assert WFI.osm_kind({"landuse": "meadow"}, 7) == "meadow"
    assert WFI.osm_kind({"landuse": "vineyard"}, 7) == "vine"
    assert WFI.osm_kind({"landuse": "orchard"}, 7) == "orchard"
    assert WFI.osm_kind({"landuse": "forest"}, 7) is None and WFI.osm_kind({"natural": "water"}, 7) is None
    kinds = {WFI.osm_kind({"landuse": "farmland"}, i) for i in range(10)}
    assert kinds == {"cereal", "maize", "bare", "rapeseed"}
    assert WFI.osm_kind({"landuse": "farmland"}, 3) == WFI.osm_kind({"landuse": "farmland"}, 3)


def test_direction_follows_the_long_side():
    assert WFI.direction(shapely.Polygon(rect(0, 0, 200, 40))) == pytest.approx(0.0, abs=0.02)
    assert WFI.direction(shapely.Polygon(rect(0, 0, 40, 200))) == pytest.approx(1.57, abs=0.02)
    tilted = shapely.affinity.rotate(shapely.Polygon(rect(0, 0, 200, 40)), 30, use_radians=False)
    d = WFI.direction(tilted)
    assert 0 <= d < 3.15 and (abs(d - 0.52) < 0.03 or abs(d - 2.62) < 0.03)   # ±30° depending on the z-south frame


def test_build_maps_kinds_cuts_corridors_and_insets():
    feats = [lwb(513, rect(0, 0, 200, 100)), lwb(601, rect(0, 120, 200, 220)), lwb(951, rect(0, 0, 200, 100), overlay=True),
             lwb(902, rect(300, 0, 400, 100))]
    fields, stats = WFI.build(feats, [], [road([[100, -50], [100, 300]], w=6)], [[[-50, 50], [250, 50]]], CLIP, FRAME)
    assert stats["lwb"] == 2 and stats["dropped_code"] == 2
    assert {f["kind"] for f in fields} == {"cereal", "meadow"} and all(f["src"] == "lwb" for f in fields)
    corridor = shapely.LineString([[100, -50], [100, 300]]).buffer(3 + WFI.FIELD_GAP - 0.01)
    rail_zone = shapely.LineString([[-50, 50], [250, 50]]).buffer(WFI.RAIL_GAP - 0.01)
    for f in fields:
        p = poly(f)
        assert not p.intersects(corridor) and not p.intersects(rail_zone)
        assert shapely.box(0, 0, 200, 220).buffer(-WFI.SEAM / 2 + 0.05).contains(p)      # inset by half the seam
        assert "identifikator" not in json.dumps(f) and all(len(pt) == 2 for pt in f["ring"])
        assert f["ring"][0] != f["ring"][-1] and 0 <= f["dir"] < 3.15
    assert stats["parts"] == len(fields) and len(fields) == 6     # 2 parcels x (left of road, right of road) with the rail cut: cereal 4 parts, meadow 2 parts


def test_build_osm_fills_only_where_lwb_has_nothing():
    feats = [lwb(513, rect(0, 0, 200, 100))]
    areas = [Area(11, True, {"landuse": "farmland"}, shapely.Polygon(rect(0, 0, 200, 100))),           # under the parcel: dropped
             Area(12, True, {"landuse": "meadow"}, shapely.Polygon(rect(-500, 0, -300, 100))),          # free: kept
             Area(13, True, {"landuse": "forest"}, shapely.Polygon(rect(-500, 200, -300, 300)))]
    fields, stats = WFI.build(feats, areas, [], [], CLIP, FRAME)
    assert stats["lwb"] == 1 and stats["osm"] == 1
    osm = [f for f in fields if f["src"] == "osm"]
    assert len(osm) == 1 and osm[0]["kind"] == "meadow" and poly(osm[0]).area == pytest.approx(199 * 99, rel=0.03)


def test_build_without_lwb_is_osm_only_and_empty_is_empty():
    assert WFI.build(None, [], [], [], CLIP, FRAME) == ([], {})
    areas = [Area(5, True, {"landuse": "farmland"}, shapely.Polygon(rect(0, 0, 100, 100)))]
    fields, stats = WFI.build(None, areas, [], [], CLIP, FRAME)
    assert len(fields) == 1 and fields[0]["src"] == "osm" and fields[0]["kind"] == WFI.osm_kind({"landuse": "farmland"}, 5)


def test_build_drops_small_parts_and_clips():
    feats = [lwb(513, rect(1900, 0, 2100, 100)), lwb(513, rect(500, 500, 515, 515))]
    fields, stats = WFI.build(feats, [], [], [], CLIP, FRAME)
    assert len(fields) == 1 and poly(fields[0]).bounds[2] <= 2000 and stats["dropped_small"] == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest tests/test_fields.py -q`
Expected: FAIL on every `WFI.*` attribute.

- [ ] **Step 3: Implement**

```python
# pipeline/world_fields.py
"""#506: farm fields. Cantonal Nutzungsflächen (crop per parcel, EPSG:2056 GeoJSON from fields_ch.py) first, OSM
landuse=farmland|meadow|orchard|vineyard where the cantonal data has nothing (the German bank, gaps). Every parcel keeps
off roads, rail and car parks in here, so the game can never draw a field under a road (#290)."""
import math
from collections import Counter

import numpy as np
import shapely
from shapely.validation import make_valid

import world_parking

FIELD_GAP = 1.0      # m beyond the road's half width
RAIL_GAP = 3.0       # m either side of a track centre line
PARKING_GAP = 3.0    # m around a car park lot
SEAM = 1.5           # m of grass between neighbouring parcels (each parcel inset by half)
SIMPLIFY = 1.0       # m, topology-preserving
MIN_AREA = 300.0     # m2
OSM_GAP = 2.0        # m: OSM fields keep this far off any cantonal parcel

KINDS = ("cereal", "maize", "rapeseed", "root", "fallow", "bare", "meadow", "meadowDry", "pasture", "orchard", "vine")
# lnf_code (MGDM 153.1 "Nutzungsflächen") -> kind. Exact codes first, then the hundreds' fallbacks.
KIND_BY_CODE = {
    **{c: "cereal" for c in range(501, 517)}, 508: "maize", 521: "maize", 527: "rapeseed",
    **{c: "root" for c in (522, 523, 528, 531, 536, *range(540, 552))},
    **{c: "fallow" for c in range(556, 560)}, 598: "bare",
    611: "meadowDry", 616: "pasture", 617: "pasture",
    701: "vine", 717: "vine", **{c: "orchard" for c in range(702, 706)},
}
FALLBACK_BY_HUNDRED = {5: "bare", 6: "meadow", 7: "orchard"}
OSM_FARMLAND = ("cereal", "cereal", "maize", "bare", "rapeseed")
OSM_KINDS = {"meadow": "meadow", "orchard": "orchard", "vineyard": "vine"}


def kind_of(code):
    try:
        code = int(code)
    except (TypeError, ValueError):
        return None
    return KIND_BY_CODE.get(code) or FALLBACK_BY_HUNDRED.get(code // 100)


def osm_kind(tags, id):
    lu = tags.get("landuse")
    if lu == "farmland":
        return OSM_FARMLAND[int(id) % len(OSM_FARMLAND)]
    return OSM_KINDS.get(lu)


def direction(p):
    """The long side of the minimum rotated rectangle, as an angle in the game frame folded to [0, pi)."""
    box = shapely.minimum_rotated_rectangle(p)
    pts = list(box.exterior.coords)[:4]
    (ax, az), (bx, bz), (cx, cz) = pts[0], pts[1], pts[2]
    if math.hypot(bx - ax, bz - az) < math.hypot(cx - bx, cz - bz):
        ax, az, bx, bz = bx, bz, cx, cz
    return round(math.atan2(bz - az, bx - ax) % math.pi, 2)


def _polys(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon" and not p.is_empty]


def _ring(coords):
    return [[round(x, 1), round(z, 1)] for x, z in list(coords)[:-1]]


def _to_game(frame, geom):
    def f(xy):
        x, z = frame.lv95_to_game(xy[:, 0], xy[:, 1])
        return np.column_stack([x, z])
    return shapely.transform(geom, f)


def _lwb(features, clip, frame, stats):
    out = []
    for ft in features or []:
        p = ft.get("properties") or {}
        if p.get("ist_ueberlagernd"):
            stats["dropped_overlay"] += 1
            continue
        kind = kind_of(p.get("lnf_code"))
        if kind is None:
            stats["dropped_code"] += 1
            continue
        g = shapely.geometry.shape(ft["geometry"])
        g = _to_game(frame, g if g.is_valid else make_valid(g)).intersection(clip)
        if g.is_empty:
            continue
        stats["lwb"] += 1
        out.append((kind, g, "lwb"))
    return out


def _osm(areas, clip, taken, stats):
    out = []
    for a in areas:
        kind = osm_kind(a.tags, a.id)
        if kind is None:
            continue
        g = a.geom if a.geom.is_valid else make_valid(a.geom)
        g = g.intersection(clip)
        if taken is not None:
            g = g.difference(taken)
        if g.is_empty:
            continue
        stats["osm"] += 1
        out.append((kind, g, "osm"))
    return out


def _cuts(areas, roads, rail):
    cuts = [shapely.LineString(r["pts"]).buffer(r["w"] / 2 + FIELD_GAP) for r in roads if len(r["pts"]) > 1]
    cuts += [shapely.LineString(line).buffer(RAIL_GAP) for line in rail if len(line) > 1]
    cuts += [a.geom.buffer(PARKING_GAP, join_style="mitre") for a in areas if world_parking.selected(a.tags)]
    return shapely.unary_union(cuts) if cuts else None


def _entry(kind, p, src):
    e = {"kind": kind, "ring": _ring(p.exterior.coords)}
    holes = [_ring(i.coords) for i in p.interiors if shapely.Polygon(i).area >= MIN_AREA]
    if holes:
        e["holes"] = holes
    e["dir"] = direction(p)
    e["src"] = src
    return e


def build(features, areas, roads, rail, clip, frame):
    """Fields inside `clip`: cantonal parcels, then OSM where they leave room; minus corridors; inset by SEAM/2."""
    stats = Counter()
    parcels = _lwb(features, clip, frame, stats)
    taken = shapely.unary_union([g for _, g, _ in parcels]).buffer(OSM_GAP) if parcels else None
    parcels += _osm(areas, clip, taken, stats)
    if not parcels:
        return [], {}
    cut = _cuts(areas, roads, rail)
    if cut is not None:
        shapely.prepare(cut)
    kept = []
    for kind, g, src in parcels:
        if cut is not None:
            g = g.difference(cut)
        g = g.buffer(-SEAM / 2)
        for p in _polys(g):
            if p.area < MIN_AREA:
                stats["dropped_small"] += 1
                continue
            s = p.simplify(SIMPLIFY, preserve_topology=True)
            for q in _polys(s):
                if q.area >= MIN_AREA:
                    kept.append((kind, q, src))
                else:
                    stats["dropped_small"] += 1
    kept.sort(key=lambda t: (t[1].bounds[0], t[1].bounds[1]))
    stats["parts"] = len(kept)
    stats["area_ha"] = round(sum(q.area for _, q, _ in kept) / 1e4)
    return [_entry(k, q, s) for k, q, s in kept], dict(stats)
```

Note on `test_build_maps_kinds_cuts_corridors_and_insets`'s part count: the road at x = 100 splits both parcels, the rail at z = 50 splits the cereal parcel again (4 parts), the meadow parcel is not touched by the rail (2 parts) → 6. If the implementation differs legitimately (e.g. the inset merges nothing), fix the expectation only after checking the geometry by hand, never by loosening the corridor assertions.

- [ ] **Step 4: Run the tests to verify they pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/world_fields.py pipeline/tests/test_fields.py
git commit -m "feat(pipeline): world_fields builds crop parcels off roads and rail (#506)"
```

---

### Task 3: wire `--fields` into `osm.py build`, rebuild the world file

**Files:**
- Modify: `pipeline/osm.py` (`build_world`, `cmd_build`, argparse `build`)
- Modify: `pipeline/tests/test_fields.py` (real-file check), `docs/11-pipeline-osm.md`
- Rebuild: `data/world_hochrhein.json`

- [ ] **Step 1: Write the failing test** (append to `pipeline/tests/test_fields.py`)

```python
WORLD = Path(__file__).resolve().parents[2] / "data" / "world_hochrhein.json"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="data/world_hochrhein.json not built")


@needs_world
def test_real_world_fields_cover_the_swiss_side_and_keep_off_roads():
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    fields = w.get("fields", [])
    assert len(fields) >= 3000, len(fields)
    assert sum(poly(f).area for f in fields) / 1e4 >= 2500
    assert {f["kind"] for f in fields} >= set(WFI.KINDS) - {"vine"}      # vines are rare in the bbox; everything else must occur
    assert {f["src"] for f in fields} == {"lwb", "osm"}
    assert any("Kanton Aargau" in s for s in w["sources"])
    corridors = shapely.unary_union([shapely.LineString(r["pts"]).buffer(r["w"] / 2 + WFI.FIELD_GAP - 0.05)
                                     for r in w["roads"] if len(r["pts"]) > 1])
    shapely.prepare(corridors)
    tree = shapely.STRtree([poly(f) for f in fields])
    hits = [i for i in tree.query(corridors, predicate="intersects")]
    assert hits == [], f"{len(hits)} fields touch a road corridor, e.g. {fields[hits[0]]['ring'][:2]}"
```

- [ ] **Step 2: Run it** — Expected: FAIL (`fields` missing → `len([]) >= 3000`).

- [ ] **Step 3: Implement**

In `pipeline/osm.py`:
- `import world_fields` next to the other `world_*` imports.
- `build_world(..., near_classes=world_buildings.MAIN, fields_geojson=None)`; docstring: "`fields_geojson`: the cantonal parcels from `fields_ch.py fetch` (EPSG:2056 GeoJSON path); None → OSM fields only".
- After `rail, rail_bridges = world_rail.build(data.ways, clip)` (line ~131):

```python
    lwb = json.loads(Path(fields_geojson).read_text(encoding="utf-8"))["features"] if fields_geojson else None
    fields, field_stats = world_fields.build(lwb, data.areas, osm_roads + game_roads, rail, clip, frame)
    log(f"fields: {field_stats}")
```

- `sources`: append `["Fields: Landwirtschaftliche Nutzungsflächen © Kanton Aargau, geodienste.ch"]` when `field_stats.get("lwb")`.
- Return dict: `"fields": fields,` after `"forests": forests,`.
- `cmd_build`: pass `fields_geojson=a.fields`; argparse: `b.add_argument("--fields", default=None, metavar="GEOJSON", help="#506: cantonal Nutzungsflächen from fields_ch.py fetch; without it fields come from OSM landuse only")`.
- `docs/11-pipeline-osm.md`: schema line `"fields":    [{ kind, ring: [[x, z], ...], holes?, dir, src }],` after `forests`; in "Run it" add the fetch step before the build and `--fields cache/lwb/hochrhein.geojson` to the build command; "Attribution" gets the Aargau line; "Known limits": generated worlds (`osm.py world`) get OSM fields only.

- [ ] **Step 4: Fetch and rebuild (foreground, capped)**

```bash
cd pipeline
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python fields_ch.py fetch --out cache/lwb/hochrhein.geojson
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --fields cache/lwb/hochrhein.geojson
ls -la ../data/world_hochrhein.json    # was 4.3 MB; budget +1.5 MB
```

If `cache/osm/hochrhein.osm.pbf` is missing, follow `docs/11-pipeline-osm.md` "Run it" (`osm.py cut`) — or, if the Geofabrik extracts are not on disk either, stop and say so in the PR: the world file cannot be rebuilt on this box. Do not hand-edit the JSON.

- [ ] **Step 5: Run the tests**

`cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest tests/test_fields.py tests/test_forests.py tests/test_world_cli.py -q` — Expected: PASS, including the real-file test. If the corridor assertion fails, the fix is in `world_fields._cuts` (a road list missing), never in the test.

- [ ] **Step 6: Commit**

```bash
git add pipeline/osm.py pipeline/tests/test_fields.py docs/11-pipeline-osm.md data/world_hochrhein.json
git commit -m "feat(pipeline): build fields into the Hochrhein world from the Aargau parcels (#506)"
```

---

### Task 4: `world.js` — `FIELD_KINDS`, `fieldUV`, `meshLift`, `layoutFromWorld.fields`

**Files:**
- Modify: `prototype/world.js` (append after `ribbonLift`; `layoutFromWorld` at :116)
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- `FIELD_KINDS`: frozen `{ cereal: { color: '#d9c57c', role: 'field' }, maize: { color: '#4e7d38', role: 'field' }, rapeseed: { color: '#cfc94a', role: 'field' }, root: { color: '#5f8a3f', role: 'field' }, fallow: { color: '#b9a95f', role: 'meadow' }, bare: { color: '#9b7b55', role: 'field' }, meadow: { color: '#86aa4e', role: 'meadow' }, meadowDry: { color: '#a6ad5a', role: 'meadow' }, pasture: { color: '#8db05a', role: 'meadow' }, orchard: { color: '#5a8a46', role: 'field' }, vine: { color: '#6d8f4a', role: 'field' } }`.
- `fieldUV(x, z, cx, cz, dir, tile = 20) → [u, v]`: `u = ((x − cx)·cos dir + (z − cz)·sin dir) / tile`, `v = (−(x − cx)·sin dir + (z − cz)·cos dir) / tile`.
- `meshLift(pts, tris, h, hAt, step = 2) → Float64Array(pts.length)`: per triangle `[a, b, c]` (indices into `pts` `[x, z]` with heights `h[i]`), sample a lattice of barycentric points with spacing ≤ `step` m (the three vertices included), `excess = max(hAt(p) − trisHeightAt(thisTri, p))`, `lift[a|b|c] = max(lift, excess)`.

- [ ] **Step 1: Write the failing tests**

Add `FIELD_KINDS, fieldUV, meshLift` to the last `import … from '../world.js'` line in `world.test.mjs`, then append:

```js
// #506
const PIPELINE_KINDS = ['cereal', 'maize', 'rapeseed', 'root', 'fallow', 'bare', 'meadow', 'meadowDry', 'pasture', 'orchard', 'vine'];   // mirrors world_fields.KINDS

test('FIELD_KINDS covers every kind the pipeline emits, with a colour and a ground role', () => {
  for (const k of PIPELINE_KINDS) { assert.ok(FIELD_KINDS[k], k); assert.match(FIELD_KINDS[k].color, /^#[0-9a-f]{6}$/); assert.ok(['field', 'meadow'].includes(FIELD_KINDS[k].role), k); }
  assert.deepEqual(Object.keys(FIELD_KINDS).sort(), [...PIPELINE_KINDS].sort());
});

test('fieldUV runs u along dir and v across it', () => {
  const [u0, v0] = fieldUV(20, 0, 0, 0, 0);            assert.ok(Math.abs(u0 - 1) < 1e-9 && Math.abs(v0) < 1e-9);
  const [u1, v1] = fieldUV(0, 20, 0, 0, 0);            assert.ok(Math.abs(u1) < 1e-9 && Math.abs(v1 - 1) < 1e-9);
  const [u2, v2] = fieldUV(0, 20, 0, 0, Math.PI / 2);  assert.ok(Math.abs(u2 - 1) < 1e-9 && Math.abs(v2) < 1e-9);   // dir along +z: furrows along z
  const [u3] = fieldUV(10, 0, 0, 0, 0, 10);            assert.ok(Math.abs(u3 - 1) < 1e-9);
});

test('meshLift lifts a triangle over a ridge inside it and leaves a plane alone', () => {
  const pts = [[0, 0], [16, 0], [0, 16]], tris = [[0, 1, 2]];
  const ridge = ([x, z]) => Math.max(0, 0.3 - Math.abs(x + z - 8) * 0.1);   // peak 0.3 along x + z = 8, zero at the vertices
  const up = meshLift(pts, tris, [0, 0, 0], ridge);
  assert.ok(up[0] >= 0.3 - 0.02 && up[1] >= 0.3 - 0.02 && up[2] >= 0.3 - 0.02, `up ${[...up]}`);
  const plane = ([x, z]) => 0.1 * x + 0.05 * z;
  const flat = meshLift(pts, tris, pts.map(plane), plane);
  assert.ok(Math.max(...flat) < 1e-9, `flat ${[...flat]}`);
  const dip = ([x, z]) => -Math.max(0, 0.3 - Math.abs(x + z - 8) * 0.1);    // ground below the triangle: no lift, never a lowering
  assert.ok(Math.max(...meshLift(pts, tris, [0, 0, 0], dip)) === 0);
});

test('layoutFromWorld carries fields and defaults to none', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], railBridges: [], grades: [], props: [], parking: [], streams: [], boundaries: [], forests: [], anchors: {}, bbox: [0, 0, 1, 1], sources: [] };
  assert.deepEqual(layoutFromWorld(base).fields, []);
  const f = [{ kind: 'cereal', ring: [[0, 0], [10, 0], [10, 10]], dir: 0, src: 'lwb' }];
  assert.deepEqual(layoutFromWorld({ ...base, fields: f }).fields, f);
});
```

(If `layoutFromWorld` needs other keys than the ones in `base`, copy them from the existing `layoutFromWorld` test in the file rather than guessing.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/world.test.mjs`
Expected: FAIL — the three names are not exported.

- [ ] **Step 3: Implement**

In `layoutFromWorld`'s returned object add `fields: w.fields || [],` next to `forests`. Append after `ribbonLift` (and its companions):

```js
// #506: farm fields. kind (world_fields.KINDS in the pipeline) -> vertex colour and ground role (field = furrows, meadow = mown grass).
export const FIELD_KINDS = Object.freeze({
  cereal: { color: '#d9c57c', role: 'field' }, maize: { color: '#4e7d38', role: 'field' }, rapeseed: { color: '#cfc94a', role: 'field' },
  root: { color: '#5f8a3f', role: 'field' }, fallow: { color: '#b9a95f', role: 'meadow' }, bare: { color: '#9b7b55', role: 'field' },
  meadow: { color: '#86aa4e', role: 'meadow' }, meadowDry: { color: '#a6ad5a', role: 'meadow' }, pasture: { color: '#8db05a', role: 'meadow' },
  orchard: { color: '#5a8a46', role: 'field' }, vine: { color: '#6d8f4a', role: 'field' },
});

// #506: texture coordinates of a parcel so the stripes of TEX.field (which vary with v) run along `dir`, the parcel's long side.
export function fieldUV(x, z, cx, cz, dir, tile = 20) {
  const c = Math.cos(dir), s = Math.sin(dir), dx = x - cx, dz = z - cz;
  return [(dx * c + dz * s) / tile, (-dx * s + dz * c) / tile];
}

// #506: how far to lift each vertex of a draped triangle mesh so every triangle stays on or over hAt([x, z]) (the ribbonLift
// idea for triangles): a barycentric lattice at most `step` m apart per triangle, the worst excess goes to its three corners.
export function meshLift(pts, tris, h, hAt, step = 2) {
  const up = new Float64Array(pts.length);
  for (const [a, b, c] of tris) {
    const tri = [pts[a][0], h[a], pts[a][1], pts[b][0], h[b], pts[b][1], pts[c][0], h[c], pts[c][1]];
    const longest = Math.max(Math.hypot(pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]), Math.hypot(pts[c][0] - pts[b][0], pts[c][1] - pts[b][1]), Math.hypot(pts[a][0] - pts[c][0], pts[a][1] - pts[c][1]));
    const n = Math.max(1, Math.ceil(longest / step));
    let e = 0;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v, x = pts[a][0] * w + pts[b][0] * u + pts[c][0] * v, z = pts[a][1] * w + pts[b][1] * u + pts[c][1] * v;
      const drawn = trisHeightAt(tri, x, z);
      if (drawn !== -Infinity) e = Math.max(e, hAt([x, z]) - drawn);
    }
    if (e > up[a]) up[a] = e; if (e > up[b]) up[b] = e; if (e > up[c]) up[c] = e;
  }
  return up;
}
```

- [ ] **Step 4: Run the tests to verify they pass** — same command. Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): field kinds, parcel UVs and meshLift for draped field meshes (#506)"
```

---

### Task 5: `index.html` — draw the parcels

**Files:**
- Modify: `prototype/index.html` — import line (~:596), `TEX.meadow` after `TEX.field` (:726), new `fieldMeshes()` next to `waterPolys()` (:1823), the rectangle loop (:1868), the material tables (:2731, :2733), `castShadow` list (:2266), `BEAM_ROLES` (:4556), `grassOverRoad` `green` (:3976), `rayHits` roles (:3965), `window.__mm.counts`.

- [ ] **Step 1: Write the failing browser test** — `prototype/tests/test_fields.py` (new):

```python
"""#506: real farm parcels on the Swiss side, draped on the terrain, never on a road."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_smoke import ARGS, WORLD, MMH   # flat import, like test_suedspange.py's `from test_street_labels import ARGS, WORLD, needs_world`

needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")


@needs_world
def test_fields_are_drawn_on_the_terrain_and_off_the_roads(server):
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.counts && window.__mm.counts.fields && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.wait_for_selector("#mmhstatus.real", timeout=240000)
        counts = page.evaluate("() => window.__mm.counts.fields")
        centre = page.evaluate("() => window.__mm.fieldProbe()")        # a ray at the centre of the largest Sisslerfeld parcel
        road = page.evaluate("() => window.__mm.rayHits(280, 418.2)")   # Geuerenstrasse centre line (#290 spot)
        br.close()
    print(counts, centre, road)
    assert counts["n"] >= 3000 and counts["lwb"] >= 2500 and counts["osm"] >= 1 and counts["tris"] < 400000, counts
    assert centre["hit"] in ("field", "meadow") and 0.01 <= centre["y"] - centre["terrain"] <= 0.6, centre
    assert road["field"] is None and road["meadow"] is None, road
```

`window.__mm.fieldProbe()` (added below) picks the largest `lwb` field by ring area with centroid x > 4000 (the Sisslerfeld lies east of the Sisseln, around x 4500–5800, z −600–300; the implementer confirms with the built file and may hard-code the centroid instead) and rays at its centroid: `{ hit: role|null, y, terrain: terrainH }`.

- [ ] **Step 2: Run it to verify it fails** (after pushing the branch): `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest tests/test_fields.py -q -x` — Expected: FAIL at `wait_for_function` (no `counts.fields`) with the 240 s timeout, or faster if the hook is stubbed first.

- [ ] **Step 3: Implement**

1. Import `FIELD_KINDS, fieldUV, meshLift` from `./world.js` on the existing import line.
2. `TEX.meadow` after `TEX.field` (:726):

```js
TEX.meadow = makeTex(256, 256, (g, w, h) => { noise(g, w, h, '#cfcfb8', 22, 2400); g.fillStyle = 'rgba(60,80,30,.07)'; for (let y = 0; y < h; y += 26) g.fillRect(0, y, w, 13); });   // #506: mown bands, 2 m on a 20 m tile, a quarter of the furrow contrast
```

3. `fieldMeshes()` next to `waterPolys()`:

```js
  // #506: the real parcels, draped on the terrain. Kept 1 m off every road by the pipeline (world_fields), so a ray from a
  // road can never hit one; meshLift keeps each triangle over the terrain folds between its vertices (no grass patches on a field).
  const FIELD_LIFT = 0.02;
  const fieldMeshes = () => {
    const counts = { n: 0, tris: 0, lwb: 0, osm: 0 };
    L.fields.forEach((f, idx) => {
      const spec = FIELD_KINDS[f.kind]; if (!spec) return;
      const ring = f.ring.map(([x, z]) => new THREE.Vector2(x, z)), holes = (f.holes || []).map(h => h.map(([x, z]) => new THREE.Vector2(x, z)));
      const coarse = THREE.ShapeUtils.triangulateShape(ring, holes); if (!coarse.length) return;
      const { pts, tris } = subdivideTris([f.ring, ...(f.holes || [])].flat(), coarse, 16);
      const h = pts.map(([x, z]) => terrainH(x, z) + FIELD_LIFT), up = meshLift(pts, tris, h, ([x, z]) => terrainH(x, z));
      let cx = 0, cz = 0; for (const [x, z] of f.ring) { cx += x; cz += z; } cx /= f.ring.length; cz /= f.ring.length;
      const jit = 0.94 + 0.12 * rng(idx * 7919 + 17)(), base = col(spec.color).multiplyScalar(jit);
      const pos = [], uv = [], colr = [];
      for (const [a, b, c] of tris) for (const i of [a, c, b]) { const [x, z] = pts[i]; pos.push(x, h[i] + up[i], z); uv.push(...fieldUV(x, z, cx, cz, f.dir)); colr.push(base.r, base.g, base.b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.computeVertexNormals();
      push(spec.role, g); counts.n++; counts.tris += tris.length; counts[f.src === 'osm' ? 'osm' : 'lwb']++;
    });
    window.__mm.counts.fields = counts;
  };
```

   Winding: `waterPolys` flips the triangle order so the normal points +y; check which order `triangulateShape` returns for this ring orientation (the pipeline emits shapely exterior rings, counter-clockwise in x/z) and use the order that gives an upward normal — verify by `g.computeVertexNormals()` giving `ny > 0` in a node-free check (`rayHits` hitting it from above is the real test; `side` is `FrontSide`).
   `rng(seed)` is `world.js:669` — a *separate* generator per field, so the shared `rr` sequence is untouched.
4. Call `if (L && L.fields.length) fieldMeshes();` right after `if (L) waterPolys();`.
5. The rectangle loop (:1868): change `push('field', g);` to `if (!(L && L.fields.length)) push('field', g);` — everything before it (the `rr` calls) stays.
6. Materials: `original` map table gets `meadow: TEX.meadow`; `smooth` flat table gets `meadow: '#8aa84f'`. The smooth `MeshStandardMaterial` (:2733) turns `vertexColors` *off* for a listed set of roles (`road`, `grass`, `wall`, …) and keeps it on for every other role, `field` included — do **not** add `meadow` to that exclusion list, so the per-kind colour shows in both styles.
7. `castShadow` exclusion list (:2266): add `'meadow'`. `BEAM_ROLES` (:4556): add `'meadow'`.
8. `grassOverRoad` (:3976): `green = [MESH.grass, MESH.field, MESH.meadow].filter(Boolean)`. `rayHits` (:3965): roles `['grass', 'field', 'meadow', 'road', 'roadOsm', 'stone', 'rail']`.
9. `window.__mm.fieldProbe = () => { … }`: largest `lwb` field (shoelace area over `ring`) with centroid x > 4000, ray from (cx, 2000, cz) down against `[MESH.field, MESH.meadow].filter(Boolean)` → `{ hit: hit?.object.userData.role ?? null, y: hit?.point.y ?? null, terrain: terrainH(cx, cz), at: [cx, cz] }`.
10. `window.__mm.counts` must exist before `fieldMeshes` runs (it is created at :996; fine).

- [ ] **Step 4: Commit and push, then run the browser tests (foreground)**

```bash
git add prototype/index.html prototype/tests/test_fields.py
git commit -m "feat(world): draw the farm parcels on the terrain (#506)"
git push -u origin HEAD
cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest tests/test_fields.py "tests/test_smoke.py::test_grass_and_fields_stay_below_the_road" "tests/test_smoke.py::test_wheels_do_not_sink_into_the_road" -q -x
```

Expected: PASS. If `counts.tris >= 400000`, raise the `subdivideTris` edge to 24 and re-run; note it in the PR. If `grassOverRoad` reports a field over a road, the pipeline corridor is incomplete — fix `world_fields._cuts`/the road list passed in Task 3 and rebuild the world file; do not touch the lift or the test.

Also run `tests/test_suedspange.py` once (it calls `grassOverRoad(100, 'Südspange')`).

- [ ] **Step 5: Measure for the PR body**: world build time before/after (stopwatch on `#worldstatus`, osm world, one run each on the GPU browser), `counts.fields`, the world file size delta.

---

### Task 6: textures and palette check (graphics)

**Files:**
- Modify: `prototype/index.html` (`TEX.field`, `TEX.meadow`), `prototype/world.js` (`FIELD_KINDS` colours only)

- [ ] **Step 1:** Fetch the SWISSIMAGE reference (not committed; into a `mktemp -d` folder):
  `curl -o sisslerfeld.jpg "https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&CRS=EPSG:2056&BBOX=2644000,1266500,2646000,1268000&WIDTH=1600&HEIGHT=1200&FORMAT=image/jpeg"` and look at it.
- [ ] **Step 2:** Take a screenshot of the game at the Plattform Sisslerfeld (`window.__mm.sim` or the existing screenshot helpers in `prototype/tests/`, GPU browser) in both styles. Compare: cereal must read beige, maize dark green, meadows green, the furrows visible at car height and from the heli, the seams visible from above. Adjust the hex values in `FIELD_KINDS` and the stripe contrast in `TEX.field`/`TEX.meadow` only; keep the kinds list (the node test pins it).
- [ ] **Step 3:** Re-run `node --test tests/world.test.mjs`. Commit `feat(world): tune the field palette against SWISSIMAGE (#506)` with the before/after screenshots attached to the PR (not committed).

---

### Task 7: credits and attribution

**Files:**
- Modify: `prototype/about.js` (`ABOUT_LINKS`), `prototype/strings.js` (en :~272, de :~692), `prototype/index.html` (:518), `CREDITS.md`, `data/README.md`, `docs/02-data-sources.md`
- Test: `prototype/tests/strings.test.mjs` (same key set, already enforced), `prototype/tests/about.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `prototype/tests/about.test.mjs`:

```js
test('the Aargau parcels are credited with a link (#506)', () => {
  assert.equal(ABOUT_LINKS.agis, 'https://geodienste.ch/services/lwb_nutzungsflaechen');
});
```

and to `strings.test.mjs` (next to the other per-key checks):

```js
test('aboutAgis names the canton and the attribution duty in both languages (#506)', () => {
  assert.match(STRINGS.en.aboutAgis, /Kanton Aargau/); assert.match(STRINGS.en.aboutAgis, /geodienste\.ch/); assert.match(STRINGS.en.aboutAgis, /attribution/i);
  assert.match(STRINGS.de.aboutAgis, /Kanton Aargau/); assert.match(STRINGS.de.aboutAgis, /Quellenangabe/);
});
```

(Use whatever the file already imports for the strings table.)

- [ ] **Step 2: Run** `node --test tests/about.test.mjs tests/strings.test.mjs` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - `about.js`: `agis: 'https://geodienste.ch/services/lwb_nutzungsflaechen',` after `swisstopo`.
  - `strings.js` en: `aboutAgis: 'Farm fields: Landwirtschaftliche Nutzungsflächen © Kanton Aargau via geodienste.ch (free use, attribution required)',`; de: `aboutAgis: 'Felder: Landwirtschaftliche Nutzungsflächen © Kanton Aargau via geodienste.ch (freie Nutzung, Quellenangabe Pflicht)',`.
  - `index.html` :518: `…<a data-link="swisstopo" data-i18n="aboutSwisstopo"></a><br><a data-link="agis" data-i18n="aboutAgis"></a></dd>`.
  - `CREDITS.md`: `- Landwirtschaftliche Nutzungsflächen © Kanton Aargau via geodienste.ch (https://geodienste.ch/services/lwb_nutzungsflaechen), frei erhältlich / Open Data, Quellenangabe Pflicht`
  - `data/README.md`: the `world_hochrhein.json` row's Content adds "farm fields", its licence cell adds "Farm fields (Swiss side): Landwirtschaftliche Nutzungsflächen © Kanton Aargau, geodienste.ch (free use, attribution required); German bank: OSM."
  - `docs/02-data-sources.md`: a section "Switzerland: cantonal farm parcels (geodienste.ch)" with the capabilities URL, the service page, the terms quote, the anonymous-access note, and the fetch command.

- [ ] **Step 4: Run** the two node test files — Expected: PASS. Then the About browser test that covers the Credits tab: `python -m pytest tests/test_about_tabs.py -q` (foreground, capped).

- [ ] **Step 5: Commit**

```bash
git add prototype/about.js prototype/strings.js prototype/index.html CREDITS.md data/README.md docs/02-data-sources.md prototype/tests/about.test.mjs prototype/tests/strings.test.mjs
git commit -m "docs(credits): credit the Kanton Aargau farm parcels (#506)"
```

---

### Task 8: CHANGELOG

- [ ] Under `## [Unreleased]` add `### Added` (above `### Fixed` if absent) with one entry, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, player voice, e.g.: ``- `YYYY-MM-DD HH:MM` Das **Sisslerfeld** und die ganze Schweizer Seite haben jetzt echte **Äcker und Wiesen**: Winterweizen beige, Mais dunkelgrün, Raps gelb, Wiesen grün — die Parzellen und ihre Furchen folgen den amtlichen Nutzungsflächen des Kantons Aargau. Auf der deutschen Seite sind die Felder aus OpenStreetMap.``
- [ ] Commit `docs(changelog): farm fields (#506)`.

---

### Task 9: PR

- [ ] Push, open the PR against `main`: title `feat(world): farm fields from the Aargau Nutzungsflächen (#506)`; body with Summary, Changes, Testing (the exact commands run and their results), the budget numbers from Task 5 Step 5, the screenshots from Task 6, `Closes #506`.
