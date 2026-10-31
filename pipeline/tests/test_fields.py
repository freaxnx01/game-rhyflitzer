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
