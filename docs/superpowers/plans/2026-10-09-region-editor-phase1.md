# Region editor phase 1: `build_world` for any Swiss rectangle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `region.build_world(rect, out_dir)` builds any rectangle inside Switzerland (1–4 km a side, snapped to 250 m) into `world.json` + `terrain.mmh` + `meta.json` with a generated start, J list, village names, forests and name, and `osm.py world --bbox …` runs it from the command line (#166).

**Architecture:** New modules `frame.py` (snap, size, Switzerland check, world id), `osm_cut.py` (a cut that stays under 2 GB), `places.py` (start, villages, J list, Gemeinde name) and `region.py`, which runs cut → terrain → `osm.build_world` (no anchors file, clipped to the frame) → generated content and writes it into the world file (`anchors`, `forests`, a new `region` block) and `meta.json`, so a generated world needs no hand-edited JS. Curated regions (`osm.py build` + anchors) are untouched.

**Tech Stack:** Python 3 + pyosmium + shapely + pyproj + numpy + requests (all in the venv), pytest; osmium-tool CLI for the cut only.

**Spec:** `docs/superpowers/specs/2026-10-09-region-editor-design.md` (phase 1: sections 1, 4, 5 for the pipeline).

**Split:** the automatic race moves to a follow-up issue with its own plan, `docs/superpowers/plans/2026-10-09-region-editor-phase1-race.md` (all of phase 1 does not fit one issue body). Here `anchors.cps` stays empty and `region.race` `null`: free-driving worlds with a start.

## Global Constraints

- TDD per task; never weaken an existing assertion. Tests: `cd pipeline && ./.venv/bin/python -m pytest -q` (CI: `python -m pytest -q`).
- Anything that may use > 1 GB (the Swiss extract, osmium on it, a real `osm.py world`) runs as `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`. Exit 137 or SIGTERM = cap hit: stop and report, never raise the cap. Without `systemd-run --user` (CI) skip those steps.
- Tests need neither the 547 MB Swiss extract nor a download: synthetic `.osm` from `tests/synth_osm.py`, hand fixtures, terrain faked.
- No new Python packages, no `package.json`. No change to `prototype/`, `data/`, `anchors*.json`, `geo.DEFAULT_*`; the Hochrhein golden tests stay green unchanged.
- Never the public Overpass API or OSM tile servers. The Switzerland outline comes once from the geo.admin.ch REST API (swissBOUNDARIES3D, © swisstopo).
- Conventional Commits, explicit `git add <paths>`. Push before Task 6's long runs.
- **CHANGELOG: no entry, `test-todo.md`: nothing.** Phase 1 adds a map-maker CLI; nothing in the game changes.

## Review Focus

- **A frame inside a big wood or lake** whose outline lies outside the cut: the wood must still appear (Task 2; Task 6 checks 44 woods against the smart-cut reference).
- **A frame with no main road, no place, no Gemeinde line**: still builds — no start, empty J list, name "Region E/N" (`test_empty_frame_still_builds_for_free_driving`).
- **A frame across a Gemeinde border**: "A · B", never an empty name (`test_world_name_one_or_two_gemeinden`, `test_game_box_and_fallback_name`).
- **Frames at the border**: Büsingen, Liechtenstein, across the Rhine are refused with `outside-ch`; 4 × 4 km accepted, 4.25 km refused (`test_inside_switzerland`, `test_snap_refuses_bad_frames`).
- **The same church twice** (node and building) or more than 15 places: one entry each, at most 15 (`test_jlist_centres_first_then_kinds_dedupe_and_limit`).

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Branch and check the neighbours**

```bash
git fetch origin && git checkout -b feature/166-build-world origin/main
test -f pipeline/world_forests.py && echo "13-MERGED" || echo "13-NOT-MERGED"
grep -q "trail_ids" pipeline/osm.py && echo "157-MERGED" || echo "157-NOT-MERGED"
command -v osmium || echo "no osmium-tool: the cut test skips, Task 6 needs it"
```

- **13-NOT-MERGED**: Task 4 Step 3 creates `pipeline/world_forests.py`. **13-MERGED**: skip that step; `osm.build_world` already writes `forests`, which `region.generated` keeps.
- **157-NOT-MERGED**: nothing here needs it. Expect a small rebase conflict in `osm.build_world` (both change lines next to `spec = …`); keep both.

---

### Task 1: The frame — snap, size, Switzerland, world id

**Files:**
- Create: `pipeline/frame.py`, `pipeline/ch_outline.py`, `pipeline/ch_outline.geojson` (generated, ~90 kB)
- Test: `pipeline/tests/test_frame.py`

**Interfaces:**
- Produces: `frame.FrameError(code, message)` (`bad-bbox | too-small | too-big | outside-ch`); `frame.snap(e0, n0, e1, n1) -> rect` (LV95, edges rounded to 250 m); `frame.check(rect)`; `frame.inside_switzerland(rect) -> bool`; `frame.from_lonlat(w, s, e, n) -> rect`; `frame.lonlat_bbox(rect, pad=0.0) -> (W, S, E, N)`; `frame.origin(rect) -> (lat, lon)`; `frame.world_id(rect, version) -> str` (12 hex).

- [ ] **Step 1: Write the failing tests** — `pipeline/tests/test_frame.py`:

```python
"""#166: the frame -- snapping, size limits, the Switzerland check, lon/lat boxes, the world id."""
import pytest

import frame as F

EHR = (2667000.0, 1259750.0, 2669000.0, 1261750.0)   # 2 x 2 km around Ehrendingen, LV95


@pytest.mark.parametrize("raw,snapped", [((2667010, 1259760, 2668990, 1261740), EHR),
                                         ((2667000, 1259750, 2667900, 1261750), (2667000.0, 1259750.0, 2668000.0, 1261750.0)),
                                         ((2667100, 1259750, 2671100, 1263750), (2667000.0, 1259750.0, 2671000.0, 1263750.0))])
def test_snap_rounds_each_edge_to_250_m(raw, snapped):
    assert F.snap(*raw) == snapped


@pytest.mark.parametrize("rect,code", [((2667000, 1259750, 2667700, 1261750), "too-small"),   # 750 m
                                       ((2667000, 1259750, 2671200, 1260750), "too-big"),     # 4250 m
                                       ((2669000, 1259750, 2667000, 1261750), "bad-bbox"),
                                       ((2667000, 1261750, 2669000, 1261750), "bad-bbox")])
def test_snap_refuses_bad_frames(rect, code):
    with pytest.raises(F.FrameError) as e:
        F.snap(*rect)
    assert e.value.code == code


@pytest.mark.parametrize("rect,inside", [(EHR, True),
                                         ((2637000, 1263000, 2639000, 1265000), True),    # Stein AG
                                         ((2693000, 1283000, 2695000, 1285000), False),   # Büsingen (DE enclave)
                                         ((2637000, 1267000, 2639000, 1269000), False),   # Bad Säckingen (DE)
                                         ((2757000, 1222000, 2759000, 1224000), False),   # Vaduz (LI)
                                         ((2637000, 1264000, 2639000, 1268000), False)])  # across the Rhine
def test_inside_switzerland(rect, inside):
    assert F.inside_switzerland(rect) is inside


def test_check_raises_outside_ch():
    with pytest.raises(F.FrameError) as e:
        F.check((2693000.0, 1283000.0, 2695000.0, 1285000.0))
    assert e.value.code == "outside-ch"


def test_lonlat_bbox_origin_and_back():
    w, s, e, n = F.lonlat_bbox(EHR)
    assert 8.32 < w < 8.33 and 8.35 < e < 8.36 and 47.48 < s < 47.49 and 47.50 < n < 47.51
    pw, ps, pe, pn = F.lonlat_bbox(EHR, 500)
    assert pw < w and ps < s and pe > e and pn > n
    back = F.from_lonlat(w, s, e, n)
    assert back[0] <= EHR[0] and back[3] >= EHR[3]
    assert F.origin(EHR) == pytest.approx((47.4940, 8.3410), abs=1e-3)


def test_world_id_is_stable_and_version_dependent():
    a = F.world_id(EHR, "1")
    assert a == F.world_id(EHR, "1") and len(a) == 12 and int(a, 16) >= 0
    assert a != F.world_id(EHR, "2") and a != F.world_id((2667000.0, 1259750.0, 2669250.0, 1261750.0), "1")
```

