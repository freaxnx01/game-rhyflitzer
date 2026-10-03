"""#10 helicopter mode: F takes off and lands, flight controls, no checkpoints from the air, a flight is not counted.
Hand-traced layout (world + terrain blocked): no data files needed, deterministic. (1780, 560) is a vertex of the hand
Bahnhofstrasse and checkpoint 1 (Bahnhof Sisseln). flySim steps the flight headless (a headless frame is slow).
Slow (Playwright): run in the foreground."""
import math

import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SISSELN = (1780, 560)
FRAMES = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))"


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def fly(page):
    return page.evaluate("() => window.__mm.fly()")


def fly_sim(page, secs, hold=()):
    return page.evaluate("([s, h]) => window.__mm.flySim(s, h)", [secs, list(hold)])


def flags(page):
    return page.evaluate("() => window.__mm.raceFlags()")


def text(page, sel):
    """textContent, not inner_text: #toast and the #result lines are text-transform: uppercase."""
    return page.evaluate("(s) => document.querySelector(s).textContent", sel)


def take_off(page):
    page.keyboard.press("KeyF")
    return fly_sim(page, 10)


def test_f_does_nothing_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.press("KeyF")
        state = fly(page)
        b.close()
    assert state["on"] is False


def test_f_takes_off_climbs_and_shows_the_helicopter(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        s = take_off(page)
        page.wait_for_function("() => window.__mm.fly().heliVisible && !window.__mm.fly().carVisible", timeout=120000)
        toast = text(page, "#toast")
        b.close()
    assert s["on"] is True
    assert abs(s["alt"] - s["ground"] - 120) < 1e-6, s
    assert abs(s["y"] - s["ground"] - 120) < 1, s
    assert "Helicopter" in toast, toast


def test_flight_controls(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        s0 = take_off(page)
        fwd = fly_sim(page, 3, ["KeyW"])
        before_yaw = fly(page); yawed = fly_sim(page, 1, ["KeyD"])
        before_up = fly(page); up = fly_sim(page, 2, ["Space"])
        down = fly_sim(page, 40, ["ShiftLeft"])
        b.close()
    ahead = (fwd["x"] - s0["x"]) * math.cos(s0["th"]) + (fwd["z"] - s0["z"]) * math.sin(s0["th"])
    assert ahead > 30 and fwd["v"] > 30, (s0, fwd)
    assert abs(yawed["th"] - before_yaw["th"] - 1.2) < 1e-6, (before_yaw, yawed)
    assert abs(up["alt"] - before_up["alt"] - 30) < 1e-6, (before_up, up)
    assert down["ground"] + 10 - 0.01 <= down["y"] < down["ground"] + 60, down


def test_c_does_nothing_while_flying(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        view = page.evaluate("() => window.__mm.camView")
        page.keyboard.press("KeyC")
        in_flight = page.evaluate("() => window.__mm.camView")
        page.keyboard.press("KeyF")
        page.keyboard.press("KeyC")
        landed = page.evaluate("() => window.__mm.camView")
        b.close()
    assert in_flight == view and landed != view, (view, in_flight, landed)


def test_f_again_lands_on_a_road_without_a_jump(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        fly_sim(page, 5, ["KeyW"])
        page.keyboard.press("KeyF")
        state = fly(page)
        car = page.evaluate("() => window.__mm.car()")
        road = page.evaluate("() => window.__mm.roadDist()")
        f = flags(page)
        toast = text(page, "#toast")
        page.wait_for_function("() => !window.__mm.fly().heliVisible && window.__mm.fly().carVisible", timeout=120000)
        b.close()
    assert state["on"] is False
    assert road < 0 and abs(car["y"] - car["ground"]) < 0.5, (car, road)
    assert f["flown"] is True and f["jumped"] is False, f
    assert "Landed" in toast, toast


def test_r_ends_a_flight(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        page.keyboard.press("KeyR")
        state = fly(page)
        b.close()
    assert state["on"] is False


def test_no_checkpoint_from_the_air(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")
        page.evaluate(FRAMES)
        in_air = text(page, "#cpn")
        page.keyboard.press("KeyF")      # lands on the Bahnhofstrasse vertex = the checkpoint
        page.wait_for_function("() => document.querySelector('#cpn').textContent === '1'", timeout=120000)
        b.close()
    assert in_air == "0", in_air


def test_a_run_with_a_flight_is_not_counted(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        page.keyboard.press("KeyF")
        page.evaluate("() => window.__mm.finishNow()")
        result = text(page, "#result")
        best = page.evaluate("() => localStorage.getItem('mm.best2')")
        b.close()
    assert "with the helicopter, not counted" in result and "with a jump" not in result, result
    assert best is None


def test_help_lists_f(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.press("F1")
        help_text = page.inner_text("#help")
        b.close()
    assert "helicopter" in help_text, help_text
