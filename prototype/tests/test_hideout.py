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


def jump_list(page):
    page.keyboard.press("KeyJ")
    page.wait_for_function("() => !document.getElementById('jump').hidden")
    names = [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
    page.keyboard.press("Escape")
    page.wait_for_function("() => document.getElementById('jump').hidden")
    return names


@needs_world
def test_drive_in_finds_the_hideout(server):
    """Not listed before; drive from the Hübel into the hill: the car ends on the cavern floor, the find is toasted and
    remembered, J lists the Eiffelturm, and the chase camera stays under the ceiling."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        assert "Eiffelturm" not in jump_list(page)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        # gas held for 8 s: ~105 m down the tunnel, so the car comes to rest inside the cavern
        r = page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 8, ['KeyW'])")
        found = page.evaluate("() => window.__mm.hideout().found")
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        toast = page.evaluate("() => window.__mm.toast()")
        names = jump_list(page)
        lid = page.evaluate(f"() => window.__mm.lidAt({r['x']}, {r['z']})")
        # wait for arrival, not stillness (CLAUDE.md): the chase cam lerps in from the start screen at ~1 fps under SwiftShader
        page.wait_for_function(f"() => {{ const c = window.__mm.cam(), car = window.__mm.car(); return car.y + c.d[1] < {lid} && c.d[1] > 0; }}", timeout=120000)
        br.close()
    assert errors == []
    assert math.hypot(r["x"] - cx, r["z"] - cz) < 23, (r, h)
    assert abs(r["y"] - h["floor"]) < 1.0, (r, h)
    assert found is True and stored == "1"
    assert toast["shown"] and ("Hideout found" in toast["text"] or "Versteck gefunden" in toast["text"]), toast
    assert "Eiffelturm" in names
    assert lid is not None and lid - h["floor"] > 40, (lid, h)


@needs_world
def test_sky_ground_and_no_takeoff_inside(server):
    """The helicopter sees the hill over the cavern, and F inside the hideout is refused with a toast."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 8, ['KeyW'])")
        page.keyboard.press("KeyF")
        page.wait_for_timeout(500)
        toast = page.evaluate("() => window.__mm.toast().text")
        car = page.evaluate("() => window.__mm.car()")
        flying = page.evaluate("() => window.__mm.fly().on")
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        br.close()
    assert errors == []
    assert "sky" in toast or "Himmel" in toast, toast
    assert flying is False
    assert abs(car["y"] - h["floor"]) < 1.0, car
    assert sky >= h["lid"], (sky, h)
