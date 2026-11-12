"""#887: the Verein Plattform Sisslerfeld plate on the deck. Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
VEREIN_URL = "https://www.plattform-sisslerfeld.com/"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 960, "height": 540})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.plattform() && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def plattform(page):
    """The tower's frame hook: { facing, base, x, z, deckY }."""
    return page.evaluate("() => window.__mm.plattform()")


def polar(page, phi_deg, r):
    return page.evaluate("""([phi, r]) => { const p = window.__mm.plattform(), t = p.facing + phi * Math.PI / 180;
        return [p.x + r * Math.cos(t), p.z + r * Math.sin(t)]; }""", [phi_deg, r])


def key(page, name, ms=150):
    page.keyboard.press(name)
    page.wait_for_timeout(ms)


def on_foot_at(page, x, z, th, y):
    """Put the walker at (x, z, th) at height y (the car first, then Z, then place)."""
    page.evaluate("([x, z]) => window.__mm.place(x, z)", [plattform(page)["x"], plattform(page)["z"]])
    key(page, "z", 300)
    move_to(page, x, z, th, y)


def move_to(page, x, z, th, y):
    """Move the walker who is already on foot. Z would toggle back into the car, so on_foot_at is not reusable."""
    page.evaluate("([x, z, th, y]) => { window.__mm.place(x, z, th); window.__mm.setFootY(y); }", [x, z, th, y])


@needs_world
def test_deck_shows_the_verein_plate_and_e_opens_the_website(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        page.evaluate("() => { window.__opened = []; window.open = (u, t, f) => { window.__opened.push([u, t]); return null; }; }")
        plat = plattform(page)
        # On the deck walkway, in the band that offers 'website': past the stair head at polar(175, 1.56)
        # (within HOP.stairReach the hop wins, up to ~276 deg) and clear of the entrance below at
        # polar(0, 2.0) (within PROMPT_RANGE 'enter' wins, from ~294 deg on). Measured at r 2.5:
        # 278, 285 and 292 deg all give 'website', 272 gives 'down' and 298 gives 'enter'.
        x, z = polar(page, 285, 2.5)
        on_foot_at(page, x, z, plat["facing"], plat["deckY"])
        page.wait_for_function("() => !document.getElementById('vereinplate').hidden", timeout=120000)
        name = page.inner_text("#vereinplate")
        link = page.evaluate("() => { const a = document.getElementById('vereinlink'); return [a.href, a.target]; }")
        action = page.evaluate("() => window.__mm.keybar().action")
        key(page, "e")
        opened = page.evaluate("() => window.__opened")
        move_to(page, x, z, plat["facing"], plat["base"])   # back on the ground under the deck
        page.wait_for_function("() => document.getElementById('vereinplate').hidden", timeout=120000)
        b.close()
    assert "Verein Plattform Sisslerfeld" in name, name
    assert link == [VEREIN_URL, "_blank"], link
    assert action == "website", action
    assert opened == [[VEREIN_URL, "_blank"]], opened
    assert errors == []


@needs_world
def test_in_the_car_on_the_deck_there_is_no_plate(server):
    """The plate is the walker's: driving up onto the deck offers nothing."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        x, z = polar(page, 285, 2.5)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [x, z])
        page.wait_for_timeout(1000)
        state = page.evaluate("() => ({ hidden: document.getElementById('vereinplate').hidden, onDeck: window.__mm.onDeck(), action: window.__mm.keybar().action })")
        b.close()
    assert errors == []
    assert state["hidden"] and not state["onDeck"] and state["action"] != "website", state
