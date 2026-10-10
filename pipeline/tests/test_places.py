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
