"""#530: the federal building register (GWR) -- construction year per existing building, for the Sisseln 1952 layer.

Open Data of the Bundesamt für Statistik, "Gebäude- und Wohnungsregister". Attribution: "GWR © BFS".
The Aargau extract (ag.zip, ~76 MB) is streamed, never unpacked, and reduced to the buildings that exist
(GSTAT 1004) inside the bbox. Written into cache/gwr/ (gitignored) by

    python pipeline/gwr_ch.py fetch --out cache/gwr/hochrhein.json [--zip ag.zip]

Never called from build_world (offline builds)."""
import argparse
import csv
import io
import json
import sys
import zipfile
from pathlib import Path

import fields_ch
import geo

URL = "https://public.madd.bfs.admin.ch/ag.zip"
MEMBER = "gebaeude_batiment_edificio.csv"
EXISTING = "1004"
SOURCE = "GWR © BFS"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def _int_or_none(text):
    text = (text or "").strip()
    return int(text) if text else None


def parse(lines, lv95_box):
    """Tab-separated GWR building CSV (header first) -> existing buildings inside the LV95 box."""
    emin, nmin, emax, nmax = lv95_box
    items = []
    for r in csv.DictReader(lines, delimiter="\t"):
        if r["GSTAT"] != EXISTING or not r["GKODE"] or not r["GKODN"]:
            continue
        e, n = float(r["GKODE"]), float(r["GKODN"])
        if not (emin <= e <= emax and nmin <= n <= nmax):
            continue
        items.append({"egid": int(r["EGID"]), "E": e, "N": n,
                      "year": _int_or_none(r["GBAUJ"]), "period": _int_or_none(r["GBAUP"])})
    return items


def _read_zip(source, lv95):
    with zipfile.ZipFile(source) as z, z.open(MEMBER) as raw:
        return parse(io.TextIOWrapper(raw, encoding="utf-8", newline=""), lv95)


def fetch(bbox, out, session=None, zip_path=None):
    out = Path(out)
    if out.exists():
        n = len(json.loads(out.read_text(encoding="utf-8"))["rows"])
        log(f"gwr: {out} exists ({n} rows), not fetching")
        return n
    lv95 = fields_ch.lv95_bbox(bbox)
    if zip_path is None:
        if session is None:
            import requests
            session = requests.Session()
        log(f"gwr: downloading {URL}")
        r = session.get(URL, timeout=600)
        r.raise_for_status()
        rows = _read_zip(io.BytesIO(r.content), lv95)
    else:
        rows = _read_zip(zip_path, lv95)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part")
    tmp.write_text(json.dumps({"source": SOURCE, "rows": rows}, ensure_ascii=False), encoding="utf-8")
    tmp.rename(out)
    log(f"gwr: wrote {len(rows)} rows to {out}")
    return len(rows)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="extract the existing buildings of a lon/lat bbox from the BFS Aargau zip")
    f.add_argument("--out", required=True)
    f.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), default=geo.DEFAULT_BBOX)
    f.add_argument("--zip", dest="zip_path", help="use a local copy of ag.zip instead of downloading")
    a = ap.parse_args(argv)
    fetch(tuple(a.bbox), a.out, zip_path=a.zip_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