- [ ] **Step 2: Run** `cd pipeline && ./.venv/bin/python -m pytest -q tests/test_frame.py` — Expected: FAIL (`No module named 'frame'`).

- [ ] **Step 3: The outline** — `pipeline/ch_outline.py`, then run it once: `./.venv/bin/python ch_outline.py` → `wrote …/ch_outline.geojson (90 kB)`.

```python
#!/usr/bin/env python3
"""#166, one-off: Switzerland's outline (swissBOUNDARIES3D, (c) swisstopo) from the geo.admin.ch REST API, simplified
50 m, LV95 -> ch_outline.geojson. Rerun only when the border data changes."""
import json
from pathlib import Path

import requests
import shapely

URL = ("https://api3.geo.admin.ch/rest/services/api/MapServer/"
       "ch.swisstopo.swissboundaries3d-land-flaeche.fill/CH?geometryFormat=geojson&sr=2056")
OUT = Path(__file__).with_name("ch_outline.geojson")

if __name__ == "__main__":
    r = requests.get(URL, timeout=120)
    r.raise_for_status()
    geom = shapely.set_precision(shapely.geometry.shape(r.json()["feature"]["geometry"]).simplify(50.0, preserve_topology=True), 1.0)
    OUT.write_text(json.dumps({"type": "Feature", "properties": {"source": "swissBOUNDARIES3D (c) swisstopo", "crs": "EPSG:2056"},
                               "geometry": shapely.geometry.mapping(geom)}, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e3:.0f} kB)")
```

- [ ] **Step 4: Implement** — `pipeline/frame.py`:

```python
"""#166: the frame of a generated world -- an LV95 rectangle (e0, n0, e1, n1), snapped to 250 m, 1-4 km a side,
entirely inside Switzerland."""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

import shapely
from pyproj import Transformer

GRID, MIN_SIDE, MAX_SIDE = 250.0, 1000.0, 4000.0
OUTLINE = Path(__file__).with_name("ch_outline.geojson")
_TO_LV95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
_TO_WGS = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)


class FrameError(ValueError):
    """A refused frame; `code` is bad-bbox, too-small, too-big or outside-ch."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def snap(e0: float, n0: float, e1: float, n1: float) -> tuple[float, float, float, float]:
    """Each edge to the nearest 250 m line; refuses sides under 1 km or over 4 km after snapping."""
    if not (e1 > e0 and n1 > n0):
        raise FrameError("bad-bbox", f"not a rectangle: {e0}, {n0}, {e1}, {n1}")
    rect = tuple(float(round(v / GRID) * GRID) for v in (e0, n0, e1, n1))
    w, h = rect[2] - rect[0], rect[3] - rect[1]
    if min(w, h) < MIN_SIDE:
        raise FrameError("too-small", f"frame {w:.0f} x {h:.0f} m: each side must be at least {MIN_SIDE:.0f} m")
    if max(w, h) > MAX_SIDE:
        raise FrameError("too-big", f"frame {w:.0f} x {h:.0f} m: each side must be at most {MAX_SIDE:.0f} m")
    return rect


def from_lonlat(w: float, s: float, e: float, n: float) -> tuple[float, float, float, float]:
    """The LV95 rectangle enclosing a lon/lat box (not snapped)."""
    xs, ys = _TO_LV95.transform([w, e, w, e], [s, s, n, n])
    return float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))


def lonlat_bbox(rect, pad: float = 0.0) -> tuple[float, float, float, float]:
    """(W, S, E, N) enclosing the rectangle grown by `pad` metres."""
    e0, n0, e1, n1 = rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad
    lons, lats = _TO_WGS.transform([e0, e1, e0, e1], [n0, n0, n1, n1])
    return tuple(round(float(v), 6) for v in (min(lons), min(lats), max(lons), max(lats)))


def origin(rect) -> tuple[float, float]:
    """(lat, lon) of the frame centre: the game origin of a generated world."""
    lon, lat = _TO_WGS.transform((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2)
    return round(float(lat), 6), round(float(lon), 6)


@lru_cache(maxsize=1)
def outline() -> shapely.Geometry:
    return shapely.geometry.shape(json.loads(OUTLINE.read_text(encoding="utf-8"))["geometry"])


def inside_switzerland(rect) -> bool:
    return bool(outline().contains(shapely.box(*rect)))


def check(rect) -> None:
    if not inside_switzerland(rect):
        raise FrameError("outside-ch", "the frame must lie entirely inside Switzerland")


def world_id(rect, version: str) -> str:
    """Same snapped frame + same pipeline version -> same id."""
    return hashlib.sha256("{:.0f},{:.0f},{:.0f},{:.0f}:{}".format(*rect, version).encode()).hexdigest()[:12]
```

- [ ] **Step 5: Run** — Expected: 16 passed.

- [ ] **Step 6: Commit** — `git add pipeline/frame.py pipeline/ch_outline.py pipeline/ch_outline.geojson pipeline/tests/test_frame.py && git commit -m "feat(pipeline): frame of a generated world, 250 m snap, inside Switzerland (#166)"`

---

### Task 2: The cut — simple extract plus completed woods and lakes

Measured 2026-10-09 (Swiss extract, 3.5 × 4 km at Ehrendingen, 1 km pad): `-s smart` / `complete_ways` hit the 2 GB cap; `-s simple` (1.9 GB) keeps 1.1 of 5.1 km² of forest (relation 4019, the Lägern wood, is missing). The four steps: all 44 woods, 1.92 GB, ~35 s.

**Files:**
- Create: `pipeline/osm_cut.py`, `pipeline/tests/synth_osm.py` (test helper: a synthetic extract, also used in Task 4)
- Test: `pipeline/tests/test_osm_cut.py`

**Interfaces:**
- Produces: `osm_cut.cut(extract, bbox, out, workdir) -> Path`; `osm_cut.incomplete_ids(cut_pbf, relations_pbf) -> list[str]` (`r<id>…`, then `w<id>…`); `extract_cmd`, `relations_cmd`, `getid_cmd`, `merge_cmd`; `is_area_of_interest(tags)`. `synth_osm.RECT`, `synth_osm.write(path) -> Path`.

