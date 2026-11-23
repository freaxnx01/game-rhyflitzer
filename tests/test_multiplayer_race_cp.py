"""#837 part c: a guest's checkpoint pass goes to the host, who checks it against that guest's
recent poses and broadcasts a board; every device shows its position and gap. A pass the host
refuses (a far-away claim) gets `cpno` and the checkpoint opens again on that device.

Reuses the lobby handshake and the cruise pair fixture: the only new surfaces are the board,
the #netpos line and the cpno reopen (#1119 adds the #netopp opponent list).

Slow (Playwright, two heavy pages): run in the foreground."""
from test_multiplayer_cruise import pair_fixture, ready_both  # noqa: F401  (fixture)
from test_multiplayer_lobby import T, connect

SEEN_NEAR = """([id, x, z]) => { const c = window.__mm.netCars().find(c => c.id === id);
  return !!c && !!c.pos && Math.hypot(c.pos[0] - x, c.pos[2] - z) < 20; }"""


def start_race(host, guest):
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mprace")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race && window.__mm.net().race.go", timeout=T)


def guest_pass(host, guest, i):
    """12 m short first, so the host has a near pose, then onto the checkpoint."""
    x, z = guest.evaluate("() => window.__mm.netRace().cps")[i]
    guest.evaluate("([x, z]) => window.__mm.place(x - 12, z, 0)", [x, z])
    host.wait_for_function(SEEN_NEAR, arg=[1, x, z], timeout=T)
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])


def test_guest_pass_counts_on_host_and_far_claim_is_refused(pair):
    host, guest, errors = pair
    start_race(host, guest)
    guest.wait_for_function("() => window.__mm.netRace().pos.length > 0", timeout=T)
    guest_pass(host, guest, 0)
    guest.wait_for_function("() => window.__mm.netRace().done[0]", timeout=T)
    for page in (host, guest):
        page.wait_for_function(
            "() => (window.__mm.netRace().board || []).some(r => r.id === 1 && r.times.length === 1)", timeout=T)
    # 1st of 2 on the guest, who has one pass and the host none
    assert guest.evaluate("() => window.__mm.netRace().pos").startswith(("P 1/2", "Platz 1/2"))
    # #1119: each page's opponent list shows the other car's passes / checkpoint count
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.netRace().opp.includes('/' + window.__mm.netRace().cps.length)", timeout=T)
    guest.evaluate("() => window.__mm.netSend(0, { type: 'cp', i: 1, t: 1000 })")   # far from checkpoint 1
    guest.wait_for_function("() => window.__mm.netRace().cpno === 1", timeout=T)
    assert host.evaluate("() => window.__mm.netRace().board.find(r => r.id === 1).times.length") == 1
    assert errors == []


def test_a_refused_far_claim_reopens_a_locally_done_checkpoint(pair):
    """#1022: the guest's own cpObjs[0].done is true when the host's far refusal arrives (the near-check window
    raced — the host has no near pose), so netReopenCp reverts the pillar/ring/R.done, not just the cpno counter."""
    host, guest, errors = pair
    start_race(host, guest)
    guest.wait_for_function("() => window.__mm.netRace().pos.length > 0", timeout=T)
    host.wait_for_function("() => window.__mm.netCars().some(c => c.id === 1 && c.pos)", timeout=T)   # the host has the guest's pose track
    # the guest is still on the start grid (hundreds of m from cp 0): a local pass the host has not seen near,
    # exactly the race-the-near-window case — cpObjs[0].done is true before the refusal arrives
    guest.evaluate("() => window.__mm.netMarkCpDone(0)")
    assert guest.evaluate("() => window.__mm.netRace().done[0]") is True
    guest.evaluate("() => window.__mm.netSend(0, { type: 'cp', i: 0, t: 1000 })")   # far from checkpoint 0
    guest.wait_for_function("() => window.__mm.netRace().done[0] === false", timeout=T)   # the revert ran, not the guard's short-circuit
    assert guest.evaluate("() => window.__mm.netRace().cpno") >= 1
    # the host never accepted the pass, so the board has no time for the guest
    assert host.evaluate("() => window.__mm.netRace().board.find(r => r.id === 1).times.length") == 0
    assert errors == []