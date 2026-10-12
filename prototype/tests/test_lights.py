"""#270: press L to switch the car lights on and off. Hand layout (world + terrain blocked).
Slow (Playwright): run in the foreground. Verifies the compact and the DeLorean share the same lamp levels."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def start_hand(p, server, query=""):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 480, "height": 270}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


def wait_lights(page):
    """Wait until the game loop has run applyLamps at least once, so the off-state levels are applied."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function("() => window.__frames.n >= 2", timeout=120000)


def press_l_and_assert(page, expect_on):
    page.keyboard.press("KeyL")
    page.wait_for_function("() => window.__mm.toast().shown", timeout=120000)
    lights = page.evaluate("() => window.__mm.lights()")
    toast = page.evaluate("() => window.__mm.toast()")
    assert lights["head"] is expect_on, lights
    assert lights["headLevel"] == (2.0 if expect_on else 0.35), lights
    assert toast["text"] == ("Lights on" if expect_on else "Lights off"), toast
    return lights


def test_l_toggles_the_car_lights_on_and_off_on_the_compact(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        wait_lights(page)
        off = page.evaluate("() => window.__mm.lights()")
        assert off["head"] is False and off["headLevel"] == 0.35, off          # today's look
        press_l_and_assert(page, True)                                          # L -> lights on
        press_l_and_assert(page, False)                                        # L -> lights off (back to today)
        b.close()


def test_l_toggles_the_same_levels_on_the_delorean(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        wait_lights(page)
        page.evaluate("() => { window.__mm.setVehicle(window.__mm.vehicles().delorean); }")   # swap mid-race
        page.wait_for_function("() => window.__mm.vehicle().model === 'delorean'", timeout=120000)
        wait_lights(page)                                                      # buildCar + applyLamps ran
        off = page.evaluate("() => window.__mm.lights()")
        assert off["head"] is False and off["headLevel"] == 0.35, off
        press_l_and_assert(page, True)                                         # L -> lights on, same 2.0
        press_l_and_assert(page, False)                                        # L -> back to 0.35
        b.close()