- [ ] **Step 1: Write the failing tests** — `pipeline/tests/synth_osm.py`:

```python
"""#166: a synthetic extract for tests: a 7 x 7 road grid at 400 m around a 2 x 2 km frame near Ehrendingen, a village,
a hamlet, a church, a station, a school, one wood, two Gemeinden (Ahausen west of E 2668600, Bedorf east)."""
from pathlib import Path
from xml.sax.saxutils import quoteattr

from pyproj import Transformer

_TO_WGS = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)
RECT = (2667000.0, 1259750.0, 2669000.0, 1261750.0)
SPLIT_E = 2668600.0


def _tags(tags):
    return "".join(f"<tag k={quoteattr(k)} v={quoteattr(str(v))}/>" for k, v in tags.items())


def write(path) -> Path:
    nodes, ways, rels = [], [], []

    def node(e, n, **tags):
        lon, lat = _TO_WGS.transform(e, n)
        nodes.append(f'<node id="{len(nodes) + 1}" lat="{lat:.7f}" lon="{lon:.7f}">{_tags(tags)}</node>')
        return len(nodes)

    def way(refs, **tags):
        ways.append(f'<way id="{1000 + len(ways)}">' + "".join(f'<nd ref="{r}"/>' for r in refs) + _tags(tags) + "</way>")
        return 999 + len(ways)

    # crossings are shared nodes, nudged 3 m so world_roads' simplify keeps them (the game graph joins at shared vertices)
    grid = {(i, j): node(2666700 + 400 * i + (3 if (i + j) % 2 else -3), 1259450 + 400 * j + (3 if (i + j) % 2 else -3))
            for i in range(7) for j in range(7)}
    for j in range(7):
        way([grid[(i, j)] for i in range(7)], highway="secondary" if j == 3 else "residential", name=f"Querstrasse {j}")
    for i in range(7):
        way([grid[(i, j)] for j in range(7)], highway="tertiary" if i == 3 else "residential", name=f"Laengsstrasse {i}")
    node(2668000, 1260750, place="village", name="Ahausen")
    node(2668800, 1261500, place="hamlet", name="Bedorf")
    node(2667500, 1260300, amenity="place_of_worship", name="Kirche Ahausen")
    node(2668500, 1260250, railway="station", name="Ahausen Bahnhof")
    node(2667300, 1261300, amenity="school", name="Schulhaus Ahausen")
    ring = [node(e, n) for e, n in [(2667150, 1259900), (2667450, 1259900), (2667450, 1260200), (2667150, 1260200)]]
    way(ring + ring[:1], landuse="forest")
    lines = {k: way([node(*a), node(*b)], boundary="administrative", admin_level="8") for k, a, b in [
        ("w", (2665000, 1257000), (2665000, 1264000)), ("nw", (2665000, 1264000), (SPLIT_E, 1264000)),
        ("sw", (2665000, 1257000), (SPLIT_E, 1257000)), ("split", (SPLIT_E, 1257000), (SPLIT_E, 1264000)),
        ("ne", (SPLIT_E, 1264000), (2672000, 1264000)), ("se", (SPLIT_E, 1257000), (2672000, 1257000)),
        ("e", (2672000, 1257000), (2672000, 1264000))]}
    for rid, (name, members) in enumerate([("Ahausen", "w nw sw split"), ("Bedorf", "split ne se e")], start=5000):
        rels.append(f'<relation id="{rid}">' + "".join(f'<member type="way" ref="{lines[m]}" role="outer"/>' for m in members.split())
                    + _tags({"type": "boundary", "boundary": "administrative", "admin_level": "8", "name": name}) + "</relation>")
    path = Path(path)
    path.write_text("\n".join(['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6">', *nodes, *ways, *rels, "</osm>"]) + "\n",
                    encoding="utf-8")
    return path
```

`pipeline/tests/test_osm_cut.py`:

```python
"""#166: the light four-step cut (simple extract, area relations, getid -r, merge)."""
import shutil
from pathlib import Path

import osmium
import pytest

import frame as F
import osm_cut as C
from tests import synth_osm

needs_osmium = pytest.mark.skipif(shutil.which("osmium") is None, reason="osmium-tool not installed")

CUT = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="47.50" lon="8.30"/><node id="2" lat="47.50" lon="8.31"/><node id="3" lat="47.51" lon="8.31"/>
  <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="99"/><nd ref="1"/><tag k="landuse" v="forest"/></way>
  <way id="11"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="natural" v="wood"/></way>
  <way id="12"><nd ref="1"/><nd ref="2"/><nd ref="98"/><nd ref="1"/><tag k="building" v="yes"/></way>
  <way id="13"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way>
</osm>
"""
RELS = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <relation id="20"><member type="way" ref="13" role="outer"/><member type="way" ref="77" role="inner"/><tag k="type" v="multipolygon"/><tag k="landuse" v="forest"/></relation>
  <relation id="21"><member type="way" ref="78" role="outer"/><tag k="type" v="multipolygon"/><tag k="natural" v="water"/></relation>
</osm>
"""


def test_commands():
    bbox = (8.1, 47.4, 8.2, 47.5)
    assert C.extract_cmd("ch.pbf", bbox, "o.pbf") == ["osmium", "extract", "-b", "8.100000,47.400000,8.200000,47.500000",
                                                      "-s", "simple", "--overwrite", "-o", "o.pbf", "ch.pbf"]
    assert C.relations_cmd("ch.pbf", "r.pbf") == ["osmium", "tags-filter", "-R", "--overwrite", "-o", "r.pbf", "ch.pbf",
                                                  "r/landuse=forest", "r/natural=wood,water", "r/water"]
    assert C.getid_cmd("ch.pbf", "ids.txt", "c.pbf") == ["osmium", "getid", "-r", "--overwrite", "-i", "ids.txt", "-o", "c.pbf", "ch.pbf"]
    assert C.merge_cmd(["a.pbf", "b.pbf"], "m.pbf") == ["osmium", "merge", "--overwrite", "a.pbf", "b.pbf", "-o", "m.pbf"]


def test_is_area_of_interest():
    assert C.is_area_of_interest({"landuse": "forest"}) and C.is_area_of_interest({"natural": "water"})
    assert C.is_area_of_interest({"water": "lake"}) and not C.is_area_of_interest({"building": "yes"})


def test_incomplete_ids(tmp_path):
    (tmp_path / "cut.osm").write_text(CUT, encoding="utf-8")
    (tmp_path / "rels.osm").write_text(RELS, encoding="utf-8")
    # relation 20 has a member way in the cut, 21 has none; way 10 is a broken forest, 11 is whole, 12 is no area of interest
    assert C.incomplete_ids(tmp_path / "cut.osm", tmp_path / "rels.osm") == ["r20", "w10"]


@needs_osmium
def test_cut_on_the_synthetic_extract(tmp_path):
    src = synth_osm.write(tmp_path / "synth.osm")
    out = C.cut(src, F.lonlat_bbox(synth_osm.RECT, 100), tmp_path / "cut.osm.pbf", tmp_path)
    ways = {o.id: dict(o.tags) for o in osmium.FileProcessor(str(out), osmium.osm.WAY)}
    assert any(t.get("landuse") == "forest" for t in ways.values())      # the wood lies wholly inside: it survives
    assert not (tmp_path / "ids.txt").exists()                            # nothing to complete -> no getid step
    assert Path(out).stat().st_size > 0
```

