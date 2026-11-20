"""#837 part d: the host checks every finish, a racer who drops or who is still running 60 s after
the winner is DNF, and once nobody runs every device shows the same ranked result in the lobby
dialog. From there the host starts a rematch or goes back to the lobby.

Reuses the lobby handshake, the cruise pair fixture and part c's race helpers: the new surfaces are
the #mpresult list, #mprematch and #mpback.

Slow (Playwright, two heavy pages): run in the foreground."""
from test_multiplayer_cruise import pair_fixture  # noqa: F401  (fixture)
from test_multiplayer_lobby import T
from test_multiplayer_race_cp import guest_pass, start_race


def host_drive_all(host):
    """The host is teleported through every checkpoint and onto the finish; its own passes are trusted."""
    r = host.evaluate("() => window.__mm.netRace()")
    for k, (x, z) in enumerate(r["cps"] + [r["finish"]]):
        host.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])
        if k < len(r["cps"]):
            host.wait_for_function("(k) => window.__mm.netRace().done[k]", arg=k, timeout=T)


def test_scripted_race_same_result_then_rematch(pair):
    host, guest, errors = pair
    start_race(host, guest)
    host_drive_all(host)
    n = len(guest.evaluate("() => window.__mm.netRace().cps"))
    for i in range(n):
        guest_pass(host, guest, i)
        guest.wait_for_function("(i) => window.__mm.netRace().done[i]", arg=i, timeout=T)
    x, z = guest.evaluate("() => window.__mm.netRace().finish")
    guest.evaluate("([x, z]) => window.__mm.place(x - 12, z, 0)", [x, z])
    host.wait_for_function(
        "([x, z]) => window.__mm.netCars().some(c => c.id === 1 && c.pos"
        " && Math.hypot(c.pos[0] - x, c.pos[2] - z) < 20)", arg=[x, z], timeout=T)
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.netRace().result", timeout=T)
    assert host.evaluate("() => window.__mm.netRace().result") == guest.evaluate("() => window.__mm.netRace().result")
    assert host.evaluate("() => window.__mm.netRace().result")[0].startswith("1.")

    host.click("#mprematch")
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.net().race && !window.__mm.net().race.go"
            " && window.__mm.netRace().result === null", timeout=T)
    assert errors == []


def test_guest_drop_is_dnf_and_back_to_lobby(pair):
    host, guest, errors = pair
    start_race(host, guest)
    guest.click("#pausebtn")
    guest.click("#pausemenu")
    if guest.is_visible("#abandon"):
        guest.click("#abandonok")
    host_drive_all(host)
    host.wait_for_function("() => window.__mm.netRace().result", timeout=T)
    assert host.evaluate("() => window.__mm.netRace().board.find(r => r.id === 1).st") == "dnf"

    host.click("#mpback")
    host.wait_for_function(
        "() => !window.__mm.net().session && !document.querySelector('#mplobby').hidden", timeout=T)
    assert errors == []
