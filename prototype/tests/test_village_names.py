"""#16: big village names over the villages from afar, hidden inside the village. Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
SISSELN = (1677.6, -329.8)   # OSM place node 240055476, as in VILLAGES
MUMPF = (-3484.8, 596.6)     # OSM place node 192826016


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def names(page):
    return [v["t"] for v in page.evaluate("() => window.__mm.villages()")]


@needs_world
def test_village_name_big_from_afar_hidden_inside(server):
    with sync_playwright() as p:
        br, page = open_page(p, server)
        page.evaluate(f"() => window.__mm.place({SISSELN[0] + 1500}, {SISSELN[1]})")       # 1.5 km east of Sisseln
        page.wait_for_function("() => window.__mm.villages().some(v => v.t === 'SISSELN')", timeout=60000)
        far = next(v for v in page.evaluate("() => window.__mm.villages()") if v["t"] == "SISSELN")
        sprite = next(s for s in page.evaluate("() => window.__mm.villageSprites()") if s["t"] == "SISSELN")
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")              # in the village centre
        page.wait_for_function("() => !window.__mm.villages().some(v => v.t === 'SISSELN')", timeout=60000)
        inside_sprites = [s["t"] for s in page.evaluate("() => window.__mm.villageSprites()")]
        br.close()
    assert far["opacity"] == 1 and far["h"] == 90, far
    assert abs(far["d"] - 1500) < 1, far
    assert sprite["depthTest"] is False and sprite["fog"] is False, sprite
    assert sprite["y"] - sprite["ground"] > 60, sprite
    assert sprite["w"] > sprite["h"] > 0, sprite
    assert "SISSELN" not in inside_sprites


@needs_world
def test_far_villages_and_own_village_hidden(server):
    with sync_playwright() as p:
        br, page = open_page(p, server)
        page.evaluate(f"() => window.__mm.place({MUMPF[0]}, {MUMPF[1]})")
        page.wait_for_function("() => window.__mm.villages().some(v => v.t === 'WALLBACH')", timeout=60000)   # 2.4 km away
        shown = names(page)
        br.close()
    assert "MUMPF" not in shown          # inside
    assert "SISSELN" not in shown        # 5.2 km away


def test_hand_layout_has_no_village_names(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        page.wait_for_function("() => window.__mm.labelTick() > 2", timeout=60000)
        shown = page.evaluate("() => window.__mm.villages()")
        sprites = page.evaluate("() => window.__mm.villageSprites()")
        br.close()
    assert shown == [] and sprites == []