- [ ] **Step 2: Run** `./.venv/bin/python -m pytest -q tests/test_osm_cut.py` — Expected: FAIL (`No module named 'osm_cut'`).

- [ ] **Step 3: Implement** — `pipeline/osm_cut.py`:

```python
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
```

- [ ] **Step 4: Run** — Expected: 4 passed (the last skips without osmium-tool).

- [ ] **Step 5: Commit** — `git add pipeline/osm_cut.py pipeline/tests/synth_osm.py pipeline/tests/test_osm_cut.py && git commit -m "feat(pipeline): 2 GB cut that completes woods and lakes at the edge (#166)"`

---

### Task 3: Places — start, villages, J list, the world's name

**Files:**
- Modify: `pipeline/osm_read.py` (`_is_named_node`, one constant)
- Create: `pipeline/places.py`, `pipeline/tests/fixtures/places.osm`
- Test: `pipeline/tests/test_places.py`

**Interfaces:**
- Consumes: `osm_read.NamedNode(id, tags, x, z)`, `osm_read.Area(id, from_way, tags, geom)`, world roads (`cls`, `pts`), boundary lines `[(names, LineString)]` from `world_boundaries.read`.
- Produces: `places.start_point(roads, clip) -> (x, z, th) | None`; `places.villages(named_nodes, clip) -> [{t, x, z, r}]`; `places.jlist(named_nodes, areas, clip, limit=15) -> [{n, kind, x, z}]`; `places.named_places(named_nodes, areas, clip, kinds) -> [(kind, name, x, z)]`; `places.gemeinde_at(x, z, lines)`; `places.world_name(lines, clip) -> str | None`; `places.kind_of(tags)`; `places.MAJOR`.

- [ ] **Step 1: Write the failing tests** — `pipeline/tests/fixtures/places.osm`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="47.5506" lon="7.9671"><tag k="place" v="village"/><tag k="name" v="Alpha"/></node>
  <node id="2" lat="47.5507" lon="7.9672"><tag k="place" v="square"/><tag k="name" v="Dorfplatz"/></node>
  <node id="3" lat="47.5508" lon="7.9673"><tag k="amenity" v="place_of_worship"/><tag k="name" v="Kirche"/></node>
  <node id="4" lat="47.5509" lon="7.9674"><tag k="amenity" v="school"/><tag k="name" v="Schulhaus"/></node>
  <node id="5" lat="47.5510" lon="7.9675"><tag k="amenity" v="townhall"/><tag k="name" v="Gemeindehaus"/></node>
  <node id="6" lat="47.5511" lon="7.9676"><tag k="leisure" v="stadium"/><tag k="name" v="Stadion"/></node>
  <node id="7" lat="47.5512" lon="7.9677"><tag k="amenity" v="bench"/></node>
</osm>
```

`pipeline/tests/test_places.py`:

```python
"""#166: generated places -- start point, village names, the J list, the world's name."""
import math
from pathlib import Path

import pytest
import shapely

import geo
import osm_read
import places as P
from osm_read import Area, NamedNode

CLIP = shapely.box(-1000, -1000, 1000, 1000)
L = shapely.LineString


def node(i, x, z, **tags):
    return NamedNode(i, tags, float(x), float(z))


def test_osm_read_keeps_place_and_j_nodes_named():
    data = osm_read.read(Path(__file__).parent / "fixtures" / "places.osm", geo.Frame(*geo.DEFAULT_ORIGIN))
    assert sorted(n.id for n in data.named_nodes) == [1, 2, 3, 4, 5, 6]          # 7 (a bench) is no place


def test_start_point_on_the_major_road_nearest_the_centre():
    roads = [{"cls": "residential", "pts": [[-900, 5], [900, 5]]}, {"cls": "secondary", "pts": [[100, -900], [100, 900]]}]
    x, z, th = P.start_point(roads, CLIP)
    assert (x, z) == (100.0, 0.0) and th == pytest.approx(math.pi / 2, abs=1e-4)
    assert P.start_point(roads[:1], CLIP) is None


def test_villages_shape_radius_order_and_frame():
    nodes = [node(1, 300, 0, place="village", name="Beta"), node(2, -300, 50, place="town", name="Alpha"),
             node(3, 0, 0, place="hamlet", name="Gamma"), node(4, 2000, 0, place="village", name="Outside"),
             node(5, 10, 10, place="neighbourhood", name="Quarter"), node(6, 20, 20, place="village")]
    assert P.villages(nodes, CLIP) == [{"t": "ALPHA", "x": -300.0, "z": 50.0, "r": 550},
                                       {"t": "GAMMA", "x": 0.0, "z": 0.0, "r": 300},
                                       {"t": "BETA", "x": 300.0, "z": 0.0, "r": 450}]


@pytest.mark.parametrize("tags,kind", [({"railway": "station"}, "station"), ({"amenity": "place_of_worship"}, "place_of_worship"),
                                       ({"tourism": "viewpoint"}, "viewpoint"), ({"leisure": "stadium"}, "stadium"),
                                       ({"place": "square"}, "square"), ({"amenity": "bench"}, None), ({"place": "village"}, None)])
def test_kind_of(tags, kind):
    assert P.kind_of(tags) == kind


def test_jlist_centres_first_then_kinds_dedupe_and_limit():
    nodes = [node(1, 400, 0, place="village", name="Beta"), node(2, -400, 0, place="village", name="Alpha"),
             node(3, 0, 0, place="hamlet", name="Weiler"), node(10, 50, 50, amenity="school", name="Schulhaus"),
             node(11, 60, 60, railway="station", name="Bahnhof"), node(12, 70, 70, amenity="place_of_worship", name="Kirche"),
             node(13, 5000, 0, railway="station", name="Far")]
    church = Area(20, True, {"building": "church", "amenity": "place_of_worship", "name": "Kirche"}, shapely.box(60, 60, 90, 90))
    hall = Area(21, True, {"building": "yes", "amenity": "townhall", "name": "Gemeindehaus"}, shapely.box(-50, -50, -30, -30))
    out = P.jlist(nodes, [church, hall], CLIP)
    assert [(e["n"], e["kind"]) for e in out] == [("Alpha", "village"), ("Beta", "village"), ("Bahnhof", "station"),
                                                  ("Gemeindehaus", "townhall"), ("Kirche", "place_of_worship"), ("Schulhaus", "school")]
    assert out[4]["x"] == 70.0                            # the node wins over its own building (same name, < 150 m)
    many = [node(100 + i, -900 + i * 50, 0, amenity="school", name=f"S{i:02d}") for i in range(30)]
    assert len(P.jlist(many, [], CLIP)) == P.J_MAX == 15 and P.jlist([], [], CLIP) == []


