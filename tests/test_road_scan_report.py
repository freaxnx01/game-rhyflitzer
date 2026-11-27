"""#1248: the pure parts of the road-scan gate (no browser)."""
import json

import pytest

import road_scan_report as rs

SPOT = {"x": 1599.56, "z": 962.82, "E": 2639599.6, "N": 1266037.2, "n": "Hauptstrasse", "cls": "secondary",
        "side": "left", "yRoad": 301.12, "yGreen": 301.19, "d": 0.07, "count": 3}


def test_spot_line_names_place_road_side_and_height():
    assert rs.spot_line(SPOT) == ("x 1599.6 z 962.8 | LV95 2639600 / 1266037 | Hauptstrasse (secondary), left | "
                                  "green 0.070 m over road (301.12), 3 probes")


def test_spot_line_without_lv95_or_name():
    line = rs.spot_line({**SPOT, "E": None, "N": None, "n": ""})
    assert "LV95 —" in line and "(unnamed) (secondary)" in line


def test_failure_message_lists_worst_first_and_caps_the_lines():
    fresh = [{**SPOT, "x": float(i), "d": i / 1000} for i in range(40)]
    lines = rs.failure_message(fresh, [], limit=30).splitlines()
    assert lines[0] == "40 new grass-over-road spots (tests/road_scan_known.json lists the known ones):"
    assert len(lines) == 32 and lines[1].startswith("x 39.0") and lines[-1] == "... and 10 more"


def test_failure_message_mentions_gone_spots():
    msg = rs.failure_message([], [{"x": 1.0, "z": 2.0, "n": "A", "issue": 1300}])
    assert "1 known spot no longer found" in msg and "x 1.0 z 2.0 (A, #1300)" in msg


def test_load_known_reads_the_list_and_rejects_bad_entries(tmp_path):
    good = tmp_path / "k.json"
    good.write_text(json.dumps([{"x": 1, "z": 2, "n": "A", "issue": None}]), encoding="utf-8")
    assert rs.load_known(good) == [{"x": 1, "z": 2, "n": "A", "issue": None}]
    bad = tmp_path / "b.json"
    bad.write_text(json.dumps([{"x": "1", "z": 2}]), encoding="utf-8")
    with pytest.raises(ValueError):
        rs.load_known(bad)


def test_committed_known_list_is_valid():
    rs.load_known(rs.KNOWN)
