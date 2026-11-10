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
def test_e_at_the_door_jumps_up_to_the_deck_and_e_at_the_stair_back_down(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = plattform(page)
        ex, ez = polar(page, 0, 2.0)
        on_foot_at(page, ex, ez, plat["facing"] + math.pi, plat["base"])
        page.wait_for_function("() => window.__mm.platHop() === 'up'", timeout=120000)   # one rendered frame; headless draws under 1 fps
        prompt = page.evaluate("() => window.__mm.keybar().action")
        key(page, "e", 300)
        up = page.evaluate("() => ({ ...window.__mm.foot(), hop: window.__mm.platHop() })")
        page.wait_for_function("() => window.__mm.platHop() === 'down'", timeout=120000)
        key(page, "e", 300)
        down = page.evaluate("() => ({ ...window.__mm.foot(), hop: window.__mm.platHop() })")
        b.close()
    assert errors == []
    assert prompt == "up", prompt
    assert abs(up["y"] - plat["deckY"]) < 0.3 and up["hop"] == "down", up
    assert abs(down["y"] - plat["base"]) < 0.3 and down["hop"] == "up", down
    assert math.hypot(down["x"] - ex, down["z"] - ez) < 1.5, down


@needs_world
def test_the_hop_prompt_clears_the_get_out_toast(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        ex, ez = polar(page, 0, 2.0)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [ex, ez])   # in the car, at the door
        key(page, "z", 300)                                              # get out: toast(tr('footOut'))
        page.wait_for_function("() => window.__mm.platHop() === 'up'", timeout=120000)
        page.wait_for_timeout(1500)                                      # a few more frames
        state = page.evaluate("() => ({ prompt: document.querySelector('#prompt').textContent, toastShown: document.querySelector('#toast').classList.contains('show') })")
        b.close()
    assert errors == []
    assert state["prompt"] != "" and not state["toastShown"], state


@needs_world
def test_hover_at_the_door_offers_no_hop(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = plattform(page)
        ex, ez = polar(page, 0, 2.0)
        on_foot_at(page, ex, ez, plat["facing"] + math.pi, plat["base"])
        page.evaluate("() => { window.__mm.setFootY(window.__mm.plattform().base + 3); }")   # mid-stair height
        key(page, "f")   # hover on
        hover_on = page.evaluate("() => window.__mm.foot().hover")
        none = page.evaluate("() => window.__mm.platHop()")
        b.close()
    assert none is None and errors == []
    assert hover_on   # F really turned hover on, so the null hop is the hover guard's doing


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


@needs_world
def test_the_tower_wears_the_real_look(server):
    """#855: the white roof, the slats and the rafters are in the built tower."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        look = page.evaluate("() => window.__mm.plattform().look")
        b.close()
    assert errors == []
    assert look == {"roof": "#efece4", "slats": 72, "rafters": 45}
