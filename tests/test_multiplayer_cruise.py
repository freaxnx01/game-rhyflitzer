"""#835 part b: two players drive together and see each other's car move.

Builds on the lobby test's handshake (connect / open_page / net are imported, not copied): both pages pick a car,
both say ready, the host presses "Drive together" -- and from there each page must show the other player's car,
built, visible, moved, and near where that car really is.

The two pages share one browser, so the background one is never the foreground tab: the throttling flags keep its
timers and its rAF loop running, and the driving itself goes through __mm.driveSim, which steps the simulation
without needing a focused window.
Slow (Playwright, two heavy pages): run in the foreground."""
import math

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


def test_both_players_have_engine_sound(pair):
    """#1114: a multiplayer session starts the engine voice on both pages, with no single-player run first.

    The menu music (armed by the lobby clicks) already creates the AudioContext, so the context alone does not
    discriminate; the engine mix does -- SFX.update returns while the engine voice is null, and only SFX.start
    (what the single-player buttons call) builds it."""
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.net().session && window.__mm.audio().ctx !== 'none'", timeout=T)
        page.wait_for_function("() => window.__mm.audio().mix !== null", polling=250, timeout=T)


def test_remote_car_shows_nitro_flames_while_the_sender_holds_nitro(pair):
    """#1116: the other player's nitro flames follow the pose's nitro flag."""
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    host.bring_to_front()   # the host takes real keys below: front it before the start, while hiding still cannot pause (openPause is a no-op outside a run)
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.net().session && document.querySelector('#mplobby').hidden", timeout=T)
    guest.wait_for_function("() => window.__mm.net().offset !== null", timeout=T)
    guest.wait_for_function(
        "() => window.__mm.netCars().some(c => c.id === 0 && c.built && c.visible)", timeout=T)
    assert net_car(guest, 0)["flames"]["n"] > 0            # the clone keeps the flames
    assert net_car(guest, 0)["flames"]["visible"] is False  # idle: hidden
    # nitro held as real keys across frames: the 50 ms pose interval must overlap the running sim -- one blocking
    # driveSim cannot (its single nitro pose leaves the interpolation window within ~100 ms)
    host.keyboard.down("ArrowUp")
    host.keyboard.down("KeyN")
    host.wait_for_function("() => window.__mm.drive().nitro === 1", timeout=T)
    guest.wait_for_function(
        "() => window.__mm.netCars().find(c => c.id === 0).flames.visible", polling=250, timeout=T)
    host.keyboard.up("KeyN")
    host.keyboard.up("ArrowUp")
    guest.wait_for_function(
        "() => !window.__mm.netCars().find(c => c.id === 0).flames.visible", polling=250, timeout=T)
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


def test_lobby_status_follows_language_switch(pair):
    """#917: the lobby status line (the start hint) re-renders on an EN/DE switch while waiting in the lobby."""
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    en = guest.locator("#mplobbystatus").inner_text()
    guest.evaluate("() => window.ggSetLang(window.GG_LANG === 'en' ? 'de' : 'en')")
    guest.wait_for_function("(old) => document.querySelector('#mplobbystatus').textContent !== old", arg=en, timeout=T)
    assert guest.locator("#mplobbystatus").inner_text() != en
    assert errors == []


def test_remote_car_has_tag_and_fades_when_guest_leaves(pair):
    """Part c: a remote car carries a name tag, and a leaving player fades out over 1 s with a toast on the host."""
    host, guest, errors = pair
    connect(host, guest)
    # part c (#921 review): the start hint is in the status line, not the button title (shown until everyone is ready)
    assert "Starts when everyone is ready" in guest.locator("#mplobbystatus").inner_text()
    ready_both(host, guest)
    host.click("#mpgo")
    host.wait_for_function("() => window.__mm.netCars().some(c => c.id === 1 && c.visible)", timeout=T)
    car = host.evaluate("() => window.__mm.netCars().find(c => c.id === 1)")
    assert car["tag"] == {"visible": True, "name": "Ben"}

    guest.keyboard.press("Escape")                     # pause
    guest.click("#pausemenu")
    if guest.is_visible("#abandonok"):
        guest.click("#abandonok")
    host.wait_for_function("() => document.querySelector('#toast').textContent === 'Ben has left.'", timeout=T)
    host.wait_for_function("() => !window.__mm.netCars().some(c => c.id === 1)", timeout=T)
    assert net(guest)["role"] is None
    assert errors == []


