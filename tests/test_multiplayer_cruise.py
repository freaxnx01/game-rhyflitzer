"""#835 part b: two players drive together and see each other's car move.

Builds on the lobby test's handshake (connect / open_page / net are imported, not copied): both pages pick a car,
both say ready, the host presses "Drive together" -- and from there each page must show the other player's car,
built, visible, moved, and near where that car really is.

The two pages share one browser, so the background one is never the foreground tab: the throttling flags keep its
timers and its rAF loop running, and the driving itself goes through __mm.driveSim, which steps the simulation
without needing a focused window.
Slow (Playwright, two heavy pages): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

from test_multiplayer_lobby import ARGS, T, connect, net, open_page

# two pages in one browser: without these the background page's setInterval drops to 1 Hz and its rAF stops
NO_THROTTLE = [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
]


@pytest.fixture(name="pair")
def pair_fixture(server):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS + NO_THROTTLE)
        host, host_errors = open_page(browser, server)
        guest, guest_errors = open_page(browser, server)
        yield host, guest, host_errors + guest_errors
        browser.close()


def ready_both(host, guest):
    """Both players take a car and say ready, until the host's start button comes alive."""
    for page in (host, guest):
        page.click("#mppick")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=T)
        page.click("#csrace")
        page.wait_for_function("() => !document.querySelector('#mpready').disabled", timeout=T)
        page.click("#mpready")
    host.wait_for_function("() => !document.querySelector('#mpgo').disabled", timeout=T)


# that player's car is drawn more than 5 m from where it spawned
MOVED = """([id, from]) => {
  const c = window.__mm.netCars().find(c => c.id === id);
  return !!c && !!c.pos && Math.hypot(c.pos[0] - from[0], c.pos[2] - from[2]) > 5;
}"""


def net_car(page, player_id):
    return page.evaluate("(id) => window.__mm.netCars().find(c => c.id === id)", player_id)


def test_two_players_see_each_other_drive(pair):
    """Drive together spawns both in cruise mode, and each page shows the other's car following its real pose."""
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    assert guest.is_hidden("#mpgo")      # only the host starts the session

    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.net().session && document.querySelector('#mplobby').hidden", timeout=T)
    guest.wait_for_function("() => window.__mm.net().offset !== null", timeout=T)   # the clock is synced to the host

    for page, other in ((host, 1), (guest, 0)):
        page.wait_for_function(
            "(id) => window.__mm.netCars().some(c => c.id === id && c.built && c.visible)", arg=other, timeout=T)
    start = {0: net_car(guest, 0)["pos"], 1: net_car(host, 1)["pos"]}

    for page in (host, guest):
        page.evaluate("() => window.__mm.driveSim(2.5, ['ArrowUp'])")

    # a remote car is placed in the seeing page's own frame, and two heavy pages on a software GL draw about one frame
    # a second: wait for the car to have arrived, never for a fixed stretch of wall clock
    for page, other in ((host, 1), (guest, 0)):
        page.wait_for_function(MOVED, arg=[other, start[other]], polling=250, timeout=T)

    for other, them, seer in ((1, guest, host), (0, host, guest)):
        seen = net_car(seer, other)["pos"]
        real = them.evaluate("() => window.__mm.carPose().pos")
        gap = sum((a - b) ** 2 for a, b in zip(seen, real)) ** 0.5
        assert gap < 15, (other, gap, seen, real)

    assert net(host)["bad"] == 0 and net(guest)["bad"] == 0
    assert errors == []


def test_a_player_who_leaves_disappears_on_the_other_device(pair):
    """The guest goes back to the main menu: the session ends there and its car is gone on the host."""
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().session", timeout=T)
    host.wait_for_function("() => window.__mm.netCars().some(c => c.id === 1)", timeout=T)

    guest.click("#pausebtn")             # Pause -> Main menu: that leaves the shared session too
    guest.click("#pausemenu")
    if guest.is_visible("#abandon"):
        guest.click("#abandonok")
    guest.wait_for_function("() => !window.__mm.net().session && window.__mm.net().role === null", timeout=T)
    assert guest.evaluate("() => window.__mm.netCars().length") == 0
    host.wait_for_function("() => window.__mm.netCars().length === 0", timeout=T)
    assert errors == []
