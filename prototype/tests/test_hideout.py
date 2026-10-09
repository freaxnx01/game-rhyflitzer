"""#102: the secret hideout in the Hübel -- a tunnel into the hill, a cavern with the Eiffel Tower, found by driving in.
Needs the real world and terrain (the hill is swisstopo's). Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
MOUTH_ROAD = (-703.3, 1419.1)          # the Hübel's centre line at the mouth
HEADING = 95 * math.pi / 180
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")


def open_page(p, server):
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    page.click("#startbtn")
    return br, page, errors


@needs_world
def test_floor_lid_and_tower(server):
    """The cavern floor is the cut, the lid is the hill 40+ m above it, the tower counts itself, walls and lamps exist."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        assert h is not None
        cx, cz = h["centre"]
        probe = page.evaluate(f"() => window.__mm.probe({cx}, {cz})")
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        roofed_mouth = page.evaluate(f"() => window.__mm.roofed({h['mouth'][0]}, {h['mouth'][1]})")
        counts = page.evaluate("() => window.__mm.counts")
        # inward from outside the hill at 2 m over the cavern floor: the first thing is the ring wall's outer face.
        # The target must sit inside the disc, where terrainH is the floor -- the hook takes `up` over the target.
        wall = page.evaluate(f"() => window.__mm.wallRoleAt({cx + 40}, {cz}, {cx + 21}, {cz}, 2)")
        tower = page.evaluate(f"() => window.__mm.wallRoleAt({cx - 20}, {cz}, {cx}, {cz}, 5.4)")
        br.close()
    assert errors == []
    assert 8 <= h["portalS"] <= 20, h
    assert abs(probe["terrain"] - h["floor"]) < 0.3, (probe, h)
    assert h["lid"] - h["floor"] >= 40, h
    assert sky >= h["lid"], (sky, h)
    assert roofed_mouth is False
    assert h["lidTris"] > 0 and h["walls"] >= 24 and h["lamps"] == 4, h
    assert counts["eiffel"] == 1
    assert h["found"] is False
    assert wall == "stone", wall
    assert tower == "dome", tower
