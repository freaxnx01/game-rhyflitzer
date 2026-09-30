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
    assert set(w) == {100, 101, 102}
    x0, z0 = w[100].line.coords[0]
    assert (x0, z0) == pytest.approx((0, 0), abs=0.01)
    x1, z1 = w[100].line.coords[-1]
    assert 70 < x1 < 80 and abs(z1) < 1           # ~75 m east


def test_building_area(data):
    b = [a for a in data.areas if a.tags.get("building")]
    assert len(b) == 1 and b[0].id == 200 and b[0].from_way
    assert 150 < b[0].geom.area < 300                # ~15 x 11 m


def test_shared_nodes_are_junctions(data):
    assert set(data.nodes) == {2}                    # node 2 joins ways 100, 101, 102
    assert data.way_nodes[100] == [1, 2]


def test_named_node(data):
    assert [n.id for n in data.named_nodes] == [20]
