"""#506: farm fields -- fields_ch (the cantonal WFS fetch) and world_fields (parcels -> world file entries)."""
import json
from pathlib import Path

import pytest
import shapely

import fields_ch as FC
import world_fields as WFI
from geo import Frame, DEFAULT_BBOX
from osm_read import Area

BASE = "https://geodienste.ch/db/lwb_nutzungsflaechen_v2_0/deu"


def test_lv95_bbox_covers_the_world_bbox():
    emin, nmin, emax, nmax = FC.lv95_bbox(DEFAULT_BBOX, pad=0)
    assert 2635000 < emin < 2635100 and 2644400 < emax < 2644600      # measured 2026-10-31
    assert 1261100 < nmin < 1261200 and 1269100 < nmax < 1269300
    e2, n2, e3, n3 = FC.lv95_bbox(DEFAULT_BBOX, pad=100)
    assert e2 == pytest.approx(emin - 100) and n3 == pytest.approx(nmax + 100)


def test_wfs_url_pages_and_counts():
    u = FC.wfs_url((1, 2, 3, 4), count=50, start=100)
    assert u.startswith(BASE + "?") and "TYPENAMES=ms:nutzungsflaechen" in u and "SRSNAME=EPSG:2056" in u
    assert "BBOX=1,2,3,4,EPSG:2056" in u and "OUTPUTFORMAT=geojson" in u and "COUNT=50" in u and "STARTINDEX=100" in u
    assert "RESULTTYPE=hits" in FC.wfs_url((1, 2, 3, 4), hits=True)


class _Resp:
    def __init__(self, body): self.body = body
    def raise_for_status(self): pass
    def json(self): return self.body


class _Session:
    def __init__(self, pages): self.pages = pages; self.urls = []
    def get(self, url, timeout=None):
        self.urls.append(url); return _Resp(self.pages.pop(0))


def _fc(n):
    return {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"lnf_code": 513}, "geometry": None} for _ in range(n)]}


def test_fetch_pages_until_a_short_page_and_caches(tmp_path):
    out = tmp_path / "lwb" / "x.geojson"
    s = _Session([_fc(2), _fc(2), _fc(1)])
    assert FC.fetch(DEFAULT_BBOX, out, session=s, count=2) == 5
    assert [("STARTINDEX=%d" % i in u) for i, u in zip((0, 2, 4), s.urls)] == [True, True, True]
    assert len(json.loads(out.read_text())["features"]) == 5 and not out.with_suffix(".part").exists()
    s2 = _Session([])
    assert FC.fetch(DEFAULT_BBOX, out, session=s2) == 5 and s2.urls == []        # cache hit: no request


FRAME = Frame(47.5506, 7.9671)          # the Hochrhein origin: e0 2639781.3458, n0 1266787.0805
CLIP = shapely.box(-2000, -2000, 2000, 2000)


def lwb(code, ring_game, overlay=False, kanton="AG"):
    """A WFS feature in EPSG:2056 from a ring given in game metres."""
    coords = [[FRAME.e0 + x, FRAME.n0 - z] for x, z in ring_game] + [[FRAME.e0 + ring_game[0][0], FRAME.n0 - ring_game[0][1]]]
    return {"type": "Feature", "properties": {"lnf_code": code, "nutzung": "x", "ist_ueberlagernd": overlay,
                                              "flaeche_m2": 1, "bezugsjahr": 2025, "kanton": kanton,
                                              "identifikator_be": "secret", "nutzungsidentifikator": "secret"},
            "geometry": {"type": "MultiPolygon", "coordinates": [[coords]]}}


def rect(x0, z0, x1, z1):
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]


def road(pts, w=6.0):
    return {"cls": "residential", "w": w, "bridge": False, "pts": pts}


def poly(entry):
    return shapely.Polygon(entry["ring"], entry.get("holes", []))


@pytest.mark.parametrize("code,kind", [
    (513, "cereal"), (502, "cereal"), (516, "cereal"), (508, "maize"), (521, "maize"), (527, "rapeseed"),
    (522, "root"), (528, "root"), (531, "root"), (556, "fallow"), (559, "fallow"), (598, "bare"), (599, "bare"),
    (601, "meadow"), (613, "meadow"), (693, "meadow"), (611, "meadowDry"), (616, "pasture"), (617, "pasture"),
    (702, "orchard"), (704, "orchard"), (701, "vine"), (717, "vine"), (852, None), (902, None), (903, None), (951, None), (42, None),
])
def test_kind_of(code, kind):
    assert WFI.kind_of(code) == kind
    if kind is not None:
        assert kind in WFI.KINDS


