"""#413: the Plattform Sisslerfeld's stair and deck. Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
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


def foot_sim(page, secs, hold=()):
    return page.evaluate("([s, h]) => window.__mm.footSim(s, h)", [secs, list(hold)])


def on_foot_at(page, x, z, th, y):
    """Put the walker at (x, z, th) at height y (the car first, then Z, then place)."""
    page.evaluate("([x, z]) => window.__mm.place(x, z)", [plattform(page)["x"], plattform(page)["z"]])
    key(page, "z", 300)
    page.evaluate("([x, z, th, y]) => { window.__mm.place(x, z, th); window.__mm.setFootY(y); }", [x, z, th, y])


@needs_world
def test_e_at_the_door_says_the_stair_is_open(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = plattform(page)
        ex, ez = polar(page, 0, 2.0)   # plattformEntrance: r 2.0 on the door side
        on_foot_at(page, ex, ez, plat["facing"] + math.pi, plat["base"])
        page.wait_for_function("() => window.__mm.enterables.prompt() === 'plattform-sisslerfeld'", timeout=120000)   # the prompt needs one rendered frame (stepEnter); headless draws under 1 fps
        before = page.evaluate("() => window.__mm.toast()")
        key(page, "e", 300)
        toast = page.evaluate("() => window.__mm.toast()")
        lang = page.evaluate("() => window.GG_LANG || 'en'")
        b.close()
    assert errors == []
    assert before["shown"] is False, before   # the on-foot hint has made way for the prompt
    assert toast["shown"] is True, toast
    expected = "Die Treppe ist offen -- einfach hineingehen" if lang == "de" else "The stair is open -- just walk in"
    assert toast["text"] == expected, toast


@needs_world
def test_from_the_top_of_the_upper_flight_the_walker_reaches_the_deck(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = plattform(page)
        # on upper:15 (phi 430 deg, sector centre), r 0.8 on the tread, facing along the stair (tangential, clockwise from above)
        phi = 120 + 20 * 15 + 10
        x, z = polar(page, phi, 0.8)
        th = plat["facing"] + math.radians(phi + 90)
        on_foot_at(page, x, z, th, plat["base"] + 2.955 + 0.16 * 15)
        foot = foot_sim(page, 4.0, ["KeyW"])
        b.close()
    assert errors == []
    assert abs(foot["y"] - plat["deckY"]) < 0.1, foot


@needs_world
def test_the_parapet_holds_the_walker_on_the_deck(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = plattform(page)
        inradius = 9.84 / (2 * math.sqrt(3))
        u = inradius - 1   # 1 m inside the base edge, v = 0
        x = plat["x"] + u * math.cos(plat["facing"])
        z = plat["z"] + u * math.sin(plat["facing"])
        on_foot_at(page, x, z, plat["facing"], plat["deckY"])
        foot = foot_sim(page, 2.0, ["KeyW"])
        b.close()
    assert errors == []
    assert abs(foot["y"] - plat["deckY"]) < 0.05, foot
    assert math.hypot(foot["x"] - plat["x"], foot["z"] - plat["z"]) < inradius, foot
