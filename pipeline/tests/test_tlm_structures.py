import pytest

import tlm_structures
from tests.tlm_synth import write_zip

ROAD, RAIL = "swissTLM3D_TLM_STRASSE", "swissTLM3D_TLM_EISENBAHN"
BRIDGE = [[(2638000.0, 1265000.0, 320.0), (2638020.0, 1265000.0, 320.0)]]       # 20 m, east-west
UNDER = [[(2638010.0, 1264805.0 + 10 * k, 300.0) for k in range(41)]]           # 400 m, north-south, crosses it


def attrs(kunstbaute, stufe="1", objektart="4m Strasse", name="Teststrasse"):
    return {"KUNSTBAUTE": kunstbaute, "STUFE": stufe, "OBJEKTART": objektart, "STRNAME": name, "NAME": ""}


def rail_bridge(parts=None):
    return [(attrs("Bruecke", objektart="Normalspur", name=""), parts or BRIDGE)]


def tlm_zip(tmp_path, road, rail):
    path = tmp_path / "tlm.zip"
    write_zip(path, ROAD, road)
    write_zip(path, RAIL, rail)
    return path


def test_build_keeps_structures_by_filter(tmp_path):
    kinds = ["Bruecke", "Unterfuehrung", "Tunnel", "Keine", "Treppe", "k_W", "in/auf Gebaeude"]
    road = [(attrs(kind, name=kind), [[(2700000.0 + 1000 * i, 1200000.0, 310.0), (2700020.0 + 1000 * i, 1200000.0, 310.2)]])
            for i, kind in enumerate(kinds)]
    doc = tlm_structures.build(tlm_zip(tmp_path, road, rail_bridge()))
    assert sorted(f["n"] for f in doc["structures"] if f["l"] == "road") == ["Bruecke", "Tunnel", "Unterfuehrung"]
    assert [f["k"] for f in doc["structures"] if f["l"] == "rail"] == ["Bruecke"]
    assert doc["partners"] == []


def test_build_keeps_crossing_partner_clipped(tmp_path):
    road = [(attrs("Keine", stufe="0", name="Unterquerung"), UNDER)]
    doc = tlm_structures.build(tlm_zip(tmp_path, road, rail_bridge()))
    assert [(f["l"], f["k"], f["n"]) for f in doc["partners"]] == [("road", "Keine", "Unterquerung")]
    parts = doc["partners"][0]["p"]
    assert len(parts) == 1, "the kept vertices are one run"
    # the bridge's own vertices are 10 m east and west of the road, so a road vertex is in reach up to 38.7 m away
    assert [p[1] for p in parts[0]] == [1264965.0, 1264975.0, 1264985.0, 1264995.0,
                                        1265005.0, 1265015.0, 1265025.0, 1265035.0]


def test_build_skips_non_crossing_keine(tmp_path):
    road = [(attrs("Keine", stufe="0", name="Nebenweg"),
             [[(2638000.0, 1265010.0, 300.0), (2638020.0, 1265010.0, 300.0)]])]
    doc = tlm_structures.build(tlm_zip(tmp_path, road, rail_bridge()))
    assert doc["partners"] == []


def test_build_skips_keine_joined_to_a_bridge_end(tmp_path):
    """The road that leaves a bridge shares its end vertex: it joins the axis, it does not pass under it."""
    road = [(attrs("Keine", name="Rampe"),
             [[(2638020.0, 1265000.0, 320.0), (2638060.0, 1265030.0, 316.0)]])]
    doc = tlm_structures.build(tlm_zip(tmp_path, road, rail_bridge()))
    assert doc["partners"] == []


def test_build_format(tmp_path):
    road = [(attrs("Keine", stufe="-1", name="Unterquerung"), UNDER)]
    doc = tlm_structures.build(tlm_zip(tmp_path, road, rail_bridge()), release="1999-12")
    assert doc["format"] == "TLMS1" and doc["release"] == "1999-12" and doc["source"] == "swissTLM3D © swisstopo"
    assert set(doc) == {"format", "release", "source", "structures", "partners"}
    for feature in doc["structures"] + doc["partners"]:
        assert set(feature) == {"l", "k", "s", "o", "n", "p"}
        assert feature["l"] in ("road", "rail") and isinstance(feature["s"], int)
        assert all(len(v) == 3 for part in feature["p"] for v in part)
    assert doc["partners"][0]["s"] == -1 and doc["structures"][0]["o"] == "Normalspur"


def test_load_missing_returns_none(tmp_path):
    assert tlm_structures.load(tmp_path / "nope.json.gz") is None


def test_build_writes_the_same_file_twice(tmp_path):
    doc = tlm_structures.build(tlm_zip(tmp_path, [(attrs("Keine", name="Unterquerung"), UNDER)], rail_bridge()))
    first, second = tmp_path / "a.json.gz", tmp_path / "b.json.gz"
    tlm_structures.write(doc, first)
    tlm_structures.write(doc, second)
    assert first.read_bytes() == second.read_bytes()
    assert tlm_structures.load(first) == doc


@pytest.mark.skipif(not tlm_structures.DEFAULT.exists(), reason="run pipeline/tlm_structures.py first")
def test_committed_extract():
    doc = tlm_structures.load()
    assert doc["format"] == "TLMS1" and doc["release"] == "2026-02"
    assert tlm_structures.DEFAULT.stat().st_size < 8e6, "AC-1: the committed extract stays under 8 MB"
    by_layer = {layer: [f for f in doc["structures"] if f["l"] == layer] for layer in ("road", "rail")}
    assert len(by_layer["road"]) == 68790 and len(by_layer["rail"]) == 8544
    assert 20000 < len(doc["partners"]) < 24000
