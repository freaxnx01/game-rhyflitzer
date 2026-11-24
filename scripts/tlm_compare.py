#!/usr/bin/env python3
"""#1151, one-off: today's crossing heights next to swissTLM3D's, written as the fixture every later part of the
bridge-height work tests against. The game side is read out of a real browser (`__mm.crossings`, `__mm.roadCrossings`),
the TLM side straight out of the release zip, so neither side goes through the pipeline step this is meant to judge.

    python scripts/tlm_compare.py --zip /tmp/swisstlm3d_2026-02_2056_5728.shp.zip \
        --out tests/fixtures/tlm_hochrhein_crossings.json

The 3.6 GB zip belongs in a temp directory (pipeline/tlm_read.py's download does that); it is never kept in the repo.
"""
from __future__ import annotations

import argparse
import http.server
import json
import socket
import sys
import threading
from functools import partial
from pathlib import Path

import shapely
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import tlm_read                                                   # noqa: E402  (after sys.path)
from mmh import read_mmh                                          # noqa: E402

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
DECK = 1.2                   # UNDERPASS.deck, world.js:163
TLM_RAIL_TOP = 0.3           # TLM rail z is the top of rail; the deck surface is that much lower
BRIDGE_KINDS = {"Bruecke", "Gedeckte Bruecke", "Bruecke mit Treppe", "Bruecke mit Galerie", "Steg"}
MARGIN = 200.0               # the world bbox is padded this far before the zip is read
DECK_REACH = 25.0            # a crossing takes its deck from a bridge axis this near
UNDER_REACH = 10.0           # ... and the road under it from a surface road axis this near
OFF = 1.0                    # |game - TLM| above this counts as off


def serve(root: Path):
    """The repo on a loopback port, as tests/conftest.py's server fixture does. Returns (url, shutdown)."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}", httpd.shutdown


def read_game(url: str) -> dict:
    """The loaded world's rail and road crossings, straight from the debug hooks."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        page = browser.new_page(viewport={"width": 480, "height": 270})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{url}/index.html")
        page.wait_for_selector("#mmhstatus.real", timeout=240000)
        page.wait_for_function("() => window.__mm && window.__mm.crossings && window.__mm.roadCrossings", timeout=240000)
        page.click("#startbtn", timeout=180000)
        out = {"rail": page.evaluate("() => window.__mm.crossings()"),
               "road": page.evaluate("() => window.__mm.roadCrossings()")}
        browser.close()
    if errors:
        raise RuntimeError(f"page errors: {errors}")
    return out


def world_bbox(origin: dict, bbox) -> tuple:
    """The world's lon/lat bbox as LV95, padded by MARGIN."""
    from pyproj import Transformer
    to_lv95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
    corners = [to_lv95.transform(lon, lat) for lon in (bbox[0], bbox[2]) for lat in (bbox[1], bbox[3])]
    es = [c[0] for c in corners]
    ns = [c[1] for c in corners]
    return (min(es) - MARGIN, min(ns) - MARGIN, max(es) + MARGIN, max(ns) + MARGIN)


def _lines(features, keep):
    return [shapely.LineString(part) for f in features if keep(f["attrs"])
            for part in f["parts"] if len(part) >= 2]


def _stufe(attrs) -> int:
    try:
        return int(attrs["STUFE"])
    except ValueError:
        return 0


def tlm_axes(zip_path: Path, bbox: tuple) -> dict:
    """The three axis sets a crossing is measured against: rail decks, road decks, the roads that run on the surface."""
    rail = list(tlm_read.iter_features(zip_path, "rail", bbox=bbox))
    road = list(tlm_read.iter_features(zip_path, "road", bbox=bbox))
    axes = {"rail_deck": _lines(rail, lambda a: a["KUNSTBAUTE"] in BRIDGE_KINDS),
            "road_deck": _lines(road, lambda a: a["KUNSTBAUTE"] in BRIDGE_KINDS),
            "road_under": _lines(road, lambda a: a["KUNSTBAUTE"] not in BRIDGE_KINDS and _stufe(a) <= 0)}
    print(f"TLM in the world bbox: {len(rail)} rail + {len(road)} road records -> "
          + ", ".join(f"{k} {len(v)}" for k, v in axes.items()), file=sys.stderr)
    return axes


def nearest_z(lines, point, reach: float):
    """The z of the nearest axis within reach, at the point projected onto it; None when nothing is near enough."""
    best = None
    for line in lines:
        d = line.distance(point)
        if d <= reach and (best is None or d < best[0]):
            best = (d, line.interpolate(line.project(point)).z)
    return None if best is None else best[1]


def compare(crossing: dict, kind: str, axes: dict, origin: dict, base: float) -> dict:
    point = shapely.Point(crossing["x"] + origin["E"], origin["N"] - crossing["z"])
    before = {"deck": crossing["deck"], "road": crossing["deck"] - DECK - crossing["clearance"],
              "clearance": crossing["clearance"], "depth": crossing["depth"]}
    deck = nearest_z(axes["rail_deck" if kind == "rail" else "road_deck"], point, DECK_REACH)
    tlm = None
    if deck is not None:
        tlm = {"deck": round(deck - (TLM_RAIL_TOP if kind == "rail" else 0.0) - base, 2),
               "road": nearest_z(axes["road_under"], point, UNDER_REACH)}
        if tlm["road"] is not None:
            tlm["road"] = round(tlm["road"] - base, 2)
    off = bool(tlm) and any(abs(before[k] - tlm[k]) > OFF for k in ("deck", "road") if tlm[k] is not None)
    return {"kind": kind, "x": crossing["x"], "z": crossing["z"], "road": crossing["road"],
            "before": {k: round(v, 3) for k, v in before.items()}, "tlm": tlm, "off": off}


def report(crossings) -> None:
    for kind in ("rail", "road"):
        of_kind = [c for c in crossings if c["kind"] == kind]
        matched = [c for c in of_kind if c["tlm"]]
        print(f"{kind}: {len(of_kind)} crossings, {len(matched)} with TLM, {sum(c['off'] for c in matched)} off by > {OFF} m",
              file=sys.stderr)
        if kind == "rail" and matched:
            lift = sorted(c["tlm"]["deck"] + TLM_RAIL_TOP - c["before"]["deck"] for c in matched)
            print(f"rail deck below the TLM top of rail: {lift[0]:.2f} .. {lift[-1]:.2f} m", file=sys.stderr)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--zip", required=True, type=Path, help="the swissTLM3D release zip, in a temp directory")
    ap.add_argument("--release", default="2026-02")
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args(argv)

    world = json.loads(WORLD.read_text(encoding="utf-8"))
    base = read_mmh(MMH)[0]["base"]
    axes = tlm_axes(a.zip, world_bbox(world["origin"], world["bbox"]))

    url, shutdown = serve(ROOT)
    try:
        game = read_game(url)
    finally:
        shutdown()
    crossings = [compare(c, kind, axes, world["origin"], base) for kind in ("rail", "road") for c in game[kind]]
    report(crossings)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps({"release": a.release, "base": base, "crossings": crossings},
                                ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {a.out} ({len(crossings)} crossings)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
