"""#535: the desktop controls -- Space, N and B held together (#913: nitro is N, not Shift); Comma / Period signal; E is the context key.
Hand-traced layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

# MMH_ROUTE, ARGS, ROAD, open_hand, press_z: copied from tests/test_on_foot.py

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
ROAD = (1810, 610)      # on the Bahnhofstrasse, 56 m past checkpoint 1 (Sisseln, trigger radius 7 m): its toast cannot replace a "Stop first"


def open_hand(p, server, start="#startbtn"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click(start)
    return b, page, errors


def press_z(page):
    page.keyboard.press("z")
    page.wait_for_timeout(200)


def test_space_n_and_b_held_together_give_gas_nitro_and_look_back(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        for k in ("Space", "KeyN", "KeyB"):
            page.keyboard.down(k)
        page.wait_for_function("() => { const d = window.__mm.drive(); return d.gas === 1 && d.nitro === 1 && d.back === true; }", timeout=120000)
        held = page.evaluate("() => window.__mm.keysDown()")
        for k in ("KeyB", "KeyN", "Space"):
            page.keyboard.up(k)
        b.close()
    assert errors == []
    assert {"Space", "KeyN", "KeyB"} <= set(held), held


def test_shift_is_no_longer_nitro_in_the_car_but_n_still_is(server):
    """#913: nitro is N in every context; Shift means down on foot and sink in the heli, so in the car it does nothing."""
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.keyboard.down("ShiftLeft")
        page.wait_for_timeout(500)
        shift_nitro = page.evaluate("() => window.__mm.drive().nitro")
        page.keyboard.up("ShiftLeft")
        page.keyboard.down("KeyN")
        page.wait_for_function("() => window.__mm.drive().nitro === 1", timeout=120000)
        page.keyboard.up("KeyN")
        b.close()
    assert errors == []
    assert shift_nitro == 0, shift_nitro


def test_comma_and_period_toggle_the_signals_and_q_e_do_nothing_in_the_car(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        hud = lambda: page.evaluate("() => window.__mm.hud().blinker")
        page.keyboard.press("KeyQ"); q = hud()
        page.keyboard.press("KeyE"); e = hud()
        page.keyboard.press("Comma"); left = hud()
        page.keyboard.press("Period"); right = hud()
        page.keyboard.press("Period"); off = hud()
        b.close()
    assert errors == []
    assert (q, e, left, right, off) == (None, None, "left", "right", None)


def test_comma_on_foot_does_not_signal(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = ROAD
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        page.keyboard.press("Comma")
        blinker = page.evaluate("() => window.__mm.hud().blinker")
        b.close()
    assert errors == []
    assert blinker is None