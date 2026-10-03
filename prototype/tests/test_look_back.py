"""#65: hold B to look back. Hand-traced layout (no data files), car at START heading pi: forward = -x, right = -z.
The chase camera is smoothed and a headless renderer draws under 1 fps, so every check polls the end state
(flag AND camera on the expected side) -- wait for arrival, never a fixed sleep."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
WAIT = 120000

# camera offset and view direction projected on the car's forward vector
AHEAD = "(c => { const th = window.__mm.heading(); return c.d[0] * Math.cos(th) + c.d[2] * Math.sin(th); })(window.__mm.cam())"
LOOK = "(c => { const th = window.__mm.heading(); return c.look[0] * Math.cos(th) + c.look[2] * Math.sin(th); })(window.__mm.cam())"


def open_hand(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(locale=locale, viewport={"width": 320, "height": 180}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.cam && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames (see test_vehicles.wait_frames)."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=WAIT)


def test_hold_b_looks_back_in_the_chase_view(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn", timeout=180000)
        page.wait_for_function(f"() => {AHEAD} < -1 && {LOOK} > 0.5", timeout=WAIT)          # normal: behind the car, looking ahead
        page.keyboard.down("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === true && {AHEAD} > 1", timeout=WAIT)   # arrived in front of the car
        held = page.evaluate(f"() => ({{ ahead: {AHEAD}, look: {LOOK}, car: window.__mm.hud().carVisible }})")
        page.keyboard.up("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === false && {AHEAD} < -1", timeout=WAIT)
        released = page.evaluate(f"() => ({{ ahead: {AHEAD}, look: {LOOK} }})")
        b.close()
    assert held["look"] < -0.5, held           # looks backwards, past the car
    assert held["car"] is True, held           # the car stays in the chase picture
    assert released["look"] > 0.5, released


@pytest.mark.parametrize("presses,back_d,normal_d", [
    (2, [-0.325, 1.586, 0.494], [0.325, 1.586, 0.494]),    # cockpit: eye (-0.25, 1.22, -0.38) * 1.3, forward offset mirrored, driver stays left
    (3, [3.055, 0.715, 0.0], [-3.055, 0.715, 0.0]),        # bumper (2.35, 0.55, 0) * 1.3 -> rear bumper
])
def test_hold_b_looks_back_from_the_eye_views(server, presses, back_d, normal_d):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn", timeout=180000)
        for _ in range(presses):
            page.keyboard.press("KeyC")
        page.wait_for_function(f"() => window.__mm.camView === {presses}", timeout=WAIT)
        page.keyboard.down("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === true && window.__mm.cam().view === {presses}", timeout=WAIT)
        wait_frames(page)
        held = page.evaluate(f"() => ({{ d: window.__mm.cam().d, look: {LOOK}, car: window.__mm.hud().carVisible }})")
        page.keyboard.up("KeyB")
        page.wait_for_function("() => window.__mm.cam().back === false", timeout=WAIT)
        wait_frames(page)
        released = page.evaluate(f"() => ({{ d: window.__mm.cam().d, look: {LOOK} }})")
        b.close()
    assert held["d"] == pytest.approx(back_d, abs=1e-3), held
    assert held["look"] < -0.9, held
    assert held["car"] is False, held          # eye views keep the car hidden
    assert released["d"] == pytest.approx(normal_d, abs=1e-3), released
    assert released["look"] > 0.9, released


def test_b_does_nothing_on_the_start_overlay(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.down("KeyB")
        wait_frames(page, 3)
        back = page.evaluate("() => window.__mm.cam().back")
        page.keyboard.up("KeyB")
        b.close()
    assert back is False


@pytest.mark.parametrize("locale,text", [("de-CH", "zurückschauen (halten)"), ("en-US", "look back (hold)")])
def test_help_lists_b(server, locale, text):
    with sync_playwright() as p:
        b, page = open_hand(p, server, locale)
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=WAIT)
        help_text = page.inner_text("#help")
        b.close()
    assert text in help_text, help_text
