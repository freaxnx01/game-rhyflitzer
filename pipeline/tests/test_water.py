import base64

import numpy as np
import pytest
import shapely

import world_water as Wt
from osm_read import Area, Way

CLIP = shapely.box(0, 0, 400, 400)


def test_area_water_clipped_and_valid():
    rhine = Area(1, False, {"natural": "water", "water": "river"}, shapely.box(-100, 150, 500, 250))
    polys = Wt.polygons([rhine], [], CLIP)
    assert len(polys) == 1 and polys[0].is_valid
    assert polys[0].bounds == (0.0, 150.0, 400.0, 250.0)


def test_invalid_ring_is_repaired_not_raised():
    bow = shapely.Polygon([(0, 0), (100, 100), (100, 0), (0, 100)])      # self-intersecting
    polys = Wt.polygons([Area(2, True, {"natural": "water"}, bow)], [], CLIP)
    assert all(p.is_valid for p in polys) and sum(p.area for p in polys) > 0


def test_centre_lines_are_streams_not_flat_polygons():
    """Rivers mapped only as a centre line (the Sissle) fall several metres per kilometre; as flat polygons they were
    under the ground at one end and over the banks at the other. They are exported as lines with a width instead."""
    stream = Way(3, {"waterway": "stream", "name": "Bach"}, shapely.LineString([(0, 50), (400, 50)]))
    river = Way(4, {"waterway": "river", "width": "40"}, shapely.LineString([(0, 300), (400, 300)]))
    sissle = Way(5, {"waterway": "river", "name": "Sissle"}, shapely.LineString([(0, 200), (500, 200)]))
    polys = Wt.polygons([], [stream, river, sissle], CLIP)
    assert len(polys) == 1 and round(polys[0].area / 400) == 40          # a 40 m river stays a flat polygon
    st = sorted(Wt.streams([], [stream, river, sissle], CLIP), key=lambda s: s["w"])
    assert [(s["name"], s["w"]) for s in st] == [("Bach", 3.0), ("Sissle", 12.0)]
    assert st[1]["pts"][0] == [0.0, 200.0] and st[1]["pts"][-1] == [400.0, 200.0]     # clipped, flow direction kept


def test_stream_part_inside_area_water_is_dropped():
    area = Area(1, False, {"natural": "water"}, shapely.box(0, 280, 200, 320))
    river = Way(4, {"waterway": "river"}, shapely.LineString([(0, 300), (400, 300)]))
    assert len(Wt.polygons([area], [river], CLIP)) == 1
    st = Wt.streams([area], [river], CLIP)
    assert len(st) == 1 and st[0]["pts"][0][0] >= 200.0


def test_tunnel_and_culvert_streams_are_skipped():
    piped = Way(6, {"waterway": "stream", "tunnel": "culvert"}, shapely.LineString([(0, 50), (400, 50)]))
    assert Wt.streams([], [piped], CLIP) == []


def test_chunks_and_level():
    poly = shapely.box(0, 0, 1200, 100)
    parts = Wt.chunks([poly], 500)
    assert len(parts) == 3
    hdr = {"x0": 0.0, "z0": 0.0, "step": 10.0, "w": 121, "h": 11}
    heights = np.tile(np.linspace(0, 12, 121, dtype=np.float32), (11, 1))   # rises 1 m per 100 m east
    levels = [Wt.level(p, hdr, heights) for p in parts]
    assert levels[0] == pytest.approx(2.5, abs=0.3) and levels[2] == pytest.approx(11.0, abs=0.3)
    assert Wt.level(parts[0], None, None) == 0.0


def test_sdf_sign_and_clamp():
    s = Wt.sdf([shapely.box(100, 100, 200, 200)], (0, 0, 400, 400), step=10, clamp=120)
    a = np.frombuffer(base64.b64decode(s["data"]), dtype=np.int8).reshape(s["h"], s["w"])
    def at(x, z):
        return int(a[round((z - s["z0"]) / s["step"]), round((x - s["x0"]) / s["step"])])
    assert at(150, 150) == -50          # 50 m to the nearest outside pixel (the boundary at x = 100)
    assert 50 <= at(250, 150) <= 60     # boundary pixels count as outside, so 50..60 depending on the edge
    assert at(0, 0) == 120              # ~141 m away, clamped


HDR = {"x0": 0.0, "z0": 0.0, "step": 10.0, "w": 121, "h": 11}


def _flat(value=5.0):
    return np.full((11, 121), value, dtype=np.float32)


def test_level_ignores_nodata_samples():
    heights = _flat(5.0)
    heights[:, :50] = 0.0                      # nodata west of x = 500
    poly = shapely.box(300, 20, 700, 80)       # straddles the nodata edge
    assert Wt.level(poly, HDR, heights) == pytest.approx(5.0)


def test_level_none_when_only_nodata():
    assert Wt.level(shapely.box(300, 20, 700, 80), HDR, _flat(0.0)) is None


