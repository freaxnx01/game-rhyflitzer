"""#682: PostAuto route relations, chained and clipped, with their stops at the kerb."""
from pathlib import Path

import anchors
import geo
import world_bus as wb

FIX = Path(__file__).parent / "fixtures" / "bus.osm"
FRAME = geo.Frame(*geo.DEFAULT_ORIGIN)


def test_bus_lines_from_anchors():
    assert anchors.bus_lines({"bus": {"lines": ["133"]}}) == ["133"]
    assert anchors.bus_lines({}) == []


def test_read_keeps_bus_routes_of_the_chosen_lines():
    d = wb.read(FIX, FRAME, ["133"])
    assert [r.id for r in d.routes] == [700]
    r = d.routes[0]
    assert r.ways == [11, 12, 13, 14] and r.stops == [21, 22] and r.platforms == [23]
    assert d.way_nodes[13][0] == d.way_nodes[13][-1] == 3
    assert d.node_tags[21]["uic_ref"] == "8500001"
    x, z = d.node_xy[1]
    assert abs(x) < 0.5 and abs(z) < 0.5          # node 1 sits on the origin
