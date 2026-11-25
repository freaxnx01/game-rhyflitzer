"""#1200: flat roofs on slopes follow the measured ground; a building part under the ground is no invisible wall.
Needs the Hochrhein world (run pipeline/osm.py build first). Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && window.__mm.buildingTop !== undefined && document.querySelector('#worldstatus')?.textContent"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
SCHOOL = 210046850


def open_game(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US").new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


def travelled(page, x, z, th, v, secs):
    r = page.evaluate("([x, z, th, v, s]) => window.__mm.sim(x, z, th, v, s)", [x, z, th, v, secs])
    return math.hypot(r["x"] - x, r["z"] - z)


@needs_world
def test_school_roof_follows_the_measured_ground(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        top = page.evaluate(f"() => window.__mm.buildingTop({SCHOOL})")
        b.close()
    assert top is not None and top >= 44.0, top


@needs_world
def test_no_invisible_wall_north_of_the_school(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        d = travelled(page, 1890, 1922.9, -math.pi / 2, 8, 2)
        b.close()
    assert d >= 10, d


@needs_world
def test_school_still_blocks_where_it_stands(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        d = travelled(page, 1870, 1915, math.atan2(22, 18), 10, 3)
        b.close()
    assert d < 10, d
