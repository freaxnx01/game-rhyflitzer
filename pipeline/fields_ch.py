"""#506: the cantons' Landwirtschaftliche Nutzungsflächen (crop per parcel) from the geodienste.ch WFS.

Kanton Aargau: frei erhältlich, Open Data, "Freie Nutzung. Quellenangabe ist Pflicht." Attribution:
"Landwirtschaftliche Nutzungsflächen © Kanton Aargau, geodienste.ch". Fetched into cache/lwb/ (gitignored) by

    python pipeline/fields_ch.py fetch --out cache/lwb/hochrhein.geojson

and read by `osm.py build --fields cache/lwb/hochrhein.geojson`. Never called from build_world (offline builds)."""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlencode

import geo

BASE = "https://geodienste.ch/db/lwb_nutzungsflaechen_v2_0/deu"
TYPENAME = "ms:nutzungsflaechen"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def lv95_bbox(bbox, pad=100.0):
    """lon/lat (W, S, E, N) -> LV95 (emin, nmin, emax, nmax) around all four corners, padded."""
    corners = [geo._TO_LV95.transform(x, y) for x in (bbox[0], bbox[2]) for y in (bbox[1], bbox[3])]
    return (min(c[0] for c in corners) - pad, min(c[1] for c in corners) - pad,
            max(c[0] for c in corners) + pad, max(c[1] for c in corners) + pad)


def wfs_url(lv95, count=5000, start=0, hits=False):
    q = {"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature", "TYPENAMES": TYPENAME,
         "SRSNAME": "EPSG:2056", "BBOX": "%s,%s,%s,%s,EPSG:2056" % tuple(lv95)}
    if hits:
        q["RESULTTYPE"] = "hits"
    else:
        q.update({"OUTPUTFORMAT": "geojson", "COUNT": count, "STARTINDEX": start})
    return BASE + "?" + urlencode(q, safe=":,")


def fetch(bbox, out, session=None, count=5000):
    out = Path(out)
    if out.exists():
        n = len(json.loads(out.read_text(encoding="utf-8"))["features"])
        log(f"fields: {out} exists ({n} features), not fetching")
        return n
    if session is None:
        import requests
        session = requests.Session()
    lv95 = lv95_bbox(bbox)
    feats, start = [], 0
    log(f"fields: fetching Nutzungsflächen for LV95 {tuple(round(v) for v in lv95)} from geodienste.ch")
    while True:
        r = session.get(wfs_url(lv95, count, start), timeout=300)
        r.raise_for_status()
        page = r.json()["features"]
        feats += page
        log(f"fields: page at {start}: {len(page)} features")
        if len(page) < count:
            break
        start += len(page)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part")
    tmp.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    tmp.rename(out)
    log(f"fields: wrote {len(feats)} features to {out}")
    return len(feats)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download the parcels for a lon/lat bbox (anonymous WFS, ~7 MB for the Hochrhein)")
    f.add_argument("--out", required=True)
    f.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), default=geo.DEFAULT_BBOX)
    a = ap.parse_args(argv)
    fetch(tuple(a.bbox), a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
