"""#1190: a pontoon bridge one player lays shows for everyone and carries cars; U toggles it for every player, and a
fresh drive starts with the host's bridge. OSM world, terrain blocked, like test_pontoon.py -- the Rhine bank needs it.
Slow (Playwright, two heavy pages): run in the foreground."""
import math
from pathlib import Path

import pytest

from test_multiplayer_cruise import pair_world_fixture, ready_both  # noqa: F401  (registers the `pair_world` fixture)
from test_multiplayer_lobby import T, connect, net

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
BANK = (1404.4, -425.5)            # Innermattstrasse, 20 m from the water, facing north (-z) -- tests/test_pontoon.py
NORTH = -math.pi / 2


def pontoon(page):
    return page.evaluate("() => window.__mm.pontoon()")


def pontoon_sim(page, secs):
    return page.evaluate("(s) => window.__mm.pontoonSim(s)", secs)


def press_u(page):
    page.evaluate("() => window.__mm.pressPontoon()")


def place(page, xz, th):
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [xz[0], xz[1], th])


def wait_on(page, on=True):
    page.wait_for_function("(want) => window.__mm.pontoon().on === want", arg=on, polling=250, timeout=T)


def wait_dir(page, dir_):
    page.wait_for_function(f"() => window.__mm.pontoon().on && window.__mm.pontoon().dir === {dir_}", polling=250, timeout=T)


def start_session(host, guest):
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().session && document.querySelector('#mplobby').hidden", timeout=T)


def leave_session(page):
    page.click("#pausebtn")
    page.click("#pausemenu")
    if page.is_visible("#abandon"):
        page.click("#abandonok")
    page.wait_for_function("() => !window.__mm.net().session && window.__mm.net().role === null", timeout=T)


def same_ends(h, g):
    """both pages see the same deck -- the wire rounds to 2 decimals, the host's own is full precision"""
    for end in ("a", "b"):
        for k in ("x", "z"):
            if abs(h[end][k] - g[end][k]) > 0.011:
                return False
    return True


@needs_world
def test_a_bridge_one_player_lays_shows_and_toggles_for_everyone(pair_world):
    """The guest's U lays a bridge for both, the host's U takes it down for both, a deck under the
    guest's car comes down with it (A11, no occupancy check), and a fresh drive starts with the
    host's bridge (A2) even on a guest whose own world has none."""
    host, guest, errors = pair_world
    connect(host, guest)
    ready_both(host, guest)
    start_session(host, guest)

    # (1) the guest lays: the host is the authority, both end with the same built bridge
    place(guest, BANK, NORTH)
    press_u(guest)
    for page in (host, guest):
        wait_on(page)
    for page in (host, guest):
        pontoon_sim(page, 3.1)      # each device runs its own build animation (A4)
    h, g = pontoon(host), pontoon(guest)
    assert h["built"] > 0.999 and g["built"] > 0.999, (h, g)
    assert h["dir"] == 1 and g["dir"] == 1, (h, g)
    assert same_ends(h, g), (h, g)

    # (2) the host takes it down: no bridge left on either side
    place(host, BANK, NORTH)
    press_u(host)
    for page in (host, guest):
        wait_dir(page, -1)
    for page in (host, guest):
        pontoon_sim(page, 3.2)
        assert pontoon(page)["on"] is False

    # (3) the host lays again, the guest's car sits on the deck when the host takes it down (A11):
    # the deck shrinks from under the car, it splashes into the Rhine and sinks on the host's screen too
    press_u(host)
    wait_on(guest)
    for page in (host, guest):
        pontoon_sim(page, 3.1)
    st = pontoon(guest)
    mid = ((st["a"]["x"] + st["b"]["x"]) / 2, (st["a"]["z"] + st["b"]["z"]) / 2)
    th = math.atan2(st["b"]["z"] - st["a"]["z"], st["b"]["x"] - st["a"]["x"])
    guest.evaluate("([x, z, th]) => window.__mm.sim(x, z, th, 0, 0)", [mid[0], mid[1], th])
    assert guest.evaluate("() => window.__mm.car()")["bridge"] is True   # standing on the deck, over the river
    press_u(host)
    wait_dir(guest, -1)
    pontoon_sim(guest, 2)             # the build front shrinks past the car's bay
    guest.wait_for_function("() => window.__mm.car().bridge === false", polling=250, timeout=T)
    guest.wait_for_function("() => window.__mm.car().splash > 0", polling=250, timeout=T)   # fell into the Rhine
    host.wait_for_function("() => { const c = window.__mm.netCars().find(c => c.id === 1); return !!c && !!c.pos && c.pos[1] < 0.2; }", polling=250, timeout=T)
    for page in (host, guest):
        pontoon_sim(page, 3.2)
        assert pontoon(page)["on"] is False

    # (4) a fresh drive starts with the host's bridge: leaving keeps each side's bridge (A10), the guest
    # removes its own copy in a solo run (single-player U, as before), so only the start sync (A2) can bring it back
    press_u(host)
    wait_on(guest)
    for page in (host, guest):
        pontoon_sim(page, 3.1)
    leave_session(guest)
    leave_session(host)
    guest.click("#startbtn")          # a solo cruise: the leftover bridge is the guest's own now
    place(guest, BANK, NORTH)
    press_u(guest)                    # single-player U still takes it down (dir -1, no host round trip)
    wait_dir(guest, -1)
    pontoon_sim(guest, 3.2)
    assert pontoon(guest)["on"] is False
    leave_session(guest)              # back to the main menu, its world bridge-free
    connect(host, guest)
    ready_both(host, guest)
    assert pontoon(guest)["on"] is False   # still none before the start
    start_session(host, guest)
    wait_on(guest)                    # the host's bridge arrives with the start, before any U of the guest's own
    assert same_ends(pontoon(host), pontoon(guest))

    assert net(host)["bad"] == 0 and net(guest)["bad"] == 0
    assert errors == []
