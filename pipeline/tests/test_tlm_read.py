import json
from pathlib import Path

import pytest

import tlm_read
from tests.tlm_synth import write_zip

FIXTURE = Path(__file__).parents[2] / "tests" / "fixtures" / "tlm_hochrhein_crossings.json"


def road(kunstbaute="Bruecke", stufe="1", name="Hauptstrasse"):
    return {"KUNSTBAUTE": kunstbaute, "STUFE": stufe, "OBJEKTART": "4m Strasse", "STRNAME": name, "NAME": ""}


def test_iter_features_reads_polylinez_and_attrs(tmp_path):
    z = write_zip(tmp_path / "t.zip", "swissTLM3D_TLM_STRASSE",
                  [(road(), [[(2638000.0, 1265000.0, 313.4), (2638010.0, 1265000.0, 313.6)]])])
    f = list(tlm_read.iter_features(z, "road"))
    assert f[0]["attrs"]["KUNSTBAUTE"] == "Bruecke" and f[0]["attrs"]["STUFE"] == "1"
    assert f[0]["parts"] == [[[2638000.0, 1265000.0, 313.4], [2638010.0, 1265000.0, 313.6]]]


def test_iter_features_bbox_filters(tmp_path):
    z = write_zip(tmp_path / "t.zip", "swissTLM3D_TLM_STRASSE",
                  [(road(name="Weit weg"), [[(2600000.0, 1200000.0, 400.0), (2600010.0, 1200000.0, 400.2)]]),
                   (road(name="Hauptstrasse"), [[(2638000.0, 1265000.0, 313.4), (2638010.0, 1265000.0, 313.6)]])])
    f = list(tlm_read.iter_features(z, "road", bbox=(2637900.0, 1264900.0, 2638100.0, 1265100.0)))
    assert [x["idx"] for x in f] == [1]
    assert f[0]["attrs"]["STRNAME"] == "Hauptstrasse"


def test_iter_features_multipart(tmp_path):
    z = write_zip(tmp_path / "t.zip", "swissTLM3D_TLM_EISENBAHN",
                  [({"KUNSTBAUTE": "Bruecke", "STUFE": "1", "OBJEKTART": "Normalspur", "NAME": "Bözbergstrecke"},
                    [[(2638000.0, 1265000.0, 313.4), (2638010.0, 1265000.0, 313.6)],
                     [(2638000.0, 1265004.0, 313.4), (2638010.0, 1265004.0, 313.6)]])])
    f = list(tlm_read.iter_features(z, "rail"))
    assert len(f[0]["parts"]) == 2
    assert f[0]["parts"][1][0] == [2638000.0, 1265004.0, 313.4]
    assert f[0]["attrs"]["NAME"] == "Bözbergstrecke" and f[0]["attrs"]["STRNAME"] == ""


@pytest.mark.skipif(not FIXTURE.exists(), reason="run scripts/tlm_compare.py first")
def test_fixture_counts():
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    rail = [c for c in doc["crossings"] if c["kind"] == "rail"]
    assert doc["release"] == "2026-02" and doc["base"] == 284.0
    assert len(rail) == 38 and len([c for c in doc["crossings"] if c["kind"] == "road"]) == 17
    assert len([c for c in rail if c["tlm"]]) == 27
    koenigsweg = [c for c in rail if abs(c["x"] - 4609) < 15 and abs(c["z"] - 5561) < 15]
    assert koenigsweg and all(c["before"]["clearance"] < 0 for c in koenigsweg)
