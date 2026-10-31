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
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def wait_frames(page, n=2):
    """The camera matrices the pick uses are refreshed by the render loop; a headless renderer can draw under 1 fps."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=T)


def car(page):
    return page.evaluate("() => window.__mm.car()")


GROUND = (1000, 420)   # lower right: terrain about 10 m from the start, below the horizon of the settled chase camera

# touch taps as pointer events in one evaluate, like test_minimap: the game wants two taps < 300 ms apart, while a
# headless renderer takes ~1 s per frame and dispatches real touchscreen taps a frame (seconds) apart
TAPS_JS = """([x, y, n]) => { const g = document.querySelector('#gl'); for (let i = 0; i < n; i++) g.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: x, clientY: y, bubbles: true })); }"""


def settle_camera(page):
    """The chase camera eases in from its first-frame pose; a pick before it settles depends on the frame rate."""
    page.wait_for_function("""() => { const c = window.__mm.cam().d, p = window.__camPrev; window.__camPrev = c;
      return !!p && Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) < 1e-3; }""", timeout=T, polling="raf")


def test_double_click_beams_to_the_clicked_ground_point_and_flags_the_run(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.click("#startbtn")
        settle_camera(page)
        start = car(page)
        heading = page.evaluate("() => window.__mm.heading()")
        pick = page.evaluate(f"() => window.__mm.beamPick({GROUND[0]}, {GROUND[1]})")
        assert pick is not None, "GROUND is not on the terrain any more"
        page.mouse.click(*GROUND)
        single = car(page)
        page.mouse.dblclick(*GROUND)
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
        settle_camera(page)
        pick = page.evaluate(f"() => window.__mm.beamPick({GROUND[0]}, {GROUND[1]})")
        assert pick is not None, "GROUND is not on the terrain any more"
        page.evaluate(TAPS_JS, [GROUND[0], GROUND[1], 2])
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
