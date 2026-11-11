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


WORLD = Path(__file__).resolve().parents[2] / "data" / "world_hochrhein.json"


def _world_has_lwb_fields() -> bool:
    """The committed world file carries cantonal fields only when it was built with --fields."""
    if not WORLD.exists():
        return False
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    return any(f.get("src") == "lwb" for f in w.get("fields", []))


needs_fields_world = pytest.mark.skipif(not _world_has_lwb_fields(),
                                        reason="data/world_hochrhein.json was not built with --fields (docs/11-pipeline-osm.md)")


def test_osm_build_world_wires_fields_geojson_and_sources(tmp_path):
    """--fields flows through build_world into the world file's fields and sources; without it the OSM fallback runs
    (the synthetic extract has no farmland, so without --fields the world has no fields at all)."""
    import frame as frame_mod
    import osm
    from tests import synth_osm
    org = frame_mod.origin(synth_osm.RECT)
    fr = Frame(*org)
    pbf = synth_osm.write(tmp_path / "synth.osm")

    def lwb_at(code, x0, z0, x1, z1):
        ring = rect(x0, z0, x1, z1)
        coords = [[fr.e0 + x, fr.n0 - z] for x, z in ring] + [[fr.e0 + x0, fr.n0 - z0]]
        return {"type": "Feature", "properties": {"lnf_code": code, "ist_ueberlagernd": False},
                "geometry": {"type": "MultiPolygon", "coordinates": [[coords]]}}

    gj = tmp_path / "lwb.geojson"
    gj.write_text(json.dumps({"type": "FeatureCollection", "features": [
        lwb_at(513, 0, -250, 200, -60), lwb_at(902, -500, -500, -400, -400)]}), encoding="utf-8")
    world = osm.build_world(pbf, None, frame_mod.lonlat_bbox(synth_osm.RECT), org, 30.0, 1000.0, None)
    assert world["fields"] == [] and not any("Kanton Aargau" in s for s in world["sources"])
    world = osm.build_world(pbf, None, frame_mod.lonlat_bbox(synth_osm.RECT), org, 30.0, 1000.0, None, fields_geojson=gj)
    assert [f["kind"] for f in world["fields"]] == ["cereal"] and world["fields"][0]["src"] == "lwb"
    assert any("Kanton Aargau" in s for s in world["sources"])


def test_osm_build_world_cuts_the_crash_yard_only_on_hochrhein(tmp_path):
    """#629: the yard keep-out applies only when origin == geo.DEFAULT_ORIGIN (Hochrhein); other worlds stay uncut."""
    import frame as frame_mod
    import geo as geo_mod
    import osm
    from tests import synth_osm
    pbf = synth_osm.write(tmp_path / "synth.osm")

    def parcel(fr, x0, z0, x1, z1):
        ring = rect(x0, z0, x1, z1)
        coords = [[fr.e0 + x, fr.n0 - z] for x, z in ring] + [[fr.e0 + x0, fr.n0 - z0]]
        return {"type": "Feature", "properties": {"lnf_code": 513, "ist_ueberlagernd": False},
                "geometry": {"type": "MultiPolygon", "coordinates": [[coords]]}}

    gj = tmp_path / "lwb.geojson"

    def world_at(origin):
        fr = Frame(*origin)
        gj.write_text(json.dumps({"type": "FeatureCollection",
                                   "features": [parcel(fr, 500, 650, 800, 850)]}), encoding="utf-8")
        return osm.build_world(pbf, None, frame_mod.lonlat_bbox(synth_osm.RECT), origin, 30.0, 1000.0, None,
                               clip_box=(-1000.0, -1000.0, 1500.0, 1000.0), fields_geojson=gj)

    yard_zone = shapely.box(*WFI.CRASH_YARD).buffer(WFI.YARD_GAP - 0.05, join_style="mitre")
    hochrhein = world_at(geo_mod.DEFAULT_ORIGIN)["fields"]
    assert hochrhein and all(not poly(f).intersects(yard_zone) for f in hochrhein)
    other = world_at(frame_mod.origin(synth_osm.RECT))["fields"]
    assert any(poly(f).intersects(shapely.box(*WFI.CRASH_YARD)) for f in other)


