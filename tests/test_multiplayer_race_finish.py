"""#1120: after the own finish in a multiplayer race the checkpoints, the finish gate and the arrow go away
(the single-player finish hides them behind its result overlay); a finish the host refuses brings them back.
Slow (Playwright, two heavy pages): run in the foreground."""
from test_multiplayer_cruise import pair_fixture  # noqa: F401  (fixture)
from test_multiplayer_lobby import T
from test_multiplayer_race_cp import start_race

NET_RACE = "() => window.__mm.netRace()"


def test_own_finish_hides_checkpoints_arrow_and_gate(pair):
    host, guest, errors = pair
    start_race(host, guest)
    host.wait_for_function("() => window.__mm.netRace().state === 'racing' || window.__mm.netRace().state === 'armed'", timeout=T)
    cps = host.evaluate(NET_RACE)["cps"]
    for i, (x, z) in enumerate(cps):   # the host's own passes are trusted: drive each checkpoint through the real stepRace
        host.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])
        host.wait_for_function("(i) => window.__mm.netRace().done[i]", arg=i, timeout=T)
    before = host.evaluate(NET_RACE)
    assert before["arrowShown"] and before["finishVisible"] and all(before["cpVisible"])
    fx, fz = before["finish"]
    host.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [fx, fz])
    host.wait_for_function("() => window.__mm.netRace().state === 'finished'", timeout=T)
    after = host.evaluate(NET_RACE)
    assert after["cpVisible"] == [False] * len(cps)
    assert after["finishVisible"] is False
    assert after["arrowShown"] is False
    assert errors == []


def test_a_refused_finish_brings_markers_and_arrow_back(pair):
    """The guest is nowhere near the finish and has no host-booked passes: the host answers cpno -1 (netReopenCp(-1))."""
    host, guest, errors = pair
    start_race(host, guest)
    cps = guest.evaluate(NET_RACE)["cps"]
    for i in range(len(cps)):
        guest.evaluate("(i) => window.__mm.netMarkCpDone(i)", i)
    fx, fz = guest.evaluate(NET_RACE)["finish"]
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [fx, fz])
    guest.wait_for_function("() => window.__mm.netRace().cpno === -1 || window.__mm.netRace().state === 'racing'", timeout=T)
    guest.wait_for_function("() => window.__mm.netRace().state === 'racing' && window.__mm.netRace().arrowShown", timeout=T)
    back = guest.evaluate(NET_RACE)
    assert back["finishVisible"] is True
    assert all(back["cpVisible"])
    assert errors == []
