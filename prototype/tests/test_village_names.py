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
        t0 = page.evaluate("() => window.__mm.labelTick()")
        page.evaluate(f"() => window.__mm.place({MUMPF[0]}, {MUMPF[1]})")
        page.wait_for_function(f"() => window.__mm.labelTick() > {t0} + 2", timeout=60000)
        shown = names(page)
        br.close()
    assert "MUMPF" not in shown          # inside
    assert "SISSELN" not in shown        # 5.2 km away
    assert "WALLBACH" not in shown       # across the Rhine (#73)


def test_hand_layout_has_no_village_names(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        page.wait_for_function("() => window.__mm.labelTick() > 2", timeout=60000)
        shown = page.evaluate("() => window.__mm.villages()")
        sprites = page.evaluate("() => window.__mm.villageSprites()")
        br.close()
    assert shown == [] and sprites == []


CH_BANK = (3300, 100)      # Swiss bank, 1.3 km from Murg, 1.7 km from Sisseln, > 150 m from the border
DE_BANK = (3000, -1200)    # German bank, 1.5 km from Murg, 1.6 km from Sisseln
ON_BORDER = (2406.7, -670.6)   # Murg/Sisseln/Bad Säckingen border point in the Rhine


def place_and_wait(page, xz, js_condition):
    page.evaluate(f"() => window.__mm.place({xz[0]}, {xz[1]})")
    page.wait_for_function(js_condition, timeout=60000)
    return names(page)


@needs_world
def test_other_bank_names_hidden_except_on_the_river(server):
    """#73: from the Swiss bank no German names and vice versa; on the river both."""
    with sync_playwright() as p:
        br, page = open_page(p, server)
        border_points = page.evaluate("() => window.__mm.villageBorder()")
        ch = place_and_wait(page, CH_BANK, "() => window.__mm.villages().some(v => v.t === 'SISSELN')")
        de = place_and_wait(page, DE_BANK, "() => window.__mm.villages().some(v => v.t === 'MURG')")
        river = place_and_wait(page, ON_BORDER, "() => window.__mm.villages().some(v => v.t === 'SISSELN')")
        br.close()
    assert border_points > 100, border_points
    assert "MURG" not in ch, ch
    assert "SISSELN" not in de, de
    assert "MURG" in river and "SISSELN" in river, river


@needs_world
def test_no_names_inside_sisseln(server):
    """#73 repro: in Sisseln, MURG (or any other name) must not hang over the houses."""
    with sync_playwright() as p:
        br, page = open_page(p, server)
        place_and_wait(page, CH_BANK, "() => window.__mm.villages().length > 0")
        shown = place_and_wait(page, SISSELN, "() => window.__mm.villages().length === 0")
        sprites = page.evaluate("() => window.__mm.villageSprites()")
        br.close()
    assert shown == [] and sprites == [], (shown, sprites)