@needs_fields_world
def test_real_world_fields_cover_the_swiss_side_and_keep_off_roads():
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    fields = w.get("fields", [])
    assert len(fields) >= 3000, len(fields)
    assert sum(poly(f).area for f in fields) / 1e4 >= 2500
    assert {f["kind"] for f in fields} >= set(WFI.KINDS) - {"vine"}      # vines are rare in the bbox; everything else must occur
    assert {f["src"] for f in fields} == {"lwb", "osm"}
    assert any("Kanton Aargau" in s for s in w["sources"])
    corridors = shapely.unary_union([shapely.LineString(r["pts"]).buffer(r["w"] / 2 + WFI.FIELD_GAP - 0.05)
                                     for r in w["roads"] if len(r["pts"]) > 1])
    shapely.prepare(corridors)
    tree = shapely.STRtree([poly(f) for f in fields])
    hits = [i for i in tree.query(corridors, predicate="intersects")]
    assert hits == [], f"{len(hits)} fields touch a road corridor, e.g. {fields[hits[0]]['ring'][:2]}"


@needs_fields_world
def test_real_world_fields_keep_off_the_crash_yard():
    """#629: the committed Hochrhein world has no field within YARD_GAP of the Crash-Platz."""
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    zone = shapely.box(*WFI.CRASH_YARD).buffer(WFI.YARD_GAP - 0.05, join_style="mitre")
    hits = [f for f in w["fields"] if poly(f).intersects(zone)]
    assert hits == [], f"{len(hits)} fields reach into the Crash-Platz"

def test_build_cuts_keep_out_rectangle():
    """A keep-out rectangle cuts a parcel like the road corridor does, plus the YARD_GAP margin (#629)."""
    feats = [lwb(513, rect(0, 0, 300, 200))]
    keep_out = ((100.0, 50.0, 200.0, 100.0),)
    fields, stats = WFI.build(feats, [], [], [], CLIP, FRAME, keep_out=keep_out)
    zone = shapely.box(100 - WFI.YARD_GAP + 0.05, 50 - WFI.YARD_GAP + 0.05,
                       200 + WFI.YARD_GAP - 0.05, 100 + WFI.YARD_GAP - 0.05)
    assert fields and all(not poly(f).intersects(zone) for f in fields)
    uncut = WFI.build(feats, [], [], [], CLIP, FRAME)[0]
    assert sum(poly(f).area for f in fields) < sum(poly(f).area for f in uncut)
    same = WFI.build(feats, [], [], [], CLIP, FRAME, keep_out=())
    assert [f["ring"] for f in same[0]] == [f["ring"] for f in uncut]


def test_build_cuts_stream_corridor():
    """A stream is no field: the parcel is cut half the stream width plus STREAM_GAP either side of the line (#661)."""
    feats = [lwb(513, rect(0, 0, 300, 200))]
    stream = {"name": "Bach", "w": 2.0, "pts": [[150.0, -10.0], [150.0, 210.0]]}
    fields, _ = WFI.build(feats, [], [], [], CLIP, FRAME, streams=[stream])
    zone = shapely.box(150 - 1.0 - WFI.STREAM_GAP + 0.05, 0, 150 + 1.0 + WFI.STREAM_GAP - 0.05, 200)
    assert len(fields) == 2 and all(not poly(f).intersects(zone) for f in fields)


def test_yard_constant_matches_crashyard_js():
    """WFI.CRASH_YARD mirrors CRASH_YARD in crashyard.js: (x0, z0, x0 + length, z0 + width)."""
    import re
    js = (Path(__file__).resolve().parents[2] / "crashyard.js").read_text(encoding="utf-8")
    x0, z0 = (float(v) for v in re.search(r"x0: *(\d+), z0: *(\d+)", js).groups())
    length, width = (float(v) for v in re.search(r"length: *(\d+), width: *(\d+)", js).groups())
    assert WFI.CRASH_YARD == (x0, z0, x0 + length, z0 + width)


def test_small_road_stub_wholly_inside_a_parcel_stays_a_hole():
    """A footbridge deck inside a meadow leaves a hole under MIN_AREA; dropping it would lay the field over the road."""
    stub = road([[100, 50], [101.7, 50]], w=1.0)
    fields, _ = WFI.build([lwb(601, rect(0, 0, 200, 100))], [], [stub], [], CLIP, FRAME)
    assert len(fields) == 1 and len(fields[0].get("holes", [])) == 1
    hole = shapely.Polygon(fields[0]["holes"][0])
    assert hole.area < WFI.MIN_AREA and hole.contains(shapely.Point(100.8, 50))
    assert not poly(fields[0]).intersects(shapely.LineString(stub["pts"]))
