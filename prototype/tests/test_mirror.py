"""#92: rear-view mirror. Hand-traced layout (no data files). The headless renderer draws under 1 fps, so every
check polls the end state (visible flag, render/frame counters) -- wait for arrival, never a fixed sleep."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
WAIT = 120000

MIRROR = "() => window.__mm.mirror()"
# the mirror camera's view direction projected on the car's forward vector: -1 = straight back
FWD = "(m => { const th = window.__mm.heading(); return m.look[0] * Math.cos(th) + m.look[2] * Math.sin(th); })(window.__mm.mirror())"


def open_hand(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(locale=locale, viewport={"width": 320, "height": 180}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.mirror && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames (see test_vehicles.wait_frames)."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=WAIT)


def start_in_view(page, presses):
    page.click("#startbtn", timeout=180000)
    for _ in range(presses):
        page.keyboard.press("KeyC")
    page.wait_for_function(f"() => window.__mm.camView === {presses}", timeout=WAIT)


def test_mirror_shows_only_in_the_cockpit_view(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        chase = page.evaluate(MIRROR)
        page.keyboard.press("KeyC")
        page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 2 && window.__mm.mirror().visible", timeout=WAIT)
        cockpit = page.evaluate(MIRROR)
        page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 3 && !window.__mm.mirror().visible", timeout=WAIT)
        b.close()
    assert chase["visible"] is False, chase
    assert cockpit["rect"]["w"] == 220 and cockpit["rect"]["y"] == 12, cockpit


def test_mirror_camera_looks_back_from_the_cockpit_eye(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function(f"() => window.__mm.mirror().visible && {FWD} < -0.9", timeout=WAIT)
        b.close()


def test_mirror_renders_every_second_frame_and_stops_when_hidden(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible && window.__mm.mirror().renders > 2", timeout=WAIT)
        r0, f0 = page.evaluate("() => [window.__mm.mirror().renders, window.__mm.mirror().frame]")
        page.wait_for_function(f"() => window.__mm.mirror().frame >= {f0 + 6}", timeout=WAIT)
        r1, f1 = page.evaluate("() => [window.__mm.mirror().renders, window.__mm.mirror().frame]")
        page.keyboard.press("KeyC")
        page.wait_for_function("() => !window.__mm.mirror().visible", timeout=WAIT)
        r2 = page.evaluate("() => window.__mm.mirror().renders")
        wait_frames(page, 4)
        r3 = page.evaluate("() => window.__mm.mirror().renders")
        b.close()
    assert (f1 - f0) // 2 - 1 <= r1 - r0 <= (f1 - f0) // 2 + 1, (r0, r1, f0, f1)   # half the frames
    assert r3 == r2, (r2, r3)                                                       # nothing rendered while hidden


def test_mirror_hides_while_b_or_tab_is_held_and_returns(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        for key in ("KeyB", "Tab"):
            page.keyboard.down(key)
            page.wait_for_function("() => !window.__mm.mirror().visible", timeout=WAIT)
            page.keyboard.up(key)
            page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        b.close()


def test_mirror_is_off_in_the_helicopter(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        page.keyboard.press("KeyF")
        page.wait_for_function("() => window.__mm.fly().on && !window.__mm.mirror().visible", timeout=WAIT)
        b.close()


def test_mirror_freezes_in_pause(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.keyboard.down("Space")
        page.wait_for_function("() => window.__mm.pause().state === 'racing' && window.__mm.pause().t > 0.3", timeout=WAIT)
        page.keyboard.press("Escape")
        page.keyboard.up("Space")
        page.wait_for_function("() => window.__mm.pause().on", timeout=WAIT)
        r0 = page.evaluate("() => window.__mm.mirror().renders")
        f0 = page.evaluate("() => window.__mm.pause().frame")
        page.wait_for_function(f"() => window.__mm.pause().frame >= {f0 + 4}", timeout=WAIT)
        state = page.evaluate(MIRROR)
        b.close()
    assert state["renders"] == r0 and state["visible"] is True, state


def test_mirror_is_off_on_touch_devices(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 320, "height": 180}, has_touch=True, is_mobile=True).new_page()
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.mirror && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.click("#startbtn", timeout=180000)
        for _ in range(2):
            page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 2", timeout=WAIT)
        wait_frames(page, 3)
        state = page.evaluate(MIRROR)
        b.close()
    assert state["visible"] is False and state["renders"] == 0, state
