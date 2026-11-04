# Screenshot gallery (#556) Implementation Plan

**Goal:** A curated shot list `docs/gallery/shots.json`, a script `scripts/shots.py` that drives the game to each motif and writes JPGs (1920x1080 and 3840x2160), and a README section. The pipeline builds the list, the script, tests and docs. It does **not** produce or commit any image: the maintainer runs the script against the GPU browser afterwards and commits the images in a follow-up PR.

**Architecture:** `scripts/shots.py` holds pure helpers (validation, heading, file names, selection, README splice; unit-tested without a browser) and a thin Playwright driver (local static server, `PW_CDP_ENDPOINT` via `tests/gpu_browser.py`, one fresh context per motif, `__mm` hooks for placement and camera). `docs/gallery/shots.json` is the data. `tests/test_shots.py` has the pure tests, the data schema test and one hermetic smoke test. No change to `index.html` or any game module.

**Tech Stack:** Python 3 stdlib, Playwright (already the test dependency), pytest. Buildless game, no npm.

**Spec:** `docs/superpowers/specs/2026-11-04-screenshot-gallery-design.md`

## Global Constraints

- Do not create, fake, download or commit any gallery image; no PNG anywhere in the repo. The three existing `docs/gallery/plattform-*.jpg` stay untouched.
- Do not edit `index.html` or any game module. Names `scripts/shots.py`, `docs/gallery/shots.json`, `tests/test_shots.py` are fixed: `scripts/gallery.py` / `tests/test_gallery.py` are the unrelated world-gallery CLI (#170).
- Run Playwright only for the one smoke test (Task 4), in the **foreground**, never `run_in_background`, with `-k smoke` and a generous timeout. Do not run the full suite. Commit and push before starting that run.
- Do not use the GPU browser in the pipeline; the smoke test runs on SwiftShader (it honours `PW_CDP_ENDPOINT` if the runner sets it).
- Captions use `Rhyflitzer – Map Madness` (en dash). English text for code and README; `title_de` German with real umlauts.
- No CHANGELOG entry (README gallery is not in the game).
- Python style as in `scripts/gallery.py`: `from __future__ import annotations`, small functions, guard clauses.
- Conventional Commits, one commit per task.

## Review Focus

- The arrival wait is `camStep` convergence (car) or camera-position polling (heli, loco), never a fixed sleep as the arrival test.
- The clean-frame assertion runs before the first screenshot and covers `HIDDEN_SELECTORS` plus `#overlay`.
- `--only` retakes work, a failed motif does not stop the others, exit code is 1 with the retake command printed.
- `shots.json` passes the schema; positions are first guesses (the local run tunes them), so do not "fix" them by reasoning about roads.
- Nothing in the PR touches game code or adds images.

## Task 1: Pure helpers (TDD)

**Files:** create `scripts/shots.py`, create `tests/test_shots.py`

**Interfaces:**
```python
SIZES = (1, 2)                                   # device scale factors: css size and 2x
HIDDEN_SELECTORS: tuple[str, ...]
def validate_shots(shots, regions, landmarks=None) -> list[str]   # error messages, [] when valid
def heading(at: dict, look_at: dict) -> float                     # radians, th = atan2(dz, dx)
def caption(shot: dict) -> str                                    # "Rhyflitzer – Map Madness: <title>"
def output_names(shot_id: str, css_width: int) -> tuple[str, str] # (<id>-<w>.jpg, <id>-<2w>.jpg)
def select_shots(shots, only: list[str] | None) -> list[dict]     # SystemExit on an unknown id
def readme_block(shots) -> str
def splice_readme(text: str, block: str) -> str                   # SystemExit when a marker is missing
def region_ids(root: Path) -> set[str]                            # ids from regions.js
def load_landmarks(root: Path) -> dict                            # anchors.landmarks of data/world_hochrhein.json
```

- [ ] **Step 1: Write the failing tests** `tests/test_shots.py`:
```python
"""#556: the shot list and the pure parts of scripts/shots.py. The smoke test at the end is slow (Playwright): run it in the foreground."""
import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import shots  # noqa: E402

SHOTS_FILE = ROOT / "docs" / "gallery" / "shots.json"
REGIONS = {"hochrhein", "ehrendingen"}
LANDMARKS = {"plattform": {"x": 300.0, "z": 400.0}}


def shot(**over):
    base = {"id": "demo-shot", "title": "Demo", "title_de": "Demo", "region": "hochrhein", "mode": "car", "vehicle": "compact",
            "at": {"x": 310.0, "z": 400.0}, "look_at": {"x": 300.0, "z": 400.0}, "near": "plattform", "camera": "chase",
            "style": "smooth", "time": "day", "weather": "clear"}
    return {**base, **over}


def test_validate_shots_accepts_a_complete_shot():
    assert shots.validate_shots([shot()] * 1, REGIONS, LANDMARKS, min_count=1) == []


def test_validate_shots_reports_duplicate_ids_and_missing_fields():
    broken = shot(id="a")
    del broken["camera"]
    errors = shots.validate_shots([shot(id="a"), broken], REGIONS, LANDMARKS, min_count=1)
    assert any("duplicate id 'a'" in e for e in errors)
    assert any("'a'" in e and "camera" in e for e in errors)


@pytest.mark.parametrize("field,value", [("region", "mars"), ("mode", "boat"), ("vehicle", "tank"), ("camera", "drone"),
                                         ("style", "neon"), ("time", "night"), ("weather", "rain"), ("id", "Bad_Id")])
def test_validate_shots_rejects_bad_values(field, value):
    errors = shots.validate_shots([shot(**{field: value})], REGIONS, LANDMARKS, min_count=1)
    assert errors and field in errors[0]


def test_validate_shots_checks_the_landmark_distance_and_a_distinct_heading_target():
    far = shot(at={"x": 5000.0, "z": 400.0})
    assert any("600 m" in e for e in shots.validate_shots([far], REGIONS, LANDMARKS, min_count=1))
    same = shot(look_at={"x": 310.0, "z": 400.0})
    assert any("look_at" in e for e in shots.validate_shots([same], REGIONS, LANDMARKS, min_count=1))


def test_validate_shots_needs_climb_seconds_for_the_heli_and_a_count_in_range():
    assert any("climb_s" in e for e in shots.validate_shots([shot(mode="heli")], REGIONS, LANDMARKS, min_count=1))
    assert shots.validate_shots([shot(mode="heli", climb_s=3)], REGIONS, LANDMARKS, min_count=1) == []
    assert any("8-12" in e for e in shots.validate_shots([shot()], REGIONS, LANDMARKS))


def test_heading_points_from_at_to_look_at():
    assert shots.heading({"x": 0, "z": 0}, {"x": 10, "z": 0}) == pytest.approx(0)
    assert shots.heading({"x": 0, "z": 0}, {"x": 0, "z": 10}) == pytest.approx(math.pi / 2)


def test_caption_names_the_game_with_an_en_dash():
    assert shots.caption(shot(title="Holzbrücke")) == "Rhyflitzer – Map Madness: Holzbrücke"


def test_output_names_are_jpg_in_both_sizes():
    assert shots.output_names("dsm-sisseln", 1920) == ("dsm-sisseln-1920.jpg", "dsm-sisseln-3840.jpg")


def test_select_shots_filters_and_rejects_unknown_ids():
    both = [shot(id="a"), shot(id="b")]
    assert [s["id"] for s in shots.select_shots(both, ["b"])] == ["b"]
    assert [s["id"] for s in shots.select_shots(both, None)] == ["a", "b"]
    with pytest.raises(SystemExit) as e:
        shots.select_shots(both, ["zzz"])
    assert "zzz" in str(e.value)


def test_readme_block_links_the_big_image_from_the_small_one():
    block = shots.readme_block([shot(id="a", title="A")])
    assert 'href="docs/gallery/a-3840.jpg"' in block and 'src="docs/gallery/a-1920.jpg"' in block
    assert 'alt="Rhyflitzer – Map Madness: A"' in block


def test_splice_readme_replaces_only_the_marked_span():
    text = "before\n<!-- shots:start -->\nold\n<!-- shots:end -->\nafter\n"
    out = shots.splice_readme(text, "NEW")
    assert out == "before\n<!-- shots:start -->\nNEW\n<!-- shots:end -->\nafter\n"
    with pytest.raises(SystemExit):
        shots.splice_readme("no markers", "NEW")
```
- [ ] **Step 2:** `python -m pytest tests/test_shots.py -k "not smoke" -q` fails (module `shots` missing).
- [ ] **Step 3: Implement** the top of `scripts/shots.py` (the browser part comes in Task 3; keep it importable without Playwright):
```python
#!/usr/bin/env python3
"""#556: the curated screenshot gallery. Drives the real game to every motif of docs/gallery/shots.json and writes
<id>-1920.jpg and <id>-3840.jpg (JPG, quality 90) to docs/gallery/. Not the world gallery of scripts/gallery.py (#170).

    python scripts/shots.py                      # all motifs
    python scripts/shots.py --only dsm-sisseln   # retake single motifs
    python scripts/shots.py --list               # ids and titles
    python scripts/shots.py --readme             # rewrite the README thumbnail block from shots.json

PW_CDP_ENDPOINT (tests/gpu_browser.py) selects the GPU browser; without it a local SwiftShader Chromium is used.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))   # gpu_browser.py, hermetic_api.py: stdlib only

SHOTS_FILE = ROOT / "docs" / "gallery" / "shots.json"
OUT_DIR = ROOT / "docs" / "gallery"
README = ROOT / "README.md"
GAME = "Rhyflitzer – Map Madness"
MARK_START, MARK_END = "<!-- shots:start -->", "<!-- shots:end -->"

REQUIRED = ("id", "title", "title_de", "region", "mode", "vehicle", "at", "look_at", "camera", "style", "time", "weather")
MODES = ("car", "heli", "loco")
CAMERAS = ("chase", "near", "cockpit", "bumper")   # CAM_VIEWS 0-3; the drone orbits, so "arrived" has no meaning there
STYLES = ("original", "smooth")
VEHICLES = ("compact", "delorean", "mini", "bus")
TIMES = ("day",)        # the game has no time of day (spec A3)
WEATHERS = ("clear",)   # nor weather
ENUMS = {"mode": MODES, "camera": CAMERAS, "style": STYLES, "vehicle": VEHICLES, "time": TIMES, "weather": WEATHERS}
ID_RE = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
NEAR_MAX_M = 600
COUNT_RANGE = (8, 12)


def _is_point(p) -> bool:
    return isinstance(p, dict) and all(isinstance(p.get(k), (int, float)) and not isinstance(p.get(k), bool) for k in ("x", "z"))


def _shot_errors(s: dict, regions, landmarks) -> list[str]:
    sid = s.get("id", "?")
    errors = [f"'{sid}': missing field {k}" for k in REQUIRED if k not in s]
    if "id" in s and not (isinstance(s["id"], str) and ID_RE.fullmatch(s["id"])):
        errors.append(f"'{sid}': id must be lowercase words joined by '-'")
    if "region" in s and s["region"] not in regions:
        errors.append(f"'{sid}': region '{s['region']}' is not one of {sorted(regions)}")
    for field, allowed in ENUMS.items():
        if field in s and s[field] not in allowed:
            errors.append(f"'{sid}': {field} '{s[field]}' is not one of {list(allowed)}")
    for field in ("at", "look_at"):
        if field in s and not _is_point(s[field]):
            errors.append(f"'{sid}': {field} needs numeric x and z")
    if _is_point(s.get("at")) and _is_point(s.get("look_at")) and math.dist((s["at"]["x"], s["at"]["z"]), (s["look_at"]["x"], s["look_at"]["z"])) < 1:
        errors.append(f"'{sid}': look_at must differ from at by at least 1 m")
    if s.get("mode") == "heli" and not (isinstance(s.get("climb_s"), (int, float)) and 1 <= s["climb_s"] <= 10):
        errors.append(f"'{sid}': mode heli needs climb_s between 1 and 10")
    return errors + _near_errors(s, landmarks)


def _near_errors(s: dict, landmarks) -> list[str]:
    near = s.get("near")
    if near is None or not landmarks or not _is_point(s.get("at")):
        return []
    if near not in landmarks:
        return [f"'{s.get('id')}': near '{near}' is not a landmark of the world"]
    if math.dist((s["at"]["x"], s["at"]["z"]), (landmarks[near]["x"], landmarks[near]["z"])) > NEAR_MAX_M:
        return [f"'{s.get('id')}': at is farther than {NEAR_MAX_M} m from landmark '{near}'"]
    return []


def validate_shots(shots, regions, landmarks=None, min_count: int = COUNT_RANGE[0]) -> list[str]:
    """Error messages for a shot list; [] when it is valid. landmarks: anchors.landmarks of the hochrhein world."""
    errors, seen = [], set()
    for s in shots:
        if s.get("id") in seen:
            errors.append(f"duplicate id '{s['id']}'")
        seen.add(s.get("id"))
        errors += _shot_errors(s, regions, landmarks if s.get("region") == "hochrhein" else None)
    if not min_count <= len(shots) <= COUNT_RANGE[1]:
        errors.append(f"{len(shots)} motifs; the gallery wants {COUNT_RANGE[0]}-{COUNT_RANGE[1]}")
    return errors


def heading(at: dict, look_at: dict) -> float:
    """The car's yaw th (radians) from `at` towards `look_at`; x east, z south, th = atan2(dz, dx)."""
    return math.atan2(look_at["z"] - at["z"], look_at["x"] - at["x"])


def caption(shot: dict) -> str:
    return f"{GAME}: {shot['title']}"


def output_names(shot_id: str, css_width: int) -> tuple[str, str]:
    return f"{shot_id}-{css_width}.jpg", f"{shot_id}-{css_width * 2}.jpg"


def select_shots(shots: list[dict], only: list[str] | None) -> list[dict]:
    if not only:
        return list(shots)
    known = {s["id"] for s in shots}
    unknown = [i for i in only if i not in known]
    if unknown:
        sys.exit(f"Unknown motif id(s): {', '.join(unknown)}. Known: {', '.join(sorted(known))}")
    return [s for s in shots if s["id"] in only]


def readme_block(shots: list[dict]) -> str:
    cells = [f'  <a href="docs/gallery/{s["id"]}-3840.jpg"><img src="docs/gallery/{s["id"]}-1920.jpg" width="32%" alt="{caption(s)}"></a>'
             for s in shots]
    return "<p>\n" + "\n".join(cells) + "\n</p>"


def splice_readme(text: str, block: str) -> str:
    start, end = text.find(MARK_START), text.find(MARK_END)
    if start < 0 or end < start:
        sys.exit(f"README.md needs the markers {MARK_START} and {MARK_END} (in that order)")
    return text[: start + len(MARK_START)] + "\n" + block + "\n" + text[end:]


def region_ids(root: Path = ROOT) -> set[str]:
    return set(re.findall(r"^    id: '([a-z0-9]+)'", (root / "regions.js").read_text(encoding="utf-8"), re.M))


def load_landmarks(root: Path = ROOT) -> dict:
    world = json.loads((root / "data" / "world_hochrhein.json").read_text(encoding="utf-8"))
    return world["anchors"]["landmarks"]


def load_shots(path: Path = SHOTS_FILE) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))
```
`region_ids` matches the lines `  hochrhein: {` followed by `    id: 'hochrhein', ...` in `regions.js` (4-space indent). Verify with `node -e` free: simply run the test in Task 2, which asserts `region_ids(ROOT) == {"hochrhein","ehrendingen"}`.
- [ ] **Step 4:** `python -m pytest tests/test_shots.py -k "not smoke" -q` passes. Commit `feat(gallery): shot list helpers and validation (#556)`.

## Task 2: The shot list `docs/gallery/shots.json` + schema test

**Files:** create `docs/gallery/shots.json`, append to `tests/test_shots.py`

Coordinates are world metres (x east, z south) from `anchors.landmarks` of `data/world_hochrhein.json` plus a hand offset: `plattform` (304.8, 427.1), `dsmChimney` (1065.2, 345.1), `dsmWaterTower` (1126.4, -93.7), `holzbruecke` (-1182.4, -83.4), `stationSisseln` (1940.5, 539.0), `smileKreisel` (1270.0, -148.0), `muenster` (-1331.0, -172.7), `hallenbad` (1968.0, -374.2; Bodenackerstrasse starts at (1930.7, -404.8) heading east). They are first guesses; the local run tunes them. Do not try to make them "right" by reasoning.

- [ ] **Step 1: Append the failing test**:
```python
def test_the_committed_shot_list_is_valid():
    listed = shots.load_shots()
    assert shots.validate_shots(listed, shots.region_ids(ROOT), shots.load_landmarks(ROOT)) == []


def test_region_ids_come_from_regions_js():
    assert shots.region_ids(ROOT) == REGIONS


def test_no_png_and_only_declared_images_in_the_gallery_folder():
    names = {p.name for p in (ROOT / "docs" / "gallery").iterdir()}
    assert not [n for n in names if n.endswith(".png")]
    ids = {s["id"] for s in shots.load_shots()}
    generated = {f"{i}-{w}.jpg" for i in ids for w in (1920, 3840)}
    stray = {n for n in names if n.endswith(".jpg") and not n.startswith("plattform-") and n not in generated}
    assert not stray, stray
```
- [ ] **Step 2:** run; fails (`shots.json` missing).
- [ ] **Step 3: Create** `docs/gallery/shots.json` (2-space indent, 11 motifs):
```json
[
  { "id": "plattform-auto", "title": "Plattform Sisslerfeld with the Postauto", "title_de": "Plattform Sisslerfeld mit dem Postauto",
    "region": "hochrhein", "mode": "car", "vehicle": "bus", "at": { "x": 326.0, "z": 427.0 }, "look_at": { "x": 304.8, "z": 427.1 },
    "near": "plattform", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "plattform-dsm", "title": "From the Plattform towards the DSM chimney", "title_de": "Von der Plattform zum DSM-Kamin",
    "region": "hochrhein", "mode": "car", "vehicle": "compact", "at": { "x": 330.0, "z": 400.0 }, "look_at": { "x": 1065.2, "z": 345.1 },
    "near": "plattform", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "holzbruecke-aussen", "title": "Holzbrücke Bad Säckingen from the Rhine bank", "title_de": "Holzbrücke Bad Säckingen vom Rheinufer",
    "region": "hochrhein", "mode": "car", "vehicle": "compact", "at": { "x": -1242.0, "z": -83.4 }, "look_at": { "x": -1182.4, "z": -83.4 },
    "near": "holzbruecke", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "holzbruecke-nah", "title": "Holzbrücke, close, from the Swiss side", "title_de": "Holzbrücke aus der Nähe, von der Schweizer Seite",
    "region": "hochrhein", "mode": "car", "vehicle": "delorean", "at": { "x": -1130.0, "z": -83.4 }, "look_at": { "x": -1182.4, "z": -83.4 },
    "near": "holzbruecke", "camera": "near", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "dsm-sisseln", "title": "DSM Sisseln and its chimney", "title_de": "DSM Sisseln und der Kamin",
    "region": "hochrhein", "mode": "car", "vehicle": "compact", "at": { "x": 1100.0, "z": 430.0 }, "look_at": { "x": 1065.2, "z": 345.1 },
    "near": "dsmChimney", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "dsm-wasserturm", "title": "DSM water tower", "title_de": "DSM-Wasserturm",
    "region": "hochrhein", "mode": "car", "vehicle": "mini", "at": { "x": 1126.4, "z": -40.0 }, "look_at": { "x": 1126.4, "z": -93.7 },
    "near": "dsmWaterTower", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "helikopter-rhein", "title": "Helicopter over the Rhine at the Holzbrücke", "title_de": "Helikopter über dem Rhein bei der Holzbrücke",
    "region": "hochrhein", "mode": "heli", "climb_s": 3, "vehicle": "compact", "at": { "x": -1262.0, "z": -83.4 }, "look_at": { "x": -1182.4, "z": -83.4 },
    "near": "holzbruecke", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "dampflok-sisseln", "title": "Steam loco on the tracks at Bahnhof Sisseln", "title_de": "Dampflok auf den Schienen beim Bahnhof Sisseln",
    "region": "hochrhein", "mode": "loco", "vehicle": "compact", "at": { "x": 1940.5, "z": 539.0 }, "look_at": { "x": 1990.0, "z": 530.0 },
    "near": "stationSisseln", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "dorfstrasse-hausnummern", "title": "Village street with house-number signs", "title_de": "Dorfstrasse mit Hausnummern-Schildern",
    "region": "hochrhein", "mode": "car", "vehicle": "compact", "at": { "x": 1950.0, "z": -404.0 }, "look_at": { "x": 2010.0, "z": -405.0 },
    "near": "hallenbad", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "smile-kreisel", "title": "The Smile roundabout", "title_de": "Der Smile-Kreisel",
    "region": "hochrhein", "mode": "car", "vehicle": "delorean", "at": { "x": 1230.0, "z": -148.0 }, "look_at": { "x": 1270.0, "z": -148.0 },
    "near": "smileKreisel", "camera": "near", "style": "smooth", "time": "day", "weather": "clear" },
  { "id": "muenster-stein", "title": "Fridolinsmünster", "title_de": "Fridolinsmünster",
    "region": "hochrhein", "mode": "car", "vehicle": "bus", "at": { "x": -1290.0, "z": -120.0 }, "look_at": { "x": -1331.0, "z": -172.7 },
    "near": "muenster", "camera": "chase", "style": "smooth", "time": "day", "weather": "clear" }
]
```
- [ ] **Step 4:** run `python -m pytest tests/test_shots.py -k "not smoke" -q`; all pass. If `near` distance fails for a motif, move `at` closer to its landmark (never raise `NEAR_MAX_M`). Commit `feat(gallery): the curated shot list of 11 motifs (#556)`.

## Task 3: The capture driver and CLI

**Files:** `scripts/shots.py` (append)

**Interfaces:**
```python
HIDE_CSS: str
def visible_chrome(page) -> list[str]            # selectors of HIDDEN_SELECTORS (+ #overlay) that are still visible
def capture_shot(browser, base_url, shot, args) -> list[Path]   # raises RuntimeError with the reason
def main(argv=None) -> int
```
No unit test of the driver itself; Task 4 smoke-tests it. Keep the JS snippets as module constants.

- [ ] **Step 1: Append** the driver to `scripts/shots.py`:
```python
HIDDEN_SELECTORS = ("#tl", "#tr", "#compass", "#bl", "#br", "#pausebtn", "#arrow", "#game-nav", "#debug", "#toast", "#keybar", "#navi", "#stylebtn", "#touch")
# the #305 class (no toast, unlike the Ctrl+H key) plus the elements it leaves visible: the toast, the arrow, the key bar
HIDE_CSS = ",".join(HIDDEN_SELECTORS) + "{visibility:hidden!important}"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 240000
READY = "() => window.__mm && window.__mm.sim && window.__mm.place && document.querySelector('#worldstatus')?.textContent"
LOADED = "(terrain) => window.__mm.layout === 'osm' && (!terrain || document.querySelector('#mmhstatus')?.classList.contains('real'))"
VISIBLE = """(sels) => sels.filter(s => { const e = document.querySelector(s); if (!e) return false; const c = getComputedStyle(e);
  return !e.hidden && c.visibility !== 'hidden' && c.display !== 'none' && e.getClientRects().length > 0; })"""
# car motifs: the car is static, so one camera easing step that moves the camera under 1 mm means it has arrived; camStep is
# independent of the frame rate (CLAUDE.md "Animated cameras": a headless loop is clamped and draws under 1 fps)
SETTLE = """() => { const m = window.__mm; let prev = m.camStep(0.05).d, moved = 1;
  for (let i = 0; i < 2000; i++) { const d = m.camStep(0.05).d; moved = Math.hypot(d[0] - prev[0], d[1] - prev[1], d[2] - prev[2]); prev = d; if (moved < 0.001) return { steps: i, moved }; }
  return { steps: 2000, moved }; }"""
CAM_POS = "() => { const c = window.__mm.cam(); return c.d; }"
FRAMES = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"


def visible_chrome(page) -> list[str]:
    return page.evaluate(VISIBLE, [*HIDDEN_SELECTORS, "#overlay"])


def wait_for_camera_arrival(page, shot: dict) -> None:
    """Car: camStep until it stops moving. Heli and loco: the camera follows a moving thing, so poll until three polls agree."""
    if shot["mode"] == "car":
        result = page.evaluate(SETTLE)
        if result["moved"] >= 0.001:
            raise RuntimeError(f"camera did not arrive after {result['steps']} steps (still moving {result['moved']:.4f} m)")
        return
    still, last = 0, None
    for _ in range(240):   # 120 s
        pos = page.evaluate(CAM_POS)
        still = still + 1 if last and max(abs(a - b) for a, b in zip(pos, last)) < 0.05 else 0
        if still >= 3:
            return
        last = pos
        page.wait_for_timeout(500)
    raise RuntimeError("camera did not arrive within 120 s")


def press_until_camera(page, shot: dict) -> None:
    want = CAMERAS.index(shot["camera"])
    for _ in range(len(CAMERAS) + 1):
        if page.evaluate("() => window.__mm.camView") == want:
            return
        page.keyboard.press("KeyC")
    raise RuntimeError(f"could not select the {shot['camera']} camera")


def start_game(page, base_url: str, shot: dict, args) -> None:
    if args.no_terrain:
        page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{base_url}/index.html?region={shot['region']}")
    page.wait_for_function(READY, timeout=T)
    page.click("#startbtn", timeout=T)
    page.wait_for_function(LOADED, arg=not args.no_terrain, timeout=T)


def stage(page, shot: dict) -> None:
    """Style, vehicle, placement, motion: everything the picture shows, before the clean-up and the camera wait."""
    page.evaluate("(k) => window.__mm.setStyle(k)", shot["style"])
    page.evaluate("(id) => { const v = window.__mm.vehicles()[id]; if (!v) throw new Error('unknown vehicle ' + id); window.__mm.setVehicle(v); }", shot["vehicle"])
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [shot["at"]["x"], shot["at"]["z"], heading(shot["at"], shot["look_at"])])
    if shot["mode"] == "heli":
        page.keyboard.press("KeyF")
        page.evaluate("(s) => window.__mm.flySim(s, ['Space'])", shot["climb_s"])
        if not page.evaluate("() => window.__mm.fly().on"):
            raise RuntimeError("the helicopter did not take off here")
    if shot["mode"] == "loco":
        for _ in range(2):   # out of the car, then into the loco (pressZ)
            page.keyboard.press("KeyZ")
            page.wait_for_timeout(1000)
        if not page.evaluate("() => window.__mm.train().on"):
            raise RuntimeError("the steam loco was not boarded: move `at` next to it")
    if shot["mode"] != "loco":
        press_until_camera(page, shot)


def clean_frame(page) -> None:
    page.evaluate("() => document.body.classList.add('hud-off')")
    page.add_style_tag(content=HIDE_CSS)
    page.evaluate(FRAMES)
    shown = visible_chrome(page)
    if shown:
        raise RuntimeError(f"still visible before the shot: {', '.join(shown)}")


def capture_shot(browser, base_url: str, shot: dict, args) -> list[Path]:
    import hermetic_api
    context = browser.new_context(viewport={"width": args.width, "height": args.height}, device_scale_factor=2, locale="en-US")
    hermetic_api.route_gallery(context)
    try:
        page = context.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        start_game(page, base_url, shot, args)
        stage(page, shot)
        clean_frame(page)
        wait_for_camera_arrival(page, shot)
        page.evaluate(FRAMES)
        if errors:
            raise RuntimeError(f"page error: {errors[0]}")
        return write_images(page, shot, args)
    finally:
        context.close()


def write_images(page, shot: dict, args) -> list[Path]:
    small, big = output_names(shot["id"], args.width)
    out = []
    for name, scale in ((small, "css"), (big, "device")):   # one frame, two sizes: DSF 2 gives 2x pixels, "css" gives 1x
        path = args.out / name
        page.screenshot(path=str(path), type="jpeg", quality=90, scale=scale, timeout=120000)
        out.append(path)
    return out


def serve(endpoint):
    """A static server for the repo root; on the LAN when the GPU browser is remote (like tests/conftest.py)."""
    import http.server
    import socket
    import threading
    from functools import partial
    import gpu_browser
    bind, host = gpu_browser.bind_for(endpoint)
    sock = socket.socket()
    sock.bind((bind, 0))
    port = sock.getsockname()[1]
    sock.close()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer((bind, port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://{host}:{port}"


def run(selected: list[dict], args) -> list[str]:
    """Shoot every selected motif; returns the ids that failed."""
    import os
    from playwright.sync_api import sync_playwright
    import gpu_browser
    endpoint, warning = gpu_browser.resolve_endpoint(os.environ)
    if warning:
        print(warning, file=sys.stderr)
    httpd, base_url = serve(endpoint)
    failed = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(endpoint) if endpoint else p.chromium.launch(args=ARGS)
            for shot in selected:
                try:
                    files = capture_shot(browser, base_url, shot, args)
                    print(f"ok    {shot['id']}: {', '.join(f.name for f in files)}")
                except Exception as error:   # one dead page must not stop the others
                    failed.append(shot["id"])
                    print(f"FAIL  {shot['id']}: {error}", file=sys.stderr)
            browser.close()
    finally:
        httpd.shutdown()
    return failed


def parse_args(argv):
    ap = argparse.ArgumentParser(description="Shoot the curated screenshot gallery (#556).")
    ap.add_argument("--only", nargs="+", metavar="ID", help="retake only these motifs")
    ap.add_argument("--list", action="store_true", help="print the motif ids and exit")
    ap.add_argument("--readme", action="store_true", help="rewrite the README thumbnail block from shots.json and exit")
    ap.add_argument("--size", default="1920x1080", help="CSS viewport WxH; the big image is twice that (default 1920x1080 -> 3840x2160)")
    ap.add_argument("--out", type=Path, default=OUT_DIR, help="output folder (default docs/gallery)")
    ap.add_argument("--shots", type=Path, default=SHOTS_FILE, help="the shot list (default docs/gallery/shots.json)")
    ap.add_argument("--no-terrain", action="store_true", help="block the measured terrain (hand-made hills; the smoke test)")
    args = ap.parse_args(argv)
    match = re.fullmatch(r"(\d{2,5})x(\d{2,5})", args.size)
    if not match:
        ap.error("--size must look like 1920x1080")
    args.width, args.height = int(match[1]), int(match[2])
    return args


def main(argv=None) -> int:
    args = parse_args(argv)
    shots = load_shots(args.shots)
    errors = validate_shots(shots, region_ids(), load_landmarks())
    if errors:
        sys.exit("shots.json is invalid:\n  " + "\n  ".join(errors))
    if args.list:
        print("\n".join(f"{s['id']}\t{s['title']}" for s in shots))
        return 0
    if args.readme:
        README.write_text(splice_readme(README.read_text(encoding="utf-8"), readme_block(shots)), encoding="utf-8")
        print(f"README.md: {len(shots)} thumbnails")
        return 0
    selected = select_shots(shots, args.only)
    args.out.mkdir(parents=True, exist_ok=True)
    failed = run(selected, args)
    if failed:
        print(f"\n{len(failed)} of {len(selected)} failed. Retake: python scripts/shots.py --only {' '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```
Notes for the implementer: `scale=` on `page.screenshot` accepts `"css"` and `"device"`. `loco` skips `press_until_camera` because the train has its own camera (`TRAIN.cam`), so its `camera` field is informational (`chase`). `main` validates the whole list (8-12 motifs) before it shoots; the smoke test therefore selects one motif of the committed list with `--only`.
- [ ] **Step 2:** `python -c "import ast,sys; ast.parse(open('scripts/shots.py').read())"`; `python scripts/shots.py --list` prints 11 lines; `python -m pytest tests/test_shots.py -k "not smoke" -q` still passes.
- [ ] **Step 3:** `python scripts/shots.py --only nope` exits with `Unknown motif id(s): nope` (no browser started: `select_shots` runs before `run`; verify with the command).
- [ ] **Step 4:** Commit `feat(gallery): shot script with retake, clean frame and camera arrival (#556)`.

## Task 4: Hermetic smoke test (one motif, small size)

**Files:** `tests/test_shots.py` (append)

Feasible on SwiftShader: `tests/test_plattform_car.py` boots the same world at 640x360 with the terrain blocked, and the script's arrival wait for car motifs (`camStep`) does not depend on the frame rate. The risk is `page.screenshot` starving under SwiftShader (see the `__mm.photoUrl` comment), hence the tiny viewport and the 120 s screenshot timeout. If it still times out, raise the timeout; do not switch methods.

- [ ] **Step 1: Append**:
```python
WORLD = ROOT / "data" / "world_hochrhein.json"


def test_hidden_selectors_cover_the_hud_the_toast_and_the_footer():
    for sel in ("#tl", "#tr", "#compass", "#bl", "#br", "#game-nav", "#debug", "#toast", "#arrow"):
        assert sel in shots.HIDDEN_SELECTORS
    assert "visibility:hidden!important" in shots.HIDE_CSS and "#game-nav" in shots.HIDE_CSS


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_smoke_one_motif_is_shot_in_two_sizes_without_hud(tmp_path):
    PIL = pytest.importorskip("PIL.Image")
    code = shots.main(["--only", "plattform-auto", "--size", "320x180", "--out", str(tmp_path), "--no-terrain"])
    assert code == 0   # capture_shot raises (exit 1) if any HIDDEN_SELECTORS element or #overlay is visible before the shot
    small, big = (tmp_path / n for n in shots.output_names("plattform-auto", 320))
    assert small.exists() and big.exists()
    assert PIL.open(small).size == (320, 180) and PIL.open(big).size == (640, 360)
    assert small.read_bytes()[:3] == b"\xff\xd8\xff"   # a JPEG, not a PNG
```
- [ ] **Step 2:** Commit and push nothing (the pipeline pushes). Run in the **foreground**: `python -m pytest tests/test_shots.py -k smoke -q` with `timeout` 900000 ms. Expected: pass. If it fails on the arrival wait or the clean-frame assertion, fix `scripts/shots.py`; if it fails because motif coordinates put the car somewhere odd, that is not a failure (the test does not look at the picture). If it fails after 3 attempts, stop and explain.
- [ ] **Step 3:** Run the pure tests again: `python -m pytest tests/test_shots.py -k "not smoke" -q`. Commit `test(gallery): hermetic smoke test of the shot script (#556)`.

## Task 5: README section and test map

**Files:** `README.md`, `tests/test-map.json`

- [ ] **Step 1: README.** In the existing section "Screenshots and videos" keep the Plattform row and the Videos line unchanged. Between them (after the Plattform `</p>`) insert:
```markdown
**More screenshots** (curated list: [`docs/gallery/shots.json`](docs/gallery/shots.json), click a thumbnail for the 3840x2160 image)

<!-- shots:start -->
<!-- shots:end -->

Regenerate all images (JPG, 1920x1080 and 3840x2160, into `docs/gallery/`) with one command. It drives the real game, hides the HUD, the footer and the debug panel, and waits until the camera has arrived and the world is loaded:

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python scripts/shots.py
```

Retake single motifs (the GPU browser is unstable; a failed motif is reported with the exact retake command): `python scripts/shots.py --only dsm-sisseln holzbruecke-aussen`. List the motifs with `--list`. After a run, `python scripts/shots.py --readme` rewrites the thumbnails above from `shots.json`. Set `PW_CDP_ENDPOINT` to use the GPU browser, otherwise a local SwiftShader Chromium is used (slow). The same list is the shot list for the video takes. Needs Playwright (`pip install playwright && playwright install chromium`).
```
Leave the markers empty: no images exist yet, so no broken links. Do **not** run `--readme` and do not add images.
- [ ] **Step 2: `tests/test-map.json`.** Add `"scripts/shots.py": ["test_shots.py"]` and `"docs/gallery/shots.json": ["test_shots.py"]` next to the other entries (match the file's format; keep it valid JSON: `python -c "import json; json.load(open('tests/test-map.json'))"`). If `tests/test_select_tests.py` asserts on the map, run `python -m pytest tests/test_select_tests.py -q`.
- [ ] **Step 3:** `python -m pytest tests/test_shots.py -k "not smoke" -q` passes; `git status` shows no image files. Commit `docs(gallery): README section and test map for the shot script (#556)`.

## Task 6: Final check

- [ ] Run `python -m pytest tests/test_shots.py -k "not smoke" -q` and `node --test tests/*.test.mjs` (nothing in the game changed; both must stay green). Do not run the full Playwright suite.
- [ ] `git diff --stat origin/main...HEAD` lists only: `scripts/shots.py`, `tests/test_shots.py`, `tests/test-map.json`, `docs/gallery/shots.json`, `README.md`, the spec and the plan. No `.jpg`/`.png`, no `index.html`.
- [ ] State in the PR description: the images, the tuning of positions and the GamesHub card are the maintainer's local follow-up; list the follow-up acceptance criteria from the spec as not part of this PR; mention that the game has no night and no weather, so "DSM at night" is parked.
