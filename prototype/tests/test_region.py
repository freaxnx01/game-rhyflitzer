"""#127: a second region, chosen with ?region= or on the start screen. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
EHR_WORLD = ROOT / "data" / "world_ehrendingen.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_ehr = pytest.mark.skipif(not EHR_WORLD.exists(), reason="Ehrendingen world not built (plan Task 10)")


def boot(p, server, query="", block=()):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    for pat in block:
        page.route(pat, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def test_default_is_hochrhein_and_marked(server):
    with sync_playwright() as p:
        b, page = boot(p, server)
        assert page.evaluate("() => window.__mm.region") == "hochrhein"
        assert page.get_attribute("#region-hochrhein", "aria-pressed") == "true"
        assert page.get_attribute("#region-ehrendingen", "aria-pressed") == "false"
        b.close()


def test_choosing_ehrendingen_reloads_with_the_parameter_and_keeps_vehicle(server):
    with sync_playwright() as p:
        b, page = boot(p, server, "?vehicle=delorean", block=["**/data/world_ehrendingen.json"])
        with page.expect_navigation():
            page.click("#region-ehrendingen")
        assert "region=ehrendingen" in page.url and "vehicle=delorean" in page.url
        b.close()


def test_missing_region_data_falls_back_to_hochrhein(server):
    with sync_playwright() as p:
        b, page = boot(p, server, "?region=ehrendingen", block=["**/data/world_ehrendingen.json"])
        assert page.evaluate("() => window.__mm.region") == "hochrhein"
        # the regionMissing toast, not the start-screen button: CSS uppercases the rendered text, so match case-blind
        page.wait_for_function("() => /no data for ehrendingen/i.test(document.body.innerText)", timeout=10000)
        b.close()


@needs_ehr
def test_ehrendingen_loads_and_j_reaches_boendlern_and_the_wanderweg(server):
    lm = json.loads(EHR_WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"]
    with sync_playwright() as p:
        b, page = boot(p, server, "?region=ehrendingen")
        assert page.evaluate("() => [window.__mm.region, window.__mm.layout]") == ["ehrendingen", "osm"]
        page.click("#startbtn")
        for query, key, on_trail in [("böndlern", "boendlern", False), ("wanderweg", "wanderweg", True)]:
            page.keyboard.press("KeyJ")
            page.keyboard.type(query)
            page.keyboard.press("Enter")
            c = page.evaluate("() => window.__mm.car()")
            assert math.hypot(c["x"] - lm[key]["x"], c["z"] - lm[key]["z"]) < 80
            if on_trail:
                assert page.evaluate("() => window.__mm.onTrail()")
        b.close()
