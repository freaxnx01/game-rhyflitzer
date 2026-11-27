"""#1248: the pure parts of scripts/patrol.py (no browser)."""
import json
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import patrol  # noqa: E402

ROUTES = Path(__file__).parents[1] / "scripts" / "patrol_routes.json"


def test_committed_routes_have_from_and_to():
    routes = json.loads(ROUTES.read_text(encoding="utf-8"))
    assert routes["sisseln-eiken"] == {"from": "Bahnhof Sisseln", "to": "Bahnhof Eiken"}
    for rid in routes:
        assert patrol.load_route(routes, rid)[1] is None


def test_load_route_unknown_or_incomplete():
    assert "unknown route" in patrol.load_route({"a": {"from": "X", "to": "Y"}}, "b")[1]
    assert "needs" in patrol.load_route({"a": {"from": "X"}}, "a")[1]


def test_stations_every_step_with_the_road_heading():
    st = patrol.stations([[0, 0], [30, 0], [30, 30]], 25)
    assert [(round(s["x"], 6), round(s["z"], 6), round(s["s"])) for s in st] == [(0, 0, 0), (25, 0, 25), (30, 20, 50)]
    assert st[0]["th"] == 0 and math.isclose(st[2]["th"], math.pi / 2)   # route.js: th = atan2(dz, dx)


def test_stations_reject_a_bad_step():
    with pytest.raises(ValueError):
        patrol.stations([[0, 0], [1, 0]], 0)


def test_frame_of_maps_sheet_tiles_row_major():
    assert patrol.frame_of(1, 1) == 1
    assert patrol.frame_of(1, 16) == 16
    assert patrol.frame_of(3, 5) == 37


def test_video_and_sheet_commands():
    assert patrol.video_cmd("d/frames", "d/patrol.mp4", 2) == [
        "ffmpeg", "-v", "error", "-y", "-framerate", "2", "-i", "d/frames/f-%04d.png",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "d/patrol.mp4"]
    assert patrol.sheet_cmd("d/patrol.mp4", "d", 2) == [
        "ffmpeg", "-v", "error", "-y", "-i", "d/patrol.mp4", "-vf", "fps=2,scale=800:-1,tile=4x4", "d/sheet-%02d.jpg"]


def test_review_prompt_names_the_format_and_forbids_filing():
    text = patrol.review_prompt("sisseln-eiken", 120, ["sheet-01.jpg", "sheet-02.jpg"])
    assert "| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link |" in text
    assert "manifest.json" in text and "findings.md" in text and "sheet-02.jpg" in text
    assert "Do not file issues" in text
    assert "(sheet - 1) * 16 + tile" in text
