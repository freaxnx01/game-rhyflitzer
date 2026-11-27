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


WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"


def test_patrol_writes_frames_manifest_video_sheets_and_review(tmp_path):
    """Slow: loads the OSM world. Foreground only."""
    if not WORLD.exists() or patrol.shutil.which("ffmpeg") is None:
        pytest.skip("needs the OSM world and ffmpeg")
    rc = patrol.main(["--route", "sisseln-eiken", "--out", str(tmp_path), "--limit", "3", "--size", "640x360"])
    assert rc == 0
    assert sorted(p.name for p in (tmp_path / "frames").iterdir()) == ["f-0001.png", "f-0002.png", "f-0003.png"]
    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert [m["i"] for m in manifest] == [1, 2, 3]
    assert all(m["E"] is not None and m["N"] is not None for m in manifest)
    assert math.hypot(manifest[1]["x"] - manifest[0]["x"], manifest[1]["z"] - manifest[0]["z"]) == pytest.approx(25, abs=0.5)
    assert (tmp_path / "patrol.mp4").stat().st_size > 0
    assert (tmp_path / "sheet-01.jpg").exists()
    assert "sheet-01.jpg" in (tmp_path / "review.md").read_text(encoding="utf-8")


COMMAND = Path(__file__).parents[1] / ".claude" / "commands" / "patrol.md"


def test_patrol_command_runs_the_script_and_never_files():
    text = COMMAND.read_text(encoding="utf-8")
    assert "scripts/patrol.py" in text and "mktemp -d" in text
    assert 'model: "sonnet"' in text and 'model: "fable"' in text and "never Opus" in text
    assert "/processing-test-feedback" in text and "files nothing" in text


def test_no_workflow_runs_the_patrol():
    workflows = Path(__file__).parents[1] / ".github" / "workflows"
    assert not any("patrol" in p.read_text(encoding="utf-8") for p in workflows.glob("*.yml"))
