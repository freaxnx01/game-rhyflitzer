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