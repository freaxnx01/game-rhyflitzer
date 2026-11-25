"""#837 part b: the host starts a race, both cars line up on a two-abreast grid, are held through 3-2-1-Los!, then
released together at T0 -- and the trial checkpoints are live. Reuses the lobby handshake and the cruise pair
fixture: the only new surface is the #mprace button and the race clock.

Slow (Playwright, two heavy pages): run in the foreground."""
from test_multiplayer_cruise import pair_fixture, ready_both  # noqa: F401  (fixture)
from test_multiplayer_lobby import T, connect


HELD = """() => { const a = window.__mm.carPose().pos, before = window.__mm.net().race.held;
  window.__mm.driveSim(0.5, ['ArrowUp']);
  const b = window.__mm.carPose().pos;
  return { before, after: window.__mm.net().race.held, d: Math.hypot(b[0] - a[0], b[2] - a[2]) }; }"""


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def test_race_start_holds_then_releases_both(pair):
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    assert guest.is_hidden("#mprace")
    host.click("#mprace")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race && document.querySelector('#mplobby').hidden", timeout=T)
    gap = dist(host.evaluate("() => window.__mm.carPose().pos"), guest.evaluate("() => window.__mm.carPose().pos"))
    assert 3 < gap < 5, gap                                   # side by side, 4 m apart
    for page in (host, guest):
        r = page.evaluate(HELD)
        assert r["before"] and r["after"] and r["d"] < 0.5, r
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race.go", timeout=T)
        a = page.evaluate("() => window.__mm.carPose().pos")
        page.evaluate("() => window.__mm.driveSim(2, ['ArrowUp'])")
        assert dist(page.evaluate("() => window.__mm.carPose().pos"), a) > 5
    for page in (host, guest):
        page.click("#pausebtn")
        assert page.is_hidden("#pauserestart")
        page.click("#pauseresume")
    assert errors == []
