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