def test_osm_kind_is_deterministic_and_only_for_fields():
    assert WFI.osm_kind({"landuse": "meadow"}, 7) == "meadow"
    assert WFI.osm_kind({"landuse": "vineyard"}, 7) == "vine"
    assert WFI.osm_kind({"landuse": "orchard"}, 7) == "orchard"
    assert WFI.osm_kind({"landuse": "forest"}, 7) is None and WFI.osm_kind({"natural": "water"}, 7) is None
    kinds = {WFI.osm_kind({"landuse": "farmland"}, i) for i in range(10)}
    assert kinds == {"cereal", "maize", "bare", "rapeseed"}
    assert WFI.osm_kind({"landuse": "farmland"}, 3) == WFI.osm_kind({"landuse": "farmland"}, 3)


def test_direction_follows_the_long_side():
    assert WFI.direction(shapely.Polygon(rect(0, 0, 200, 40))) == pytest.approx(0.0, abs=0.02)
    assert WFI.direction(shapely.Polygon(rect(0, 0, 40, 200))) == pytest.approx(1.57, abs=0.02)
    tilted = shapely.affinity.rotate(shapely.Polygon(rect(0, 0, 200, 40)), 30, use_radians=False)
    d = WFI.direction(tilted)
    assert 0 <= d < 3.15 and (abs(d - 0.52) < 0.03 or abs(d - 2.62) < 0.03)   # ±30° depending on the z-south frame


def test_build_maps_kinds_cuts_corridors_and_insets():
    feats = [lwb(513, rect(0, 0, 200, 100)), lwb(601, rect(0, 120, 200, 220)), lwb(951, rect(0, 0, 200, 100), overlay=True),
             lwb(902, rect(300, 0, 400, 100))]
    fields, stats = WFI.build(feats, [], [road([[100, -50], [100, 300]], w=6)], [[[-50, 50], [250, 50]]], CLIP, FRAME)
    assert stats["lwb"] == 2 and stats["dropped_overlay"] == 1 and stats["dropped_code"] == 1
    assert {f["kind"] for f in fields} == {"cereal", "meadow"} and all(f["src"] == "lwb" for f in fields)
    corridor = shapely.LineString([[100, -50], [100, 300]]).buffer(3 + WFI.FIELD_GAP - 0.01)
    rail_zone = shapely.LineString([[-50, 50], [250, 50]]).buffer(WFI.RAIL_GAP - 0.01)
    for f in fields:
        p = poly(f)
        assert not p.intersects(corridor) and not p.intersects(rail_zone)
        assert shapely.box(0, 0, 200, 220).buffer(-WFI.SEAM / 2 + 0.05).contains(p)      # inset by half the seam
        assert "identifikator" not in json.dumps(f) and all(len(pt) == 2 for pt in f["ring"])
        assert f["ring"][0] != f["ring"][-1] and 0 <= f["dir"] < 3.15
    assert stats["parts"] == len(fields) and len(fields) == 6     # 2 parcels x (left of road, right of road) with the rail cut: cereal 4 parts, meadow 2 parts


def test_build_osm_fills_only_where_lwb_has_nothing():
    feats = [lwb(513, rect(0, 0, 200, 100))]
    areas = [Area(11, True, {"landuse": "farmland"}, shapely.Polygon(rect(0, 0, 200, 100))),           # under the parcel: dropped
             Area(12, True, {"landuse": "meadow"}, shapely.Polygon(rect(-500, 0, -300, 100))),          # free: kept
             Area(13, True, {"landuse": "forest"}, shapely.Polygon(rect(-500, 200, -300, 300)))]
    fields, stats = WFI.build(feats, areas, [], [], CLIP, FRAME)
    assert stats["lwb"] == 1 and stats["osm"] == 1
    osm = [f for f in fields if f["src"] == "osm"]
    assert len(osm) == 1 and osm[0]["kind"] == "meadow" and poly(osm[0]).area == pytest.approx(199 * 99, rel=0.03)


def test_build_without_lwb_is_osm_only_and_empty_is_empty():
    assert WFI.build(None, [], [], [], CLIP, FRAME) == ([], {})
    areas = [Area(5, True, {"landuse": "farmland"}, shapely.Polygon(rect(0, 0, 100, 100)))]
    fields, stats = WFI.build(None, areas, [], [], CLIP, FRAME)
    assert len(fields) == 1 and fields[0]["src"] == "osm" and fields[0]["kind"] == WFI.osm_kind({"landuse": "farmland"}, 5)


def test_build_drops_small_parts_and_clips():
    feats = [lwb(513, rect(1900, 0, 2100, 100)), lwb(513, rect(500, 500, 515, 515))]
    fields, stats = WFI.build(feats, [], [], [], CLIP, FRAME)
    assert len(fields) == 1 and poly(fields[0]).bounds[2] <= 2000 and stats["dropped_small"] == 1
