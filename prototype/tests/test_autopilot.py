"""#18: O picks a destination (J landmarks + streets), the car drives there along an A* route.
Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
ROUTE_RGB = (0x3D, 0xDC, 0xFF)


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")   # O only works with the start overlay hidden
    return b, page


def anchor(name):
    lm = json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"][name]
    return lm["x"], lm["z"]


def auto(page):
    return page.evaluate("() => window.__mm.auto()")


def drive_to(page, query, place=None):
    """Pick a destination the way a player does: O, type, choose the row (by place if given), Enter."""
    page.keyboard.press("KeyO")
    page.keyboard.type(query)
    rows = page.evaluate("() => window.__mm.jumpList()")
    i = next(k for k, r in enumerate(rows) if place is None or r["g"] == place)
    for _ in range(i):
        page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    return rows[i]


def route_pixels(page):
    return page.evaluate("""([r, g, b]) => { const c = document.getElementById('map'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) < 24 && Math.abs(d[i + 1] - g) < 24 && Math.abs(d[i + 2] - b) < 24) n++; return n; }""", list(ROUTE_RGB))


def frames(page, n=3):
    page.evaluate("(n) => new Promise(res => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : res()); f(); })", n)


@needs_world
def test_o_opens_the_drive_to_list_with_landmarks_and_streets(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyO")
        assert page.is_visible("#jump")
        assert page.text_content("#jumptitle") == "Drive to"
        assert page.evaluate("() => document.activeElement.id") == "jumpq"
        rows = page.evaluate("() => window.__mm.jumpList()")
        names = [r["n"] for r in rows]
        assert "Smile-Kreisel" in names and "Fridolinsmünster" in names
        assert {"n": "Bodenackerstrasse", "g": "Sisseln"} in rows
        assert "Random spot" not in names
        chips = page.eval_on_selector_all("#jumpchips button", "bs => bs.map(b => b.textContent)")
        assert chips[0] == "All" and "Sisseln" in chips and "Wallbach" in chips
        page.keyboard.press("KeyO")   # O on an empty search closes it
        assert not page.is_visible("#jump")
        page.keyboard.press("KeyJ")   # J is still the jump list
        assert page.text_content("#jumptitle") == "Jump to"
        assert "Random spot" in [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
        b.close()


@needs_world
def test_autopilot_drives_to_a_landmark_signals_and_stops(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        drive_to(page, "Smile")
        a = auto(page)
        assert a["on"] and a["dest"] == "Smile-Kreisel" and a["len"] > 300
        assert "Smile-Kreisel" in page.inner_html("#toast")
        assert page.evaluate("() => window.__mm.raceFlags().auto") is True
        r = page.evaluate("() => window.__mm.autoSim(150)")
        assert r["on"] is False and r["last"] == "arrived", r
        x, z = anchor("smileKreisel")
        assert math.hypot(r["x"] - x, r["z"] - z) < 40
        assert r["blinkers"], "a turn signal was set on the way"
        assert 20 < r["maxKmh"] <= 62
        assert auto(page)["blinker"] is None
        assert "Arrived" in page.inner_html("#toast")
        b.close()


@needs_world
def test_autopilot_drives_to_a_street(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        row = drive_to(page, "Bahnhofstrasse", place="Sisseln")
        assert row == {"n": "Bahnhofstrasse", "g": "Sisseln"}
        r = page.evaluate("() => window.__mm.autoSim(120)")
        assert r["last"] == "arrived", r
        assert page.evaluate("() => window.__mm.hud().road") == "Bahnhofstrasse"
        b.close()


@needs_world
@pytest.mark.parametrize("key", ["KeyA", "ArrowUp", "Space", "KeyS", "KeyO"])
def test_a_driving_key_takes_back_control(server, key):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        drive_to(page, "Smile")
        page.evaluate("() => window.__mm.autoSim(3)")
        page.keyboard.press(key)
        a = auto(page)
        assert a["on"] is False and a["last"] == "off"
        assert "Autopilot off" in page.inner_html("#toast")
        assert not page.is_visible("#jump")
        b.close()


@needs_world
def test_r_ends_the_autopilot_and_c_does_not(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        drive_to(page, "Smile")
        page.keyboard.press("KeyC")
        assert auto(page)["on"] is True
        page.keyboard.press("KeyR")
        assert auto(page)["on"] is False
        b.close()


@needs_world
def test_the_minimap_shows_the_route_while_driving(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        frames(page)
        assert route_pixels(page) < 20
        drive_to(page, "Fridolinsm")
        frames(page)
        assert route_pixels(page) > 200
        assert page.text_content("#autoline").startswith("AUTOPILOT → Fridolinsmünster")
        page.keyboard.press("KeyO")
        frames(page)
        assert route_pixels(page) < 20
        assert page.text_content("#autoline") == ""
        b.close()


@needs_world
def test_a_run_with_the_autopilot_is_not_counted(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.evaluate("() => localStorage.removeItem('mm.best2')")
        drive_to(page, "Smile")
        page.keyboard.press("KeyO")
        page.evaluate("() => window.__mm.finishNow()")
        assert "with the autopilot, not counted" in page.inner_html("#result")
        assert page.evaluate("() => localStorage.getItem('mm.best2')") is None
        page.click("#startbtn")
        assert page.evaluate("() => window.__mm.raceFlags().auto") is False
        b.close()


def test_hand_layout_has_no_autopilot(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, block_world=True)
        page.keyboard.press("KeyO")
        assert not page.is_visible("#jump")
        assert "Autopilot needs the OSM world" in page.inner_html("#toast")
        assert page.evaluate("() => window.__mm.auto().on") is False
        b.close()


@pytest.mark.parametrize("locale,text", [("en-US", "autopilot"), ("de-CH", "Autopilot")])
def test_help_lists_o(server, locale, text):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 1280, "height": 720}, locale=locale)
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=240000)
        assert text in page.inner_html("#help")
        b.close()


@needs_world
def test_f_takes_off_and_ends_the_autopilot_and_o_is_inert_in_flight(server):
    """#18 / #10: taking off ends the autopilot; while flying, O does not open the drive-to list."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        drive_to(page, "Smile")
        assert auto(page)["on"] is True
        page.keyboard.press("KeyF")
        flying = page.evaluate("() => window.__mm.fly().on")
        after_f = auto(page)["on"]
        page.keyboard.press("KeyO")
        jump_open = page.evaluate("() => !document.querySelector('#jump').hidden")
        b.close()
    assert after_f is False and flying is True
    assert jump_open is False
