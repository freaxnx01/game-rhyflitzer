import era_fields as F
import world_fields as W
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

SITE = box(0, 0, 400, 150)   # long axis along x

def test_strips_cover_the_site_and_stay_inside():
    s = F.strips(SITE)
    u = unary_union([p for _, p in s])
    assert abs(u.area - SITE.area) < 1.0 and u.difference(SITE.buffer(0.01)).is_empty

def test_strips_run_along_the_long_axis_with_widths_in_range():
    for _, p in F.strips(SITE):
        minx, minz, maxx, maxz = p.bounds
        assert maxz - minz <= F.STRIP_MAX + 0.01            # width across the long axis
        assert maxx - minx <= F.CROSS_MAX + 0.01

def test_strips_are_deterministic_and_use_era_kinds():
    a, b = F.strips(SITE), F.strips(SITE)
    assert [(k, p.wkt) for k, p in a] == [(k, p.wkt) for k, p in b]
    assert {k for k, _ in a} <= set(F.ERA_KINDS) and len({k for k, _ in a}) > 1

def test_layout_keeps_off_keep_out_and_insets_by_half_a_seam():
    road = LineString([(0, 75), (400, 75)]).buffer(4)
    out = F.layout(SITE, road)
    assert out and all(e["src"] == "era" and "dir" in e for e in out)
    for e in out:
        p = Polygon(e["ring"])
        assert not p.intersects(road)
        assert p.area >= W.MIN_AREA
        assert p.within(SITE.buffer(-W.SEAM / 2 + 0.05))

def test_layout_of_a_site_fully_kept_out_is_empty():
    assert F.layout(SITE, SITE.buffer(1)) == []