def boundary_lines(split_x=600.0):
    """Ahausen west of x = split_x, Bedorf east of it; outer lines carry one name, the split line both."""
    return [(["Ahausen"], L([(-3000, -3000), (-3000, 3000)])), (["Ahausen"], L([(-3000, -3000), (split_x, -3000)])),
            (["Ahausen"], L([(-3000, 3000), (split_x, 3000)])), (["Ahausen", "Bedorf"], L([(split_x, -3000), (split_x, 3000)])),
            (["Bedorf"], L([(split_x, -3000), (4000, -3000)])), (["Bedorf"], L([(split_x, 3000), (4000, 3000)])),
            (["Bedorf"], L([(4000, -3000), (4000, 3000)]))]


def test_gemeinde_at_from_ray_hits():
    assert P.gemeinde_at(0, 0, boundary_lines()) == "Ahausen" and P.gemeinde_at(2000, 0, boundary_lines()) == "Bedorf"
    assert P.gemeinde_at(0, 0, []) is None
    assert P.gemeinde_at(0, 0, [(["Ahausen"], L([(-3000, -10), (-3000, 10)]))]) is None    # one ray hits: not enough


def test_world_name_one_or_two_gemeinden():
    assert P.world_name(boundary_lines(600.0), CLIP) == "Ahausen"              # all 9 samples west of 600
    assert P.world_name(boundary_lines(250.0), CLIP) == "Ahausen · Bedorf"     # the x = 500 column (3 of 9) in Bedorf
    assert P.world_name([], CLIP) is None
```

- [ ] **Step 2: Run** `./.venv/bin/python -m pytest -q tests/test_places.py` — Expected: FAIL (`No module named 'places'`).

- [ ] **Step 3: `osm_read.py`** — place, church/school/town-hall and stadium nodes become named nodes (only `anchors._index` reads that list, by id, so curated worlds do not change). After `NODE_KEYS`:

```python
PLACE_AMENITIES = {"place_of_worship", "school", "townhall"}
```

and in `_is_named_node`, before the last `return`:

```python
    if "place" in tags or tags.get("amenity") in PLACE_AMENITIES or tags.get("leisure") == "stadium":
        return True   # #166: village names, the J list and checkpoint names of generated worlds
```

- [ ] **Step 4: Implement** — `pipeline/places.py`:

```python
"""#166: generated places of a world from OSM -- start point, village names, the J list, the world's name."""
from __future__ import annotations

import math
from collections import Counter

import shapely

MAJOR = {"primary", "secondary", "tertiary"}
PLACE_R = {"city": 700, "town": 550, "village": 450, "hamlet": 300}   # village-sign radius (prototype VILLAGES r)
CENTRES = ("city", "town", "village")                                   # J list: every village or town centre
J_KINDS = ("station", "townhall", "place_of_worship", "school", "attraction", "viewpoint", "stadium", "square")
J_MAX = 15
SAME_PLACE = 150.0     # m: the same name this close is one place (a church node and its building)
RAYS, RAY_LEN = 8, 20_000.0
SECOND_NAME_MIN = 3    # of 9 samples: a second Gemeinde this present makes the name "A · B"


def kind_of(tags) -> str | None:
    if tags.get("railway") == "station":
        return "station"
    if tags.get("amenity") in ("townhall", "place_of_worship", "school"):
        return tags["amenity"]
    if tags.get("tourism") in ("attraction", "viewpoint"):
        return tags["tourism"]
    if tags.get("leisure") == "stadium":
        return "stadium"
    return "square" if tags.get("place") == "square" else None


def _inside(clip, x, z) -> bool:
    return bool(clip.covers(shapely.Point(x, z)))


def start_point(roads, clip):
    """(x, z, th) on the primary/secondary/tertiary road nearest the frame centre, th along the road; None without."""
    c, best = clip.centroid, None
    for r in roads:
        if r["cls"] in MAJOR and len(r["pts"]) > 1:
            line = shapely.LineString(r["pts"])
            s = line.project(c)
            d = line.interpolate(s).distance(c)
            if best is None or d < best[0]:
                best = (d, line, s)
    if best is None:
        return None
    _, line, s = best
    p, a, b = line.interpolate(s), line.interpolate(max(0.0, s - 1.0)), line.interpolate(min(line.length, s + 1.0))
    return round(p.x, 1), round(p.y, 1), round(math.atan2(b.y - a.y, b.x - a.x), 5)


def villages(named_nodes, clip) -> list[dict]:
    """place=city/town/village/hamlet nodes in the frame -> [{t, x, z, r}], west to east."""
    out = [{"t": n.tags["name"].upper(), "x": round(n.x, 1), "z": round(n.z, 1), "r": PLACE_R[n.tags["place"]]}
           for n in named_nodes if n.tags.get("place") in PLACE_R and n.tags.get("name") and _inside(clip, n.x, n.z)]
    return sorted(out, key=lambda v: (v["x"], v["z"], v["t"]))


def named_places(named_nodes, areas, clip, kinds) -> list:
    """(kind, name, x, z) of every named node or area of the given kinds inside the frame, nodes first."""
    out = [(kind_of(n.tags), n.tags["name"], n.x, n.z) for n in named_nodes
           if kind_of(n.tags) in kinds and n.tags.get("name") and _inside(clip, n.x, n.z)]
    for a in areas:
        if kind_of(a.tags) in kinds and a.tags.get("name"):
            p = a.geom.representative_point()
            if _inside(clip, p.x, p.y):
                out.append((kind_of(a.tags), a.tags["name"], p.x, p.y))
    return out


def jlist(named_nodes, areas, clip, limit: int = J_MAX) -> list[dict]:
    """Every village/town centre (west to east), then J_KINDS in that order, each kind by name; one entry per place;
    at most `limit`. -> [{n, kind, x, z}]"""
    centres = sorted((n.x, n.z, n.tags["name"]) for n in named_nodes
                     if n.tags.get("place") in CENTRES and n.tags.get("name") and _inside(clip, n.x, n.z))
    picked = [{"n": name, "kind": "village", "x": round(x, 1), "z": round(z, 1)} for x, z, name in centres]
    rank = {k: i for i, k in enumerate(J_KINDS)}
    for k, name, x, z in sorted(named_places(named_nodes, areas, clip, set(J_KINDS)), key=lambda c: (rank[c[0]], *c[1:])):
        if not any(p["n"] == name and math.hypot(p["x"] - x, p["z"] - z) < SAME_PLACE for p in picked):
            picked.append({"n": name, "kind": k, "x": round(x, 1), "z": round(z, 1)})
    return picked[:limit]


def gemeinde_at(x, z, lines) -> str | None:
    """Cast RAYS rays; the first boundary line each crosses names the Gemeinden on both sides; the one name all hits
    share is the Gemeinde around the point. lines: [(names, LineString)]. None with fewer than two hits."""
    sets, here = [], shapely.Point(x, z)
    for k in range(RAYS):
        a = 2 * math.pi * k / RAYS
        ray = shapely.LineString([(x, z), (x + math.cos(a) * RAY_LEN, z + math.sin(a) * RAY_LEN)])
        hits = [(here.distance(ray.intersection(line)), names) for names, line in lines if ray.intersects(line)]
        if hits:
            sets.append(set(min(hits, key=lambda h: h[0])[1]))
    common = set.intersection(*sets) if len(sets) >= 2 else set()
    return next(iter(common)) if len(common) == 1 else None


