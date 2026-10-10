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


# ---------- review fixes ----------
TC_TOP = "() => document.querySelector('#tc').getBoundingClientRect().top"


def test_hud_column_moves_below_the_mirror_and_back(server):
    """The top-centre HUD column (arrow, distance, checkpoint, road name, toast) must not sit on the mirror glass."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        wait_frames(page, 2)
        m = page.evaluate(MIRROR)
        tc_cockpit = page.evaluate(TC_TOP)
        page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 3 && !window.__mm.mirror().visible", timeout=WAIT)
        wait_frames(page, 2)
        tc_bumper = page.evaluate(TC_TOP)
        b.close()
    r = m["rect"]
    assert tc_cockpit >= r["y"] + r["h"] + 4, (tc_cockpit, r)   # below the 4 px steel frame
    assert abs(tc_bumper - 12) < 0.5, tc_bumper                  # back in its usual place without the mirror


def test_mirror_is_off_on_the_car_selection_screen(server):
    """#7: cockpit view, back to the start screen, Choose car: the turntable owns the camera, no mirror on it."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=WAIT)
        page.click("#pausemenu")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=WAIT)
        page.click("#carbtn")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=WAIT)
        wait_frames(page, 3)
        state = page.evaluate(MIRROR)
        b.close()
    assert state["visible"] is False, state


def test_mirror_shown_during_pause_renders_once(server):
    """Tab held (mirror hidden), pause, release Tab: the glass gets one picture of the frozen scene, then no more."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        page.keyboard.down("Tab")
        page.wait_for_function("() => !window.__mm.mirror().visible", timeout=WAIT)
        r0 = page.evaluate("() => window.__mm.mirror().renders")
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=WAIT)
        page.keyboard.up("Tab")
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        f0 = page.evaluate("() => window.__mm.pause().frame")
        page.wait_for_function(f"() => window.__mm.pause().frame >= {f0 + 4}", timeout=WAIT)
        r1 = page.evaluate("() => window.__mm.mirror().renders")
        b.close()
    assert r1 == r0 + 1, (r0, r1)


def test_mirror_stays_under_the_surface_with_the_cockpit_eye(server):
    """#101: in the shallows the cockpit eye can sit just under the surface; the mirror camera 0.1 m higher must not
    poke through it (the scene has the underwater look, so a camera above the water would show murk over dry land)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        ey = page.evaluate("() => window.__mm.cam().d[1]")
        # hand layout: water level 0, bed shelving from the south bank of the Rhine (z = -647.7 + 106.7) at 0.3 m/m;
        # find the spot where the bed is ey + 0.05 deep: the cockpit eye 5 cm under the surface
        z = page.evaluate("""(ey) => { let lo = -647.7, hi = -647.7 + 106.7;
            for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (-window.__mm.bed(863.6, m).ground > ey + 0.05) lo = m; else hi = m; }
            return (lo + hi) / 2; }""", ey)
        page.evaluate("([x, z]) => window.__mm.place(x, z, -Math.PI / 2)", [863.6, z])
        page.wait_for_function("() => window.__mm.car().splash > 1 && window.__mm.underwater().on && window.__mm.mirror().renders > 0", timeout=180000)
        r0 = page.evaluate("() => window.__mm.mirror().renders")
        page.wait_for_function(f"() => window.__mm.mirror().renders > {r0}", timeout=180000)
        c = page.evaluate("() => window.__mm.car()")
        cam = page.evaluate("() => window.__mm.cam()")
        m = page.evaluate(MIRROR)
        b.close()
    assert c["water"] == 0 and c["y"] + cam["d"][1] < 0 < c["y"] + cam["d"][1] + 0.1, (c, cam)   # the edge case is set up
    assert m["visible"] is True and m["pos"][1] < 0, m
