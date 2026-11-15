"""#530: gwr_ch -- the federal building register extract (construction years) for the Sisseln 1952 layer."""
import io
import json
import zipfile

import gwr_ch as G
from geo import DEFAULT_BBOX

HEADER = "EGID\tGDEKT\tGSTAT\tGKODE\tGKODN\tGBAUJ\tGBAUP"
BOX = (2640000.0, 1260000.0, 2650000.0, 1270000.0)


def row(egid, e, n, status="1004", year="", period=""):
    return "\t".join([str(egid), "AG", status, str(e), str(n), year, period])


def lines(*rows):
    return [HEADER, *rows]


def test_parse_keeps_existing_rows_inside_the_box():
    items = G.parse(lines(row(1, 2645000.5, 1265000.5), row(2, 2641000.0, 1261000.0),
                          row(3, 2642000.0, 1262000.0, status="1007"),
                          row(4, 2700000.0, 1265000.0)), BOX)
    assert [(i["egid"], i["E"], i["N"]) for i in items] == [(1, 2645000.5, 1265000.5), (2, 2641000.0, 1261000.0)]


def test_parse_skips_rows_without_coordinates():
    assert G.parse(lines(row(1, "", "")), BOX) == []


def test_parse_reads_year_and_period_or_none():
    a, b = G.parse(lines(row(1, 2645000, 1265000, period="8012"),
                         row(2, 2645000, 1265000, year="1931")), BOX)
    assert a["year"] is None and a["period"] == 8012
    assert b["year"] == 1931 and b["period"] is None


def test_fetch_reads_a_zip_and_writes_json(tmp_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("gebaeude_batiment_edificio.csv", "\n".join(lines(row(7, *_inside(), year="1950"))) + "\n")
    calls = []

    class Resp:
        content = buf.getvalue()
        def raise_for_status(self): pass

    class Session:
        def get(self, url, **kw):
            calls.append(url)
            return Resp()

    out = tmp_path / "gwr" / "x.json"
    assert G.fetch(DEFAULT_BBOX, out, session=Session()) == 1
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["source"] == "GWR © BFS" and data["rows"][0]["egid"] == 7 and data["rows"][0]["year"] == 1950
    assert G.fetch(DEFAULT_BBOX, out, session=Session()) == 1
    assert len(calls) == 1


def _inside():
    import fields_ch
    b = fields_ch.lv95_bbox(DEFAULT_BBOX)
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