def world_name(lines, clip) -> str | None:
    """The Gemeinde at the frame centre; "A · B" when a second one holds SECOND_NAME_MIN of 9 sample points."""
    x0, z0, x1, z1 = clip.bounds
    names = [gemeinde_at(x0 + (x1 - x0) * fx, z0 + (z1 - z0) * fz, lines) for fz in (0.25, 0.5, 0.75) for fx in (0.25, 0.5, 0.75)]
    centre = names[4] or next((n for n in names if n), None)
    others = Counter(n for n in names if n and n != centre)
    if centre and others:
        second, count = sorted(others.items(), key=lambda kv: (-kv[1], kv[0]))[0]
        if count >= SECOND_NAME_MIN:
            return f"{centre} · {second}"
    return centre
```

- [ ] **Step 5: Run** `./.venv/bin/python -m pytest -q tests/test_places.py tests/test_osm_read.py tests/test_anchors.py` — Expected: all pass.

- [ ] **Step 6: Commit** — `git add pipeline/osm_read.py pipeline/places.py pipeline/tests/fixtures/places.osm pipeline/tests/test_places.py && git commit -m "feat(pipeline): start, villages, J list and Gemeinde name from OSM (#166)"`

---

### Task 4: `region.build_world` — orchestration, world file, `meta.json`

**Files:**
- Modify: `pipeline/osm.py` (`build_world`: keyword-only `clip_box`, `data`; `anchors_path=None` allowed)
- Create: `pipeline/region.py`; `pipeline/world_forests.py` only on 13-NOT-MERGED
- Test: `pipeline/tests/test_region.py`

**Interfaces:**
- Consumes: Tasks 1–3; `osm.build_world`, `osm.write_world`, `terrain.build`, `mmh.write_mmh`, `world_boundaries.read`, `world_forests.build(areas, roads, clip) -> (forests, stats)`.
- Produces: `region.build_world(rect, out_dir, *, extract=None, pbf=None, cache=Path("cache"), dsm=True, progress=None, tile_cache_bytes=2e9) -> {"world", "terrain", "meta"}`; `region.PIPELINE_VERSION = "1"`; `region.generated(world, data, lines, clip, rect, wid) -> dict` (the race follow-up extends it); `rebase`, `prune_tiles`, `game_box`, `fallback_name`, `meta`.
- World file: `anchors = {landmarks: {}, cps: [], start?: [x, z, th], labels: village names, areas: {}}`; `forests`; `region = {id, name, gemeinden: [name], villages: [{t, x, z, r}], jlist: [{n, kind, x, z, g}], treeBox: [x0, x1, z0, z1], forestAbove: null, race: null}`. `meta.json = {format: "MMR1", id, pipelineVersion, name, bbox: {lv95, lonlat}, origin, base, built, extract: {file, modified}, race, counts, sources, license (ODbL notice), lastPlayed: null}`.

- [ ] **Step 1: Write the failing tests** — `pipeline/tests/test_region.py`:

```python
"""#166: build_world on a synthetic extract -- no download, no osmium cut; terrain is a fake flat grid."""
import json
import os
from types import SimpleNamespace

import numpy as np
import pytest
import shapely

import frame as F
import geo
import mmh
import region
from tests import synth_osm


def flat_terrain(bbox, origin, step, base, cache, dgm_dir):
    g = geo.grid_for(bbox, geo.Frame(*origin), step)
    header = {"format": "MMH1", "w": g["w"], "h": g["h"], "step": step, "x0": g["x0"], "z0": g["z0"],
              "origin": {"lat": origin[0], "lon": origin[1]}, "base": base, "min": 0.0, "max": 0.0, "bbox": list(bbox)}
    heights = np.full((g["h"], g["w"]), 412.6, dtype=np.float32)
    heights[0, 0] = 430.0
    return header, heights


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("region")
    mp = pytest.MonkeyPatch()
    mp.setattr(region.terrain, "build", flat_terrain)
    steps = []
    files = region.build_world(synth_osm.RECT, tmp / "out", pbf=synth_osm.write(tmp / "synth.osm"), cache=tmp / "cache",
                               dsm=False, progress=steps.append)
    mp.undo()
    return files, json.loads(files["world"].read_text("utf-8")), json.loads(files["meta"].read_text("utf-8")), steps


def test_files_steps_and_terrain_base(built):
    files, _, _, steps = built
    assert set(files) == {"world", "terrain", "meta"} and all(p.exists() for p in files.values())
    assert steps == ["terrain", "world", "places", "done"]                  # no cut: pbf= was given
    assert not [p for p in files["world"].parent.iterdir() if p.is_dir()]  # temp dir gone
    hdr, heights = mmh.read_mmh(files["terrain"])
    assert hdr["base"] == 412.0 and float(heights.min()) == pytest.approx(0.6, abs=1e-4)


def test_name_villages_jlist_start(built):
    _, world, meta, _ = built
    r, a = world["region"], world["anchors"]
    assert r["name"] == meta["name"] == "Ahausen" and r["gemeinden"] == ["Ahausen"]
    assert [v["t"] for v in r["villages"]] == ["AHAUSEN", "BEDORF"] == [lb["t"] for lb in a["labels"]]
    assert [(e["n"], e["kind"], e["g"]) for e in r["jlist"]] == [
        ("Ahausen", "village", "Ahausen"), ("Ahausen Bahnhof", "station", "Ahausen"),
        ("Kirche Ahausen", "place_of_worship", "Ahausen"), ("Schulhaus Ahausen", "school", "Ahausen")]
    assert len(a["start"]) == 3 and abs(a["start"][0]) < 200 and abs(a["start"][1]) < 200    # on the secondary/tertiary cross
    assert a["cps"] == [] and r["race"] is None and r["forestAbove"] is None


def test_forests_and_clip(built):
    _, world, meta, _ = built
    assert len(world["forests"]) == 1 == meta["counts"]["forests"]
    assert shapely.Polygon(world["forests"][0]["ring"]).area > 50_000
    x0, x1, z0, z1 = world["region"]["treeBox"]
    assert x1 - x0 == pytest.approx(2000, abs=0.2) and z1 - z0 == pytest.approx(2000, abs=0.2)
    assert all(x0 - 0.1 <= p[0] <= x1 + 0.1 and z0 - 0.1 <= p[1] <= z1 + 0.1 for r in world["roads"] for p in r["pts"])


def test_meta(built):
    _, world, meta, _ = built
    assert meta["id"] == F.world_id(synth_osm.RECT, region.PIPELINE_VERSION) == world["region"]["id"]
    assert meta["bbox"]["lv95"] == list(synth_osm.RECT) and meta["lastPlayed"] is None and meta["race"] is False
    assert "ODbL" in meta["license"] and meta["extract"]["file"] == "synth.osm" and meta["base"] == 412.0
    assert "Terrain: swissALTI3D © swisstopo" in meta["sources"] and world["origin"]["lat"] == F.origin(synth_osm.RECT)[0]


def test_build_world_refuses_bad_input(tmp_path):
    with pytest.raises(ValueError):
        region.build_world(synth_osm.RECT, tmp_path)                                         # neither extract nor pbf
    with pytest.raises(F.FrameError) as e:
        region.build_world((2693000, 1283000, 2695000, 1285000), tmp_path, pbf="x.osm")    # Büsingen
    assert e.value.code == "outside-ch"


