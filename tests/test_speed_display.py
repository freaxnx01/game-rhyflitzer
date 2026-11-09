"""#745: the smiley speed display in Sisseln lights up for cars from the Smile-Kreisel. Slow (Playwright): foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
TH = -0.0526   # heading of the straight from the roundabout into the village (atan2 of SPEED_DISPLAY.approach)


def open_page(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.speedDisplay && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errors


@needs_world
def test_speed_display_shows_speed_and_smiley_for_cars_from_the_kreisel(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        sign = page.evaluate("() => window.__mm.speedDisplay()")
        assert sign and abs(sign["x"] - 1465.45) < 0.01 and abs(sign["z"] + 158.27) < 0.01
        assert sign["state"] == {"on": False}
        # 70 m before the sign on the straight, 60 km/h towards the village: on, over the limit
        page.evaluate(f"() => window.__mm.sim(1395.6, -153.9, {TH}, 60 / 3.6, 0.1)")
        s = page.evaluate("() => window.__mm.speedDisplay().state")
        assert s["on"] and s["kmh"] > 50 and s["happy"] is False
        # same spot at 30 km/h: on, happy
        page.evaluate(f"() => window.__mm.sim(1395.6, -153.9, {TH}, 30 / 3.6, 0.1)")
        s = page.evaluate("() => window.__mm.speedDisplay().state")
        assert s["on"] and s["kmh"] <= 50 and s["happy"] is True
        # past the sign, driving back towards the roundabout: the back of the sign, dark
        page.evaluate(f"() => window.__mm.sim(1480, -175, {TH + 3.14159}, 40 / 3.6, 0.1)")
        assert page.evaluate("() => window.__mm.speedDisplay().state") == {"on": False}
        assert page.evaluate("() => window.__mm.speedDisplay().redraws") >= 3
        assert not errors
        b.close()