def test_level_narrow_polygon_uses_representative_point():
    heights = _flat(7.0)
    sliver = shapely.box(101, 20, 104, 80)     # no grid node (step 10) inside
    assert Wt.level(sliver, HDR, heights) == pytest.approx(7.0)
    assert Wt.level(sliver, HDR, _flat(0.0)) is None


def test_to_json_nodata_chunk_inherits_polygon_level():
    heights = _flat(5.0)
    heights[:, :60] = 0.0                      # first chunk (x 0..500) fully nodata
    out = Wt.to_json([shapely.box(0, 20, 1200, 80)], HDR, heights)
    assert len(out) == 3
    assert [o["level"] for o in out] == [pytest.approx(5.0)] * 3


def test_to_json_polygon_wholly_in_nodata_is_zero():
    out = Wt.to_json([shapely.box(0, 20, 1200, 80)], HDR, _flat(0.0))
    assert [o["level"] for o in out] == [0.0, 0.0, 0.0]


def test_sdf_no_water_and_all_water():
    empty = Wt.sdf([shapely.box(1000, 1000, 1100, 1100)], (0, 0, 100, 100), step=10, clamp=120)
    a = np.frombuffer(base64.b64decode(empty["data"]), dtype=np.int8)
    assert (a == 120).all()
    full = Wt.sdf([shapely.box(-10, -10, 110, 110)], (0, 0, 100, 100), step=10, clamp=120)
    b = np.frombuffer(base64.b64decode(full["data"]), dtype=np.int8)
    assert (b == -120).all()


def test_tiny_single_polygon_filtered():
    area = Area(9, True, {"natural": "water"}, shapely.box(10, 10, 10.5, 10.5))
    assert Wt.polygons([area], [], CLIP) == []


def test_to_json_carries_the_water_name():
    """HUD (#20): the name of the water you are at. Area water takes its own name, or the name of the waterway running
    through it (OSM names the Rhine on the river line, not on every riverbank polygon)."""
    pond = Area(1, False, {"natural": "water", "name": "Weiher"}, shapely.box(10, 10, 50, 50))
    bank = Area(2, False, {"natural": "water", "water": "river"}, shapely.box(0, 150, 400, 250))
    rhine = Way(9, {"waterway": "river", "name": "Rhein", "width": "200"}, shapely.LineString([(0, 200), (400, 200)]))
    brook = Way(10, {"waterway": "stream", "name": "Bach"}, shapely.LineString([(100, 400), (100, 160)]))   # mouth reaches in
    polys = Wt.polygons([pond, bank], [rhine], CLIP)
    out = Wt.to_json(polys, None, None, [pond, bank], [brook, rhine])
    assert sorted(w["name"] for w in out) == ["Rhein", "Weiher"]
    assert Wt.to_json(polys, None, None)[0].get("name", "") == ""


ROAD = shapely.LineString([(0, 100), (400, 100)])


def _road(cls="primary", bridge=False, w=9.0):
    return {"pts": [list(c) for c in ROAD.coords], "w": w, "cls": cls, "bridge": bridge}


def test_canal_beside_a_road_is_cut_away_where_its_ribbon_would_touch_the_road():
    """#229: an untagged canal is 10 m wide; 6 m from a 9 m road its ribbon lay on the carriageway."""
    canal = Way(7, {"waterway": "canal"}, shapely.LineString([(0, 106), (400, 106)]))
    assert Wt.streams([], [canal], CLIP, roads=[_road()]) == []
    assert len(Wt.streams([], [canal], CLIP)) == 1                         # no roads given: unchanged


def test_canal_crossing_a_road_is_cut_at_the_crossing_only():
    canal = Way(8, {"waterway": "canal"}, shapely.LineString([(200, 0), (200, 400)]))
    st = Wt.streams([], [canal], CLIP, roads=[_road()])
    assert len(st) == 2
    for s in st:
        assert all(abs(z - 100) >= 4.5 + 5.0 - 1e-6 for _, z in s["pts"])


def test_bridges_and_footpaths_do_not_cut_a_stream():
    canal = Way(9, {"waterway": "canal"}, shapely.LineString([(0, 106), (400, 106)]))
    for road in (_road(bridge=True), _road(cls="footway", w=2.0), _road(cls="path", w=1.0)):
        assert len(Wt.streams([], [canal], CLIP, roads=[road])) == 1


def test_stream_has_no_repeated_points_after_rounding():
    """#319: a cut within 5 cm of a vertex rounded to the same 0.1 m point; the prototype's ribbon then divided by a
    zero segment length and the water mesh got NaN vertices (Ehrendingen's Moosbach, a Lenzburg stream)."""
    brook = Way(11, {"waterway": "stream", "name": "Moosbach"}, shapely.LineString([(-10, 50), (0.04, 50), (200, 50)]))
    st = Wt.streams([], [brook], CLIP)
    assert len(st) == 1
    pts = st[0]["pts"]
    assert pts[0] == [0.0, 50.0] and pts[-1] == [200.0, 50.0]
    assert all(a != b for a, b in zip(pts, pts[1:]))