def test_rebase_and_prune_tiles(tmp_path):
    hdr, _ = region.rebase({"base": 0.0}, np.array([[401.7, 405.0], [399.2, 420.0]], dtype=np.float32))
    assert hdr["base"] == 399.0 and hdr["min"] == pytest.approx(0.2, abs=1e-4) and hdr["max"] == pytest.approx(21.0)
    for i, name in enumerate(["a.tif", "b.tif", "c.tif"]):
        (tmp_path / name).write_bytes(b"x" * 100)
        os.utime(tmp_path / name, (1000 + i, 1000 + i))
    assert region.prune_tiles(tmp_path, 150) == 2 and [p.name for p in tmp_path.iterdir()] == ["c.tif"]
    assert region.prune_tiles(tmp_path / "missing", 0) == 0


def test_game_box_and_fallback_name():
    x0, z0, x1, z1 = region.game_box(synth_osm.RECT, geo.Frame(*F.origin(synth_osm.RECT)))
    assert x1 - x0 == pytest.approx(2000, abs=0.2) and z0 < 0 < z1
    clip = shapely.box(x0, z0, x1, z1)
    jl = [{"n": "Far", "kind": "village", "x": 900, "z": 900}, {"n": "Near", "kind": "village", "x": 10, "z": 0},
          {"n": "Kirche", "kind": "place_of_worship", "x": 0, "z": 0}]
    assert region.fallback_name(jl, clip, synth_osm.RECT) == "Near"
    assert region.fallback_name([], clip, synth_osm.RECT) == "Region 2667/1259"


def test_empty_frame_still_builds_for_free_driving():
    world = {"roads": []}
    r = region.generated(world, SimpleNamespace(named_nodes=[], areas=[]), [], shapely.box(-1000, -1000, 1000, 1000),
                         synth_osm.RECT, "abc")
    assert r["name"] == "Region 2667/1259" and r["jlist"] == [] and r["race"] is None
    assert world["anchors"]["cps"] == [] and "start" not in world["anchors"] and world["forests"] == []
```

- [ ] **Step 2: Run** `./.venv/bin/python -m pytest -q tests/test_region.py` — Expected: FAIL (`No module named 'region'`).

- [ ] **Step 3 (13-NOT-MERGED only): `pipeline/world_forests.py`** — copy the module **verbatim** from `docs/superpowers/plans/2026-10-03-forests.md`, Task 1, Step 3 (`selected`, `build(areas, roads, clip) -> (forests, stats)`), so #13's PR later adds an identical file; if #13's PR has changed it by then, take that version. Do not wire it into `osm.build_world` (that is #13's Task 2).

- [ ] **Step 4: `osm.build_world`** — new signature and first lines, `spec` without a file:

```python
def build_world(pbf, mmh_path, bbox, origin, house_dist, big_area, anchors_path, dsm_cache=None, *,
                clip_box=None, data=None) -> dict:
    """clip_box (game x0, z0, x1, z1) overrides the clip from the lon/lat bbox; data reuses an osm_read result;
    anchors_path None means no hand anchors (#166: generated worlds)."""
    frame = geo.Frame(*origin)
    if clip_box is None:
        xs, zs = frame.to_game([bbox[0], bbox[2]], [bbox[3], bbox[1]])
        clip_box = (float(xs[0]), float(zs[0]), float(xs[1]), float(zs[1]))
    clip = shapely.box(*clip_box)
    if data is None:
        log(f"reading {pbf}")
        data = osm_read.read(Path(pbf), frame)
    hdr = heights = None
    if mmh_path:
        hdr, heights = mmh.read_mmh(mmh_path)
    spec = anchors_mod.load(anchors_path) if anchors_path else {}
```

- [ ] **Step 5: Implement** — `pipeline/region.py`:

```python
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
import world_forests

PIPELINE_VERSION = "1"
PAD = 1000.0                       # m of OSM around the frame (roads and woods at the edge, Gemeinde lines)
STEP = 4.0                         # m terrain grid
TILE_CACHE_BYTES = 2_000_000_000   # swissSURFACE3D tiles kept after a build, oldest deleted first
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
    """Heights relative to the frame's lowest point (whole metres), so the valley floor sits near 0."""
    low = float(math.floor(float(np.nanmin(heights))))
    out = heights - low
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
    if "forests" not in world:   # #13 not wired into osm.build_world (yet)
        world["forests"], _ = world_forests.build(data.areas, world["roads"], clip)
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
    header, heights = rebase(*terrain.build(bbox, org, STEP, 0.0, cache, None))
    mmh.write_mmh(out, header, heights)
    return header


def _world(pbf, out_dir: Path, rect, cache: Path, dsm: bool, step):
    org = frame_mod.origin(rect)
    fr = geo.Frame(*org)
    box = game_box(rect, fr)
    header = _terrain(frame_mod.lonlat_bbox(rect), org, cache, out_dir / "terrain.mmh")
    step("world")
    data = osm_read.read(Path(pbf), fr)
    world = osm.build_world(pbf, out_dir / "terrain.mmh", frame_mod.lonlat_bbox(rect), org, 30.0, 1000.0, None,
                            cache if dsm else None, clip_box=box, data=data)
    world["sources"] += ["Terrain: swissALTI3D © swisstopo"] + (["Building heights: swissSURFACE3D © swisstopo"] if dsm else [])
    lines = [(names, line) for _, names, line in world_boundaries.read(Path(pbf), fr)]
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
    if dsm:
        log(f"pruned {prune_tiles(cache / 'swisssurface3d', tile_cache_bytes)} swissSURFACE3D tiles")
    log(f"world {wid} '{region['name']}' built: {len(region['jlist'])} J places, {len(region['villages'])} villages")
    step("done")
    return {"world": out_dir / "world.json", "terrain": out_dir / "terrain.mmh", "meta": out_dir / "meta.json"}
```

- [ ] **Step 6: Run** `tests/test_region.py`, then the whole suite — Expected: all pass; Hochrhein golden tests (where `cache/osm/hochrhein.osm.pbf` exists) unchanged.

- [ ] **Step 7: Commit** — `git add pipeline/osm.py pipeline/region.py pipeline/tests/test_region.py` (+ `pipeline/world_forests.py` if created) `&& git commit -m "feat(pipeline): build_world for any Swiss rectangle (#166)"`

---

### Task 5: `osm.py world` and docs

**Files:**
- Modify: `pipeline/osm.py` (`cmd_world`, the `world` sub-command, docstring), `docs/11-pipeline-osm.md`
- Test: `pipeline/tests/test_world_cli.py`

**Interfaces:**
- Produces: `python osm.py world (--bbox W S E N | --lv95 E0 N0 E1 N1) (--extract PBF | --pbf PBF) --out DIR [--cache DIR] [--no-dsm]`; prints the three paths; exit 2 on a refused frame.

- [ ] **Step 1: Write the failing tests** — `pipeline/tests/test_world_cli.py`:

```python
"""#166: `osm.py world` -- argument handling; the build itself is mocked."""
from pathlib import Path

import pytest

