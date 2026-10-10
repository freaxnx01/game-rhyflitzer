"""#166: the light four-step cut (simple extract, area relations, getid -r, merge)."""
import shutil
from pathlib import Path

import osmium
import pytest

import frame as F
import osm_cut as C
from tests import synth_osm

needs_osmium = pytest.mark.skipif(shutil.which("osmium") is None, reason="osmium-tool not installed")

CUT = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="47.50" lon="8.30"/><node id="2" lat="47.50" lon="8.31"/><node id="3" lat="47.51" lon="8.31"/>
  <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="99"/><nd ref="1"/><tag k="landuse" v="forest"/></way>
  <way id="11"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="natural" v="wood"/></way>
  <way id="12"><nd ref="1"/><nd ref="2"/><nd ref="98"/><nd ref="1"/><tag k="building" v="yes"/></way>
  <way id="13"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way>
</osm>
"""
RELS = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <relation id="20"><member type="way" ref="13" role="outer"/><member type="way" ref="77" role="inner"/><tag k="type" v="multipolygon"/><tag k="landuse" v="forest"/></relation>
  <relation id="21"><member type="way" ref="78" role="outer"/><tag k="type" v="multipolygon"/><tag k="natural" v="water"/></relation>
</osm>
"""


def test_commands():
    bbox = (8.1, 47.4, 8.2, 47.5)
    assert C.extract_cmd("ch.pbf", bbox, "o.pbf") == ["osmium", "extract", "-b", "8.100000,47.400000,8.200000,47.500000",
                                                      "-s", "simple", "--overwrite", "-o", "o.pbf", "ch.pbf"]
    assert C.relations_cmd("ch.pbf", "r.pbf") == ["osmium", "tags-filter", "-R", "--overwrite", "-o", "r.pbf", "ch.pbf",
                                                  "r/landuse=forest", "r/natural=wood,water", "r/water"]
    assert C.getid_cmd("ch.pbf", "ids.txt", "c.pbf") == ["osmium", "getid", "-r", "--overwrite", "-i", "ids.txt", "-o", "c.pbf", "ch.pbf"]
    assert C.merge_cmd(["a.pbf", "b.pbf"], "m.pbf") == ["osmium", "merge", "--overwrite", "a.pbf", "b.pbf", "-o", "m.pbf"]


def test_is_area_of_interest():
    assert C.is_area_of_interest({"landuse": "forest"}) and C.is_area_of_interest({"natural": "water"})
    assert C.is_area_of_interest({"water": "lake"}) and not C.is_area_of_interest({"building": "yes"})


def test_incomplete_ids(tmp_path):
    (tmp_path / "cut.osm").write_text(CUT, encoding="utf-8")
    (tmp_path / "rels.osm").write_text(RELS, encoding="utf-8")
    # relation 20 has a member way in the cut, 21 has none; way 10 is a broken forest, 11 is whole, 12 is no area of interest
    assert C.incomplete_ids(tmp_path / "cut.osm", tmp_path / "rels.osm") == ["r20", "w10"]


@needs_osmium
def test_cut_on_the_synthetic_extract(tmp_path):
    src = synth_osm.write(tmp_path / "synth.osm")
    out = C.cut(src, F.lonlat_bbox(synth_osm.RECT, 100), tmp_path / "cut.osm.pbf", tmp_path)
    ways = {o.id: dict(o.tags) for o in osmium.FileProcessor(str(out), osmium.osm.WAY)}
    assert any(t.get("landuse") == "forest" for t in ways.values())      # the wood lies wholly inside: it survives
    assert not (tmp_path / "ids.txt").exists()                            # nothing to complete -> no getid step
    assert Path(out).stat().st_size > 0


def test_incomplete_ids_skips_a_way_without_nodes(tmp_path):
    empty = CUT.replace("</osm>", '  <way id="14"><tag k="natural" v="wood"/></way>\n</osm>')
    (tmp_path / "cut.osm").write_text(empty, encoding="utf-8")
    (tmp_path / "rels.osm").write_text(RELS, encoding="utf-8")
    assert C.incomplete_ids(tmp_path / "cut.osm", tmp_path / "rels.osm") == ["r20", "w10"]
