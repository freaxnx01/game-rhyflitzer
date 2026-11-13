"""#887, #914: the Verein Plattform Sisslerfeld plate on the deck -- V opens the website, E keeps the hop.
Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
VEREIN_URL = "https://www.plattform-sisslerfeld.com/"
HOP_DOWN = {"en": "E · Down", "de": "E · Hinunter"}   # #914: the prompt keeps the hop, the plate names V
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


def stub_open(page):
    page.evaluate("() => { window.__opened = []; window.open = (u, t, f) => { window.__opened.push([u, t]); return null; }; }")


@needs_world
def test_deck_shows_the_verein_plate_and_v_opens_the_website(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        stub_open(page)
        plat = plattform(page)
        # On the deck walkway, in the band where no E action is left: past the stair head at polar(175, 1.56)
        # (within HOP.stairReach the hop wins, up to ~276 deg) and clear of the entrance below at
        # polar(0, 2.0) (within PROMPT_RANGE 'enter' wins, from ~294 deg on). Measured at r 2.5:
        # 278, 285 and 292 all leave E without an action, 272 gives 'down' and 298 gives 'enter';
        # the plate stands alone there and V opens the site (#914).
        x, z = polar(page, 285, 2.5)
        on_foot_at(page, x, z, plat["facing"], plat["deckY"])
        page.wait_for_function("() => !document.getElementById('vereinplate').hidden", timeout=120000)
        name = page.inner_text("#vereinplate")
        link = page.evaluate("() => { const a = document.getElementById('vereinlink'); return [a.href, a.target]; }")
        action = page.evaluate("() => window.__mm.keybar().action")
        key(page, "v")
        opened = page.evaluate("() => window.__opened")
        move_to(page, x, z, plat["facing"], plat["base"])   # back on the ground under the deck
        page.wait_for_function("() => document.getElementById('vereinplate').hidden", timeout=120000)
        b.close()
    assert "Verein Plattform Sisslerfeld" in name, name
    assert "V Website" in name, name   # #914: the plate names its key
    assert link == [VEREIN_URL, "_blank"], link
    assert action is None, action   # E has nothing in this band anymore
    assert opened == [[VEREIN_URL, "_blank"]], opened
    assert errors == []


@needs_world
def test_deck_hop_band_shows_down_and_the_plate_and_e_still_hops(server):
    """#914: at the stair head E hops down, the plate rides as the prompt's second line and V opens the site."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        stub_open(page)
        plat = plattform(page)
        x, z = polar(page, 272, 2.5)   # the 'down' band (the measured 272 of the test above)
        on_foot_at(page, x, z, plat["facing"], plat["deckY"])
        page.wait_for_function("() => !document.getElementById('vereinplate').hidden && window.__mm.platHop() === 'down'", timeout=120000)
        state = page.evaluate("() => ({ prompt: document.querySelector('#prompt').textContent, plate: !document.getElementById('vereinplate').hidden, lang: window.GG_LANG })")
        key(page, "v")
        opened = page.evaluate("() => window.__opened")
        key(page, "e")   # the hop keeps E -- it drops the walker off the deck
        page.wait_for_function("() => window.__mm.platHop() === 'up' && document.getElementById('vereinplate').hidden", timeout=120000)   # 'down' lands in the door band, like the stair test
        ground = page.evaluate("() => ({ ...window.__mm.foot(), hop: window.__mm.platHop(), onDeck: window.__mm.onDeck() })")
        b.close()
    assert state["prompt"] == HOP_DOWN[state["lang"]], state
    assert state["plate"], state
    assert opened == [[VEREIN_URL, "_blank"]], opened   # V opened the site even with the hop prompt up
    assert abs(ground["y"] - plat["base"]) < 0.3 and ground["hop"] == "up" and not ground["onDeck"], ground
    assert errors == []


@needs_world
def test_in_the_car_on_the_deck_there_is_no_plate(server):
    """The plate is the walker's: driving up onto the deck offers nothing."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        stub_open(page)
        x, z = polar(page, 285, 2.5)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [x, z])
        page.wait_for_timeout(1000)
        key(page, "v")   # in the car V still just hides the car -- the website is the walker's
        state = page.evaluate("() => ({ hidden: document.getElementById('vereinplate').hidden, onDeck: window.__mm.onDeck(), action: window.__mm.keybar().action, opened: window.__opened })")
        b.close()
    assert errors == []
    assert state["hidden"] and not state["onDeck"] and state["action"] != "website", state
    assert state["opened"] == [], state
