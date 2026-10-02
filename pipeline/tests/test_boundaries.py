"""#48: Gemeinde boundaries (admin_level 8 member ways) as lines."""
from pathlib import Path

import pytest
import shapely

import geo
import world_boundaries as wb

FIX = Path(__file__).parent / "fixtures" / "boundaries.osm"
FRAME = geo.Frame(*geo.DEFAULT_ORIGIN)


def test_member_names_keeps_named_level_8_only():
    # 900 is shared by Alpha and Beta (and the level-2 "Land", ignored); 930 is level 9; 940's relation has no name
    assert wb.member_names(FIX) == {900: ["Alpha", "Beta"], 920: ["Beta"]}


def test_read_gives_game_lines_sorted_by_id():
    items = wb.read(FIX, FRAME)
    assert [(i, n) for i, n, _ in items] == [(900, ["Alpha", "Beta"]), (920, ["Beta"])]
    line900 = items[0][2]
    assert line900.coords[0] == pytest.approx((0, 0), abs=0.01)
    x1, z1 = line900.coords[-1]
    assert 220 < x1 < 230 and abs(z1) < 3                  # ~225 m east (LV95 grid is ~0.4° off true north: z ~ -1.5)
    x2, z2 = items[1][2].coords[-1]
    assert 220 < x2 < 230 and -230 < z2 < -215             # ~222 m north = negative z


def test_build_clips_rounds_and_keeps_names():
    clip = shapely.box(0, 0, 100, 100)
    out = wb.build([(7, ["A", "B"], shapely.LineString([(-50, 50.04), (50.06, 50.04)]))], clip)
    assert out == [{"id": 7, "names": ["A", "B"], "pts": [[0.0, 50.0], [50.1, 50.0]]}]


def test_build_drops_parts_shorter_than_5_m_and_lines_outside():
    clip = shapely.box(0, 0, 100, 100)
    items = [(1, ["A"], shapely.LineString([(-10, 10), (4, 10)])),        # 4 m inside
             (2, ["A"], shapely.LineString([(200, 10), (300, 10)])),      # fully outside
             (3, ["A"], shapely.LineString([(-10, 0), (-10, 100)]))]      # touches nothing
    assert wb.build(items, clip) == []


def test_build_splits_a_line_that_leaves_and_reenters():
    clip = shapely.box(0, 0, 100, 100)
    line = shapely.LineString([(10, 50), (150, 50), (150, 60), (10, 60)])
    out = wb.build([(5, ["A"], line)], clip)
    assert [o["id"] for o in out] == [5, 5]
    assert sorted(o["pts"][0][1] for o in out) == [50.0, 60.0]
