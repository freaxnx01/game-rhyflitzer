"""#836 part a: a forced overlap pushes both cars apart on both devices. Stepped mode: a page simulates only when
ticked; poses keep flowing on their timer. Slow: run in the foreground."""
from test_multiplayer_cruise import pair_fixture, ready_both  # noqa: F401  (registers the `pair` fixture)
from test_multiplayer_lobby import T, connect, net

POS = "() => window.__mm.carPose().pos"


def test_forced_overlap_pushes_both_cars_apart(pair):
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page, other in ((host, 1), (guest, 0)):
        page.wait_for_function("(id) => window.__mm.netCars().some(c => c.id === id && c.visible)", arg=other, timeout=T)
    for page in (host, guest):
        page.evaluate("() => window.__mm.stepped(true)")
    hx, hy, hz = host.evaluate(POS)
    th = -host.evaluate("() => window.__mm.carPose().rot[1]")
    # the tick writes car.position (what the pose stream reads)
    guest.evaluate("([x, z, th]) => { window.__mm.place(x, z, th); window.__mm.tick(1 / 60); }", [hx + 1.0, hz, th])
    before = {"h": [hx, hy, hz], "g": [hx + 1.0, hy, hz]}
    for page, other in ((host, 1), (guest, 0)):
        page.wait_for_function("(id) => window.__mm.netContacts().some(c => c.id === id)", arg=other, polling=100, timeout=T)
    for _ in range(10):                  # interleaved
        for page in (host, guest):
            page.evaluate("() => window.__mm.tick(1 / 60)")
    after = {"h": host.evaluate(POS), "g": guest.evaluate(POS)}
    for me, them in (("h", "g"), ("g", "h")):
        moved = (after[me][0] - before[me][0], after[me][2] - before[me][2])
        away = (before[me][0] - before[them][0], before[me][2] - before[them][2])
        assert (moved[0] ** 2 + moved[1] ** 2) ** 0.5 > 0.2, (me, moved)
        assert moved[0] * away[0] + moved[1] * away[1] > 0, (me, moved, away)
    for page in (host, guest):
        page.evaluate("() => window.__mm.stepped(false)")
    assert net(host)["bad"] == 0 and net(guest)["bad"] == 0
    assert errors == []
