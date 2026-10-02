"""#12: road name in the HUD, house-number labels near the car, station boards. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_page(p, server, block_world=False, world=None):
    """world: a dict served instead of the file (lets a test patch fields in)."""
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    elif world is not None:
        body = json.dumps(world, ensure_ascii=False)
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=200, content_type="application/json", body=body))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def rhine_point(w):
    rh = next(x for x in w["water"] if x["name"] == "Rhein" and len(x["rings"][0]) > 20)
    ring = rh["rings"][0]
    return sum(q[0] for q in ring) / len(ring), sum(q[1] for q in ring) / len(ring)


@needs_world
def test_hud_names_the_road_under_the_car(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    segs = [(a, b) for r in w["roads"] if r["n"] == "Hauptstrasse" for a, b in zip(r["pts"], r["pts"][1:])]
    a, b = max(segs, key=lambda s: math.dist(*s))                       # longest Hauptstrasse segment (~475 m)
    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    rx, rz = rhine_point(w)
    with sync_playwright() as p:
        br, page = open_page(p, server)
        page.evaluate(f"() => window.__mm.place({mx}, {mz})")
        page.wait_for_function("() => window.__mm.hud().road === 'Hauptstrasse'", timeout=60000)
        shown = page.inner_text("#roadname")
        page.evaluate(f"() => window.__mm.place({rx}, {rz})")
        off_road = page.evaluate("() => window.__mm.roadDist()")
        page.wait_for_function("() => window.__mm.hud().road === ''", timeout=60000)
        br.close()
    assert shown == "Hauptstrasse"
    assert off_road > 3, off_road
