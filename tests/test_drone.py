"""#93: the drone chase camera, view 4 in the C cycle. Hand-traced layout (no data files), car at START heading pi: forward = -x, right = -z.
The drone lerps slowly and hovers with a small sway, so it never stands still: every check polls ARRIVAL inside a tolerance
(view index AND camera within +-1.5 m of 18 m back / 12 m up), never stillness and never a fixed sleep."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
WAIT = 120000
DRONE = 4                 # index in CAM_VIEWS
DIST, H, TOL = 18.0, 12.0, 1.5

# camera offset projected on the car's forward / right vectors, and the view direction on forward
AHEAD = "(c => { const th = window.__mm.heading(); return c.d[0] * Math.cos(th) + c.d[2] * Math.sin(th); })(window.__mm.cam())"
SIDE = "(c => { const th = window.__mm.heading(); return -c.d[0] * Math.sin(th) + c.d[2] * Math.cos(th); })(window.__mm.cam())"
LOOK = "(c => { const th = window.__mm.heading(); return c.look[0] * Math.cos(th) + c.look[2] * Math.sin(th); })(window.__mm.cam())"
ARRIVED = f"(c => c.view === {DRONE} && Math.abs(Math.hypot(c.d[0], c.d[2]) - {DIST}) < {TOL} && Math.abs(c.d[1] - {H}) < {TOL})(window.__mm.cam())"


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


def to_drone(page):
    page.click("#startbtn", timeout=180000)
    for _ in range(DRONE):
        page.keyboard.press("KeyC")
    page.wait_for_function(f"() => window.__mm.camView === {DRONE}", timeout=WAIT)


def test_drone_is_the_fifth_view_and_arrives_high_behind_the_car(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_drone(page)
        toast = page.evaluate("() => document.querySelector('#toast').textContent")
        page.wait_for_function(f"() => {ARRIVED}", timeout=WAIT)
        got = page.evaluate(f"() => ({{ d: window.__mm.cam().d, ahead: {AHEAD}, look: {LOOK}, car: window.__mm.hud().carVisible, shadow: window.__mm.hud().shadowVisible }})")
        b.close()
    assert toast == "Camera: Drone"
    assert got["ahead"] < -(DIST - TOL), got            # behind the car
    assert got["look"] > 0.3, got                       # looking ahead ...
    assert got["car"] is True and got["shadow"] is True, got   # ... at a visible car with its shadow


def test_drone_hovers_with_a_small_sway(server):
    """After arrival the lateral offset keeps moving inside a small band; a still camera (chase) would not."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_drone(page)
        page.wait_for_function(f"() => {ARRIVED}", timeout=WAIT)
        sides = []
        for _ in range(20):
            wait_frames(page, 1)
            sides.append(page.evaluate(f"() => {SIDE}"))
        b.close()
    spread = max(sides) - min(sides)
    assert 0.05 < spread < 1.2, sides


def test_hold_b_swings_the_drone_in_front(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_drone(page)
        page.wait_for_function(f"() => {ARRIVED}", timeout=WAIT)
        page.keyboard.down("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === true && {AHEAD} > {DIST - TOL}", timeout=WAIT)   # arrived in front
        held = page.evaluate(f"() => ({{ ahead: {AHEAD}, look: {LOOK}, h: window.__mm.cam().d[1], car: window.__mm.hud().carVisible }})")
        page.keyboard.up("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === false && {AHEAD} < -{DIST - TOL}", timeout=WAIT)
        released = page.evaluate(f"() => {LOOK}")
        b.close()
    assert held["look"] < -0.3, held                    # looks back past the car
    assert abs(held["h"] - H) < TOL, held               # still high
    assert held["car"] is True, held
    assert released > 0.3


@pytest.mark.parametrize("locale,text", [("de-CH", "Stossstange · Drohne"), ("en-US", "bumper · drone")])
def test_help_lists_the_drone(server, locale, text):
    with sync_playwright() as p:
        b, page = open_hand(p, server, locale)
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=WAIT)
        help_text = page.inner_text("#help")
        b.close()
    assert text in help_text, help_text
