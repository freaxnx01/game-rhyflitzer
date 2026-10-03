"""#77: hold Tab = the whole map (1x), big in the middle of the screen; release = the corner minimap at the chosen
zoom. The 3x time-lapse (#20) and its "not counted" flag are gone. Hand-traced layout (world + terrain blocked): no
data files needed, deterministic. (1780, 560) and (1660, 330) are vertices of the hand Bahnhofstrasse."""
import math

import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SISSELN = (1780, 560)   # hand Bahnhofstrasse vertex = checkpoint 1, Bahnhof Sisseln
UPHILL = (1660, 330)    # hand Bahnhofstrasse vertex, 260 m from SISSELN


def open_hand(p, server, width=1280, height=720):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": width, "height": height})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def mm(page):
    return page.evaluate("() => window.__mm.map()")


def box(page, sel):
    return page.locator(sel).bounding_box()


def car(page):
    return page.evaluate("() => window.__mm.car()")


def hold_tab(page):
    page.keyboard.down("Tab")
    page.wait_for_function("() => window.__mm.map().full === true", timeout=120000)


def release_tab(page):
    page.keyboard.up("Tab")
    page.wait_for_function("() => window.__mm.map().full === false", timeout=120000)


def wait_frames(page, n=3):
    """A headless tab only renders while a raf-polled wait drives it, so count frames instead of waiting on the clock."""
    page.evaluate("() => { if (window.__frames === undefined) { window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } }")
    f0 = page.evaluate("() => window.__frames")
    page.wait_for_function("f0 => window.__frames > f0 + %d" % n, arg=f0, timeout=120000)


def on_map(page, x, z):
    """Client (CSS px) position of world point (x, z) on the map canvas (800x400 buffer, any CSS size)."""
    px, py = page.evaluate(f"() => window.__mm.worldToMap({x}, {z})")
    bb = box(page, "#map")
    return bb["x"] + px * bb["width"] / 800, bb["y"] + py * bb["height"] / 400


def test_tab_does_nothing_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.down("Tab"); wait_frames(page)
        held = mm(page); width = box(page, "#map")["width"]
        page.keyboard.up("Tab")
        b.close()
    assert held["full"] is False and width == pytest.approx(400, abs=1)


def test_hold_tab_shows_the_whole_map_big_and_centred(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")
        whole = mm(page)
        page.keyboard.press("NumpadAdd"); page.keyboard.press("NumpadAdd")
        zoomed = mm(page)
        hold_tab(page)
        full = mm(page); label_full = page.text_content("#mapzoom"); big = box(page, "#map"); panel = box(page, "#br")
        page.keyboard.press("NumpadAdd"); wait_frames(page)                     # zoom key while full: 8x is remembered, 1x stays on screen
        full_after_plus = mm(page); label_after_plus = page.text_content("#mapzoom")
        release_tab(page)
        back = mm(page); label_back = page.text_content("#mapzoom"); small = box(page, "#map")
        b.close()
    assert whole["zoom"] == 1 and zoomed["zoom"] == 4
    assert full["full"] is True and full["zoom"] == 4 and label_full == "1×"
    assert (full["cx"], full["cz"]) == pytest.approx((whole["cx"], whole["cz"]), abs=0.5)   # the whole region
    assert big["width"] > 1000, big
    assert abs(panel["x"] + panel["width"] / 2 - 640) <= 2 and abs(panel["y"] + panel["height"] / 2 - 360) <= 2, panel
    assert full_after_plus["zoom"] == 8 and full_after_plus["full"] is True and label_after_plus == "1×"
    assert (full_after_plus["cx"], full_after_plus["cz"]) == pytest.approx((whole["cx"], whole["cz"]), abs=0.5)
    assert back["full"] is False and back["zoom"] == 8 and label_back == "8×"
    assert small["width"] == pytest.approx(400, abs=1)


def test_full_map_fits_a_small_screen(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server, 800, 450)
        page.click("#startbtn")
        hold_tab(page)
        big = box(page, "#map"); panel = box(page, "#br")
        release_tab(page)
        b.close()
    assert big["width"] > 600, big                                              # bigger than the 240 px small-screen minimap
    assert panel["x"] >= 0 and panel["y"] >= 0, panel
    assert panel["x"] + panel["width"] <= 800 and panel["y"] + panel["height"] <= 450, panel


def test_double_click_on_the_full_map_places_the_car(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        hold_tab(page)
        page.mouse.dblclick(*on_map(page, *UPHILL))
        placed = car(page); road = page.evaluate("() => window.__mm.roadDist()")
        release_tab(page)
        b.close()
    assert math.hypot(placed["x"] - UPHILL[0], placed["z"] - UPHILL[1]) < 30 and road < 0, (placed, road)


def test_tab_no_longer_speeds_up_and_the_run_counts(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")                                                 # race armed
        hold_tab(page); release_tab(page)
        flags = page.evaluate("() => window.__mm.raceFlags()")
        hud = page.evaluate("() => window.__mm.hud()")
        page.evaluate("() => window.__mm.finishNow()")
        result = page.text_content("#overlay")
        best = page.evaluate("() => localStorage.getItem('mm.best2')")
        help_text = page.text_content("#help")
        b.close()
    assert "fast" not in flags and flags["jumped"] is False, flags
    assert "timeScale" not in hud, hud
    assert "time-lapse" not in result and "not counted" not in result, result
    assert best is not None                                                     # the first finish is saved as the best time
    assert "full map (hold)" in help_text and "×3" not in help_text, help_text
