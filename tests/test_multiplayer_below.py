"""#1109: while the own player is below ground (lift, ring, rooms), the other player's car and
name tag must stay drawn. The host needs the real world (the hideout exists only there); the
guest stays on the hand layout (two real-world pages do not fit the 2 GB cap). The sweep in
LEVELS.onChange depends only on the own level, so the guest's level does not change the result.
Slow (Playwright, two heavy pages): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

from test_multiplayer_lobby import ARGS, READY, T, connect, open_page
from test_multiplayer_cruise import NO_THROTTLE, ready_both
from test_testhub import STUB, CLIENT_ROUTE, needs_world


def open_real(browser, server):
    # open_page without the world/terrain 404 routes, plus ?dev=1 and the testhub stub, so testhub jumps work
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
    page = ctx.new_page(); page.set_default_timeout(T); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(CLIENT_ROUTE, lambda r: r.fulfill(status=200, content_type="text/javascript", body=STUB))
    page.goto(f"{server}/index.html?netice=none&dev=1")
    page.wait_for_function(READY, timeout=240000)
    return page, errors


DRAWN = "(id) => window.__mm.netDrawn().some(c => c.id === id && c.car && c.tag)"


def jump(page, target, level):
    page.evaluate("(id) => window.ggTesthub.regs[id].fn()", target)
    page.wait_for_function("(l) => window.__mm.level().id === l", arg=level, timeout=T)


@needs_world
def test_remote_car_stays_drawn_while_the_own_player_is_below(server):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS + NO_THROTTLE)
        host, host_errors = open_real(browser, server)
        guest, guest_errors = open_page(browser, server)
        host.evaluate("() => window.__mm.stepped(true)")   # SwiftShader draws the real world well under 1 fps
        connect(host, guest); ready_both(host, guest); host.click("#mpgo")
        host.evaluate("() => window.__mm.stepped(false)")
        host.wait_for_function("() => window.__mm.net().session", timeout=T)
        host.wait_for_function(DRAWN, arg=1, timeout=T)   # guest's car drawn on the surface
        jump(host, "hideout.ring1", "ring")
        host.wait_for_function(DRAWN, arg=1, timeout=T)   # before #1109: parent surfaceRoot, never drawn
        jump(host, "hideout.gate", "surface")
        host.wait_for_function(DRAWN, arg=1, timeout=T)
        browser.close()
    assert host_errors + guest_errors == []