"""#165: double-click / double-tap on the 3D view beams the car to the clicked ground point, flagged like a jump in a race.
Hand-traced layout (world + terrain blocked): no data files needed, deterministic. Slow (Playwright): run in the foreground."""
import math

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
READY = "() => window.__mm && window.__mm.sim && window.__mm.beamPick && document.querySelector('#worldstatus')?.textContent"


def open_hand(p, server, touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, has_touch=touch)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def wait_frames(page, n=2):
    """The camera matrices the pick uses are refreshed by the render loop; a headless renderer can draw under 1 fps."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=T)


def car(page):
    return page.evaluate("() => window.__mm.car()")


def test_double_click_beams_to_the_clicked_ground_point_and_flags_the_run(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.click("#startbtn")
        wait_frames(page)
        start = car(page)
        heading = page.evaluate("() => window.__mm.heading()")
        pick = page.evaluate("() => window.__mm.beamPick(1000, 200)")        # upper right: ground well away from the car
        page.mouse.click(1000, 200)
        single = car(page)
        page.mouse.dblclick(1000, 200)
        page.wait_for_function("() => window.__mm.beam() !== null", timeout=T)
        landed = page.evaluate("() => window.__mm.beam()")
        after = car(page)
        heading_after = page.evaluate("() => window.__mm.heading()")
        flags = page.evaluate("() => window.__mm.raceFlags()")
        toast = page.evaluate("() => window.__mm.toast()")
        b.close()
    assert pick is not None
    assert math.hypot(single["x"] - start["x"], single["z"] - start["z"]) < 1               # a single click does nothing
    assert landed["kind"] == "terrain" and math.hypot(landed["x"] - pick["x"], landed["z"] - pick["z"]) < 0.5, (landed, pick)
    assert math.hypot(after["x"] - landed["x"], after["z"] - landed["z"]) < 0.5
    assert abs(heading_after - heading) < 1e-6                                              # heading kept
    assert flags["jumped"] is True                                                          # armed: a placement counts as a jump
    assert toast["text"] == "Beamed!"
    assert errors == []


def test_double_tap_beams_on_a_touch_screen(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server, touch=True)
        page.click("#startbtn")
        wait_frames(page)
        pick = page.evaluate("() => window.__mm.beamPick(1000, 200)")
        page.touchscreen.tap(1000, 200)
        page.touchscreen.tap(1000, 200)
        page.wait_for_function("() => window.__mm.beam() !== null", timeout=T)
        landed = page.evaluate("() => window.__mm.beam()")
        b.close()
    assert pick is not None and math.hypot(landed["x"] - pick["x"], landed["z"] - pick["z"]) < 0.5, (landed, pick)
    assert errors == []


def test_double_click_is_ignored_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        wait_frames(page)
        before = car(page)
        page.mouse.dblclick(640, 100)
        wait_frames(page)
        after = car(page)
        landed = page.evaluate("() => window.__mm.beam()")
        b.close()
    assert landed is None and (after["x"], after["z"]) == (before["x"], before["z"])
    assert errors == []