import frame as F
import osm
import region


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake(rect, out_dir, **kw):
        seen.append((rect, Path(out_dir), kw))
        return {"world": Path(out_dir) / "world.json", "terrain": Path(out_dir) / "terrain.mmh", "meta": Path(out_dir) / "meta.json"}
    monkeypatch.setattr(region, "build_world", fake)
    return seen


def test_lv95_and_pbf(calls, tmp_path, capsys):
    assert osm.main(["world", "--lv95", "2667000", "1259750", "2669000", "1261750", "--pbf", "r.osm.pbf", "--out", str(tmp_path), "--no-dsm"]) == 0
    rect, out, kw = calls[0]
    assert rect == (2667000.0, 1259750.0, 2669000.0, 1261750.0) and out == tmp_path
    assert kw["pbf"] == "r.osm.pbf" and kw["extract"] is None and kw["dsm"] is False and kw["cache"] == Path("cache")
    assert capsys.readouterr().out.split() == [str(tmp_path / n) for n in ("world.json", "terrain.mmh", "meta.json")]


def test_bbox_becomes_the_enclosing_lv95_rectangle(calls, tmp_path):
    assert osm.main(["world", "--bbox", "8.3283", "47.4850", "8.3550", "47.5030", "--extract", "ch.pbf", "--out", str(tmp_path)]) == 0
    rect, _, kw = calls[0]
    assert rect == F.from_lonlat(8.3283, 47.4850, 8.3550, 47.5030) and kw["extract"] == "ch.pbf" and kw["dsm"] is True


def test_refused_frame_exits_2(monkeypatch, tmp_path):
    def refuse(rect, out_dir, **kw):
        raise F.FrameError("outside-ch", "the frame must lie entirely inside Switzerland")
    monkeypatch.setattr(region, "build_world", refuse)
    assert osm.main(["world", "--lv95", "2693000", "1283000", "2695000", "1285000", "--pbf", "x", "--out", str(tmp_path)]) == 2


def test_extract_and_pbf_are_exclusive(tmp_path):
    with pytest.raises(SystemExit):
        osm.main(["world", "--lv95", "0", "0", "1", "1", "--pbf", "a", "--extract", "b", "--out", str(tmp_path)])
```

- [ ] **Step 2: Run** `./.venv/bin/python -m pytest -q tests/test_world_cli.py` — Expected: FAIL (`invalid choice: 'world'`).

- [ ] **Step 3: Implement** — in `pipeline/osm.py`, before `def main`:

```python
def cmd_world(a) -> int:
    import frame as frame_mod   # here, not at the top: region imports osm
    import region
    rect = tuple(a.lv95) if a.lv95 else frame_mod.from_lonlat(*a.bbox)
    try:
        files = region.build_world(rect, a.out, extract=a.extract, pbf=a.pbf, cache=Path(a.cache), dsm=not a.no_dsm,
                                   progress=lambda s: log(f"step: {s}"))
    except frame_mod.FrameError as e:
        log(f"frame refused ({e.code}): {e}")
        return 2
    for p in files.values():
        print(p)
    return 0
```

In `main`, after the `build` parser (and dispatch `if a.cmd == "world": return cmd_world(a)` after `parse_args`):

```python
    w = sub.add_parser("world", help="#166: any Swiss rectangle -> world.json + terrain.mmh + meta.json")
    where = w.add_mutually_exclusive_group(required=True)
    where.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), help="lon/lat box, snapped to 250 m LV95")
    where.add_argument("--lv95", nargs=4, type=float, metavar=("E0", "N0", "E1", "N1"), help="LV95 rectangle, snapped to 250 m")
    src = w.add_mutually_exclusive_group(required=True)
    src.add_argument("--extract", help="country extract to cut from (cache/osm/switzerland-latest.osm.pbf, ~1.9 GB peak)")
    src.add_argument("--pbf", help="an already cut regional .osm.pbf covering the frame plus 1 km")
    w.add_argument("--out", required=True, help="output folder")
    w.add_argument("--cache", default="cache", help="swisstopo tile cache (swissalti3d/, swisssurface3d/)")
    w.add_argument("--no-dsm", action="store_true", help="skip swissSURFACE3D building heights (~850 MB of tiles per 15 km2)")
```

Module docstring: add `world  any Swiss rectangle with generated content (#166), light except the cut`.

- [ ] **Step 4: Run** — Expected: 4 passed.

- [ ] **Step 5: Docs** — `docs/11-pipeline-osm.md`: add `frame.py`, `osm_cut.py`, `places.py`, `region.py` to the module list, and a section **"Any Swiss rectangle: `osm.py world` (#166)"** just before `## Load it in the prototype`, with: the capped Task 6 command; the steps and their measured cost (Task 2's numbers); the rules and constants of `frame`, `places` and `region` (as in their docstrings); the `region` and `meta.json` fields (Task 4 Interfaces); limits (`place=neighbourhood` gets no sign; no race until the follow-up; complexity limits and queue in phase 3; the game reads `region` from phase 2). Attribution: add "Switzerland outline: swissBOUNDARIES3D © swisstopo".

- [ ] **Step 6: Commit** — `git add pipeline/osm.py pipeline/tests/test_world_cli.py docs/11-pipeline-osm.md && git commit -m "feat(pipeline): osm.py world builds any Swiss rectangle (#166)"`

---

### Task 6: Real build (guarded, local only), full verification, PR

**Files:** none (worlds go to `/tmp`, never into `data/`).

- [ ] **Step 1: Push** — `git push -u origin feature/166-build-world`.

- [ ] **Step 2: Guard** — go on only if `systemd-run --user` works, `pipeline/cache/osm/switzerland-latest.osm.pbf` exists and `command -v osmium` succeeds; else write "Real build not run: <missing precondition>" in the PR and go to Step 4.

- [ ] **Step 3: Build Ehrendingen 3.5 × 4 km from the Swiss extract** (foreground, timeout ≥ 10 min), then the largest frame:

```bash
cd pipeline
/usr/bin/time -v systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 \
  ./.venv/bin/python osm.py world --lv95 2666500 1257750 2670000 1261750 \
  --extract cache/osm/switzerland-latest.osm.pbf --out /tmp/world-166 --no-dsm 2>&1 | tail -20
./.venv/bin/python -c "import json; w=json.load(open('/tmp/world-166/world.json')); r=w['region']; print(r['name'], w['anchors'].get('start'), len(w['forests']), [e['n'] for e in r['jlist']])"
```

Expected (prototype, 2026-10-09): exit 0, ~55 s, max RSS < 2.0 GB, "Ehrendingen", a start, 44 forests, 15 J places, `world.json` ≈ 0.5 MB, `terrain.mmh` ≈ 3.7 MB. Repeat with `--lv95 2666000 1257750 2670000 1261750` (4 × 4 km) and record its peak. Exit 137 / SIGTERM: report, do not raise the cap.

- [ ] **Step 4: Full verification** — `cd pipeline && ./.venv/bin/python -m pytest -q`; `node --test prototype/tests/*.test.mjs` (repo root).

- [ ] **Step 5: PR** — `feat(pipeline): build_world library for any Swiss rectangle (editor phase 1)`, repo template, `Closes #166`, the Step 3 numbers (or why not run), "no CHANGELOG entry: nothing player-visible", and the follow-ups: the automatic race (its plan file), phase 2 reads `region`.
