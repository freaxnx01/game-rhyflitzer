"""#11 minimap: zoom 1x/2x/4x/8x (wheel over the map, +/- keys), a zoomed view follows the car and stays on the map,
double-click / double-tap on the map puts the car on the nearest road there (a jump during a race).
Hand-traced layout (world + terrain blocked): no data files needed, deterministic. (1780, 560) and (1660, 330) are
vertices of the hand Bahnhofstrasse, so the nearest jumpable road point is the clicked point itself.
Viewport 1280x720: the map is 400x200 CSS px and clear of #game-nav."""
import math

import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SISSELN = (1780, 560)   # hand Bahnhofstrasse vertex = checkpoint 1, Bahnhof Sisseln
UPHILL = (1660, 330)    # hand Bahnhofstrasse vertex, 260 m from SISSELN


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def car(page):
    return page.evaluate("() => window.__mm.car()")


def dist(c, pt):
    return math.hypot(c["x"] - pt[0], c["z"] - pt[1])


def zoom(page):
    return page.evaluate("() => window.__mm.map().zoom")


def on_map(page, x, z):
    """Client (CSS px) position of world point (x, z) on the minimap; the canvas is 800x400, shown smaller via CSS."""
    px, py = page.evaluate(f"() => window.__mm.worldToMap({x}, {z})")
    box = page.locator("#map").bounding_box()
    return box["x"] + px * box["width"] / 800, box["y"] + py * box["height"] / 400


def test_minimap_zoom_keys_follow_the_car_and_stay_on_the_map(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        mm = lambda: page.evaluate("() => window.__mm.map()")
        whole = mm(); corner = page.evaluate("() => window.__mm.mapToWorld(0, 0)")
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")
        whole_after_place = mm()
        steps = []
        for key in ["NumpadAdd", "Equal", "NumpadAdd", "NumpadAdd", "Minus", "NumpadSubtract", "Minus", "Minus"]:
            page.keyboard.press(key); steps.append(zoom(page))
        page.keyboard.press("NumpadAdd"); page.keyboard.press("NumpadAdd")
        label = page.text_content("#mapzoom")
        centred = mm()
        car_px = page.evaluate(f"() => window.__mm.worldToMap({SISSELN[0]}, {SISSELN[1]})")
        back = page.evaluate("() => window.__mm.mapToWorld(123, 45)")
        there = page.evaluate(f"() => window.__mm.worldToMap({back[0]}, {back[1]})")
        page.evaluate(f"() => window.__mm.place({corner[0]}, {corner[1]})")
        clamped = mm(); corner_4x = page.evaluate("() => window.__mm.mapToWorld(0, 0)")
        b.close()
    assert whole["zoom"] == 1 and whole_after_place == pytest.approx(whole, abs=1e-9)   # 1x = the whole region, car-independent
    assert steps == [2, 4, 8, 8, 4, 2, 1, 1]
    assert label == "4×"
    assert centred["zoom"] == 4 and centred["cx"] == pytest.approx(SISSELN[0], abs=0.5) and centred["cz"] == pytest.approx(SISSELN[1], abs=0.5)
    assert car_px == pytest.approx([400, 200], abs=0.5)
    assert there == pytest.approx([123, 45], abs=1e-6)
    assert corner_4x == pytest.approx(corner, abs=0.5)                       # clamped: never shows beyond the map
    assert clamped["cx"] > corner[0] + 500 and clamped["cz"] > corner[1] + 200


def test_minimap_wheel_zooms_and_never_scrolls(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("() => { window.__wheel = []; addEventListener('wheel', e => window.__wheel.push(e.defaultPrevented)); }")
        box = page.locator("#map").bounding_box(); page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        steps = []
        for dy in [-100, -100, -100, -100, 100, 100, 100, 100]:
            page.mouse.wheel(0, dy); page.wait_for_timeout(100); steps.append(zoom(page))
        page.mouse.wheel(0, -40); page.wait_for_timeout(100); small = zoom(page)
        page.mouse.wheel(0, -60); page.wait_for_timeout(100); summed = zoom(page)
        prevented = page.evaluate("() => window.__wheel")
        b.close()
    assert steps == [2, 4, 8, 8, 4, 2, 1, 1]
    assert (small, summed) == (1, 2)                                         # small trackpad deltas add up to one step
    assert prevented and all(prevented), prevented