# the connect / start lines of test_two_players_see_each_other_drive, shared by the #1108 wheel tests below
def start_session(host, guest):
    """Connect, ready up and start the shared drive, until the guest sees the host's car."""
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.net().session && document.querySelector('#mplobby').hidden", timeout=T)
    guest.wait_for_function("() => window.__mm.net().offset !== null", timeout=T)   # the clock is synced to the host
    guest.wait_for_function(
        "() => window.__mm.netCars().some(c => c.id === 0 && c.built && c.visible)", timeout=T)


def wheels_ready(page):
    page.wait_for_function(
        "() => { const c = window.__mm.netCars().find(c => c.id === 0); return c && c.wheels && c.wheels.n >= 4; }",
        timeout=T)


def test_remote_car_turns_and_rolls_its_wheels(pair):
    """#1108: the other player's front wheels turn with its steering and all wheels roll while it drives."""
    host, guest, errors = pair
    start_session(host, guest)
    wheels_ready(guest)
    assert net_car(guest, 0)["wheels"]["spin"] == 0    # a standing remote car keeps its wheels still
    spin_before = net_car(guest, 0)["wheels"]["spin"]

    host.evaluate("() => window.__mm.driveSim(2, ['KeyW', 'KeyD'])")

    # The sender's steering eases back to 0 once the keys come up (and driveSim blocks the host's
    # event loop, so poses only flow between calls), so read the yaw while it drives again: run
    # the drive in a second step and poll -- the headless guest draws about one frame a second,
    # so give it as many frames as it needs, never a fixed stretch of wall clock.
    yaw_seen, rolled = False, False
    for _ in range(20):
        w = net_car(guest, 0)["wheels"]
        yaw_seen = yaw_seen or any(abs(y) > 0.05 for y in w["yaw"])
        guest.wait_for_timeout(200)
        rolled = rolled or net_car(guest, 0)["wheels"]["spin"] != spin_before
        if yaw_seen and rolled:
            break
        host.evaluate("() => window.__mm.driveSim(0.5, ['KeyW', 'KeyD'])")
    assert yaw_seen, net_car(guest, 0)["wheels"]
    assert rolled, net_car(guest, 0)["wheels"]
    assert errors == []


def test_remote_car_reversing_rolls_backwards(pair):
    """#1108: while the other player reverses, its wheels roll backwards on this screen."""
    host, guest, errors = pair
    start_session(host, guest)
    wheels_ready(guest)
    th = host.evaluate("() => window.__mm.heading()")       # the sender's heading, constant (no steer held)
    pos0 = net_car(guest, 0)["pos"]

    # Brake in short taps: a tap keeps the reverse speed under ~1 m/s, so one frame of the
    # headless guest (about one a second, dt clamped to 0.1 s) turns the wheels well under
    # half a turn and the signed wrapped delta of two reads stays unambiguous. A full-speed
    # reverse (driveSim(2, ['KeyS'])) turns ~4 rad a frame: that wraps around 2*pi and reads
    # as a false forward roll -- so the wheels are sampled at a speed they can be read at,
    # the assertion itself is never skipped.
    for _ in range(20):
        host.evaluate("() => window.__mm.driveSim(0.1, ['KeyS'])")   # a tap: the car creeps backwards
        a = net_car(guest, 0)["wheels"]["spin"]
        guest.wait_for_timeout(200)
        b = net_car(guest, 0)["wheels"]["spin"]
        delta = (b - a + math.pi) % (2 * math.pi) - math.pi
        if abs(delta) > 0.01:
            assert delta < 0, (a, b, delta)
            break
    else:
        pytest.fail("the guest's remote wheels never turned between two reads")
    pos1 = net_car(guest, 0)["pos"]
    along = (pos1[0] - pos0[0]) * math.cos(th) + (pos1[2] - pos0[2]) * math.sin(th)
    assert along < 0, (th, pos0, pos1)     # the car really moved opposite its heading: it reversed
    assert errors == []
