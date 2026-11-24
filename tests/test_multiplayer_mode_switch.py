"""#1110: the host switches cruise -> race through the lobby; nobody reconnects.
Slow (Playwright, two heavy pages): run in the foreground."""
from test_multiplayer_cruise import pair_fixture, ready_both  # noqa: F401  (fixture)
from test_multiplayer_lobby import T, connect

IN_SESSION = "() => window.__mm.net().session && document.querySelector('#mplobby').hidden"
IN_LOBBY = "() => !window.__mm.net().session && !document.querySelector('#mplobby').hidden"


def start_cruise(host, guest):
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(IN_SESSION, timeout=T)


def test_host_switches_cruise_to_race_without_reconnecting(pair):
    host, guest, errors = pair
    start_cruise(host, guest)
    peers = host.evaluate("() => window.__mm.net().peers")

    guest.click("#pausebtn")
    assert guest.is_hidden("#pauselobby")        # only the host switches
    guest.click("#pauseresume")

    host.click("#pausebtn")
    assert host.is_visible("#pauselobby")
    host.click("#pauselobby")
    for page in (host, guest):
        page.wait_for_function(IN_LOBBY, timeout=T)
    assert host.is_hidden("#pause")
    assert host.evaluate("() => window.__mm.net().peers") == peers
    assert host.is_visible("#mprace") and host.is_visible("#mpgo")

    for page in (host, guest):
        page.click("#mpready")
    host.wait_for_function("() => !document.querySelector('#mprace').disabled", timeout=T)
    host.click("#mprace")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race && window.__mm.net().race.go", timeout=T)
    assert errors == []


def test_guest_with_open_pause_menu_follows_into_the_lobby(pair):
    host, guest, errors = pair
    start_cruise(host, guest)
    guest.click("#pausebtn")
    guest.click("#pausesettings")
    host.click("#pausebtn")
    host.click("#pauselobby")
    guest.wait_for_function(IN_LOBBY, timeout=T)
    assert guest.is_hidden("#pause") and guest.is_hidden("#settings")
    assert guest.evaluate("() => window.__mm.pause().on") is False
    assert errors == []
