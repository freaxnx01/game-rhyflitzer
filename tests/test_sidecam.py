"""#1106: the side camera, view 5 in the C cycle: left of the car, diagonally above and a little behind. Polls ARRIVAL inside a tolerance, never stillness or a fixed sleep."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
WAIT = 120000
SIDEV = 5                # index in CAM_VIEWS
DIST, H, TOL = 6.9, 4.16, 1.5

# camera offset projected on the car's forward / right vectors, and the view direction on forward
AHEAD = "(c => { const th = window.__mm.heading(); return c.d[0] * Math.cos(th) + c.d[2] * Math.sin(th); })(window.__mm.cam())"
SIDE = "(c => { const th = window.__mm.heading(); return -c.d[0] * Math.sin(th) + c.d[2] * Math.cos(th); })(window.__mm.cam())"


def open_hand(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(locale=locale, viewport={"width": 320, "height": 180}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.cam && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames (see test_vehicles.wait_frames)."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=WAIT)


def to_side(page):
    page.click("#startbtn", timeout=180000)
    for _ in range(SIDEV):
        page.keyboard.press("KeyC")
    page.wait_for_function(f"() => window.__mm.camView === {SIDEV}", timeout=WAIT)


def test_side_is_the_sixth_view_and_arrives_left_above_behind(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_side(page)
        page.wait_for_function(f"() => {SIDE} < -{DIST - TOL} && Math.abs(window.__mm.cam().d[1] - {H}) < 1", timeout=WAIT)
        got = page.evaluate(f"() => ({{ side: {SIDE}, ahead: {AHEAD}, h: window.__mm.cam().d[1], car: window.__mm.hud().carVisible }})")
        b.close()
    assert got["ahead"] < 0 and got["car"] is True, got


def test_hold_b_mirrors_to_the_right(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_side(page)
        page.wait_for_function(f"() => {SIDE} < -{DIST - TOL}", timeout=WAIT)
        page.keyboard.down("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === true && {SIDE} > {DIST - TOL}", timeout=WAIT)
        page.keyboard.up("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === false && {SIDE} < -{DIST - TOL}", timeout=WAIT)
        b.close()


def test_c_from_side_wraps_to_chase(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_side(page)
        page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 0", timeout=WAIT)
        b.close()


def test_switching_vehicle_uses_its_numbers(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_side(page)
        page.evaluate("async () => { await window.__mm.loadVehicle('tanker'); window.__mm.setVehicle(window.__mm.vehicles().tanker); }")
        page.wait_for_function(f"() => {SIDE} < -18.5", timeout=WAIT)
        b.close()


@pytest.mark.parametrize("locale,text", [("de-CH", "Drohne · Seite"), ("en-US", "drone · side")])
def test_help_lists_the_side_view(server, locale, text):
    with sync_playwright() as p:
        b, page = open_hand(p, server, locale)
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=WAIT)
        help_text = page.inner_text("#help")
        b.close()
    assert text in help_text, help_text
