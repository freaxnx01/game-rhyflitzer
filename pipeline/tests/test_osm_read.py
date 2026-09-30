from pathlib import Path

import pytest

import geo
import osm_read

FIX = Path(__file__).parent / "fixtures" / "mini.osm"


@pytest.fixture(scope="module")
def data():
    return osm_read.read(FIX, geo.Frame(*geo.DEFAULT_ORIGIN))


def test_highways_in_game_coords(data):
    w = {w.id: w for w in data.ways}
    assert set(w) == {100, 101, 102, 103, 104}
    x0, z0 = w[100].line.coords[0]
    assert (x0, z0) == pytest.approx((0, 0), abs=0.01)
    x1, z1 = w[100].line.coords[-1]
    assert 70 < x1 < 80 and abs(z1) < 1           # ~75 m east


def test_building_area(data):
    b = [a for a in data.areas if a.tags.get("building")]
    assert len(b) == 1 and b[0].id == 200 and b[0].from_way
    assert 150 < b[0].geom.area < 300                # ~15 x 11 m


def test_shared_nodes_are_junctions(data):
    assert set(data.nodes) == {2, 31}                # 2 joins 100/101/102, 31 joins 103/104
    assert data.way_nodes[100] == [1, 2]


def test_junction_coords_survive_duplicate_locations(data):
    # way 104 has nodes 30 and 31 at the same spot, so its linestring drops a vertex;
    # node 31 (shared with way 103, read first) must keep its own location
    assert data.way_nodes[104] == [30, 31, 32]
    frame = geo.Frame(*geo.DEFAULT_ORIGIN)
    x, z = frame.to_game(7.9690, 47.5490)
    assert data.nodes[31] == pytest.approx((float(x), float(z)), abs=0.01)


def test_named_node(data):
    assert sorted(n.id for n in data.named_nodes) == [20, 21, 22, 24]
    # 23 (level_crossing) and 25 (highway=crossing) must be excluded
